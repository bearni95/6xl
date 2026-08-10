import { describe, expect, it } from 'vitest';
import { APRON_DEPTH, MugenBoard, type BoardGrid } from '$utils/mugen/mugen-board';
import { BOARD_HEIGHT } from '$utils/mugen/grid';
import { GROUND_FIELD_COLUMNS, GROUND_TILES_PER_CELL } from '$utils/mugen/ground';

/**
 * The canvas the board is laid out on.
 *
 * It is the grid and the strip of ground under it, plus the padding drawn inside during the
 * layout — and the crop then takes that padding back off, so the finished canvas is those
 * two and nothing else. Nothing is reserved beside the board or over it: the canvas is
 * scaled to fit its box, so room held back is board drawn smaller, and the room a fighter
 * needs above its head is a row of the board itself (see `grid.ts`'s FIRST_LANE_ROW).
 *
 * Only the geometry is exercised: `dimensions` is arithmetic over the options, so no Pixi
 * app is booted and no WebGL context is asked for.
 */
const grids: [BoardGrid, BoardGrid] = [
	{ color: 0xff0000, character: { basePath: '/assets/a/frames' } },
	{ color: 0x2563eb, character: { basePath: '/assets/b/frames' } }
];

const board = (cellSize: number, padding: number) =>
	new MugenBoard({ grids, cellSize, padding });

describe('the canvas the board is laid out on', () => {
	it('is the board’s own extent, with the padding around it and nothing else', () => {
		const cellSize = 99;
		const padding = 10;
		const { width, height } = board(cellSize, padding).dimensions;

		// Across, there is nothing but the board and the padding at either end of it: the
		// gutter the row numbers and column letters used to stand in is gone, and with it
		// the third of a cell it took off two sides of a canvas that is scaled to fit its
		// box — so what it held is board now.
		//
		// The board is measured in its own squares rather than in its cells, because one of
		// them is not drawn: the field is closed up over the cut column, so it is
		// GROUND_FIELD_COLUMNS squares across where its three cells would make nine.
		expect(width).toBeCloseTo(
			padding * 2 + (cellSize * GROUND_FIELD_COLUMNS) / GROUND_TILES_PER_CELL
		);

		// And down: the board's own height, that same padding, and the apron — the strip of
		// ground below the last row of cells that the field's bottom fringe is drawn on. It
		// is board rather than reserved room: it is grass, it is ruled, and it is there so
		// the fringe falls below the last row a fighter stands on instead of inside it.
		expect(height).toBeCloseTo(padding * 2 + cellSize * (BOARD_HEIGHT + APRON_DEPTH));
	});

	it('scales with the cells and nothing else', () => {
		// Everything the canvas is made of is measured in cells, so a board drawn at twice
		// the cell size is twice the board — the padding aside, which is pixels.
		const small = board(99, 10).dimensions;
		const large = board(198, 10).dimensions;
		expect(large.height - 10 * 2).toBeCloseTo((small.height - 10 * 2) * 2);
		expect(large.width - 10 * 2).toBeCloseTo((small.width - 10 * 2) * 2);
	});

	// A cell is nine ground squares and three of the board's own edges land on one of them —
	// the cut column, the brow and the apron — so a cell that is not a whole number of squares
	// puts those edges mid-pixel. The crop rounds outward from there, and the fraction of a
	// pixel it takes past the field is canvas with no board drawn on it, sitting inside the
	// picture with the arena's sky showing through it. So the size a caller asks for is a
	// resolution and never a landing place: it is snapped to the squares before anything is
	// measured off it.
	it('lands on whole ground squares whatever size it is asked for', () => {
		// Read off the geometry rather than the option, which is the board's own: an extent
		// that is a whole number of pixels on both axes is a cell that is a whole number of
		// squares, since every figure in it is the cell taken in thirds.
		//
		// To the hair the crop itself allows, and for the same reason: a third of a cell is
		// not a binary fraction, so an exact figure arrives as 948.9999999999999 and it is
		// the crop's tolerance rather than the arithmetic that lands it on the pixel.
		for (const asked of [1, 100, 101, 219, 220]) {
			const { width, height } = board(asked, 0).dimensions;
			expect(width).toBeCloseTo(Math.round(width), 6);
			expect(height).toBeCloseTo(Math.round(height), 6);
		}
	});
});
