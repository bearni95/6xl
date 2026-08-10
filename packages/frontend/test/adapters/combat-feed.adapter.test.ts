import { describe, expect, it } from 'vitest';
import { combatFeedAdapter } from '$adapters/classes/combat-feed.adapter';
import { SpawnColor } from '$types/character-spawn.type';

/** A fight as `award_combat_exp` announces one, in the shape Postgres builds it. */
const announcement = (overrides: Record<string, unknown> = {}) => ({
	id: '11111111-2222-3333-4444-555555555555',
	at: '2026-08-10T17:04:00.000Z',
	outcome: 'win',
	exp: 300,
	survivors: 2,
	fielded: 3,
	rivals: 0,
	town: 'ES_08019',
	captured: true,
	stale: false,
	player: {
		id: '99999999-8888-7777-6666-555555555555',
		name: 'Bernat',
		character_id: 'goku',
		color: 'blue',
		level: 4
	},
	...overrides
});

describe('CombatFeedAdapter — a fight off the channel', () => {
	it('reads the announcement whole', () => {
		expect(combatFeedAdapter.fromBroadcast(announcement())).toEqual({
			id: '11111111-2222-3333-4444-555555555555',
			at: '2026-08-10T17:04:00.000Z',
			outcome: 'win',
			exp: 300,
			survivors: 2,
			fielded: 3,
			rivals: 0,
			locationId: 'ES_08019',
			captured: true,
			stale: false,
			player: {
				id: '99999999-8888-7777-6666-555555555555',
				name: 'Bernat',
				characterId: 'goku',
				color: SpawnColor.Blue,
				level: 4
			}
		});
	});

	it('refuses a message that names no record or no town', () => {
		// The two things a line cannot be drawn without: what fight this is — which is what
		// keeps one fight heard twice from being two — and where it was fought.
		expect(combatFeedAdapter.fromBroadcast(announcement({ id: '' }))).toBeNull();
		expect(combatFeedAdapter.fromBroadcast(announcement({ town: null }))).toBeNull();
		expect(combatFeedAdapter.fromBroadcast(null)).toBeNull();
		expect(combatFeedAdapter.fromBroadcast('a fight')).toBeNull();
		expect(combatFeedAdapter.fromBroadcast([announcement()])).toBeNull();
	});

	it('bounds everything else rather than refusing it', () => {
		// The topic is public, so a message is something anybody could have published. A line
		// drawn off a nonsense one says something dull; it never says something wrong.
		const entry = combatFeedAdapter.fromBroadcast(
			announcement({
				outcome: 'annihilation',
				exp: -900,
				survivors: 'three',
				captured: 'yes',
				player: { name: '  ', color: 'chartreuse', level: -3 }
			})
		);
		expect(entry).not.toBeNull();
		expect(entry?.outcome).toBe('draw');
		expect(entry?.exp).toBe(0);
		expect(entry?.survivors).toBe(0);
		// Only a real boolean captures a town.
		expect(entry?.captured).toBe(false);
		expect(entry?.player).toEqual({
			id: null,
			name: null,
			characterId: null,
			color: null,
			// Everybody is at least level one, whatever they claim.
			level: 1
		});
	});

	it('stamps a message that carries no time with the moment it arrived', () => {
		const entry = combatFeedAdapter.fromBroadcast(announcement({ at: undefined }));
		expect(Number.isNaN(Date.parse(entry?.at ?? ''))).toBe(false);
	});
});
