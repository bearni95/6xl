import { describe, expect, it } from 'vitest';
import { contentCrop, type GridSpan } from '$utils/mugen/mugen-board';

/**
 * Where the canvas is cut around the board.
 *
 * It is cut to the grid, both ways: the field's own four edges and nothing else, so the
 * board runs corner to corner of the canvas. The canvas is scaled to fit its box, so canvas
 * that is not board is scale the board does not get — a strip beside the grid or a band
 * above it is the whole board drawn smaller for it. Room a fighter needs over its head is
 * given as board instead (the row above the lanes), not as canvas held back.
 *
 * Pure arithmetic over the grid's geometry, so no Pixi app is booted and no WebGL context
 * is asked for — and nothing here is read off what happens to be drawn.
 */
const span: GridSpan = { left: 40, right: 1140, top: 40, bottom: 900 };

describe('the crop the board is drawn inside', () => {
	it('is the grid’s own rectangle, edge to edge on both axes', () => {
		const crop = contentCrop(span);

		expect(crop.left).toBe(span.left);
		expect(crop.left + crop.width).toBe(span.right);
		expect(crop.top).toBe(span.top);
		expect(crop.top + crop.height).toBe(span.bottom);
	});

	it('keeps nothing back above the top row or below the bottom one', () => {
		// The board's own head room is a row of cells, which is inside this rectangle
		// already. Anything reserved on top of it would be spent twice.
		const crop = contentCrop(span);

		expect(crop.height).toBe(span.bottom - span.top);
		expect(crop.width).toBe(span.right - span.left);
	});

	it('rounds outward, so no edge of the grid falls off the canvas', () => {
		const crop = contentCrop({ left: 40.4, right: 1140.2, top: 40.7, bottom: 900.1 });

		expect(crop.left).toBe(40);
		expect(crop.top).toBe(40);
		expect(crop.left + crop.width).toBeGreaterThanOrEqual(1140.2);
		expect(crop.top + crop.height).toBeGreaterThanOrEqual(900.1);
	});
});
