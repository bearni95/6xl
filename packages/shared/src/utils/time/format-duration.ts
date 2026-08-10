/**
 * A span of milliseconds as a clock readout, `H:MM:SS` — what a countdown to one
 * of the game's daily resets shows. Hours are never padded (they run to 24 at
 * most) and never dropped, so the string keeps its shape as it ticks down.
 * Negative spans read as zero: a deadline that has passed has nothing left.
 */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const pad = (value: number): string => String(value).padStart(2, '0');
	return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * A span of milliseconds as a bare count of seconds — what a countdown short enough to
 * have no minutes in it shows, where a clock readout would spell out three fields that
 * never move. Rounded up, so a span with anything left in it reads as at least one:
 * a readout saying nought while whatever it is holding is still held is a lie.
 */
export function formatSeconds(ms: number): string {
	return String(Math.max(0, Math.ceil(ms / 1000)));
}

/**
 * A song's length, `M:SS` — the other shape a span is read in, and the one a list of
 * tracks wants. The hour slot is dropped rather than kept, because nothing is ticking
 * here for it to hold its shape against, and appears only for a song long enough to
 * need it. A length that is not known yet (a file whose metadata has not been read, or
 * one the browser could not decode) is null and reads as a dash, since a song is never
 * nought seconds long.
 */
export function formatTrackLength(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
	const total = Math.round(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const pad = (value: number): string => String(value).padStart(2, '0');
	const rest = `${hours > 0 ? pad(minutes) : minutes}:${pad(total % 60)}`;
	return hours > 0 ? `${hours}:${rest}` : rest;
}
