<script lang="ts">
	import classNames from 'classnames';
	import { onMount } from 'svelte';
	import { _, locale } from 'svelte-i18n';
	import { authService, UsernameRejected } from '$services/auth.service';
	import { profileModalOpen } from '$services/profileModal';
	import { avatarPickerOpen } from '$services/avatarPicker';
	import { AuthStatus, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '$types/profile.type';
	import { isValidUsername } from '$utils/profile/username';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import ProfileCard from '$components/core/ProfileCard.svelte';

	// The account itself: the picture it wears, the name it goes by, the details of how it
	// signs in, the way out of it, and the link to the page everybody else reads it on.
	// It is what the plate at the foot of the map summarises, which is why the plate is what
	// opens it.
	//
	// What the game does *about* the account — the visit counter's switch, the copy of
	// everything held, the way out for good — is not here: that is the settings sheet behind
	// the cog beside the plate (see SettingsModal). The two used to be one sheet, where
	// "delete your account" stood four lines under the field somebody was typing their name
	// into. One press for who you are, one for what is done with it.
	//
	// What the account has *earned* is on neither: the level and the experience bar are the
	// plate's, which is the thing a player looks at to read their standing, and printing them
	// again on the sheet they open to change their name only said the same number twice.
	//
	// The name is a field and nothing else. It used to be a line of text with an "edit"
	// button that swapped it for the input, so the one screen that exists to change the
	// name opened with the name unchangeable; there is no reading of it to protect here,
	// so the field is what stands where the name goes, always, and the caret is the whole
	// of the old "choose a username" prompt.

	const status = authService.status;
	const profile = authService.profile;
	const loaded = authService.loaded;

	let signingOut = false;
	let errorMessage: string | null = null;

	let username = '';
	let savingName = false;
	let nameError: string | null = null;
	// Set when the player closes a sheet this component raised by itself, so an
	// account with no name is asked once and not on every page it lands on.
	let dismissed = false;
	// Guards seeding the input so it happens once per opening, not on every tick.
	let seededFor: string | null = null;

	onMount(() => authService.init());

	$: signedIn = $status === AuthStatus.SignedIn && !!$profile;
	// Only once the stored row has arrived: until then every account looks nameless,
	// and acting on that would ask players who have a name to pick another.
	$: unnamed = signedIn && $loaded && $profile?.username == null;

	// Signing out empties the profile, which closes the sheet on its own.
	$: open = signedIn && ($profileModalOpen || (unnamed && !dismissed));

	// Prefill from the stored name each time the sheet opens.
	$: if (open && $profile && seededFor !== String($profile.id)) {
		username = $profile.username ?? '';
		seededFor = String($profile.id);
	}

	$: trimmedName = username.trim();
	// The same rule the RPC decides by, checked here so a name that could only be turned
	// down is not sent at all — and so the reason is on screen while it is being typed
	// rather than after a round trip.
	$: nameInvalid = trimmedName !== '' && !isValidUsername(trimmedName);
	// Blank is an answer too: emptying the field clears the name and leaves the
	// account unnamed, which is where every account starts and may stay. So the only
	// other thing that disables saving is having nothing to change.
	$: canSaveName = !savingName && !nameInvalid && trimmedName !== ($profile?.username ?? '');

	async function saveName(): Promise<void> {
		if (!canSaveName) return;
		nameError = null;
		savingName = true;
		try {
			await authService.updateUsername(trimmedName);
		} catch (error) {
			// A name the server turned down is said in the player's language; anything
			// else really is a failure and is reported as it came.
			if (error instanceof UsernameRejected) {
				nameError = $_(`profile.username.${error.reason}`, {
					values: { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH }
				});
			} else {
				nameError = error instanceof Error ? error.message : $_('errors.generic');
			}
		} finally {
			savingName = false;
		}
	}

	async function handleSignOut(): Promise<void> {
		if (signingOut) return;
		errorMessage = null;
		signingOut = true;
		try {
			await authService.signOut();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $_('errors.generic');
		} finally {
			signingOut = false;
		}
	}

	// The avatar hands the screen over to its own modal rather than stacking one
	// dialog on another.
	function openAvatarPicker(): void {
		close();
		avatarPickerOpen.set(true);
	}

	function close(): void {
		errorMessage = null;
		nameError = null;
		profileModalOpen.set(false);
		dismissed = true;
		seededFor = null;
	}
</script>

<!-- Mounted at the layout root so it is a modal like any other, free of the panel's
	stacking context, and drawn on the full-view sheet every other one of them is drawn on. -->
{#if open && $locale && $profile}
	<FullScreenModal title={$_('profile.title')} closeLabel={$_('profile.close')} on:close={close}>
		<!-- The account scrolls inside the sheet rather than the sheet scrolling, so the title
			bar stays put. Capped in width and centred, because what stands here is a card and a
			list of pairs, and neither is read across a monitor. -->
		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-xl">
				<!-- The card brings the picture, the details list and the sign-out button; the
					name column is this sheet's, and what it puts there is the field. -->
				<ProfileCard
					profile={$profile}
					{signingOut}
					on:signout={handleSignOut}
					on:editavatar={openAvatarPicker}
				>
					<form slot="name" class="flex flex-col gap-2" on:submit|preventDefault={saveName}>
						<label class="form-control w-full">
							<span class="label-text mb-1">{$_('profile.username.label')}</span>
							<div class="flex gap-2">
								<!-- Focused only when the sheet came up by itself for a nameless account:
									then it is here to be asked, so the caret belongs in it. A player who
									opened their own account may have come for anything on the sheet. -->
								<!-- svelte-ignore a11y-autofocus -->
								<input
									type="text"
									bind:value={username}
									disabled={savingName}
									maxlength={USERNAME_MAX_LENGTH}
									autofocus={unnamed}
									placeholder={$_('profile.username.placeholder')}
									class="input input-bordered flex-1"
								/>
								<button
									type="submit"
									disabled={!canSaveName}
									class={classNames('btn btn-primary', { 'btn-disabled': !canSaveName })}
								>
									{#if savingName}
										<span class="loading loading-spinner loading-sm"></span>
									{/if}
									{$_('profile.username.save')}
								</button>
							</div>
						</label>

						{#if nameError || nameInvalid}
							<div class="alert alert-error">
								<span>
									{nameError ??
										$_('profile.username.invalid', {
											values: { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH }
										})}
								</span>
							</div>
						{/if}
					</form>
				</ProfileCard>

				<!-- The account as everybody else reads it, and the last thing on this sheet.
					This sheet is where a player changes who they are; the page behind this link is
					what that comes out as — the plate and the side they field, at an address anyone
					can open (see routes/profile/[id]). A link and not a button, because it goes
					somewhere: it carries an href a player can copy, which is half of what the page
					is for. In a new tab, so the map, the fight and the radio it is all standing over
					are left running. `noopener` because a new tab given `window.opener` can reach
					back into the one that spawned it — the target is our own page today, and a rel
					that only holds while that stays true is not a rel worth writing. -->
				<a
					href="/profile/{$profile.id}"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-outline mt-4 w-full"
				>
					{$_('profile.public.openMine')}
				</a>

				{#if errorMessage}
					<div class="alert alert-error mt-4">
						<span>{errorMessage}</span>
					</div>
				{/if}
			</div>
		</div>
	</FullScreenModal>
{/if}
