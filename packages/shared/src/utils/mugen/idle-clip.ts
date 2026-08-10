/**
 * Idle clips, for the document
 *
 * A character's looping `idle` animation read straight off its frames manifest as
 * plain image URLs and pure geometry — no PixiJS, no canvas, nothing that needs a
 * WebGL context. This is what lets a character be stood up in the document itself
 * (an `<img>` per frame, swapped on a timer) wherever a whole canvas would be more
 * than the surface is worth: a small team strip beside the map, say.
 *
 * A clip is placed as one thing, never frame by frame: the cycle's frames differ in
 * size and in where their body axis sits, so anything derived per frame — a size, a
 * box, a border drawn around it — would jump about as the animation ran. The sheet is
 * the rectangle the whole cycle sweeps out, it is what the surface sizes, and the
 * frames animate inside it.
 */

import { characterFitScale } from '../card/character-fit';
import { loadManifest } from './character-assets';

/** One frame of an idle clip: where its image is, its native size, its body axis
 * (0..1 across the frame) and how long it shows for. */
export interface IdleClipFrame {
	url: string;
	width: number;
	height: number;
	anchorX: number;
	duration: number;
}

/** A box inside the surface, in CSS pixels: `left` from its left edge, `bottom` up
 * from its bottom edge, and the size it occupies. */
export interface PlacedBox {
	left: number;
	bottom: number;
	width: number;
	height: number;
}

/** One frame placed inside the sheet, with its feet on the sheet's bottom edge. */
export interface PlacedIdleFrame extends PlacedBox {
	url: string;
}

/** A whole clip placed inside a surface: the sheet the cycle sweeps out, and every
 * frame placed within it. All boxes are relative to the surface, not to each other. */
export interface IdleClipPlacement {
	sheet: PlacedBox;
	frames: PlacedIdleFrame[];
}

// The clip as this module hands it out, per folder. The manifest behind it is already
// fetched once for the whole page ({@link loadManifest}); this only keeps the reading of
// it, so every surface that stands the same character up gets the same array rather than
// an equal one — the map rebuilds its pins several times over a single selection, and a
// list that is new each time is a placement recomputed for nothing.
const clips = new Map<string, IdleClipFrame[]>();

/**
 * The frames of a character's looping idle clip, read off the manifest in its frames
 * folder — which is fetched once per page and shared with every other surface that wants
 * any part of it, the board included. Resolves to null (never throws) when the folder,
 * the manifest or the `idle` clip is missing, so a caller can fall back to a portrait
 * without special-casing.
 */
export function loadIdleClip(basePath: string | null): Promise<IdleClipFrame[] | null> {
	if (!basePath) return Promise.resolve(null);
	const cached = clips.get(basePath);
	if (cached) return Promise.resolve(cached);

	return loadManifest(basePath).then((manifest) => {
		const idle = manifest?.animations?.idle;
		if (!idle || idle.frames.length === 0) return null;
		const frames = idle.frames.map((frame) => ({
			url: `${basePath}/${frame.file}`,
			width: frame.width,
			height: frame.height,
			// The manifest gives the body axis in source pixels; every consumer wants
			// it as a fraction of the frame, which survives scaling.
			anchorX: frame.anchorX / frame.width,
			duration: frame.duration
		}));
		clips.set(basePath, frames);
		return frames;
	});
}

/** How a clip is to be placed. */
export interface IdleClipPlacing {
	/**
	 * Mirror the character (the normal look for the player's own cards; default true).
	 * The mirroring itself is the caller's to apply — CSS about each image's own centre
	 * is the same mirroring Pixi does about the axis, given these boxes — but it changes
	 * which side of the axis reaches furthest, so it is accounted for here.
	 */
	flipped?: boolean;
	/**
	 * Where the character's feet stand, as a height up from the surface's bottom edge
	 * (default 0, the bottom itself). A surface that draws a ground plane rather than a
	 * flat floor raises it to the point on that plane the character is standing at —
	 * and since the character stands on it, it is also the top of the room the fit has
	 * to work in.
	 */
	baseline?: number;
	/**
	 * The character's authored render scale (default 1) — how much bigger than its own
	 * pixels its sheet is drawn, from its definition JSON (see `loadRenderScale`). The
	 * cards and the board pass the same number, so a character that is drawn up here is
	 * drawn up by the same amount everywhere.
	 */
	renderScale?: number;
}

/**
 * Place a clip inside a surface: the sheet first, then the frames within it.
 *
 * The sheet is the rectangle the whole cycle sweeps out, standing on the baseline, and
 * how tall it comes out is {@link characterFitScale}'s to say — the same question the
 * cards and the board ask, so Chopper is the head shorter than Trunks here that he is
 * everywhere else instead of the two being stretched to the same height. A character
 * at the reference height fills the room above the baseline; a shorter one takes the
 * share of it that its own sprite is, and the width is capped besides, so nothing is
 * ever drawn past the surface and nothing is ever cut off.
 *
 * Because the sheet is the cycle's box and not any one frame's, it is the same
 * rectangle from the first frame to the last: anything drawn on it (a border, say)
 * sits still while the character moves.
 *
 * Frames are pinned inside it by their body axis, not by their image: the axis sits
 * off-centre and moves from frame to frame, so placing each frame on its own terms
 * would make the character shuffle sideways as it breathes. Instead the axis goes
 * wherever it must for the cycle's furthest reach either way to touch the sheet's
 * edges, and each frame follows from its own axis, feet on the sheet's bottom edge.
 */
export function placeIdleClip(
	frames: IdleClipFrame[],
	surface: { width: number; height: number },
	placing: IdleClipPlacing = {}
): IdleClipPlacement | null {
	const flipped = placing.flipped ?? true;
	const baseline = placing.baseline ?? 0;
	// The room the character has is what stands above the baseline it stands on.
	const room = { width: surface.width, height: surface.height - baseline };
	if (frames.length === 0 || room.width <= 0 || room.height <= 0) return null;

	// The cycle at its native size: how far it reaches either side of the axis, and
	// how tall its tallest frame stands.
	const reachLeft = (frame: IdleClipFrame) =>
		(flipped ? 1 - frame.anchorX : frame.anchorX) * frame.width;
	const extentLeft = Math.max(...frames.map(reachLeft));
	const extentRight = Math.max(
		...frames.map((frame) => (flipped ? frame.anchorX : 1 - frame.anchorX) * frame.width)
	);
	const sheetWidth = extentLeft + extentRight;
	const sheetHeight = Math.max(...frames.map((frame) => frame.height));

	// The whole of the sizing is the cards' (see characterFitScale) — and it is the sheet
	// measured just above that its width cap measures, so what is fitted here is the very
	// rectangle this surface then centres.
	const scale = characterFitScale(frames, room, placing.renderScale);
	const sheet: PlacedBox = {
		left: (surface.width - sheetWidth * scale) / 2,
		// Feet on the baseline, not floating above it: a row of these is a line-up, and
		// heights only compare from a shared floor.
		bottom: baseline,
		width: sheetWidth * scale,
		height: sheetHeight * scale
	};
	const axisX = sheet.left + extentLeft * scale;

	return {
		sheet,
		frames: frames.map((frame) => ({
			url: frame.url,
			left: axisX - reachLeft(frame) * scale,
			bottom: sheet.bottom,
			width: frame.width * scale,
			height: frame.height * scale
		}))
	};
}
