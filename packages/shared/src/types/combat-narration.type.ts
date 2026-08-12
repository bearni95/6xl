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
 * **Every** row of the board that is still being fought gets one of these, whether or not a
 * blow was thrown down it. Five of them are an attack answered: the two firing at once, a
 * blow a guard turned (ordered or owed), a blow that got through, and a blow thrown at
 * somebody already falling. The other three are the rows where nothing was thrown at all —
 * both loading, both covering, or one of each — because two fighters standing off across a
 * lane is a thing that happened in it, and a row that went by in silence read as a row the
 * game had forgotten to play.
 *
 * Nothing else is in here on purpose. The reveal, the charges banking and the fight's own
 * result are not encounters — the first two happen at one instant for everybody at once, and
 * the last is read off the panel in the middle of the board, where the fight puts what it
 * has to say about itself.
 */
export type CombatNarrationEvent =
	| 'exchange'
	| 'blocked'
	| 'freeGuard'
	| 'hit'
	| 'spent'
	| 'bothLoad'
	| 'bothCover'
	| 'loadAgainstCover';

/**
 * A name a line may write into itself, spelled `{like}` `{this}`.
 *
 * Always two of them, because an encounter is two fighters — but which two names depends on
 * what they were to each other. A blow has an `{attacker}` and a `{target}`; a lane where
 * one loaded and the other covered has a `{loader}` and a `{guard}`; and a lane where both
 * did the same thing has no roles to tell them apart at all, so they are `{one}` and
 * `{other}` — the player's own fighter first, so a line reads from the reader's side.
 */
export type NarrationPlaceholder =
	| 'attacker'
	| 'target'
	| 'loader'
	| 'guard'
	| 'one'
	| 'other';

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
	},
	{
		id: 'bothLoad',
		summary:
			'Nothing was thrown down the row: both fighters spent the turn loading, and both end it armed.',
		placeholders: ['one', 'other']
	},
	{
		id: 'bothCover',
		summary:
			'Nothing was thrown down the row: both fighters covered against a blow neither of them threw.',
		placeholders: ['one', 'other']
	},
	{
		id: 'loadAgainstCover',
		summary:
			'Nothing was thrown down the row: one fighter loaded while the other covered against it.',
		placeholders: ['loader', 'guard']
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
 * names it happened to, which fight it is, and how many times this fight has announced
 * that same event.
 *
 * The count is what makes one cue different from the next: two identical blows in one
 * fight are two things that happened, and the second is dealt the *next* of that event's
 * authored lines rather than being handed the same words again (see
 * {@link pickNarrationLine}). It is counted per event, because that is the only pile a
 * line can be dealt off — a `hit` never takes a `blocked`'s sentence.
 */
export interface CombatNarrationCue {
	event: CombatNarrationEvent;
	values: Partial<Record<NarrationPlaceholder, string>>;
	/**
	 * The combat colour each of those names fights in, keyed the same way — so the sentence
	 * can letter a fighter's name in that fighter's own colour, which is the one thing that
	 * tells two names apart at a glance in the middle of a turn.
	 *
	 * A colour here is only ever a *reading* of the name beside it: nothing is looked up by
	 * it and no rule reads it, so a cue that carries none is narrated in the plate's own ink
	 * rather than being wrong. That is what keeps this optional — the words are the contract
	 * and the colour is how they are drawn.
	 */
	colors?: Partial<Record<NarrationPlaceholder, string>>;
	/** 1-based, counted over this event's own announcements within this fight. */
	seq: number;
	/**
	 * Which fight this is — any string, as long as it is the same one all fight and
	 * different between fights, since it is what shuffles the pile. Two fights that
	 * dealt in the same order would narrate the first blow of every one of them
	 * identically.
	 */
	fight: string;
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
 * A run of a filled line, and whether it is a name.
 *
 * A sentence is drawn in one ink except for the fighters in it, so what the screen needs
 * is not the finished string but the pieces it is made of: the words the author wrote, and
 * the names written into them, each carrying the colour that fighter fights in.
 */
export interface NarrationSegment {
	text: string;
	/** The placeholder this run was written in for; absent on the author's own words. */
	name?: NarrationPlaceholder;
	/** The colour that fighter fights in, when the cue carried one. */
	color?: string;
}

/**
 * A line cut into its runs: the author's words, and the names filled into them.
 *
 * Same rule as {@link fillNarration} on a token nothing was handed for — it is left
 * standing, as text, so it reads as a bug in the line rather than a gap in the game. A run
 * left standing is deliberately *not* a name: colouring `{target}` would dress the mistake
 * up as a fighter.
 *
 * Joining the `text` of these back together is exactly what `fillNarration` returns, which
 * is what lets the two be used interchangeably by anything that only wants the sentence.
 */
export function narrationSegments(
	line: string,
	values: Partial<Record<NarrationPlaceholder, string>>,
	colors: Partial<Record<NarrationPlaceholder, string>> = {}
): NarrationSegment[] {
	const segments: NarrationSegment[] = [];
	const push = (text: string, name?: NarrationPlaceholder): void => {
		if (!text) return;
		// Two plain runs in a row would be one run written twice — a `{token}` left standing
		// between the author's own words is still the author's own words.
		const last = segments[segments.length - 1];
		if (!name && last && !last.name) last.text += text;
		else segments.push(name ? { text, name, color: colors[name] } : { text });
	};
	let read = 0;
	for (const match of line.matchAll(/\{([a-zA-Z]+)\}/g)) {
		const name = match[1] as NarrationPlaceholder;
		const value = values[name];
		push(line.slice(read, match.index));
		if (value === undefined) push(match[0]);
		else push(value, name);
		read = (match.index ?? 0) + match[0].length;
	}
	push(line.slice(read));
	return segments;
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
 * An event's authored lines put in a shuffled order — the pile this fight deals that
 * event off, for one round of it.
 *
 * Seeded, so the same fight always deals the same order however often it is asked, and
 * shuffled afresh per round so a fight long enough to exhaust an event's lines does not
 * simply repeat its first round back.
 */
function dealOrder(lines: string[], seed: string, round: number): string[] {
	let order: string[] = [];
	// Every round from the first, because each is only allowed to open on a line the one
	// before it did not close on — so what the pile looks like at round N is a walk, not
	// a lookup. A fight deals a handful of rounds at most.
	for (let current = 0; current <= round; current++) {
		const previous = order;
		order = [...lines];
		// An LCG walked once per swap, off the seed's hash: a Fisher–Yates that is a pure
		// function of (fight, event, round) and nothing else, which is what makes the deal
		// both stable and unrepeating.
		let state = hash(`${seed}:${current}`);
		for (let index = order.length - 1; index > 0; index--) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			// Off the top bits: the low ones of an LCG cycle far too short to shuffle with.
			const swap = Math.floor((state / 0x100000000) * (index + 1));
			[order[index], order[swap]] = [order[swap], order[index]];
		}
		// A round that opened on the line the round before it closed on would say the same
		// thing twice running — the one repeat the dealing exists to prevent — so the pile
		// is cut by one when that comes up.
		if (previous.length > 1 && order[0] === previous[previous.length - 1]) {
			[order[0], order[1]] = [order[1], order[0]];
		}
	}
	return order;
}

/**
 * The words for one cue: one of the authored lines for its event, filled in.
 *
 * The line is **dealt, not rolled**. Every event's lines are a pile, shuffled off the
 * fight and the event, and each cue takes the next one — so a phrase is not said twice in
 * a fight until every other way of saying that same thing has been said, and never twice
 * running even across the shuffle that follows. Rolling one at random was the same
 * sentence coming up over and over inside one battle, which reads as the game having only
 * one thing to say about a blow when the author wrote five.
 *
 * It stays a pure function of the cue, which is the property everything here rests on: the
 * same cue always says the same thing, so a line does not flicker through the variants
 * while the blow it describes is still being thrown, and a fight replayed off the same
 * board narrates itself the same way.
 *
 * Null when the event has nothing authored for it, which is how a collection that has not
 * loaded (or an event nobody has written a line for) stays quiet instead of guessing.
 */
export function pickNarrationLine(
	collection: CombatNarrationCollection | null,
	cue: CombatNarrationCue | null
): string | null {
	const dealt = dealNarration(collection, cue);
	return dealt === null ? null : fillNarration(dealt, cue!.values);
}

/**
 * The same words, cut into their runs — the author's own, and the names written into them,
 * each carrying that fighter's colour ({@link narrationSegments}).
 *
 * This is what the arena draws, because a name is lettered in the colour its fighter fights
 * in; {@link pickNarrationLine} is the same deal read as one string, for everything that
 * only wants the sentence.
 */
export function pickNarrationSegments(
	collection: CombatNarrationCollection | null,
	cue: CombatNarrationCue | null
): NarrationSegment[] | null {
	const dealt = dealNarration(collection, cue);
	return dealt === null ? null : narrationSegments(dealt, cue!.values, cue!.colors ?? {});
}

/** The line this cue is dealt, before any name is written into it. Null when the event has
 * nothing authored, which is how a fight stays quiet rather than guessing. */
function dealNarration(
	collection: CombatNarrationCollection | null,
	cue: CombatNarrationCue | null
): string | null {
	if (!collection || !cue) return null;
	const lines = collection.lines?.[cue.event] ?? [];
	if (lines.length === 0) return null;
	// The cue counts from one; anything below that is read as the first of the fight.
	const dealt = Math.max(0, cue.seq - 1);
	const round = Math.floor(dealt / lines.length);
	const place = dealt % lines.length;
	return dealOrder(lines, `${cue.fight}:${cue.event}`, round)[place];
}
