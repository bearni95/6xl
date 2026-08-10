import localStorageWritableStore from '$utils/localStorageWritableStore';

/** How long the radar rests after it has pointed somewhere. */
export const RADAR_COOLDOWN_MS = 60_000;

/**
 * The instant the radar may be pressed again, epoch milliseconds — 0 when it is free.
 *
 * The radar reads the whole window of boxes and frames the map on the nearest one, which
 * is the one press on this page that answers "where do I go next" for the reader rather
 * than for a place they picked. Held down it would walk them through the window a town at
 * a time, so it rests a minute between answers.
 *
 * This is a rest and not a rule: nothing is awarded by pressing it and the boxes it points
 * at are the same boxes whether or not it does, so the deadline is the browser's own — kept
 * in localStorage rather than asked of the server. Stored as the instant it is over rather
 * than as a span left, because a span would have to be counted down by something that is
 * running, and this one has to survive the page being closed on it.
 */
export const radarCooldownUntil = localStorageWritableStore<number>('radar-cooldown', 0);

/** Start the rest, from now. */
export function startRadarCooldown(): void {
	radarCooldownUntil.set(Date.now() + RADAR_COOLDOWN_MS);
}
