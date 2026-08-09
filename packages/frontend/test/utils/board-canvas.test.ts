import { describe, expect, it } from 'vitest';
import { MugenBoard, type BoardGrid } from '$utils/mugen/mugen-board';
import { BOARD_HEIGHT, BOARD_WIDTH } from '$utils/mugen/grid';

/**
 * The canvas the board is laid out on.
 *
 * It is the grid, plus the padding drawn inside during the layout — and the crop then takes
 * that padding back off, so the finished canvas is the grid and nothing else. Nothing
 * is reserved beside the board or over it: the canvas is scaled to fit its box, so room
 * held back is board drawn smaller, and the room a fighter needs above its head is a row of
 * the board itself (see `grid.ts`'s FIRST_LANE_ROW).
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
		const cellSize = 100;
		const padding = 10;
		const { width, height } = board(cellSize, padding).dimensions;

		// Across, there is nothing but the board and the padding at either end of it: the
		// gutter the row numbers and column letters used to stand in is gone, and with it
		// the third of a cell it took off two sides of a canvas that is scaled to fit its
		// box — so what it held is board now.
		expect(width).toBeCloseTo(padding * 2 + cellSize * BOARD_WIDTH);

		// And down, the same: the board's own height and that same padding. The empty cell
		// that used to be reserved over the top row is a row of the board instead.
		expect(height).toBeCloseTo(padding * 2 + cellSize * BOARD_HEIGHT);
	});

	it('scales with the cells and nothing else', () => {
		// Everything the canvas is made of is measured in cells, so a board drawn at twice
		// the cell size is twice the board — the padding aside, which is pixels.
		const small = board(100, 10).dimensions;
		const large = board(200, 10).dimensions;
		expect(large.height - 10 * 2).toBeCloseTo((small.height - 10 * 2) * 2);
		expect(large.width - 10 * 2).toBeCloseTo((small.width - 10 * 2) * 2);
	});
});
