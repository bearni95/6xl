/**
 * A fighter's combat colour as a number a canvas can be told.
 *
 * Every mark the board makes about one fighter is drawn in that fighter's own colour —
 * its aura, its callouts, the sparks off its blows, the order it chose — so the six names
 * a card can roll have to resolve to six hex values somewhere. This is that table, and it
 * is *only* that table: no Pixi, no board, nothing that needs a WebGL context.
 *
 * Which is the whole reason it lives here rather than in `mugen-board`, where it was. The
 * arena letters a fight and the board draws one, so the board is imported dynamically and
 * arrives when a fight does — except that the arena also read this table out of it, and one
 * value import is enough to make a module a static dependency. So the engine was in the
 * map's own initial bundle, evaluated on every visit by everybody, and its dynamic import
 * was a formality. Two things had to move for it to be a real one: this, and `grid.ts`'s
 * `cellScreenY`.
 */

/** Canvas hex for each combat colour, for tinting callouts, guards and sparks. */
const COMBAT_COLOR_HEX: Record<string, number> = {
	red: 0xef4444,
	blue: 0x3b82f6,
	yellow: 0xfacc15,
	purple: 0xa855f7,
	orange: 0xf97316,
	green: 0x22c55e
};

/** Hex for a combat colour name, defaulting to white for anything unknown. */
export const combatColorHex = (color: string): number => COMBAT_COLOR_HEX[color] ?? 0xffffff;

// There was a `GRID_LINE` here — the red every line of the board's lattice was ruled in,
// named beside the marks it shared its value with so the two could not drift apart. The
// lattice is gone (`mugen-board.ts`'s drawBoard): the board is ruled in the ground's own
// squares, in this table's yellow, and red is a fighter's colour again like every other.
