<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import CombatArena from '$components/core/CombatArena.svelte';
	import { stagedFight, leaveCombat, MAP_ROUTE } from '$services/combat';

	// The fight, on its own page. It was a modal over the map for a long time, raised by the
	// Challenge button on a town and put away by its own ✕ — which meant a fight had no
	// address, could not be linked to, could not be reloaded into, and shared a page with a
	// map that went on holding a Leaflet canvas nobody could see behind it. So the arena has
	// a route, and every place that used to open or close the modal is a navigation now (see
	// $services/combat): the map stages the fight and comes here, and leaving goes back.
	//
	// What is drawn is unchanged. The sheet is the app's one full-view surface, bare — no
	// title bar and no padding, so the whole viewport is the board: a row naming it "Combat"
	// says nothing the board does not, and a margin round the board is scale taken off it,
	// the canvas being fitted to the box it is given. It brings the blur in and out with it,
	// and Escape, and the ✕'s own rule about when the way out is shut. The title stays as the
	// page's name to a screen reader.
	//
	// Nothing between the sheet and the arena, either: the arena fills it and centres the
	// canvas itself, and the canvas is capped to the viewport on both axes, so there is
	// nothing to scroll and no box to scroll it in.

	// True while the arena is handing a finished fight to the server. Bound out of it, because
	// it is the one thing the sheet holding it cannot know for itself and the one moment the
	// sheet must not let go: the report is what ends the battle, so a player let out before it
	// lands would walk away from a fight the server still has open.
	let reporting = false;

	// Nothing staged: this page was opened directly, or reloaded, or come back to by the
	// browser's Back after a fight was left. The map is where a fight comes from — it is what
	// loads the open battle and knows the town — so go there and let it stage the fight back
	// if there is one to stage. `replaceState` so the bounce leaves no step of its own in the
	// history for Back to land on again.
	onMount(() => {
		if (!$stagedFight) void goto(MAP_ROUTE, { replaceState: true });
	});

	// Named, so the markup below reads one fight rather than the store four times over — and
	// so what is drawn is the fight this page was opened on even for the tick the bounce above
	// takes to leave.
	$: fight = $stagedFight;
</script>

{#if fight}
	<!-- CombatArena fields the team the battle is being fought with against the line-up it was
		opened against, and handles all its own gating. Only the town rides along, to key and
		label the fight: which town a battle is over and which generation of its team it is
		against are the server's record, kept on the battle itself, so the fight that is
		reported is the fight that was opened.
		The arena carries its own way out — the Close under the result, which is the one that
		waits on the fight reaching the server — and both it and the sheet leave the same way,
		for the map. `territory` is not listened to here: what a settled fight did to a town is
		the map's reading, and the map re-reads its occupancy when it is walked back onto. -->
	<FullScreenModal
		title="Combat"
		bare
		closeLabel="Close combat"
		closeDisabled={reporting}
		on:close={() => void leaveCombat()}
	>
		<!-- Keyed on the town and the generation as well as the line-up: challenging a different
			town whose sitting team happens to field the same characters is still a different
			fight, and must remount rather than reuse the last one. -->
		{#key `${fight.locationId}:${fight.turnover}:${fight.spawns
			.map((spawn) => spawn.characterId)
			.join(',')}`}
			<CombatArena
				ogTeam={fight.spawns}
				ogLocationId={fight.locationId}
				location={fight.plate}
				bind:reporting
				on:close={() => void leaveCombat()}
			/>
		{/key}
	</FullScreenModal>
{/if}
