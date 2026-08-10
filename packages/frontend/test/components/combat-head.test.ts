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

	it('counts the town off the same card, and counts nothing else', () => {
		const { container } = render(CombatHead, { props: { location: town } });
		// How far the town has been taken is the one quantity the head draws, and it is the
		// upright bar on the seam: one progress element, off `location` like the rest of the
		// block. The score of the fight itself stood under it as two rows of discs and is gone
		// with the banner they were drawn on, so a head that has grown a second count has grown
		// back the band this one was taken out of.
		expect(container.querySelectorAll('progress').length).toBe(1);
		expect(container.querySelectorAll('[role="progressbar"]').length).toBe(0);
	});

	it('is a reading and offers nothing to press at all', () => {
		const { container } = render(CombatHead, { props: { location: town } });
		// The way out of the fight stood on the seam between the two cells and is asked for on
		// the player's own card in the orders panel now. A head with a button in it is that
		// control back in the middle of a reading of the other side.
		expect(container.querySelectorAll('button').length).toBe(0);
	});

	it('stays a reading once fights have finished elsewhere', () => {
		// The count of fights finished anywhere else was the one press the head carried, at the
		// far end of the score banner. The banner is gone and the count with it, so the block is
		// a reading whether or not the game is busy — and nothing in the arena opens the feed.
		combatFeedService.receive({
			id: 'head-feed',
			at: '2026-08-10T17:04:00.000Z',
			outcome: 'win',
			town: 'ES_08019',
			player: { name: 'Ermessenda', level: 3 }
		});
		const { container } = render(CombatHead, { props: { location: town } });
		expect(container.querySelectorAll('button').length).toBe(0);
	});
});
