import { writable } from 'svelte/store';

/**
 * Whether the player's own account sheet is up. It is what the plate at the foot of the
 * map opens (see PlayerPanel): the plate reads the account out — the picture, the name,
 * the level — and this is the whole of what it summarises, the picture and the name being
 * changed here and the address, the day the account was opened and the way out of it
 * listed under them.
 *
 * It is deliberately not the settings: what the game does *about* a player — the visit
 * counter's switch, the copy of everything held, the way out for good — is its own sheet
 * behind the cog beside the plate (see `$services/settingsModal`). One press for who you
 * are, one for what is done with it.
 *
 * The modal itself lives once at the layout root, like the avatar picker. It has to live
 * out there rather than inside the map panel: the panel is a fixed, z-indexed element, so
 * anything rendered within it is trapped in its stacking context and could never rise
 * above it.
 */
export const profileModalOpen = writable(false);
