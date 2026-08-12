/**
 * A DaisyUI theme colour, as a number a canvas can be told.
 *
 * The theme is CSS and nothing else — `--color-primary` and the rest are declared in the
 * `daisyui/theme` block at the head of `css/app.css` — so every mark in the *document*
 * gets these for free, through a `bg-primary` or a `currentColor`. A canvas is the one
 * place a stylesheet does not reach (see the icon note in CLAUDE.md), and a mark drawn
 * there in "the theme's primary" has to be handed the value. This is the handing over,
 * and it is a *read* rather than a second copy of the palette: the number comes off the
 * live theme, so the two can never come to disagree about what primary is. Spelling the
 * hex into the engine would have been that second copy, and it would have drifted the
 * first time a token was retuned.
 *
 * Resolved through a canvas rather than parsed, for one reason: the theme is written in
 * `oklch()`, `getComputedStyle` hands a custom property back **as authored** (a custom
 * property has no computed form to reduce to), and neither Pixi nor anything here can read
 * an oklch triplet. The browser can, and painting one pixel is asking it to — whatever
 * colour syntax a future theme is written in, this reads it, because the thing doing the
 * reading is the same engine that would have drawn it in the document.
 *
 * The pixel is read back non-premultiplied, so an opaque colour comes back exactly; alpha
 * is dropped, since what a canvas mark is drawn *at* is the mark's own business.
 *
 * `fallback` covers all three ways there may be no answer — no document (a server, a test),
 * no such token on the root, or a value this browser cannot parse — so a caller always has
 * a colour and never has to hold a null.
 */
export function themeColorHex(token: string, fallback: number): number {
	if (typeof document === 'undefined') return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	if (!value) return fallback;

	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return fallback;

	// A colour the browser cannot parse is *ignored* on assignment rather than throwing, so
	// the fill would silently stay whatever it was. Setting a value nothing would ever be
	// first and reading it back is how that silence is heard.
	const UNPARSED = '#010203';
	ctx.fillStyle = UNPARSED;
	ctx.fillStyle = value;
	if (ctx.fillStyle === UNPARSED) return fallback;

	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return (r << 16) | (g << 8) | b;
}
