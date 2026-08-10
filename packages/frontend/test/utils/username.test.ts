import { describe, expect, it } from 'vitest';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '$types/profile.type';
import { isValidUsername } from '$utils/profile/username';
import catalogue from '../../src/services/i18n/locales/ca.json';

// What a username may be is said in three places — the RPC that decides
// (`set_player_username`), the rule the screens check before sending, and the sentence
// the player is refused with. Only the second is reachable from here; the first is held
// to it by the regex being written the same way in both, and the third by this file.

describe('the names the game will take', () => {
	it('takes letters, digits and underscores', () => {
		expect(isValidUsername('bearni')).toBe(true);
		expect(isValidUsername('player_one')).toBe(true);
		expect(isValidUsername('Nakama99')).toBe(true);
		expect(isValidUsername('___')).toBe(true);
	});

	it('takes nothing else — no accents, spaces or punctuation', () => {
		expect(isValidUsername('Núria')).toBe(false);
		expect(isValidUsername('en Bernat')).toBe(false);
		expect(isValidUsername('l·luc')).toBe(false);
		expect(isValidUsername('joan.pau')).toBe(false);
		expect(isValidUsername('joan-pau')).toBe(false);
		expect(isValidUsername('nom!')).toBe(false);
		expect(isValidUsername('💥')).toBe(false);
	});

	it('holds the name between the two lengths', () => {
		expect(isValidUsername('a'.repeat(USERNAME_MIN_LENGTH - 1))).toBe(false);
		expect(isValidUsername('a'.repeat(USERNAME_MIN_LENGTH))).toBe(true);
		expect(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH))).toBe(true);
		expect(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
	});

	it('measures the name the RPC would store, not the whitespace around it', () => {
		expect(isValidUsername('  bearni  ')).toBe(true);
		expect(isValidUsername(`  ${'a'.repeat(USERNAME_MAX_LENGTH + 1)}  `)).toBe(false);
	});

	it('is not the way an account is made nameless', () => {
		expect(isValidUsername('')).toBe(false);
		expect(isValidUsername('   ')).toBe(false);
	});

	it('answers the same on every call — a stateful regex would not', () => {
		expect(isValidUsername('bearni')).toBe(true);
		expect(isValidUsername('bearni')).toBe(true);
	});

	it('states the rule with the lengths the screens enforce', () => {
		const message = (catalogue as Record<string, any>).profile.username.invalid as string;
		expect(message).toContain('{min}');
		expect(message).toContain('{max}');
	});
});
