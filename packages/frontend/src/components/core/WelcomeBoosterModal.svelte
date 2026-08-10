<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import ChooseShowBooster from '$components/core/pack/ChooseShowBooster.svelte';
	import { authService } from '$services/auth.service';
	import { legalService } from '$services/legal.service';
	import { spawnService } from '$services/spawn.service';
	import {
		WELCOME_BOX_CAPTION,
		WELCOME_BOX_ID,
		WELCOME_BOX_STOCK
	} from '$utils/spawn/welcome-box';
	import { AuthStatus } from '$types/profile.type';
	import { SpawnBox } from '$types/character-spawn.type';

	// The welcome box: the one booster a player is *given* rather than has to go and find.
	//
	// Most boxes in this game belong to a town — printed for a festa major, on offer for the
	// eight days around it, reached by clicking the box the map stands on that town. This one
	// belongs to nobody: it says one word where a town and a year go (see `welcome-box` in
	// @3xl/shared, and BoosterBox's `caption`), and the only thing it is refused for is having
	// been taken already. That is not a rule of its own — it is the same unique index every box
	// is spent against, on a town and a year no festa can ever produce.
	//
	// So it is a gate and not an offer, mounted at the layout root beside the legal one and
	// working the same way: it asks the server a question at every visit and stops the game
	// while the answer is no. There is no ✕, no Escape and no click that dismisses it, because
	// a welcome anybody can wave away is a welcome that has to be asked about again on the next
	// visit and the one after that — and the box has already been dealt by then or has not.
	// What ends it is opening the box, which is the one thing it asks for.
	//
	// What is on the sheet is not here: choosing a show and opening the box on it is what every
	// box printed for something other than a town does (the level boxes do it too, see
	// LevelBoosterModal), and it is one component — ChooseShowBooster. What is left in this file
	// is the only thing that is the welcome's own: whether the player is owed one, and the fact
	// that they cannot leave until they have taken it.
	//
	// It stands down for the legal gate. Both are modals that stop the game, this one is drawn
	// on the full-view sheet (z-[1300]) and that one on daisyUI's, so a welcome raised over an
	// outstanding acceptance would cover the acceptance — and the order is not a matter of taste
	// anyway: nobody is given anything before they have agreed to the terms it is given under.

	const status = authService.status;
	const profile = authService.profile;
	const welcomeClaimed = spawnService.welcomeClaimed;
	const outstanding = legalService.outstanding;

	// Whether the sheet is up. Latched off `owed` rather than being it, because the claim lands
	// in the middle of the reveal: the moment the box is opened the player is owed nothing, and
	// a gate that was its own answer would take the cards away as they arrived. It goes down
	// when the sheet says it is done, which is after they have been looked at.
	let showing = false;

	// Guards the one-time load per player.
	let loadedFor: string | null = null;

	onMount(() => {
		authService.init();
		legalService.init();
	});

	$: signedIn = $status === AuthStatus.SignedIn && !!$profile;
	$: userId = signedIn && $profile ? String($profile.id) : null;

	// Whether this player is owed a welcome. Three things have to be true and each is a
	// separate wait: they are signed in, the legal ledger is clear (see the header), and the
	// server has actually said they have not taken it — `null` is "not asked yet" and is
	// emphatically not "no", or every returning player would be welcomed again for as long as
	// one query takes.
	$: owed = signedIn && $outstanding.length === 0 && $welcomeClaimed === false;

	// Ask the question once per player. A player signing out takes the answer with them (the
	// spawn service forgets it), so this asks again for whoever signs in next.
	$: if (userId && userId !== loadedFor) {
		loadedFor = userId;
		void spawnService.loadWelcomeClaimed(userId).catch(() => {});
	} else if (!userId && loadedFor) {
		loadedFor = null;
	}

	$: if (owed) showing = true;
	// And down again while the box has not been dealt yet: a legal acceptance falling due
	// covers the welcome, and nobody is given anything before they have agreed to the terms it
	// is given under. Once the claim has landed this stops applying — what is on screen then is
	// the reveal, and it is the sheet that says when that is over.
	$: if (showing && $welcomeClaimed !== true && !owed) showing = false;
	// Signed out mid-welcome: the gate is about an account, and there is no account. This one
	// takes the sheet even mid-reveal, for the same reason.
	$: if (!signedIn && showing) showing = false;
</script>

{#if showing}
	<ChooseShowBooster
		title={$_('booster.welcome.title')}
		intro={$_('booster.welcome.intro')}
		boxId={WELCOME_BOX_ID}
		caption={WELCOME_BOX_CAPTION}
		light={WELCOME_BOX_STOCK === SpawnBox.White}
		locked
		claim={(showId) => spawnService.claimWelcomeBooster(showId)}
		on:close={() => (showing = false)}
	/>
{/if}
