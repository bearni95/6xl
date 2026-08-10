/**
 * The game's one open channel: every fight that ends, anywhere, as it ends.
 *
 * A finished fight is reported to `award_combat_exp`, which writes the row, pays the
 * experience and settles the town (see `combat.type` and the SQL behind it). The last
 * thing it does is *announce* it — `realtime.send` onto {@link COMBAT_FEED_TOPIC}, one
 * constant topic for the whole project, forwarded to every subscriber over the WebSocket
 * Supabase Realtime already holds open. So a client learns about other people's fights by
 * being told, never by asking: nothing here polls, and there is no table to read.
 *
 * The channel is **public** (`private => false` at the send). What travels on it is what
 * `municipality_holders_public` already publishes to anyone who opens the map — a chosen
 * name, the avatar worn, a level — plus what the fight did to a town. Nothing about the
 * account behind it and nothing about the cards fielded.
 *
 * A broadcast carries **no history** of its own: it is heard by whoever is listening at the
 * moment it is made, so a client that subscribes at noon would know nothing of the morning.
 * What answers that is {@link COMBAT_FEED_HISTORY} — the newest few fights, read once from
 * `recent_combat_feed` as the channel is subscribed to, in exactly the shape the channel
 * sends. So a page opens on what has just been happening and then hears the rest as it
 * happens, and the two are the same kind of thing all the way down: one shape, one adapter,
 * one list, and a fight that arrives both ways is recognised by the record id it carries.
 */
import type { SpawnColor } from './character-spawn.type';
import type { CombatOutcome } from './combat.type';

/** The topic every game end in the project lands on. One channel, so one subscription
 * hears the lot. */
export const COMBAT_FEED_TOPIC = 'combat-results';

/** The broadcast event a finished fight is sent as. */
export const COMBAT_FEED_EVENT = 'fight';

/**
 * How many fights are kept. The feed is a running account of what is happening while a
 * page is open, not an archive — the archive is `combat_results`, which is the server's —
 * so the oldest fall off the end rather than accumulating for as long as a tab lives.
 */
export const COMBAT_FEED_LIMIT = 50;

/**
 * How many fights a page is handed to start from — the tail `recent_combat_feed` keeps, and
 * the whole of what somebody arriving mid-afternoon knows about the morning.
 *
 * Ten, and the server caps it there rather than trusting the number: what this feed is for
 * is what is happening, and a client that asked for a hundred would be asking for a log.
 * Well under {@link COMBAT_FEED_LIMIT}, so a page opens with room to hear plenty more
 * before the oldest of them starts falling off.
 */
export const COMBAT_FEED_HISTORY = 10;

/** Whoever fought it, exactly as the map says a player: the name they chose, the avatar
 * they wear and the level the fight left them on. Every field may be missing — an account
 * that has never named itself has no name, and one that has never picked a face has no
 * avatar. */
export interface CombatFeedPlayer {
	id: string | null;
	name: string | null;
	characterId: string | null;
	color: SpawnColor | null;
	level: number;
}

/** One finished fight as it comes off the channel. */
export interface CombatFeedEntry {
	/** The `combat_results` row it was filed as. The feed keys on it, so one fight heard
	 * twice is one fight. */
	id: string;
	/** When the server filed it, ISO-8601. Not when this client heard it: two players
	 * watching the same feed order it the same way. */
	at: string;
	outcome: CombatOutcome;
	/** What it paid, and what it was paid on. */
	exp: number;
	survivors: number;
	fielded: number;
	rivals: number;
	/** The town it was fought over, as a geojson feature id — the feed resolves the name
	 * itself, off the same layer the map draws. */
	locationId: string;
	/** Whether the town changed hands on it. */
	captured: boolean;
	/** Whether it was fought against a generation that had already been superseded, in
	 * which case it banked no ground whatever it was. */
	stale: boolean;
	player: CombatFeedPlayer;
}
