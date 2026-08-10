<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import CombatArena from '$components/core/CombatArena.svelte';
	import { stagedFight, leaveCombat, MAP_ROUTE } from '$services/combat';
	import { territoryService } from '$services/territory.service';
	import {
		siegeProgress,
		type MunicipalityHolder,
		type MunicipalitySiege
	} from '$types/territory.type';
	import type { StagedFight } from '$services/combat';
	import type { TownPlateCard } from '$types/map.type';

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
		if (!$stagedFight) {
			void goto(MAP_ROUTE, { replaceState: true });
			return;
		}
		void readTerritory();
	});

	// --- Whose town this is, read here rather than taken on trust ------------------------
	//
	// The plate the map staged is a snapshot, and a snapshot of a reading the map may not
	// have made yet: the holders are one of the last things it loads, and the rule that puts
	// a player back into the fight they are already in fires the moment the open battle
	// lands — which can be before that load returns. What the arena was handed then is a
	// town with no occupant and a bar of nought out of *one*, because with no holder row to
	// read a turnover off, `requiredWins` answers for the untouched OG team. A town taken
	// once needs two wins and is somebody's; both figures were wrong, and wrong in the
	// direction that flatters the challenger.
	//
	// So this page reads the two ledgers itself, off the same service and the same tables
	// the map reads (`municipality_holders_public`, world-readable, and the RLS-scoped
	// `municipality_sieges`), and prints the plate off what comes back. It is the map's
	// `reloadTerritory` and its `pinHolder`/`siegeBar` pair, on the page that draws the
	// fight — a fight is over one town and this is the page it is over it on, so there is no
	// reason for it to be reading a copy of a copy.
	//
	// The staged plate is still the fallback and still what is drawn first: it is right
	// whenever the map had loaded before it staged, and a plate that emptied itself while a
	// fresh read was in flight would flicker the holder off a town that has one.
	const holders = territoryService.holders;
	const sieges = territoryService.sieges;

	// Whether this page's own read has landed. Only a pair that both came back may print —
	// the wins are the siege's and the bar they are counted against is the holder's, so half
	// a read is a figure standing next to one it does not belong with.
	let read = false;

	async function readTerritory(): Promise<void> {
		try {
			await Promise.all([territoryService.loadHolders(), territoryService.loadSieges()]);
			read = true;
		} catch {
			// Leave the staged plate standing and say nothing: what the map handed over is
			// the last reading anybody actually made of this town.
			read = false;
		}
	}

	// Named, so the markup below reads one fight rather than the store four times over — and
	// so what is drawn is the fight this page was opened on even for the tick the bounce above
	// takes to leave.
	$: fight = $stagedFight;

	// The town's plate as it stands right now. Every name is spelled out so Svelte's legacy
	// reactive tracking sees the two stores and the flag as dependencies of it.
	$: plate = livePlate(fight, $holders, $sieges, read);

	/**
	 * The staged plate with the occupancy re-read onto it: who is sitting on the town and how
	 * far this player has got towards shifting them.
	 *
	 * Only those two. What the town is called, what it flies and the colour it is drawn in are
	 * the map's readings off the region tree and the show glyphs, none of which this page has —
	 * and none of which can have moved while a fight was being walked into.
	 */
	function livePlate(
		staged: StagedFight | null,
		occupied: ReadonlyMap<string, MunicipalityHolder>,
		banked: ReadonlyMap<string, MunicipalitySiege>,
		landed: boolean
	): TownPlateCard | null {
		if (!staged?.plate) return null;
		const key = staged.locationId;
		if (!key || !landed) return staged.plate;
		const holder = occupied.get(key) ?? null;
		const progress = siegeProgress(key, occupied, banked);
		return {
			...staged.plate,
			// The four things a holder is drawn by, exactly as the map's own pins take them
			// (see pinHolder): the name already worded for a player who never chose one, the
			// avatar as the pair it is, and the level worked out from the experience the view
			// joins on. Null is a town still on its seeded house team, which nobody holds.
			holder: holder
				? {
						name: holder.holderName,
						characterId: holder.avatarCharacterId,
						color: holder.avatarColor,
						level: holder.level
					}
				: null,
			// The standing, with nothing under it to press: a fight already under way has no
			// challenge left to start, which is the one thing the map's siegeBar leaves out too.
			challenge: { siege: { wins: progress.wins, required: progress.required }, button: null, unlocksAt: null }
		};
	}
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
				location={plate}
				bind:reporting
				on:close={() => void leaveCombat()}
			/>
		{/key}
	</FullScreenModal>
{/if}
