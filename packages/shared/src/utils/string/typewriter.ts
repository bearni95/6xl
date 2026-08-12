/**
 * A sentence cut into the pieces something types it out in: its words, one at a time, and
 * the spaces between them.
 *
 * It takes **runs** rather than a string, because the text it is asked to type is not all
 * one thing — the combat narration letters a fighter's name in that fighter's own colour,
 * so a word arrives already knowing what it is drawn in. Each run is cut on its own and the
 * cuts are handed back in reading order, so everything a run was carrying rides along with
 * every word out of it, and a name of two words is two words rather than one long one.
 *
 * The spaces are handed back too, as pieces of their own, which is the whole reason this is
 * not `text.split(' ')`: a typewriter that dropped them would have to put them back, and
 * putting them back means guessing where they were. A piece is a word or it is the gap after
 * one, and the gap is never counted — `word` says which, and `index` numbers the words alone
 * so a reveal counts what is read rather than what is between it.
 */

/** A stretch of text drawn in one colour — what is handed in. */
export interface TypedRun {
	text: string;
	color?: string;
}

/**
 * One word of it, or the gap after one — **and everything else its run was carrying**.
 *
 * A run is cut up, not read: whatever the caller hung on it comes back on every piece of
 * it, which is what keeps this file from having to know what a run is about. The narration
 * hangs a fighter's colour and the order it made on one; a piece knows both without this
 * ever having heard of either.
 */
export type TypedPart<Run extends TypedRun = TypedRun> = Run & {
	/** False for the whitespace between words, which is nothing to type. */
	word: boolean;
	/** The word's place in the sentence, counting from zero. `-1` on a gap. */
	index: number;
	/**
	 * True on the first word out of its run, and nowhere else — a gap included, since a gap
	 * is not a word.
	 *
	 * What it is for is a mark drawn once for a run rather than once per word: the narration
	 * puts the order's glyph beside a fighter, and a name of two words would otherwise wear
	 * it twice. The run is the only thing that knows where it began, so it says so here
	 * instead of leaving the far end to work it out by comparing neighbours.
	 */
	lead: boolean;
};

/**
 * The runs cut into words and gaps, in reading order.
 *
 * Empty runs fall out; nothing else is normalised, because a sentence is what the author
 * wrote and this is only cutting it up.
 */
export function typewriterParts<Run extends TypedRun>(runs: readonly Run[]): TypedPart<Run>[] {
	const parts: TypedPart<Run>[] = [];
	let index = 0;
	for (const run of runs) {
		let lead = true;
		for (const piece of run.text.match(/\s+|\S+/g) ?? []) {
			const word = !/^\s+$/.test(piece);
			parts.push({
				...run,
				text: piece,
				word,
				index: word ? index++ : -1,
				lead: word && lead
			} as TypedPart<Run>);
			if (word) lead = false;
		}
	}
	return parts;
}

/** How many words there are to type — the count a reveal runs up to. */
export function typewriterWords(parts: readonly TypedPart[]): number {
	return parts.reduce((count, part) => count + (part.word ? 1 : 0), 0);
}
