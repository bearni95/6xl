import { writable } from 'svelte/store';

/**
 * Whether the collection modal is up. The album has no route of its own — it is a
 * modal raised over the map, opened from the book at the far end of the breadcrumb
 * bar.
 *
 * Not the same thing as the roster (`$services/roster`, a page): the roster is the cards a player
 * holds, and this is every card the game has, show by show, with the ones they hold
 * standing at full strength.
 */
export const collectionModalOpen = writable(false);
