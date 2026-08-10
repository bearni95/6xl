import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { combatFeedService } from '$services/combatFeed.service';
import { COMBAT_FEED_LIMIT } from '$types/combat-feed.type';

/** One announcement, distinguished by the record it names — which is the whole of what
 * makes two of them two fights. */
const fight = (id: string, town = 'ES_08019') => ({
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
	player: { id: 'p1', name: 'Bernat', character_id: null, color: 'red', level: 2 }
});

const entries = combatFeedService.entries;
const unread = combatFeedService.unread;
const open = combatFeedService.open;

/** The service is the app's one feed and holds what it has heard, so each test opens the
 * sheet (which is what marks everything read) and closes it again to start from nothing
 * counted. */
beforeEach(() => {
	combatFeedService.openFeed();
	combatFeedService.closeFeed();
});

describe('combatFeedService — what arrives on the channel', () => {
	it('stacks fights newest first and counts what has not been read', () => {
		const before = get(entries).length;
		combatFeedService.receive(fight('stack-1'));
		combatFeedService.receive(fight('stack-2'));

		expect(get(entries).length).toBe(before + 2);
		expect(get(entries)[0].id).toBe('stack-2');
		expect(get(unread)).toBe(2);
	});

	it('hears one fight once, however many times it is announced', () => {
		const before = get(entries).length;
		combatFeedService.receive(fight('twice'));
		combatFeedService.receive(fight('twice'));
		expect(get(entries).length).toBe(before + 1);
		expect(get(unread)).toBe(1);
	});

	it('drops a message that is not a fight', () => {
		const before = get(entries).length;
		combatFeedService.receive({ outcome: 'win' });
		combatFeedService.receive(null);
		expect(get(entries).length).toBe(before);
		expect(get(unread)).toBe(0);
	});

	it('counts nothing while the sheet is up, since what is drawn has been read', () => {
		combatFeedService.receive(fight('unread-1'));
		expect(get(unread)).toBe(1);

		combatFeedService.openFeed();
		expect(get(open)).toBe(true);
		// Reading them is what clears the count, and a fight landing on a sheet somebody is
		// looking at is a fight they have seen.
		expect(get(unread)).toBe(0);
		combatFeedService.receive(fight('unread-2'));
		expect(get(unread)).toBe(0);

		combatFeedService.closeFeed();
		combatFeedService.receive(fight('unread-3'));
		expect(get(unread)).toBe(1);
	});

	it('keeps a running feed rather than an archive', () => {
		for (let index = 0; index < COMBAT_FEED_LIMIT + 10; index++) {
			combatFeedService.receive(fight(`flood-${index}`));
		}
		expect(get(entries).length).toBe(COMBAT_FEED_LIMIT);
		// The newest are the ones kept.
		expect(get(entries)[0].id).toBe(`flood-${COMBAT_FEED_LIMIT + 9}`);
	});

	it('lets go of the channel only when the last listener does', () => {
		// Supabase is unconfigured under test, so no socket is opened — what is being held to
		// here is the nesting, which is what keeps an arena remounted over one page life from
		// leaving a subscription behind or opening a second one.
		const first = combatFeedService.listen();
		const second = combatFeedService.listen();
		expect(() => {
			first();
			first();
			second();
		}).not.toThrow();
	});
});
