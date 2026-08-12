// The six spawn colours as Tailwind classes.
//
// Written out in full, one literal per swatch: Tailwind only emits a class it can
// see spelled in the source, so these can never be built from a colour name at
// runtime. Kept in one module because every surface that paints a card's colour —
// the team strip, the map's pins — must paint the *same* six, and a second copy is
// how two of them come to disagree.
//
// The Pixi canvases do not read these: a canvas takes 24-bit hex, which is
// `SPAWN_COLOR_HEX` in @3xl/shared. These are the document's half of the same
// palette, and the comment there is what keeps the two in step.

import { SpawnColor } from '$types/character-spawn.type';
import { ArtificialColor, type RegionColor } from '$types/region-color.type';

/** The colour as a fill. */
export const SPAWN_FILL_CLASSES: Record<SpawnColor, string> = {
	[SpawnColor.Red]: 'bg-red-500',
	[SpawnColor.Yellow]: 'bg-yellow-400',
	[SpawnColor.Blue]: 'bg-blue-500',
	[SpawnColor.Orange]: 'bg-orange-500',
	[SpawnColor.Green]: 'bg-green-500',
	[SpawnColor.Purple]: 'bg-purple-500'
};

/** The colour as a fill, with the ink that reads on it — yellow is the one light
 * enough to want black. */
export const SPAWN_PANEL_CLASSES: Record<SpawnColor, string> = {
	[SpawnColor.Red]: 'bg-red-500 text-white',
	[SpawnColor.Yellow]: 'bg-yellow-400 text-black',
	[SpawnColor.Blue]: 'bg-blue-500 text-white',
	[SpawnColor.Orange]: 'bg-orange-500 text-white',
	[SpawnColor.Green]: 'bg-green-500 text-white',
	[SpawnColor.Purple]: 'bg-purple-500 text-white'
};

/**
 * The same panel again for a *place*, which can be one colour more than a card: the six
 * a team's lead may have rolled, plus the grey the map paints somewhere nobody holds
 * (see `region-color.type`).
 *
 * Every surface that tiles a region reads this — the map's pins and the rows of the
 * column beside it, and the towns on a player's public profile page, which lists the
 * same places with the same component. It is also where `--color-gray-500` gets emitted
 * at all, which the polygon wash reads through `REGION_COLOR_CSS`.
 */
export const REGION_PANEL_CLASSES: Record<RegionColor, string> = {
	...SPAWN_PANEL_CLASSES,
	[ArtificialColor.Gray]: 'bg-gray-500 text-white'
};

/**
 * The place's panel again at nine tenths, for a band that lies *over* something: the team
 * row's banner, which is hung across the head room of the statues standing on it, so a
 * little of what is behind it comes through and it reads as a band over the side rather
 * than a lid across the top of it. The ink is not faded with it — a translucent fill under
 * solid lettering, not a faded panel — which is why the alpha is on the swatch and not an
 * `opacity` over the whole element.
 *
 * Here rather than in the component for the reason the rest of this module exists: it is
 * the same six (and the same grey), and a copy elsewhere is how two of them come to
 * disagree.
 */
export const REGION_BAND_CLASSES: Record<RegionColor, string> = {
	[SpawnColor.Red]: 'bg-red-500/90 text-white',
	[SpawnColor.Yellow]: 'bg-yellow-400/90 text-black',
	[SpawnColor.Blue]: 'bg-blue-500/90 text-white',
	[SpawnColor.Orange]: 'bg-orange-500/90 text-white',
	[SpawnColor.Green]: 'bg-green-500/90 text-white',
	[SpawnColor.Purple]: 'bg-purple-500/90 text-white',
	[ArtificialColor.Gray]: 'bg-gray-500/90 text-white'
};

/**
 * The colour as ink — lettering drawn in it, rather than a panel painted in it.
 *
 * The one place this is read is the narration over a fight, where each fighter's name is
 * written in the colour that fighter fights in: a sentence about two of them is read in one
 * glance that way, where two names in the plate's own ink have to be matched to the board.
 * Yellow keeps the 400 the fills use — it is the same swatch as the aura and the sparks the
 * board draws for that fighter, and a name that did not match them would be a seventh
 * colour.
 */
export const SPAWN_INK_CLASSES: Record<SpawnColor, string> = {
	[SpawnColor.Red]: 'text-red-500',
	[SpawnColor.Yellow]: 'text-yellow-400',
	[SpawnColor.Blue]: 'text-blue-500',
	[SpawnColor.Orange]: 'text-orange-500',
	[SpawnColor.Green]: 'text-green-500',
	[SpawnColor.Purple]: 'text-purple-500'
};

/** The colour as a border. */
export const SPAWN_BORDER_CLASSES: Record<SpawnColor, string> = {
	[SpawnColor.Red]: 'border-red-500',
	[SpawnColor.Yellow]: 'border-yellow-400',
	[SpawnColor.Blue]: 'border-blue-500',
	[SpawnColor.Orange]: 'border-orange-500',
	[SpawnColor.Green]: 'border-green-500',
	[SpawnColor.Purple]: 'border-purple-500'
};

/**
 * The colour as a character, for the one place a class cannot reach: the inside of a
 * native `<option>`, which the browser draws itself and no stylesheet gets at. The six
 * squares happen to be exactly the six colours, and they carry their own names for a
 * screen reader ("large red square"), so an option can say its colour without a swatch
 * element to paint.
 */
export const SPAWN_SQUARE_GLYPHS: Record<SpawnColor, string> = {
	[SpawnColor.Red]: '🟥',
	[SpawnColor.Yellow]: '🟨',
	[SpawnColor.Blue]: '🟦',
	[SpawnColor.Orange]: '🟧',
	[SpawnColor.Green]: '🟩',
	[SpawnColor.Purple]: '🟪'
};
