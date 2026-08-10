import { describe, it, expect } from 'vitest';
import { SpawnBox, SpawnColor } from '$types/character-spawn.type';
import { ULTRAMAR, ULTRAMAR_ID } from '$types/location.type';
import {
	claimMintedAt,
	claimPlaceName,
	teamLineupMembers,
	type TeamLineupContext
} from '$utils/spawn/team-lineup';
import { WELCOME_BOX_CAPTION, WELCOME_BOX_ID } from '$utils/spawn/welcome-box';
import { LEVEL_BOX_CAPTION, LEVEL_BOX_ID } from '$utils/spawn/level-box';

const characters = new Map([
	['luffy', { label: 'Monkey D. Luffy', basePath: '/assets/luffy' }],
	['zoro', { label: 'Roronoa Zoro', basePath: '/assets/zoro' }]
]);

const context = (overrides: Partial<TeamLineupContext> = {}): TeamLineupContext => ({
	characters,
	showsByCharacter: new Map([
		['luffy', [37854, 12]],
		['zoro', [37854]]
	]),
	municipalityNames: new Map([['ES_08028', 'Barcelona']]),
	...overrides
});

describe('claimPlaceName', () => {
	it('names a town the layer knows, article restored to the front', () => {
		const names = new Map([['ES_25120', 'Pobla de Segur, la']]);
		expect(claimPlaceName('ES_25120', names)).toBe('La Pobla de Segur');
	});

	it('names the two boxes that belong to no town by their own caption', () => {
		const names = new Map([['ES_08028', 'Barcelona']]);
		expect(claimPlaceName(WELCOME_BOX_ID, names)).toBe(WELCOME_BOX_CAPTION);
		// Every level's cards say the same word: the level is on the box, not on the card.
		expect(claimPlaceName(LEVEL_BOX_ID, names)).toBe(LEVEL_BOX_CAPTION);
	});

	it('reads the Ultramar sentinel, an unknown id and no layer at all as Ultramar', () => {
		const names = new Map([['ES_08028', 'Barcelona']]);
		expect(claimPlaceName(ULTRAMAR_ID, names)).toBe(ULTRAMAR.municipality);
		expect(claimPlaceName('ES_99999', names)).toBe(ULTRAMAR.municipality);
		expect(claimPlaceName('ES_08028', null)).toBe(ULTRAMAR.municipality);
		expect(claimPlaceName(null, names)).toBe(ULTRAMAR.municipality);
	});
});

describe('claimMintedAt', () => {
	const minted = '2026-01-02T03:04:05.000Z';

	it('dates a card claimed on the map, and one whose town it cannot name', () => {
		expect(claimMintedAt('ES_08028', minted)).toBe(minted);
		expect(claimMintedAt(ULTRAMAR_ID, minted)).toBe(minted);
		expect(claimMintedAt(null, minted)).toBe(minted);
	});

	it('dates nothing out of the two boxes that belong to no town', () => {
		// Their panel says a caption where the place goes, and a caption has no season.
		expect(claimMintedAt(WELCOME_BOX_ID, minted)).toBeNull();
		expect(claimMintedAt(LEVEL_BOX_ID, minted)).toBeNull();
	});
});

describe('teamLineupMembers', () => {
	it('stands a card up from the registry, the assignment and the layer', () => {
		const [member] = teamLineupMembers(
			[
				{
					characterId: 'luffy',
					color: SpawnColor.Red,
					box: SpawnBox.White,
					locationId: 'ES_08028',
					createdAt: '2026-01-02T03:04:05.000Z'
				}
			],
			context()
		);

		expect(member).toEqual({
			label: 'Monkey D. Luffy',
			basePath: '/assets/luffy',
			color: SpawnColor.Red,
			box: SpawnBox.White,
			locationName: 'Barcelona',
			spawnedAt: '2026-01-02T03:04:05.000Z',
			// The first show it belongs to, which is the one it flies.
			showId: 37854
		});
	});

	it('leaves a card out of a placeless box undated', () => {
		const [member] = teamLineupMembers(
			[
				{
					characterId: 'luffy',
					color: SpawnColor.Red,
					box: SpawnBox.White,
					locationId: WELCOME_BOX_ID,
					createdAt: '2026-01-02T03:04:05.000Z'
				}
			],
			context()
		);
		expect(member.locationName).toBe(WELCOME_BOX_CAPTION);
		expect(member.spawnedAt).toBeNull();
	});

	it('keeps the order it was handed — the lead first, as on the board', () => {
		const members = teamLineupMembers(
			[
				{ characterId: 'zoro', color: SpawnColor.Blue },
				{ characterId: 'luffy', color: SpawnColor.Red }
			],
			context()
		);
		expect(members.map((member) => member.label)).toEqual(['Roronoa Zoro', 'Monkey D. Luffy']);
	});

	it('keeps a character the registry no longer holds, on its id and no sprite', () => {
		const [member] = teamLineupMembers(
			[{ characterId: 'ghost', color: SpawnColor.Green }],
			context()
		);
		expect(member.label).toBe('ghost');
		expect(member.basePath).toBeNull();
		expect(member.showId).toBeNull();
	});

	it('leaves the show out for a character in none', () => {
		const [member] = teamLineupMembers(
			[{ characterId: 'luffy', color: SpawnColor.Red }],
			context({ showsByCharacter: new Map() })
		);
		expect(member.showId).toBeNull();
	});
});
