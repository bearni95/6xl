/**
 * What a character says about its own size, fetched for the surface that is drawing it:
 * its render scale, and whether it lets its width size it.
 *
 * The corrections themselves live in the character's own definition JSON
 * (`CharacterDefinition.renderScale`, `CharacterDefinition.widthCap`) — that is where they
 * are authored, committed and read back by the admin. What this module does is get them to
 * the code that sizes
 * sprites, which everywhere in this app knows a character by its *frames folder*
 * (`/assets/<id>/frames`) and nothing else: a statue is handed one, a card model
 * carries one, the board loads its animations from one. So the folder is what is
 * asked here, the id is read back out of it, and the definition is fetched by id —
 * the same two steps the board already took to load a character's bindings, and the
 * same `/data/characters/<id>/definition.json` the admin writes.
 *
 * Every character's id, frames folder and definition path are one and the same name
 * by construction (see `CharacterDefinition.id`); a test over the real registry holds
 * that invariant, so this stops working loudly rather than by quietly drawing
 * everybody at 1.
 */

import {
	DEFAULT_RENDER_SCALE,
	RENDER_SCALE_MAX,
	RENDER_SCALE_MIN,
	type CharacterDefinition
} from '../../types/character-definition.type';
import { readWidthCap } from '../card/character-fit';
import { loadDefinition } from './character-assets';

/**
 * The character id inside a served frames folder — `/assets/inuyasha/frames` is
 * `inuyasha`. Null when the path has no such segment, which is what a hand-written
 * or renamed folder would give.
 */
export function characterIdFromFramesPath(basePath: string | null): string | null {
	if (!basePath) return null;
	const segments = basePath.split('/').filter(Boolean);
	// The id is the folder the frames folder sits in; a path that is only `frames`
	// (or only an id) names no character.
	if (segments.length < 2) return null;
	const last = segments[segments.length - 1];
	const id = last === 'frames' ? segments[segments.length - 2] : last;
	return id || null;
}

/** A stored scale, or {@link DEFAULT_RENDER_SCALE} for anything absent, unparseable
 * or outside the authored range. Shared with the fit so a bad value means "no
 * correction" in one place. */
export function readRenderScale(definition: Partial<CharacterDefinition> | null): number {
	const scale = definition?.renderScale;
	return typeof scale === 'number' &&
		Number.isFinite(scale) &&
		scale >= RENDER_SCALE_MIN &&
		scale <= RENDER_SCALE_MAX
		? scale
		: DEFAULT_RENDER_SCALE;
}

/**
 * The render scale for the character whose frames live at `basePath`, defaulting to
 * 1 for a character that authored none (and for any failure to read it — a missing
 * correction draws the character as it always was, which is never worse than
 * drawing nothing).
 *
 * The definition itself is fetched once per page for every surface that wants any part
 * of it ({@link loadDefinition}), so a statue asking for a scale and a board asking for
 * the same character's move bindings are one request between them.
 */
export function loadRenderScale(basePath: string | null): Promise<number> {
	return loadDefinition(characterIdFromFramesPath(basePath)).then(readRenderScale);
}

/**
 * Whether the character whose frames live at `basePath` lets its width size it, defaulting
 * to yes for a character that said nothing (and for any failure to read it — the cap is
 * what every character has).
 *
 * The other half of what a character says about its own size, fetched exactly as the scale
 * above is: the two read the one definition, which is one request per page between them
 * ({@link loadDefinition}), so a surface asking for both is asking once.
 */
export function loadWidthCap(basePath: string | null): Promise<boolean> {
	return loadDefinition(characterIdFromFramesPath(basePath)).then(readWidthCap);
}
