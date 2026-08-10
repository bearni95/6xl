/**
 * Combat: the schoolyard stand-off, three a side.
 *
 * The game is the playground one — **charge, defend, shoot** — played by two teams
 * of three at once. Every turn each fighter still standing is given one of those
 * three orders; both sides' orders are locked in blind and carried out together, so
 * a turn is a guess about what the other side is about to do, not a reaction to it.
 *
 *   · **Charge** banks one charge (up to {@link MAX_CHARGES}, which is one — a
 *     fighter is loaded or it is empty). It is the only way to get one, and it leaves
 *     the fighter wide open for the turn it takes.
 *   · **Defend** turns aside every shot aimed at the fighter that turn, but banks
 *     nothing — spend the whole fight defending and you never fire.
 *   · **Shoot** spends a charge and attacks **straight across the lane**: the fighter
 *     walks out of its cell, up to the one opposite, and hits it with its own melee
 *     move. Nobody attacks sideways: the fight is three private duels, each between the
 *     two fighters drawn level with each other, so a turn asks whether to strike, never
 *     at whom — and a lane whose other half has fallen simply has nobody left to go at.
 *     A blow that isn't turned aside takes its target down: **one hit is all it takes**,
 *     whoever it lands on. Two fighters who go at each other in the same turn, though,
 *     set off at the same *moment*: they meet in the middle of the lane and their blows
 *     cancel, so neither gets through and neither fighter falls (see
 *     {@link CombatController.playExchange}). A blow stops a blow — a free attack
 *     included, since a gift is an attack like any other — which is why a lane is never
 *     emptied on both sides at once.
 *
 * What separates one card from another is nothing but its **colour** (see
 * `colorPassives` in @3xl/shared), and what a colour hands over is one of those very
 * three orders, taken for free: red a shot, yellow a charge, blue a defend. It is worth
 * **one use, on the opening turn**: it only comes on a turn the fighter was given
 * something *else* to do — a passive happens beside your order, so it can never be your
 * order — and whatever it has not done by the end of that turn lapses as though it had
 * been spent ({@link CombatController.lapsePassives}). So a colour is what a fighter
 * opens with and not something banked for the turn it would pay best. A compound colour
 * carries both of the primaries it mixes and takes both at once, so it is one very good
 * opening rather than a better card.
 *
 * A fighter's two things therefore happen on the same turn, and they happen **in
 * sequence**: the **charge** — ordered or free — is resolved before everything else,
 * because it is the only order another order needs, and the shots of the turn are fired
 * out of what it banked (see {@link CombatController.bankCharges}). So a red fighter told
 * to load banks the charge and then fires the shot its colour owes it out of that very
 * charge, and an orange one told to cover does it off its own two gifts. Both sides play
 * by this: the rivals' orders are decided blind ({@link CombatController.planRivals}) but
 * they are carried out by the same resolution, gifts and ordering included.
 *
 * The two lines open **face to face across the central white column** — the rivals on
 * column a ({@link RIVAL_CELLS}), the player's fighters on column c, one pair to a row —
 * so that column, which nobody starts on, is the ground
 * being fought over, lane by lane. A lane is settled on
 * the board the turn it is decided: the winner walks up onto that white cell, and the
 * fighter it beat stays on the ground it lost, faded, there being no column behind
 * either line to withdraw into ({@link fallenColumn}). So the board itself shows how the
 * fight is going, with nothing drawn under anybody's
 * feet: there is no health to track, and a fighter holding a charge simply *burns* —
 * an aura in its own colour, lit the turn it loads and out the turn it fires, so who
 * is dangerous can be read off the board at a glance and at any moment.
 *
 * The fight is never to sudden death. It is three encounters, and each one is won by
 * the fighter left standing when the other falls (both falling together is nobody's),
 * so the score — {@link CombatState.wins} — is what decides it. And it is a best of
 * three: {@link ENCOUNTERS_TO_WIN} of them takes it outright, the moment the second one
 * falls. A side two lanes up cannot be caught by the one that is left, so the fight is
 * not made to sit through it — the last duel is left standing where it is, whoever was
 * winning it. Otherwise it is called the moment every encounter is settled, at
 * {@link MAX_TURNS} at the latest, and whenever the player gives it up
 * ({@link CombatController.concede}). Fighting is the game's only
 * source of experience: {@link CombatController.report} then summarises the fight for
 * the `award_combat_exp` RPC, which pays out a share of the player's current level for
 * a win — all of it for a flawless one — ten a fallen rival for a loss, and nothing at
 * all for a draw. The amount is the server's, always; nothing here names one.
 */
import { writable } from 'svelte/store';
import { type Cell, cellSide, isBoardCell } from '$utils/mugen/grid';
import type { MugenBoard } from '$utils/mugen/mugen-board';
import { findMove, type CharacterMove, type CombatColor } from '$types/character-definition.type';
import type { CombatOutcome, CombatReport } from '$types/combat.type';
import type {
	CombatNarrationCue,
	CombatNarrationEvent,
	NarrationPlaceholder
} from '$types/combat-narration.type';
import type { BattleBoardSnapshot, BattleFighterSnapshot } from '$types/battle.type';
import { colorPassives, type PassiveOrder } from '$utils/color/traits';
import { pickWeighted } from '$utils/dice/roll';

/** Blue fighters (`info`) are the player's; red (`error`) are the rivals (CPU). */
export type FighterSide = 'error' | 'info';

/** The three orders of the stand-off. The same three a colour hands over for free
 * ({@link PassiveOrder}) — a passive is not a fourth kind of thing. */
export type CombatAction = PassiveOrder;

/** Orders in the fixed display order the pickers list them in. */
export const COMBAT_ACTIONS: CombatAction[] = ['charge', 'defend', 'shoot'];

/**
 * The most charges a fighter can hold at once. At one, a fighter is simply loaded or
 * empty: there is no hoarding a turn's advantage for later, so every turn spent
 * loading is a turn spent open, and the shot it buys has to be worth that. Charging
 * while already loaded is a wasted turn.
 */
export const MAX_CHARGES = 1;

/**
 * How much heavier an order weighs in a rival's choice for being one its colour grants —
 * see {@link CombatController.favours}. Double, which reads plainly at the table: over a
 * fight a red rival fires about twice as often as it covers where it might have done
 * either, and a blue one covers about twice as often as it fires. It is not so heavy that
 * a colour becomes a script — the two lightest weights the fight uses (`[9, 7, 4]`) leave
 * every order well inside reach whichever way it is doubled — because a rival that only
 * ever did the one thing would be read once and beaten every turn after.
 */
export const RIVAL_FAVOUR = 2;

/**
 * Turns before the stand-off is called. Two sides that only ever charge and defend
 * would circle forever, so the fight is decided on fighters left standing once the
 * clock runs out (an even count is a draw).
 */
export const MAX_TURNS = 20;

/**
 * Encounters that take the fight. Three duels are played at once and two of them are a
 * majority of three, so a side that has won two has won: the third cannot catch it, and
 * a fight is not made better by playing out a lane whose result changes nothing. It ends
 * there, for whichever side gets there first.
 */
export const ENCOUNTERS_TO_WIN = 2;

/**
 * The ground the player's line opens on, listed top→bottom on screen — column c, which is
 * the whole of its own half, one fighter to a row, each facing the rival across the white
 * column on the same row. A fighter holds its own cell until the lane in front of it is
 * decided, and then it either takes that lane's white cell or stands the rest of the fight
 * out where it is (see {@link CombatController.settleLane}).
 *
 * Three a side on a three-row board, so a line is one fighter to every row of it: every
 * lane on the board is fought over, and there is no spare row for a fight to open on
 * nobody.
 */
export const PLAYER_CELLS: Cell[] = [
	{ q: 1, r: 0 },
	{ q: 1, r: 1 },
	{ q: 1, r: 2 }
];

/**
 * The ground the rival line opens on, listed top→bottom on screen — column a, which is the
 * whole of its own half, one fighter to a row, each facing the player across the white column
 * between them. Neither line opens on that white column: it is the ground the lanes are
 * played for, so it starts empty and is only ever stood on by whoever wins a lane (see
 * {@link CombatController.settleLane}) — either line's winner walks up onto it, while
 * the fighter that lost the lane holds the ground it lost, faded and done.
 *
 * One column for all three lanes, mirroring the player's own line. It was not always:
 * the board was a field of hexagons, whose middle row was drawn half a cell right of the
 * two around it, so a line level in columns was not level on screen — the middle lane's
 * pair met half a cell right of where the other two met — and the rival's middle fighter
 * opened a column further back to cancel it. A field of squares has no stagger to answer,
 * so the answer went with it and the line stands level in both senses at once.
 */
export const RIVAL_CELLS: Cell[] = [
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: -1, r: 2 }
];

/**
 * The column a lane is won on: the white one both halves meet at, dead centre of the
 * board. It is the ground every lane is played for, so it starts empty and is only ever
 * stood on by the fighter that has won the lane in front of it — which is what standing
 * there *says*, on either side of the board: this row was ours.
 */
export const WON_COLUMN = 0;

/**
 * The column a fighter stands out the fight on once it has been taken down: the back of
 * its own half, which is the column one further out from the white one than the ground its
 * **own lane** opened on — **when the board has one**. Nobody is ever taken off this board,
 * so being knocked out is a place to stand rather than a disappearance: the fallen give up
 * the ground they were holding, withdraw to the back of their own half, and stay there for
 * the rest of the fight.
 *
 * Today the board does not have one. A half is a single column deep (`grid.ts`'s
 * `FIRST_COLUMN`/`LAST_COLUMN`), so the front of it and the back of it are the same ground and there is
 * nowhere to withdraw *to*: a beaten fighter stands the fight out on the cell it fought on,
 * faded, and the winner walking up onto the white column in front of it is the only thing
 * that moves. Which is the same reading — the ground it was holding was the ground being
 * fought over, and it no longer holds it.
 *
 * Read off the opening ground rather than written down, so a line that opens somewhere
 * else falls back from wherever that is, and asked of a lane and not of a side, so that it
 * stays a step backwards from wherever the fighter making it actually stood. Both lines
 * happen to open level today, so every lane of a side answers the same column — but they
 * have not always ({@link RIVAL_CELLS}), and asked of the side, a line that opened
 * unevenly would send one of its fighters back to the cell it was already standing on. The
 * step is taken only if it lands on the board, so putting a back column behind either line
 * is enough to have the fallen retract into it again.
 */
export function fallenColumn(side: FighterSide, row: number): number {
	const cells = side === 'info' ? PLAYER_CELLS : RIVAL_CELLS;
	const opening = cells.find((cell) => cell.r === row) ?? cells[0];
	const back = opening.q + Math.sign(opening.q);
	return isBoardCell(back, row) ? back : opening.q;
}

/** Animation played when a fighter attacks and its definition binds no melee move. */
const FALLBACK_STRIKE: CharacterMove = { name: 'Strike', type: 'melee', source: '' };

/**
 * A fighter as a line-up identifies it: the line it stands in and the spawn it is
 * fielded from. Everything a saved board is matched against, and no more — what a
 * fighter *is* has nothing to do with whether a board is describing it.
 */
export interface LineupFighter {
	side: FighterSide;
	spawnId: string;
}

/**
 * Whether a fighter of `side` could be standing on `cell` at any point in a fight.
 *
 * A lane leaves each of its two fighters on one of three columns, and a fight only ever
 * moves them once: the one that wins it takes the white column between the lines
 * ({@link WON_COLUMN}), the one that loses it retracts to the back of its own half
 * ({@link fallenColumn}), and until the lane is settled both stand where they opened. All
 * three are its own half or the ground both halves meet on — so what a fighter can never
 * be found on is the *other* side's half, and one saved there is standing on ground this
 * game does not use: a board written by another fight, or by this one when its lines
 * opened somewhere else.
 *
 * A fighter with no cell at all is standing nowhere and so disagrees with nothing.
 */
function standsOnOwnGround(side: FighterSide, cell: { q: number; r: number } | null): boolean {
	if (!cell) return true;
	if (!isBoardCell(cell.q, cell.r)) return false;
	const far = side === 'info' ? 'red' : 'blue';
	return cellSide(cell.q) !== far;
}

/**
 * Whether a saved board describes `lineup` — the fighters in **seed order**, which is
 * the order each side's lanes are numbered in — and describes it standing on this
 * game's ground.
 *
 * A board is only ever taken whole: the same number of fighters, each standing in the
 * lane it was saved in, each fielded from the spawn it was saved with, each on a column
 * its side could have reached ({@link standsOnOwnGround}). Anything else — a team changed
 * since, a board belonging to another battle, a row half-written, a fight opened when the
 * lines stood on other columns — is refused rather than patched in, and the fight is
 * started instead. A half-restored fight would be a different game wearing this one's
 * turn number.
 *
 * It is exported because the fight is not the only thing a board is put back onto: the
 * arena stands the line-up up on the cells that board records, and a board good enough
 * to draw but not good enough to play would show a fight nobody is having. One rule,
 * asked by both.
 */
export function boardFitsLineup(
	snapshot: BattleBoardSnapshot | null,
	lineup: readonly LineupFighter[]
): boolean {
	if (!snapshot || snapshot.turn < 1) return false;
	if (snapshot.fighters.length !== lineup.length) return false;
	const lines: Record<FighterSide, LineupFighter[]> = {
		info: lineup.filter((fighter) => fighter.side === 'info'),
		error: lineup.filter((fighter) => fighter.side === 'error')
	};
	return snapshot.fighters.every(
		(entry) =>
			lines[entry.side]?.[entry.slot]?.spawnId === entry.spawnId &&
			standsOnOwnGround(entry.side, entry.cell)
	);
}

/** The data the page hands the controller for one fighter. */
export interface FighterSeed {
	id: string;
	/** The `character_spawns` row this fighter is fielded from. Both sides carry one
	 * (the two sides can field the same spawn in a mirror match, hence the separate
	 * instance {@link id}); only the player's are ever reported for experience. */
	spawnId: string;
	name: string;
	side: FighterSide;
	/** The character's combat colour — the colour rolled for its Supabase spawn. It
	 * is the whole of what makes this fighter play differently from any other; see
	 * {@link colorPassives}. */
	color: CombatColor;
	/** The moves this character's JSON definition declares (used for animation). */
	moves: CharacterMove[];
}

export interface Fighter extends FighterSeed {
	/** The orders this fighter's colour hands it for free, one per primary it mixes. */
	passives: PassiveOrder[];
	/** Those of them it has already had. Each is worth one use in the whole battle, so
	 * a gift in here is gone for good. */
	spent: PassiveOrder[];
	/**
	 * Those of them that actually *did* something — the free shot that was fired, the
	 * guard that turned a bullet aside, the charge that went into the bank.
	 *
	 * A subset of {@link spent}, and the difference between the two is the difference
	 * between a gift taken and a gift that merely ran out at the end of the turn it was in
	 * hand for ({@link CombatController.lapsePassives}). Nothing in the rules reads it and
	 * nothing on the board draws it: it is the fight's own record of what a colour was
	 * worth, kept because a gift that fired and one that came to nothing are not the same
	 * thing to have happened, whatever the rules make of them afterwards.
	 */
	used: PassiveOrder[];
	/** The board cell it is standing on. Its line-up slot's opening ground until the
	 * lane it fights in is decided, and then whatever ground that left it on — the white
	 * column it won, or the back of its own half (see
	 * {@link CombatController.settleLane}). Every fighter is standing somewhere for the
	 * whole fight; being beaten moves one, it does not take it off the board. */
	cell: Cell;
	/** Charges banked, 0..{@link MAX_CHARGES}. Shooting spends one — the free shot
	 * included: it is the *turn* a colour hands over, never the ammunition. */
	charges: number;
	/** True once a shot has landed on it: it is out of the fight for good. */
	down: boolean;
	/** The order it will carry out this turn, or null before one is given. */
	action: CombatAction | null;
}

/** A fighter as the page renders it. A rival's orders are withheld until they are
 * carried out — the whole game is guessing them. */
export interface FighterView {
	id: string;
	spawnId: string;
	name: string;
	side: FighterSide;
	color: CombatColor;
	/** The free orders its colour granted it — which the board marks with a dot in each of
	 * those orders' own corners, for the opening turn they are in hand for — and those of
	 * them already had. */
	passives: PassiveOrder[];
	spent: PassiveOrder[];
	/** Those its colour actually carried out for it, never secret and never taken back.
	 * See {@link Fighter.used}. */
	used: PassiveOrder[];
	charges: number;
	maxCharges: number;
	down: boolean;
	/** The order this fighter is carrying out, or null — for a rival, null also
	 * means "not yet revealed". */
	action: CombatAction | null;
	/** The fighter directly opposite — the only one it can shoot, and the only one
	 * that can shoot it. Null when its lane has been emptied. */
	opponentId: string | null;
	opponentName: string | null;
	/** Whether Shoot is a legal order for it right now: a charge to spend, and
	 * somebody opposite to spend it on. */
	canShoot: boolean;
	/**
	 * Whether this fighter has taken the white cell its lane was played for and is out of
	 * the turn order for good ({@link CombatController.holdsGround}). Nothing is asked of
	 * it any more: the page draws it no buttons, and it is not one of the fighters the
	 * turn is waiting on.
	 */
	holdsGround: boolean;
	/** Whether its order is complete — given, and firing only when it can. */
	ordered: boolean;
}

export type CombatPhase = 'planning' | 'resolving' | 'done';

export interface CombatState {
	fighters: FighterView[];
	phase: CombatPhase;
	/** 1-based turn number, counted to {@link MAX_TURNS}. */
	turn: number;
	/** Short human-readable line describing what's happening. */
	status: string;
	/** What the turn being resolved amounted to, one line per event. */
	log: string[];
	/**
	 * The encounter being played out, as one line's worth: how the row went and the two
	 * fighters it went that way for. Null between turns, and while a turn is on its way to
	 * its first encounter.
	 *
	 * The fight names the *event* and the fighters; the words for it are authored elsewhere
	 * entirely (`public/combat-narration.json`, via the admin `/narration` screen) and
	 * looked up by the page that draws them. So this is a cue, not a caption: nothing in
	 * here is a sentence, and nothing in the rules ever reads a sentence back. See
	 * `$types/combat-narration.type`.
	 */
	cue: CombatNarrationCue | null;
	/** True when every player fighter still standing has a complete order. */
	ready: boolean;
	/**
	 * Encounters won, per side. The fight is not to sudden death: it is three duels,
	 * and each one is won by whichever fighter is left standing when the other falls —
	 * so this is the score, and the side ahead on it is the side that wins the fight.
	 */
	wins: Record<FighterSide, number>;
	/** Set once the game is over; drives the endgame modal. */
	outcome: CombatOutcome | null;
}

/** One shot fired this turn, resolved after every shot has been fired. */
interface Shot {
	shooter: Fighter;
	target: Fighter;
	/** True for red's extra shot, so the log can name it as such. */
	extra: boolean;
}

/**
 * One thing the shooting of a turn shows: a lone shot, or the two shots of a lane whose
 * fighters both fired — which are one event, because they happened at one moment.
 */
type ShotGroup = [Shot] | [Shot, Shot];

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long the revealed orders are left to be read before the shooting starts. */
const REVEAL_MS = 600;

/** The beat held after each shot has been answered, before the next is taken. */
const SHOT_BEAT_MS = 320;

/**
 * How long a row nothing was thrown down is left standing before the next row is taken.
 *
 * Longer than a shot's beat because it is the whole of that encounter: a blow has a walk
 * out and a strike to be read over, and a lane where both sides only loaded has the aura and
 * nothing else — so the line it is narrated in needs the time to be read on its own.
 */
const QUIET_LANE_MS = 900;

/** 'charge' → 'Charge', for the pickers' labels and the status lines. */
export const actionLabel = (action: CombatAction): string =>
	action.charAt(0).toUpperCase() + action.slice(1);

export class CombatController {
	private board: MugenBoard | null = null;
	private fighters: Fighter[];
	private phase: CombatPhase = 'planning';
	private turn = 1;
	private status = '';
	private log: string[] = [];
	/** The encounter being played out, in words — see {@link CombatState.cue}. */
	private cue: CombatNarrationCue | null = null;
	/** Encounters announced so far this fight. It is what seeds which of an event's
	 * authored lines is picked, so two identical blows are not narrated in identical
	 * words. */
	private cues = 0;
	private outcome: CombatOutcome | null = null;
	/** Which fighters are currently wearing an aura, so it is only redrawn when a
	 * fighter's charges cross between empty and holding something. */
	private readonly aura = new Set<string>();

	private readonly store = writable<CombatState>({
		fighters: [],
		phase: 'planning',
		turn: 1,
		status: '',
		log: [],
		cue: null,
		ready: false,
		wins: { info: 0, error: 0 },
		outcome: null
	});
	/** Svelte store contract, so the page can use `$controller`. */
	readonly subscribe = this.store.subscribe;

	/**
	 * @param seed every fighter of both sides, in **line-up order** within each side —
	 * the top→bottom order that side's characters stand in, which is the order each
	 * side's opening ground ({@link PLAYER_CELLS}, {@link RIVAL_CELLS}) is handed out
	 * in, and so the order the lanes are numbered in.
	 * @param resume a board saved by {@link snapshot} — the fight is picked up on the
	 * turn it was left on instead of started. A snapshot that does not describe this
	 * line-up is ignored and the fight simply starts (see {@link restore}).
	 */
	constructor(seed: FighterSeed[], resume: BattleBoardSnapshot | null = null) {
		const slots = { error: 0, info: 0 };
		this.fighters = seed.map((entry) => {
			const slot = slots[entry.side]++;
			return {
				...entry,
				passives: colorPassives(entry.color),
				spent: [],
				used: [],
				// Where it stands. A line longer than the board's own ground has no cell
				// for its extra fighters — they still fight their lane, they are just not
				// standing anywhere the board can move them to or from.
				cell: (entry.side === 'info' ? PLAYER_CELLS : RIVAL_CELLS)[slot],
				// Everybody opens empty. Yellow's free charge is a charge like any other:
				// it has to be given on a turn spent doing something else, so the fighter
				// that wants it early buys it by covering on turn one.
				charges: 0,
				down: false,
				action: null
			};
		});
		if (!this.restore(resume)) {
			this.planRivals();
			this.status = 'Give each of your fighters an order.';
		}
		this.emit();
	}

	/**
	 * The fight as it stands between turns, small enough to be written back to the
	 * player's open battle twice a turn — as it opens, and again as the orders that close
	 * it are given (see `battle.type`).
	 *
	 * Only what the fight cannot be rebuilt without is in here. Who is fighting comes
	 * back from the line-up the arena fields, and everything derived — the score, whose
	 * lane is settled, who may still shoot, the auras — falls out of these flags again
	 * on the way in. The rivals' orders are included because they are decided *before*
	 * the player gives theirs: a resumed fight that re-rolled them would be a fresh
	 * blind guess, which is not the same turn. The player's own are in here for what
	 * turns out to be the same reason — a turn is written down the moment it is decided
	 * and before it is played out, so a fight picked up mid-volley is picked up on the
	 * turn that was given, with both sides' orders standing, and plays it out from there
	 * ({@link restore} hands it straight back to the arena as a ready one).
	 */
	snapshot(): BattleBoardSnapshot {
		const lines: Record<FighterSide, Fighter[]> = { info: this.players(), error: this.rivals() };
		return {
			turn: this.turn,
			fighters: this.fighters.map((fighter) => ({
				side: fighter.side,
				slot: lines[fighter.side].indexOf(fighter),
				spawnId: fighter.spawnId,
				charges: fighter.charges,
				down: fighter.down,
				spent: [...fighter.spent],
				used: [...fighter.used],
				action: fighter.action,
				// A line longer than the board's ground leaves its extras standing nowhere.
				cell: fighter.cell ? { q: fighter.cell.q, r: fighter.cell.r } : null
			}))
		};
	}

	/**
	 * Put a saved board back onto this line-up, or refuse it whole — see
	 * {@link boardFitsLineup} for what "this line-up" means, which is the one rule both
	 * this and the arena's own placement read.
	 */
	private restore(snapshot: BattleBoardSnapshot | null): boolean {
		if (!boardFitsLineup(snapshot, this.fighters)) return false;
		const board = snapshot as BattleBoardSnapshot;

		const lines: Record<FighterSide, Fighter[]> = { info: this.players(), error: this.rivals() };
		const pairs: [Fighter, BattleFighterSnapshot][] = board.fighters.map((entry) => [
			lines[entry.side][entry.slot],
			entry
		]);

		for (const [fighter, entry] of pairs) {
			fighter.charges = Math.max(0, Math.min(entry.charges, MAX_CHARGES));
			fighter.down = entry.down;
			// Only gifts this colour actually has can have been spent: a board naming
			// one it never carried says nothing about it either way.
			const spent = entry.spent ?? [];
			fighter.spent = fighter.passives.filter((order) => spent.includes(order));
			// A board written before gifts were told apart names none as used, which reads
			// as a fight whose colours did nothing — the marks come back lapsed rather than
			// wrong.
			const used = entry.used ?? [];
			fighter.used = fighter.spent.filter((order) => used.includes(order));
			fighter.action = entry.action;
			// Ground won earlier in the fight, as long as it is ground: a cell the board
			// would refuse leaves the fighter on the one its slot opened on.
			if (entry.cell && isBoardCell(entry.cell.q, entry.cell.r)) fighter.cell = entry.cell;
		}

		this.turn = board.turn;
		this.phase = 'planning';
		// A board with every order already on it is a turn that was given and written down
		// before it was played out: the arena picks that one straight up and plays it, so
		// asking for orders over it would be asking for something already handed in.
		this.status = this.isReady()
			? `Turn ${this.turn} — orders are in.`
			: `Turn ${this.turn} — give your orders.`;
		return true;
	}

	/**
	 * The finished game as an experience claim: the outcome, every fighter the player
	 * fielded — each simply standing or down — and how many of the rivals went down.
	 * There is no health in this game — one hit takes anybody down — so the share of
	 * the level the RPC pays out for a win is the share of the team still on its feet,
	 * counted from these flags. The rival count is the other half of it: a **loss** is
	 * paid ten a fallen rival and nothing else, so a fight lost having taken two of
	 * them with it is still worth something. The rivals themselves are not listed —
	 * they are the town's garrison, not cards this player owns, so there is nothing
	 * about them to name beyond the count.
	 *
	 * Only once the game is actually over, so a fight abandoned mid-turn yields `null`
	 * and pays out nothing. The server re-derives the award from this; nothing here
	 * decides an amount.
	 */
	report(): CombatReport | null {
		if (this.phase !== 'done' || !this.outcome) return null;
		return {
			outcome: this.outcome,
			fighters: this.players().map((fighter) => ({
				spawnId: fighter.spawnId,
				down: fighter.down
			})),
			rivalsDefeated: this.rivals().filter((fighter) => fighter.down).length
		};
	}

	/** Give the controller the running board engine so it can drive it. */
	attachBoard(board: MugenBoard): void {
		this.board = board;
		for (const fighter of this.fighters) {
			// Every fighter of both lines, the fallen included: they are standing at the back
			// of their own half rather than gone, so a resumed fight draws all six of them.
			//
			// The ones that were already down are drawn as down — faded, and pushed out to
			// the outer end of the cell they hold — rather than as fighters merely standing
			// somewhere. The board placed them in the middle of their cells with everybody
			// else, knowing nothing of the fight they are being placed back into, so it is
			// told here and settled without a walk: the retreat is turns old and is not
			// something to play out in front of somebody who has just opened the fight.
			if (fighter.down) {
				this.board.fadeDefeated(fighter.id);
				this.board.settleFallen(fighter.id);
			}
			// Light the aura of anyone holding a charge, so a fight picked up where it
			// was left shows who is dangerous before a single order is given. Never on one
			// that is out of the fight: nothing it is carrying can be fired any more, so a
			// fighter at the back of its half stands there dark whatever its charges say.
			if (!fighter.down && fighter.charges > 0) void this.raiseAura(fighter);
		}
	}

	// --- Orders ---------------------------------------------------------------

	/** Give a player fighter its order for this turn. Freely changed until commit. */
	setAction(id: string, action: CombatAction): void {
		const fighter = this.playerReady(id);
		if (!fighter) return;
		if (action === 'shoot' && !this.canShoot(fighter)) return;
		fighter.action = action;
		this.emit();
	}

	/**
	 * Give the fight up: it is over, and it is a loss.
	 *
	 * A fight cannot be walked out of — the battle is the server's and it is only ended
	 * by a result being reported (see `battle.service`) — so conceding is how a player
	 * gets out of one they do not want to play: it ends here exactly as being wiped out
	 * would, and is reported as the loss it is, which banks no ground and earns what
	 * every loss earns — ten for each rival already down when it was given up, which is
	 * why conceding a fight half fought is worth more than conceding one on turn one.
	 * Nobody is knocked down for it, on either side: everyone is left standing as they
	 * stood, since that is what actually happened.
	 *
	 * Only between turns. Mid-volley the turn is still being carried out and would
	 * settle the fight itself the moment it finished, over the top of this.
	 */
	concede(): void {
		if (this.phase !== 'planning') return;
		this.end('lose', 'You gave the fight up.');
	}

	/** Lock both sides' orders in and carry them out together. */
	commit(): void {
		if (this.phase !== 'planning' || !this.isReady()) return;
		this.phase = 'resolving';
		this.emit();
		void this.resolve();
	}

	// --- Resolution -----------------------------------------------------------

	/**
	 * Carry out the turn both sides committed to.
	 *
	 * The turn *happens* all at once — every charge is spent and every attack is aimed
	 * off the state the orders were given in, before a single blow is measured — but
	 * it is *shown* one attack at a time. A volley resolved simultaneously on screen is
	 * six things to read in one instant and reads as a stutter; taken in turn, each
	 * fighter walks out, strikes, is answered, and is seen to be answered before the
	 * next one sets off.
	 *
	 * Serialising the playback changes nothing about the outcome: the shot list is
	 * fixed before any of it plays, so a fighter felled early in the volley still
	 * throws the attack it had already taken, and only falls when the volley ends.
	 *
	 * The one thing that is *ordered* within a turn is the charge, and it comes first:
	 * see {@link bankCharges}.
	 */
	private async resolve(): Promise<void> {
		// A turn is the first thing that asks the fighters to do anything but stand there.
		// The board shows itself as soon as it can stand them up and loads the walk cycles,
		// the flinch and every move behind the finished picture, so this is where that load
		// has to have landed — normally long since, a player having had to give three
		// orders to get here. Awaited rather than assumed: a turn played over half-loaded
		// artwork is fighters teleporting between cells and throwing nothing.
		await this.board?.whenReady();

		const acting = this.fighters.filter((fighter) => !fighter.down && fighter.action);
		this.log = [];

		// Charges are banked before a single shot is aimed — see bankCharges for why a
		// charge outranks the rest of the turn. Everything below is paid for out of what
		// it leaves banked.
		this.bankCharges(acting);
		// So the loaders are already burning by the time the orders are read out, whether
		// the charge came from the order or from the colour.
		this.syncCharges();

		// Every shot of the turn, aimed straight across the lane and worked out before
		// any of it plays, so who is opposite whom is settled by where everybody stood
		// when the orders were given — not by who has fallen part-way through the volley.
		const shots: Shot[] = [];
		for (const fighter of acting) {
			// A charge is only ever spent on a shot that is actually fired: at the fighter
			// opposite, and only while there is a charge left to pay for it.
			const fire = (extra: boolean): boolean => {
				const target = this.opposite(fighter);
				if (!target || fighter.charges < 1) return false;
				fighter.charges -= 1;
				shots.push({ shooter: fighter, target, extra });
				return true;
			};
			if (fighter.action === 'shoot') {
				fire(false);
			} else if (this.passiveReady(fighter, 'shoot')) {
				// Red's free shot, fired beside whatever the turn was actually spent on.
				// It is only the *turn* that comes free — the charge is paid as ever — so a
				// fighter with nothing banked and nothing loading keeps the gift for a turn
				// it can fire. A turn spent loading is not such a turn: the charge above is
				// already banked, and this is what it pays for.
				if (fire(true)) this.spend(fighter, 'shoot', true);
			}
		}
		// The blows land in the order the fighters stand in — top→bottom down each
		// side's line, red before blue. Nothing about a fighter makes its attack land
		// sooner: the running order is the board's, not a rating's. The one exception is a
		// lane that attacked both ways, whose two blows are one event (see groupShots).

		this.setStatus('Orders are revealed.');
		this.showOrders(acting);
		await pause(REVEAL_MS);

		// The rows nothing was thrown down, said before the shooting starts: they are settled
		// at the reveal — a charge is banked before the volley and a guard nobody fires at is
		// a stance held through it — so by here they are already over, and what is on the
		// board for the rest of the turn is the shooting.
		await this.playQuietLanes(shots);

		for (const group of this.groupShots(shots)) {
			if (group.length === 2) await this.playExchange(group[0], group[1]);
			else await this.playShot(group[0]);
		}

		// The shots have been paid for out of what was banked at the top of the turn, so
		// the auras that are out are the ones that fired. Ground won and given up needs no
		// pass of its own: a lane is settled by the blow that settles it, on the spot (see
		// {@link settleLane}), so by here every fighter is already standing where the turn
		// left it.
		this.syncCharges();

		this.finishTurn();
	}

	/**
	 * Bank every charge the turn produces, before anything else in it happens: the
	 * fighters ordered to load, and the fighters whose colour hands them one for free.
	 *
	 * A charge outranks the rest of a turn because it is the only one of the three orders
	 * another order *needs*: a shot is paid for out of a charge, a guard and a charge are
	 * paid for out of nothing. Resolving it first is what makes a fighter's two things —
	 * the order it was given and the gift its colour throws in — resolve in sequence
	 * rather than in a heap: a red fighter told to load banks the charge and then fires
	 * the free shot out of it, on the one turn, in that order. An orange one told to cover
	 * does the same off its own two gifts.
	 *
	 * A fighter with nowhere to put a charge does not get one. Ordering a charge while
	 * full is a turn thrown away (the turn is still gone), and a *free* charge that lands
	 * on a full fighter is simply not taken — it waits for a turn with room for it, which
	 * is the rule about a gift only being spent on doing something. A fighter about to
	 * fire is full at this moment and empties itself later in the turn, so a colour's
	 * charge keeps for a turn that can hold it rather than quietly re-arming a shooter.
	 */
	private bankCharges(acting: Fighter[]): void {
		for (const fighter of acting) {
			const full = (): boolean => fighter.charges >= MAX_CHARGES;
			if (fighter.action === 'charge') {
				if (full()) this.log.push(`${fighter.name} is already full up on charges.`);
				else fighter.charges += 1;
			}
			// Never both of these: a gift is never the order it was given (passiveReady),
			// so a fighter ordered to load is not also handed one.
			if (this.passiveReady(fighter, 'charge') && !full()) {
				fighter.charges += 1;
				this.spend(fighter, 'charge', true);
				this.log.push(`${fighter.name} banks a free charge.`);
			}
		}
	}

	/**
	 * Say what happened in every row nothing was thrown down.
	 *
	 * A row is an encounter whether or not a blow was thrown in it: two fighters stood across
	 * a lane and each did something — loaded, or covered against a blow that never came, or
	 * one of each. Left out, those rows went by in silence while the noisy ones were narrated,
	 * which read as the game having forgotten to play them; and a turn where *nobody*
	 * attacked said nothing at all, which is the turn a player is most likely to wonder about.
	 *
	 * Unlike a shot there is nothing on the canvas to hang the words on — the aura came up at
	 * the reveal and that is the whole of the picture — so each of these gets a beat of its
	 * own to be read in ({@link QUIET_LANE_MS}). It is the one place the narration lengthens a
	 * turn, and it lengthens the turns that had nothing in them.
	 *
	 * Read down the player's own line, which is the board's top→bottom row order, and a row is
	 * skipped unless **both** its fighters were in the turn with an order: one that is down, or
	 * standing on the ground its lane was played for, is a row already decided, and a decided
	 * row is not an encounter any more.
	 */
	private async playQuietLanes(shots: Shot[]): Promise<void> {
		const fired = new Set<Fighter>();
		for (const shot of shots) {
			fired.add(shot.shooter);
			fired.add(shot.target);
		}
		for (const player of this.players()) {
			const rival = this.counterpart(player);
			if (!rival) continue;
			if (fired.has(player) || fired.has(rival)) continue;
			if (player.down || rival.down || !player.action || !rival.action) continue;
			await this.playQuietLane(player, rival);
		}
	}

	/**
	 * One such row: which of the three it was, and the two names its line is written about.
	 *
	 * The player's own fighter is named first wherever the two did the same thing — there are
	 * no roles to tell them apart then, so the reader's own is the one to lead with. Where they
	 * did different things the names are the roles instead, and which side each is on does not
	 * come into it.
	 */
	private async playQuietLane(player: Fighter, rival: Fighter): Promise<void> {
		const both = (event: CombatNarrationEvent, said: string): void => {
			this.log.push(said);
			this.announce(event, { one: player.name, other: rival.name }, said);
		};
		if (player.action === 'charge' && rival.action === 'charge') {
			both('bothLoad', `${player.name} and ${rival.name} both spend the turn loading.`);
		} else if (player.action === 'defend' && rival.action === 'defend') {
			both('bothCover', `${player.name} and ${rival.name} both cover, and nothing comes.`);
		} else {
			// One of each, in whichever order the lane happens to hold them: the only two
			// orders left are a charge and a guard, a shot being what put a row in the volley.
			const loader = player.action === 'charge' ? player : rival;
			const guard = loader === player ? rival : player;
			const said = `${loader.name} loads while ${guard.name} covers.`;
			this.log.push(said);
			this.announce('loadAgainstCover', { loader: loader.name, guard: guard.name }, said);
		}
		await pause(QUIET_LANE_MS);
	}

	/**
	 * Sort the turn's shots into what is actually played out: mostly one shot at a time,
	 * but a lane whose *both* fighters fired is a single event, because they fired at one
	 * moment. Two shots pair up when each is aimed at the other's shooter, which — since
	 * every shot goes straight across a lane — is the same thing as a lane having fired
	 * both ways. Where the shot came from does not come into it: an ordered shot and a
	 * free one are both attacks, so they pair like any other two.
	 *
	 * A fighter fires at most one shot a turn (a gift is never the order it was given, so
	 * nobody both orders a shot and is handed one), which is why a pair is a pair and not
	 * a tally to be worked through.
	 */
	private groupShots(shots: Shot[]): ShotGroup[] {
		const groups: ShotGroup[] = [];
		const paired = new Set<Shot>();
		for (const shot of shots) {
			if (paired.has(shot)) continue;
			paired.add(shot);
			const back = shots.find(
				(other) =>
					!paired.has(other) && other.shooter === shot.target && other.target === shot.shooter
			);
			if (back) {
				paired.add(back);
				groups.push([shot, back]);
			} else {
				groups.push([shot]);
			}
		}
		return groups;
	}

	/**
	 * A lane that attacked both ways, played as the one thing it is: the two set off at
	 * the same moment, meet in the middle of the lane, and their blows cancel. Neither
	 * gets through, so neither fighter falls.
	 *
	 * Nothing else about the turn is touched by this. The charges are spent — they paid
	 * for the attacks, and the attacks were thrown — and a free attack spent on one of
	 * them stays spent, because meeting the one that was coming for you is the gift doing
	 * something. What is *not* called on is either fighter's guard: a blow stopped by
	 * another blow was never turned aside by anything else, so a free guard is still in
	 * hand afterwards.
	 *
	 * Both are shown at once rather than one after the other — they walk out to meet each
	 * other and strike together, under one word for the pair. Taken in turn they would read
	 * as one fighter attacking and the other answering, which is the one thing a turn given
	 * blind never is.
	 */
	private async playExchange(one: Shot, two: Shot): Promise<void> {
		const named = (shot: Shot) =>
			shot.extra ? `${shot.shooter.name}'s free shot` : `${shot.shooter.name}'s shot`;
		this.announce(
			'exchange',
			{ attacker: one.shooter.name, target: two.shooter.name },
			`${one.shooter.name} and ${two.shooter.name} go at each other at once.`
		);
		this.log.push(`${named(one)} and ${named(two)} meet in the lane — both come to nothing.`);
		// Out to the middle together — neither is walked onto the other, because neither
		// of them got there first — and then both strike at the one moment.
		await this.board?.meleeApproach(one.shooter.id, two.shooter.id);
		// Nothing is said over it. The two of them walking out to the same spot and striking
		// together, with neither going down afterwards, is a collision already told in full;
		// a word printed over the ground only lettered what the picture had just shown.
		// Sparks off both of them as the blows meet, each fighter's own colour coming back at
		// it. A blow stopped by another blow is the same thing, to the one who threw it, as a
		// blow a shield turned: it got nowhere, and what says so on this board is the spray
		// coming back the way it went out. So each of the two is drawn exactly as a rival
		// that had blocked would have been — which is what puts each fighter's colour on the
		// sparks flying at that same fighter.
		//
		// Thrown with the strikes rather than after them: the blows cancel at the moment they
		// are thrown, and sparks that arrived once both had swung and stopped would be saying
		// so about something already over.
		this.board?.showParry(two.shooter.id, { id: one.shooter.id, color: one.shooter.color });
		this.board?.showParry(one.shooter.id, { id: two.shooter.id, color: two.shooter.color });
		await Promise.all([
			this.board?.playMove(one.shooter.id, this.strikeMove(one.shooter)),
			this.board?.playMove(two.shooter.id, this.strikeMove(two.shooter))
		]);
		await Promise.all([
			this.board?.returnHome(one.shooter.id),
			this.board?.returnHome(two.shooter.id)
		]);
		this.emit();
		await pause(SHOT_BEAT_MS);
	}

	/**
	 * One attack, played out on its own, in the order the thing itself happens: the fighter
	 * opposite braces if that is what it chose, the attacker walks out of its cell up to it,
	 * strikes it where it stands, and what the blow amounted to is shown — the brace holding,
	 * or the slash and the fall — before the attacker walks back and the next attack is
	 * thrown. A target already struck earlier in the volley takes this one too — it just
	 * changes nothing, because it was already going down.
	 *
	 * A blow that lands settles the lane *here*, before the next attack is thrown: the
	 * two of them walk their result out where they are standing (see {@link settleLane}),
	 * rather than being left in place for a tidying-up pass at the end of the turn. A hit
	 * is the moment a lane is decided, so it is the moment the board says so — a fighter
	 * that took the ground three attacks ago must not still be standing on the cell it
	 * won it from while the rest of the volley plays out.
	 */
	private async playShot(shot: Shot): Promise<void> {
		const { shooter, target, extra } = shot;
		const from = extra ? `${shooter.name}'s free shot` : `${shooter.name} shoots`;
		// The two names this encounter's one sentence is written about. Nothing is announced
		// yet: what is said about a row is how it went, and how it went is settled by the
		// blow at the end of the walk out (see the branches below). A line put up as the
		// attacker set off would either say nothing yet or give the answer away before the
		// picture had shown it.
		const lane = { attacker: shooter.name, target: target.name };
		this.setStatus(`${shooter.name} goes at ${target.name}.`);

		// The fighter opposite braces first, if covering is what it chose.
		//
		// Nothing about that is decided here — it was decided when the order was given — so
		// there is nothing to wait for: the guard goes up before the attacker has moved,
		// stands through the approach, and is what the blow is thrown *at*. Put after the
		// strike, where the rest of the outcome belongs, it was a defence that appeared once
		// the attack was already over: the two poses played in the order they were written
		// rather than the order they happen in, and the picture read as a fighter bracing
		// against a blow it had just taken.
		//
		// It braces because a blow is coming, though — not because it chose to cover. A
		// covering fighter nobody fires at still shows nothing all turn (see
		// {@link showOrders}). The pose is held rather than thrown, so it stands for as long
		// as the blow it is answering does, and comes down with it — a guard is a thing being
		// done to a shot, not a state the fighter wears until the turn is over. The next shot
		// down this lane braces it again, at that blow's own moment.
		//
		// A guard is a guard whoever paid for it. The free one blue owes is the same defence
		// as the ordered one — it turns this very blow aside, at this very moment — so it is
		// shown as one: the fighter braces, and nothing on the board tells the two apart,
		// only the log. Standing still through a shot it turned aside was the one defence in
		// this fight that was never drawn, which read as a bullet simply missing.
		//
		// Both are settled before the blow is thrown, so both go up before it: whether the
		// gift answers is decided by what the fighter was given and what it is still owed,
		// and neither of those moves while the attacker walks over. What it costs is decided
		// afterwards — a gift is spent when it does something, and this one does.
		const covering = !target.down && target.action === 'defend';
		const braces = covering || this.passiveReady(target, 'defend');
		const guard = braces ? findMove(target, 'defend') : null;
		if (guard) this.board?.holdMove(target.id, guard);

		// Close in, then strike: the blow is awaited to its last frame, so what it did is
		// only said once it has actually been thrown.
		await this.board?.closeIn(shooter.id, target.id);
		// The ring goes round the guard here, on the blow, and not when the pose went up:
		// the stance is the fighter's own doing and has been standing since the orders were
		// given, but the circle is that stance *catching* something, so it belongs to the
		// moment there is something to catch. Drawn with the pose, it was a mark the fighter
		// wore from the reveal onwards, saying a guard was on while nothing was happening to
		// it — and, on the far line, telling the player what a rival had ordered before a
		// shot had been thrown. Put up as the attacker's move plays rather than after it,
		// because a defence that appears once the blow is over is not a defence.
		//
		// The shooter goes with it because a guard is held at somebody: the mark is a third of
		// a circle facing whoever is swinging, and the sparks coming off it are struck in that
		// fighter's colour — a spark belongs to the blow that made it, not to the shield.
		if (guard) {
			this.board?.ringHold(target.id, target.color, { id: shooter.id, color: shooter.color });
		}
		await this.board?.playMove(shooter.id, this.strikeMove(shooter));

		if (target.down) {
			this.log.push(`${from} — ${target.name} was already falling.`);
			this.announce('spent', lane);
		} else if (covering) {
			// The brace is already up, and it is the whole of what the board says: a fighter
			// stood in its guard with the blow coming off it is the block, drawn.
			this.log.push(`${from} at ${target.name}, who blocked it.`);
			this.announce('blocked', lane);
		} else if (this.passiveReady(target, 'defend')) {
			// Blue's free guard. It is only had on a turn the fighter wasn't covering
			// anyway (the branch above), and only spent on a shot it actually turns
			// aside — a quiet turn costs it nothing. The brace is already up, for the
			// same reason an ordered one is: it went up when this blow was thrown.
			this.spend(target, 'defend', true);
			this.log.push(`${from} at ${target.name} — turned aside by its free guard.`);
			this.announce('freeGuard', lane);
		} else {
			target.down = true;
			this.log.push(`${from} — ${target.name} is down.`);
			// The whole encounter in one line, said as the blow lands and left standing over
			// the fall and the ground changing hands after it: those are this same event being
			// shown to its end, not two more things to say (see {@link settleLane}).
			this.announce('hit', lane);
			// Sparks come off it in the colour of whoever's blow got through, and are all that
			// is said about it: the spray, the fighter reeling and then falling out of the lane
			// are the hit — a word over the head of somebody visibly going down added nothing.
			// They are the very sparks a guard throws off, which is the point of them being
			// sparks: the same blow, seen where nothing turned it aside — so they carry on
			// through the fighter instead of coming back at the one who threw it. Hence the
			// shooter, which is what says which way "through" is.
			this.board?.showHit(target.id, { id: shooter.id, color: shooter.color });
			await this.board?.playHurt(target.id);
			// The blow decided the lane, so the lane is walked out now — and the attacker
			// stays where that leaves it rather than going home to a cell it has just won
			// the right to leave.
			await this.settleLane(shooter, target);
			this.emit();
			await pause(SHOT_BEAT_MS);
			return;
		}
		// The blow is over, so the guard is over: the fighter comes out of its brace and out
		// of the ring at the moment the attacker turns for home, and stands in its idle again
		// while the walk back plays. Held to the end of the turn instead, it was a fighter
		// frozen mid-block with nothing coming at it any more, wearing a circle that was
		// answering a shot that had already been turned aside — and the two of them stood
		// like that through every other lane's attack.
		this.board?.clearHold(target.id);
		// Back to its own cell, struck or blocked: the ground a fighter holds is not
		// changed by having gone out to hit somebody, and the next lane's attack is
		// played from the line as it stood.
		await this.board?.returnHome(shooter.id);
		this.emit();
		await pause(SHOT_BEAT_MS);
	}

	/**
	 * Walk out the result of a lane, the moment the blow that decided it lands.
	 *
	 * A lane is a duel over the white cell between the two who stand in it, and one blow
	 * settles it for the whole fight. Both of them are put where the result leaves them, and
	 * together, because it is one event:
	 *
	 *   · **The loser retracts** to the back of its own half ({@link fallenColumn}) — which
	 *     on a board whose halves are one column deep is the cell it is already standing on,
	 *     so what it withdraws by is half a cell: the board draws a beaten fighter at the
	 *     outer end of whatever ground it holds instead of in the middle of it, so it walks
	 *     out to the edge of the board and stands the fight out there with half of itself
	 *     past it (`MugenBoard.fallenDrift`). It is out of the fight, not off the board:
	 *     nothing is ever taken off this board, and a line whose losses had walked out of
	 *     sight would be a line nobody could count. Faded, half a cell out, still there.
	 *   · **The winner takes the white column** ({@link WON_COLUMN}) on that row, on either
	 *     side of the board. Standing there is what says the row was won, so it is the same
	 *     cell and the same move whichever line won it — the ground a lane is played for
	 *     does not belong to a side until somebody is standing on it.
	 *
	 * The winner has just struck from the cell beside the fighter it felled — so its walk is
	 * usually the short glide from being flush against the loser to standing in the middle
	 * of the ground it has taken, one cell off the fighter that stays put. Both cells are
	 * adopted as new homes, so neither fighter is walked back afterwards by anything.
	 *
	 * The lane's row is the loser's: it never moved from the ground it opened on, whereas
	 * the winner is out on a strike run and standing somewhere it does not hold.
	 */
	private async settleLane(winner: Fighter, loser: Fighter): Promise<void> {
		// Out of the fight, so nothing is loading: the aura goes out with the fighter,
		// whatever it was still carrying when the blow landed. And the fighter itself is drawn
		// back a little from here on, as it retracts and for the rest of the fight — a fighter
		// still at full weight reads as one that is merely standing somewhere else.
		//
		// Before the retreat and not after it, because it is what the retreat is walked to:
		// this is where the board learns the fighter is beaten, and a beaten fighter's mark
		// is half a cell further out than the one it is standing on.
		this.dropAura(loser);
		this.board?.fadeDefeated(loser.id);
		const row = loser.cell?.r ?? winner.cell?.r;
		if (row === undefined) return;
		const ground: Cell = { q: WON_COLUMN, r: row };
		const back: Cell = { q: fallenColumn(loser.side, row), r: row };
		if (!isBoardCell(ground.q, ground.r) || !isBoardCell(back.q, back.r)) return;
		// Nothing is said here: the ground changing hands is the end of the encounter whose
		// blow is already on screen in words, and a second line under it would be narrating
		// one thing twice.
		this.setStatus(`${winner.name} takes the ground; ${loser.name} falls back.`);
		winner.cell = ground;
		loser.cell = back;
		// Together: one fighter withdrawing as the other comes forward is a single thing
		// happening, and played one after the other it would read as two.
		await Promise.all([
			this.board?.regroup(loser.id, back),
			this.board?.regroup(winner.id, ground)
		]);
	}

	/**
	 * Put the turn's orders on the board: the loaders flare, and everybody else is left
	 * standing where they are. An attack is not a pose thrown from a cell — it is the walk
	 * out and the blow at the end of it, which is what unfolds after the reveal — and a
	 * guard is not a pose either until there is something to guard against.
	 *
	 * So a **charge** is the only order this shows. A charge produces something the moment
	 * it is given: the fighter is holding a shot it did not have before, and the aura is
	 * that fact, standing until it is spent. Covering produces nothing at all unless a blow
	 * arrives — and if none does, the fighter spent its turn braced against a shot nobody
	 * fired, which is not worth a pose or a word. It braces when it is hit, and only then
	 * (see {@link playShot}).
	 *
	 * And the aura is the whole of what says so — no word goes with it. A charge is the one
	 * order that leaves something standing on the board afterwards, so it is the one order
	 * that needs nothing said about it: the flame comes up off the fighter's feet as the
	 * orders are read out (see the board's `showAura`) and then simply stays, which is both
	 * that this fighter loaded *and* that it is still holding it, told once. `CHARGE` over
	 * its head said the first of those in words that were gone by the next turn, over a
	 * fighter that was going to go on burning either way.
	 *
	 * Which is also why nothing announces a guard — and nothing announces anything else
	 * either. **No word is printed over a fighter anywhere in this fight.** A callout at the
	 * reveal gave the whole turn away before any of the shooting: the lane's own rival is
	 * deciding nothing at that point, but the *player* reads it, and a turn where the answer
	 * is on screen before the question is played out is a turn already over. And a callout
	 * after the fact only lettered a picture that had just been drawn — a brace the blow came
	 * off, two blows meeting in the middle of a lane, a fighter cut and falling. The board
	 * shows what happened; the log is where it is put into words.
	 *
	 * Nothing is cleared here: any guard held through the rest of the turn is taken down when
	 * the next one is handed over (see {@link finishTurn}).
	 */
	private showOrders(acting: Fighter[]): void {
		for (const fighter of acting) {
			if (fighter.action !== 'charge') continue;
			void this.raiseAura(fighter);
		}
	}

	/** End-of-turn bookkeeping: settle the game, or hand the next turn back. */
	private finishTurn(): void {
		const playersLeft = this.players().filter((fighter) => !fighter.down).length;
		const rivalsLeft = this.rivals().filter((fighter) => !fighter.down).length;
		if (playersLeft === 0 && rivalsLeft === 0) {
			this.end('draw', 'Both teams went down together.');
			return;
		}
		if (playersLeft === 0) {
			this.end('lose', 'Your whole team has been taken down.');
			return;
		}
		if (rivalsLeft === 0) {
			this.end('win', 'The rival team has been taken down.');
			return;
		}
		// Two encounters is the fight. The third cannot change the score — there are only
		// three of them — so it is not played: whoever takes the second has taken it, and
		// the last lane is left standing where it is rather than fought out for a result
		// that is already settled. Both sides are read for it, so a rival pair that gets
		// there first ends it just as flatly.
		//
		// Counted in encounters, which is the same thing as counting the other side's
		// fallen: a lane can never lose both its fighters, since the only fighter who can
		// hit one is the one opposite, and two who go at each other in the same turn meet
		// in the middle and cancel ({@link playExchange}). So every fighter that falls
		// hands its lane to somebody still standing, and "two encounters won" and "two of
		// theirs down" are one count under two names.
		const taken = this.lanesWon('info');
		const conceded = this.lanesWon('error');
		if (taken >= ENCOUNTERS_TO_WIN) {
			this.end('win', `You take the fight ${taken}–${conceded}.`);
			return;
		}
		if (conceded >= ENCOUNTERS_TO_WIN) {
			this.end('lose', `The rivals take the fight ${conceded}–${taken}.`);
			return;
		}
		// Every encounter settled: whoever is left standing has nobody in front of them
		// any more, so there is nothing left to play and the score is the result. It is
		// the same answer the count of fighters would give — a lane is only ever won by
		// felling the fighter across from it — reached without sitting out the clock.
		if (this.settled()) {
			const won = this.lanesWon('info');
			const lost = this.lanesWon('error');
			if (won > lost) {
				this.end('win', `Every encounter is settled — you take it ${won}–${lost}.`);
			} else if (lost > won) {
				this.end('lose', `Every encounter is settled — the rivals take it ${lost}–${won}.`);
			} else {
				this.end('draw', `Every encounter is settled — honours even at ${won}–${lost}.`);
			}
			return;
		}
		if (this.turn >= MAX_TURNS) {
			if (playersLeft > rivalsLeft) {
				this.end(
					'win',
					`Time — you finish with more fighters standing (${playersLeft}–${rivalsLeft}).`
				);
			} else if (rivalsLeft > playersLeft) {
				this.end(
					'lose',
					`Time — the rivals finish with more standing (${rivalsLeft}–${playersLeft}).`
				);
			} else {
				this.end('draw', `Time — both sides finish with ${playersLeft} standing.`);
			}
			return;
		}

		// Whatever a colour was still owing goes with the turn it was owed on — see
		// {@link lapsePassives}. Before the next turn is set up, so a fighter is never asked
		// for an order while holding a gift that has already run out.
		this.lapsePassives();

		this.turn += 1;
		// Any guard braced during the turn just played, and the ring around it, come down as
		// the pickers are handed back: a fighter covers for the turn it was told to cover in,
		// and a new turn is asking it what to do next — so standing there braced into it would
		// be showing an order nobody has given yet.
		this.board?.clearHolds();
		for (const fighter of this.fighters) fighter.action = null;
		this.planRivals();
		this.phase = 'planning';
		// The turn's last encounter comes off with the turn: a line about a blow that was
		// thrown a moment ago has no business standing over a board that is waiting to be
		// told what to do next. A fight that *ended* keeps its last one, since the encounter
		// that decided it is the last thing that happened (see {@link end}).
		this.cue = null;
		this.setStatus(`Turn ${this.turn} — give your orders.`);
	}

	/** End the game with an outcome; the arena reports it and closes. */
	private end(outcome: CombatOutcome, detail: string): void {
		this.phase = 'done';
		this.outcome = outcome;
		this.board?.clearAuras();
		this.aura.clear();
		// Nothing is announced: how a fight ended is not an encounter, and it is read out on
		// the panel that comes up in the middle of the board, over the fight it is about.
		this.setStatus(detail);
	}

	// --- The rival side -------------------------------------------------------

	/**
	 * Give every rival its order for the turn, before the player gives theirs — they
	 * are committing blind to each other, so the rivals' choices must already be made
	 * (and kept out of {@link view}) while the player is still deciding.
	 *
	 * With nothing to aim, the whole decision is the lane it stands in. A rival reads
	 * only the fighter opposite, because that is the only one that can shoot it and the
	 * only one it can shoot: with nothing banked it loads (ducking behind a guard now
	 * and then, but only while the one opposite could fire), and with a charge in hand
	 * it weighs firing against covering. Against somebody who cannot shoot back this
	 * turn, covering is worthless and it never picks it.
	 *
	 * Nothing here decides what its colour hands it: a free order is not chosen by
	 * anybody, so a rival's gifts arrive off the back of the order it picked, exactly
	 * as the player's do. What it *does* read is the gifts still in hand, its own and
	 * its lane's, because those change what a turn is worth: a fighter opposite with
	 * nothing banked is still dangerous while its colour owes it a shot (it loads, and
	 * the charge pays for the gift the same turn), and a rival whose own colour owes it
	 * a charge is loaded by covering, so it has no reason to stand open to load by hand.
	 * Reading them is not choosing them — they still arrive off the order, for both sides.
	 *
	 * Its colour is also the whole of *how* it fights, and not only of what it is given:
	 * where the choice is a weighted one, the orders its colour grants are the ones it
	 * leans on ({@link RIVAL_FAVOUR}). A red rival is the one that fires, a blue one the
	 * one that covers, a yellow one the one that keeps loading, and a compound leans two
	 * ways of three — so a line of three colours plays three fights rather than the same
	 * fight three times. It is a lean and not a rule: every order stays reachable, or a
	 * blue rival with a charge in hand would never spend it.
	 *
	 * The lean is on for the whole fight and the gift for one turn of it, and neither is
	 * read off the other: what a colour hands over runs out at the end of the opening
	 * turn, what a colour *is* does not.
	 */
	private planRivals(): void {
		for (const rival of this.rivals()) {
			if (rival.down) continue;
			// One standing on the ground it won is done fighting: it is asked for nothing,
			// exactly as the player's own are, so no order is planned for it and it poses at
			// no reveal.
			if (this.holdsGround(rival)) continue;
			const target = this.opposite(rival);
			if (!target) {
				// Nobody in this lane: there is nothing to shoot and nothing to fear, so it
				// loads if it has room and otherwise just covers, rather than spending every
				// turn spilling charges it cannot hold.
				rival.action = rival.charges >= MAX_CHARGES ? 'defend' : 'charge';
				continue;
			}
			const threatened = this.threatens(target);
			// Every weighted choice below is this fighter's, not the rival side's: the
			// weights are the same for everybody and its colour tilts them (see above).
			const leans = (orders: CombatAction[], weights: number[]): CombatAction =>
				pickWeighted(
					orders,
					orders.map((order, i) => weights[i] * this.favours(rival, order))
				) ?? orders[0];
			if (rival.charges < 1) {
				// Covering is the timid choice — except for a fighter its colour still owes a
				// charge, which is loaded by the turn it covers on. Under threat that beats
				// standing open to load by hand: it ends the turn armed either way.
				rival.action = threatened
					? this.owes(rival, 'charge')
						? 'defend'
						: leans(['charge', 'defend'], [3, 1])
					: 'charge';
			} else if (!threatened) {
				rival.action = 'shoot';
			} else if (rival.charges >= MAX_CHARGES) {
				// Loading again would spill over the cap, so a full fighter only fires or covers.
				rival.action = leans(['shoot', 'defend'], [9, 7]);
			} else {
				rival.action = leans(['shoot', 'defend', 'charge'], [9, 7, 4]);
			}
		}
	}

	// --- State ----------------------------------------------------------------

	private emit(): void {
		this.store.set({
			fighters: this.fighters.map((fighter) => this.view(fighter)),
			phase: this.phase,
			turn: this.turn,
			status: this.status,
			log: [...this.log],
			cue: this.cue,
			ready: this.isReady(),
			wins: { info: this.lanesWon('info'), error: this.lanesWon('error') },
			outcome: this.outcome
		});
	}

	/**
	 * One fighter as the page sees it. A rival's orders are withheld while they are
	 * still secret — during planning they read as no order at all, and only once the
	 * turn is being carried out does the page (and the player) learn what they were.
	 */
	private view(fighter: Fighter): FighterView {
		const secret = fighter.side === 'error' && this.phase === 'planning';
		const opponent = this.opposite(fighter);
		return {
			id: fighter.id,
			spawnId: fighter.spawnId,
			name: fighter.name,
			side: fighter.side,
			color: fighter.color,
			// What a colour grants, and what of it is gone, are never secret: they are
			// worn at the fighter's feet all fight long, rivals included.
			passives: [...fighter.passives],
			spent: [...fighter.spent],
			// Never withheld: what a colour did is done, and it is shown as it happens.
			used: [...fighter.used],
			charges: fighter.charges,
			maxCharges: MAX_CHARGES,
			down: fighter.down,
			action: secret ? null : fighter.action,
			opponentId: opponent?.id ?? null,
			opponentName: opponent?.name ?? null,
			canShoot: this.canShoot(fighter),
			holdsGround: this.holdsGround(fighter),
			ordered: this.isOrdered(fighter)
		};
	}

	private setStatus(status: string): void {
		this.status = status;
		this.emit();
	}

	/**
	 * Announce how an encounter went, and put it on the store.
	 *
	 * **One call per encounter**, and there are only two places to call it from: a lane that
	 * fired both ways ({@link playExchange}) and a lane that fired one way ({@link playShot}),
	 * whose four branches are the four ways that one blow can end. Everything else a turn
	 * does — the reveal, the charges, the walk out, the fall, the ground changing hands, the
	 * result — is silent: those are either the same encounter still being shown, or not an
	 * encounter at all.
	 *
	 * The cue stands until the next encounter replaces it, so the sentence on screen is the
	 * row the canvas is playing. The fight never words any of it: it names the event and the
	 * two fighters, and the sentence is looked up against the authored collection where the
	 * page draws it.
	 *
	 * `status` is the fight's own English record of the same moment, unchanged and
	 * unrelated: it is passed here only so an encounter is one store write rather than two.
	 * A call with nothing to add to it leaves it standing.
	 */
	private announce(
		event: CombatNarrationEvent,
		values: Partial<Record<NarrationPlaceholder, string>> = {},
		status?: string
	): void {
		if (status !== undefined) this.status = status;
		this.cue = { event, values, seq: ++this.cues };
		this.emit();
	}

	private find(id: string): Fighter | undefined {
		return this.fighters.find((fighter) => fighter.id === id);
	}

	private players(): Fighter[] {
		return this.fighters.filter((fighter) => fighter.side === 'info');
	}

	private rivals(): Fighter[] {
		return this.fighters.filter((fighter) => fighter.side === 'error');
	}

	/**
	 * The fighter sharing this one's lane — its opposite number in the other line,
	 * whether or not either of them is still standing. The lane is the slot each holds
	 * in its own line-up, and it is fixed for the whole fight: the two of them were
	 * placed level with each other on the board and neither can leave that pairing, so
	 * a lane is the same two fighters from the first turn to the one that settles it.
	 * Null for a fighter the other line is too short to face.
	 */
	private counterpart(fighter: Fighter): Fighter | null {
		const line = fighter.side === 'error' ? this.rivals() : this.players();
		const facing = fighter.side === 'error' ? this.players() : this.rivals();
		return facing[line.indexOf(fighter)] ?? null;
	}

	/**
	 * The fighter directly opposite: the one this fighter is drawn level with on the
	 * board, if both are still standing. Nobody shoots across the board — a fighter's
	 * lane is the whole of who it can hit and who can hit it, so the choice a turn
	 * offers is only ever *whether* to fire, never at whom.
	 *
	 * A fighter whose lane has been settled has nobody left to shoot for the rest of
	 * the fight: nothing re-pairs the lines, so no fighter further up or down may reach
	 * across for it, and none is handed a new target by a death somewhere else. That is
	 * what keeps a side that is a fighter down from simply being outgunned three to one.
	 */
	private opposite(fighter: Fighter): Fighter | null {
		if (fighter.down) return null;
		const facing = this.counterpart(fighter);
		return facing && !facing.down ? facing : null;
	}

	/**
	 * How many encounters a side has won: one for each fighter of the other line that
	 * has fallen with the fighter it was facing still standing. This is the score the
	 * fight is decided on — it is not a race to wipe the other side out, but three
	 * duels, each of which is somebody's.
	 *
	 * Two who shoot each other down in the same volley win nothing between them: that
	 * encounter is nobody's, and it stays that way, since neither is coming back.
	 */
	private lanesWon(side: FighterSide): number {
		return this.fighters.filter((fighter) => {
			if (fighter.side === side || !fighter.down) return false;
			const winner = this.counterpart(fighter);
			return !!winner && !winner.down;
		}).length;
	}

	/** Whether every encounter has been settled — nobody standing has anybody left in
	 * front of them, so no shot can ever be fired again and the score is final. */
	private settled(): boolean {
		return this.fighters.every((fighter) => fighter.down || !this.opposite(fighter));
	}

	/** The player fighter this id names, if it may still be given orders. */
	private playerReady(id: string): Fighter | null {
		if (this.phase !== 'planning') return null;
		const fighter = this.find(id);
		if (!fighter || fighter.side !== 'info' || fighter.down) return null;
		// One that has taken the ground its lane was played for is out of the fight: it
		// takes no more orders, so a tap on it is nothing.
		if (this.holdsGround(fighter)) return null;
		return fighter;
	}

	/**
	 * Whether this fighter has taken the ground its lane was fought over and stands down
	 * for the rest of the fight: standing on the shared white column, either side's.
	 *
	 * That column is what every lane is played for, and the only way onto it is winning the
	 * lane in front of it ({@link settleLane}) — so a fighter that holds one has settled its
	 * encounter: nobody in front of it to shoot, nobody left who could shoot it, and no
	 * charge worth banking, because the lines never re-pair and it will never face anybody
	 * again ({@link opposite}). It is therefore asked for nothing more: no buttons of its
	 * own on the board, no order planned for it, and the turn does not wait on it to be
	 * commitable. It simply holds what it took.
	 *
	 * Asked of the ground, not of the side. Both lines' winners take the same cell, so
	 * reading it off the column is what keeps a settled rival as quiet as a settled fighter
	 * of the player's — rather than one that goes on being handed orders it has nobody left
	 * to carry out against.
	 */
	private holdsGround(fighter: Fighter): boolean {
		if (fighter.down) return false;
		return !!fighter.cell && cellSide(fighter.cell.q) === 'purple';
	}

	/** Whether this fighter could fire at all right now: a charge to spend, and
	 * somebody standing in the lane to spend it on. */
	private canShoot(fighter: Fighter): boolean {
		return !fighter.down && fighter.charges > 0 && this.opposite(fighter) !== null;
	}

	/**
	 * Whether `order` is one this fighter is owed for free on the turn being played:
	 * its colour grants it, it has not been had yet, and — the whole of what makes it
	 * *passive* — the fighter is not spending its own turn on that very order. A gift
	 * arrives beside what you chose, so it can never be what you chose.
	 *
	 * This says nothing about whether it will amount to anything; that is each gift's
	 * own business, and only a gift that amounts to something is {@link spend}ed.
	 */
	private passiveReady(fighter: Fighter, order: PassiveOrder): boolean {
		if (fighter.down) return false;
		if (!this.owes(fighter, order)) return false;
		return fighter.action !== order;
	}

	/**
	 * Whether this fighter's colour still owes it `order` — it grants it and it has
	 * neither been had nor run out. Says nothing about the turn: this is the gift being
	 * *in hand*, which is what both sides read off a fighter's corner, as against
	 * {@link passiveReady}, which is the gift being owed *now*. Nothing is in hand past
	 * the opening turn (see {@link lapsePassives}).
	 */
	private owes(fighter: Fighter, order: PassiveOrder): boolean {
		return fighter.passives.includes(order) && !fighter.spent.includes(order);
	}

	/**
	 * How hard this fighter's colour leans on `order`, as a multiplier on the weight that
	 * order carries in a rival's choice ({@link planRivals}): {@link RIVAL_FAVOUR} for one
	 * of the orders its colour grants, and 1 for anything else. A character's tactics are
	 * therefore its colour's, the same one thing everything else about it comes from.
	 *
	 * Every turn of the fight, the opening one included, and this is deliberately *not*
	 * tied to whether the gift is still in hand ({@link owes}). The two are different
	 * things a colour is: the gift is worth one use and lasts the opening turn
	 * ({@link lapsePassives}), while the lean is what the fighter is *like*, and a
	 * fighter that fought like somebody else until its gift lapsed would be nobody for
	 * the turn it is most looked at. It costs something on that turn — a blue rival that
	 * covers is a blue rival that has thrown its free guard away, since a gift only ever
	 * comes beside the order given — and that is the price of the colour meaning one
	 * thing all fight rather than two things in sequence. It stays a lean and never a
	 * rule: the weight is tilted and nothing is taken off the table, so a colour tends
	 * towards its own order without ever being made to take it.
	 */
	private favours(fighter: Fighter, order: CombatAction): number {
		return fighter.passives.includes(order) ? RIVAL_FAVOUR : 1;
	}

	/**
	 * Whether this fighter could put a bullet across its lane on the turn about to be
	 * played. A charge in hand is one way; the other is a colour that still owes it a
	 * shot, because a charge is banked before the volley — so a fighter standing empty
	 * can order a load and have the free shot pay for itself the same turn. Anybody
	 * weighing whether to cover has to count that as a threat, or it would read half the
	 * rules.
	 */
	private threatens(fighter: Fighter): boolean {
		return !fighter.down && (fighter.charges > 0 || this.owes(fighter, 'shoot'));
	}

	/**
	 * Mark a gift as had — it is worth the one use, and this is what takes it out of the
	 * fighter's hand.
	 *
	 * `taken` says whether the gift *did* something: a free shot that was fired, a guard
	 * that turned a bullet aside, a charge that went into the bank. To every rule in this
	 * fight that is the same state as a gift that merely ran out at the end of the turn it
	 * was in hand for ({@link lapsePassives}) — both are gone, and that is the point of
	 * having one call for them. What tells them apart is kept for the fight's own record
	 * and shown nowhere: a gift is drawn for the turn it is in hand, not for what became
	 * of it.
	 */
	private spend(fighter: Fighter, order: PassiveOrder, taken: boolean): void {
		if (fighter.spent.includes(order)) return;
		fighter.spent.push(order);
		if (taken) fighter.used.push(order);
		// Every rule that reads a gift reads these two lists — what a rival counts as a
		// threat, and what is still owed when the next blow comes down the lane — so saying
		// the state changed is the whole of telling the fight about it.
		this.emit();
	}

	/**
	 * Run out every gift still in hand, at the end of the turn it was in hand for.
	 *
	 * A colour's free order is what a fighter opens the fight with, and it lasts that
	 * opening turn: whatever it did not do on the turn it was there for, it does not do
	 * later. A gift that could sit in a corner until the turn it happened to pay best was
	 * a card's advantage waiting for its moment — it made the opening turn the one turn
	 * nobody could read, since every fighter on the board was still owed everything, and
	 * it made a colour something a player banked rather than opened with. Spent or lapsed,
	 * it comes to the same thing from here on: the corner stops offering it, the rivals
	 * stop counting it as a threat, and every fighter left is the three orders and nothing
	 * else.
	 *
	 * Called at the end of every turn, though it can only ever find anything on the first
	 * — after that there is nothing left in hand to run out. Which is also what makes a
	 * fight resumed from an old board (one saved under the rule that kept gifts) settle
	 * into this one at the end of its next turn rather than carrying them for ever.
	 */
	private lapsePassives(): void {
		for (const fighter of this.fighters) {
			for (const order of fighter.passives) {
				if (this.owes(fighter, order)) this.spend(fighter, order, false);
			}
		}
	}

	/** Whether a fighter's order is complete: given, and only firing where it can. A
	 * fighter nothing is asked of — down, or holding the ground it won — is complete by
	 * standing there, so the turn is never held up waiting on one. */
	private isOrdered(fighter: Fighter): boolean {
		if (fighter.down || this.holdsGround(fighter)) return true;
		if (!fighter.action) return false;
		if (fighter.action === 'shoot' && !this.canShoot(fighter)) return false;
		return true;
	}

	/** Whether the player's whole side is ready to commit. */
	private isReady(): boolean {
		if (this.phase !== 'planning') return false;
		return this.players().every((fighter) => this.isOrdered(fighter));
	}

	// --- Board ----------------------------------------------------------------

	/** Light (or put out) the aura that says at a glance who is holding a charge. The
	 * count itself is read off the pips beside each fighter's picker, not the board. */
	private syncCharges(): void {
		for (const fighter of this.fighters) {
			if (fighter.down) continue;
			if (fighter.charges > 0) void this.raiseAura(fighter);
			else this.dropAura(fighter);
		}
	}

	/** Light a fighter's aura, unless it is already burning (re-lighting restarts it). */
	private raiseAura(fighter: Fighter): Promise<void> | undefined {
		if (this.aura.has(fighter.id)) return undefined;
		this.aura.add(fighter.id);
		return this.board?.showAura(fighter.id, fighter.color);
	}

	private dropAura(fighter: Fighter): void {
		if (!this.aura.delete(fighter.id)) return;
		this.board?.clearAura(fighter.id);
	}

	/** The animation a fighter strikes with: its own melee move, or the empty fallback
	 * — a fighter whose definition binds nothing still walks out and lands the blow,
	 * it simply throws no pose over it. */
	private strikeMove(fighter: Fighter): CharacterMove {
		return findMove(fighter, 'melee') ?? FALLBACK_STRIKE;
	}
}
