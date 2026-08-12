import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	CombatController,
	RIVAL_CELLS,
	type CombatAction,
	type CombatState,
	type FighterSeed,
	type FighterView
} from '$services/combat.controller';
import type { CombatColor } from '$types/character-definition.type';
import type { BattleBoardSnapshot } from '$types/battle.type';
import type { MugenBoard } from '$utils/mugen/mugen-board';
// A turn is committed and then pressed on from, row by row — see the helper, which is where
// what "a turn played out" means is written down for the whole combat suite.
import { playTurn, settleTurn } from './play-turn';

/** Three a side, in line-up order: the first three colours are the rivals', the
 * last three the player's. */
function seeds(colors: CombatColor[]): FighterSeed[] {
	const make = (side: 'error' | 'info', i: number, offset: number): FighterSeed => ({
		id: `${side}:${i}`,
		spawnId: `${i}`,
		name: `${side}-${i}`,
		side,
		color: colors[offset + i],
		moves: []
	});
	return [0, 1, 2]
		.map((i) => make('error', i, 0))
		.concat([0, 1, 2].map((i) => make('info', i, 3)));
}

/**
 * A tap on one of the buttons under a fighter, played exactly as `CombatArena` plays
 * it: there are three buttons and each is one of the three orders. What a colour adds
 * on top is passive — never tapped for — so a tap is only ever the order itself.
 */
function tap(controller: CombatController, fighter: FighterView, order: CombatAction): void {
	controller.setAction(fighter.id, order);
}

const playerFighters = (controller: CombatController): FighterView[] =>
	get(controller).fighters.filter((fighter) => fighter.side === 'info' && !fighter.down);

/**
 * A board that draws nothing and records what it was asked to do. Every call
 * answers with a settled promise, so the controller's beats play out at once.
 */
function recordingBoard(): { calls: string[]; board: MugenBoard } {
	const calls: string[] = [];
	const board = new Proxy(
		{},
		{
			get:
				(_target, property) =>
				(...args: unknown[]) => {
					calls.push(String(property) + (typeof args[1] === 'string' ? `:${args[1]}` : ''));
					return Promise.resolve();
				}
		}
	);
	return { calls, board: board as MugenBoard };
}

/**
 * A turn is timed — the beats it holds between its blows, and the one it holds on each row
 * nothing was thrown down — so every test here runs the clock rather than waiting on it, as
 * the rest of the combat suite does. Polling in real time made the length of a turn the
 * length of the test: a turn where all three rows stand off is several seconds of nothing.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());


describe('CombatController — giving orders', () => {
	afterEach(() => vi.restoreAllMocks());

	it('refuses the sword to a fighter with nothing banked, whatever its colour', () => {
		// Nobody opens armed: a colour's free charge is a gift like any other and has to
		// be given on a turn spent elsewhere, so turn one has no shot in it for anybody.
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'orange', 'orange', 'orange'])
		);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'shoot');
		for (const fighter of playerFighters(controller)) {
			expect(fighter.action).toBeNull();
			expect(fighter.ordered).toBe(false);
		}
		expect(get(controller).ready).toBe(false);
	});

	it('takes the sword as the order itself, never as something on top of one', async () => {
		// Orange carries red's free shot, which used to be bought by tapping the sword on
		// top of another order. It is passive now: the sword is Shoot and nothing else.
		//
		// Two turns spent loading, because the first of them is the one that free shot goes
		// off on — a charge is banked before the volley, so the gift fires out of it and
		// leaves the fighter empty again. The second turn is the one it keeps a charge from,
		// with nothing owed any more. The rivals are pinned to the timid end of their
		// weighted picks so that nothing is fired back while that happens.
		vi.spyOn(Math, 'random').mockReturnValue(0.99);
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'orange', 'blue', 'blue'])
		);
		const red = () => playerFighters(controller).find((fighter) => fighter.color === 'orange')!;
		for (let turn = 0; turn < 2; turn++) {
			for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
			await playTurn(controller);
		}
		expect(red().charges).toBe(1);

		// Cover, then tap the sword: the sword replaces the cover rather than riding it.
		tap(controller, red(), 'defend');
		expect(red().action).toBe('defend');
		tap(controller, red(), 'shoot');
		expect(red().action).toBe('shoot');
		// And tapping it again leaves it exactly where it was — there is nothing to undo.
		tap(controller, red(), 'shoot');
		expect(red().action).toBe('shoot');
		expect(red().ordered).toBe(true);
	});
});

describe('CombatController — the fight as it thins', () => {
	/**
	 * Who each fighter faces, worked out from the line-ups alone: the fight is three
	 * private duels, one per slot, and a slot is a fighter's for the whole fight. So
	 * the two in a lane face each other while both stand, and once either falls that
	 * lane is over — nobody is handed a new opposite by a death anywhere on the board.
	 * Derived here independently of the controller, which must agree with it.
	 */
	function facingByLane(state: CombatState): Map<string, string | null> {
		const lines = {
			error: state.fighters.filter((fighter) => fighter.side === 'error'),
			info: state.fighters.filter((fighter) => fighter.side === 'info')
		};
		const facing = new Map<string, string | null>();
		for (const side of ['error', 'info'] as const) {
			const across = side === 'error' ? lines.info : lines.error;
			lines[side].forEach((fighter, lane) => {
				const other = across[lane];
				facing.set(fighter.id, fighter.down || !other || other.down ? null : other.id);
			});
		}
		return facing;
	}

	/** Play a whole fight through the buttons, asserting on every turn that the side is
	 * commitable and that nobody is aimed at anyone but the fighter across from it. */
	async function playOut(colors: CombatColor[], pick: (fighter: FighterView) => CombatAction) {
		const controller = new CombatController(seeds(colors));
		let sawLoss = false;
		// What each standing player faced last turn, to catch any re-pairing at all.
		let facedBefore = new Map<string, string | null>();
		for (let turn = 0; turn < 30; turn++) {
			const state = get(controller);
			if (state.outcome) break;
			sawLoss ||= state.fighters.some((fighter) => fighter.side === 'info' && fighter.down);

			const byLane = facingByLane(state);
			for (const fighter of state.fighters) {
				expect(`${fighter.id} faces ${fighter.opponentId}`).toBe(
					`${fighter.id} faces ${byLane.get(fighter.id) ?? null}`
				);
			}
			// A fighter's opposite never changes hands: it is the one it always had, or
			// none at all once that one has fallen. It is never somebody else.
			for (const fighter of state.fighters) {
				if (fighter.side !== 'info' || fighter.down) continue;
				const before = facedBefore.get(fighter.id);
				if (!before) continue;
				expect([before, null]).toContain(fighter.opponentId);
			}
			facedBefore = new Map(
				state.fighters
					.filter((fighter) => fighter.side === 'info' && !fighter.down)
					.map((fighter) => [fighter.id, fighter.opponentId])
			);

			for (const fighter of playerFighters(controller)) tap(controller, fighter, pick(fighter));
			expect(get(controller).ready).toBe(true);
			await playTurn(controller);
		}
		return sawLoss;
	}

	it('stays commitable, and keeps everyone in their lane, as fighters fall', async () => {
		let sawLoss = false;
		for (const colors of [
			['red', 'yellow', 'blue', 'red', 'yellow', 'blue'],
			['orange', 'purple', 'green', 'orange', 'purple', 'green'],
			['red', 'red', 'red', 'red', 'red', 'red'],
			['blue', 'blue', 'blue', 'blue', 'blue', 'blue']
		] as CombatColor[][]) {
			// Fire whenever there is a shot in hand, load otherwise — the fastest way to
			// thin both sides out.
			sawLoss ||= await playOut(colors, (fighter) => (fighter.canShoot ? 'shoot' : 'charge'));
		}
		// The point of the run: it went past a fighter of the player's going down.
		expect(sawLoss).toBe(true);
	}, 120000);

	it('opens with each line facing the one across from it', () => {
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'blue', 'blue', 'blue'])
		);
		const state = get(controller);
		// Top→bottom on screen, a fighter faces its opposite number in the other line.
		for (let slot = 0; slot < 3; slot++) {
			expect(state.fighters.find((f) => f.id === `info:${slot}`)?.opponentId).toBe(
				`error:${slot}`
			);
			expect(state.fighters.find((f) => f.id === `error:${slot}`)?.opponentId).toBe(
				`info:${slot}`
			);
		}
	});
});

describe('CombatController — giving the fight up', () => {
	it('ends it as a loss, reported with the team as it stood', () => {
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'blue', 'blue', 'blue'])
		);
		controller.concede();

		const state = get(controller);
		expect(state.phase).toBe('done');
		expect(state.outcome).toBe('lose');
		// Nobody is knocked down for it: what is claimed is the loss, and the fighters
		// are reported standing because that is how they were left.
		expect(state.fighters.filter((fighter) => fighter.down)).toHaveLength(0);
		const report = controller.report();
		expect(report?.outcome).toBe('lose');
		expect(report?.fighters).toEqual([
			{ spawnId: '0', down: false },
			{ spawnId: '1', down: false },
			{ spawnId: '2', down: false }
		]);
		// Nobody was knocked down on the other side either, so a fight given up on turn
		// one is worth nothing: a loss is paid for the rivals it felled on the way out.
		expect(report?.rivalsDefeated).toBe(0);
	});

	it('is only taken between turns, and only once', async () => {
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'blue', 'blue', 'blue'])
		);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
		controller.commit();
		// Mid-volley: the turn is still being carried out and will settle the fight
		// itself, so it is not given up over the top of it.
		expect(get(controller).phase).toBe('resolving');
		controller.concede();
		expect(get(controller).outcome).toBeNull();

		await settleTurn(controller);
		controller.concede();
		expect(get(controller).outcome).toBe('lose');
		// A fight already over stays as it was called.
		controller.concede();
		expect(get(controller).outcome).toBe('lose');
	});
});

describe('CombatController — a turn walked through an encounter at a time', () => {
	afterEach(() => vi.restoreAllMocks());

	/** Three lanes of blue against blue, everybody loading: three rows, nothing thrown down
	 * any of them, and so three encounters with nothing else in the turn to confuse them. */
	function quietTurn(): CombatController {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const controller = new CombatController(
			seeds(['blue', 'blue', 'blue', 'blue', 'blue', 'blue'])
		);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
		controller.commit();
		return controller;
	}

	it('stops at the end of an encounter and waits to be let on', async () => {
		const controller = quietTurn();
		await vi.runAllTimersAsync();

		// The turn is standing still with the row it just played still on the panel.
		expect(get(controller).awaiting).toBe(true);
		expect(get(controller).phase).toBe('resolving');
		const held = get(controller).cue;
		expect(held).not.toBeNull();

		// And running the clock on changes nothing: it is waiting on a person now, not on a
		// beat, which is the whole of what the button on the panel is for.
		await vi.runAllTimersAsync();
		expect(get(controller).cue).toBe(held);
		expect(get(controller).awaiting).toBe(true);
		expect(get(controller).phase).toBe('resolving');
	});

	it('carries on one encounter per press, and hands the turn back at the last of them', async () => {
		const controller = quietTurn();
		await vi.runAllTimersAsync();

		const seen = [get(controller).cue];
		let presses = 0;
		while (get(controller).awaiting && presses < 8) {
			presses++;
			controller.next();
			await vi.runAllTimersAsync();
			if (get(controller).cue) seen.push(get(controller).cue);
		}
		// Three lanes stood off, so three rows were played and three presses walked through
		// them — the last of which handed the turn back rather than opening a fourth row.
		expect(presses).toBe(3);
		expect(new Set(seen.slice(0, 3)).size).toBe(3);
		expect(get(controller).phase).toBe('planning');
		expect(get(controller).turn).toBe(2);
		// Nothing is left waiting between turns: the panel is the player's to plan on.
		expect(get(controller).awaiting).toBe(false);
		expect(get(controller).cue).toBeNull();
	});

	it('lets nothing through when it is not waiting on anybody', async () => {
		const controller = quietTurn();
		await vi.runAllTimersAsync();
		// A second press on a row already let on would take the next row off the screen
		// before it had been read, so a press only ever answers a fight that is waiting.
		controller.next();
		controller.next();
		controller.next();
		await vi.runAllTimersAsync();
		expect(get(controller).phase).toBe('resolving');
		expect(get(controller).awaiting).toBe(true);

		// And between turns it does nothing at all.
		await settleTurn(controller);
		expect(get(controller).phase).toBe('planning');
		const planning = get(controller);
		controller.next();
		expect(get(controller).phase).toBe('planning');
		expect(get(controller).turn).toBe(planning.turn);
	});
});

describe('CombatController — the rivals fight the way their colour does', () => {
	// These pin the rivals' weighted picks; nothing after them should inherit that.
	afterEach(() => vi.restoreAllMocks());

	/** The rivals' orders, which are public exactly while they are being carried out. */
	const rivalOrders = (controller: CombatController): (CombatAction | null)[] =>
		get(controller)
			.fighters.filter((fighter) => fighter.side === 'error')
			.map((fighter) => fighter.action);

	const settle = (controller: CombatController): Promise<void> => settleTurn(controller);

	/**
	 * What three rivals of `rivals` order on a turn where each is loaded, faces somebody
	 * loaded, and is past its opening gift — the one standing where firing and covering
	 * are both worth something, so the only thing left to tell the three apart is the
	 * colour each of them is.
	 *
	 * Reached through a saved board rather than by playing two turns out, because the
	 * fight has to arrive at that standing with all three rivals in the *same* state: a
	 * red one and a blue one left to open the fight themselves would be somewhere else
	 * by turn three, and the comparison would be of the turns they had, not of them.
	 */
	async function ordersUnderThreat(
		rivals: CombatColor[],
		roll: number
	): Promise<(CombatAction | null)[]> {
		const lineup = seeds([...rivals, 'yellow', 'yellow', 'yellow']);
		const opening = new CombatController(lineup).snapshot();
		const armed: BattleBoardSnapshot = {
			turn: 2,
			fighters: opening.fighters.map((fighter) => ({
				...fighter,
				charges: 1,
				// Whatever a fighter's colour granted it, it has had: a gift lasts the opening
				// turn and this board is past it. `restore` keeps only the ones it carried.
				spent: ['charge', 'defend', 'shoot'],
				used: [],
				action: 'defend'
			}))
		};
		vi.spyOn(Math, 'random').mockReturnValue(roll);
		const controller = new CombatController(lineup, armed);
		// A turn everybody covers on: nothing is fired, nobody falls and no charge is spent.
		// It is played only because the orders for the turn after it are decided as it closes.
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'defend');
		await playTurn(controller);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'defend');
		// Committing is what makes those orders public — they are secret while being decided.
		controller.commit();
		const orders = rivalOrders(controller);
		await settle(controller);
		return orders;
	}

	it('leans on the orders its colour grants, so three colours play three fights', async () => {
		// One board, one roll, three rivals: red is the one that fires where the other two
		// cover, because the sword is the order its colour hands out.
		expect(await ordersUnderThreat(['red', 'yellow', 'blue'], 0.6)).toEqual([
			'shoot',
			'defend',
			'defend'
		]);
		// A shorter roll, and yellow — which leans neither way between firing and covering,
		// since neither is what it grants — fires with the plain weights, while blue has
		// already been turned off the sword by leaning on the shield.
		expect(await ordersUnderThreat(['red', 'yellow', 'blue'], 0.5)).toEqual([
			'shoot',
			'shoot',
			'defend'
		]);
		// A compound leaning on both of the two orders in front of it is back where it
		// started, which is right: purple is no keener on the sword than on the shield.
		expect(await ordersUnderThreat(['purple', 'orange', 'green'], 0.6)).toEqual([
			'defend',
			'shoot',
			'defend'
		]);
	});

	it('leans from the opening turn, where the gift is still in hand', async () => {
		// The lean is what the fighter is like and the gift is one use of one order: they
		// last different lengths of time and neither is read off the other. So a blue rival
		// covers on turn one — at this roll a fighter that did not lean would load — even
		// though covering is exactly how it throws its own free guard away. That is the
		// price of a colour meaning one thing all fight instead of two things in sequence.
		vi.spyOn(Math, 'random').mockReturnValue(0.7);
		const controller = new CombatController(seeds(['blue', 'blue', 'blue', 'red', 'red', 'red']));
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
		controller.commit();
		expect(rivalOrders(controller)).toEqual(['defend', 'defend', 'defend']);
		await settle(controller);
	});
});

describe('CombatController — what the board is left showing', () => {
	// One of these pins the rivals' weighted picks; nothing after it should inherit that.
	afterEach(() => vi.restoreAllMocks());

	it('prints no word over the board, whatever the turn amounted to', async () => {
		const { calls, board } = recordingBoard();
		// Red rivals against blue players: each rival banks a charge on turn one and fires
		// the shot its colour owes it out of that charge, and each blue fighter's own free
		// guard turns the bullet aside. A guard doing its work, and a shot that gets through
		// one, are the two loudest things this fight has — and neither is lettered.
		const controller = new CombatController(
			seeds(['red', 'red', 'red', 'blue', 'blue', 'blue'])
		);
		controller.attachBoard(board);

		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
		await playTurn(controller);

		// The turn played out in pictures alone: the brace, the walk, the blow, the slash.
		expect(get(controller).phase).toBe('planning');
		expect(calls.some((call) => call.startsWith('showCallout'))).toBe(false);
		expect(calls.some((call) => call.startsWith('showCellCallout'))).toBe(false);
		// And it did play out — a board that was never driven would pass the above for the
		// wrong reason.
		expect(calls.some((call) => call.startsWith('closeIn'))).toBe(true);
	});

	it('braces a covering fighter before the blow, not after it', async () => {
		// A board that says which fighter each call was about and what it was told — a guard
		// belongs to the fighter holding it, and the whole question here is *when* it starts.
		const calls: string[] = [];
		const board = new Proxy(
			{},
			{
				get:
					(_target, property) =>
					(...args: unknown[]) => {
						calls.push([String(property), ...args.filter((a) => typeof a === 'string')].join(':'));
						return Promise.resolve();
					}
			}
		) as MugenBoard;

		// Red rivals, so each one banks a charge on turn one and spends its colour's free
		// shot out of it — the blows this turn are theirs. Yellow players, so no free guard
		// of their own is in the picture: what turns those shots aside is the order given.
		// A guard is only held where the definition binds one, so everybody carries the
		// defend move a real character's JSON declares.
		const armed = seeds(['red', 'red', 'red', 'yellow', 'yellow', 'yellow']).map((seed) => ({
			...seed,
			moves: [{ name: 'Defend', type: 'defend' as const, source: 'guard-stand' }]
		}));
		const controller = new CombatController(armed);
		controller.attachBoard(board);

		const covering = playerFighters(controller);
		for (const fighter of covering) tap(controller, fighter, 'defend');
		await playTurn(controller);

		// Nothing announced the guard, before the blow or after it: a word at the reveal
		// answers the turn before it is played out, and one afterwards only letters a brace
		// the blow has visibly come off.
		expect(calls.some((call) => call.startsWith('showCallout'))).toBe(false);

		// The guard is up before the attacker has switched into its attack pose — before it
		// has even set off — so the blow is thrown at a fighter already braced. Played the
		// other way round it was a defence that appeared once the attack was over.
		const firstBrace = calls.findIndex((call) => call.startsWith('holdMove'));
		const firstApproach = calls.findIndex((call) => call.startsWith('closeIn'));
		const firstStrike = calls.findIndex((call) => call.startsWith('playMove'));
		expect(firstBrace).toBeGreaterThan(-1);
		expect(firstStrike).toBeGreaterThan(-1);
		expect(firstBrace).toBeLessThan(firstStrike);
		expect(firstBrace).toBeLessThan(firstApproach);

		// The ring, though, is not the pose: it comes up once the attacker is over and
		// throwing, so it reads as the guard answering the blow rather than as something the
		// fighter has been wearing since the orders were read out.
		const firstRing = calls.findIndex((call) => call.startsWith('ringHold'));
		expect(firstRing).toBeGreaterThan(firstApproach);
		expect(firstRing).toBeLessThan(firstStrike);

		for (const fighter of covering) {
			// Each of them was stood in its guard, and *stood* in it — not thrown into it and
			// dropped, which is what playing the pose as a one-shot amounted to — and each was
			// ringed in its own colour when the blow came in.
			expect(calls).toContain(`holdMove:${fighter.id}`);
			expect(calls).toContain(`ringHold:${fighter.id}:${fighter.color}`);
			expect(calls).not.toContain(`playMove:${fighter.id}`);
		}

		// And let out of it as the blow it answered ends: the brace and its ring come down at
		// the moment the attacker turns for home, so the fighter is standing in its idle
		// again for the walk back rather than frozen mid-block with nothing coming at it.
		const firstRelease = calls.findIndex((call) => call.startsWith('clearHold:'));
		const firstHome = calls.findIndex((call) => call.startsWith('returnHome'));
		expect(firstRelease).toBeGreaterThan(firstStrike);
		expect(firstRelease).toBeLessThan(firstHome);
		for (const fighter of covering) expect(calls).toContain(`clearHold:${fighter.id}`);

		// And let out of it again as the next turn's orders are asked for, so nobody is left
		// braced — or ringed — into a turn they have not been given an order in yet.
		expect(get(controller).phase).toBe('planning');
		expect(calls.lastIndexOf('clearHolds')).toBeGreaterThan(
			calls.findLastIndex((call) => call.startsWith('holdMove'))
		);
	});

	it('plays a clash as the meeting itself, with nothing said over it', async () => {
		// The rivals' choices are weighted picks, so they are pinned: with random at zero a
		// rival holding a charge and facing somebody who holds one fires. Both lines fire
		// across every lane, which is three clashes.
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const calls: { method: string; args: unknown[] }[] = [];
		const board = new Proxy(
			{},
			{
				get:
					(_target, property) =>
					(...args: unknown[]) => {
						calls.push({ method: String(property), args });
						return Promise.resolve();
					}
			}
		) as MugenBoard;

		// Yellow throughout: no free shot on either side, so nothing fires until a charge has
		// been banked by hand and both lines fire on the same turn.
		const controller = new CombatController(
			seeds(['yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow'])
		);
		controller.attachBoard(board);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'charge');
		await playTurn(controller);
		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'shoot');
		calls.length = 0;
		await playTurn(controller);

		// Nothing is lettered — neither over the ground the pair meet on nor over either of
		// their heads. The picture is the whole account: they walk out together and strike
		// together, and nobody goes down.
		expect(calls.some((call) => call.method === 'showCellCallout')).toBe(false);
		expect(calls.some((call) => call.method === 'showCallout')).toBe(false);

		// One lane at a time, and each of them played as a meeting: the pair walk out to each
		// other first and only then throw, which is what a clash looks like without a word on
		// it. Three lanes, so three meetings, and no blow got through any of them.
		const met = calls.filter((call) => call.method === 'meleeApproach');
		expect(met).toHaveLength(RIVAL_CELLS.length);
		expect(calls.findIndex((call) => call.method === 'meleeApproach')).toBeLessThan(
			calls.findIndex((call) => call.method === 'playMove')
		);
		expect(calls.some((call) => call.method === 'showHit')).toBe(false);

		// What IS shown is the pair of sprays: a blow stopped by another blow gets nowhere,
		// exactly as one a shield turned does, so each of the two is drawn as a rival that had
		// blocked would have been — two bursts a lane, each carrying the colour of whoever
		// threw the blow it is about, which is what sends a fighter's own colour back at it.
		const parried = calls.filter((call) => call.method === 'showParry');
		expect(parried).toHaveLength(RIVAL_CELLS.length * 2);
		// And thrown as the blows are, not after them: a spray that arrived once both had
		// swung and stopped would be saying so about something already over.
		expect(calls.findIndex((call) => call.method === 'showParry')).toBeLessThan(
			calls.findIndex((call) => call.method === 'playMove')
		);
	});

	it('leaves a covering fighter nobody shot at standing as it was', async () => {
		const calls: string[] = [];
		const board = new Proxy(
			{},
			{
				get:
					(_target, property) =>
					(...args: unknown[]) => {
						calls.push([String(property), ...args.filter((a) => typeof a === 'string')].join(':'));
						return Promise.resolve();
					}
			}
		) as MugenBoard;

		// Blue on both sides: a colour with no free shot in it, so nobody can fire on turn
		// one — a shot is paid for out of a charge, and nobody opens holding one.
		const armed = seeds(['blue', 'blue', 'blue', 'blue', 'blue', 'blue']).map((seed) => ({
			...seed,
			moves: [{ name: 'Defend', type: 'defend' as const, source: 'guard-stand' }]
		}));
		const controller = new CombatController(armed);
		controller.attachBoard(board);

		for (const fighter of playerFighters(controller)) tap(controller, fighter, 'defend');
		await playTurn(controller);

		// A fighter braced against a shot nobody fired spent its turn doing nothing visible,
		// which is exactly what it did: no pose, no ring, no word. The turn it was covering
		// in is over and the board never had to say so.
		expect(calls.some((call) => call.startsWith('holdMove'))).toBe(false);
		expect(calls.some((call) => call.startsWith('ringHold'))).toBe(false);
		expect(calls.some((call) => call.startsWith('showCallout'))).toBe(false);
	});
});
