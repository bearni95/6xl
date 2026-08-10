/**
 * What is said over a turn while it is being played out.
 *
 * A turn is carried out on the canvas — the loaders flare, a fighter walks out of its
 * cell, strikes, is answered, somebody falls and the lane is settled — and the board
 * deliberately prints no word over any of it (see the combat controller's `showOrders`).
 * The words go somewhere else: over the player's own panel, **one sentence per encounter**.
 *
 * An encounter is a row of the board — the duel between the two fighters standing in it —
 * and a turn plays its encounters out one after another. One of them is one thing that
 * happened, however many frames it takes to show: the walk out, the blow, the guard it came
 * off or the fall it caused, and the ground that changed hands are all the same event, so
 * they get the one line, which stands for as long as the row is being played. Narrating the
 * beats *within* a row instead — setting off, landing, settling — was three sentences about
 * one thing, each replacing the last before it had been read.
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
 * How an encounter went — which is the whole of what the fight announces.
 *
 * Five ways a row can be played out, and every one of them is one attack answered: the two
 * of them firing at once, a blow a guard turned (ordered or owed), a blow that got through,
 * and a blow thrown at somebody already falling. A row where nobody attacked is a row where
 * nothing happened, and it says nothing.
 *
 * Nothing else is in here on purpose. The reveal, the charges banking and the fight's own
 * result are not encounters — the first two happen at one instant for everybody at once, and
 * the last is read off the panel in the middle of the board, where the fight puts what it
 * has to say about itself.
 */
export type CombatNarrationEvent = 'exchange' | 'blocked' | 'freeGuard' | 'hit' | 'spent';

/**
 * A name a line may write into itself, spelled `{like}` `{this}`.
 *
 * Two, because an encounter is two fighters: the one that threw the blow and the one it was
 * thrown at. Which of them came out of it standing is what the event itself says.
 */
export type NarrationPlaceholder = 'attacker' | 'target';

/** One event, what it is, and the names a line about it may use. */
export interface NarrationEventSpec {
	id: CombatNarrationEvent;
	/** What the board is doing at the moment this is said. Authoring text, in English:
	 * it is read on the admin screen, which is an authoring tool for one author. */
	summary: string;
	placeholders: readonly NarrationPlaceholder[];
}

/**
 * Every way an encounter can go, in the order the branches are read.
 *
 * This list is the catalogue: the fight announces one of these ids and nothing else, the
 * API takes lines for these ids and nothing else, and the admin screen draws a section
 * per entry — so a new thing to say is added here once and appears in all three.
 */
export const NARRATION_EVENTS: readonly NarrationEventSpec[] = [
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
		summary:
			'The blow gets through: the target goes down, the attacker takes the ground between them.',
		placeholders: ['attacker', 'target']
	},
	{
		id: 'spent',
		summary: 'The blow lands on somebody already falling from an earlier encounter this turn.',
		placeholders: ['attacker', 'target']
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
