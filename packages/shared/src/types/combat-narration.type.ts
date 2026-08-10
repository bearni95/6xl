/**
 * What is said over a turn while it is being played out.
 *
 * A turn is carried out on the canvas — the loaders flare, a fighter walks out of its
 * cell, strikes, is answered, somebody falls and the lane is settled — and the board
 * deliberately prints no word over any of it (see the combat controller's `showOrders`).
 * The words go somewhere else: one line at a time, over the player's own panel, saying
 * what the animation on the board is of.
 *
 * The fight does **not** hold that wording. It emits a {@link CombatNarrationCue} — an
 * event id and the fighters it happened to — and the wording is looked up against the
 * authored collection in `@3xl/data`'s `public/combat-narration.json`, written on the
 * admin `/narration` screen. So a line can be rewritten without touching the rules, and
 * the rules can never be changed by rewriting a line: this file is the contract between
 * the two, and it is the *whole* of it.
 *
 * Every event carries a fixed set of placeholders and no others ({@link NARRATION_EVENTS}).
 * A line naming one the event does not carry would be a line with a `{target}` in it that
 * nothing ever fills, so the API refuses it and the admin screen says which are on offer.
 */

/**
 * One thing the fight can announce while a turn is being carried out.
 *
 * Every one of these is a beat with a **moment of its own** on the board: the reveal, an
 * attacker's walk out, the blow's answer, the lane being walked out, the end of it. What
 * is deliberately not in here is anything that happens at the same instant as something
 * else — the charges are all banked and all flare together at the reveal, so a line per
 * loader would be three sentences shown in one frame, none of them read. The aura is what
 * says a fighter loaded, and it says it without words (see the controller's `showOrders`).
 */
export type CombatNarrationEvent =
	| 'orders'
	| 'advance'
	| 'exchange'
	| 'blocked'
	| 'freeGuard'
	| 'hit'
	| 'spent'
	| 'ground'
	| 'win'
	| 'lose'
	| 'draw';

/** A name a line may write into itself, spelled `{like}` `{this}`. */
export type NarrationPlaceholder =
	| 'turn'
	| 'attacker'
	| 'target'
	| 'winner'
	| 'loser'
	| 'wins'
	| 'losses';

/** One event, what it is, and the names a line about it may use. */
export interface NarrationEventSpec {
	id: CombatNarrationEvent;
	/** What the board is doing at the moment this is said. Authoring text, in English:
	 * it is read on the admin screen, which is an authoring tool for one author. */
	summary: string;
	placeholders: readonly NarrationPlaceholder[];
}

/**
 * Every moment of a turn that has words on it, in the order a turn reaches them.
 *
 * This list is the catalogue: the fight announces one of these ids and nothing else, the
 * API takes lines for these ids and nothing else, and the admin screen draws a section
 * per entry — so a new thing to say is added here once and appears in all three.
 */
export const NARRATION_EVENTS: readonly NarrationEventSpec[] = [
	{
		id: 'orders',
		summary: 'The turn opens: both sides’ orders are revealed and the loaders flare.',
		placeholders: ['turn']
	},
	{
		id: 'advance',
		summary: 'An attacker walks out of its cell at the fighter opposite.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'exchange',
		summary: 'Both fighters of a lane attacked at once: they meet in the middle and cancel.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'blocked',
		summary: 'The blow lands on a fighter that was ordered to cover, and is turned aside.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'freeGuard',
		summary: 'The blow is turned aside by the free guard the target’s colour owed it.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'hit',
		summary: 'The blow gets through: the target is down and its lane is decided.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'spent',
		summary: 'The blow lands on somebody already falling from an earlier blow this turn.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'ground',
		summary: 'The lane is walked out: the winner takes the white cell, the loser falls back.',
		placeholders: ['winner', 'loser']
	},
	{
		id: 'win',
		summary: 'The fight is over and the player has taken it.',
		placeholders: ['wins', 'losses']
	},
	{
		id: 'lose',
		summary: 'The fight is over and the rivals have taken it.',
		placeholders: ['wins', 'losses']
	},
	{
		id: 'draw',
		summary: 'The fight is over with honours even.',
		placeholders: ['wins', 'losses']
	}
];

/** The event ids alone, for a quick membership test. */
export const NARRATION_EVENT_IDS: readonly CombatNarrationEvent[] = NARRATION_EVENTS.map(
	(event) => event.id
);

/** A line is a sentence read in the middle of a fight, not a paragraph. */
export const NARRATION_LINE_MAX_LENGTH = 120;

/** How many ways of saying one thing may be authored. A cap, not a target. */
export const NARRATION_LINES_PER_EVENT = 12;

/** The authored collection, as `public/combat-narration.json` holds it. An event with no
 * lines is one the fight says nothing about, which is a legitimate thing to author. */
export interface CombatNarrationCollection {
	lines: Partial<Record<CombatNarrationEvent, string[]>>;
}

/**
 * What the fight announced, as the fight announces it: which of the events it was, the
 * names it happened to, and a number that goes up with every cue.
 *
 * The count is what makes one cue different from the next: two identical blows in one
 * turn are two things that happened, and the line for the second is picked afresh (see
 * {@link pickNarrationLine}) rather than the same words simply staying on screen.
 */
export interface CombatNarrationCue {
	event: CombatNarrationEvent;
	values: Partial<Record<NarrationPlaceholder, string>>;
	/** 1-based, counted over the whole fight. */
	seq: number;
}

/** Whether `value` names one of the events the fight can announce. */
export function isNarrationEvent(value: unknown): value is CombatNarrationEvent {
	return typeof value === 'string' && NARRATION_EVENT_IDS.includes(value as CombatNarrationEvent);
}

/** The names a line about `event` may write into itself. Empty for an unknown event. */
export function narrationPlaceholders(event: string): readonly NarrationPlaceholder[] {
	return NARRATION_EVENTS.find((entry) => entry.id === event)?.placeholders ?? [];
}

/**
 * Every `{name}` a line asks for, in the order it asks for them, deduplicated.
 *
 * What it is for is refusing a line that names something its event never carries: a
 * `{target}` in an event that only ever knows one fighter is a hole in the sentence,
 * and the one place to catch it is where the line is written.
 */
export function narrationTokens(line: string): string[] {
	const found = new Set<string>();
	for (const match of line.matchAll(/\{([a-zA-Z]+)\}/g)) found.add(match[1]);
	return [...found];
}

/** The tokens in `line` that `event` cannot fill. Empty means the line is fillable. */
export function unknownNarrationTokens(event: string, line: string): string[] {
	const allowed = narrationPlaceholders(event) as readonly string[];
	return narrationTokens(line).filter((token) => !allowed.includes(token));
}

/**
 * A line with its names written in.
 *
 * A token nothing was handed for is left standing rather than blanked: an empty gap in a
 * sentence reads as a bug in the game, whereas `{target}` on screen reads as a bug in the
 * line — which is what it is, and which is the one of the two somebody can go and fix.
 */
export function fillNarration(
	line: string,
	values: Partial<Record<NarrationPlaceholder, string>>
): string {
	return line.replace(/\{([a-zA-Z]+)\}/g, (token, name: string) => {
		const value = values[name as NarrationPlaceholder];
		return value === undefined ? token : value;
	});
}

/**
 * A 32-bit FNV-1a hash, inlined from `utils/string/hash` — this file is the contract the
 * backend reads too, and a type that reached into the utils would drag the whole tree
 * behind it for one arithmetic loop.
 */
function hash(text: string): number {
	let value = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 0x01000193);
	}
	return value >>> 0;
}

/**
 * The words for one cue: one of the authored lines for its event, filled in.
 *
 * Which of them is **seeded** rather than rolled — off the cue's own count and the names
 * in it — so the same cue always says the same thing. A line re-rolled on every render
 * would flicker through the variants while the blow it describes was still being thrown,
 * and a fight replayed off the same board would narrate itself differently each time.
 *
 * Null when the event has nothing authored for it, which is how a collection that has not
 * loaded (or an event nobody has written a line for) stays quiet instead of guessing.
 */
export function pickNarrationLine(
	collection: CombatNarrationCollection | null,
	cue: CombatNarrationCue | null
): string | null {
	if (!collection || !cue) return null;
	const lines = collection.lines?.[cue.event] ?? [];
	if (lines.length === 0) return null;
	const seed = hash(`${cue.event}:${cue.seq}:${Object.values(cue.values).join('|')}`);
	return fillNarration(lines[seed % lines.length], cue.values);
}
