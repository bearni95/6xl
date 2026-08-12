import { Router } from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
	NARRATION_EVENTS,
	NARRATION_LINES_PER_EVENT,
	NARRATION_LINE_MAX_LENGTH,
	isNarrationEvent,
	unknownNarrationTokens,
	type CombatNarrationCollection,
	type CombatNarrationEvent
} from '@3xl/shared/types/combat-narration.type';
import { asyncHandler, httpError } from '../http-error';

/**
 * Read/write API for the combat narration stored as JSON in the @3xl/data package under
 * `public/combat-narration.json` (served to the apps at `/data/combat-narration.json`).
 * The admin `/narration` screen calls this to say what the fight says over each move it
 * plays out, straight into the git tree.
 *
 * One collection file, upserted an **event at a time**, pretty-printed with tabs. An
 * event is not invented by the author either: the fight announces the ids in
 * `NARRATION_EVENTS` and nothing else, so the catalogue is the list and the collection
 * only ever answers it — a save for an event the fight never announces is refused, as is
 * a line naming a `{placeholder}` that event never carries. Both are the same failure
 * from the player's side: a sentence with a hole in it, on screen, mid-fight.
 */

// packages/backend/src/routes → packages/data. Resolved from this file's location so the
// process cwd doesn't matter.
const NARRATION_PATH = fileURLToPath(
	new URL('../../../data/public/combat-narration.json', import.meta.url)
);

const EMPTY: CombatNarrationCollection = { lines: {} };

/** Read the collection, returning an empty one when the file doesn't exist yet. */
async function readCollection(): Promise<CombatNarrationCollection> {
	try {
		const raw = await readFile(NARRATION_PATH, 'utf-8');
		const parsed = JSON.parse(raw) as CombatNarrationCollection;
		return parsed?.lines && typeof parsed.lines === 'object' ? parsed : EMPTY;
	} catch {
		return EMPTY;
	}
}

/**
 * Write the collection back with its events in the catalogue's own order, pretty-printed
 * with tabs and a trailing newline to match the checked-in JSON style.
 *
 * The order matters because this file is read by people: the events are listed in the
 * order a turn reaches them, and a save that appended a rewritten event to the end would
 * shuffle the document into the order it happened to be edited in.
 */
async function writeCollection(collection: CombatNarrationCollection): Promise<void> {
	const lines: CombatNarrationCollection['lines'] = {};
	for (const event of NARRATION_EVENTS) {
		const authored = collection.lines[event.id];
		if (authored) lines[event.id] = authored;
	}
	await writeFile(NARRATION_PATH, JSON.stringify({ lines }, null, '\t') + '\n', 'utf-8');
}

/** One event's authored lines, narrowed out of an unknown POST body. */
interface NarrationSave {
	event: CombatNarrationEvent;
	lines: string[];
}

/**
 * One event's lines, narrowed out of an unknown array. Everything the fight could not say
 * is refused here rather than written: a line naming a `{placeholder}` the event never
 * carries, and a line too long to be read in the middle of a turn.
 */
function validateLines(event: CombatNarrationEvent, entries: unknown): string[] {
	if (!Array.isArray(entries)) httpError(400, `"${event}" lines must be an array`);
	if (entries.length > NARRATION_LINES_PER_EVENT) {
		httpError(400, `An event can hold at most ${NARRATION_LINES_PER_EVENT} lines`);
	}

	const lines: string[] = [];
	for (const entry of entries) {
		if (typeof entry !== 'string') httpError(400, 'Every line must be a string');
		const line = entry.trim();
		// A blank row is how the screen offers a new line, so it is dropped rather than
		// refused: saving with one still empty is a save of the lines that were written.
		if (!line) continue;
		if (line.length > NARRATION_LINE_MAX_LENGTH) {
			httpError(400, `A line cannot be longer than ${NARRATION_LINE_MAX_LENGTH} characters`);
		}
		const unknown = unknownNarrationTokens(event, line);
		if (unknown.length > 0) {
			httpError(
				400,
				`"${event}" cannot fill ${unknown.map((token) => `{${token}}`).join(', ')} — nothing would replace it on screen`
			);
		}
		lines.push(line);
	}

	return lines;
}

/**
 * Narrow an unknown POST body to one event's lines. Everything not named here is dropped,
 * so a crafted body can't smuggle extra fields into the git tree.
 */
function validate(body: unknown): NarrationSave {
	const draft = body as Partial<NarrationSave>;
	if (!draft || typeof draft !== 'object') httpError(400, 'Body must be an object');

	const event = draft.event;
	if (!isNarrationEvent(event)) {
		httpError(400, `Unknown narration event "${String(event)}"`);
	}

	return { event, lines: validateLines(event, draft.lines) };
}

/**
 * Narrow an unknown PUT body to the whole collection — every event at once, which is what
 * an import of the CSV is.
 *
 * A replacement rather than a merge: an event the body does not name is an event with
 * nothing authored, because the document the author edited is the whole of the narration
 * and a line deleted from it has to be a line deleted. Which is also why the whole body is
 * validated before a byte is written — a half-applied replacement would leave the file
 * saying something nobody wrote.
 */
function validateCollection(body: unknown): CombatNarrationCollection {
	const draft = body as Partial<CombatNarrationCollection>;
	if (!draft || typeof draft !== 'object') httpError(400, 'Body must be an object');
	if (!draft.lines || typeof draft.lines !== 'object') httpError(400, 'lines must be an object');

	const lines: CombatNarrationCollection['lines'] = {};
	for (const [event, entries] of Object.entries(draft.lines)) {
		if (!isNarrationEvent(event)) httpError(400, `Unknown narration event "${event}"`);
		const authored = validateLines(event, entries);
		if (authored.length > 0) lines[event] = authored;
	}
	return { lines };
}

export const combatNarrationRouter = Router();

// GET /api/combat-narration/events — the catalogue: every moment of a turn that has words
// on it, what the board is doing at that moment, and the names a line about it may use.
// It is the list the admin screen draws its sections from, so the screen can never offer
// an event (or a placeholder) the API would refuse.
combatNarrationRouter.get('/events', (_req, res) => {
	res.json({ events: NARRATION_EVENTS, maxLength: NARRATION_LINE_MAX_LENGTH, maxLines: NARRATION_LINES_PER_EVENT });
});

// GET /api/combat-narration — the whole authored collection.
combatNarrationRouter.get(
	'/',
	asyncHandler(async (_req, res) => {
		res.json(await readCollection());
	})
);

// POST /api/combat-narration — upsert one event's lines. Returns the updated collection
// so the admin re-renders from what actually landed on disk.
combatNarrationRouter.post(
	'/',
	asyncHandler(async (req, res) => {
		const { event, lines } = validate(req.body);
		const collection = await readCollection();
		const updated: CombatNarrationCollection = {
			lines: { ...collection.lines, [event]: lines }
		};
		await writeCollection(updated);
		res.json(updated);
	})
);

// PUT /api/combat-narration — replace the whole collection in one write. What an import of
// the CSV lands as, and what "save every section" on the admin screen is: the events only
// mean anything as a set, so a file the author edited whole is written whole.
combatNarrationRouter.put(
	'/',
	asyncHandler(async (req, res) => {
		const collection = validateCollection(req.body);
		await writeCollection(collection);
		res.json(collection);
	})
);
