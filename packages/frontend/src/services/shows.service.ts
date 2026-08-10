import { browser } from '$app/environment';
import { readable, writable, type Readable } from 'svelte/store';
import { showLogoUrl } from '$utils/show/show-logo';
import { showIconsByShow } from '$utils/show/show-icon';
import { loadIconMarkup } from '$services/icons.service';
import type { ShowsCollection } from '$types/show.type';

/**
 * The authored shows, reduced to what the game's surfaces say a show with: its
 * logo, and the glyph that stands for it. Read once from the baked
 * `/data/shows.json` — the collection the admin `/shows` screen writes, where both
 * of those are chosen by hand.
 *
 * Stores rather than props threaded from every surface: the statue is drawn on the
 * map's pins, in the panel's team strip and across the roster grid, and the glyph
 * is on top of that in both panel tables, the breadcrumb, the radio's plate and a
 * booster box's lid. Each of those knows a character's or a town's show id (the
 * `/characters` assignment, the town's own seeded show) but has no reason to know
 * what a show looks like. They hand over the id, and the load happens once for all
 * of them however many are on screen.
 */
export interface ShowLogo {
	id: number;
	name: string;
	/** The show's enabled logo, at gallery size. */
	url: string;
}

const logos = writable<ReadonlyMap<number, ShowLogo>>(new Map());

/** Show id → its logo, for every show that has one enabled. Empty until loaded. */
export const showLogos: Readable<ReadonlyMap<number, ShowLogo>> = { subscribe: logos.subscribe };

const glyphs = writable<ReadonlyMap<number, string>>(new Map());

/**
 * Show id → its glyph as inline-ready SVG markup, for every show that has an icon
 * picked. Empty until loaded, and subscribing is what starts the load — a table
 * that asks whether a show has a glyph is exactly a table that wants it fetched, so
 * no surface has to remember to ask for the collection first.
 *
 * Markup rather than the icon's name, because the artwork has to be part of *this*
 * document to take the colour of the line it sits in (see `inlineIconMarkup`), and
 * because the name alone is a fetch every caller would then have to do for itself.
 */
export const showGlyphs: Readable<ReadonlyMap<number, string>> = readable<ReadonlyMap<number, string>>(
	new Map(),
	(set) => {
		const unsubscribe = glyphs.subscribe(set);
		void loadShowGlyphs();
		return unsubscribe;
	}
);

// The in-flight (or finished) collection read, so a hundred statues mounting at once
// share one fetch. Cleared on failure, so a later mount tries again rather than the
// whole session going logo-less over one dropped request.
let collectionLoad: Promise<ShowsCollection> | null = null;

function loadCollection(): Promise<ShowsCollection> {
	collectionLoad ??= fetch('/data/shows.json')
		.then((response) => {
			if (!response.ok) throw new Error(`Failed to load shows (${response.status})`);
			return response.json() as Promise<ShowsCollection>;
		})
		.catch((error) => {
			collectionLoad = null;
			throw error;
		});
	return collectionLoad;
}

// The logo load, memoised for the same reason the collection read is: every statue
// on screen calls for it, and the first one is the one that does the work.
let logoLoad: Promise<void> | null = null;

/**
 * Load the show logos once. Safe to call from every statue that mounts: the
 * first call fetches and the rest await that same promise. A show with no logo
 * enabled is simply absent from the map — a failed load leaves it empty, and
 * every caller draws as it does without one.
 */
export function loadShowLogos(): Promise<void> {
	logoLoad ??= loadCollection()
		.then((collection) => {
			const byId = new Map<number, ShowLogo>();
			for (const entry of collection.shows ?? []) {
				const url = showLogoUrl(entry);
				if (url) byId.set(entry.show.id, { id: entry.show.id, name: entry.show.name, url });
			}
			logos.set(byId);
		})
		.catch(() => {
			logoLoad = null;
		});
	return logoLoad;
}

// The glyph load, kept so the pack scene — which needs the markup as pixels rather
// than as a subscription — can await the same one the document's copies started.
let glyphLoad: Promise<void> | null = null;

/**
 * Load every authored show's glyph once. Called for you by the first subscriber to
 * {@link showGlyphs}, and directly by the canvas, which has to hold the markup in
 * its hand rather than watch a store. A show whose icon will not load is left
 * unbadged, which is what a show with no icon picked looks like anyway.
 */
export function loadShowGlyphs(): Promise<void> {
	if (!browser) return Promise.resolve();
	glyphLoad ??= loadCollection()
		.then(async (collection) => {
			const icons = showIconsByShow(collection);
			const byId = new Map<number, string>();
			await Promise.all(
				[...icons].map(async ([showId, icon]) => {
					const markup = await loadIconMarkup(icon);
					if (markup) byId.set(showId, markup);
				})
			);
			glyphs.set(byId);
		})
		.catch(() => {
			glyphLoad = null;
		});
	return glyphLoad;
}
