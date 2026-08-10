import type { PlayerAvatar } from '$types/player-avatar.type';
import type { ClaimPull } from './pull.type';

/**
 * What one open gave, as the reveal needs it: the cards, and the avatar the box
 * dealt alongside them. Two shapes rather than one list, because they are two
 * different things — five cards a player can field, and one portrait they can
 * wear — and the reveal shows them as such.
 */
export interface ClaimResult {
	/** The cards the pack rolled, in pull order. Empty when the roll was refused. */
	pulls: ClaimPull[];
	/**
	 * The avatar the box granted: a character on its show, in one of the three
	 * colours it deals. Null when the roll was refused — a pack that never opened
	 * gives nothing — or when it may already be held (the server hands back the row
	 * either way, so the reveal shows the same portrait for both).
	 */
	avatar: PlayerAvatar | null;
	/**
	 * Whether that avatar is one the player did not already hold — its character in
	 * its colour, read against their collection as it stood *before* the pack was
	 * opened. False for a pack that gave nothing, and false for a portrait the box
	 * dealt a second time, which is the one thing the row coming back either way
	 * cannot say on its own.
	 */
	avatarIsNew: boolean;
}

/**
 * One booster pack in the today's-festes grid the claim canvas lays out: the show
 * poster used as its cover, the celebrating place it belongs to, its show label,
 * and the roll it fires when the player slices it open. Assembled by
 * {@link CharacterClaimPanel} from today's (festa, show) pairs and handed to the
 * grid scene, which renders one {@link PackSprite} per entry.
 */
export interface OpenerPack {
	/** Stable id — the celebrating municipality's feature id. */
	id: string;
	/** Show poster URL used as the pack cover, or null for a plain frame. */
	coverUrl: string | null;
	/**
	 * The show's wordmark, said across the foot of the pack, or null when the author
	 * has enabled none — the pack then says the show by its poster alone rather than
	 * by a stand-in mark. Resolved from the same saved collection the cover is.
	 */
	logoUrl: string | null;
	/**
	 * True when this town is celebrating today. The booster window runs three days back
	 * through four ahead, so most packs on offer belong to a festa that is not on — this
	 * marks the ones that are, and the grid stands them apart from the rest.
	 */
	today: boolean;
	/**
	 * Printed on white card rather than black — the stock, which is the whole of what
	 * decides the three colours inside. For a town's box it is exactly {@link today}
	 * (white on the day of its festa, black around it) and was read off it for a while;
	 * it is said in its own right because a box that belongs to no festa still has a
	 * stock, and "is this town celebrating today" is not a question such a box answers.
	 */
	light: boolean;
	/**
	 * Said across the head of the box *instead of* the place and the year, for a box
	 * printed for something other than a town's festa — the welcome box says
	 * `Benvinguda` there (see `welcome-box` in @3xl/shared). Null on every town's box,
	 * which says the town and the celebration's year as it always has.
	 */
	caption?: string | null;
	/**
	 * True when this player has already opened this town's box for this festa's year
	 * and stock — a town deals two a year and no more, and `claim_booster` refuses the
	 * second. The box is still drawn (a player should see the one they took) but stands
	 * spent: dimmed, and it will not slice open.
	 */
	claimed: boolean;
	/** Full name of the place the pack belongs to, drawn across its top. */
	locationName: string | null;
	/** Pack label — the show name shown under the grid pack / in the header. */
	label: string;
	/**
	 * TMDB id of the show inside, which is what a glyph for it is looked up by (the show's
	 * own `icon`, authored in the admin) — the same mark the map pins that show with and the
	 * statue paints across its floor. The box paints it on its lid.
	 */
	showId: number;
	/**
	 * Rolls this pack's booster against Supabase and returns what to reveal — the
	 * cards, and the avatar it dealt. The grid calls it when the player slices the
	 * selected pack open, so both are persisted at open time. Rejections/empties
	 * reveal nothing.
	 */
	claim: () => Promise<ClaimResult>;
}

/**
 * Everything the (non-modal) pack-opener canvas needs to render one open,
 * surfaced by {@link CharacterClaimPanel} to its parent so the canvas can live
 * in a sibling column to the right of the claim content. Null while no pack is
 * open. Purely presentation state — assembled after a roll resolves.
 */
export interface OpenerView {
	/** Show poster URL used as the pack cover, or null for a plain frame. */
	coverUrl: string | null;
	/** Pack label — the show name shown across the pack. */
	label: string;
	/** Full name of the place the pack belongs to, drawn across its bottom. */
	locationName: string | null;
	/**
	 * Rolls the booster against Supabase and returns what to reveal. The canvas
	 * calls this when the player slices the pack open — so the spawn is persisted at
	 * open time, not when the pack was selected. Rejections/empties reveal nothing.
	 */
	claim: () => Promise<ClaimResult>;
	/** Bumped on every open so the canvas remounts with a fresh pack. */
	openSession: number;
	/** True while the parent is rolling the next claim. */
	openAnotherBusy: boolean;
	/** Disable "Open another" (no location claimed, mid-open, etc). */
	openAnotherDisabled: boolean;
}
