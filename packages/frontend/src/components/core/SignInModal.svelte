<script lang="ts">
	import { _, locale } from 'svelte-i18n';
	import { authService, CredentialsRejected } from '$services/auth.service';
	import { legalService } from '$services/legal.service';
	import { closeSignIn, signInModalOpen } from '$services/signInModal';
	import type { OAuthProvider } from '$types/profile.type';
	import { CONSENT_DOCUMENTS, LEGAL_VERSIONS } from '$types/legal.type';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import LegalConsent from '$components/core/LegalConsent.svelte';
	import EmailSignIn from '$components/core/EmailSignIn.svelte';
	import SocialSignIn from '$components/core/SocialSignIn.svelte';

	// The way in: an address with a password, or Google.
	//
	// Which of them a player uses is theirs to choose and nothing downstream cares: an
	// account is an account, and Supabase links a Google identity and an address onto one
	// user when the address is the same and verified, so somebody who signed up one way and
	// comes back the other keeps their cards.
	//
	// **The gate belongs to the sign-up and nowhere else.** The two boxes and the four
	// documents are what somebody says when they open an account, and they are asked exactly
	// where an account is opened — inside the password form's register tab, above the button
	// that creates it. Signing in is not an occasion to agree to anything: the acceptance is
	// already on file for that account, and asking again at every visit made the ticks
	// worthless. Google is not asked here either, because the press that follows it is not
	// yet a sign-up — Supabase decides on the far side whether the identity it comes back
	// with is a new account or an old one. What answers for a new one is LegalGate, at the
	// layout root, which stops any session whose ledger is short and asks then. Nobody plays
	// without having accepted; the asking simply happens at the moment there is an account
	// for it to be about.
	//
	// All of it stood open at the foot of the map, on a plate of its own — a form of two
	// checkboxes, four links and a paragraph of fine print, every word at 12px, taking the
	// height of the corner from a visitor who had not asked for it yet. What is left down
	// there is a button (see SignInButton), and what that button asks for is this. A door
	// is a word; the paperwork is behind it.
	//
	// Mounted once at the layout root, like the settings sheet and the avatar picker, so it
	// is free of the map panel's stacking context — and free of the panel's own `{#if}`,
	// which is what lets the legal documents be read without the ticks above them being
	// lost: this sheet stays mounted underneath while the document sheet is up, and the
	// boxes are still ticked when the reader comes back. Both are the full-view sheet and
	// both are z-[1300], so which is in front is the order they are mounted in at the
	// layout root, where LegalModal comes after this one.
	//
	// And it is that sheet — `FullScreenModal`, the surround every other full-view modal in
	// this app wears — rather than a daisyUI `modal-box` of its own. It was the one door
	// drawn as a box over the map while the album, the boosters, the profile, the settings
	// and the documents were all whole views; a sheet is what a modal looks like here, and
	// the way in is not the exception. Which also takes the backdrop with it: there is
	// nothing of the map left showing to click at, so the ✕ and Escape are the way out, and
	// `closeDisabled` is what holds them while something is in flight.
	//
	// The state is the component's, so putting the sheet away un-ticks everything. That is
	// the honest reading: an acceptance is an act, and somebody who closed the door without
	// going through it has not made one.
	//
	// Nothing is initialised here. `authService.init()` and `legalService.init()` are
	// LegalGate's, at the layout root, where something is mounted at every visit — this
	// modal is only up while it is being answered.

	let redirectingTo: OAuthProvider | null = null;
	// Which of the password form's two actions is in flight, if either.
	let credentialsPending: 'signin' | 'signup' | null = null;
	let errorMessage: string | null = null;
	// Said after a sign-up Supabase took but did not hand a session back for: the address
	// has a mail waiting and there is nothing else for the player to do here.
	let confirmationSent = false;

	// The gate in front of the sign-up. Both boxes have to be ticked before an account can
	// be opened, and `consentAsked` is what makes the reason visible: a button that is
	// simply dead says nothing about why.
	let ageConfirmed = false;
	let documentsAccepted = false;
	let consentAsked = false;
	$: consented = ageConfirmed && documentsAccepted;
	$: busy = redirectingTo !== null || credentialsPending !== null;

	// The sheet holds its own ways out shut while something is in flight (`closeDisabled`),
	// so this is only ever reached when leaving is allowed.
	function close(): void {
		errorMessage = null;
		confirmationSent = false;
		consentAsked = false;
		closeSignIn();
	}

	/**
	 * Write down what was ticked, for the moment there is an account to hang it on.
	 *
	 * Held in the browser rather than recorded here because at this instant there is no id
	 * to record it against: the boxes are ticked by somebody the game has never met. It is
	 * picked back up and written the moment a session lands (see legal.service) — this same
	 * tick where the project hands a sign-up its session, and a mail's round trip where it
	 * confirms addresses first, as this one does. That round trip may be finished on another
	 * device, where nothing was held; then LegalGate asks again on arrival, which is the
	 * recovery and not a failure.
	 *
	 * Only the sign-up calls it, because only the sign-up asks anything.
	 */
	function holdConsent(): void {
		legalService.hold({
			versions: Object.fromEntries(CONSENT_DOCUMENTS.map((id) => [id, LEGAL_VERSIONS[id]])),
			ageConfirmed,
			at: new Date().toISOString()
		});
	}

	/** Clear what the last attempt said, before making another. */
	function begin(): void {
		errorMessage = null;
		confirmationSent = false;
	}

	/** Word a failure: the handful Supabase names, and anything else as it came. */
	function report(error: unknown): void {
		if (error instanceof CredentialsRejected) {
			errorMessage = $_(`profile.password.rejected.${error.reason}`);
		} else {
			errorMessage = error instanceof Error ? error.message : $_('errors.generic');
		}
	}

	async function handleProviderSignIn(
		event: CustomEvent<{ provider: OAuthProvider }>
	): Promise<void> {
		if (busy) return;
		begin();
		redirectingTo = event.detail.provider;
		try {
			// On success the browser leaves for the provider's consent screen, so the
			// spinner stays up until the page is gone. Only a failure lands here.
			await authService.signInWithProvider(event.detail.provider);
		} catch (error) {
			report(error);
			redirectingTo = null;
		}
	}

	async function handlePasswordSignIn(
		event: CustomEvent<{ email: string; password: string }>
	): Promise<void> {
		if (busy) return;
		begin();
		credentialsPending = 'signin';
		try {
			await authService.signInWithPassword(event.detail.email, event.detail.password);
			// The session is already in the stores by now — the modal's own `{#if}` does
			// not close it, since it is the store that says whether the door is up, so it
			// is put away here.
			closeSignIn();
		} catch (error) {
			report(error);
		} finally {
			credentialsPending = null;
		}
	}

	async function handlePasswordSignUp(
		event: CustomEvent<{ email: string; password: string }>
	): Promise<void> {
		if (busy) return;
		// The one press on this sheet that is somebody opening an account, and so the one
		// the gate stands in front of. It is pressable while the boxes are unticked — that
		// is what makes the reason appear — it simply does not open anything.
		consentAsked = true;
		if (!consented) return;
		begin();
		credentialsPending = 'signup';
		holdConsent();
		try {
			const mustConfirm = await authService.signUpWithPassword(
				event.detail.email,
				event.detail.password
			);
			// This project confirms addresses (`mailer_autoconfirm` is off), so a sign-up
			// normally ends here rather than signed in: what is left to say is that a mail
			// is on its way. It is worded to be true of an address that already had an
			// account too — Supabase answers both the same way on purpose, and telling
			// them apart on screen is telling a stranger who is registered here.
			if (mustConfirm) confirmationSent = true;
			else closeSignIn();
		} catch (error) {
			report(error);
		} finally {
			credentialsPending = null;
		}
	}
</script>

<!-- Contents format i18n messages; wait for the locale to load, or the box would appear
	empty and then fill. -->
{#if $signInModalOpen && $locale}
	<FullScreenModal
		title={$_('profile.access')}
		closeLabel={$_('profile.accessClose')}
		closeDisabled={busy}
		on:close={close}
	>
		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto flex w-full max-w-xl flex-col gap-4">
				{#if !authService.configured}
					<div class="alert alert-warning">
						<span>{$_('profile.notConfigured')}</span>
					</div>
				{:else}
					<!-- The address and password first, Google under it: the game's own door before
						the one that goes through somebody else's building. Neither is the main one —
						the divider between them says "or" and means it.
						The gate goes in with it, as the register tab's own last word before the button
						that opens the account. The form is what knows which tab is forward, so it is
						handed the gate to place rather than asked which one it is on. -->
					<EmailSignIn
						pending={credentialsPending}
						disabled={redirectingTo !== null}
						on:signin={handlePasswordSignIn}
						on:signup={handlePasswordSignUp}
					>
						<LegalConsent
							slot="consent"
							bind:ageConfirmed
							bind:accepted={documentsAccepted}
							showRequired={consentAsked}
							disabled={busy}
						/>
					</EmailSignIn>

					<div class="divider my-0 text-xs text-base-content/50">
						{$_('profile.password.or')}
					</div>

					<SocialSignIn
						pending={redirectingTo}
						disabled={credentialsPending !== null}
						on:signin={handleProviderSignIn}
					/>
				{/if}

				{#if confirmationSent}
					<div class="alert alert-success">
						<span>{$_('profile.password.confirmationSent')}</span>
					</div>
				{/if}

				{#if errorMessage}
					<div class="alert alert-error">
						<span>{errorMessage}</span>
					</div>
				{/if}
			</div>
		</div>
	</FullScreenModal>
{/if}
