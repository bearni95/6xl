import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writable } from 'svelte/store';
import { SpawnBox, SpawnColor, type CharacterSpawn } from '$types/character-spawn.type';

/**
 * The team's two moves, and what taking the lead off does to the cards behind it.
 *
 * The team is the server's, so `spawn.service` is stood in for entirely: a writable
 * of the player's cards (which is what `teamService.slots` derives the line-up from,
 * by way of each card's `teamSlot`) and a spy for the one write. What each case
 * asserts is the line-up handed to `setTeam` — the thing the server is asked to
 * store — rather than the store afterwards, since nothing here round-trips.
 */
const spawnsStore = writable<CharacterSpawn[]>([]);
const setTeam = vi.fn(async () => {});

vi.mock('$services/spawn.service', () => ({
	spawnService: {
		get spawns() {
			return spawnsStore;
		},
		setTeam: (slots: (string | null)[]) => setTeam(slots)
	}
}));

const { teamService } = await import('$services/team.service');

/** One of the player's cards: the id, the colour it rolled, and the slot it holds. */
function card(id: string, color: SpawnColor, teamSlot: number | null): CharacterSpawn {
	return {
		id,
		userId: 'player',
		characterId: `character-${id}`,
		showId: null,
		locationId: 'ES_08028',
		color,
		box: SpawnBox.Black,
		teamSlot,
		createdAt: '2026-01-01T00:00:00.000Z'
	} as CharacterSpawn;
}

/** The line-up `setTeam` was last asked to store. */
function savedTeam(): (string | null)[] {
	expect(setTeam).toHaveBeenCalledTimes(1);
	return setTeam.mock.calls[0][0] as unknown as (string | null)[];
}

beforeEach(() => {
	setTeam.mockClear();
	spawnsStore.set([]);
});

describe('teamService.toggle — taking the lead off', () => {
	it('promotes the second card to lead and moves the third up behind it', async () => {
		spawnsStore.set([
			card('lead', SpawnColor.Red, 0),
			card('second', SpawnColor.Orange, 1),
			card('third', SpawnColor.Orange, 2)
		]);

		await teamService.toggle('lead');

		expect(savedTeam()).toEqual(['second', 'third', null]);
	});

	it('keeps a two-card team by promoting the second into the empty lead slot', async () => {
		spawnsStore.set([card('lead', SpawnColor.Blue, 0), card('second', SpawnColor.Green, 1)]);

		await teamService.toggle('lead');

		expect(savedTeam()).toEqual(['second', null, null]);
	});

	it('keeps every card behind the promoted lead, whatever colours they are', async () => {
		// This used to cost the player a card: red admitted both orange and purple, but
		// orange did not admit purple, so promoting the orange dropped the purple. No
		// colour binds a member to its lead any more, so the whole of the rest moves up.
		spawnsStore.set([
			card('lead', SpawnColor.Red, 0),
			card('second', SpawnColor.Orange, 1),
			card('third', SpawnColor.Purple, 2)
		]);

		await teamService.toggle('lead');

		expect(savedTeam()).toEqual(['second', 'third', null]);
	});

	it('empties the team when the lead was the only card fielded', async () => {
		spawnsStore.set([card('lead', SpawnColor.Yellow, 0), card('bench', SpawnColor.Yellow, null)]);

		await teamService.toggle('lead');

		expect(savedTeam()).toEqual([null, null, null]);
	});

	it('closes a hole behind the lead as it promotes', async () => {
		// Slot 1 already empty, so the third card is what moves into the lead.
		spawnsStore.set([card('lead', SpawnColor.Red, 0), card('third', SpawnColor.Purple, 2)]);

		await teamService.toggle('lead');

		expect(savedTeam()).toEqual(['third', null, null]);
	});
});

describe('teamService.toggle — the other slots', () => {
	it('leaves a hole where a non-lead card was, keeping the lead in front', async () => {
		spawnsStore.set([
			card('lead', SpawnColor.Red, 0),
			card('second', SpawnColor.Orange, 1),
			card('third', SpawnColor.Purple, 2)
		]);

		await teamService.toggle('second');

		expect(savedTeam()).toEqual(['lead', null, 'third']);
	});

	it('fields a bench card in the first empty slot', async () => {
		spawnsStore.set([card('lead', SpawnColor.Red, 0), card('bench', SpawnColor.Purple, null)]);

		await teamService.toggle('bench');

		expect(savedTeam()).toEqual(['lead', 'bench', null]);
	});

	it('fields a card in any colour, the lead having no say in it', async () => {
		// Green shares nothing with red, which was once the whole of what stopped this.
		spawnsStore.set([card('lead', SpawnColor.Red, 0), card('bench', SpawnColor.Green, null)]);

		await teamService.toggle('bench');

		expect(savedTeam()).toEqual(['lead', 'bench', null]);
	});

	it('is not a move at all once every slot is filled', async () => {
		spawnsStore.set([
			card('lead', SpawnColor.Red, 0),
			card('second', SpawnColor.Blue, 1),
			card('third', SpawnColor.Green, 2),
			card('bench', SpawnColor.Yellow, null)
		]);

		await teamService.toggle('bench');

		expect(setTeam).not.toHaveBeenCalled();
	});
});
