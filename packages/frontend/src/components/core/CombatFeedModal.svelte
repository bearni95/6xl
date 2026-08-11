<script lang="ts">
	import classNames from 'classnames';
	import { _ } from 'svelte-i18n';
	import FullScreenModal from '$components/core/FullScreenModal.svelte';
	import PlayerAvatar from '$components/core/PlayerAvatar.svelte';
	import { combatFeedService } from '$services/combatFeed.service';
	import restoreCatalanArticle from '$utils/string/restore-catalan-article';
	import type { CombatFeedEntry, CombatFeedPlayer } from '$types/combat-feed.type';

	/**
	 * Every fight that has finished elsewhere while this one has been going on, read out.
	 *
	 * It is the button's other half: the counter at the corner of the orders panel says how
	 * many, and this says which. One line a fight — **both** the players in it, which of
	 * them won, and the town it was over — newest first, on the same sheet every full view
	 * in this app is drawn on.
	 *
	 * A line used to name one player and read the fight from their side ("X won at Y"),
	 * which is how the announcement is worded — `outcome` is stated from the account that
	 * reported it — and it is not how a fight reads to anybody else: a win is somebody
	 * beating somebody, and the feed was printing half of that. Both are in it now, and they
	 * are in a **sentence** ({@link said}): the whole wording lives in the catalogue and the
	 * three names are handed to it, rather than the row being a face and a name and a level
	 * at either end of a verb. A fight assembled out of boxes leaves the grammar to the
	 * layout, and grammar is not a thing a flex row can be right about.
	 *
	 * The three names in it are the three things a fight is about, so each of them is a way
	 * to go and look: an account opens its public page, a town opens on the map. They are
	 * coloured for it — the accounts in `primary`, the town in `secondary` — which is the
	 * only marking on the line, since a sentence with three underlines in it is a sentence
	 * nobody reads. The rest of the line is still the press that opens the record (see the
	 * markup for how one press stands behind the other three).
	 *
	 * The list is the service's and arrives by socket, so nothing is fetched here and there
	 * is nothing to refresh: a fight that finishes while this sheet is up is drawn onto it
	 * as it lands.
	 *
	 * **A fight names a town and never a code.** What travels on the channel is the geojson
	 * feature id, because the server has no idea what a town is called — no table there holds
	 * a place name; the layer the map is drawn from is the only thing that does. The service
	 * reads that layer as the fight starts rather than as this sheet is raised (see its
	 * `townNamesById`), so a name is in hand well before there is a line to put it on, and
	 * what is printed is what the map would print: the gazetteer's trailing article moved back
	 * to the front, the way every other place name in this game is set. The id is what is left
	 * when the layer cannot be had at all, which is the same nothing the map would fall back
	 * on.
	 */
	const entries = combatFeedService.entries;
	const townNames = combatFeedService.townNamesById;

	/**
	 * Which lines have been opened onto the whole of what arrived with them.
	 *
	 * A line says three things about a fight — who, what, and where — and the announcement
	 * carries a good deal more than that: what it paid, how much of the team came through,
	 * how many stood against them, whether the town changed hands, whether it was fought
	 * against a generation that had already been superseded, and the id behind every one of
	 * those readings. None of it belongs on the line, and all of it is worth being able to
	 * see, so the line is the press and the record drops out underneath it.
	 *
	 * A set rather than one open id: two fights opened at once are two fights being compared,
	 * which is the reason to be reading the record at all, and an accordion would shut the
	 * first the moment the second was asked for. It is rebuilt rather than mutated on every
	 * press, because Svelte's legacy reactive tracking follows assignments and a `Set` that
	 * is only added to never re-renders anything.
	 */
	let opened: ReadonlySet<string> = new Set();

	function toggle(id: string): void {
		const next = new Set(opened);
		if (!next.delete(id)) next.add(id);
		opened = next;
	}

	/**
	 * When the server filed the fight, as `DD/MM/YY HH:mm` — the day of it as well as the
	 * hour, since the feed opens on a tail that may reach back past midnight and a clock alone
	 * would put yesterday's fights among today's.
	 *
	 * Written out rather than formatted by `Intl`, which is the one place in this app that is
	 * true: a date left to the platform is a date the reader's own locale settles, and this is
	 * a fixed shape asked for by name. The moment itself is still the reader's — the parts are
	 * local ones, so a fight is stamped with the hour it happened at where it is being read.
	 */
	function stamp(at: string): string {
		const when = new Date(at);
		const pad = (value: number): string => String(value).padStart(2, '0');
		return (
			`${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${pad(when.getFullYear() % 100)}` +
			` ${pad(when.getHours())}:${pad(when.getMinutes())}`
		);
	}

	// Every name is spelled out in the statement itself — the two stores and the catalogue's
	// own formatter — so the lines are rebuilt when any of the three moves. A name that
	// arrived into something only a helper could see would have left every line standing at
	// the id it was first drawn with, and `$_` is the same trap one step further along: it is
	// a store too, changing when the dictionary lands, and it is only ever reached inside the
	// helpers below, where Svelte's legacy reactive tracking cannot see it.
	$: lines = $entries.map((entry) => ({
		entry,
		said: said(entry, townName(entry, $townNames), $_),
		face: winner(entry),
		beatenFace: beaten(entry)
	}));

	function townName(entry: CombatFeedEntry, known: ReadonlyMap<string, string> | null): string {
		const name = known?.get(entry.locationId);
		return name ? restoreCatalanArticle(name) : entry.locationId;
	}

	/** Whatever the catalogue's formatter is at the moment the lines are built. Handed in
	 * rather than reached for, so the statement above names it as a dependency. */
	type Translate = (id: string, options?: { values?: Record<string, string> }) => string;

	/** One piece of the sentence: a run of plain words, or one of the three names in it —
	 * which carries where that name goes and the colour it is said in. */
	interface Said {
		text: string;
		href?: string;
		classes?: string;
	}

	/**
	 * The fight, as one sentence broken at its three names.
	 *
	 * Both the players, which of them won and the town it was over, said the way the game
	 * would say it out loud — the whole wording in the catalogue and the three names handed
	 * to it, rather than a row of boxes the reader has to assemble a fight out of. Which
	 * means the *grammar* is the catalogue's too: where the verb sits, what the preposition
	 * is and whether taking a town is a clause of its own are all things a language decides,
	 * and none of them survive being drawn as three cells in a line.
	 *
	 * Three sentences, and they are three because the sentence differs and not because the
	 * data does: a fight won, a fight won that took the town with it, and a fight that
	 * settled nothing — which has no winner, and reads as the two of them together.
	 *
	 * The announcement is worded from the account that reported it, so `win` is the reporter
	 * beating whoever held the town and `lose` is that side beating the reporter. Turning
	 * that round is the whole of what this has to know beyond the words.
	 *
	 * It comes back in **pieces** rather than as a string because each of those three names
	 * is somewhere to go, and a link is an element. The catalogue is still handed the whole
	 * sentence and still decides where each name falls in it: the three are formatted in as
	 * markers no wording could contain, and the line is then cut back apart on them — so the
	 * pieces are in the order the language put them, and a message that moved the town to the
	 * front would move the link with it.
	 */
	function said(entry: CombatFeedEntry, town: string, t: Translate): Said[] {
		const beaten = entry.outcome === 'lose' ? entry.player : entry.rival;
		const won = entry.outcome === 'lose' ? entry.rival : entry.player;
		const names: Said[] = [player(won, t), player(beaten, t), place(entry, town)];
		const values = { winner: MARKS[0], loser: MARKS[1], town: MARKS[2] };
		const key =
			entry.outcome === 'draw' ? 'drew' : entry.captured ? 'captured' : 'beat';
		return t(`combat.feed.said.${key}`, { values })
			.split(MARK_PATTERN)
			.map((piece, index) => (index % 2 === 0 ? { text: piece } : names[Number(piece)]))
			.filter((piece) => piece.text !== '');
	}

	// The three slots, as characters no sentence can hold: a NUL round the slot's own number.
	// A marker made of ordinary letters would be a marker a town could be called.
	const MARKS = [0, 1, 2].map((index) => `\u0000${index}\u0000`);
	const MARK_PATTERN = /\u0000(\d)\u0000/;

	/**
	 * One of the two accounts, and the way to their page.
	 *
	 * A null side is a town still on its seeded house team, which belongs to nobody — so it
	 * is called the house rather than left as a hole in the middle of a sentence, and it is
	 * neither coloured nor pressable, there being no page for a team that is not anybody's.
	 * An account that has never named itself is worded, as it is everywhere else in this
	 * game, never stored — and still goes somewhere, since the page is the account's and not
	 * the name's.
	 */
	function player(who: CombatFeedPlayer | null, t: Translate): Said {
		if (!who) return { text: t('combat.feed.house') };
		const text = who.name ?? t('combat.feed.anonymous');
		if (!who.id) return { text };
		return { text, href: `/profile/${who.id}`, classes: 'text-primary' };
	}

	/**
	 * The town, and the way to it on the map.
	 *
	 * The map opens on whatever its `region` param names, and a municipality's key in that
	 * tree is its own geojson feature id — the very id the announcement travels with. So the
	 * link is the id and never the name, which means it still goes to the right place on a
	 * line the layer never landed for and which is printing that id as its own label.
	 */
	function place(entry: CombatFeedEntry, town: string): Said {
		return { text: town, href: `/?region=${entry.locationId}`, classes: 'text-secondary' };
	}

	/** The face at the head of the line: the winner's, or the reporter's where nobody won. */
	function winner(entry: CombatFeedEntry): CombatFeedPlayer {
		return entry.outcome === 'lose' && entry.rival ? entry.rival : entry.player;
	}

	/**
	 * The face at the far end of it: whoever was on the other side of the same fight.
	 *
	 * A fight is two accounts and the line now stands one at each end of itself — which is
	 * mostly the town's holder, since that is who a challenge is against, and is the reporter
	 * where the holder is the one who won. Null where there was no account to be against: a
	 * town still on its seeded house team belongs to nobody, so there is no face for it and the
	 * far end of the line is left empty rather than filled with something standing in for one.
	 * That is also the only case {@link winner} falls back to the reporter for, so the same
	 * portrait can never come up twice on one line.
	 */
	function beaten(entry: CombatFeedEntry): CombatFeedPlayer | null {
		if (!entry.rival) return null;
		return entry.outcome === 'lose' ? entry.player : entry.rival;
	}

	function close(): void {
		combatFeedService.closeFeed();
	}
</script>

<FullScreenModal
	title={$_('combat.feed.title')}
	closeLabel={$_('combat.feed.close')}
	on:close={close}
>
	<!-- The list scrolls inside the sheet rather than the sheet scrolling, as the leaderboard's
	     table does: the title bar stays put however far down the feed a fight sits. -->
	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-box bg-base-200/50">
		{#each lines as { entry, said, face, beatenFace } (entry.id)}
			<!-- One fight: the line it is read as, and under it the whole of what was announced
			     about it, while it is open. The rule the row carried moves out here, so a fight
			     is one block however much of it is showing and the record is inside the same
			     division as the line it belongs to. -->
			<div class="flex flex-col border-b border-base-300/50 last:border-0">
				<!-- One fight, said in one sentence: both the players in it, which of them won and
				     the town it was over, written out (see `said`) rather than laid out. It was a
				     row of boxes for a while — a face and a name and a level at either end of a
				     word — which is a fight the reader has to assemble out of its parts, and which
				     leaves the grammar to the layout: where a verb sits and what a preposition is
				     are the catalogue's to decide, not a flex row's.
				     A face at each end of it, the winner's and the account they were against, which
				     are marks on the line and not two more things to read: the sentence has already
				     named them both. The far one comes off entirely against a town on its house
				     team, there being no account on that side to draw.

				     **Four presses on one line, and none of them inside another.** The three names
				     go somewhere — a page each — and the line itself opens the record; a link
				     cannot stand inside a button (no interactive element may), so the line's press
				     is laid *behind* the row rather than round it. The reading on top takes no
				     pointer at all, so anywhere the eye lands falls through to the press
				     underneath, and the three links turn the pointer back on for themselves —
				     which is the same layering the arena's arrows use over its orders. Nothing is
				     drawn twice and nothing overlaps: the layer is exactly the row.
				     The press is named by the sentence rather than by a label of its own
				     (`aria-labelledby`), so it still says what it is in the words already on the
				     screen, and `aria-expanded` says the one thing those words do not. -->
				<div class="relative transition-colors hover:bg-base-300/40">
					<button
						type="button"
						class="absolute inset-0 cursor-pointer"
						aria-labelledby="feed-said-{entry.id}"
						aria-expanded={opened.has(entry.id)}
						on:click={() => toggle(entry.id)}
					></button>
					<div class="pointer-events-none relative flex w-full items-center gap-3 px-4 py-3">
						<PlayerAvatar
							characterId={face.characterId}
							color={face.color}
							initial={(face.name ?? '?').slice(0, 1).toUpperCase()}
							size="w-10"
							textClasses="text-base"
							ownColors={false}
						/>
						<!-- What is between the two faces: when the fight was filed, and then what
						     happened in it. The stamp is a line of its own above the sentence rather than
						     a figure at the far end of the row — it was in the corner past the words, which
						     is where the second face stands now, and a date is a heading over a line
						     anyway rather than an afterthought behind it. -->
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="text-xs opacity-60">{stamp(entry.at)}</span>
							<!-- The sentence wraps rather than truncating: it is a sentence, and half of one
							     says something other than what happened. `min-w-0` on the column so it may, a
							     flex item being floored at its own content otherwise.
							     Its three names are the only things in here that take a pointer. They carry
							     no underline of their own — a sentence ruled in three places is a sentence
							     nobody reads — and are told apart by colour alone until one is pointed at. -->
							<span id="feed-said-{entry.id}" class="text-sm">
								{#each said as piece}{#if piece.href}<a
											href={piece.href}
											class={classNames(
												'pointer-events-auto font-semibold hover:underline',
												piece.classes
											)}>{piece.text}</a
										>{:else}{piece.text}{/if}{/each}
							</span>
						</div>
						{#if beatenFace}
							<!-- The other side of the same fight, at the other end of the line: two accounts
							     fought and the row is bracketed by the two of them. Nothing stands here for a
							     town on its house team — a side that is not anybody's has no portrait, and a
							     placeholder in the corner would read as an account nobody can open. -->
							<PlayerAvatar
								characterId={beatenFace.characterId}
								color={beatenFace.color}
								initial={(beatenFace.name ?? '?').slice(0, 1).toUpperCase()}
								size="w-10"
								textClasses="text-base"
								ownColors={false}
							/>
						{/if}
					</div>
				</div>
				{#if opened.has(entry.id)}
					<!-- The announcement itself, as the app holds it: the entry the adapter read off
					     the channel, every field of it, in the order the type declares them. Not the
					     line's own reading of it — the town is its geojson id down here, because that
					     is what arrived and this is the record rather than the sentence.
					     It scrolls on its own axis rather than wrapping (`overflow-x-auto` on a `pre`,
					     which is what keeps the indentation meaning something), so a long id runs
					     inside this box and never widens the sheet the list is drawn on. -->
					<pre
						class="mx-4 mb-3 overflow-x-auto rounded-box bg-base-300/60 p-3 font-mono text-xs">{JSON.stringify(
							entry,
							null,
							2
						)}</pre>
				{/if}
			</div>
		{:else}
			<!-- Nothing has finished yet. The sheet is only reachable once something has, so this
			     is the state of a feed whose fights have all been read and then trimmed away —
			     rare, and still worth a sentence rather than an empty box. -->
			<p class="p-6 text-center text-sm opacity-70">{$_('combat.feed.empty')}</p>
		{/each}
	</div>
</FullScreenModal>
