import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readable } from 'svelte/store';
import { render } from '@testing-library/svelte';
import CombatNarration from '$components/core/CombatNarration.svelte';

/**
 * The line laid over the player's panel while a turn is played out.
 *
 * The collection is the authored one, read off `/data/combat-narration.json` by the
 * service — stubbed here, because what this block has to get right is not the fetch but
 * the things it does with what comes back: word the cue it is handed, letter each fighter
 * in that fighter's own colour, type it out a word at a time, and draw nothing at all when
 * there is nothing to say. A plate that stayed up empty between turns would be a caption
 * box standing over the orders.
 */
vi.mock('$services/narration.service', () => ({
	narration: readable({
		lines: {
			hit: ['El cop de {attacker} entra: {target} cau.'],
			blocked: ['{target} para el cop de {attacker}.']
		}
	}),
	loadNarration: () => Promise.resolve()
}));

/** The sentence as the plate reads it — one string, however many spans it is drawn in. */
const said = (container: HTMLElement): string => container.querySelector('p')?.textContent ?? '';

/** The words that are actually inked at this moment: everything else is drawn invisible so
 * the box is its final size from the first frame. The gaps between words are never hidden —
 * there is nothing to see in one either way — so what is left of them trims off the end. */
const inked = (container: HTMLElement): string =>
	[...container.querySelectorAll('p > span')]
		.filter((span) => !span.className.includes('opacity-0'))
		.map((span) => span.textContent)
		.join('')
		.trim();

describe('the narration over the panel', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	/** Let the whole line be typed out, however long it is. */
	const typed = async (): Promise<void> => {
		await vi.advanceTimersByTimeAsync(2000);
	};

	it('words the cue it is handed', async () => {
		const { container } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' }
			}
		});
		await typed();
		expect(said(container)).toBe('El cop de Goku entra: Bulma cau.');
		expect(inked(container)).toBe('El cop de Goku entra: Bulma cau.');
	});

	it('letters each fighter in the colour it fights in', () => {
		// The one thing that tells two names in one sentence apart at a glance: the same six
		// swatches the board draws that fighter's aura and sparks in.
		const { container } = render(CombatNarration, {
			props: {
				cue: {
					event: 'hit',
					values: { attacker: 'Goku', target: 'Bulma' },
					colors: { attacker: 'orange', target: 'blue' },
					seq: 1,
					fight: 'p0|r0'
				}
			}
		});
		const spans = [...container.querySelectorAll('p > span')];
		const ink = (name: string) =>
			spans.find((span) => span.textContent === name)?.className.match(/text-[a-z]+-\d+/)?.[0];
		expect(ink('Goku')).toBe('text-orange-500');
		expect(ink('Bulma')).toBe('text-blue-500');
		// The author's own words are the plate's ink, not anybody's colour.
		expect(spans.find((span) => span.textContent === 'cop')?.className).not.toMatch(/text-/);
	});

	it('is lettered in the plate’s own ink when the cue carries no colours', () => {
		// A colour is a reading of a name, never a rule — an old cue narrates in one ink
		// rather than not at all.
		const { container } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' }
			}
		});
		for (const span of container.querySelectorAll('p > span')) {
			expect(span.className).not.toMatch(/text-/);
		}
	});

	it('types the line out a word at a time', async () => {
		const { container } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' }
			}
		});
		// Nothing is up on the first frame, and the words arrive one after another.
		expect(inked(container)).toBe('');
		await vi.advanceTimersByTimeAsync(45);
		expect(inked(container)).toBe('El');
		await vi.advanceTimersByTimeAsync(45 * 3);
		expect(inked(container)).toBe('El cop de Goku');
		// However little of it is inked, the whole sentence is drawn — so the box never
		// re-wraps under the eye as the words land, and a screen reader is given the line
		// rather than a word.
		expect(said(container)).toBe('El cop de Goku entra: Bulma cau.');
	});

	it('draws nothing between turns', () => {
		const { container } = render(CombatNarration, { props: { cue: null } });
		expect(container.textContent?.trim()).toBe('');
	});

	it('stays quiet about an encounter nobody has written a line for', () => {
		// A collection is allowed to be silent about one — what must never happen is a plate
		// coming up with a placeholder, or an empty box, in the middle of a fight.
		const { container } = render(CombatNarration, {
			props: {
				cue: {
					event: 'exchange',
					values: { attacker: 'Goku', target: 'Bulma' },
					seq: 2,
					fight: 'p0|r0'
				}
			}
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('is read out as it changes, so a fight can be followed by ear', async () => {
		const { container } = render(CombatNarration, {
			props: {
				cue: {
					event: 'blocked',
					values: { attacker: 'Goku', target: 'Bulma' },
					seq: 3,
					fight: 'p0|r0'
				}
			}
		});
		await typed();
		const live = container.querySelector('[aria-live="polite"]');
		expect(live).toBeTruthy();
		expect(live?.textContent).toContain('Bulma para el cop de Goku');
	});
});
