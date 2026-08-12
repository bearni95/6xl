import { describe, it, expect } from 'vitest';
import { typewriterParts, typewriterWords } from '$utils/string/typewriter';

/**
 * Cutting a sentence into the pieces something types it out in.
 *
 * What it has to get right is that the sentence survives the cut — the combat narration
 * draws every one of these pieces, so a lost space or a dropped mark is a sentence on
 * screen with a hole in it — and that a run's colour rides along with each of its words,
 * since that is how a fighter's name is lettered in the colour it fights in.
 */
describe('cutting a sentence up to type it', () => {
	it('keeps the words and the gaps apart, and counts only the words', () => {
		const parts = typewriterParts([{ text: 'El cop entra' }]);
		expect(parts.map((part) => part.text)).toEqual(['El', ' ', 'cop', ' ', 'entra']);
		expect(parts.filter((part) => part.word).map((part) => part.index)).toEqual([0, 1, 2]);
		// A gap is never numbered: a reveal counts what is read, not what is between it.
		expect(parts.filter((part) => !part.word).every((part) => part.index === -1)).toBe(true);
		expect(typewriterWords(parts)).toBe(3);
	});

	it('gives every word of a run that run’s colour', () => {
		const parts = typewriterParts([
			{ text: 'Son Goku', color: 'orange' },
			{ text: ' tomba ' },
			{ text: 'Bulma', color: 'blue' }
		]);
		// A name of two words is two words, each in that fighter's colour.
		expect(parts.filter((part) => part.color === 'orange').map((part) => part.text)).toEqual([
			'Son',
			' ',
			'Goku'
		]);
		expect(parts.filter((part) => part.word).map((part) => part.index)).toEqual([0, 1, 2, 3]);
		expect(typewriterWords(parts)).toBe(4);
	});

	it('hands back exactly what it was given, joined up', () => {
		const runs = [{ text: '  Res ' }, { text: 'a', color: 'red' }, { text: ' per fer!  ' }];
		expect(
			typewriterParts(runs)
				.map((part) => part.text)
				.join('')
		).toBe(runs.map((run) => run.text).join(''));
	});

	it('has nothing to type in nothing', () => {
		expect(typewriterParts([])).toEqual([]);
		expect(typewriterParts([{ text: '' }])).toEqual([]);
		expect(typewriterWords([])).toBe(0);
	});
});
