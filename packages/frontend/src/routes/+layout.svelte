<script lang="ts">
	import '../css/app.css';
	import { onMount } from 'svelte';
	import AvatarPickerModal from '$components/core/AvatarPickerModal.svelte';
	import CombatFeedModal from '$components/core/CombatFeedModal.svelte';
	import ProfileModal from '$components/core/ProfileModal.svelte';
	import SettingsModal from '$components/core/SettingsModal.svelte';
	import SignInModal from '$components/core/SignInModal.svelte';
	import LegalModal from '$components/core/LegalModal.svelte';
	import LegalGate from '$components/core/LegalGate.svelte';
	import TeamGate from '$components/core/TeamGate.svelte';
	import WelcomeBoosterModal from '$components/core/WelcomeBoosterModal.svelte';
	import { combatFeedService } from '$services/combatFeed.service';

	let { children } = $props();

	/**
	 * The game's own channel, open for as long as the app is.
	 *
	 * Every fight that finishes anywhere is broadcast onto one Supabase Realtime topic (see
	 * `combat-feed.type`), and this is where the game listens. It was the arena's — opened when
	 * a fight was walked into and dropped when it was left — which made the feed a thing that
	 * only existed inside a battle: a player standing on the map, arranging a team or reading
	 * somebody's page heard nothing, and what they had missed was gone by the time they were
	 * fighting again, a broadcast reaching only whoever is on the channel when it is made.
	 * Out here it runs from the moment the app loads, on every route, so what the feed holds is
	 * everything that has happened since this tab was opened.
	 *
	 * It is pushed and never polled — there is no request here at all — and it is one
	 * subscription for the session rather than one per surface: `listen` nests, and this is the
	 * outermost caller, so a page that wanted its own could still ask without opening a second
	 * socket.
	 */
	onMount(() => combatFeedService.listen());

	const feedOpen = combatFeedService.open;
</script>

{@render children?.()}
<!-- The fights finishing everywhere else, when somebody asks to see them. Out here because
	the channel is out here: the sheet is raised from the band at the top of the map and from
	the corner of the orders panel in a fight, and a sheet mounted on either of those pages
	could only be opened on that page. Mounted first of the modals, so every other one of them
	stands over it — a feed is the most casual thing this app raises, and neither a gate nor a
	box a player is being given should end up behind it. -->
{#if $feedOpen}
	<CombatFeedModal />
{/if}
<AvatarPickerModal />
<!-- The account, and what is done about it: two sheets and two doors, the plate at the foot
	of the map opening the first and the cog beside it the second. Both out here for the reason
	every other modal is — raised from inside the map's pinned panel they would be trapped in
	its stacking context. -->
<ProfileModal />
<SettingsModal />
<!-- The player's own cards are not here. They were, for as long as they were a sheet raised
	from two different routes — the side in the map's corner and the arena's "no active team"
	card — and they are a route of their own now (/roster), reached from both by a navigation
	(see $services/roster). Which also gives back for free what mounting it only while it was
	open was buying: the card canvas, and the WebGL context every mount of it asks the browser
	for, exist only while that page is the page. -->
<!-- What does stand out here is the rule about that page: a player who can field a side and
	has not is handed back to it from wherever they are, the way the map hands a player back
	into the fight they are already in. It draws nothing — it is a rule, not a sheet — so
	where it is mounted among these says nothing about what stands in front of what. -->
<TeamGate />
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
