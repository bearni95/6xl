/**
 * Slices the aura sprite sheet at the repo root into per-color animation
 * frames under static/auras/<color>/<n>.png — run `pnpm generate:auras`.
 *
 * The sheet (aura_effects_by_blaqshoes_d54t87y.png) is a 9-row × 4-column grid:
 * each row is one aura color, each column one animation frame. Only the rows
 * matching the game's six combat colors are exported. The sheet's black
 * background is removed by deriving each pixel's alpha from its brightest
 * channel and un-premultiplying the color, which reproduces the original
 * additive glow over any background.
 *
 * **A frame is the flame and nothing else.** The bands below are cut at the gaps
 * between the sheet's columns and rows, so each one carries a margin of its own
 * around the fire — an uneven one, since the fire leans and the gaps do not. The
 * board stands the flame on the fighter's feet and centres it on the fighter, and
 * it can only do that by the edges of the picture it is handed: a margin baked into
 * the frame is the flame drawn off centre and hovering over the ground by however
 * much of it there happened to be, differently on each of the four frames. So every
 * frame is cropped to its own painted pixels before it is written, and the file's
 * own rectangle *is* the fire's extent — the same bargain the decoded character
 * frames are written under.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHEET = join(__dirname, 'aura_effects_by_blaqshoes_d54t87y.png');
// Decoded aura frames go into @3xl/assets, served at /assets/auras.
const OUT_DIR = join(__dirname, '..', 'assets', 'public', 'auras');

/** Measured horizontal band [start, end) of each animation frame column —
 * like the rows, the columns aren't spaced uniformly, so cut at the gaps. */
const COL_BANDS = [
	[0, 221],
	[221, 436],
	[436, 632],
	[632, 821]
];

/**
 * Measured vertical band [start, end) of each combat color's sheet row. The
 * sheet's rows are not uniformly spaced (blue and purple touch, orange starts
 * above the uniform boundary), so the bands were read off the actual content
 * gaps rather than divided evenly. The skipped rows (cyan, black, white) have
 * no combat color to serve.
 */
const COLOR_BANDS = {
	yellow: [0, 200],
	green: [200, 403],
	red: [403, 603],
	blue: [802, 1000],
	purple: [1000, 1202],
	orange: [1204, 1401]
};

/**
 * How opaque a pixel has to be to count as fire, out of 255. Not zero: the glow
 * fades to nothing at its edges, and a pixel at alpha 1 is a pixel nobody sees —
 * cropping to it would keep most of the margin the crop is there to take off.
 * The same threshold, and the same reasoning, as the crown reader's.
 */
const PAINTED_ALPHA = 8;

/** The painted rectangle of an RGBA frame — `[left, top, right, bottom)` — or null
 * for one with no fire in it at all. */
function paintedBox(data, width, height) {
	let left = width;
	let right = -1;
	let top = height;
	let bottom = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] <= PAINTED_ALPHA) continue;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
		}
	}
	return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

const sheet = PNG.sync.read(readFileSync(SHEET));

for (const [color, [bandStart, bandEnd]] of Object.entries(COLOR_BANDS)) {
	const bandHeight = bandEnd - bandStart;
	const dir = join(OUT_DIR, color);
	mkdirSync(dir, { recursive: true });
	const sizes = [];
	for (let col = 0; col < COL_BANDS.length; col++) {
		const [colStart, colEnd] = COL_BANDS[col];
		const bandWidth = colEnd - colStart;
		const band = new PNG({ width: bandWidth, height: bandHeight });
		for (let y = 0; y < bandHeight; y++) {
			for (let x = 0; x < bandWidth; x++) {
				const src = ((bandStart + y) * sheet.width + (colStart + x)) * 4;
				const dst = (y * bandWidth + x) * 4;
				const r = sheet.data[src];
				const g = sheet.data[src + 1];
				const b = sheet.data[src + 2];
				// Glow over black: alpha is the brightest channel; un-premultiplying
				// the color keeps `color × alpha` equal to the original pixel.
				const alpha = Math.max(r, g, b);
				const scale = alpha > 0 ? 255 / alpha : 0;
				band.data[dst] = Math.min(255, Math.round(r * scale));
				band.data[dst + 1] = Math.min(255, Math.round(g * scale));
				band.data[dst + 2] = Math.min(255, Math.round(b * scale));
				band.data[dst + 3] = alpha;
			}
		}
		// And out of the band, the fire itself (see the header). A band with nothing
		// painted in it is written as it stands rather than skipped: a missing frame
		// would shorten the animation, and an empty one is at least honest about the
		// bands having been read wrong.
		const box = paintedBox(band.data, bandWidth, bandHeight) ?? {
			left: 0,
			top: 0,
			right: bandWidth,
			bottom: bandHeight
		};
		const frame = new PNG({ width: box.right - box.left, height: box.bottom - box.top });
		PNG.bitblt(band, frame, box.left, box.top, frame.width, frame.height, 0, 0);
		writeFileSync(join(dir, `${col + 1}.png`), PNG.sync.write(frame));
		sizes.push(`${frame.width}×${frame.height}`);
	}
	console.log(`${color}: ${COL_BANDS.length} frames (band ${bandStart}–${bandEnd}) — ${sizes.join(' ')}`);
}
