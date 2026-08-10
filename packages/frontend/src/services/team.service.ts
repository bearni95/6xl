import { derived, writable, type Readable } from 'svelte/store';
import { spawnService } from '$services/spawn.service';
import type { SpawnColor, CharacterSpawn } from '$types/character-spawn.type';
import { COMBAT_TEAM_SIZE } from '$types/combat.type';

/**
 * A team always has exactly this many spawn slots — the side a fight fields, so
 * it is the shared combat constant `start_battle` and `award_combat_exp` are
 * written against.
 */
export const TEAM_SIZE = COMBAT_TEAM_SIZE;

/** An all-empty line-up — what a player with no team fields. */
function emptySlots(): (string | null)[] {
	return Array.from({ length: TEAM_SIZE }, () => null);
}

/**
 * The player's team — one per player, and the server's, not this browser's.
 *
 * There is no collection here and no "active" one to choose: a card is on the
 * team when it holds one of the {@link TEAM_SIZE} slots (`character_spawns.team_slot`),
 * so the team is simply read back out of the player's own cards and travels with
 * the account rather than with the device. Every change goes through the
 * `set_team` RPC via {@link spawnService.setTeam}, which is what decides whether a
 * line-up is legal at all — so this class holds no rule of its own, only the two
 * moves the roster makes (put a card in, take a card out). A side is any
 * {@link TEAM_SIZE} of the player's own cards: no colour has to be shared and no show
 * has to be common, so there is nothing here to narrow what may be picked.
 */
class TeamService {
	/** The last write's refusal, in the server's own words, or null. */
	private errorStore = writable<string | null>(null);
	/** True while a line-up is in flight, so the roster can hold the taps. */
	private savingStore = writable(false);

	/**
	 * The team as spawn ids in fielded order, the lead first — always
	 * {@link TEAM_SIZE} long, with null for an empty slot. Read straight off the
	 * player's loaded cards, so a team set on another device arrives with them.
	 */
	readonly slots: Readable<(string | null)[]> = derived(spawnService.spawns, (spawns) => {
		const slots = emptySlots();
		for (const spawn of spawns) {
			const slot = spawn.teamSlot;
			if (slot !== null && slot >= 0 && slot < TEAM_SIZE) slots[slot] = spawn.id;
		}
		return slots;
	});

	/** The same line-up as the cards themselves, null where a slot is empty. */
	readonly spawns: Readable<(CharacterSpawn | null)[]> = derived(
		[this.slots, spawnService.spawns],
		([slots, spawns]) =>
			slots.map((id) => (id ? (spawns.find((spawn) => spawn.id === id) ?? null) : null))
	);

	/** The cards actually fielded, in slot order — the empty slots left out. */
	readonly fielded: Readable<CharacterSpawn[]> = derived(this.spawns, (spawns) =>
		spawns.filter((spawn): spawn is CharacterSpawn => !!spawn)
	);

	/**
	 * The team's colour: the rolled colour of its lead — the first slot. It is what
	 * anything drawn in the team's colour is painted with, and nothing more: it binds
	 * no other slot, a side being any three cards the player holds. Null when the lead
	 * slot is empty or before the player's cards have loaded, so anything painted with
	 * it falls back to nothing rather than to a wrong colour.
	 */
	readonly color: Readable<SpawnColor | null> = derived(
		this.spawns,
		(spawns) => spawns[0]?.color ?? null
	);

	/** Whether the team is full — the only line-up a battle can be opened with. */
	readonly complete: Readable<boolean> = derived(
		this.fielded,
		(fielded) => fielded.length === TEAM_SIZE
	);

	/** True while a line-up is being saved. */
	get saving(): Readable<boolean> {
		return this.savingStore;
	}

	/** The last refusal from the server, or null. Cleared by the next save. */
	get error(): Readable<string | null> {
		return this.errorStore;
	}

	/**
	 * Put a card on the team or take it off: the roster's one gesture. An id
	 * already fielded leaves its slot (and, if it was the lead, the cards behind it
	 * move up — see {@link clear}); anything else goes into the first empty slot. A
	 * card the team cannot take, or a full team, is simply not a move.
	 */
	async toggle(spawnId: string): Promise<void> {
		const slots = this.currentSlots();
		const index = slots.indexOf(spawnId);
		if (index >= 0) return this.clear(index);
		if (!this.canAdd(spawnId)) return;
		const empty = slots.indexOf(null);
		await this.save(slots.map((id, i) => (i === empty ? spawnId : id)));
	}

	/**
	 * Empty one slot. Taking the lead off promotes the cards behind it — the second
	 * becomes the lead and the third moves up behind it — rather than emptying the
	 * team: the two cards behind were picked by the player, and dropping the front
	 * one should cost them that card, not the whole line-up. The slots close up
	 * because the server refuses a team standing behind nobody, so a hole in the lead
	 * slot is not a line-up at all.
	 *
	 * The whole of the rest is kept. It used to be whatever the new lead's colour
	 * admitted — a red lead took orange and purple, and once orange led, purple was no
	 * longer a teammate, so promoting cost the player a card they had picked. Nothing
	 * binds a member to its lead any more, so nobody is dropped.
	 *
	 * Any other slot just empties, leaving its hole for the next card added to fill.
	 */
	async clear(index: number): Promise<void> {
		if (index !== 0) {
			return this.save(this.currentSlots().map((id, i) => (i === index ? null : id)));
		}
		const kept = this.currentSlots()
			.slice(1)
			.filter((id): id is string => id !== null);
		await this.save(emptySlots().map((_, slot) => kept[slot] ?? null));
	}

	/**
	 * Whether `spawnId` could be added right now: it must not already be fielded, and
	 * there must be a free slot. That is the whole of it — a side is any
	 * {@link TEAM_SIZE} of the player's own cards, in any colours, out of any shows —
	 * and it is the same rule `set_team` enforces, asked here so the roster can show
	 * what a tap would do instead of finding out.
	 */
	canAdd(spawnId: string): boolean {
		const slots = this.currentSlots();
		if (slots.includes(spawnId)) return false;
		return slots.indexOf(null) >= 0;
	}

	/** Send a line-up, holding the taps and keeping whatever the server said. */
	private async save(slots: (string | null)[]): Promise<void> {
		this.savingStore.set(true);
		this.errorStore.set(null);
		try {
			await spawnService.setTeam(slots);
		} catch (error) {
			this.errorStore.set(teamErrorMessage(error));
		} finally {
			this.savingStore.set(false);
		}
	}

	private currentSlots(): (string | null)[] {
		return this.read(this.slots);
	}

	/** One synchronous read of a store — these are all derived, so this is cheap. */
	private read<T>(store: Readable<T>): T {
		let value!: T;
		store.subscribe((current) => (value = current))();
		return value;
	}
}

/**
 * A refused team in the server's own words. Supabase/PostgREST errors are plain
 * objects carrying a `message`, not Error instances, so a bare String(err) reads
 * as "[object Object]".
 */
function teamErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object') {
		const record = error as Record<string, unknown>;
		const detail = record.message ?? record.hint ?? record.details;
		if (typeof detail === 'string' && detail) return detail;
	}
	return 'Could not save your team. Please try again.';
}

export const teamService = new TeamService();

/** The team's colour, for anything painted in it (see {@link TeamService.color}). */
export const teamColor: Readable<SpawnColor | null> = teamService.color;
