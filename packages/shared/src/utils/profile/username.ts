import {
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN
} from '../../types/profile.type';

/**
 * Whether a typed name is one `set_player_username` will take: between
 * {@link USERNAME_MIN_LENGTH} and {@link USERNAME_MAX_LENGTH} characters, made of ASCII
 * letters, digits and underscores alone.
 *
 * The name is trimmed first, exactly as the RPC trims it, so the surrounding whitespace a
 * paste brings in is not what the player is refused for. An empty name is *not* valid
 * here — clearing the field is a different move (it returns the account to nameless) and
 * the screens say so themselves; this answers one question only, which is whether what was
 * typed is a name.
 */
export function isValidUsername(name: string): boolean {
	const trimmed = name.trim();
	return (
		trimmed.length >= USERNAME_MIN_LENGTH &&
		trimmed.length <= USERNAME_MAX_LENGTH &&
		USERNAME_PATTERN.test(trimmed)
	);
}
