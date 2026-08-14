import { describe, it, expect } from 'vitest';
import {
	LEVEL_BOX_CAPTION,
	LEVEL_BOX_ID,
	isLevelLocation,
	levelBoxCaption,
	levelBoxClaimKey,
	levelBoxLocationId,
	levelFromLocation,
	levelPlaceName,
	pendingLevelBoxes
} from '$utils/spawn/level-box';
import { claimedBoxKey } from '$utils/spawn/claimed-box';
import { WELCOME_BOX_CLAIM_KEY } from '$utils/spawn/welcome-box';
import { MAX_LEVEL } from '$utils/progression/level';
import { SpawnBox } from '$types/character-spawn.type';

// One box per level, and the browser's half of saying which of them are left. The server
// keeps the other half — `claim_level_booster` reads the caller's own experience and the
// same claim rows — so what is checked here is that a box drawn as waiting is a box the
// index has not spent, and that these claims can never be mistaken for anybody else's.

describe('pendingLevelBoxes', () => {
	it('is one box per level reached, oldest first', () => {
		expect(pendingLevelBoxes(4, new Set())).toEqual([1, 2, 3, 4]);
		// Level 1 is where everybody starts: there is a box waiting from the first visit.
		expect(pendingLevelBoxes(1, new Set())).toEqual([1]);
	});

	it('drops the ones already taken, whichever order they were taken in', () => {
		expect(pendingLevelBoxes(4, new Set([1, 3]))).toEqual([2, 4]);
		expect(pendingLevelBoxes(4, new Set([1, 2, 3, 4]))).toEqual([]);
	});

	it('offers every level while the claims have not been read', () => {
		// Null is "nobody has asked yet", and the safe way round: an unread claim offers a
		// box the server then refuses in a sentence, where the other way hides a real one.
		expect(pendingLevelBoxes(3, null)).toEqual([1, 2, 3]);
	});

	it('offers nothing above the level the player has reached, or past the table', () => {
		expect(pendingLevelBoxes(2, new Set([1, 2, 3]))).toEqual([]);
		expect(pendingLevelBoxes(MAX_LEVEL + 5, new Set()).length).toBe(MAX_LEVEL);
		expect(pendingLevelBoxes(0, new Set())).toEqual([]);
		expect(pendingLevelBoxes(Number.NaN, new Set())).toEqual([]);
	});
});

describe('levelBoxClaimKey', () => {
	it('spends one level and leaves the rest standing', () => {
		const keys = new Set([1, 2, 3].map(levelBoxClaimKey));
		expect(keys.size).toBe(3);
	});

	it('is the same triple every other box is spent against, the level where the year goes', () => {
		expect(levelBoxClaimKey(7)).toBe(claimedBoxKey(LEVEL_BOX_ID, 7, SpawnBox.Black));
	});

	it('can never collide with a town’s box or with the welcome', () => {
		// A town's box is filed under its own feature id and a festa's year; the welcome
		// under its own sentinel and year 0. A level box shares neither.
		expect(levelBoxClaimKey(2026)).not.toBe(claimedBoxKey('ES_08028', 2026, SpawnBox.Black));
		expect(levelBoxClaimKey(0)).not.toBe(WELCOME_BOX_CLAIM_KEY);
	});
});

describe('levelBoxCaption', () => {
	it('says the level where a town’s box says its year', () => {
		expect(levelBoxCaption(1)).toBe('Nivell 1');
		expect(levelBoxCaption(20)).toBe('Nivell 20');
	});
});

describe('levelBoxLocationId', () => {
	// The level rides on the card, not just on the box: a card out of a level box is asked
	// where it is from long after the box that dealt it is off the screen — in the roster,
	// in the album, on somebody else's profile, under a statue on the map — and every one of
	// them used to be told `Nivell` and nothing more.
	it('files each level’s cards under a place of their own', () => {
		expect(levelBoxLocationId(7)).toBe(`${LEVEL_BOX_ID}:7`);
		expect(new Set([1, 2, 3].map(levelBoxLocationId)).size).toBe(3);
	});

	it('is still a level box wherever the game asks, and so is the bare sentinel', () => {
		// The bare one is what a card dealt before this carries, and what every *claim* is
		// filed under — the claim key is (town, year, stock) and the level is the year.
		expect(isLevelLocation(levelBoxLocationId(7))).toBe(true);
		expect(isLevelLocation(LEVEL_BOX_ID)).toBe(true);
		expect(isLevelLocation('ES_08028')).toBe(false);
		expect(isLevelLocation(null)).toBe(false);
		// Not a town whose id merely opens with the word.
		expect(isLevelLocation('nivella')).toBe(false);
	});

	it('reads the level back off a card, and says nothing where there is none to read', () => {
		expect(levelFromLocation(levelBoxLocationId(13))).toBe(13);
		expect(levelFromLocation(LEVEL_BOX_ID)).toBeNull();
		expect(levelFromLocation('ES_08028')).toBeNull();
		expect(levelFromLocation(null)).toBeNull();
		// A suffix that is not a level in the table's range is not a level at all.
		expect(levelFromLocation(`${LEVEL_BOX_ID}:0`)).toBeNull();
		expect(levelFromLocation(`${LEVEL_BOX_ID}:${MAX_LEVEL + 1}`)).toBeNull();
		expect(levelFromLocation(`${LEVEL_BOX_ID}:setze`)).toBeNull();
		expect(levelFromLocation(`${LEVEL_BOX_ID}:2.5`)).toBeNull();
	});

	it('letters a card with the whole of what its box said, and falls back to the word', () => {
		expect(levelPlaceName(levelBoxLocationId(7))).toBe(levelBoxCaption(7));
		expect(levelPlaceName(LEVEL_BOX_ID)).toBe(LEVEL_BOX_CAPTION);
	});
});
