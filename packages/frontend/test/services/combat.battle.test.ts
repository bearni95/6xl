import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	boardFitsLineup,
	CombatController,
	fallenColumn,
	PLAYER_CELLS,
	RIVAL_CELLS,
	WON_COLUMN,
	type CombatState,
	type FighterSeed,
	type FighterView
} from '$services/combat.controller';
import { cellScreenY } from '$utils/mugen/mugen-board';
import { FIRST_COLUMN, LAST_COLUMN } from '$utils/mugen/grid';
import type { CombatColor } from '$types/character-definition.type';
import type { BattleBoardSnapshot } from '$types/battle.type';

/** Three a side, in line-up order: the first three colours are the rivals', the
 * last three the player's. Mirrors the seeding in combat.controller.test. */
function seeds(colors: CombatColor[]): FighterSeed[] {
	const make = (side: 'error' | 'info', i: number, offset: number): FighterSeed => ({
		id: `${side}:${i}`,
		spawnId: `${side}-spawn-${i}`,
		name: `${side}-${i}`,
		side,
		color: colors[offset + i],
		moves: []
	});
	return [0, 1, 2]
		.map((i) => make('error', i, 0))
		.concat([0, 1, 2].map((i) => make('info', i, 3)));
}

const COLORS: CombatColor[] = ['red', 'yellow', 'blue', 'red', 'yellow', 'blue'];

/** Play `turns` turns out, every standing player fighter shooting when it can and
 * charging when it can't — enough to bank charges, spend guards and fell fighters. */
async function playTurns(controller: CombatController, turns: number): Promise<void> {
	for (let turn = 0; turn < turns; turn++) {
		if (get(controller).outcome) return;
		for (const fighter of get(controller).fighters) {
			if (fighter.side !== 'info' || fighter.down) continue;
			controller.setAction(fighter.id, fighter.canShoot ? 'shoot' : 'charge');
		}
		if (!get(controller).ready) return;
		controller.commit();
		while (get(controller).phase === 'resolving') {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}
}

/** Everything about a fighter that a resumed fight has to agree on. */
const readable = (state: CombatState) =>
	state.fighters.map((fighter: FighterView) => ({
		id: fighter.id,
		charges: fighter.charges,
		down: fighter.down,
		spent: [...fighter.spent],
		opponentId: fighter.opponentId,
		canShoot: fighter.canShoot
	}));

describe('CombatController — leaving a fight and coming back to it', () => {
	it('resumes on the turn it was left on, with the fight exactly as it stood', async () => {
		const controller = new CombatController(seeds(COLORS));
		await playTurns(controller, 4);

		const before = get(controller);
		const snapshot = controller.snapshot();
		// Only worth asserting on a fight that actually moved — and one in which some
		// colour's gift has been had, since that is the part of a fighter's state that
		// cannot be worked out again from anything else on the board.
		expect(snapshot.turn).toBeGreaterThan(1);
		expect(before.fighters.some((fighter) => fighter.spent.length > 0)).toBe(true);

		const resumed = new CombatController(seeds(COLORS), snapshot);
		const after = get(resumed);

		expect(after.turn).toBe(before.turn);
		expect(after.phase).toBe('planning');
		expect(after.outcome).toBeNull();
		// Charges, the fallen, the gifts already had, who is left facing whom, and who
		// may fire: all of it comes back, and all of it is derived again from the flags.
		expect(readable(after)).toEqual(readable(before));
		expect(after.wins).toEqual(before.wins);
	}, 120000);

	it('keeps the rivals to the orders they had already committed to', async () => {
		const controller = new CombatController(seeds(COLORS));
		await playTurns(controller, 3);

		const snapshot = controller.snapshot();
		const rivalOrders = snapshot.fighters
			.filter((fighter) => fighter.side === 'error')
			.map((fighter) => `${fighter.slot}:${fighter.action}`);

		const resumed = new CombatController(seeds(COLORS), snapshot);
		const resumedOrders = resumed
			.snapshot()
			.fighters.filter((fighter) => fighter.side === 'error')
			.map((fighter) => `${fighter.slot}:${fighter.action}`);

		// The rivals commit before the player does, so re-rolling them on resume would
		// hand the player a fresh guess at a turn that was already decided.
		expect(resumedOrders).toEqual(rivalOrders);
	}, 120000);

	it('survives a round trip through JSON, which is how it is stored', async () => {
		const controller = new CombatController(seeds(COLORS));
		await playTurns(controller, 5);

		const snapshot = controller.snapshot();
		const stored = JSON.parse(JSON.stringify(snapshot)) as BattleBoardSnapshot;
		const resumed = new CombatController(seeds(COLORS), stored);

		expect(resumed.snapshot()).toEqual(snapshot);
	}, 120000);

	it('starts the fight rather than half-restoring a board that is not this line-up', async () => {
		const controller = new CombatController(seeds(COLORS));
		await playTurns(controller, 4);
		const snapshot = controller.snapshot();

		// The same fight, fielded from different spawns — a team changed since, or a
		// board belonging to another battle altogether.
		const otherSeeds = seeds(COLORS).map((seed) => ({ ...seed, spawnId: `${seed.spawnId}-other` }));
		const fresh = new CombatController(otherSeeds, snapshot);
		const state = get(fresh);

		expect(state.turn).toBe(1);
		expect(state.fighters.every((fighter) => !fighter.down)).toBe(true);
	}, 120000);

	it('draws the fallen of a resumed fight as fallen, without replaying their retreat', async () => {
		const controller = new CombatController(seeds(COLORS));
		await playTurns(controller, 6);
		const snapshot = controller.snapshot();
		const fallen = get(controller)
			.fighters.filter((fighter) => fighter.down)
			.map((fighter) => fighter.id);
		// Nothing to show unless the fight actually took somebody down.
		expect(fallen.length).toBeGreaterThan(0);

		const faded: string[] = [];
		const settled: string[] = [];
		const walked: string[] = [];
		const resumed = new CombatController(seeds(COLORS), snapshot);
		resumed.attachBoard({
			fadeDefeated: (id: string) => faded.push(id),
			settleFallen: (id: string) => settled.push(id),
			regroup: (id: string) => {
				walked.push(id);
				return Promise.resolve();
			},
			showAura: () => Promise.resolve(),
			clearAura: () => {}
		} as unknown as Parameters<CombatController['attachBoard']>[0]);

		// Beaten and standing half out of its cell, which is where the fight left it — and
		// put there outright, since a retreat walked out again on the turn a player reopens
		// the fight would be a fighter falling twice.
		expect(faded.sort()).toEqual([...fallen].sort());
		expect(settled.sort()).toEqual([...fallen].sort());
		expect(walked).toEqual([]);
	}, 120000);

	it('refuses a board with the wrong number of fighters', () => {
		const controller = new CombatController(seeds(COLORS));
		const snapshot = controller.snapshot();
		const short: BattleBoardSnapshot = { turn: 6, fighters: snapshot.fighters.slice(0, 4) };

		expect(get(new CombatController(seeds(COLORS), short)).turn).toBe(1);
	});

	/**
	 * The arena asks the same question before it stands anybody up on a saved board, so
	 * the picture and the fight are decided by one rule: a board good enough to draw but
	 * not good enough to play would put a line-up on ground belonging to another fight.
	 */
	describe('whether a board describes a line-up', () => {
		const lineup = seeds(COLORS).map(({ side, spawnId }) => ({ side, spawnId }));

		it('takes the board the line-up was saved from', () => {
			const controller = new CombatController(seeds(COLORS));
			expect(boardFitsLineup(controller.snapshot(), lineup)).toBe(true);
		});

		it('refuses no board at all, and a board of no turns', () => {
			const snapshot = new CombatController(seeds(COLORS)).snapshot();
			expect(boardFitsLineup(null, lineup)).toBe(false);
			expect(boardFitsLineup({ ...snapshot, turn: 0 }, lineup)).toBe(false);
		});

		it('refuses a board fielded from other spawns, or of another size', () => {
			const snapshot = new CombatController(seeds(COLORS)).snapshot();
			const others = lineup.map((fighter) => ({ ...fighter, spawnId: `${fighter.spawnId}-other` }));

			expect(boardFitsLineup(snapshot, others)).toBe(false);
			expect(boardFitsLineup(snapshot, lineup.slice(0, 5))).toBe(false);
		});

		it('refuses a board whose fighters have swapped lanes', () => {
			const snapshot = new CombatController(seeds(COLORS)).snapshot();
			const swapped = {
				...snapshot,
				fighters: snapshot.fighters.map((fighter) =>
					fighter.side === 'info' ? { ...fighter, slot: 2 - fighter.slot } : fighter
				)
			};

			// Restoring by slot is what keeps the lanes as they were, so a board that
			// numbers them differently is a different fight, not this one rearranged.
			expect(boardFitsLineup(swapped, lineup)).toBe(false);
		});

		it('refuses a board standing a line on ground its side could never hold', () => {
			const snapshot = new CombatController(seeds(COLORS)).snapshot();
			// A fight opened when the lines stood on other columns: its fighters are on
			// ground this game does not use, and standing them back up there would draw a
			// board nobody could be playing. Refused whole, so the fight starts instead.
			const moved = (side: 'info' | 'error', q: number): BattleBoardSnapshot => ({
				...snapshot,
				fighters: snapshot.fighters.map((fighter) =>
					fighter.side === side && fighter.cell
						? { ...fighter, cell: { ...fighter.cell, q } }
						: fighter
				)
			});

			// The other side's half is the one place a fighter can never be found: a lane
			// leaves both of its fighters on their own half or on the white column between
			// them, and nothing in the game walks anybody across.
			expect(boardFitsLineup(moved('info', RIVAL_CELLS[0].q), lineup)).toBe(false);
			expect(boardFitsLineup(moved('error', PLAYER_CELLS[0].q), lineup)).toBe(false);
			expect(boardFitsLineup(moved('info', LAST_COLUMN + 1), lineup)).toBe(false);
			// The three columns a fight actually leaves a fighter on: the one its line opened
			// on, the white one it takes by winning its lane, and the back of its own half it
			// retracts to on losing one.
			expect(boardFitsLineup(moved('info', PLAYER_CELLS[0].q), lineup)).toBe(true);
			expect(boardFitsLineup(moved('info', WON_COLUMN), lineup)).toBe(true);
			expect(boardFitsLineup(moved('info', fallenColumn('info', 0)), lineup)).toBe(true);
			expect(boardFitsLineup(moved('error', RIVAL_CELLS[0].q), lineup)).toBe(true);
			expect(boardFitsLineup(moved('error', WON_COLUMN), lineup)).toBe(true);
			expect(boardFitsLineup(moved('error', fallenColumn('error', 0)), lineup)).toBe(true);
			// The player's line is level, so it retracts to one column on every lane, and
			// that column is the board's own edge.
			expect(PLAYER_CELLS.map((cell) => fallenColumn('info', cell.r))).toEqual([
				LAST_COLUMN,
				LAST_COLUMN,
				LAST_COLUMN
			]);
			// And so is the rival's, on a board whose rows are level: it opens one column,
			// falls back to one column, and that column is the board's other edge. Its
			// middle fighter used to open a column deeper than its castmates, to answer a
			// half-cell stagger the square field does not have.
			expect(RIVAL_CELLS.map((cell) => fallenColumn('error', cell.r))).toEqual([
				FIRST_COLUMN,
				FIRST_COLUMN,
				FIRST_COLUMN
			]);
		});
	});

	/**
	 * The player's line-up out of a board, back in team order — the same mapping
	 * `CombatArena.fieldedTeam` performs, and the one that has to be the exact inverse
	 * of how the arena places a team on the board.
	 */
	const fieldedTeam = (snapshot: BattleBoardSnapshot): string[] =>
		snapshot.fighters
			.filter((fighter) => fighter.side === 'info')
			.sort((a, b) => a.slot - b.slot)
			.map((fighter) => fighter.spawnId);

	it('gives the fielded team back in the order it was fielded', () => {
		// The arena's own placement, replicated: each side fills its column with its lead on
		// the top row and the rest of the party unfolding downwards, and is then seeded in
		// the order it stands top→bottom on screen — so both sides are placed and seeded the
		// same way round, and slot order is team order.
		const team = ['team-a', 'team-b', 'team-c'];
		const place = (ids: string[], cells: typeof PLAYER_CELLS, side: 'error' | 'info') =>
			ids
				.map((spawnId, index) => ({ spawnId, side, gridY: cellScreenY(cells[index]) }))
				.sort((a, b) => a.gridY - b.gridY);
		const seeded = [
			...place(['og-0', 'og-1', 'og-2'], RIVAL_CELLS, 'error'),
			...place(team, PLAYER_CELLS, 'info')
		].map(
			(entry, index): FighterSeed => ({
				id: `${entry.side}:${entry.spawnId}`,
				spawnId: entry.spawnId,
				name: `f${index}`,
				side: entry.side,
				color: 'red',
				moves: []
			})
		);

		// A team read back off its own board must be the team that was put on it. Read in
		// the wrong order it silently moves every fighter into somebody else's duel — and,
		// because the line-up drives the board's identity, makes the board rebuild itself on
		// every save.
		expect(fieldedTeam(new CombatController(seeded).snapshot())).toEqual(team);
	});

	it('faces the two parties lead against lead, and in step down the board', () => {
		// The point of filling both columns the same way round: a lane is a row, so the
		// fighters that share one are the two parties' fighters of the same rank. Lead
		// against lead at the top, and the rest of both parties in step downwards from
		// there.
		RIVAL_CELLS.forEach((rival, rank) => {
			expect(PLAYER_CELLS[rank].r).toBe(rival.r);
		});
		// Read down the screen, each line is its own party in its own order — the top row is
		// rank one on both sides.
		const rows = (cells: typeof PLAYER_CELLS) => cells.map((cell) => cellScreenY(cell));
		expect(rows(PLAYER_CELLS)).toEqual([...rows(PLAYER_CELLS)].sort((a, b) => a - b));
		expect(rows(RIVAL_CELLS)).toEqual([...rows(RIVAL_CELLS)].sort((a, b) => a - b));
	});
});
