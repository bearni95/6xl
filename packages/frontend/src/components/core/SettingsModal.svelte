<script lang="ts">
	import { onMount } from 'svelte';
	import { _, locale } from 'svelte-i18n';
	import { authService } from '$services/auth.service';
	import { settingsModalOpen } from '$services/settingsModal';
	import { AuthStatus } from '$types/profile.type';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import AccountDataRights from '$components/core/AccountDataRights.svelte';
	import AnalyticsOptOut from '$components/core/AnalyticsOptOut.svelte';

	// What the game does about the player: the visit counter's switch, the copy of
	// everything held, the record of what has been accepted, and the way out for good.
	//
	// Not who they are — the picture, the name, the address they signed in with and the way
	// out of the session are the account's own sheet, opened by pressing the plate itself
	// (see ProfileModal). The two were one sheet for a while, which put "delete your
	// account" four lines under the field somebody was typing their name into, and made the
	// plate and the cog beside it two doors onto the same thing. The cog is this and only
	// this.
	//
	// Which also settles what the old sheet had to settle by hand: it opened by itself for
	// an account with no name yet, and that opening is one question — what do you want to be
	// called — so the rights had to be held back behind a check on the store that raised it.
	// Nothing raises this sheet but the press, so there is nothing to hold back.

	const status = authService.status;
	const profile = authService.profile;

	onMount(() => authService.init());

	$: signedIn = $status === AuthStatus.SignedIn && !!$profile;
	// Signing out empties the profile, which closes the sheet on its own.
	$: open = signedIn && $settingsModalOpen;

	function close(): void {
		settingsModalOpen.set(false);
	}
</script>

<!-- Mounted at the layout root so it is a modal like any other, free of the panel's
	stacking context, and drawn on the full-view sheet every other one of them is drawn on. -->
{#if open && $locale}
	<FullScreenModal title={$_('settings.title')} closeLabel={$_('settings.close')} on:close={close}>
		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto flex w-full max-w-xl flex-col gap-4">
				<!-- The visit counter's switch, above the rights it is not one of: being counted
					is not personal data the account holds, so it is not something
					`export_player_data` answers for or that deleting the account settles. It is
					here because this is the sheet a player opens to change what the game does
					about them — and it is *also* on the storage note, which is where somebody
					with no account has to be able to reach it. -->
				<AnalyticsOptOut linkToDocument />
				<AccountDataRights />
			</div>
		</div>
	</FullScreenModal>
{/if}
