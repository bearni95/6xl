/**
 * A field of **pointy-topped** hexagons — each cell standing on end, a point at its top
 * and another at its bottom, taller than it is wide — as a lattice and nothing else:
 * where the hexagon at a given column and row of it sits, and where a figure standing in
 * one plants its feet.
 *
 * It knows nothing of anybody's coordinates — no signed columns, no lanes, no colours —
 * so a surface can lay itself on this ground without pretending to be a board. One does:
 * the admin's poster wall ({@link file://./mugen-poster-grid.ts}), which winds the whole
 * roster outward from a middle cell and wants a field that nests rather than one that
 * stacks, since a nested field puts a character between the two above it instead of
 * squarely behind one.
 *
 * The combat board was the other, and is not any more — it is a field of squares
 * ({@link file://./grid.ts}), which is why this lives here rather than beside it. What
 * the two shared was the arithmetic below and never the rules; nothing was lost by
 * separating them, and the board's own geometry became four lines of it.
 *
 * Everything here is measured in **cell widths**: one unit is the width of a hexagon,
 * which is also the distance between two neighbours' centres along a row.
 */

import type { GridPoint } from './grid';

/** A hexagon's height, as a multiple of its width: point to point down the long axis. */
export const HEX_HEIGHT = 2 / Math.sqrt(3);

/** How far below one row's centres the next row's sit — three quarters of a hexagon,
 * because the rows interlock rather than stack. So three rows are not three heights
 * tall: they are two steps plus one hexagon. */
export const HEX_ROW_STEP = HEX_HEIGHT * 0.75;

/** How far an indented row steps across from the rows either side of it — half a
 * cell, which is what makes the two nest instead of stacking. */
const ROW_STAGGER = 0.5;

/**
 * Centre of the hexagon at [column, row] of the lattice, in cell widths off the
 * lattice's top-left corner, columns counted from 0 across and rows from 0 down.
 *
 * `indent` is what makes a hex field a hex field: alternate rows step half a cell
 * across so each nests into the slants of the rows either side of it instead of
 * stacking squarely on them. Which rows are the indented ones is the caller's to decide,
 * because it is a fact about the field being laid out and not about the lattice — and an
 * indented row is inset half a cell at both ends, so a field with square edges gives it
 * one cell fewer.
 */
export function latticeCenter(column: number, row: number, indent: boolean): GridPoint {
	return {
		x: column + 0.5 - (indent ? ROW_STAGGER : 0),
		y: row * HEX_ROW_STEP + HEX_HEIGHT / 2
	};
}

/**
 * The line a figure standing in the hexagon centred at `centre` plants its feet on: the
 * centre across, and down at the foot of the two vertical sides.
 *
 * Not the bottom point. A hexagon standing on end tapers to a single vertex shared with
 * the two cells below it, and a figure stood on that reads as balancing on the crack
 * between them; the foot of the vertical sides is the lowest line at which the cell is
 * still its full width, so a figure stood there has the whole width of its own cell
 * under it and is plainly inside it.
 */
export function latticeFoot(centre: GridPoint): GridPoint {
	return { x: centre.x, y: centre.y + HEX_HEIGHT / 4 };
}
