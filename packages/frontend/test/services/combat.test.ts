import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	CombatController,
	fallenColumn,
	MAX_CHARGES,
	PLAYER_CELLS,
	RIVAL_CELLS,
	type CombatState,
	type FighterSeed
} from '$services/combat.controller';
import {
	BOARD_WIDTH,
	type Cell,
	cellCenter,
	cellSide,
	columnLabel,
	findPath,
	FIRST_COLUMN,
	isBoardCell,
	LAST_COLUMN,
	MIDDLE_ROW
} from '$utils/mugen/grid';
import type { CombatColor } from '$types/character-definition.type';
import type { BattleBoardSnapshot, BattleFighterSnapshot } from '$types/battle.type';

/**
 * The stand-off's rules, played out through the controller: what each of the three
 * orders does, what each colour bends about them, and how a finished game is
 * reported for experience.
 *
 * The rival side chooses for itself, so every test pins Math.random to 0 — which
 * settles both weighted picks (always the first option: `shoot` when it has a charge
 * and something to fear, `charge` when it doesn't) and the target it aims at (the
 * first of those holding the most charges). Rivals seeded on a colour with no head
 * start therefore open the game by charging, which is the quiet backdrop most of
 * these cases need; rivals seeded yellow open the game shooting.
 *
 * The one thing that is *not* a quiet backdrop is a colour carrying red: a charge is
 * banked before the volley, so a fighter told to load fires the free shot its colour
 * owes it out of that very charge, on turn one. A case that wants nothing happening
 * around it keeps red off both sides.
 */

function seed(
	id: string,
	side: 'error' | 'info',
	color: CombatColor,
	extra: Partial<FighterSeed> = {}
): FighterSeed {
	return {
		id,
		spawnId: id,
		name: id.toUpperCase(),
		side,
		color,
		moves: [],
		...extra
	};
}

const fighterOf = (state: CombatState, id: string) =>
	state.fighters.find((fighter) => fighter.id === id)!;

/** Play the committed turn out — the controller's resolution is timed. */
async function playTurn(controller: CombatController): Promise<void> {
	controller.commit();
	await vi.runAllTimersAsync();
}

/**
 * Play the opening turn with every player fighter loading.
 *
 * No colour opens armed — a free charge is a gift like any other and has to be given on
 * a turn spent elsewhere — so **nobody can fire an ordered shot on turn one**, and any
 * test about shooting starts by getting past it. A fighter that spends turn one charging
 * takes its charge from the order, not from its colour, so this leaves every side holding
 * exactly one charge with every gift still in hand (the rivals load too: with nothing
 * opposite to fear they always do).
 *
 * Every gift, that is, except a shot: a fighter carrying red fires one out of the charge
 * it just banked, so cases that open this way and want their gifts untouched keep red off
 * the board.
 */
async function openWithCharges(controller: CombatController): Promise<void> {
	for (const fighter of get(controller).fighters) {
		if (fighter.side === 'info') controller.setAction(fighter.id, 'charge');
	}
	await playTurn(controller);
}

/** What the controller asked the board to do about auras, and about the ground: a
 * lane's winner is walked onto the white cell it was fought over, and the fighter it
 * beat back to the back of its own half. */
interface AuraLog {
	lit: { id: string; color: string }[];
	doused: string[];
	moved: { id: string; cell: Cell }[];
	/** The defensive pose a fighter was stood in as a blow came at it, whoever paid for
	 * the guard that answers it — the one thing on the board that says a shot was met. */
	braced: { id: string; color: string }[];
}

const boardLog = (): AuraLog => ({ lit: [], doused: [], moved: [], braced: [] });

/**
 * A board that does nothing but remember what it was told. The controller drives the
 * canvas through this interface, so it is the only way to check what a fight actually
 * *shows* — the aura being the whole of what the board says about a fighter's charge
 * now that nothing is drawn under its feet. Every method the controller calls has to
 * be here: it invokes them as `this.board?.x(…)`, which throws rather than skips once
 * `board` is set.
 */
function fakeBoard(log: AuraLog) {
	const done = () => Promise.resolve();
	return {
		showAura: (id: string, color: string) => {
			log.lit.push({ id, color });
			return done();
		},
		clearAura: (id: string) => log.doused.push(id),
		clearAuras: () => {},
		// The sparks a blow throws: through a fighter it got past, and back off one whose
		// blow was stopped by another blow — the whole of what is said about either, since
		// nothing in this fight is put into words on the board.
		showHit: () => {},
		showParry: () => {},
		playMove: done,
		// The guard a braced fighter is stood in, the ring drawn round it as the blow it
		// answers is thrown, the release of it once that blow is over, and the release of
		// every one of them as the next turn is handed over. The ring is what is logged as
		// bracing: a pose is a frame of animation until something says it is a state.
		holdMove: () => {},
		ringHold: (id: string, color: string) => log.braced.push({ id, color }),
		clearHold: () => {},
		clearHolds: () => {},
		playHurt: done,
		// The fighter drawn back a little as it falls back beaten, and — for a fight picked
		// up rather than started — put straight onto the ground it fell on.
		fadeDefeated: () => {},
		settleFallen: () => {},
		closeIn: done,
		meleeApproach: done,
		returnHome: done,
		regroup: (id: string, cell: Cell) => {
			log.moved.push({ id, cell });
			return done();
		}
	} as unknown as Parameters<CombatController['attachBoard']>[0];
}

describe('the stand-off', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('charges', () => {
		it('opens everybody empty, whatever their colour', () => {
			const state = get(
				new CombatController([
					seed('r0', 'error', 'blue'),
					seed('p0', 'info', 'yellow'),
					seed('p1', 'info', 'blue'),
					seed('p2', 'info', 'green') // green mixes yellow
				])
			);
			// Yellow's charge is a gift, not a head start: it has to be given on a turn
			// spent doing something else, so nobody stands loaded before a turn is played.
			for (const id of ['r0', 'p0', 'p1', 'p2']) {
				expect(fighterOf(state, id).charges).toBe(0);
			}
		});

		it('refuses Shoot to a fighter with nothing banked', () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue')
			]);
			controller.setAction('p0', 'shoot');
			const state = get(controller);
			// The order never took, so the side is not ready to commit either.
			expect(fighterOf(state, 'p0').action).toBeNull();
			expect(fighterOf(state, 'p0').canShoot).toBe(false);
			expect(state.ready).toBe(false);
		});

		it('banks one charge a turn, and stops at the cap', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue'), // holds the only lane, and covers it every turn
				seed('p1', 'info', 'blue') // the empty lane: nothing can reach it, so it just loads
			]);
			for (let turn = 1; turn <= MAX_CHARGES + 2; turn++) {
				controller.setAction('p0', 'defend');
				controller.setAction('p1', 'charge');
				await playTurn(controller);
			}
			expect(fighterOf(get(controller), 'p1').charges).toBe(MAX_CHARGES);
		});

		it('holds one charge at most — loading again is a turn thrown away', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue') // the empty lane: nothing can reach it
			]);
			expect(MAX_CHARGES).toBe(1);
			controller.setAction('p0', 'defend');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p1').charges).toBe(1);
			// A second turn spent loading buys nothing, and the fight says as much.
			controller.setAction('p0', 'defend');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'p1').charges).toBe(1);
			expect(state.log.some((line) => line.includes('already full up'))).toBe(true);
		});

		it('spends a charge on the shot it fires', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue')
			]);
			await openWithCharges(controller);
			expect(fighterOf(get(controller), 'p0').charges).toBe(1);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').charges).toBe(0);
		});
	});

	describe('what a turn does', () => {
		it('takes down a fighter caught reloading', async () => {
			const controller = new CombatController([
				// Red, whose gift is a shot: it goes off on the turn the rival loads, and
				// leaves it empty again — which is what puts it in front of the bullet below.
				seed('r0', 'error', 'red'),
				// Blue, so the free shot of that first turn is turned aside and the fight
				// gets as far as a second one.
				seed('p0', 'info', 'blue')
			]);
			await openWithCharges(controller);
			// Turn one the rival loaded and spent the charge on its free shot, which blue's
			// free guard turned aside...
			expect(fighterOf(get(controller), 'p0').down).toBe(false);
			expect(fighterOf(get(controller), 'p0').spent).toEqual(['defend']);
			// ...so turn two it has to load again, and loading is the one thing that leaves
			// a fighter open.
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'r0').down).toBe(true);
			expect(state.outcome).toBe('win');
		});

		it('blocks the shot aimed at a fighter that defends', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				// Yellow, so nothing but the order itself is standing between it and the
				// bullet — its gift is a charge, and it is already full up.
				seed('p0', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').down).toBe(false);
		});

		it('cancels the two shots of a lane that fired both ways', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				seed('p0', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			const state = get(controller);
			// Both fired at the same moment, so the shots met in the lane: neither reached
			// anybody, and neither fighter is down. The charges are gone all the same — they
			// paid for bullets, and the bullets were fired.
			expect(fighterOf(state, 'r0').down).toBe(false);
			expect(fighterOf(state, 'p0').down).toBe(false);
			expect(fighterOf(state, 'p0').charges).toBe(0);
			expect(state.log.some((line) => line.includes('meet in the lane'))).toBe(true);
			// Nothing was settled, so the fight is still on.
			expect(state.outcome).toBeNull();
			expect(state.wins).toEqual({ info: 0, error: 0 });
		});

		it('leaves a guard out of it when a shot was stopped by another shot', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'purple') // red + blue: the free shot and the free guard
			]);
			// Both are red enough to fire on the opening turn: a charge is banked before the
			// volley, so each fires the shot its colour owes it out of the charge it just
			// banked, and the two meet in the lane.
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			const state = get(controller);
			// Its own bullet is what stopped the one coming for it, so the guard was never
			// called on — nothing says it turned anything aside.
			expect(state.log.some((line) => line.includes('meet in the lane'))).toBe(true);
			expect(state.log.some((line) => line.includes('free guard'))).toBe(false);
			expect(fighterOf(state, 'p0').down).toBe(false);
			// And it is gone all the same: a gift the opening turn did not call on runs out
			// with it, so the corner is empty from here whichever way the turn went.
			expect(fighterOf(state, 'p0').spent).toEqual(['shoot', 'defend']);
		});

		it('takes a fighter down through the lane it stands in', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				seed('p0', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'p0').down).toBe(true);
			expect(state.outcome).toBe('lose');
		});
	});

	describe('what a colour turned out to be worth', () => {
		/**
		 * A gift that did something and a gift that merely ran out are the same state to
		 * every rule of the fight — both are gone — and are told apart anyway, so the fight
		 * keeps an account of what a colour was actually worth in it rather than only of
		 * what it was handed.
		 */
		it('separates a gift that fired from one that ran out unused', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'), // owed a shot, and fires it on turn one
				seed('p0', 'info', 'green') // owed a guard and a charge
			]);
			controller.attachBoard(fakeBoard(boardLog()));

			// Ordered to load, so the free charge is never a second thing p0 did — but the
			// bullet red's colour bought arrives, and the free guard turns it aside.
			controller.setAction('p0', 'charge');
			await playTurn(controller);

			const green = fighterOf(get(controller), 'p0');
			// Both gifts are gone by the end of the opening turn, and only the guard did
			// anything, so only the guard is on the record.
			expect([...green.spent].sort()).toEqual(['charge', 'defend']);
			expect(green.used).toEqual(['defend']);

			// And the shot red's colour owed it was fired, so red's own record is that shot.
			expect(fighterOf(get(controller), 'r0').used).toEqual(['shoot']);
		});

		it('carries that record through a fight put down and picked up again', async () => {
			const line = () => [seed('r0', 'error', 'red'), seed('p0', 'info', 'green')];
			const controller = new CombatController(line());
			controller.attachBoard(fakeBoard(boardLog()));
			controller.setAction('p0', 'charge');
			await playTurn(controller);

			// A gift is worth one use in the whole battle, so what a colour did is part of the
			// fight and not of the turn it happened on: a board written mid-fight has to carry
			// it or the slot comes back empty on a fighter whose colour has already paid out.
			const resumed = new CombatController(line(), controller.snapshot());
			resumed.attachBoard(fakeBoard(boardLog()));

			expect(fighterOf(get(resumed), 'p0').used).toEqual(['defend']);
			expect(fighterOf(get(resumed), 'r0').used).toEqual(['shoot']);
		});

		it('reads a board written before the two were told apart as a colour that did nothing', () => {
			const line = () => [seed('r0', 'error', 'red'), seed('p0', 'info', 'green')];
			const controller = new CombatController(line());
			const old = controller.snapshot();
			// The field the older format has no opinion about, on a fighter it says has had
			// everything its colour gave.
			old.fighters = old.fighters.map((entry) => ({
				...entry,
				spent: ['defend', 'charge', 'shoot'],
				used: undefined
			}));

			const resumed = new CombatController(line(), old);
			resumed.attachBoard(fakeBoard(boardLog()));

			// Nothing is offered any more — the gifts are had — and nothing is claimed to have
			// happened either, which is the honest reading of a board that was never asked.
			const green = fighterOf(get(resumed), 'p0');
			expect([...green.spent].sort()).toEqual(['charge', 'defend']);
			expect(green.used).toEqual([]);
		});
	});

	describe('the aura a charge burns with', () => {
		it("lights in the fighter's own colour the turn it loads, and stays lit", async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'green') // the empty lane: nothing can reach it
			]);
			controller.attachBoard(fakeBoard(log));
			// Nobody opens loaded, so nothing is alight before a turn is played.
			expect(log.lit).toHaveLength(0);

			controller.setAction('p0', 'defend');
			controller.setAction('p1', 'defend');
			await playTurn(controller);
			// Green mixes yellow: a turn spent covering is a turn its free charge pays out
			// on, and the aura it lights burns in its own colour rather than the primary it
			// borrowed. Blue banked nothing, so nothing lit.
			expect(log.lit).toContainEqual({ id: 'p1', color: 'green' });
			expect(log.lit.filter((entry) => entry.id === 'p0')).toHaveLength(0);

			controller.setAction('p0', 'charge');
			controller.setAction('p1', 'defend');
			await playTurn(controller);
			expect(log.lit).toContainEqual({ id: 'p0', color: 'blue' });

			// Held across turns without being re-lit, and never put out while it is held.
			const litOnce = log.lit.filter((entry) => entry.id === 'p0').length;
			controller.setAction('p0', 'defend');
			controller.setAction('p1', 'defend');
			await playTurn(controller);
			expect(log.lit.filter((entry) => entry.id === 'p0')).toHaveLength(litOnce);
			expect(log.doused).not.toContain('p0');
		});

		it('goes out the turn the charge is fired', async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				// Blue: its free guard sees it through the answering shot, and its colour
				// hands it no charge to quietly re-light the aura with.
				seed('p0', 'info', 'blue')
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			expect(log.lit).toContainEqual({ id: 'p0', color: 'blue' });

			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').charges).toBe(0);
			expect(log.doused).toContain('p0');
		});
	});

	describe('lanes', () => {
		it('faces every fighter the one holding the same place in the other line', () => {
			const state = get(
				new CombatController([
					seed('r0', 'error', 'blue'),
					seed('r1', 'error', 'blue'),
					seed('p0', 'info', 'blue'),
					seed('p1', 'info', 'blue')
				])
			);
			expect(fighterOf(state, 'p0').opponentId).toBe('r0');
			expect(fighterOf(state, 'p1').opponentId).toBe('r1');
			expect(fighterOf(state, 'r0').opponentId).toBe('p0');
			expect(fighterOf(state, 'r1').opponentId).toBe('p1');
		});

		it('leaves the odd fighter out of a longer line with nobody to shoot', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'yellow'),
				seed('p1', 'info', 'yellow') // loaded like the rest, but its lane is empty
			]);
			await openWithCharges(controller);
			const state = get(controller);
			expect(fighterOf(state, 'p0').canShoot).toBe(true);
			expect(fighterOf(state, 'p1').opponentId).toBeNull();
			expect(fighterOf(state, 'p1').canShoot).toBe(false);
		});

		it('never re-pairs the lines: a settled lane is settled for good', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				// Blue both, so the rivals' answering volley is turned aside and the lanes
				// are settled one at a time rather than all at once.
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue')
			]);
			await openWithCharges(controller);
			expect(fighterOf(get(controller), 'p0').opponentId).toBe('r0');
			// P0 shoots its opposite down and wins that lane outright.
			controller.setAction('p0', 'shoot');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'r0').down).toBe(true);
			// It has nothing left to shoot — the rival behind is not its to reach...
			expect(fighterOf(state, 'p0').opponentId).toBeNull();
			expect(fighterOf(state, 'p0').canShoot).toBe(false);
			// ...and that rival is still facing the fighter it always faced.
			expect(fighterOf(state, 'p1').opponentId).toBe('r1');
			expect(fighterOf(state, 'r1').opponentId).toBe('p1');
		});

		it('refuses Shoot to a fighter whose lane is empty, however well charged', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			expect(fighterOf(get(controller), 'p1').charges).toBe(1);
			controller.setAction('p1', 'shoot');
			expect(fighterOf(get(controller), 'p1').action).toBeNull();
		});
	});

	describe('the free order a colour hands over', () => {
		it('comes on a turn spent on something else', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'yellow')
			]);
			// A turn spent covering still pays out yellow's charge — that is the whole
			// point of it. Nothing was ordered but the cover.
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'p0').charges).toBe(1);
			expect(fighterOf(state, 'p0').spent).toEqual(['charge']);
			expect(state.log.some((line) => line.includes('free charge'))).toBe(true);
		});

		it('runs out with the opening turn when nothing has called on it', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'yellow')
			]);
			// Told to load, which is the very order yellow grants: the gift is not a second
			// thing the fighter did, so nothing takes it — and the turn it was owed on is now
			// over, so it is gone as surely as if it had been.
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').spent).toEqual(['charge']);
			expect(get(controller).log.some((line) => line.includes('free charge'))).toBe(false);

			// Fire the charge off (both lines shoot, so the two blows meet and nobody falls),
			// leaving the fighter empty — and with room for a free charge, which is the state
			// a gift that waited would have been waiting for.
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').charges).toBe(0);

			// Then the very turn that would have paid it out: empty, and spent covering. It
			// banks nothing. Under a gift that kept, this fighter would end the turn loaded
			// for free.
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			const state = get(controller);
			expect(state.log.some((line) => line.includes('free charge'))).toBe(false);
			expect(fighterOf(state, 'p0').charges).toBe(0);
			expect(fighterOf(state, 'p0').spent).toEqual(['charge']);
		});

		it('never comes on the order it *is*', async () => {
			const controller = new CombatController([
				// Red, so a bullet arrives on the opening turn — the one turn blue's guard is
				// in hand for — and there is something for the order to stop.
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue')
			]);
			// Blue covering is blue *ordered* to cover: the shot is stopped by the order, and
			// the gift is not a second action on a turn spent doing the very thing it grants.
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'p0').down).toBe(false);
			expect(state.log.some((line) => line.includes('blocked'))).toBe(true);
			expect(state.log.some((line) => line.includes('free guard'))).toBe(false);
			// So ordering the thing your colour owes you is not keeping it back — it is
			// throwing it away: it was never taken and it does not last the turn.
			expect(fighterOf(state, 'p0').spent).toEqual(['defend']);
		});

		it('braces the fighter it answers for, exactly as an ordered guard does', async () => {
			const log = boardLog();
			const controller = new CombatController([
				// Red, so a bullet arrives on the opening turn — the one turn the gift is in
				// hand for. Blue is given something other than cover, which is the only way the
				// free guard is the thing that answers the shot.
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue', {
					moves: [{ name: 'Guard', type: 'defend', source: 'defend-anim' }]
				})
			]);
			controller.attachBoard(fakeBoard(log));
			controller.setAction('p0', 'charge');
			await playTurn(controller);

			const state = get(controller);
			// The gift did the stopping...
			expect(fighterOf(state, 'p0').used).toEqual(['defend']);
			expect(fighterOf(state, 'p0').down).toBe(false);
			// ...and it was *shown* doing it. A guard is a guard whoever paid for it: the pose
			// goes up in the fighter's own colour as the blow comes in, the same one an
			// ordered cover is stood in. Left out, the free guard was the one defence in this
			// fight nothing was drawn for, and the shot it turned aside read as a miss.
			expect(log.braced).toContainEqual({ id: 'p0', color: 'blue' });
		});

		it('is worth one use in the whole battle', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue')
			]);
			await openWithCharges(controller);
			// The rival fires and blue's free guard turns it aside — and goes with it.
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').down).toBe(false);
			expect(fighterOf(get(controller), 'p0').spent).toEqual(['defend']);
			// The rival reloads, then fires again — and this one has nothing to stop it.
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').down).toBe(true);
		});

		it('is not taken by a turn it could do nothing on', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'yellow'),
				seed('p1', 'info', 'blue') // the empty lane: nothing is ever fired at it
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'defend');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			const state = get(controller);
			// A free charge on a fighter already full up puts nothing anywhere, so it is
			// not the gift being taken — it waits for a turn it can be.
			expect(fighterOf(state, 'p0').charges).toBe(1);
			expect(fighterOf(state, 'p0').spent).toEqual([]);
			// And a free guard nobody fires at has turned nothing aside.
			expect(fighterOf(state, 'p1').spent).toEqual([]);
		});

		it('brings both of a compound in the same turn, the charge first', async () => {
			const controller = new CombatController([
				// Blue, so it fires nothing back on the opening turn and the free shot below
				// arrives at something: its own free guard, which is what stops it.
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'orange') // orange = red + yellow: a free shot and a free charge
			]);
			// Told to do nothing but cover, on the opening turn, with nothing banked.
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			const state = get(controller);
			// Neither gift is the order given, so both come — and in sequence: the charge is
			// banked first, and the free shot is fired out of that very charge, which is why
			// the fighter ends the turn empty rather than loaded.
			expect(fighterOf(state, 'p0').spent).toEqual(['charge', 'shoot']);
			expect(fighterOf(state, 'p0').charges).toBe(0);
			expect(state.log.some((line) => line.includes('free charge'))).toBe(true);
			expect(state.log.some((line) => line.includes('free shot'))).toBe(true);
			// And the bullet was a bullet: it reached the rival, which spent its own gift
			// turning it aside.
			expect(fighterOf(state, 'r0').spent).toEqual(['defend']);
			expect(fighterOf(state, 'p0').down).toBe(false);
			expect(fighterOf(state, 'r0').down).toBe(false);
		});

		it("fires red's shot beside the order the fighter was given", async () => {
			const controller = new CombatController([
				// Red both ways, so no free guard stands between a bullet and anybody.
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'red')
			]);
			await openWithCharges(controller);
			const state = get(controller);
			// Neither was ordered to shoot on that opening turn — both were ordered to load —
			// and both fired all the same: the charge is banked before the volley, so each
			// took the shot its colour owed it out of the charge it had just banked.
			expect(fighterOf(state, 'p0').spent).toEqual(['shoot']);
			expect(fighterOf(state, 'r0').spent).toEqual(['shoot']);
			expect(fighterOf(state, 'p0').charges).toBe(0);
			// Two shots fired at one moment across the one lane, so they met each other and
			// nobody was hit. A gift is an attack like any other, and cancels like one.
			expect(state.log.some((line) => line.includes('meet in the lane'))).toBe(true);
			expect(fighterOf(state, 'p0').down).toBe(false);
			expect(fighterOf(state, 'r0').down).toBe(false);
			// Nothing was settled by any of it, so the fight is asking for turn two.
			expect(state.turn).toBe(2);
		});

		it('never puts a free charge on a fighter that is about to fire', async () => {
			// A loaded fighter with its free charge still owed is a state only a resumed
			// fight reaches — a gift does not outlive the turn it was given on — so the
			// board is handed back exactly as one picked up from the server would be.
			const controller = new CombatController(
				[seed('r0', 'error', 'yellow'), seed('p0', 'info', 'yellow')],
				{
					turn: 4,
					fighters: [
						{
							side: 'error',
							slot: 0,
							spawnId: 'r0',
							charges: 0,
							down: false,
							spent: ['charge'],
							// Covering, so the shot below is blocked and the fight plays on to
							// the end of the turn rather than being settled by it.
							action: 'defend',
							cell: RIVAL_CELLS[0]
						},
						{
							side: 'info',
							slot: 0,
							spawnId: 'p0',
							charges: 1,
							down: false,
							spent: [],
							action: null,
							cell: PLAYER_CELLS[0]
						}
					]
				}
			);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			const state = get(controller);
			// Charges are banked before the shooting, and a fighter about to fire is full at
			// that moment: there is nowhere to put a free charge, so it is not taken — nothing
			// says one was banked — and the shot empties the fighter as any shot would.
			expect(state.log.some((line) => line.includes('free charge'))).toBe(false);
			expect(fighterOf(state, 'p0').charges).toBe(0);
			// It is not kept back for a turn with room in it either: the turn it was owed on
			// is over, so it goes out with the turn.
			expect(fighterOf(state, 'p0').spent).toEqual(['charge']);
		});

		it("never doubles a fighter's own shot", async () => {
			// A charge in hand *and* red's shot still owed is a state a turn cannot arrive at
			// — the turn a red fighter loads, the free shot goes out of the charge it banked —
			// so the fight is resumed into it, exactly as a battle picked up from the server is.
			const controller = new CombatController(
				[seed('r0', 'error', 'blue'), seed('p0', 'info', 'red')],
				{
					turn: 4,
					fighters: [
						{
							side: 'error',
							slot: 0,
							spawnId: 'r0',
							charges: 0,
							down: false,
							spent: [],
							action: 'charge',
							cell: RIVAL_CELLS[0]
						},
						{
							side: 'info',
							slot: 0,
							spawnId: 'p0',
							charges: 1,
							down: false,
							spent: [],
							action: null,
							cell: PLAYER_CELLS[0]
						}
					]
				}
			);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			const state = get(controller);
			// The order *is* the gift's order, so nobody fires twice: one shot goes down the
			// lane and nothing says a free one went with it. The gift is not held over for a
			// later turn either — it runs out with the turn it was owed on.
			expect(state.log.some((line) => line.includes('free shot'))).toBe(false);
			expect(state.log.filter((line) => line.includes('P0 shoots'))).toHaveLength(1);
			expect(fighterOf(state, 'p0').spent).toEqual(['shoot']);
		});
	});

	describe('the rival side, playing by the same rules', () => {
		it('fires the shot its colour owes it out of the charge it was ordered to bank', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				// Yellow: nothing of its own stands between it and a bullet on turn one.
				seed('p0', 'info', 'yellow')
			]);
			// Both sides load on the opening turn — and the rival's colour turns that into a
			// shot, out of the charge the order banked, without anybody choosing it.
			await openWithCharges(controller);
			const state = get(controller);
			expect(fighterOf(state, 'r0').spent).toEqual(['shoot']);
			expect(fighterOf(state, 'r0').charges).toBe(0);
			expect(fighterOf(state, 'p0').down).toBe(true);
			expect(state.outcome).toBe('lose');
		});

		it('counts a fighter that stands empty owing a shot as dangerous all the same', async () => {
			// An empty rival facing an empty fighter: loading is the plain choice, and the
			// only reason to duck behind a guard instead is that the one opposite could still
			// put a bullet across the lane. A fighter whose colour owes it a shot can — it
			// loads, and the gift pays for itself the same turn — so the rival covers.
			//
			// The opening turn is where this is read, and the only turn where it can be:
			// gifts run out with it, so from turn two nobody is owed anything and every
			// empty fighter is exactly as harmless as it looks. Pinned high, the rival's
			// weighted pick lands on the last option, so the two runs differ only in what it
			// read off the fighter opposite.
			//
			// The rivals are blue, whose gift is the guard they might pick: covering is then
			// never a turn that quietly arms them, so the charge they end the turn with is
			// the whole of what they chose to do.
			const loaded = async (opposite: CombatColor) => {
				vi.spyOn(Math, 'random').mockReturnValue(0.99);
				const controller = new CombatController([
					seed('r0', 'error', 'blue'),
					seed('p0', 'info', opposite)
				]);
				controller.setAction('p0', 'defend');
				await playTurn(controller);
				return fighterOf(get(controller), 'r0').charges === 1;
			};
			// Blue opposite: nothing it carries is a shot, so it is harmless while empty and
			// the rival stands open and loads.
			expect(await loaded('blue')).toBe(true);
			// Red opposite: the same empty fighter, still owed a shot, and the rival covers
			// rather than load in front of it.
			expect(await loaded('red')).toBe(false);
		});

		it('stops reading a gift the opening turn ran out on', async () => {
			// The same red fighter, one turn later. Its shot went unfired and unbanked, so
			// there is nothing left of it — and a rival that covered in front of it on turn
			// one has no reason to a turn later.
			vi.spyOn(Math, 'random').mockReturnValue(0.99);
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'red')
			]);
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'r0').charges).toBe(0);
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').spent).toEqual(['shoot']);
			expect(fighterOf(get(controller), 'r0').charges).toBe(1);
		});
	});

	describe('orders', () => {
		it('is not ready to commit until every fighter still standing has one', () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue')
			]);
			expect(get(controller).ready).toBe(false);
			controller.setAction('p0', 'charge');
			expect(get(controller).ready).toBe(false);
			controller.setAction('p1', 'defend');
			expect(get(controller).ready).toBe(true);
		});

		it('keeps the rival side secret until the turn is played out', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				seed('p0', 'info', 'blue')
			]);
			// The rival has already decided — the page just isn't told.
			expect(fighterOf(get(controller), 'r0').action).toBeNull();
			await openWithCharges(controller);
			expect(fighterOf(get(controller), 'r0').action).toBeNull();
			controller.setAction('p0', 'defend');
			await playTurn(controller);
			// Once carried out it is on the record, in the log of what the turn amounted to.
			expect(get(controller).log.join(' ')).toContain('R0');
		});

		it('names the one fighter a shot can go to, rather than offering a choice', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('r1', 'error', 'blue'),
				seed('p0', 'info', 'yellow'),
				seed('p1', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			const state = get(controller);
			// The order is complete the moment it is given: there was never anything to aim.
			expect(fighterOf(state, 'p0').ordered).toBe(true);
			expect(fighterOf(state, 'p0').opponentName).toBe('R0');
			expect(fighterOf(state, 'p1').opponentName).toBe('R1');
		});
	});

	describe('the ground a lane is fought over', () => {
		// The white cell of a lane: the ground between the two lines, and what *either*
		// side's fighter walks onto the turn it wins there.
		const wonGround = (lane: number): Cell => ({ q: 0, r: RIVAL_CELLS[lane].r });
		// Where the fighter that lost the lane goes: the back of its own half — which on a
		// board whose halves are one column deep is the ground it opened on, so it stands the
		// fight out where it fought it. It is out of the fight, not off the board.
		const fallenGround = (side: 'error' | 'info', lane: number): Cell => ({
			q: fallenColumn(side, RIVAL_CELLS[lane].r),
			r: RIVAL_CELLS[lane].r
		});

		it('opens with each line in its own half, the white column between them empty', () => {
			expect(RIVAL_CELLS).toHaveLength(PLAYER_CELLS.length);
			for (const cell of RIVAL_CELLS) {
				expect(isBoardCell(cell.q, cell.r)).toBe(true);
				// The whole of the rival's own half, never the shared ground: column a on
				// every lane, the rows being level with one another.
				expect(columnLabel(cell.q)).toBe('a');
				expect(cellSide(cell.q)).toBe('red');
			}
			for (const cell of PLAYER_CELLS) {
				expect(isBoardCell(cell.q, cell.r)).toBe(true);
				// Column c: the whole of the player's own half, across the white one.
				expect(columnLabel(cell.q)).toBe('c');
				expect(cellSide(cell.q)).toBe('blue');
			}
			// Nobody opens on the white column: it is what the lanes are played for, so it
			// is ground to be taken rather than ground either line starts on.
			for (const cell of [...RIVAL_CELLS, ...PLAYER_CELLS]) {
				expect(cellSide(cell.q)).not.toBe('purple');
			}
			// Each pair is drawn on one row, which is what puts the two of them in one
			// lane — and what makes the white cell between them the ground it is won over.
			RIVAL_CELLS.forEach((rival, lane) => {
				expect(PLAYER_CELLS[lane].r).toBe(rival.r);
			});
			// Nobody shares a cell with anybody.
			const keys = [...RIVAL_CELLS, ...PLAYER_CELLS].map((cell) => `${cell.q},${cell.r}`);
			expect(new Set(keys).size).toBe(keys.length);
		});

		it('opens both lines the same distance out from the board’s middle, on every lane', () => {
			// A lane that attacks both ways walks its pair out to the board's own middle
			// line (`MugenBoard.meleeApproach`), so the two have to *start* the same
			// distance from it or one of them arrives while the other is still walking, and
			// the clash reads as one fighter waiting for the other. On a field of squares
			// level in columns is level on screen, so each line standing one column off the
			// white one is the whole of it — the hex field's middle row was drawn half a
			// cell across from the other two, and the rival's opening had to answer it.
			const middle = BOARD_WIDTH / 2;
			RIVAL_CELLS.forEach((rival, lane) => {
				const player = PLAYER_CELLS[lane];
				const out = (cell: Cell) => Math.abs(cellCenter(cell.q, cell.r).x - middle);
				expect(out(rival)).toBeCloseTo(out(player));
				// And the meeting line is between them, not beyond either.
				expect(cellCenter(rival.q, rival.r).x).toBeLessThan(middle);
				expect(cellCenter(player.q, player.r).x).toBeGreaterThan(middle);
			});
			// One column for the whole line, on both sides: no lane gives ground for the
			// sake of where it is drawn.
			for (const cell of RIVAL_CELLS) expect(cell.q).toBe(RIVAL_CELLS[0].q);
			for (const cell of PLAYER_CELLS) expect(cell.q).toBe(PLAYER_CELLS[0].q);
		});

		it('stands the fallen at the back of their own half, which is the ground they opened on', () => {
			// A retreat is a step backwards, read off the lane rather than off the line. The
			// board has no ground behind either line to take that step onto, so the step is
			// not taken and the beaten fighter holds the cell it lost — on its own side, and
			// never out on the white column or in the far half.
			for (const side of ['info', 'error'] as const) {
				const cells = side === 'info' ? PLAYER_CELLS : RIVAL_CELLS;
				for (const opening of cells) {
					const back = { q: fallenColumn(side, opening.r), r: opening.r };
					expect(isBoardCell(back.q, back.r)).toBe(true);
					expect(back.q).toBe(opening.q);
					expect(cellSide(back.q)).toBe(cellSide(opening.q));
					// And a step backwards is what it would be if there were anywhere to step:
					// the outermost column of the fighter's own half either way.
					expect(Math.abs(back.q)).toBe(Math.max(Math.abs(FIRST_COLUMN), Math.abs(LAST_COLUMN)));
				}
			}
		});

		it('leaves every move walkable — each side may cross its own half and the white column', () => {
			// The board only ever *walks* a fighter to its new ground, so the ground has to
			// be reachable: a route over its own half plus the shared white column, which
			// is exactly what the board allows. Without one the fighter would simply stay
			// where it was, with nothing to say so. Both of a lane's two moves are checked
			// for both sides — the winner's step onto the white cell, and the loser's step
			// back to the back of its half.
			const half = (side: 'red' | 'blue') => (cell: Cell) =>
				isBoardCell(cell.q, cell.r) && cellSide(cell.q) !== (side === 'blue' ? 'red' : 'blue');
			RIVAL_CELLS.forEach((rival, lane) => {
				expect(findPath(PLAYER_CELLS[lane], wonGround(lane), half('blue'))).not.toBeNull();
				expect(findPath(rival, wonGround(lane), half('red'))).not.toBeNull();
				expect(
					findPath(PLAYER_CELLS[lane], fallenGround('info', lane), half('blue'))
				).not.toBeNull();
				expect(findPath(rival, fallenGround('error', lane), half('red'))).not.toBeNull();
			});
		});

		it('walks the player up onto the white cell it just won, and the rival it felled back', async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue') // its free guard sees it through the answering shot
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'r0').down).toBe(true);
			// Both halves of the lane's one result: the beaten rival withdraws to the back of
			// its own half, and the white cell the lane was played for is the player's now.
			// Nobody left the board.
			expect(log.moved).toEqual([
				{ id: 'r0', cell: fallenGround('error', 0) },
				{ id: 'p0', cell: wonGround(0) }
			]);
			// Column a, the whole of red's half and so the back of it: the board's own
			// left-hand edge, where a beaten rival stands out the rest of the fight.
			expect(columnLabel(log.moved[0].cell.q)).toBe('a');
			expect(cellSide(log.moved[1].cell.q)).toBe('purple');
		});

		it('asks nothing more of a fighter that has taken the white cell', async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				// Blue both: the free guard sees each through the rivals' opening free shot,
				// so the fight gets to a turn the player can win a lane on.
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue')
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			controller.setAction('p1', 'charge');
			await playTurn(controller);

			// P0 took the white cell its lane was played for, and with it the lane: there is
			// nobody in front of it and never will be, so it stands down for the rest of the
			// fight rather than being given orders that could do nothing.
			expect(log.moved).toEqual([
				{ id: 'r0', cell: fallenGround('error', 0) },
				{ id: 'p0', cell: wonGround(0) }
			]);
			const held = fighterOf(get(controller), 'p0');
			expect(held.holdsGround).toBe(true);
			expect(held.ordered).toBe(true);
			// Nothing is asked of it, and nothing can be given to it either.
			controller.setAction('p0', 'charge');
			expect(fighterOf(get(controller), 'p0').action).toBeNull();
			// And the turn is waiting on the fighter that *is* still fighting, alone.
			expect(get(controller).ready).toBe(false);
			controller.setAction('p1', 'defend');
			expect(get(controller).ready).toBe(true);
		});

		it('walks the rival onto the same white cell when it is the one that wins the lane', async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				// Yellow, so the turn it spends loading it fires nothing back: a colour
				// with a free shot in it would take the rival down with it.
				seed('p0', 'info', 'yellow')
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			controller.setAction('p0', 'charge');
			await playTurn(controller);
			expect(fighterOf(get(controller), 'p0').down).toBe(true);
			// A lane is won on the same ground whoever wins it: the rival takes the white
			// cell, and the player's beaten fighter holds column c, the back of its own half.
			// The ground is not a side's until somebody is standing on it.
			expect(log.moved).toEqual([
				{ id: 'p0', cell: fallenGround('info', 0) },
				{ id: 'r0', cell: wonGround(0) }
			]);
			expect(columnLabel(log.moved[0].cell.q)).toBe('c');
			expect(cellSide(log.moved[1].cell.q)).toBe('purple');
		});

		it('walks a decided lane out as the blow lands, not once the whole volley is over', async () => {
			// Two lanes decided in one volley, played one after the other. The first lane's
			// two fighters must have moved before the second lane's attacker has even set
			// off: a hit is the moment a lane is decided, so it is the moment the board says
			// so. Gathered up and walked out at the end of the turn instead, a fighter would
			// still be standing on ground it had lost three attacks earlier.
			const calls: string[] = [];
			const board = new Proxy(
				{},
				{
					get:
						(_target, property) =>
						(...args: unknown[]) => {
							calls.push(String(property) + (typeof args[0] === 'string' ? `:${args[0]}` : ''));
							return Promise.resolve();
						}
				}
			) as unknown as Parameters<CombatController['attachBoard']>[0];
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				// Yellow: no free guard, so each rival's opening free shot fells the fighter
				// opposite it and both lanes are settled in the one volley.
				seed('p0', 'info', 'yellow'),
				seed('p1', 'info', 'yellow')
			]);
			controller.attachBoard(board);
			controller.setAction('p0', 'charge');
			controller.setAction('p1', 'charge');
			await playTurn(controller);

			expect(fighterOf(get(controller), 'p0').down).toBe(true);
			expect(fighterOf(get(controller), 'p1').down).toBe(true);
			const settled = calls.findIndex((call) => call.startsWith('regroup'));
			const nextLane = calls.indexOf('closeIn:r1');
			expect(settled).toBeGreaterThan(-1);
			expect(nextLane).toBeGreaterThan(-1);
			expect(settled).toBeLessThan(nextLane);
			// Both of the first lane's fighters moved, and they moved on that blow.
			expect(calls.slice(settled, nextLane)).toEqual(
				expect.arrayContaining(['regroup:p0', 'regroup:r0'])
			);
		});

		it("leaves the ground alone when a lane's two shots cancel", async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				seed('p0', 'info', 'yellow')
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			// Both are loaded and both fire, so the two shots stop each other: nobody fell,
			// so nobody won that ground and nobody is walked anywhere.
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'r0').down).toBe(false);
			expect(fighterOf(state, 'p0').down).toBe(false);
			expect(log.moved).toEqual([]);
		});

		it('moves nobody in the lanes the volley did not decide', async () => {
			const log = boardLog();
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				// Blue both, so each turns the rivals' answering shot aside and lane 1 is
				// left standing exactly as it was.
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue')
			]);
			controller.attachBoard(fakeBoard(log));
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			// Lane 0 was decided and only lane 0 moved — both of its fighters, nobody else's.
			expect(log.moved).toEqual([
				{ id: 'r0', cell: fallenGround('error', 0) },
				{ id: 'p0', cell: wonGround(0) }
			]);
		});
	});

	describe('the score', () => {
		it('opens at nothing apiece', () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				seed('p0', 'info', 'blue'),
				seed('p1', 'info', 'blue')
			]);
			expect(get(controller).wins).toEqual({ info: 0, error: 0 });
		});

		it('counts an encounter to whoever is left standing in it', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				seed('p0', 'info', 'blue'), // takes its own lane and survives the answer
				seed('p1', 'info', 'yellow') // caught loading, with nothing to turn the shot aside
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			const state = get(controller);
			expect(fighterOf(state, 'r0').down).toBe(true);
			expect(fighterOf(state, 'p1').down).toBe(true);
			// One each: P0 took its lane, R1 took the other.
			expect(state.wins).toEqual({ info: 1, error: 1 });
		});

		it('gives an encounter to neither side while it is still standing', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'yellow'),
				seed('p0', 'info', 'yellow')
			]);
			await openWithCharges(controller);
			// The whole lane fired and the shots cancelled: an encounter is won by being the
			// one left standing in it, and both of these are.
			controller.setAction('p0', 'shoot');
			await playTurn(controller);
			expect(get(controller).wins).toEqual({ info: 0, error: 0 });
		});

		it('calls the fight as soon as every encounter is settled, on the score', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('r1', 'error', 'red'),
				seed('p0', 'info', 'blue'), // takes its lane and lives
				seed('p1', 'info', 'yellow') // loses its own
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			controller.setAction('p1', 'charge');
			await playTurn(controller);
			const state = get(controller);
			// Both lanes are decided on the one volley, and both sides still have a
			// fighter standing — the fight is over all the same, and it is a draw.
			expect(state.wins).toEqual({ info: 1, error: 1 });
			expect(state.turn).toBe(2);
			expect(state.outcome).toBe('draw');
			expect(state.phase).toBe('done');
		});
	});

	/**
	 * Best of three. Each case is set up by resuming a board rather than played there
	 * from turn one: the rivals' orders are part of a saved board, so a fight can be
	 * stood up on the exact position the rule is about and one turn played over it.
	 *
	 * Everybody is yellow throughout — the one colour that hands over neither a shot nor
	 * a guard — so nothing fires or blocks except what each case orders.
	 */
	describe('two encounters, and the fight is over', () => {
		const line = [
			seed('r0', 'error', 'yellow'),
			seed('r1', 'error', 'yellow'),
			seed('r2', 'error', 'yellow'),
			seed('p0', 'info', 'yellow'),
			seed('p1', 'info', 'yellow'),
			seed('p2', 'info', 'yellow')
		];

		/** One fighter of a saved board: standing, empty and unordered unless said. */
		const at = (
			side: 'error' | 'info',
			slot: number,
			spawnId: string,
			state: Partial<BattleFighterSnapshot> = {}
		): BattleFighterSnapshot => ({
			side,
			slot,
			spawnId,
			charges: 0,
			down: false,
			spent: [],
			action: null,
			cell: null,
			...state
		});

		const from = (fighters: BattleFighterSnapshot[]): BattleBoardSnapshot => ({
			turn: 4,
			fighters
		});

		it('ends it the moment the player has taken the second rival down', async () => {
			// One lane already won, one about to be: P1 is loaded and R1 is spending the
			// turn loading, with nothing to turn a shot aside.
			const controller = new CombatController(
				line,
				from([
					at('error', 0, 'r0', { down: true }),
					at('error', 1, 'r1', { action: 'charge' }),
					at('error', 2, 'r2', { action: 'charge' }),
					at('info', 0, 'p0'),
					at('info', 1, 'p1', { charges: 1 }),
					at('info', 2, 'p2')
				])
			);
			controller.setAction('p0', 'charge');
			controller.setAction('p1', 'shoot');
			controller.setAction('p2', 'charge');
			await playTurn(controller);

			const state = get(controller);
			expect(fighterOf(state, 'r1').down).toBe(true);
			expect(state.wins).toEqual({ info: 2, error: 0 });
			expect(state.outcome).toBe('win');
			expect(state.phase).toBe('done');
			// The third encounter is never played: two of three cannot be caught, so the
			// last lane is left standing exactly as it was.
			expect(fighterOf(state, 'p2').down).toBe(false);
			expect(fighterOf(state, 'r2').down).toBe(false);
		});

		it('ends it just as flatly when the rivals take the second', async () => {
			const controller = new CombatController(
				line,
				from([
					at('error', 0, 'r0', { action: 'charge' }),
					at('error', 1, 'r1', { charges: 1, action: 'shoot' }),
					at('error', 2, 'r2', { action: 'charge' }),
					at('info', 0, 'p0', { down: true }),
					at('info', 1, 'p1'),
					at('info', 2, 'p2')
				])
			);
			// P1 spends the turn loading, which is what being caught by a shot is.
			controller.setAction('p1', 'charge');
			controller.setAction('p2', 'charge');
			await playTurn(controller);

			const state = get(controller);
			expect(fighterOf(state, 'p1').down).toBe(true);
			expect(state.wins).toEqual({ info: 0, error: 2 });
			expect(state.outcome).toBe('lose');
			expect(state.phase).toBe('done');
			expect(fighterOf(state, 'p2').down).toBe(false);
			expect(fighterOf(state, 'r2').down).toBe(false);
		});

		it('plays on at one encounter each, because neither has two', async () => {
			const controller = new CombatController(
				line,
				from([
					at('error', 0, 'r0', { down: true }),
					at('error', 1, 'r1', { action: 'charge' }),
					at('error', 2, 'r2', { action: 'charge' }),
					at('info', 0, 'p0'),
					at('info', 1, 'p1', { down: true }),
					at('info', 2, 'p2')
				])
			);
			controller.setAction('p0', 'charge');
			controller.setAction('p2', 'charge');
			await playTurn(controller);

			const state = get(controller);
			expect(state.wins).toEqual({ info: 1, error: 1 });
			// A lane apiece is not a majority of three: the last one still decides it.
			expect(state.outcome).toBeNull();
			expect(state.phase).toBe('planning');
			expect(state.turn).toBe(5);
		});
	});

	describe('the report', () => {
		it('says nothing at all until the game is decided', () => {
			const controller = new CombatController([
				seed('r0', 'error', 'blue'),
				seed('p0', 'info', 'blue')
			]);
			expect(controller.report()).toBeNull();
		});

		it('states the player side only, standing or down', async () => {
			const controller = new CombatController([
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'yellow'),
				seed('p1', 'info', 'red')
			]);
			// Both lines load on the opening turn, and the rival's colour turns that into a
			// shot P0 has nothing to answer with: its lane is settled, P1's was never
			// anybody's (the rival line is a fighter short), so the fight is called at once.
			await openWithCharges(controller);

			const report = controller.report()!;
			expect(report.outcome).toBe('lose');
			expect(report.fighters).toHaveLength(2);
			expect(report.fighters.map((f) => f.spawnId).sort()).toEqual(['p0', 'p1']);
			// A fighter is standing or it is not: no half-measures either way.
			const p0 = report.fighters.find((f) => f.spawnId === 'p0')!;
			const p1 = report.fighters.find((f) => f.spawnId === 'p1')!;
			expect(p0).toEqual({ spawnId: 'p0', down: true });
			expect(p1).toEqual({ spawnId: 'p1', down: false });
			// The rivals are not listed — they are not this player's cards — but they are
			// counted, because a loss is paid ten for each of them that went down. This one
			// took none with it.
			expect(report.rivalsDefeated).toBe(0);
		});

		it('counts the rivals that went down, which is what a loss is paid for', async () => {
			const controller = new CombatController([
				// The lane of "takes down a fighter caught reloading": red spends its free
				// shot on blue's free guard, and is caught empty on the turn after.
				seed('r0', 'error', 'red'),
				seed('p0', 'info', 'blue')
			]);
			await openWithCharges(controller);
			controller.setAction('p0', 'shoot');
			await playTurn(controller);

			const report = controller.report()!;
			expect(report.fighters).toEqual([{ spawnId: 'p0', down: false }]);
			// One rival, and it is down: the count is of the other side's fallen, whoever
			// the fight ended up going to.
			expect(report.rivalsDefeated).toBe(1);
		});
	});
});
