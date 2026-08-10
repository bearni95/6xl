/**
 * How big a character is drawn
 *
 * The one answer the surfaces that stand a MUGEN character up *among others* ask for
 * — the cards and the hex board — so a character is the same size relative to the
 * rest of the roster on either of them. Kept apart from {@link CardSprite} (which is
 * where it used to live) because the answer is pure arithmetic over frame sizes,
 * owing nothing to PixiJS or to a card.
 */

import {
	DEFAULT_RENDER_SCALE,
	DEFAULT_WIDTH_CAP,
	RENDER_SCALE_MAX,
	RENDER_SCALE_MIN,
	type CharacterDefinition
} from '../../types/character-definition.type';

/**
 * Native source-pixel height treated as a "full-height" character. Every surface
 * scales its idle by the same ratio (art-box height ÷ this value) so on-screen size
 * tracks a character's real sprite size relative to the roster — a short character
 * renders smaller than a tall one instead of each being stretched to fill its box.
 * Sized so a tall MUGEN character (Trunks ~136px) nearly fills the art box; anything
 * taller is capped to the box by {@link characterFitScale}.
 */
export const REFERENCE_SOURCE_HEIGHT = 150;

/** Multiplier applied to the fitted idle scale so the character (and its shadow)
 * reads a little bigger than the strict fit — a deliberate 30% zoom. */
export const IDLE_SCALE_BOOST = 1.3;

/**
 * On-screen height of a reference-height ({@link REFERENCE_SOURCE_HEIGHT}) character
 * as a multiple of a cell's width — the height of the box every character on a *cell*
 * is fitted into. Every other character scales by the same source→screen ratio, so
 * shorter/taller sprites read shorter/taller; anything taller than the reference is
 * brought back to this height rather than standing out of its cell.
 *
 * It lives with the fit rather than with the board because it is half of what "the
 * size a fighter is drawn at" means: the fit answers a *box*, and this is the box a
 * cell of a given width gives. A surface that lays characters out in cells of its own
 * (the admin's poster wall) has to ask for the same box or it is not showing the same
 * sizing.
 */
export const CHAR_HEIGHT_RATIO = 1.3;

/** One frame as the fit needs to read it: its native size and its body axis (0..1
 * across the frame), which is the pivot every frame of a cycle is placed by. */
export interface FitFrame {
	width: number;
	height: number;
	anchorX: number;
}

/**
 * The source→screen ratio a character's art is drawn at inside a box of the given
 * size. This is the whole of how a character's on-screen size is decided.
 *
 * The ratio is {@link REFERENCE_SOURCE_HEIGHT} → the box's height, shared by every
 * character: a short character (Krillin, ~81 source px) renders visibly smaller than
 * a tall one (Trunks, ~136), rather than each being stretched to fill its box, which
 * is what made stocky characters balloon. The shared ratio is then capped so nobody
 * spills out of the box:
 *
 *   · **height** — a character taller than the reference (Perfect Cell, ~185) is
 *     brought back to the box's height instead of standing out of it.
 *   · **width** — what has to fit across the box is the rectangle the whole cycle sweeps
 *     out, and not the reach to one side of the character's body axis doubled. A cycle
 *     is as wide as it is however that width sits about the axis, so a character whose
 *     art hangs far off it (Frieza's tail goes most of a body-width to one side) is
 *     drawn at its own size rather than shrunk until its longest limb fitted a half-box.
 *     Every surface here places the sweep in the box in its own way — the cards and the
 *     statues centre it, the board pins the axis on a cell's mark and lets the sweep sit
 *     where it falls — and none of that changes how wide the thing being placed is.
 *
 * A character may say two things about this for itself, both read from its own definition
 * JSON:
 *
 * `renderScale` (see `CharacterDefinition.renderScale`): the whole scheme assumes every
 * sheet is drawn at the same pixels-per-person, and MUGEN authors do not agree on one, so
 * a set drawn small says so and is drawn up by that much. It lowers the height the
 * character is *measured against* rather than raising the box, which is why the caps
 * still hold: a scaled-up character that would now stand taller than its box stops at the
 * box, exactly as an over-tall one always has.
 *
 * `widthCap: false` (see `CharacterDefinition.widthCap`) drops the width cap for the one
 * kind of sheet it reads wrong — a character drawn with its arms out, whose sweep is not
 * the room it needs but the pose it holds. Such a character is sized by its height alone,
 * as the roster's sizing means it to be, and is drawn wider than its box. It is deliberately
 * *not* something `renderScale` could have done: the caps are the smaller of what they and
 * the reference give, so a character the width cap holds is held there at any scale, and
 * the way past a cap is to say the cap is wrong.
 */
export function characterFitScale(
	frames: FitFrame[],
	box: { width: number; height: number },
	renderScale: number = DEFAULT_RENDER_SCALE,
	widthCap: boolean = DEFAULT_WIDTH_CAP
): number {
	const maxHeight = Math.max(...frames.map((frame) => frame.height));
	// How far the cycle reaches either side of its axis, at its native size. Neither
	// figure belongs to any one frame: the axis sits in a different place from frame to
	// frame, and what a cycle needs is the furthest any of them goes each way.
	const reachOne = Math.max(...frames.map((frame) => frame.anchorX * frame.width));
	const reachOther = Math.max(...frames.map((frame) => (1 - frame.anchorX) * frame.width));
	// The source width that has to fit across the box: the two reaches together, which is
	// the sweep. Which side is which depends on whether the art is mirrored, and the sum
	// does not care — a mirror swaps the pair and the character comes out the same size
	// facing either way.
	const sourceWidth = reachOne + reachOther;
	// A missing, zero or nonsense scale must never shrink a character to nothing or
	// flip the ratio: anything outside the authored range reads as "no correction".
	const scale =
		Number.isFinite(renderScale) && renderScale >= RENDER_SCALE_MIN && renderScale <= RENDER_SCALE_MAX
			? renderScale
			: DEFAULT_RENDER_SCALE;
	return Math.min(
		box.height / (REFERENCE_SOURCE_HEIGHT / scale),
		box.height / maxHeight,
		// The one cap a character may waive. Infinity rather than a branch on the min, so
		// the waiver reads as "this sheet's width does not bind" and the other two caps are
		// untouched by it.
		widthCap ? box.width / sourceWidth : Infinity
	);
}

/**
 * Whether this character's width is allowed to size it. Only an explicit `false` waives
 * the cap — a definition that says nothing, one that predates the field, and one whose
 * value is some other thing entirely all get the cap, because keeping art inside its box
 * is what every character is meant to have and an unreadable file is not a reason to let
 * one out of it.
 */
export function readWidthCap(definition: Partial<CharacterDefinition> | null): boolean {
	return definition?.widthCap === false ? false : DEFAULT_WIDTH_CAP;
}
