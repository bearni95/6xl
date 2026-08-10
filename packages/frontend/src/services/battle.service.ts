import { writable, type Readable } from 'svelte/store';
import { getSupabaseClient, isSupabaseConfigured } from '$services/supabase.client';
import { battleAdapter } from '$adapters/classes/battle.adapter';
import type { BattleBoardSnapshot, OpenBattle, OpenBattleRow } from '$types/battle.type';
import type { TeamMemberRoll } from '$utils/spawn/municipality-team';
import type { MunicipalityChallenge } from '$types/territory.type';

/**
 * The player's open battle: the one fight they may have running at a time.
 *
 * A fight lives in Supabase, not in this tab. {@link start} opens it (claiming the
 * town's challenge in the same transaction), {@link save} writes the board back as each
 * turn opens and again as its orders are given — before the volley that carries them out,
 * so a turn is on file from the moment it is decided rather than from the moment it has
 * finished playing — and reporting the result through
 * `authService.reportCombat` is what clears it. So {@link open} is the answer to
 * "is this player in a fight, and which one" — asked once on load, which is how
 * they are put back into it after closing the arena, reloading, or coming back on
 * another device.
 *
 * The rules are the server's, as everywhere else here: this asks to start a battle
 * and is refused if the player already has one, if the town is still cooling down
 * from their last fight over it, or if they hold it themselves. Nothing in this
 * file decides any of that.
 *
 * Everything degrades to "no battle" when Supabase is unconfigured, so auth-less
 * local dev still fights — it simply has nowhere to keep the fight, and closing the
 * arena there does lose it.
 */
class BattleService {
	private openStore = writable<OpenBattle | null>(null);

	/** The player's open battle, or null when they are not in one. */
	get open(): Readable<OpenBattle | null> {
		return this.openStore;
	}

	/**
	 * Read the open battle back off the server. Returns null when there is none, when
	 * signed out, or when Supabase is unconfigured. RLS scopes the table to its owner,
	 * so no filter is needed — at most one row can come back.
	 */
	async load(): Promise<OpenBattle | null> {
		if (!isSupabaseConfigured()) return null;
		const supabase = getSupabaseClient();
		const { data, error } = await supabase
			.from('battles')
			.select('location_id, turnover, rivals, team, board, started_at')
			.maybeSingle();
		if (error) throw error;

		const battle = data ? battleAdapter.fromRow(data as OpenBattleRow) : null;
		this.openStore.set(battle);
		return battle;
	}

	/**
	 * Open a battle over `locationId` against `rivals`, the team the map is showing on
	 * that town, on the generation `turnover` it is showing them as.
	 *
	 * The rival line-up is frozen server-side here, which is what lets a fight outlive
	 * the town changing hands: whoever takes it, this battle goes on being against the
	 * three that were sitting there when it started. The player's own line-up is not
	 * passed at all — `start_battle` reads it off the team slots on their own cards
	 * and hands it back, so the fight is fought with the team the account holds rather
	 * than with anything this browser believes about it. The town's challenge is
	 * claimed in the same transaction, so a refusal (an unfinished team, a town still
	 * cooling down, a battle already open, the caller holds the town) costs nothing.
	 *
	 * Returns the challenge slot that was opened, so the map can close that town's
	 * button without a reload — or null when Supabase is unconfigured.
	 */
	async start(
		locationId: string,
		turnover: number,
		rivals: readonly TeamMemberRoll[]
	): Promise<MunicipalityChallenge | null> {
		if (!locationId) throw new Error('A town is required to start a challenge.');
		if (!isSupabaseConfigured()) return null;

		const supabase = getSupabaseClient();
		const { data, error } = await supabase.rpc('start_battle', {
			p_location_id: locationId,
			p_turnover: Math.max(0, Math.trunc(turnover) || 0),
			p_rivals: battleAdapter.rivalsToJson(rivals)
		});
		if (error) throw error;

		const row = Array.isArray(data) ? data[0] : data;
		this.openStore.set({
			locationId,
			turnover: Math.max(0, Math.trunc(turnover) || 0),
			rivals: [...rivals],
			// The line-up the server fielded, which is the one the report will be judged
			// against — taken from its answer rather than restated from here.
			team: Array.isArray(row?.fielded_team) ? row.fielded_team.map(String) : [],
			board: null,
			startedAt: String(row?.opened_at ?? new Date().toISOString())
		});
		// The RPC's OUT names deliberately differ from the challenge table's columns, so
		// the slot it opened is assembled by hand rather than through the row adapter.
		// It carries no cooldown and cannot: the wait is measured from the end of this
		// fight, which has not been fought yet.
		return {
			locationId,
			startedAt: String(row?.opened_at ?? new Date().toISOString()),
			settledAt: null,
			availableAt: null
		};
	}

	/**
	 * Write the board back, as each turn opens and again as its orders close it. Throws if
	 * the server would not take it.
	 *
	 * This is what makes a turn a turn: a fight lives in that row, not in the tab playing
	 * it, so a turn that has been given but not written back has not happened as far as
	 * anything outside this browser is concerned. Which is why the second of those two
	 * writes goes out on the orders rather than on the volley that shows them: the orders
	 * are the turn, and the animation is only that turn being watched. The arena therefore
	 * waits on this before it plays a turn out, and holds the fight where it is if it
	 * fails, rather than stacking further turns on a board the server never took — every
	 * one of which would be gone on the next reload.
	 *
	 * It updates; it never inserts. `save_battle` writes the one row the caller has open —
	 * the table's primary key is the player — so a fight has exactly one record of itself
	 * from the moment it is opened to the moment reporting it deletes it. A save that finds
	 * no such row wrote nothing, and says so rather than passing for a save: it means the
	 * battle behind this arena is gone (reported from somewhere else), which the player has
	 * to be told, because nothing they do here will be kept.
	 */
	async save(board: BattleBoardSnapshot): Promise<void> {
		if (!isSupabaseConfigured()) return;
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.rpc('save_battle', { p_board: board });
		if (error) throw error;
		// `save_battle` answers whether it found a row to write. An older deployment of it
		// returns void (null here), which is read as the write it always was.
		if (data === false) {
			throw new Error('This fight is no longer open on the server — nothing was saved.');
		}
		this.openStore.update((current) => (current ? { ...current, board } : current));
	}

	/**
	 * Forget the open battle locally, after the server has cleared it — reporting a
	 * finished fight deletes the row, so the store must let go of it too or the map
	 * would go on offering the way back into a fight that is over.
	 */
	clear(): void {
		this.openStore.set(null);
	}
}

export const battleService = new BattleService();
