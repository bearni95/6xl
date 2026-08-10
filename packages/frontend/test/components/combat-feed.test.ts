import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import CombatFeedModal from '$components/core/CombatFeedModal.svelte';
import { combatFeedService } from '$services/combatFeed.service';
import ca from '../../src/services/i18n/locales/ca.json';

/**
 * The sheet that reads out the fights finishing elsewhere.
 *
 * The one thing it has to do beyond listing them is **name the town**. What comes off the
 * channel is a geojson feature id — no table on the server holds a place name — so the sheet
 * fetches the very layer the map draws and prints what that says, article and all. A line
 * lettered `ES_08019` is the failure this is here to catch, and it is a failure that hides:
 * the id is what is drawn for the moment before the layer lands, so nothing is wrong until
 * the moment it should have been replaced.
 */
const LAYER = {
	type: 'FeatureCollection',
	features: [
		{
			type: 'Feature',
			// As the gazetteer files it, with the article shunted to the end.
			properties: { id: 'ES_08101', name: "Hospitalet de Llobregat, l'" },
			geometry: null
		}
	]
};

const fight = (id: string, town: string) => ({
	id,
	at: '2026-08-10T17:04:00.000Z',
	outcome: 'win',
	exp: 300,
	survivors: 3,
	fielded: 3,
	rivals: 0,
	town,
	captured: false,
	stale: false,
	player: { id: 'p1', name: 'Guifré', character_id: null, color: 'red', level: 4 }
});

describe('the sheet of other fights', () => {
	let release: (() => void) | null = null;

	beforeAll(async () => {
		addMessages('ca', ca);
		init({ fallbackLocale: 'ca', initialLocale: 'ca' });
		await waitLocale();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(LAYER)))
		);
		// Listening is what reads the layer, and it is deliberately not this sheet that does:
		// the names are fetched as the fight starts so that they are already in hand whenever
		// somebody presses the button. Which is what this stands in for — the page's own
		// `onMount(() => combatFeedService.listen())`.
		release = combatFeedService.listen();
	});

	afterAll(() => release?.());

	afterEach(() => combatFeedService.closeFeed());

	it('names the town the fight was over, and never its code', async () => {
		combatFeedService.receive(fight('named', 'ES_08101'));
		const { findByText, queryByText } = render(CombatFeedModal);

		// The name off the map's own layer, with the article back at the front the way every
		// other place name in this game is printed. Awaited, because the layer is fetched: the
		// bug this pins is a name that lands after the first paint and never redraws.
		expect(await findByText("L'Hospitalet de Llobregat")).toBeTruthy();
		expect(queryByText('ES_08101')).toBeNull();
	});

	it('leaves the id standing for a town the layer does not hold', async () => {
		combatFeedService.receive(fight('unknown', 'ES_99999'));
		const { findByText } = render(CombatFeedModal);
		// Better than a blank: a fight did happen somewhere, and this is everything anybody
		// knows about where.
		expect(await findByText('ES_99999')).toBeTruthy();
	});
});
