<script lang="ts">
	import MapScreen from '$components/core/MapScreen.svelte';
	import SplashScreen from '$components/core/SplashScreen.svelte';

	// The front door, and everything that used to be written out here is in MapScreen now: the
	// terrain, the block naming the open place, the band across the top, the column at the side,
	// and the whole of the machinery all four are read off. It was moved rather than copied
	// because `/map` draws the same two boxes at the same address's own size (see that route),
	// and a second copy of the map would be a second answer to which place is open, which town
	// flies which show and whose the ground is.
	//
	// So this page is the map with its chrome, which is the default, plus the one thing that is
	// this address's alone.
</script>

<MapScreen />

<!-- Draws nothing: it clears the splash the shell put up, 500ms after this page mounts.
	Here rather than in the layout because the splash is the front door's and no other route's —
	the shell has already taken it down anywhere else (see app.html) — so both halves of it stand
	in the same place. Which is also why it is on this page and not inside MapScreen: `/map`
	mounts the same map, and a splash is about arriving at the game rather than about the map. -->
<SplashScreen />
