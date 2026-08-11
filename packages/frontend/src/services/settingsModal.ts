import { writable } from 'svelte/store';

/**
 * Whether the settings sheet is up as a modal. It carries what the game does *about* a
 * player — the visit counter's switch, the copy of everything held, the record of what
 * has been accepted and the way out for good — and nothing else: who they are is the
 * plate's own sheet (see `$services/profileModal`), which is what the plate at the foot
 * of the map opens. The cog beside that plate is what flips this.
 *
 * The two were one sheet for a while, which put "delete your account" four lines under
 * the field somebody was typing their name into, and left the plate and the cog as two
 * doors onto the same thing.
 *
 * The modal itself lives once at the layout root, like the avatar picker. It has to live
 * out there rather than inside the panel: the panel is a fixed, z-indexed element, so
 * anything rendered within it is trapped in its stacking context and could never rise
 * above it — a dialog raised from the panel would be pinned under every other modal on
 * the page.
 */
export const settingsModalOpen = writable(false);
