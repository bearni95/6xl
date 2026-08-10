<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import { analyticsService } from '$services/analytics.service';
	import { openLegalDocument } from '$services/legalModal';
	import { LegalDocumentId } from '$types/legal.type';

	// The visit counter's off switch, drawn wherever a reader might go looking for it.
	//
	// One component and one store behind both of its homes — the storage note, which is
	// the document that explains the counter, and the settings sheet, which is where a
	// player goes to change things about themselves. Two switches over one piece of state,
	// so flipping either moves the other; two components would have been two answers to
	// the same question, and the one place that must never disagree with the documents is
	// the control the documents point at.
	//
	// It is a switch and not a button because it has a state worth reading. Somebody who
	// turned counting off a month ago and comes back to check is the person this is for,
	// and a button would only ever say what it does, never what is currently true.

	export let classes: string = '';
	/**
	 * Whether to point at the storage note.
	 *
	 * Off where this is drawn *under* that note — a link to the page you are reading is
	 * furniture. On where it stands alone, since "we count visits" deserves somewhere to
	 * read the whole of what that means.
	 */
	export let linkToDocument: boolean = false;

	const counted = analyticsService.counted;
	const operable = analyticsService.operable;
</script>

<section class={classNames('flex flex-col gap-3', classes)}>
	<div class="divider my-0"></div>

	<div class="flex flex-col gap-1">
		<h4 class="font-semibold">{$_('legal.analytics.heading')}</h4>
		<p class="text-xs text-base-content/60">{$_('legal.analytics.intro')}</p>
	</div>

	{#if $operable}
		<!-- The label wraps the input, so the whole row is the target and no `for`/`id`
			pair has to be kept in step. -->
		<label class="flex cursor-pointer items-center justify-between gap-4">
			<span class="flex flex-col gap-0.5">
				<span class="text-sm">{$_('legal.analytics.toggle')}</span>
				<span class="text-xs text-base-content/50">
					{$counted ? $_('legal.analytics.on') : $_('legal.analytics.off')}
				</span>
			</span>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={$counted}
				on:change={(event) => analyticsService.setCounted(event.currentTarget.checked)}
			/>
		</label>
	{:else}
		<!-- No storage, no switch. Saying so — and saying what does work instead — is the
			honest answer; drawing a toggle that cannot be remembered would not be. -->
		<p class="text-xs text-base-content/50">{$_('legal.analytics.unavailable')}</p>
	{/if}

	{#if linkToDocument}
		<button
			type="button"
			class="link self-start text-xs"
			on:click={() => openLegalDocument(LegalDocumentId.Cookies)}
		>
			{$_('legal.analytics.readMore')}
		</button>
	{/if}
</section>
