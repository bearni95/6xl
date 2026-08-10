import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
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

	/**
	 * Pressing a line opens the whole announcement under it.
	 *
	 * A line says who, what and where; the record carries what it paid, how much of the team
	 * came through, how many stood against them and whether the town changed hands, none of
	 * which is on the line. So what is pinned here is that the press yields the *entry* and
	 * not a tidier version of the line — the town down there is the geojson id it arrived as,
	 * because this is the record and not the sentence.
	 */
	it('drops the fight’s whole record out under the line it is pressed on', async () => {
		// Its own player, because the fights the tests above left in the feed are still in it —
		// the service is the one the page holds — and the town is not what tells them apart.
		combatFeedService.receive({
			...fight('opened', 'ES_08101'),
			player: { id: 'p2', name: 'Ermessenda', character_id: null, color: 'blue', level: 7 }
		});
		const { container, findByText } = render(CombatFeedModal);

		// Closed until it is asked for: a sheet that opened every fight it holds would be a
		// wall of JSON where a feed was wanted.
		expect(container.querySelector('pre')).toBeNull();

		const line = (await findByText('Ermessenda')).closest('button');
		expect(line).toBeTruthy();
		await fireEvent.click(line!);

		const record = container.querySelector('pre');
		expect(record).toBeTruthy();
		// Parsed rather than matched as text: what has to be true is that the whole entry is
		// down there, field for field, and not that some string happens to appear in it.
		expect(JSON.parse(record!.textContent ?? '{}')).toMatchObject({
			id: 'opened',
			locationId: 'ES_08101',
			outcome: 'win',
			exp: 300,
			survivors: 3,
			fielded: 3,
			captured: false,
			stale: false,
			player: { name: 'Ermessenda', level: 7 }
		});

		// And it is a toggle: the same press puts it away again.
		await fireEvent.click(line!);
		expect(container.querySelector('pre')).toBeNull();
	});
});
