import type { SpawnColor } from './character-spawn.type';
import type { ID } from './core.type';

/** Authentication lifecycle state for the current visitor. */
export enum AuthStatus {
	/** Still restoring the session from storage / resolving the magic link. */
	Loading = 'loading',
	/** No active session — the visitor is a guest. */
	SignedOut = 'signed-out',
	/** An active session exists. */
	SignedIn = 'signed-in'
}

/**
 * The shortest password the game will send to Supabase on a sign-up.
 *
 * It is asked for here rather than left to the server: Supabase's own floor is a
 * project setting (six characters out of the box), and a rule the player only meets
 * by being turned down is a rule they were never told. Eight is longer than that
 * floor, so a password this accepts is one Supabase accepts — and the check is only
 * ever applied to a password being *created*. Signing in sends whatever was typed:
 * an account made under an older rule is not a reason to lock its owner out.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The shortest and longest a username may be, and the whole of what one may be made
 * of: ASCII letters, digits and the underscore, and nothing else.
 *
 * It is stated here because three things have to agree on it and only one of them can
 * be argued with — `set_player_username` in `packages/backend/supabase/player_profiles.sql`
 * is what actually decides, the two screens that take a name check the same rule before
 * sending so a refusal is not the first the player hears of it, and the input's own
 * `maxlength` stops the field at {@link USERNAME_MAX_LENGTH} rather than letting a name
 * be typed that could only be turned down.
 *
 * Deliberately no accents, spaces or punctuation, though the game is Catalan and the old
 * rule allowed all three: a name is an identifier here — it is what one player is called
 * by another and what the town plates print — and letters that look alike unaccented are
 * how one player comes to be mistaken for another.
 */
export const USERNAME_MIN_LENGTH = 3;

/** @see USERNAME_MIN_LENGTH */
export const USERNAME_MAX_LENGTH = 32;

/**
 * The whole of a valid username, anchored so it matches nothing else. No `g` flag: a
 * global regex carries `lastIndex` between `test` calls and would answer differently on
 * every other keystroke.
 *
 * @see USERNAME_MIN_LENGTH
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Why a set of credentials was turned down, in the terms a screen can word — the whole
 * of what the sign-in form is ever told, and the whole of what it has to be able to say.
 *
 * A list rather than a bare union so it can be walked: the form looks its message up by
 * reason (`profile.password.rejected.<reason>`), and a reason with no message would print
 * its own key at somebody who has just failed to get in. A test holds the catalogue to
 * this.
 *
 * "No such account" and "wrong password" are deliberately one reason: Supabase answers
 * both with the same error precisely so a form cannot be used to find out who has an
 * account here, and taking them apart on screen would undo that.
 */
export const CREDENTIAL_REJECTIONS = [
	/** The address and password do not name an account. */
	'invalid',
	/** The account exists but its address has never been confirmed. */
	'unconfirmed',
	/** Supabase would not take that password: too short, or too easily guessed. */
	'weak',
	/** Not an address Supabase will accept. */
	'email',
	/** Too many attempts, or too many mails, in too short a time. */
	'rate',
	/** The project is not taking new accounts at all. */
	'closed'
] as const;

/** One of {@link CREDENTIAL_REJECTIONS}. */
export type CredentialRejection = (typeof CREDENTIAL_REJECTIONS)[number];

/**
 * Third-party identity providers the game can sign in with, alongside the email
 * address and password. The values are Supabase's own provider ids — they go
 * straight into `signInWithOAuth({ provider })` — and each one must also be
 * enabled, with its client id/secret, in the Supabase dashboard.
 */
export enum OAuthProvider {
	Google = 'google',
	Discord = 'discord'
}

/** The providers offered on the sign-in panel, in the order they are shown. */
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
	OAuthProvider.Google,
	OAuthProvider.Discord
];

/**
 * How each provider is named on screen. Brand names are not translated — they
 * read the same in every locale.
 */
export const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
	[OAuthProvider.Google]: 'Google',
	[OAuthProvider.Discord]: 'Discord'
};

/**
 * The whole of what a player is read by on screen: the picture they wear, the
 * name they chose, and the experience their level is worked out from — the four
 * columns of a `player_profiles` row that say who is playing rather than how they
 * got in.
 *
 * It is a type of its own because it is the part of an account that is **not**
 * private. The plate at the map's corner draws exactly this of the signed-in
 * player, and the public profile page draws exactly this of somebody else (see
 * {@link PublicProfile}) — so the component that draws it takes this and not a
 * whole {@link Profile}, and cannot print an address it was never handed.
 */
export interface PlayerPlate {
	/**
	 * The username the player typed, or `null` when they never have — which is a
	 * resting state, not a gap for the app to fill in. It is stored in exactly one
	 * place, `player_profiles.username`, unique across the game and writable only
	 * through the `set_player_username` RPC; nothing about how the account signs in
	 * (the name Google or Discord supplies, the email address) is ever written to it
	 * or shown in its place. Clearing it returns the account to nameless.
	 *
	 * This is the only name a Profile carries — where a screen needs something to
	 * print for a nameless account, that placeholder is the screen's own wording and
	 * is never stored.
	 */
	username: string | null;
	/**
	 * Total accumulated experience, from the Supabase `player_profiles` table.
	 * Starts at 0 for a fresh account and is only ever increased by winning fights
	 * (server-side, via the `award_combat_exp` RPC, which is the sole writer and
	 * decides the amount itself). Defaults to 0 until the value has loaded.
	 */
	exp: number;
	/**
	 * The character half of the avatar the player wears, from the Supabase
	 * `player_profiles` table, or `null` for the initial-letter avatar every
	 * account starts on. Always read with {@link avatarColor}: an avatar is a
	 * (character, colour) pair the player owns — a `player_avatars` row — and one
	 * half of it names nothing on its own.
	 *
	 * The artwork is not stored: it is the definition's own face, authored in the
	 * admin, so the avatar follows whatever is cropped there. Set through the
	 * `set_player_avatar` RPC, which refuses a pair the caller does not own.
	 */
	avatarCharacterId: string | null;
	/**
	 * The colour half of the worn avatar — the colour the portrait is printed in,
	 * and what the picture stands on. `null` alongside a null
	 * {@link avatarCharacterId}; the two are only ever set and cleared together.
	 */
	avatarColor: SpawnColor | null;
}

/** Normalised view model of the signed-in account, decoupled from Supabase. */
export interface Profile extends PlayerPlate {
	id: ID;
	email: string;
	/** ISO timestamp the account was created, if known. */
	createdAt: string | null;
	/** ISO timestamp of the most recent sign-in, if known. */
	lastSignInAt: string | null;
	/**
	 * The third-party identities linked to the account, in the order Supabase
	 * reports them. Empty for an account that only ever used the email link —
	 * Supabase's own `email` identity is not a social provider and is dropped.
	 */
	providers: OAuthProvider[];
	/**
	 * The player's level, derived from {@link exp} via the D&D 5e experience table
	 * (`levelForExp`). Not stored — always computed from {@link exp}.
	 */
	level: number;
}

/**
 * Somebody else's account, as the whole world may see it — what the public
 * profile page is built from.
 *
 * It is deliberately the plate and nothing more. The address an account signs in
 * with, the providers behind it, when it was last seen: none of that is anybody
 * else's business, and none of it is reachable — the page reads the
 * `player_profiles_public` view, which selects these columns alone (see
 * `packages/backend/supabase/player_profiles.sql`). The experience *is* here,
 * which is the one thing this page publishes that nothing else did: a level is
 * what a player is ranked by, and a profile that would not say it is not a
 * profile.
 */
export interface PublicProfile extends PlayerPlate {
	/** The account's Supabase user id — what `/profile/[id]` names it by. */
	id: ID;
	/** Derived from {@link exp}, exactly as {@link Profile.level} is. */
	level: number;
	/** ISO timestamp the `player_profiles` row was created, if known. */
	createdAt: string | null;
}

/** One raw `player_profiles_public` row, as Supabase returns it. */
export interface PublicProfileRow {
	user_id: string;
	username: string | null;
	/** `bigint`, so Postgres serialises it as a string over the wire. */
	exp: number | string | null;
	avatar_character_id: string | null;
	avatar_color: string | null;
	created_at: string | null;
}
