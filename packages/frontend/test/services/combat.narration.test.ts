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
 * What the fight *says* while it plays a turn out: **one sentence per encounter**.
 *
 * An encounter is a row of the board — the duel between the two fighters standing in it —
 * and the whole of it is one thing that happened, however many frames it takes to show.
 * So what has to hold here is a count as much as a wording: a row that was played produces
 * exactly one cue, said when the blow settles it, naming the two fighters it was between.
 * Everything else a turn does is silent, and a turn that came to nothing says nothing.
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
 * Every cue the fight announced, in order — one entry per cue rather than per store write,
 * since the store is written several times a turn and most of those say nothing new.
 */
function record(controller: CombatController): CombatNarrationCue[] {
	const said: CombatNarrationCue[] = [];
	controller.subscribe((state: CombatState) => {
		if (state.cue && state.cue.seq !== said[said.length - 1]?.seq) said.push(state.cue);
	});
	return said;
}

const events = (said: CombatNarrationCue[]): string[] => said.map((cue) => cue.event);

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

	it('says nothing about a turn where no encounter was played', async () => {
		// Blue against blue with nothing banked: both sides load, nobody fires, and a turn
		// where nothing was thrown at anybody has nothing to be said about it. The reveal
		// and the charges are not encounters — the aura is what says a fighter loaded.
		const controller = new CombatController([
			seed('r0', 'error', 'blue'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		expect(said).toEqual([]);
		expect(get(controller).cue).toBeNull();
	});

	it('says one sentence for the row, and says it when the blow settles it', async () => {
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

		// One row was played, so one thing was said about it — not the setting off, the
		// landing and the ground changing hands as three sentences over one event.
		expect(events(said)).toEqual(['hit']);
		expect(said[0].values).toEqual({ attacker: 'P0', target: 'R0' });
	});

	it('says one sentence per row when a turn plays more than one', async () => {
		// Two lanes, both of them fired down: each red fires the free shot its colour owes
		// it, and each blue turns it aside with the guard its own colour owes.
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('r1', 'error', 'red'),
			seed('p0', 'info', 'blue'),
			seed('p1', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.setAction('p1', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();

		expect(events(said)).toEqual(['freeGuard', 'freeGuard']);
		// One line per row, each about the two fighters standing in that row and no others.
		expect(said.map((cue) => cue.values)).toEqual([
			{ attacker: 'R0', target: 'P0' },
			{ attacker: 'R1', target: 'P1' }
		]);
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

		expect(events(said)).toEqual(['blocked']);
		expect(get(controller).fighters.find((fighter) => fighter.id === 'p0')?.down).toBe(false);
	});

	it('takes the sentence off again when the next turn is handed back', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		// The turn was played, something was said about it, and the fight is back to waiting
		// on the player — so the line comes off with the turn it was about.
		expect(get(controller).phase).toBe('planning');
		expect(get(controller).cue).toBeNull();
	});

	it('leaves the encounter that decided the fight standing, and announces no result', async () => {
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
		// How a fight ended is not an encounter: it is read off the panel that comes up in
		// the middle of the board. What stays on the panel is the blow that ended it.
		expect(events(said)).toEqual(['freeGuard', 'hit']);
		expect(get(controller).cue?.event).toBe('hit');
	});

	it('is a cue and never a sentence — the fight words nothing itself', async () => {
		const controller = new CombatController([
			seed('r0', 'error', 'red'),
			seed('p0', 'info', 'blue')
		]);
		controller.attachBoard(silentBoard());
		const said = record(controller);
		controller.setAction('p0', 'charge');
		controller.commit();
		await vi.runAllTimersAsync();
		expect(said.length).toBeGreaterThan(0);
		// Every value is a fighter's name, which the collection writes into a line of its own.
		for (const cue of said) {
			expect(Object.keys(cue.values).sort()).toEqual(['attacker', 'target']);
			expect(cue.seq).toBeGreaterThan(0);
		}
	});
});
