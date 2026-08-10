import { describe, it, expect, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from '@testing-library/svelte';
import CombatNarration from '$components/core/CombatNarration.svelte';

/**
 * The line laid over the player's panel while a turn is played out.
 *
 * The collection is the authored one, read off `/data/combat-narration.json` by the
 * service — stubbed here, because what this block has to get right is not the fetch but
 * the two things it does with what comes back: word the cue it is handed, and draw
 * nothing at all when there is nothing to say. A plate that stayed up empty between
 * turns would be a caption box standing over the orders.
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

describe('the narration over the panel', () => {
	it('words the cue it is handed', () => {
		const { getByText } = render(CombatNarration, {
			props: { cue: { event: 'hit', values: { attacker: 'Goku', target: 'Bulma' }, seq: 1 } }
		});
		expect(getByText('El cop de Goku entra: Bulma cau.')).toBeTruthy();
	});

	it('draws nothing between turns', () => {
		const { container } = render(CombatNarration, { props: { cue: null } });
		expect(container.textContent?.trim()).toBe('');
	});

	it('stays quiet about an encounter nobody has written a line for', () => {
		// A collection is allowed to be silent about one — what must never happen is a plate
		// coming up with a placeholder, or an empty box, in the middle of a fight.
		const { container } = render(CombatNarration, {
			props: { cue: { event: 'exchange', values: { attacker: 'Goku', target: 'Bulma' }, seq: 2 } }
		});
		expect(container.textContent?.trim()).toBe('');
	});

	it('is read out as it changes, so a fight can be followed by ear', () => {
		const { container } = render(CombatNarration, {
			props: { cue: { event: 'blocked', values: { attacker: 'Goku', target: 'Bulma' }, seq: 3 } }
		});
		const live = container.querySelector('[aria-live="polite"]');
		expect(live).toBeTruthy();
		expect(live?.textContent).toContain('Bulma para el cop de Goku');
	});
});
