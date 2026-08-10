/**
 * The two JSON files a character is, fetched once each per page.
 *
 * Everything that draws a character reads the same two documents: the **manifest** in its
 * frames folder (`/assets/<id>/frames/manifest.json` — what animations there are, which
 * PNG each frame is, its size, its axis and its duration) and the **definition** the admin
 * authors (`/data/characters/<id>/definition.json` — the animation bindings, the moves,
 * the render scale, the portrait). Neither ever changes while a page is open: they are
 * generated files served flat.
 *
 * They were being fetched by four different modules with four different caches — the
 * board's own per-instance pair, `idle-clip`'s manifest map, `character-render-scale`'s
 * scale map, and the arena's bare `fetch` with none at all — so opening a fight asked for
 * six files about twenty times over, and a board rebuilt (a colour arriving, a slot
 * changing) threw its half of that away and asked again. One promise per document,
 * memoised at module scope, is the whole of what this is: every surface on the page shares
 * the one request, whether it is in flight or long settled, and a board that is torn down
 * and built again re-reads nothing.
 *
 * Memoised on the **promise** rather than on the result, so the several asks that a board
 * opening fires at once are one request rather than a race between six. A failure is not
 * kept: a bad moment on the network is not a fact about the character, and the next asker
 * tries again.
 */

import type { CharacterDefinition } from '../../types/character-definition.type';
import type { Manifest } from './mugen-player';

const manifests = new Map<string, Promise<Manifest | null>>();
const definitions = new Map<string, Promise<Partial<CharacterDefinition> | null>>();

/** Fetch `url` as JSON, or null for anything that did not arrive as JSON. */
async function readJson<T>(url: string): Promise<T | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

/** One request per key, shared by every caller, and forgotten if it comes back empty. */
function once<T>(cache: Map<string, Promise<T | null>>, key: string, fetcher: () => Promise<T | null>) {
	const cached = cache.get(key);
	if (cached) return cached;
	const request = fetcher().then((value) => {
		if (!value) cache.delete(key);
		return value;
	});
	cache.set(key, request);
	return request;
}

/**
 * The frames manifest of the folder at `basePath` (e.g. `/assets/inuyasha/frames`), or
 * null if it cannot be read — which every caller treats as a character it cannot draw.
 */
export function loadManifest(basePath: string | null): Promise<Manifest | null> {
	if (!basePath) return Promise.resolve(null);
	return once(manifests, basePath, () => readJson<Manifest>(`${basePath}/manifest.json`));
}

/**
 * The authored definition of the character with this id, or null for one that has none —
 * which is a character drawn on its manifest alone, not a failure.
 */
export function loadDefinition(id: string | null): Promise<Partial<CharacterDefinition> | null> {
	if (!id) return Promise.resolve(null);
	return once(definitions, id, () =>
		readJson<Partial<CharacterDefinition>>(`/data/characters/${id}/definition.json`)
	);
}
