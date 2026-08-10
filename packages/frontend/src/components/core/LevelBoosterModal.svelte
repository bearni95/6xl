<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { _ } from 'svelte-i18n';
	import ChooseShowBooster from '$components/core/pack/ChooseShowBooster.svelte';
	import { authService } from '$services/auth.service';
	import { spawnService } from '$services/spawn.service';
	import {
		LEVEL_BOX_ID,
		LEVEL_BOX_STOCK,
		levelBoxCaption,
		pendingLevelBoxes
	} from '$utils/spawn/level-box';
	import { MIN_LEVEL } from '$utils/progression/level';
	import { SpawnBox } from '$types/character-spawn.type';

	// The level boxes: one booster for every level the player has reached, and this is the
	// sheet one of them is opened on.
	//
	// It is the welcome box's sheet exactly — a column of shows, and picking one opens the box
	// (see ChooseShowBooster, which is both of them) — and differs in the two ways a box that is
	// *earned* differs from one that is given: it comes again, and it is summoned rather than
	// standing in the player's way. So there is no gate here and no lock on the sheet. The
	// button over the map raises it, the ✕ puts it down, and a box left unopened is still there
	// on the next press.
	//
	// Which box it deals is the oldest one still owed — the lowest level with no claim against
	// it — because the boxes are alike in everything but the number across the head, and asking
	// a player to choose between five identical boxes is asking them a question with no answer.
	// One press is one box: the sheet closes on the reveal, and the button says how many are
	// left. The server is not told how many anybody is owed, only which level is being opened,
	// and it reads the caller's own experience to decide whether they have got there.

	const dispatch = createEventDispatcher<{ close: void }>();

	const profile = authService.profile;
	const levelClaims = spawnService.levelClaims;

	// The level reached, which is how many boxes have ever existed for this player. Derived
	// from experience and never stored (see `Profile.level`); level 1 is where everybody
	// starts, so there is a box waiting from the first visit.
	$: level = $profile?.level ?? MIN_LEVEL;

	// The boxes still owed, oldest first. Against a set that has not loaded this is every level
	// — which is the safe way round: an unread claim offers a box that the server then refuses
	// with a sentence the sheet shows, where the other way round would hide a box that is
	// really there.
	$: pending = pendingLevelBoxes(level, $levelClaims);

	// Which box this sheet is dealing, settled the moment it was raised and held to the end.
	// Held, and not read off `pending` as it moves, because the claim lands in the middle of
	// the reveal: the box stops being owed the instant it is opened, and a sheet that followed
	// that would swap the box for the next one — or close on the last one — while its cards
	// were still standing there. The next press is what deals the next box.
	let boxLevel: number | null = null;
	$: if (boxLevel === null) boxLevel = pending.length ? pending[0] : null;

	// Raised with nothing to open: a claim that had not been read yet, or a press that landed
	// after the last box was taken. There is no box to draw, so the host puts the sheet away.
	$: if (boxLevel === null) dispatch('close');
</script>

{#if boxLevel !== null}
	{@const dealing = boxLevel}
	<ChooseShowBooster
		title={$_('booster.level.title', { values: { level: dealing } })}
		intro={$_('booster.level.intro', { values: { count: pending.length } })}
		boxId={LEVEL_BOX_ID}
		caption={levelBoxCaption(dealing)}
		light={LEVEL_BOX_STOCK === SpawnBox.White}
		claim={(showId) => spawnService.claimLevelBooster(showId, dealing)}
		on:close={() => dispatch('close')}
	/>
{/if}
