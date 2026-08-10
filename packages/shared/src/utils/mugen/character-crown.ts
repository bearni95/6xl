/**
 * A character's **crown**: the highest painted pixel of a sprite frame, and where across
 * the frame it sits.
 *
 * MUGEN gives every frame an axis, and the axis is what holds an animation together —
 * it is the same point on the fighter from frame to frame, so aligning frames through
 * it is what stops a cycle from juddering. What it is *not* is the middle of the
 * fighter. The axis sits between the feet, and a sprite sheet is drawn for a side-on
 * brawler: a fighter leans into its stance, throws its weight onto one leg, sweeps a
 * tail or a sword out to one side. Stood on its axis in the middle of a cell, such a
 * character reads as standing off to one side of it — because the part of it a viewer
 * takes for "the character" is the head, and the head is not over the axis.
 *
 * So the board stands a fighter by its crown instead. The head is the top of a standing
 * sprite, so the highest painted pixels are the head; the middle of them is the point a
 * viewer reads as the character's own centre, and putting *that* over the middle of the
 * cell is what makes a fighter look like it is standing in its cell.
 *
 * Only the offset between the two is taken from here. Frames still align to each other
 * through the axis, as they must — the crown is measured once, off the pose the
 * character stands in, and the whole fighter is moved by it.
 *
 * The rule is on for every character and off for the ones whose own file says so
 * ({@link readCrownAlign}): what is highest in a sheet is usually a head, and where it is
 * not, no reading of the pixels can tell.
 */

import {
	DEFAULT_CROWN_ALIGN,
	type CharacterDefinition
} from '../../types/character-definition.type';

/**
 * How opaque a pixel has to be to count as painted, out of 255.
 *
 * Not zero. Decoded MUGEN artwork carries a fringe of nearly-transparent pixels along
 * its edges — the palette's transparent index bled through resampling — and a fringe a
 * viewer cannot see is not the top of the character's head. A low threshold takes the
 * artwork and leaves the fringe.
 */
const PAINTED_ALPHA = 8;

/**
 * Whether to stand this character by its crown. Only an explicit `false` turns it off —
 * a definition that says nothing, one that predates the field, and one whose value is
 * some other thing entirely all get the rule, because it is the placement every
 * character is meant to have and an unreadable file is not a reason to single one out.
 */
export function readCrownAlign(definition: Partial<CharacterDefinition> | null): boolean {
	return definition?.crownAlign === false ? false : DEFAULT_CROWN_ALIGN;
}

/** The highest painted pixels of a frame: which row they are on, and where across it. */
export interface Crown {
	/** Row of the topmost painted pixel, in the frame's own pixels from its top edge. */
	top: number;
	/**
	 * The middle of the painted run on that row, in the frame's own pixels — measured
	 * along the pixel grid's edges, so a single painted pixel at index `i` gives
	 * `i + 0.5`, its own middle, rather than its left edge.
	 */
	x: number;
}

/**
 * The rule itself, over RGBA rows: scan down from the top edge and stop at the first row
 * with any paint on it, since nothing below it can be higher. The answer across that row
 * is the middle of its painted span rather than its first painted pixel — a head is as
 * wide as it is, and one edge of it is not its middle. Null for a frame with no paint.
 */
export function crownOfPixels(
	pixels: ArrayLike<number>,
	width: number,
	height: number
): Crown | null {
	for (let y = 0; y < height; y++) {
		let left = -1;
		let right = -1;
		for (let x = 0; x < width; x++) {
			if (pixels[(y * width + x) * 4 + 3] <= PAINTED_ALPHA) continue;
			if (left < 0) left = x;
			right = x;
		}
		if (left >= 0) return { top: y, x: (left + right + 1) / 2 };
	}
	return null;
}

/**
 * The one canvas every frame is read through, kept for the page.
 *
 * A canvas is an allocation — a backing store the size of the picture, and a 2D context
 * over it — and this reading is asked of *every frame of a cycle*, of every fighter a
 * board stands up. One canvas per frame was allocating and throwing away a hundred of
 * them in the moment the arena opens, which is precisely the moment there is nothing on
 * screen yet. The same one is resized and drawn over instead, and `willReadFrequently`
 * keeps it on the CPU side so the read back is a memory copy rather than a stall on the
 * GPU.
 */
let scratch: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;

function readingCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
	if (scratch) return scratch;
	if (typeof document === 'undefined') return null;
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;
	scratch = { canvas, context };
	return scratch;
}

/**
 * Read `source`'s highest painted pixels. Returns null when the frame is empty, when
 * there is no 2D canvas to read it through, or when the read is refused — every one of
 * which is a reason to leave the character on its axis rather than to fail placing it.
 *
 * The frame is drawn into the shared reading canvas at its own size and read back once.
 * Sprite frames are small and this is asked as the board opens, so the cost lands in the
 * load and never in the render loop.
 */
export function paintedCrown(
	source: CanvasImageSource,
	width: number,
	height: number
): Crown | null {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const reading = readingCanvas();
	if (!reading) return null;

	try {
		const { canvas, context } = reading;
		// Setting either dimension clears the surface, so a frame smaller than the last
		// one read cannot inherit its paint. Both are set every time for that reason.
		canvas.width = w;
		canvas.height = h;
		context.drawImage(source, 0, 0, w, h);
		return crownOfPixels(context.getImageData(0, 0, w, h).data, w, h);
	} catch {
		// A tainted canvas (an asset served cross-origin) throws on read. The board is
		// still perfectly drawable without the correction.
		return null;
	}
}

/** One frame as the correction needs to read it: something a canvas can draw, the
 * frame's own size, and its body axis (0..1 across the frame). */
export interface CrownFrame {
	source: CanvasImageSource;
	width: number;
	height: number;
	anchorX: number;
}

/**
 * How far to move a character sideways so its **crown** — the middle of the highest
 * painted pixels of the pose it stands in — sits over the middle of its cell, instead of
 * the MUGEN axis it is drawn around doing so. See {@link paintedCrown} for why the axis
 * is the wrong point to stand a fighter on.
 *
 * Read off the standing cycle, taking the frame whose paint reaches **highest**: that is
 * the character's tallest point, and it is the one the phrase names. Every frame is
 * bottom-aligned on its surface's foot line (a sprite anchored at 1), so how high a frame
 * reaches is its own height less the empty rows above its artwork — which is why the
 * frames' differing heights are no obstacle to comparing them.
 *
 * The answer is in screen px at `scale`, and already mirrored for a `flip`ped sprite: a
 * sprite drawn with a negative x-scale is reflected about its anchor, so the crown a
 * fighter's own artwork puts to its left appears to its right, and the correction that
 * brings it back has to turn round with it.
 *
 * Zero when nothing can be read — an empty cycle, artwork a canvas will not give up its
 * pixels for. A fighter stood on its axis is the placement the board had all along, so
 * failing to improve on it costs nothing.
 */
export function crownCorrection(frames: CrownFrame[], scale: number, flip: boolean): number {
	return crownDrift(crownOffset(frames), scale, flip);
}

/**
 * How far a cycle's crown sits from the axis it is drawn around, in the artwork's **own
 * pixels** — positive for a head to the right of the axis. The whole of what reading the
 * pixels answers, and the one part of {@link crownCorrection} that is a fact about the
 * character rather than about the surface drawing it.
 *
 * Split out because reading it is the expensive half — a canvas read per frame of the
 * cycle — while turning it into a screen offset is a multiply and a sign. A surface that
 * draws the same character more than once (the two halves of a mirror match) reads the
 * artwork once and asks {@link crownDrift} for each placement.
 *
 * Read off the frame whose paint reaches **highest**, and 0 when nothing can be read.
 */
export function crownOffset(frames: CrownFrame[]): number {
	let best: { frame: CrownFrame; crown: Crown; reach: number } | null = null;
	for (const frame of frames) {
		const crown = paintedCrown(frame.source, frame.width, frame.height);
		if (!crown) continue;
		const reach = frame.height - crown.top;
		if (!best || reach > best.reach) best = { frame, crown, reach };
	}
	if (!best) return 0;
	// Both in the frame's own pixels, off its left edge: where the crown is, and where the
	// axis the sprite is anchored at is. The gap between them is what has to be undone.
	return best.crown.x - best.frame.anchorX * best.frame.width;
}

/** A {@link crownOffset} as the screen px to move a sprite by: at the scale it is drawn,
 * and turned round for a mirrored one, since a negative x-scale reflects the artwork about
 * its anchor and takes the crown with it. */
export function crownDrift(offset: number, scale: number, flip: boolean): number {
	return (flip ? 1 : -1) * offset * scale;
}
