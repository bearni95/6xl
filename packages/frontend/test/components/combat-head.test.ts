import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import CombatHead from '$components/core/CombatHead.svelte';
import { combatFeedService } from '$services/combatFeed.service';
import ca from '../../src/services/i18n/locales/ca.json';

/**
 * The head of the fight, as a block that can be put in either of two places (over the board
 * standing up, at the top of the orders panel lying down). What it must do wherever it is put
 * is say the three things it is for — the town, whoever holds it, and how the fight stands —
 * off the props it is handed, and nothing else at all.
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

	it('is a reading and offers nothing to press about the fight', () => {
		const { container } = render(CombatHead, {
			props: { location: town, wins: { info: 1, error: 1 } }
		});
		// The way out of the fight stood on the seam between the two cells and is asked for on
		// the player's own card in the orders panel now. A head with a button in it is that
		// control back in the middle of a reading of the other side. Nothing has finished
		// elsewhere yet either, so the one press this block does carry is not drawn.
		expect(container.querySelectorAll('button').length).toBe(0);
	});

	it('carries the count of other fights once there are any, and nothing before', () => {
		// The one press on the head, and it decides nothing about this fight: how many fights
		// have finished anywhere else while this one has been going on. It appears with the
		// first of them — a feed with nothing in it has nothing to reveal — so the head is a
		// reading and nothing else for as long as the game is quiet.
		combatFeedService.receive({
			id: 'head-feed',
			at: '2026-08-10T17:04:00.000Z',
			outcome: 'win',
			town: 'ES_08019',
			player: { name: 'Ermessenda', level: 3 }
		});
		const { container } = render(CombatHead, {
			props: { location: town, wins: { info: 1, error: 1 } }
		});
		expect(container.querySelectorAll('button').length).toBe(1);
	});
});
