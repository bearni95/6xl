import { describe, expect, it } from 'vitest';
import { GROUND_FILL_TILES, groundTileAt } from '$utils/mugen/ground';

/**
 * Which tile a square of ground is laid with.
 *
 * It is a fact about where the square is and nothing else — no throw and nothing stored —
 * which is what lets the canvas and the document lay the same field: the board draws the
 * squares it has room for, `CombatGround` carries the pattern on below the picture and
 * `CombatFlanks` carries it on to either side of it, and all three ask this same question
 * counted from the same corner.
 *
 * The squares beside the board are the reason the count has to work in both directions: past
 * the board's left-hand column they are column −1, −2 and on.
 */
describe('which ground tile a square takes', () => {
	it('takes the set in turn along both axes, so no square is the tile east or north of it', () => {
		for (let column = 0; column < 6; column++) {
			for (let row = 0; row < 6; row++) {
				const here = groundTileAt(GROUND_FILL_TILES, column, row);

				expect(here).not.toBe(groundTileAt(GROUND_FILL_TILES, column + 1, row));
				expect(here).not.toBe(groundTileAt(GROUND_FILL_TILES, column, row + 1));
			}
		}
	});

	it('runs on the diagonal, the pattern repeating every three squares across', () => {
		expect(groundTileAt(GROUND_FILL_TILES, 3, 0)).toBe(groundTileAt(GROUND_FILL_TILES, 0, 0));
		expect(groundTileAt(GROUND_FILL_TILES, 1, 1)).toBe(groundTileAt(GROUND_FILL_TILES, 0, 2));
	});

	it('carries the same count off the left of the board, where a column is negative', () => {
		// The square before the board's first one is the one the alternation would have put
		// there — not the first square repeated, and never a read off the front of the list.
		for (let row = 0; row < 4; row++) {
			for (let column = -9; column < 0; column++) {
				expect(GROUND_FILL_TILES).toContain(groundTileAt(GROUND_FILL_TILES, column, row));
				expect(groundTileAt(GROUND_FILL_TILES, column, row)).not.toBe(
					groundTileAt(GROUND_FILL_TILES, column + 1, row)
				);
			}
		}
	});
});
