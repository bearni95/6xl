import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	CombatController,
	type CombatState,
	type FighterSeed
} from '$services/combat.controller';
import type { CombatColor } from '$types/character-definition.type';
import type { CombatNarrationCue } from '$types/combat-narration.type';

/**
 * What the fight *says* while it plays a turn out.
 *
 * The board deliberately prints no word over any fighter, so the words are announced as
 * cues instead — an event id and the fighters it happened to — and worded somewhere else
 * entirely, off the authored collection. What has to hold here is that the cues are the
 * beats of the turn: they arrive in the order the animation reaches them, they name the
 * right fighters, and they come off the screen when the turn is handed back.
 *
 * The rival side chooses for itself, so Math.random is pinned to 0 as the rest of the
 * combat suite pins it: a rival with nothing banked and nothing to fear loads.
 */

function seed(
	id: string,
	side: 'error' | 'info',
	color: CombatColor,
	extra: Partial<FighterSeed> = {}
): FighterSeed {
	return { id, spawnId: id, name: id.toUpperCase(), side, color, moves: [], ...extra };
}

/** A board that answers everything and remembers nothing: this is about the words. */
function silentBoard() {
	const done = () => Promise.resolve();
	return {
		whenReady: done,
		showAura: done,
		clearAura: () => {},
		clearAuras: () => {},
		showHit: () => {},
		showParry: () => {},
		playMove: done,
		holdMove: () => {},
		ringHold: () => {},
		clearHold: () => {},
		clearHolds: () => {},
		playHurt: done,
		fadeDefeated: () => {},
		settleFallen: () => {},
		closeIn: done,
		meleeApproach: done,
		returnHome: done,
		regroup: done
	} as unknown as Parameters<CombatController['attachBoard']>[0];
}

/**
 * Every cue the fight announced, in order — one entry per cue rather than per store
 * write, since the store is written several times a turn and most of those say nothing
 * new. The gaps between them matter too, so the clearing of a cue is recorded as a null.
 */
function record(controller: CombatController): (CombatNarrationCue | null)[] {
	const said: (CombatNarrationCue | null)[] = [];
	controller.subscribe((state: CombatState) => {
		const last = said[said.length - 1];
		if (state.cue?.seq !== last?.seq) said.push(state.cue);
	});
	return said;
}

const events = (said: (CombatNarrationCue | null)[]): string[] =>
	said.filter(Boolean).map((cue) => cue!.event);

describe('what the fight says while it plays a turn out', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('says nothing at all until a turn is being carried out', () => {
		const controller = new CombatController([
			seed('r0', 'error', 'blue'),
			seed('p0', 'info', 'blue')
		]);
		// Planning is the player's to think in: a caption standing over the orders would be
		// lettering a board that is waiting to be told what to do.
		expect(get(controller).cue).toBeNull();
	});

	it('opens the turn by announcing the reveal, and names which turn it is', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'blue'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		expect(said.filter(Boolean)[0]).toMatchObject({ event: 'orders', values: { turn: '1' } });
	});

	it('takes the caption off again when the next turn is handed back', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'blue'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		expect(get(controller).phase).toBe('planning');
		expect(get(controller).cue).toBeNull();
	});

	it('walks an attack out in beats: the approach, and then what the blow amounted to', async () => {
		// The one opening that leaves a fighter in front of a bullet, as the rest of the
		// combat suite stages it: red opposite blue. Turn one both load, red fires the free
		// shot its colour owes it out of the charge it just banked, and blue's free guard
		// turns it aside — so turn two the rival is empty and has to load again, which is
		// the one thing that leaves it open.
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();

		const said = record(controller);
		controller.setAction('p0', 'shoot');
		controller.commit();
		await vi.runAllTimersAsync();

		const spoken = events(said);
		expect(spoken[0]).toBe('orders');
		// The approach is said as the attacker sets off and the answer once the blow has
		// been thrown, in that order — a turn narrated the other way round would be telling
		// the player how it went before it had happened.
		const advance = spoken.indexOf('advance');
		expect(advance).toBeGreaterThan(0);
		expect(spoken.slice(advance + 1)).toContain('hit');
		// The lane it settled, walked out under its own line.
		expect(spoken).toContain('ground');

		const lane = said.find((cue) => cue?.event === 'advance');
		expect(lane?.values).toEqual({ attacker: 'P0', target: 'R0' });
		const ground = said.find((cue) => cue?.event === 'ground');
		expect(ground?.values).toEqual({ winner: 'P0', loser: 'R0' });
	});

	it('says a blow that was covered, not one that landed', async () => {
		// Yellow has no guard to be given for free, so the brace is the order and nothing
		// else; red opposite it fires on the opening turn out of the charge it banks.
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('p0', 'info', 'yellow')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'defend');
		controller.commit();
		await vi.runAllTimersAsync();

		const spoken = events(said);
		expect(spoken).toContain('advance');
		expect(spoken).toContain('blocked');
		expect(spoken).not.toContain('hit');
		expect(get(controller).fighters.find((fighter) => fighter.id === 'p0')?.down).toBe(false);
	});

	it('ends with the result, in the score the player reads it in', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		controller.setAction('p0', 'shoot');
		controller.commit();
		await vi.runAllTimersAsync();

		expect(get(controller).outcome).toBe('win');
		// The last thing said, and the one cue that outlives the turn it was said on: the
		// result panel is up over the board and this is the line under it.
		const last = said.filter(Boolean).at(-1);
		expect(last).toMatchObject({ event: 'win', values: { wins: '1', losses: '0' } });
		expect(get(controller).cue?.event).toBe('win');
	});

	it('is a cue and never a sentence — the fight words nothing itself', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'blue'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		// Every value is a name or a number the collection writes into a line of its own.
		for (const cue of said.filter(Boolean)) {
			expect(Object.values(cue!.values).every((value) => typeof value === 'string')).toBe(true);
			expect(cue!.seq).toBeGreaterThan(0);
		}
	});
});
