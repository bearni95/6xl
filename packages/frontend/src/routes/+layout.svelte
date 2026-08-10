<script lang="ts">
	import '../css/app.css';
	import AvatarPickerModal from '$components/core/AvatarPickerModal.svelte';
	import SettingsModal from '$components/core/SettingsModal.svelte';
	import SignInModal from '$components/core/SignInModal.svelte';
	import LegalModal from '$components/core/LegalModal.svelte';
	import LegalGate from '$components/core/LegalGate.svelte';
	import WelcomeBoosterModal from '$components/core/WelcomeBoosterModal.svelte';
	import RosterModal from '$components/core/RosterModal.svelte';
	import { rosterModalOpen } from '$services/rosterModal';

	let { children } = $props();
</script>

{@render children?.()}
<AvatarPickerModal />
<SettingsModal />
<!-- The player's own cards. Out here rather than on the map, because the two ways in are on
	two different routes now: the Roster button on the map's panel, and the arena's "no active
	team" card, which is a page of its own (/combat) since the fight stopped being a modal.
	Mounted only while it is open — it builds a card canvas of its own, and every mount is a
	fresh WebGL context the browser hands out a limited number of. It is drawn after the
	route's own content, so it stands over whatever raised it. -->
{#if $rosterModalOpen}
	<RosterModal />
{/if}
<!-- The way in, out here with the rest of them: the corner at the foot of the map is one
	button now, and everything it asks is asked on this box. Out here it also survives the
	documents being read over it, which is the whole reason a visitor can tick the gate and
	still go and see what they are ticking. -->
<SignInModal />
<!-- The legal documents, and the gate that asks for them again when they have moved
	under a player. Both live out here for the reason every other modal does — raised from
	inside the map's pinned panel they would be trapped in its stacking context — and this
	pair especially, since the sign-in that links to them is a modal itself. The sheet is
	mounted last of the four so it stands over the others: reading a document the gate is
	asking about must not mean dismissing the gate. -->
<LegalGate />
<LegalModal />
<!-- The one box a player is given rather than has to go and find, and the gate that stands
	in front of the game until it has been opened. Out here for the same reason as the legal
	gate: it is about the account and not about the map, and it has to stand over whatever
	route the player happens to have landed on. It stands down while the legal gate is up —
	nobody is given anything before they have agreed to the terms it is given under — which
	is settled inside it rather than by the order these are mounted in, its sheet being the
	full-view one and the gate's daisyUI's. -->
<WelcomeBoosterModal />
