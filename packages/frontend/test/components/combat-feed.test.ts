import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
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

/** The side a fight was picked against, as the channel sends one. Null on the fights
 * below that do not pass one, which is a town still on its seeded house team. */
const RIVAL = { id: 'p2', name: 'Ermessenda', character_id: null, color: 'blue', level: 7 };

const fight = (id: string, town: string, extra: Record<string, unknown> = {}) => ({
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
	player: { id: 'p1', name: 'Guifré', character_id: null, color: 'red', level: 4 },
	rival: null,
	...extra
});

/**
 * What each line actually says, whole.
 *
 * The sentence is broken across elements — its three names are links — so it cannot be
 * matched as one run of text by a query. It is read back off the element the line's own
 * press is named by, which is the whole sentence and nothing else.
 */
const sentences = (container: HTMLElement): string[] =>
	[...container.querySelectorAll('[id^="feed-said-"]')].map(said);

/** One fight's sentence, by the id of the fight — every test below leaves its fights in the
 * feed for the next one, so a line is picked out rather than searched for. */
const lineOf = (container: HTMLElement, id: string): HTMLElement =>
	container.querySelector(`#feed-said-${id}`) as HTMLElement;

const said = (element: Element | null): string =>
	(element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** One whole fight in the list: the line, the stamp over it and the two faces bracketing
 * them, whatever they are nested in. */
const blockOf = (container: HTMLElement, id: string): HTMLElement =>
	lineOf(container, id).closest('.border-b') as HTMLElement;

/** The faces on one fight's line, in the order they stand, read as the letters they fall
 * back to — an account with no portrait picked wears the first letter of its name, which is
 * what says whose face it is without a manifest having to load. */
const initials = (container: HTMLElement, id: string): string[] =>
	[...blockOf(container, id).querySelectorAll('.avatar span')].map(said);

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
		// The app's own `onMount(() => combatFeedService.listen())`, which is the layout's now:
		// the channel is open for as long as the app is, on every route. It is the first fight
		// to arrive that reads the layer of town names — deliberately not this sheet, and no
		// longer the subscribing either, so a session that hears nothing never pulls two
		// megabytes of geometry down for names it will not print.
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
		// Matched inside the sentence rather than as a line of its own — the town is a word in
		// what the feed says about a fight, not a cell beside it.
		expect(await findByText(/L'Hospitalet de Llobregat/)).toBeTruthy();
		expect(queryByText(/ES_08101/)).toBeNull();
	});

	it('leaves the id standing for a town the layer does not hold', async () => {
		combatFeedService.receive(fight('unknown', 'ES_99999'));
		const { findByText } = render(CombatFeedModal);
		// Better than a blank: a fight did happen somewhere, and this is everything anybody
		// knows about where.
		expect(await findByText(/ES_99999/)).toBeTruthy();
	});

	/**
	 * A fight is two players in one sentence, and the sentence says which of them won.
	 *
	 * The announcement is worded from whoever reported it — `outcome` is *their* result — so
	 * a loss has to be turned round before it can be said: the side that held the town is the
	 * winner of it. Getting that backwards is the failure this pins, and it is one that reads
	 * perfectly well on screen while saying the opposite of what happened.
	 *
	 * The whole line is asserted rather than the two names being found in it, because what is
	 * being drawn here is a sentence: the order the names come in, the verb between them and
	 * the preposition before the town are the thing, and a test that only checked both names
	 * were present would pass on a line that said the loser won.
	 */
	it('says the winner first, whichever side reported the fight', async () => {
		// A loss: the reporter was beaten by the account holding the town.
		combatFeedService.receive(
			fight('lost', 'ES_08101', {
				outcome: 'lose',
				player: { id: 'p3', name: 'Berenguer', level: 2 },
				rival: RIVAL
			})
		);
		const { container } = render(CombatFeedModal);
		// Awaited, because the town's own name is fetched: until the layer lands the line is
		// lettered with the id, which is a different sentence.
		await waitFor(() =>
			expect(sentences(container)).toContain(
				"Ermessenda ha guanyat Berenguer a L'Hospitalet de Llobregat."
			)
		);
	});

	/**
	 * Each of the three names in the sentence is a way to go and look at what it names.
	 *
	 * An account opens its own public page; a town opens on the map, by the **id** it
	 * travelled with and never by the name being printed — a municipality's key in the map's
	 * region tree is that very id, so the link is right even on a line the layer never landed
	 * for, which is printing the id as its own label.
	 */
	it('makes each name in the sentence a way to what it names', async () => {
		combatFeedService.receive(
			fight('linked', 'ES_08101', {
				player: { id: 'p9', name: 'Ermengol', character_id: null, color: 'red', level: 3 },
				rival: RIVAL
			})
		);
		const { container } = render(CombatFeedModal);
		await waitFor(() => expect(lineOf(container, 'linked')).toBeTruthy());

		// The three of them, in the order the sentence puts them: winner, loser, town.
		const links = [...lineOf(container, 'linked').querySelectorAll('a')];
		expect(links.map((link) => [said(link), link.getAttribute('href')])).toEqual([
			['Ermengol', '/profile/p9'],
			['Ermessenda', `/profile/${RIVAL.id}`],
			["L'Hospitalet de Llobregat", '/?region=ES_08101']
		]);
		expect(links[0].className).toContain('text-primary');
		expect(links[2].className).toContain('text-secondary');
	});

	/** The house team is nobody's, so it is named and left at that: there is no page for a
	 * team that does not belong to an account. */
	it('does not send the house team anywhere', async () => {
		combatFeedService.receive(fight('nobody', 'ES_08101'));
		const { container } = render(CombatFeedModal);
		await waitFor(() => expect(lineOf(container, 'nobody')).toBeTruthy());

		const line = lineOf(container, 'nobody');
		expect(said(line)).toContain(ca.combat.feed.house);
		// Two links and not three: the winner and the town. Nothing points at the house.
		const links = [...line.querySelectorAll('a')].map(said);
		expect(links).toEqual(['Guifré', "L'Hospitalet de Llobregat"]);
	});

	/**
	 * A fight is two accounts, so the line is bracketed by the two of them.
	 *
	 * The winner heads it and whoever they were against closes it — which is the town's holder
	 * on a challenge won, and the reporter on one lost, since the announcement is worded from
	 * the reporter's side either way. The letters are read rather than the portraits, both
	 * sides here wearing none: what is being pinned is which face stands at which end, and a
	 * line that drew the same account twice would read as somebody having beaten themselves.
	 */
	it('stands a face at each end of the line: the winner and the side they beat', async () => {
		combatFeedService.receive(fight('faces', 'ES_08101', { rival: RIVAL }));
		combatFeedService.receive(
			fight('facesLost', 'ES_08101', {
				outcome: 'lose',
				player: { id: 'p5', name: 'Sibil·la', character_id: null, color: 'green', level: 5 },
				rival: RIVAL
			})
		);
		const { container } = render(CombatFeedModal);
		await waitFor(() => expect(lineOf(container, 'facesLost')).toBeTruthy());

		// Won: the reporter heads it, the holder closes it.
		expect(initials(container, 'faces')).toEqual(['G', 'E']);
		// Lost: the same fight from the other side, so the two ends swap.
		expect(initials(container, 'facesLost')).toEqual(['E', 'S']);
	});

	/**
	 * A town on its seeded house team has nobody on the other side, so nothing is drawn there.
	 *
	 * The far end is left empty rather than given a stand-in: a portrait in that corner reads
	 * as an account, and there is none. It is also the one case the head of the line falls back
	 * to the reporter with no win to their name, which is exactly where the same face could
	 * come up twice.
	 */
	it('leaves the far end of the line empty against the house team', async () => {
		combatFeedService.receive(fight('facesHouse', 'ES_08101'));
		const { container } = render(CombatFeedModal);
		await waitFor(() => expect(lineOf(container, 'facesHouse')).toBeTruthy());

		expect(initials(container, 'facesHouse')).toEqual(['G']);
	});

	/**
	 * When it happened stands over what happened, between the two faces.
	 *
	 * The day as well as the hour, since the tail a page opens on can reach back past
	 * midnight, and in a shape this app states rather than one the platform settles — the
	 * reader's locale would otherwise decide whether that is `10/08/26` or `8/10/26`, which
	 * are the same string read two ways. The moment is still local: the hour is the one the
	 * fight happened at where it is being read.
	 */
	it('heads the line with the day and hour the fight was filed', async () => {
		combatFeedService.receive(fight('stamped', 'ES_08101', { rival: RIVAL }));
		const { container } = render(CombatFeedModal);
		await waitFor(() => expect(lineOf(container, 'stamped')).toBeTruthy());

		const when = new Date('2026-08-10T17:04:00.000Z');
		const day = String(when.getDate()).padStart(2, '0');
		const month = String(when.getMonth() + 1).padStart(2, '0');
		// Everything the row is made of, in the order it stands: the winner's letter, the stamp,
		// the sentence, and the letter of the side they beat. The stamp being *before* the words
		// is the whole of why it moved off the end of the row.
		const line = [...blockOf(container, 'stamped').querySelectorAll('span')].map(said);
		expect(line[0]).toBe('G');
		expect(line[1]).toBe(`${day}/${month}/26 ${String(when.getHours()).padStart(2, '0')}:04`);
		expect(line[2]).toContain('Ermessenda');
		expect(line[3]).toBe('E');
	});

	/** Taking the town is a clause of the same sentence, not a badge beside it. */
	it('says the town changing hands in the sentence itself', async () => {
		combatFeedService.receive(fight('taken', 'ES_08101', { captured: true, rival: RIVAL }));
		const { container } = render(CombatFeedModal);
		await waitFor(() =>
			expect(sentences(container)).toContain(
				"Guifré ha guanyat Ermessenda i ha pres L'Hospitalet de Llobregat."
			)
		);
	});

	/**
	 * A town nobody holds is fought against the house, and the house is not a player.
	 *
	 * Nothing is invented for that side — no name, no level, no face — and it is not left as
	 * a hole in the middle of the sentence either: a fight did happen against somebody's
	 * three, they simply were not an account's.
	 */
	it('names the seeded side as the house team rather than a player', async () => {
		combatFeedService.receive(fight('house', 'ES_08101'));
		const { findAllByText } = render(CombatFeedModal);
		// All of them, because every fight the tests above left in the feed was over a town
		// nobody held either — which is the state this is about.
		expect(
			(await findAllByText(new RegExp(ca.combat.feed.house))).length
		).toBeGreaterThan(0);
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
		combatFeedService.receive(
			fight('opened', 'ES_08101', {
				player: { id: 'p4', name: 'Ramon', character_id: null, color: 'blue', level: 9 },
				rival: RIVAL
			})
		);
		const { container, findByText } = render(CombatFeedModal);

		// Closed until it is asked for: a sheet that opened every fight it holds would be a
		// wall of JSON where a feed was wanted.
		expect(container.querySelector('pre')).toBeNull();

		// The line's own press stands behind the reading rather than round it — a link cannot
		// live inside a button — so it is reached by the sentence it is named by, not by
		// walking up from a name.
		await findByText(/Ramon/);
		const line = container.querySelector('button[aria-labelledby="feed-said-opened"]');
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
			player: { name: 'Ramon', level: 9 },
			// The side that was fought, which is the whole of what the line could not have said
			// before the announcement carried it.
			rival: { name: 'Ermessenda', level: 7 }
		});

		// And it is a toggle: the same press puts it away again.
		await fireEvent.click(line!);
		expect(container.querySelector('pre')).toBeNull();
	});
});
