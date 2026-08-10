import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import CombatHead from '$components/core/CombatHead.svelte';
import ca from '../../src/services/i18n/locales/ca.json';

/**
 * The head of the fight, as a block that can be put in either of two places (over the board
 * standing up, at the top of the orders panel lying down). What it must do wherever it is put
 * is say the four things it is for — the town, whoever holds it, the way out, and how the
 * fight stands — off the props it is handed and nothing else.
 *
 * The one that has already gone wrong once: the town's plate, the holder's account and the
 * siege bar all hang off `location`, so a head handed a card and drawing none of the three is
 * exactly the failure worth a test.
 */
const town = {
	iconSvg: null,
	frameClasses: null,
	title: 'Berga',
	subtitle: 'Berguedà',
	holder: { name: 'Guifré', characterId: null, color: null, level: 4 },
	challenge: { siege: { wins: 1, required: 2 }, button: null, unlocksAt: null }
};

describe('the head of the fight', () => {
	// The game's own catalogue, since the head letters everything it says through it — and the
	// way out is only findable by the words it is labelled with.
	beforeAll(async () => {
		addMessages('ca', ca);
		init({ fallbackLocale: 'ca', initialLocale: 'ca' });
		await waitLocale();
	});

	it('names the town it is over and whoever is sitting on it', () => {
		const { getByText } = render(CombatHead, { props: { location: town } });
		expect(getByText('Berga')).toBeTruthy();
		expect(getByText('Guifré')).toBeTruthy();
	});

	it('counts the town alongside the score, off the same card', () => {
		const { container } = render(CombatHead, {
			props: { location: town, wins: { info: 2, error: 1 } }
		});
		// The siege bar is a progress element laid under the score; the two counts are the
		// progressbar roles beside it.
		expect(container.querySelector('progress')).toBeTruthy();
		expect(container.querySelectorAll('[role="progressbar"]').length).toBe(2);
	});

	it('offers the way out only while there is a fight to give up', async () => {
		const concede = vi.fn();
		const { queryByLabelText } = render(CombatHead, { props: { location: town } });
		expect(queryByLabelText(ca.combat.concede)).toBeNull();

		const { getByLabelText } = render(CombatHead, {
			props: { location: town, wins: { info: 0, error: 0 }, concedeReady: true },
			events: { concede }
		});
		const flag = getByLabelText(ca.combat.concede);
		expect((flag as HTMLButtonElement).disabled).toBe(false);
		flag.click();
		expect(concede).toHaveBeenCalledTimes(1);
	});
});
