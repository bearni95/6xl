import { writable, type Readable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '$services/supabase.client';
import { combatFeedAdapter } from '$adapters/classes/combat-feed.adapter';
import { locationAdapter } from '$adapters/classes/location.adapter';
import {
	COMBAT_FEED_EVENT,
	COMBAT_FEED_HISTORY,
	COMBAT_FEED_LIMIT,
	COMBAT_FEED_TOPIC,
	type CombatFeedEntry
} from '$types/combat-feed.type';

/**
 * Everybody else's fights, as they finish.
 *
 * One Supabase Realtime channel carries every game end in the project (see
 * `combat-feed.type`), and this is the arena's ear on it: {@link listen} opens the socket
 * subscription, each announcement that arrives is read into an entry and stacked on
 * {@link entries}, and {@link unread} counts the ones nobody has looked at yet — which is
 * the number on the button in the head of the fight.
 *
 * **It is pushed, never polled.** There is no interval here and no cursor: the channel is a
 * WebSocket that Supabase already holds open for the session, and a fight lands on it the
 * moment the server settles one.
 *
 * There is exactly one read, and it happens once, as the socket opens: the tail the server
 * keeps ({@link COMBAT_FEED_HISTORY}), so a page that opens at five past does not have to
 * pretend the game began when it did. It comes back in the same shape the channel sends, so
 * it goes through the same adapter into the same list — and a fight that arrives both ways
 * is the one fight its record id says it is. What is read is **not news**: it happened
 * before anybody was looking, so it fills the sheet without ever putting a number on the
 * button. Only what is heard live does that.
 *
 * A player's own fight comes back down the channel like anybody else's: it is announced by
 * the server, not by the tab that reported it, so there is one account of a fight and this
 * is it. The entry names its player, so a surface that wants to tell it apart can.
 *
 * Everything degrades to a feed that never fills when Supabase is unconfigured — auth-less
 * local dev fights alone and hears nothing, rather than failing to draw an arena.
 */
class CombatFeedService {
	private readonly entriesStore = writable<CombatFeedEntry[]>([]);
	private readonly unreadStore = writable(0);
	private readonly openStore = writable(false);
	/** What every town on the map is called, by geojson id — null until the layer lands, and
	 * for good if it cannot be had. */
	private readonly namesStore = writable<ReadonlyMap<string, string> | null>(null);
	/** The layer, asked for once per page life however many times anybody listens. */
	private townNames: Promise<ReadonlyMap<string, string> | null> | null = null;

	/** The live subscription, while anybody is listening. */
	private channel: RealtimeChannel | null = null;
	/** How many surfaces have asked to listen. The socket is opened on the first and
	 * closed after the last, so an arena mounted twice over one page life does not leave a
	 * channel behind — or open a second one delivering every fight twice. */
	private listeners = 0;
	/** Fights already stacked, by record id: one fight heard twice is one fight. Kept as a
	 * set rather than searched for in the list, since the list is trimmed and a re-heard
	 * announcement of a fight that has fallen off the end is still not news. */
	private readonly heard = new Set<string>();
	/** Whether the sheet is up, beside the store that says so — what arrives while it is
	 * being read has been read, and a plain flag is what the receiving path can ask. */
	private showing = false;

	/** The fights heard on this page, newest first. */
	get entries(): Readable<CombatFeedEntry[]> {
		return this.entriesStore;
	}

	/** How many have arrived since they were last looked at. */
	get unread(): Readable<number> {
		return this.unreadStore;
	}

	/** Whether the sheet listing them is up. */
	get open(): Readable<boolean> {
		return this.openStore;
	}

	/**
	 * What the towns in the feed are called.
	 *
	 * An announcement names its town by geojson id and can do nothing else — no table on the
	 * server holds a place name, and the only thing that does is the layer the map is drawn
	 * from. So the feed reads that layer itself, and it reads it when the **first fight
	 * arrives** rather than when the sheet is opened: it is two megabytes of geometry for the
	 * sake of 1,790 names, and asked for at the press it would leave every line of the sheet
	 * lettered with an id for as long as it took to arrive. Asked for at the first
	 * announcement, it is in flight before there is any way to raise the sheet at all — the
	 * button that raises it is not drawn until a fight has landed either.
	 *
	 * It used to be asked for as the channel was subscribed to, which was the same moment
	 * while an arena was the only thing listening. The listening is the app's now (see
	 * `+layout.svelte`), so that would have meant every visit pulling the layer down before
	 * anything had happened — on pages that draw no map and may never show a line.
	 */
	get townNamesById(): Readable<ReadonlyMap<string, string> | null> {
		return this.namesStore;
	}

	/**
	 * Subscribe to the channel, and hand back the way off it.
	 *
	 * Meant to be called from a component's `onMount` and returned from it, which is what
	 * makes the socket last exactly as long as the surface that wanted it. Calls nest: two
	 * listeners share one subscription, and it is dropped when the second of them lets go.
	 */
	listen(): () => void {
		this.listeners += 1;
		if (this.listeners === 1) {
			this.subscribe();
			// The tail first, so a page opens on what has just been happening. Subscribed
			// before it is asked for, which is the only order that loses nothing: a fight
			// settled while the read is in flight is heard on the socket, and the read cannot
			// hand back a fight the socket has already stacked — both are the same rows and
			// both are keyed on the record id.
			void this.loadHistory();
		}
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.listeners = Math.max(0, this.listeners - 1);
			if (this.listeners === 0) this.unsubscribe();
		};
	}

	/** Raise the sheet, which is what reading them is: the counter goes back to nothing. */
	openFeed(): void {
		this.showing = true;
		this.unreadStore.set(0);
		this.openStore.set(true);
	}

	closeFeed(): void {
		this.showing = false;
		this.openStore.set(false);
	}

	/**
	 * Take one announcement off the channel: news, and counted as such. Exported for the
	 * tests, and because what a message *is* is worth being able to state without a socket
	 * in the way.
	 */
	receive(payload: unknown): void {
		this.stack(payload, true);
	}

	/**
	 * Take the tail the server keeps. These happened before anybody here was listening, so
	 * they fill the sheet and never the counter: a page that opened on ten fights it did not
	 * see happen has nothing to be told about.
	 */
	receiveHistory(payloads: readonly unknown[]): void {
		for (const payload of payloads) this.stack(payload, false);
	}

	/**
	 * Put one fight in the list, wherever its own hour puts it.
	 *
	 * Ordered by when the *server* filed it rather than by when this client heard it, and
	 * sorted rather than pushed on the front, because the two ways in do not arrive in
	 * order: the read that fills the page is a moment behind the socket that is already
	 * running, so a fight heard live can land before the ten older ones it belongs above.
	 * Everybody watching then reads the same list in the same order, whenever each of them
	 * happened to arrive.
	 */
	private stack(payload: unknown, news: boolean): void {
		const entry = combatFeedAdapter.fromBroadcast(payload);
		// One fight is one fight, however it got here — heard live, read back, or both.
		if (!entry || this.heard.has(entry.id)) return;
		this.heard.add(entry.id);
		// The names for it, once: the layer is asked for by the first fight to arrive rather
		// than by the socket opening, and memoised, so a session that hears nothing never pulls
		// two megabytes of geometry down (see `townNamesById`).
		void this.loadTownNames();
		this.entriesStore.update((current) =>
			[entry, ...current]
				.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
				.slice(0, COMBAT_FEED_LIMIT)
		);
		// Only what is news, and only while nobody is looking. A fight that lands with the
		// sheet already up has been read the moment it is drawn, so counting it would leave a
		// number standing over a list the player is looking straight at.
		if (news && !this.showing) this.unreadStore.update((count) => count + 1);
	}

	/**
	 * Read the tail once, as the channel opens. A refusal is silence and nothing else: the
	 * feed simply starts from whatever it hears next, which is what it did before there was
	 * a tail at all.
	 */
	private async loadHistory(): Promise<void> {
		if (!isSupabaseConfigured()) return;
		try {
			const supabase = getSupabaseClient();
			const { data, error } = await supabase.rpc('recent_combat_feed', {
				p_limit: COMBAT_FEED_HISTORY
			});
			if (error) throw error;
			this.receiveHistory(Array.isArray(data) ? data : []);
		} catch (error) {
			console.error('Combat feed history refused', error);
		}
	}

	/**
	 * Read the municipality layer for its names, once. A layer that will not load leaves the
	 * feed naming towns by id — which is what the map itself would be left with — and clears
	 * the attempt, so the next fight to arrive is free to ask again.
	 */
	private loadTownNames(): Promise<ReadonlyMap<string, string> | null> {
		this.townNames ??= fetch('/data/geo/municipis.json')
			.then((response) => response.json() as Promise<GeoJSON.FeatureCollection>)
			.then((municipalities) => {
				const names = locationAdapter.municipalityNames(municipalities);
				this.namesStore.set(names);
				return names as ReadonlyMap<string, string>;
			})
			.catch(() => {
				this.townNames = null;
				return null;
			});
		return this.townNames;
	}

	private subscribe(): void {
		if (this.channel || !isSupabaseConfigured()) return;
		const supabase = getSupabaseClient();
		this.channel = supabase
			.channel(COMBAT_FEED_TOPIC)
			.on('broadcast', { event: COMBAT_FEED_EVENT }, (message) => this.receive(message.payload))
			.subscribe();
	}

	private unsubscribe(): void {
		const channel = this.channel;
		this.channel = null;
		if (!channel) return;
		// The client is shared, so the channel is removed from it rather than merely
		// unsubscribed: a channel left on the client is one the next subscribe would find
		// already there and refuse to open again.
		void getSupabaseClient().removeChannel(channel);
	}
}

export const combatFeedService = new CombatFeedService();
