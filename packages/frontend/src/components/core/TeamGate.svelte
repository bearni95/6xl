<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { authService } from '$services/auth.service';
	import { spawnService } from '$services/spawn.service';
	import { ROSTER_ROUTE, openRoster, teamUnfinished } from '$services/roster';
	import { AuthStatus } from '$types/profile.type';

	// What happens to a player who can field a side and has not.
	//
	// A fight is fielded by three cards, and a side is the one thing this game asks of an
	// account before anything else in it means much. So an unfinished team is answered the
	// way an open fight is: the roster will not be closed while it stands (see `/roster`'s
	// closeDisabled), and every other page hands the player back to it — which is this
	// component, standing to the roster exactly as the map's resume rule stands to the arena.
	//
	// Mounted once at the layout root, beside the legal gate and for the same reason: it is
	// about the account rather than about any one page, and it has to answer wherever the
	// player happens to have landed.
	//
	// It is deliberately *not* a live watch on the team. It looks twice — when a player
	// arrives somewhere, and when their cards first land — and never in between, because the
	// moment a roster becomes completable is very often the moment a booster pack is standing
	// open on the map: a gate that fired on the card arriving would navigate that sheet out
	// from under the player mid-pack. Arriving anywhere afterwards catches it, which is the
	// next thing they do.

	const status = authService.status;
	const profile = authService.profile;

	// Whose cards this has already asked for, so the one read per player is not re-run by
	// every tick of the session store.
	let askedFor: string | null = null;

	onMount(() => authService.init());

	$: currentUserId = $status === AuthStatus.SignedIn && $profile ? String($profile.id) : null;

	// The gate asks for the player's cards itself rather than waiting for a page to have
	// asked: what it needs is on them (the slots are the team — see spawn.service), and the
	// page the player is standing on may be one that never reads them. Where they are already
	// in the store this costs the round trip and nothing on screen, every surface here drawing
	// off the same store.
	$: if (currentUserId && currentUserId !== askedFor) {
		askedFor = currentUserId;
		void readCards(currentUserId);
	}
	// Signing out lets the next player be asked about.
	$: if (!currentUserId) askedFor = null;

	// The one dependency this statement may name: arriving somewhere is what it looks at, and
	// naming the team here is what would make it a live watch (see above).
	$: pathname = $page.url.pathname;
	$: consider(pathname);

	async function readCards(userId: string): Promise<void> {
		try {
			await spawnService.loadSpawns(userId);
		} catch {
			// A read that failed is not an answer: leave the player where they are rather than
			// hold them to a side we could not see.
			return;
		}
		// Wherever they have got to while the read was in flight, which is what `pathname`
		// holds — a navigation during it has already been considered on its own account, and
		// this is the same question asked of the answer that has just arrived.
		consider(pathname);
	}

	/**
	 * Hand the player back to their cards, unless that is where they already are.
	 *
	 * Read out of the store rather than taken as a dependency, deliberately: the whole point
	 * of this component is that it looks at the team only at the two moments above.
	 */
	function consider(path: string): void {
		if (path === ROSTER_ROUTE) return;
		if (!get(teamUnfinished)) return;
		// Replacing rather than pushing: the page being left is one the player is not allowed
		// to be on, so a step in the history for it would be a Back that bounces forward again.
		// Where they came from is remembered all the same, and is where finishing the side
		// puts them.
		void openRoster({ replaceState: true });
	}
</script>
