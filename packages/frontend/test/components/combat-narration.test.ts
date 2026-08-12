import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readable } from 'svelte/store';
import { render } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import CombatNarration from '$components/core/CombatNarration.svelte';
import ca from '../../src/services/i18n/locales/ca.json';

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
	// The one word this block draws that is not authored narration: the button's own label,
	// which comes out of the catalogue like every other word in the game.
	beforeAll(async () => {
		addMessages('ca', ca);
		init({ fallbackLocale: 'ca', initialLocale: 'ca' });
		await waitLocale();
	});

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

	it('holds the way on until both the canvas and the words are done', async () => {
		// The button stands from the moment the row starts being played — the reader is told
		// what carries them on before they need it, and the plate does not change size when
		// it comes alive — and it is dead until the encounter is over on both counts.
		const presses: unknown[] = [];
		const { container, rerender } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' },
				playing: true,
				awaiting: false
			},
			events: { next: () => presses.push(true) }
		});
		const button = () => container.querySelector('button') as HTMLButtonElement;
		expect(button()).toBeTruthy();
		expect(button().disabled).toBe(true);

		// The words finish first: the canvas is still playing the row out, so nothing yet.
		await typed();
		expect(button().disabled).toBe(true);

		// The canvas finishes too, and only now is the press answered.
		await rerender({ awaiting: true });
		expect(button().disabled).toBe(false);

		button().click();
		expect(presses).toHaveLength(1);
	});

	it('will not be pressed while the line is still being typed', async () => {
		// The other way round: the canvas is done and the sentence is half written. Pressing
		// on from a line nobody has read yet is the fight reading it for them.
		const { container } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' },
				playing: true,
				awaiting: true
			}
		});
		const button = () => container.querySelector('button') as HTMLButtonElement;
		await vi.advanceTimersByTimeAsync(45 * 2);
		expect(button().disabled).toBe(true);
		await typed();
		expect(button().disabled).toBe(false);
	});

	it('is still the way on out of an encounter nobody wrote a line for', async () => {
		// A silent row stops the fight like any other, and a hold with nothing on screen to
		// release it would be a fight that could not be carried on at all.
		const { container } = render(CombatNarration, {
			props: {
				cue: {
					event: 'exchange',
					values: { attacker: 'Goku', target: 'Bulma' },
					seq: 1,
					fight: 'p0|r0'
				},
				playing: true,
				awaiting: true
			}
		});
		expect(container.querySelector('p')).toBeNull();
		expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
	});

	it('offers no way on once the fight is over', async () => {
		// The line that decided a fight stands after it is done — and a press then would lead
		// nowhere, the turn it belonged to having been the last one.
		const { container } = render(CombatNarration, {
			props: {
				cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1, fight: 'p0|r0' },
				playing: false,
				awaiting: false
			}
		});
		await typed();
		expect(container.querySelector('p')?.textContent).toBe('El cop de Goku entra: Bulma cau.');
		expect(container.querySelector('button')).toBeNull();
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
