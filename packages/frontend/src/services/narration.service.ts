import { readable, writable, type Readable } from 'svelte/store';
import type { CombatNarrationCollection } from '$types/combat-narration.type';

/**
 * The words the fight is narrated in, read once from the baked
 * `/data/combat-narration.json` — the collection the admin `/narration` screen writes.
 *
 * The fight itself holds none of this. It announces a cue (an event and the fighters it
 * happened to) and the arena looks the wording up here, so what is said over a turn can
 * be rewritten without touching a rule, and no rule can be changed by rewriting a line.
 *
 * Subscribing is what starts the load, exactly as the show glyphs do it: the one surface
 * that draws narration is the one that wants the collection, so nothing else has to
 * remember to ask for it first. Until it lands the store is empty and the arena says
 * nothing at all — a fight narrated in silence is a fight, where a fight narrated in
 * placeholder English would be a bug on screen.
 */

const EMPTY: CombatNarrationCollection = { lines: {} };

const collection = writable<CombatNarrationCollection>(EMPTY);

/** The authored lines, by event. Empty until the read lands (or if it fails). */
export const narration: Readable<CombatNarrationCollection> = readable<CombatNarrationCollection>(
	EMPTY,
	(set) => {
		const unsubscribe = collection.subscribe(set);
		void loadNarration();
		return unsubscribe;
	}
);

// The in-flight (or finished) read, so every subscriber shares one fetch. Cleared on
// failure, so a later mount tries again rather than the session going wordless over one
// dropped request.
let load: Promise<void> | null = null;

/**
 * Read the collection once. Safe to call from anywhere: the first call fetches and the
 * rest await that same promise.
 */
export function loadNarration(): Promise<void> {
	load ??= fetch('/data/combat-narration.json')
		.then((response) => {
			if (!response.ok) throw new Error(`Failed to load combat narration (${response.status})`);
			return response.json() as Promise<CombatNarrationCollection>;
		})
		.then((parsed) => {
			// Only the shape is trusted here, never the content: a line is authored text and
			// this is the game reading it back, not the API taking it in.
			collection.set(parsed?.lines && typeof parsed.lines === 'object' ? parsed : EMPTY);
		})
		.catch((error) => {
			load = null;
			console.error('Combat narration could not be read', error);
		});
	return load;
}
