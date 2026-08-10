import { writable, type Readable } from 'svelte/store';
import { characters } from '@3xl/data';
import { getSupabaseClient } from '$services/supabase.client';
import { spawnAdapter } from '$adapters/classes/spawn.adapter';
import { playerAvatarAdapter } from '$adapters/classes/player-avatar.adapter';
import { claimedBoxKey } from '$utils/spawn/claimed-box';
import { DEFAULT_RARITY } from '$types/character-template.type';
import type {
	CharacterSpawn,
	CharacterSpawnRow,
	ClaimableShow
} from '$types/character-spawn.type';
import type { PlayerAvatar, PlayerAvatarRow } from '$types/player-avatar.type';

/** How many cards a single booster pack contains. Mirrors `claim_booster`'s roll count. */
export const BOOSTER_SIZE = 5;

/**
 * Everything one opened booster box gave: its {@link BOOSTER_SIZE} cards, and the
 * single avatar that came with them.
 *
 * The avatar is `null` only when the server could not deal one at all (an old
 * deployment of the RPC); a box that opens deals one, and one the player already
 * holds comes back as the row they hold rather than as nothing.
 */
export interface BoosterOpening {
	/** The cards the pack rolled, in pull order. */
	spawns: CharacterSpawn[];
	/** The avatar the pack granted — a character on its show, in one of its colours. */
	avatar: PlayerAvatar | null;
}

/**
 * Player-facing spawn state, backed by Supabase. Talks to Postgres directly from
 * the browser with the anon key (RLS-gated), the same pure-SPA pattern as
 * {@link authService}: it reads the show → character assignments synced by the
 * admin, rolls a random character for a chosen show, and persists the claim as a
 * `character_spawns` row owned by the signed-in user.
 *
 * Rendering data (labels, sprites) never touches Supabase — a spawn stores only
 * the character id, which resolves back into the local @3xl/data registry.
 */
class SpawnService {
	private spawnsStore = writable<CharacterSpawn[]>([]);
	private claimedBoxesStore = writable<ReadonlySet<string>>(new Set());

	/** Ids of characters that exist in the local registry, so spawns can render. */
	private renderableIds = new Set(characters.map((character) => character.id));

	/** Whose cards are in the store, or null while it holds nobody's. */
	private loadedFor: string | null = null;

	/**
	 * Whether this player's cards are already in the store.
	 *
	 * A surface that needs them can then draw at once instead of standing behind a round
	 * trip for a set it is already holding — the map loads them when the player signs in,
	 * and the arena, the roster and the collection all used to re-read them from scratch
	 * on the way up. The read still happens; it just stops being the thing on screen.
	 *
	 * Says nothing about the cards being *fresh*: it is an answer about what can be drawn
	 * now, and the caller is expected to refresh behind whatever it draws.
	 */
	hasSpawns(userId: string | null): boolean {
		return !!userId && this.loadedFor === userId;
	}

	/** The signed-in player's spawns, newest first. */
	get spawns(): Readable<CharacterSpawn[]> {
		return this.spawnsStore;
	}

	/**
	 * Every booster box this player has already taken, as {@link claimedBoxKey}
	 * triples — a town, a year and a stock. A town deals two boxes a year and no
	 * more (see {@link claimBooster}), so this set is the whole of what is spent:
	 * anything drawing a box asks it whether that box is still there to open.
	 *
	 * Empty while signed out, and until {@link loadClaimedBoxes} lands — a box that
	 * looks openable and is refused is a better wrong answer than one greyed out
	 * because a read had not returned.
	 */
	get claimedBoxes(): Readable<ReadonlySet<string>> {
		return this.claimedBoxesStore;
	}

	/**
	 * Load every show that has at least one renderable character assigned, so the
	 * claim panel can offer a show to roll from. Character ids not present in the
	 * local registry are dropped (they can't be rendered), and empty shows with
	 * nothing left are omitted.
	 */
	async loadShows(): Promise<ClaimableShow[]> {
		const supabase = getSupabaseClient();
		const [showsRes, assignmentsRes] = await Promise.all([
			supabase.from('show_templates').select('id, name'),
			supabase.from('show_characters').select('show_id, character_id')
		]);
		if (showsRes.error) throw showsRes.error;
		if (assignmentsRes.error) throw assignmentsRes.error;

		const byShow = new Map<number, string[]>();
		for (const row of assignmentsRes.data ?? []) {
			if (!this.renderableIds.has(row.character_id)) continue;
			const showId = Number(row.show_id);
			const ids = byShow.get(showId) ?? [];
			ids.push(row.character_id);
			byShow.set(showId, ids);
		}

		return (showsRes.data ?? [])
			.map((show) => ({
				id: Number(show.id),
				name: show.name as string,
				characterIds: byShow.get(Number(show.id)) ?? []
			}))
			.filter((show) => show.characterIds.length > 0)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Load every character's rarity tier from `character_templates`, so the claim
	 * result and roster can label a spawn with its rarity. Characters absent from
	 * the table (or with a null tier) read as {@link DEFAULT_RARITY}. The roll
	 * itself no longer consults this — `claim_booster` weights by rarity in the DB.
	 */
	async loadRarities(): Promise<Map<string, number>> {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.from('character_templates').select('id, rarity');
		if (error) throw error;

		const byCharacter = new Map<string, number>();
		for (const row of data ?? []) {
			const rarity = Number(row.rarity);
			byCharacter.set(row.id as string, Number.isFinite(rarity) ? rarity : DEFAULT_RARITY);
		}
		return byCharacter;
	}

	/**
	 * Map each character id to the Supabase shows it belongs to (via `show_characters`
	 * → `show_templates`), so the roster can say which show(s) its character is
	 * actually related to rather than the show it happened to be rolled from. Both
	 * halves of a show come back: the name the roster's filter lists it under, and the
	 * id whose glyph a statue stands on. Character ids may map to several shows; the
	 * shows are de-duplicated and sorted by name.
	 */
	async loadCharacterShows(): Promise<Map<string, { id: number; name: string }[]>> {
		const supabase = getSupabaseClient();
		const [showsRes, assignmentsRes] = await Promise.all([
			supabase.from('show_templates').select('id, name'),
			supabase.from('show_characters').select('show_id, character_id')
		]);
		if (showsRes.error) throw showsRes.error;
		if (assignmentsRes.error) throw assignmentsRes.error;

		const showById = new Map<number, { id: number; name: string }>(
			(showsRes.data ?? []).map((show) => [
				Number(show.id),
				{ id: Number(show.id), name: show.name as string }
			])
		);

		const byCharacter = new Map<string, { id: number; name: string }[]>();
		for (const row of assignmentsRes.data ?? []) {
			const show = showById.get(Number(row.show_id));
			if (!show) continue;
			const shows = byCharacter.get(row.character_id) ?? [];
			if (!shows.some((entry) => entry.id === show.id)) shows.push(show);
			byCharacter.set(row.character_id, shows);
		}
		for (const shows of byCharacter.values()) shows.sort((a, b) => a.name.localeCompare(b.name));
		return byCharacter;
	}

	/**
	 * Map every show id to its display name (from `show_templates`), so a booster —
	 * which stores only the `showId` it was rolled from — can be labelled with the
	 * show it came from. Unlike {@link loadShows} this keeps every show, including
	 * ones with no renderable characters left.
	 */
	async loadShowNames(): Promise<Map<number, string>> {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.from('show_templates').select('id, name');
		if (error) throw error;
		return new Map((data ?? []).map((show) => [Number(show.id), show.name as string]));
	}

	/**
	 * Load the signed-in player's spawns into the store, newest first.
	 *
	 * `team_slot` comes with them: the player's team is not a list kept anywhere,
	 * it is the three of these cards that hold a slot, so loading the roster loads
	 * the team with it (see {@link setTeam} and `teamService`).
	 */
	async loadSpawns(userId: string): Promise<CharacterSpawn[]> {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase
			.from('character_spawns')
			.select('id, user_id, character_id, show_id, location_id, color, box, team_slot, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
		if (error) throw error;

		const spawns = (data as CharacterSpawnRow[]).map((row) => spawnAdapter.fromRow(row));
		this.spawnsStore.set(spawns);
		this.loadedFor = userId;
		return spawns;
	}

	/**
	 * Open a booster box for `locationId` (a geojson municipality feature id),
	 * rolling from `showId`'s roster (or every show when `null`). The roll and both
	 * rules are enforced server-side by the `claim_booster` security-definer RPC —
	 * the frontend can no longer insert spawns directly:
	 *
	 *   - the town must be celebrating a festa major inside the booster window
	 *     (three days back through four ahead, Europe/Madrid);
	 *   - and the player must not already hold that town's box for that festa's year
	 *     and stock. A town deals two a year — the white one on the day, the black
	 *     one around it — and neither twice.
	 *
	 * The RPC rolls {@link BOOSTER_SIZE} cards — each weighted by rarity (every
	 * higher tier 2× rarer), plus a colour out of the three its box holds — and one
	 * **avatar**, drawn from those same two possibilities: a character on the box's
	 * show, in one of the box's three colours. Which box that is, the server decides
	 * for itself from the town's festivity dates: white (purple/green/orange) for a
	 * festa on the day, black (red/blue/yellow) for one past or still coming, stamped
	 * on every card it inserts and on the claim it spends. On a rejected claim it
	 * throws with a message describing why (already opened, wrong day, …).
	 *
	 * The new spawns are prepended to the store and returned in pull order; the
	 * avatar is handed back rather than stored here — {@link avatarService} owns
	 * that collection, and the caller that shows the open is the one that tells it.
	 *
	 * What it does not hand back is the claim it wrote: which year the box belonged
	 * to is the server's reading of the festivity calendar, so the set of spent boxes
	 * is re-read rather than guessed at (see {@link loadClaimedBoxes}).
	 */
	async claimBooster(showId: number | null, locationId: string): Promise<BoosterOpening> {
		if (!locationId) {
			throw new Error('Claim your location before spawning a character.');
		}
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.rpc('claim_booster', {
			p_show_id: showId,
			p_location_id: locationId
		});
		if (error) throw error;

		// One pack is one object, not a row set: the cards and the avatar are two
		// different shapes, so the RPC answers in jsonb and this reads both halves out
		// of it. An answer missing either half is an old deployment of the RPC, which
		// reads as no cards / no avatar rather than as a crash.
		const payload = (data ?? {}) as { spawns?: CharacterSpawnRow[]; avatar?: PlayerAvatarRow };
		const spawns = (payload.spawns ?? []).map((row) => spawnAdapter.fromRow(row));
		this.spawnsStore.update((current) => [...spawns, ...current]);
		return {
			spawns,
			avatar: payload.avatar ? playerAvatarAdapter.fromRow(payload.avatar) : null
		};
	}

	/**
	 * Load every booster box this player has already taken into {@link claimedBoxes}
	 * — their own `booster_claims` rows, which is all the RLS policy on that table
	 * lets anybody read. Called when a player is known and again after each open,
	 * since the year a box was filed under is the server's reading of the calendar.
	 *
	 * Read whole rather than narrowed to the window: a player's claims are two a town
	 * a year at the very most, and the alternative is a query rebuilt every time the
	 * window moves. Failures leave the set as it was — the server refuses a second
	 * open either way.
	 */
	async loadClaimedBoxes(userId: string): Promise<ReadonlySet<string>> {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase
			.from('booster_claims')
			.select('location_id, year, box')
			.eq('user_id', userId);
		if (error) throw error;

		const claimed = new Set(
			(data ?? []).map((row) =>
				claimedBoxKey(row.location_id as string, Number(row.year), row.box as string)
			)
		);
		this.claimedBoxesStore.set(claimed);
		return claimed;
	}

	/** Drop the remembered claims — a player signing out takes their boxes with them. */
	forgetClaimedBoxes(): void {
		this.claimedBoxesStore.set(new Set());
	}

	/**
	 * Field a team: `slots` is the line-up in fielded order (the lead first), as
	 * spawn ids with `null` for an empty slot, and it replaces whatever the player
	 * had — one team per player is the shape of the table, so saving a line-up is
	 * saving THE line-up.
	 *
	 * The `set_team` security-definer RPC is the only path to the `team_slot`
	 * column (the table takes no client update at all) and it is what decides
	 * whether the line-up is legal: the caller's own cards, each named once, every
	 * one of them sharing a colour with the lead. The store is moved first so the
	 * roster answers the tap immediately, and put back exactly as it was if the
	 * server refuses — a refused team never sits on screen as though it took.
	 */
	async setTeam(slots: (string | null)[]): Promise<void> {
		const supabase = getSupabaseClient();
		const previous = this.snapshot();
		this.applyTeamSlots(slots);
		const { error } = await supabase.rpc('set_team', { p_team: slots });
		if (error) {
			this.spawnsStore.set(previous);
			throw error;
		}
	}

	/** The spawn list as it stands, for restoring it after a refused write. */
	private snapshot(): CharacterSpawn[] {
		let current: CharacterSpawn[] = [];
		this.spawnsStore.subscribe((spawns) => (current = spawns))();
		return current;
	}

	/** Re-slot every spawn in the store to match `slots` (everything else clears). */
	private applyTeamSlots(slots: (string | null)[]): void {
		const slotById = new Map<string, number>();
		slots.forEach((id, index) => {
			if (id) slotById.set(id, index);
		});
		this.spawnsStore.update((current) =>
			current.map((spawn) => {
				const slot = slotById.get(spawn.id) ?? null;
				return spawn.teamSlot === slot ? spawn : { ...spawn, teamSlot: slot };
			})
		);
	}

}

export const spawnService = new SpawnService();
