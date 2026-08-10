/**
 * The window's boxes, fetched before anybody asks for them.
 *
 * A box is three pictures — its cover, its wordmark and its show's glyph — and the grid scene
 * builds every box together and shows none until all of them are built (see
 * BoosterBoxGridScene's `build`, and the note there saying why). So the canvas is as slow as
 * the whole window's art is, and it is raised by a click: the sheet comes up over the map and
 * stands there empty for as long as a few dozen posters take to arrive.
 *
 * None of that art is in doubt, though. The window is assembled while the map is being looked
 * at — long before anything is clicked — and what a box is printed with is settled the moment
 * its pack exists. So it is fetched then, into the very caches the sprites ask (both are
 * module-level and keyed by url, and a hit resolves without a request), and by the time a box
 * is clicked the scene builds out of memory.
 *
 * Deliberately the same three calls a box makes, and in the same terms — the ink follows the
 * stock, since a glyph is cached per ink and warming the wrong one warms nothing. A picture
 * that fails is left failed: this is a head start, not a loader, and every one of these already
 * falls back to a bare surface.
 */

import { SpawnBox } from '$types/character-spawn.type';
import { textureCache } from '$utils/card/texture-cache';
import { PACK_STOCK_TONES } from '../box-stock';
import { showGlyphTexture } from './show-glyph-texture';
import type { OpenerPack } from './opener-view.type';

/**
 * Warm the caches for every pack in `packs`. Resolves when they have all answered, which
 * nothing has to wait for — call it and forget it.
 */
export async function preloadPackArt(packs: OpenerPack[]): Promise<void> {
	await Promise.all(
		packs.map((pack) => {
			const stock = PACK_STOCK_TONES[pack.light ? SpawnBox.White : SpawnBox.Black];
			return Promise.all([
				textureCache.poster(pack.coverUrl),
				textureCache.icon(pack.logoUrl),
				showGlyphTexture(pack.showId, stock.ink)
			]);
		})
	);
}
