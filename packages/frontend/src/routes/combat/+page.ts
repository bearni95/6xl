import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { authService } from '$services/auth.service';
import { battleService } from '$services/battle.service';
import { AuthStatus } from '$types/profile.type';
import {
	MAP_ROUTE,
	battleShown,
	dropStaging,
	stagedFight,
	stagingRestored,
	type StagedFight
} from '$services/combat';

/**
 * What this address is about, settled before the page exists.
 *
 * A fight is staged by the map and read here (see $services/combat), and the staging is
 * written down, so the ordinary way into this route is that everything it needs is already
 * on hand. What is left to answer is the two ways it can be walked into instead — nothing
 * staged at all, and a staging left over from a previous page life — and both are answered
 * *here* rather than in the page, deliberately: a load runs to completion before the
 * component is created, so the arena is either mounted on a fight it can draw or never
 * mounted at all. Doing this in the page would mean an arena on screen while the question
 * was still open, and the arena reads the board it resumes off `battleService` — one built
 * before that read landed would find no board, roll a fresh fight and write it over the one
 * in progress.
 *
 * Client-only, because the answer is: the staging lives in this browser, and there is no
 * such thing as a server's opinion about it. In the shipped bundle nothing here is rendered
 * on a server anyway (adapter-static, `fallback: index.html`); pinning it makes dev behave
 * as the game does rather than redirecting every visit off a store the server always sees
 * empty.
 */
export const ssr = false;

export const load = async (): Promise<void> => {
	const staged = get(stagedFight);

	// Nothing to draw. The map is where a fight is found — it is what loads the open battle
	// and knows the town — so go there and let it stage one back if there is one. This is the
	// bounce that used to happen on *every* visit that did not come from the map, and it is
	// right for exactly this case.
	if (!staged) redirect(307, MAP_ROUTE);

	// Staged this page life: the map made it moments ago and there is nothing to ask.
	if (!get(stagingRestored)) return;
	stagingRestored.set(false);

	// The player has been put in front of this fight, which is the whole of what the map's
	// resume marker records. Set here because the map is not what put them there this time,
	// and a marker still empty when they leave the arena would have the map walk them
	// straight back into the fight they had just walked out of.
	battleShown.set(staged.battleId);

	if (await stillOpen(staged)) return;

	// The fight this staging was written for is over — reported from another device, or from
	// this tab just before it was closed. Let it go and send the player to the map, which is
	// what a visit with nothing staged has always done.
	dropStaging();
	redirect(307, MAP_ROUTE);
};

/**
 * Whether the fight this staging was written for is still the fight the player is in.
 *
 * Asked of the server, which is the only thing that knows — and asked once, with its answer
 * left in `battleService` for the arena to resume the board off, so this costs the page the
 * one query the map would have made anyway.
 *
 * The session has to have settled first: `battles` is RLS-scoped to its owner, and asked
 * before the session is restored it answers "no battle" for a player who has one, which
 * would throw them out of their own fight.
 *
 * A read that fails is not an answer and is not treated as one — the staging stands. Better
 * to open on a fight whose report might be refused than to evict a player mid-fight over a
 * dropped connection.
 */
async function stillOpen(staged: StagedFight): Promise<boolean> {
	await sessionSettled();
	try {
		const battle = await battleService.load();
		return (battle?.startedAt ?? null) === staged.battleId;
	} catch {
		return true;
	}
}

/** Resolves once the session has been restored, or found not to exist. */
function sessionSettled(): Promise<void> {
	authService.init();
	return new Promise((resolve) => {
		// The store answers synchronously on subscribe when the session has already settled,
		// which is the usual case and the one where `stop` is not assigned yet — hence the
		// flag, rather than unsubscribing from inside the callback alone.
		let stop: (() => void) | null = null;
		let settled = false;
		stop = authService.status.subscribe((status) => {
			if (status === AuthStatus.Loading) return;
			settled = true;
			stop?.();
			resolve();
		});
		if (settled) stop();
	});
}
