import { writable, type Readable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '$services/supabase.client';
import { combatFeedAdapter } from '$adapters/classes/combat-feed.adapter';
import {
	COMBAT_FEED_EVENT,
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
 * **It is pushed, never fetched.** There is no load here, no interval and no cursor: the
 * channel is a WebSocket that Supabase already holds open for the session, and a fight
 * lands on it the moment the server settles one. Which is also why the feed starts empty
 * every time — a broadcast has no history, so what this holds is what has happened since
 * the page opened, and it says exactly that.
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
	 * Subscribe to the channel, and hand back the way off it.
	 *
	 * Meant to be called from a component's `onMount` and returned from it, which is what
	 * makes the socket last exactly as long as the surface that wanted it. Calls nest: two
	 * listeners share one subscription, and it is dropped when the second of them lets go.
	 */
	listen(): () => void {
		this.listeners += 1;
		if (this.listeners === 1) this.subscribe();
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
	 * Take one announcement. Exported for the tests, and because what a message *is* is
	 * worth being able to state without a socket in the way.
	 */
	receive(payload: unknown): void {
		const entry = combatFeedAdapter.fromBroadcast(payload);
		if (!entry || this.heard.has(entry.id)) return;
		this.heard.add(entry.id);
		this.entriesStore.update((current) => [entry, ...current].slice(0, COMBAT_FEED_LIMIT));
		// Only while nobody is looking. A fight that lands with the sheet already up has
		// been read the moment it is drawn, so counting it would leave a number standing
		// over a list the player is looking straight at.
		if (!this.showing) this.unreadStore.update((count) => count + 1);
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
