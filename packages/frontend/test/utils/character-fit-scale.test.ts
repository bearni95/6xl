import { describe, expect, it } from 'vitest';
import { characterFitScale, readWidthCap, REFERENCE_SOURCE_HEIGHT } from '$utils/card/character-fit';
import { DEFAULT_WIDTH_CAP } from '$types/character-definition.type';

/** A one-frame idle cycle of the given native size, its body axis centred. */
const frame = (width: number, height: number, anchorX = 0.5) => [{ width, height, anchorX }];

// The card's art box and the board's cell are different sizes; what has to hold is
// that both hand the *same* character the same size relative to the others.
const CARD_BOX = { width: 180, height: 240 };
const BOARD_BOX = { width: 120, height: 156 };

describe('characterFitScale', () => {
	it('draws a character at the same fraction of its box on either surface', () => {
		// Krillin against Trunks: a short character comes out visibly shorter than a
		// tall one instead of both being stretched to fill their box.
		const krillin = frame(70, 81);
		const trunks = frame(80, 136);
		const ratio = (box: { width: number; height: number }) =>
			(characterFitScale(krillin, box) * 81) / (characterFitScale(trunks, box) * 136);
		expect(ratio(CARD_BOX)).toBeCloseTo(81 / 136, 10);
		expect(ratio(BOARD_BOX)).toBeCloseTo(81 / 136, 10);
	});

	it('scales every character under the reference height by one shared ratio', () => {
		const shared = BOARD_BOX.height / REFERENCE_SOURCE_HEIGHT;
		for (const height of [33, 81, 136, REFERENCE_SOURCE_HEIGHT]) {
			expect(characterFitScale(frame(40, height), BOARD_BOX)).toBeCloseTo(shared, 10);
		}
	});

	it('brings a character taller than the reference back to the box', () => {
		// Perfect Cell (~185 source px) stands out of the box at the shared ratio, so
		// the cap holds it to exactly the box's height.
		const cell = frame(109, 185);
		const scale = characterFitScale(cell, BOARD_BOX);
		expect(185 * scale).toBeCloseTo(BOARD_BOX.height, 10);
		expect(scale).toBeLessThan(BOARD_BOX.height / REFERENCE_SOURCE_HEIGHT);
	});

	it('holds a wide character inside the box', () => {
		// A cycle wider than the box at the shared ratio is brought back until it fits
		// across it — the whole cycle, edge to edge.
		const wide = frame(300, 100, 0.2);
		const scale = characterFitScale(wide, BOARD_BOX);
		expect(300 * scale).toBeCloseTo(BOARD_BOX.width, 10);
	});

	it('fits the sweep a cycle occupies, not its longer half doubled', () => {
		// Frieza's shape: a body on the axis and a tail reaching a long way to one side.
		// What has to fit is the rectangle he actually occupies; measuring the tail's reach
		// off the axis and doubling it would fit a body-width of empty room beside him and
		// draw him a head shorter for it.
		const tailed = frame(140, 118, 0.7);
		const scale = characterFitScale(tailed, BOARD_BOX);
		expect(140 * scale).toBeCloseTo(BOARD_BOX.width, 10);
		expect(scale).toBeGreaterThan(BOARD_BOX.width / (2 * 0.7 * 140));
	});

	it('reads the same sweep whichever way the art is mirrored', () => {
		// A mirror swaps the axis's two reaches, and their sum is what the sweep is: the
		// character comes out the same size facing either way.
		const left = characterFitScale(frame(140, 118, 0.7), BOARD_BOX);
		const right = characterFitScale(frame(140, 118, 0.3), BOARD_BOX);
		expect(left).toBeCloseTo(right, 10);
	});

	it('sizes a character by the room its cycle takes, not by where its axis sits in it', () => {
		// The same silhouette, hung off its axis three different ways: a fighter pinned to
		// its cell's mark, a card centring the art, anything else — none of them may come
		// out a different size for it, since it is the same character on all of them.
		const sizes = [0.2, 0.5, 0.7].map((anchorX) =>
			characterFitScale(frame(140, 118, anchorX), BOARD_BOX)
		);
		for (const size of sizes) expect(size).toBeCloseTo(sizes[0], 10);
	});

	it('measures the whole cycle, not just its first frame', () => {
		const cycle = [
			{ width: 60, height: 100, anchorX: 0.5 },
			{ width: 60, height: 190, anchorX: 0.5 }
		];
		expect(characterFitScale(cycle, BOARD_BOX)).toBeCloseTo(BOARD_BOX.height / 190, 10);
	});

	it('draws a character up by its own render scale', () => {
		// Inuyasha's sheet is drawn at about two thirds of the roster's scale, so his
		// definition asks for 1.4 and he comes out 1.4× the size his pixels alone would
		// give — which is what puts him beside Goku instead of beside Chopper.
		const inuyasha = frame(68, 98);
		const plain = characterFitScale(inuyasha, CARD_BOX);
		expect(characterFitScale(inuyasha, CARD_BOX, 1.4)).toBeCloseTo(plain * 1.4, 10);
	});

	it('puts a scaled-up character at the size of a natively bigger one', () => {
		// The whole point of the field: 98 px drawn at 1.4 must read as ~137 px does at 1.
		const scaled = characterFitScale(frame(68, 98), CARD_BOX, 1.4) * 98;
		const native = characterFitScale(frame(80, 137), CARD_BOX) * 137;
		expect(scaled).toBeCloseTo(native, 0);
	});

	it('still holds a scaled-up character inside its box', () => {
		// The scale lowers what the character is measured against, never the box: Sango
		// (~109 px) asking for 1.4 wants an effective reference of ~107, so she is over
		// it and the height cap brings her back to the box exactly as Perfect Cell is.
		const sango = frame(59, 109);
		const scale = characterFitScale(sango, BOARD_BOX, 1.4);
		expect(109 * scale).toBeLessThanOrEqual(BOARD_BOX.height + 1e-9);
		expect(scale).toBeGreaterThan(characterFitScale(sango, BOARD_BOX));
	});

	it('ignores a missing or out-of-range scale rather than shrinking a character', () => {
		// A definition with no scale, and any value a hand-edit or a bad fetch could
		// produce, must draw the character exactly as it always was.
		const goku = frame(96, 135);
		const plain = characterFitScale(goku, CARD_BOX);
		for (const bad of [undefined, 0, -1, NaN, Infinity, 40, 0.01]) {
			expect(characterFitScale(goku, CARD_BOX, bad as number)).toBeCloseTo(plain, 10);
		}
	});

	it('sizes a character that waives the width cap by its height alone', () => {
		// Franky's shape: as tall as his castmates and drawn with his arms out, so the sweep
		// the cap measures is his pose rather than the room he needs. Waiving it puts him on
		// the shared ratio like anybody else, and lets him hang over his box.
		const armsOut = frame(195, 156);
		const capped = characterFitScale(armsOut, BOARD_BOX);
		const waived = characterFitScale(armsOut, BOARD_BOX, 1, false);
		expect(waived).toBeCloseTo(BOARD_BOX.height / 156, 10);
		expect(waived).toBeGreaterThan(capped);
		expect(195 * waived).toBeGreaterThan(BOARD_BOX.width);
	});

	it('stands a waiving character level with a narrow one of its own height', () => {
		// The whole point of the waiver: Franky and Nico Robin are the same 156 px tall and
		// nothing but a sweep of 195 against 43 stood between them.
		const franky = characterFitScale(frame(195, 156), BOARD_BOX, 1, false) * 156;
		const robin = characterFitScale(frame(43, 156), BOARD_BOX) * 156;
		expect(franky).toBeCloseTo(robin, 10);
	});

	it('leaves the other two caps standing for a character that waives the width one', () => {
		// Only the width cap is waived. A character over the reference height is still
		// brought back to its box, and one under it still takes its own share of the ratio.
		const tall = frame(300, 185);
		expect(185 * characterFitScale(tall, BOARD_BOX, 1, false)).toBeCloseTo(BOARD_BOX.height, 10);
		const short = frame(300, 81);
		expect(characterFitScale(short, BOARD_BOX, 1, false)).toBeCloseTo(
			BOARD_BOX.height / REFERENCE_SOURCE_HEIGHT,
			10
		);
	});

	it('caps the width by default, however the argument is left out', () => {
		const armsOut = frame(195, 156);
		const capped = characterFitScale(armsOut, BOARD_BOX);
		expect(characterFitScale(armsOut, BOARD_BOX, 1, true)).toBeCloseTo(capped, 10);
		expect(characterFitScale(armsOut, BOARD_BOX, 1, DEFAULT_WIDTH_CAP)).toBeCloseTo(capped, 10);
		expect(195 * capped).toBeCloseTo(BOARD_BOX.width, 10);
	});
});

describe('readWidthCap', () => {
	it('waives the cap only where a definition says so outright', () => {
		expect(readWidthCap({ widthCap: false })).toBe(false);
	});

	it('caps every character that says nothing, or says something unreadable', () => {
		expect(readWidthCap(null)).toBe(DEFAULT_WIDTH_CAP);
		expect(readWidthCap({})).toBe(DEFAULT_WIDTH_CAP);
		expect(readWidthCap({ widthCap: true })).toBe(DEFAULT_WIDTH_CAP);
		for (const bad of [0, '', 'false', null]) {
			expect(readWidthCap({ widthCap: bad as unknown as boolean })).toBe(DEFAULT_WIDTH_CAP);
		}
	});
});
