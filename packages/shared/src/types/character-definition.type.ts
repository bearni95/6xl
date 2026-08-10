/**
 * Our own character format. Each MUGEN character ships a generated manifest
 * (scripts/generate-sprites.js) exposing 80-100+ raw animations keyed by name
 * (`idle`, `walk`, `action-200`, …). A CharacterDefinition binds a small,
 * meaningful subset of those raw animations to the logical slots the game
 * actually drives — the movement animations the root page plays, plus the
 * character's combat moves — and layers custom gameplay params on top.
 *
 * Definitions live as JSON in @3xl/data under `public/characters/<id>/definition.json`,
 * are committed to the git tree, and are edited from /admin/characters through
 * the backend write API at `packages/backend/src/routes/characters.ts`.
 */

/**
 * A logical animation slot bound to a raw manifest animation key. `source` is a
 * key from the character's `manifest.json` `animations` map; an empty string
 * means the slot is not yet assigned.
 */
export interface AnimationBinding {
	/** Raw manifest animation key this slot maps to (`''` = unassigned). */
	source: string;
	/** Whether playback loops. */
	loop: boolean;
}

/**
 * One combat move a character defines. Characters no longer share a fixed
 * template of move slots — each declares its own list of moves, every entry
 * linking a raw manifest animation to one of the shared move types and giving
 * it a character-specific name ("Kamehameha", not "Ranged").
 */
export interface CharacterMove {
	/** Character-specific display name for this move. */
	name: string;
	/** Which shared move type this move fulfils (its tag). */
	type: MoveKind;
	/** Raw manifest animation key that plays for this move (`''` = unassigned). */
	source: string;
	/**
	 * The sprite that flies when this move fires. Only meaningful on moves whose
	 * type is in {@link PROJECTILE_MOVES} (ranged).
	 */
	projectile?: AnimationBinding;
}

/**
 * The base movement states the game loop drives. Directional movement lives
 * separately in `directions` (see below); these are the non-directional poses,
 * including the hurt flinch every character defines. Moved into data so a
 * character's movement can be re-bound without touching the player code.
 */
export type MovementAnimationName = 'idle' | 'hurt';

/**
 * Directional movement. There is no walk/run split anymore — a single animation
 * per direction. `move-right` inherits what `run` used to be.
 */
export type DirectionName = 'move-left' | 'move-right';

/** The shared move types a character's moves can be tagged with. */
export type MoveKind = 'melee' | 'ranged' | 'defend';

/** The three primary combat colors; each beats the next in a cycle. */
export type PrimaryColor = 'red' | 'blue' | 'yellow';

/** The three compound combat colors a character can be; each is a mix of two
 * primaries and beats the next compound in a cycle. */
export type CompoundColor = 'purple' | 'orange' | 'green';

/** Any color a move can be thrown as: a compound or one of its components. */
export type CombatColor = PrimaryColor | CompoundColor;

/** The two primary components each compound color mixes. */
export const COMPOUND_COMPONENTS: Record<CompoundColor, [PrimaryColor, PrimaryColor]> = {
	purple: ['red', 'blue'],
	orange: ['red', 'yellow'],
	green: ['blue', 'yellow']
};

/** Value used when a definition predates colors or carries an invalid one. */
export const DEFAULT_COLOR: CompoundColor = 'purple';

/** Compound colors in display order (also what definitions may declare). */
export const COMPOUND_COLORS: CompoundColor[] = ['purple', 'orange', 'green'];

/** The gameplay stat slots every character defines. */
export type StatKind = 'atk' | 'def' | 'hp';

/** Combat stats, each an integer in the inclusive range [STAT_MIN, STAT_MAX]. */
export type CharacterStats = Record<StatKind, number>;

export interface CharacterDefinition {
	/** Stable id, matches `/assets/<id>/` and `public/characters/<id>/definition.json`. */
	id: string;
	/** Human-readable name shown in pickers. */
	label: string;
	/** Folder (relative to the static root) with manifest.json + frames. */
	basePath: string;
	/** Non-directional movement states (idle/hurt), keyed by logical name. */
	animations: Record<MovementAnimationName, AnimationBinding>;
	/** Directional movement (move-left/move-right), keyed by direction. */
	directions: Record<DirectionName, AnimationBinding>;
	/**
	 * The moves this character defines. Each entry tags a raw animation with a
	 * shared move type and names it; projectile-firing moves carry their own
	 * projectile binding inline.
	 */
	moves: CharacterMove[];
	/** Gameplay stats (atk/def/hp), each an integer in [STAT_MIN, STAT_MAX]. */
	stats: CharacterStats;
	/** This character's compound combat color, driving the color RPS in combat. */
	color: CompoundColor;
	/**
	 * Chosen portrait: the filename the board shows for this character, picked from
	 * the manifest's `faces` in the admin Faces tab — a group-9000 sprite the archive
	 * shipped (`spr_9000_1.png`) or an image uploaded there (`custom_*`). Resolved
	 * against `basePath` either way. Omitted/empty falls back to the manifest's
	 * default `face`.
	 */
	face?: string;
	/**
	 * The square the admin framed on {@link CharacterDefinition.face} in the Faces
	 * tab — what the avatar picker and the account card show instead of the whole
	 * portrait. In the face file's own pixels, so it is only meaningful for the
	 * face it was authored against (picking another face re-frames it). Omitted
	 * means "no square authored": consumers show the full portrait.
	 */
	faceCrop?: FaceCrop;
	/**
	 * How much bigger than its own sprite pixels this character is drawn, on every
	 * surface that stands it up (see `characterFitScale`). Omitted means 1 — the
	 * character is drawn at exactly the size its art is.
	 *
	 * On-screen size is a character's sprite height against one shared reference
	 * height, so the roster keeps its real height differences — Chopper stays a head
	 * shorter than Trunks. That only holds while every sheet is drawn at the same
	 * pixels-per-person, and MUGEN authors do not agree on one: a set can be drawn
	 * two thirds the size another set is, and its cast then stands two thirds as
	 * tall in this game for no reason anyone in the fiction would recognise. This is
	 * the correction, and it belongs to the character because it is a fact about that
	 * character's art: it says "this sheet is drawn small, draw it up by this much"
	 * once, here, rather than every surface guessing.
	 *
	 * It scales what the character is measured against, not the box it is measured
	 * into, so the caps that keep art inside its box still hold — a scaled-up
	 * character stops at the edge instead of spilling past it.
	 */
	renderScale?: number;
	/**
	 * Whether the width of this character's cycle is allowed to decide how big it is
	 * drawn (see `characterFitScale`). Omitted means yes, which is what every character
	 * gets: what a surface gives a character is a box, and a cycle wider than its box is
	 * brought back until it fits rather than being drawn over the character beside it.
	 *
	 * Set to `false` for a sheet whose width is not its size. The cap reads a cycle's
	 * sweep as the room the character needs, which is true of a fighter drawn upright and
	 * false of one drawn with its arms out: Franky's idle sweeps 195 source px against
	 * Nico Robin's 43 at the very same height, so the cap alone stood him at three fifths
	 * of his own castmate — and no {@link CharacterDefinition.renderScale} could reach
	 * him, since the scale lowers the height he is measured against and the cap is the
	 * smaller of the two either way. Turning it off sizes him by height alone, which is
	 * what the roster's sizing means; he is then drawn wider than his cell and overlaps
	 * his neighbours, which is the overlap this board is drawn with throughout.
	 *
	 * A fact about a particular sheet, like {@link CharacterDefinition.crownAlign} and
	 * {@link CharacterDefinition.renderScale}, and kept in the character's own file for
	 * the same reason: no reading of the pixels can tell an arm from a body.
	 */
	widthCap?: boolean;
	/**
	 * Whether this character is stood on the board by its **crown** — the middle of the
	 * highest painted pixels of the pose it stands in — rather than by the MUGEN axis its
	 * sheet is drawn around. Omitted means yes, which is what every character gets and
	 * what almost every character wants: the axis sits between a fighter's feet and a
	 * fighter leans, so centring the axis in a cell leaves the head off to one side of it,
	 * and the head is what a viewer reads as the character. See `paintedCrown`.
	 *
	 * Set to `false` for a sheet the rule reads wrong. It is decided by what is highest in
	 * the artwork, so a character whose tallest point is not its head — a raised weapon, a
	 * staff, one horn of a pair drawn at different heights — is centred on that instead,
	 * and comes out further off centre than the axis had it. That is a fact about a
	 * particular sheet, which is why the escape is per character and lives in the
	 * character's own file, beside {@link CharacterDefinition.renderScale}, the other
	 * correction the art rather than the game asks for.
	 */
	crownAlign?: boolean;
}

/** A square region of a face sprite, in that sprite's own pixels. */
export interface FaceCrop {
	/** Left edge, in source-image pixels. */
	x: number;
	/** Top edge, in source-image pixels. */
	y: number;
	/** Side length, in source-image pixels — the region is always square. */
	size: number;
}

/**
 * Longest display name a character may be given. Names are read in a card's
 * width and in table rows, so a name past this length says nothing more — it
 * only truncates somewhere.
 */
export const LABEL_MAX_LENGTH = 60;

/** Non-directional movement slots in render/display order. */
export const MOVEMENT_ANIMATIONS: MovementAnimationName[] = ['idle', 'hurt'];

/** Direction slots in display order. */
export const DIRECTION_NAMES: DirectionName[] = ['move-left', 'move-right'];

/** Shared move types in display order. */
export const MOVE_KINDS: MoveKind[] = ['melee', 'ranged', 'defend'];

/** Move types that fire a projectile (the move carries its own binding). */
export const PROJECTILE_MOVES: MoveKind[] = ['ranged'];

/**
 * First move a character has tagged with `type` that actually has an animation
 * bound — the game's way of resolving a logical move type ("play the hurt
 * pose") against a character's own move list.
 */
export function findMove(
	definition: Pick<CharacterDefinition, 'moves'>,
	type: MoveKind
): CharacterMove | undefined {
	return definition.moves.find((move) => move.type === type && move.source !== '');
}

/** Stat slots in display order. */
export const STAT_KINDS: StatKind[] = ['atk', 'def', 'hp'];

/** Inclusive bounds every stat is clamped to. */
export const STAT_MIN = 1;
export const STAT_MAX = 10;

/** Value used when a definition predates stats or carries an invalid one. */
export const DEFAULT_STAT = 5;

/** Drawn at exactly the size its art is — what a definition with no
 * {@link CharacterDefinition.renderScale} means, and what every character had
 * before the field existed. */
export const DEFAULT_RENDER_SCALE = 1;

/** Bounds a stored render scale is held to. Wide enough for the real cases (a
 * sheet drawn at two thirds of the roster's scale needs ~1.4) and narrow enough
 * that a typo — a scale of 40 rather than 4 — cannot make a character fill the
 * screen. */
export const RENDER_SCALE_MIN = 0.25;
export const RENDER_SCALE_MAX = 4;

/** Sized by its width as well as its height — what a definition with no
 * {@link CharacterDefinition.widthCap} means. On by default because a box is a box; the
 * field exists to turn it off for the sheets whose sweep is arms rather than size. */
export const DEFAULT_WIDTH_CAP = true;

/** Stood by its crown rather than by its axis — what a definition with no
 * {@link CharacterDefinition.crownAlign} means. On by default because it is right for
 * almost every sheet; the field exists to turn it off for the ones it is not. */
export const DEFAULT_CROWN_ALIGN = true;
