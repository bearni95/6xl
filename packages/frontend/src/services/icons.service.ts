import { inlineIconMarkup } from '$utils/icon/inline-svg';

/**
 * One vendored glyph, fetched by name (`<folder>/<slug>`, the form the icon sets are
 * stored in) and rewritten to be inlined into the document — the baked white becomes
 * `currentColor` and the artwork's own size becomes `1em`, so the mark takes the
 * colour and the size of whatever it is drawn in. See `inlineIconMarkup` for why an
 * `<img>` cannot do that.
 *
 * It lived in `shows.service` while a show's mark was the only glyph the game drew in
 * a line of text. It is not about shows — the arena's way out of a fight is one too —
 * so it stands on its own, and shows.service reads it from here. One cache either
 * way, which is the point: two surfaces given the same mark are one file.
 *
 * Cached per icon and kept for the session. These are a few hundred bytes each, and a
 * failure resolves to null rather than throwing — a glyph that will not load leaves
 * the thing it marks unmarked, which is what a thing with no glyph picked looks like.
 */
const markupByIcon = new Map<string, Promise<string | null>>();

export function loadIconMarkup(name: string): Promise<string | null> {
	let pending = markupByIcon.get(name);
	if (!pending) {
		pending = fetch(`/assets/icons/${name}.svg`)
			.then((response) => (response.ok ? response.text() : null))
			.then((markup) => (markup ? inlineIconMarkup(markup) : null))
			.catch(() => null);
		markupByIcon.set(name, pending);
	}
	return pending;
}
