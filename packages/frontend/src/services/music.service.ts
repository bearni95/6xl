import { get, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import localStorageWritableStore from '$utils/localStorageWritableStore';
import { musicTrackSrc } from '$utils/music/tracks';
import {
	dailyShowShuffles,
	utcDayIso,
	utcMidnightMs,
	type ShowShuffle
} from '$utils/music/daily-shuffle';
import { stationPositionAt } from '$utils/music/station';
import type { MusicTrack, MusicCollection } from '$types/music.type';

/**
 * The radio. There is a single player in the corner of the map, so there is a single
 * audio element, and it lives here rather than in the component: a component is
 * mounted and unmounted, and a song that stopped because a panel closed would be the
 * page deciding something about the music. The element is the service's, created once,
 * and it keeps playing whatever happens on screen.
 *
 * What there is to play is not in here either: the songs are vendored in @3xl/assets
 * and what each of them is — its title, and the show it opens — is the authored
 * `public/music.json`, read here at `/data/music.json`, the same way the badges and
 * the shows are read.
 *
 * **A show is a station**, and a station is not a playlist. Its songs are put in an
 * order drawn from the day's seed (`daily-shuffle`), they run end to end from the
 * day's midnight UTC and start again when they run out, and what is playing at any
 * moment is whichever song that clock lands in — at the second the clock lands on
 * (`station`). Nothing here chooses a song and nothing is stored or sent: two players
 * pressing play at the same instant hear the same bar of the same song, and one who
 * pauses for ten minutes comes back to what the station played on without them. All
 * a listener chooses is which station they are on.
 *
 * The lengths that clock is built out of are the files' and nobody authors them, so
 * they are read off the audio itself, one probe per song, before a station can be
 * placed. Until they land — and for a file that will not decode — the station falls
 * back to being a playlist in the day's order, which is the closest thing to a radio
 * that can be had without knowing when anything ends.
 *
 * Two things about a radio belong to the listener rather than to the clock, and both
 * are remembered in localStorage across a reload: which station they are on, and
 * whether they had it on at all. Neither is a position — there is nothing to resume,
 * because the station kept playing while the page was gone — so what is restored is a
 * station tuned in where it now is, and a play the browser is asked for twice. Once on
 * the spot, which it may refuse, since a reload is not a gesture and an autoplay policy
 * is not something to argue with; and then at the listener's first click or key on the
 * page, whatever that press was actually for, which is a gesture and is allowed. So a
 * radio left on comes back on, at the moment the listener touches anything — and until
 * they do, the plate honestly says Play. A refusal is never written back as their having
 * turned it off, because they did not.
 *
 * The dial is turned by two hands. The listener's, on the select in the burger menu, which
 * is the only place it is a select at all; and the map's, which tunes it to the show the
 * place it is open on flies (see {@link MusicService.follow}) — so what is playing is about
 * where the reader is, and the music moves with them without their asking. The map's hand
 * is on the dial whether or not there is sound: a running radio changes station at once, and
 * a silent one is tuned just the same, so the band on the map letters that place's station
 * while it is quiet and the press that turns it on starts what the band was already saying.
 * Turning the dial is never turning the sound on. A change of
 * station under a listener is crossfaded rather than cut, since the map
 * moves often and a cut every time it did would read as the radio breaking. Only the
 * *station* fades: the songs within one hand over the way a station's do.
 *
 * The store says only what a surface has to draw: which song is on, whether it is
 * running, and the stations there are to choose between.
 */

/** Metadata is loaded, so `currentTime` can be set — `HTMLMediaElement.HAVE_METADATA`. */
const HAVE_METADATA = 1;

/**
 * How far off the station's clock the running song may be before it is seeked back.
 * A seek is audible, so it is not worth doing for the tenths a decode costs; a second
 * and a half is under a bar and well inside what two listeners would call the same
 * moment.
 */
const DRIFT_MS = 1500;

/**
 * Added to the wait for the next song, so the retune lands just *after* the boundary
 * rather than on it — a timer that fires a millisecond early would place the station
 * on the song that is ending and immediately have to come back.
 */
const RETUNE_MARGIN_MS = 50;

/**
 * How long one station takes to become another while the radio is on. A station change
 * is the one moment this player cuts from one song to a different one, and on a map that
 * changes station by itself as the reader moves around it (see {@link MusicService.follow})
 * a cut would read as a fault. Long enough to be heard as a turn of the dial rather than
 * a glitch, short enough that the two songs are not a mix.
 */
const CROSSFADE_MS = 1200;

/**
 * How often the two volumes are moved during that fade. Below the ~50ms a ramp starts to
 * be heard stepping, and not so fine that a fade costs more timer wake-ups than it is
 * worth.
 */
const CROSSFADE_STEP_MS = 40;

/** Where the listener's two choices are kept between visits. */
const MEMORY_KEY = 'music-player';

/** What a surface needs to letter the player. */
export interface MusicState {
	/**
	 * The song on air, or null before the collection has been read and for a game whose
	 * collection is empty — there is then nothing to draw a player for.
	 */
	track: MusicTrack | null;
	/** Whether it is actually running — read off the element, not off the last order. */
	playing: boolean;
	/**
	 * Every station there is to choose between, as show ids in dial order — the shows
	 * that have a song, by id, and `null` last for the songs that open no show. Empty
	 * until the collection has been read.
	 */
	stations: (number | null)[];
	/**
	 * Which of them is tuned. The station actually playing, not the remembered choice:
	 * a listener whose station has lost its last song is on the first one, and this
	 * says so. Meaningless while {@link stations} is empty, where nothing is drawn.
	 */
	station: number | null;
}

/** The listener's own two choices, kept in localStorage across a reload. */
interface MusicMemory {
	/**
	 * The station last chosen — a show id, `null` for the songs that open no show, and
	 * absent for a listener who has never chosen one, which is not the same as having
	 * chosen the unlinked songs.
	 */
	station?: number | null;
	/** Whether the radio was left on. */
	on: boolean;
}

class MusicService {
	/** Lazily built, browser-only: `new Audio()` does not exist while prerendering. */
	private audio: HTMLAudioElement | null = null;

	/** Which file the element carries, so a seek meant for one song cannot land in another. */
	private loadedFile: string | null = null;

	/** The authored collection, in file order. Empty until {@link load} resolves. */
	private tracks: readonly MusicTrack[] = [];

	/** The UTC day {@link stations} was drawn for. Empty until the first grouping. */
	private day = '';

	/** Every station's day order. Redrawn when the day turns over, and only then. */
	private stations: ShowShuffle[] = [];

	/**
	 * The tuned station's show, `null` for the songs that open no show, and
	 * `undefined` for a listener who has not chosen one: that is not a station's key,
	 * so it falls through to the first one. Seeded from the last visit's choice.
	 */
	private tuned: number | null | undefined = undefined;

	/** Where in the tuned station's order the element is. The store mirrors it. */
	private index = 0;

	/** How long each song is, in seconds, by file — read off the audio, never authored. */
	private readonly durations = new Map<string, number>();

	/**
	 * Each file's probe, by file — the promise and not a flag, so a station tuned into
	 * while its songs are still being measured waits for those probes rather than
	 * concluding from "already asked" that the answer is in.
	 */
	private readonly probes = new Map<string, Promise<void>>();

	/** The pending retune at the end of the song on air. */
	private retuneAt: ReturnType<typeof setTimeout> | null = null;

	/**
	 * The station being faded out, while one is: the element it is coming out of and the
	 * ramp moving the two volumes. Null the rest of the time, which is nearly all of it —
	 * there is one element until a station changes under a listener.
	 */
	private fading: {
		from: HTMLAudioElement;
		/** Where that element's volume started, so an interrupted fade is not a jump up. */
		level: number;
		timer: ReturnType<typeof setInterval>;
	} | null = null;

	/**
	 * Whether the listener wants sound. The element is only where it comes out — a
	 * station changing song pauses the element on its way past, and that is not the
	 * listener turning the radio off.
	 */
	private wanted = false;

	/**
	 * The show the map last said the reader is standing on (see {@link follow}). The dial
	 * is put there as it is said, so this is normally where the dial already is; what it
	 * is for is the one moment that cannot be obeyed — a place named before the collection
	 * has been read has no station to be tuned to yet, and the press that turns the radio
	 * on has to come up on that place's station rather than on whatever the dial was left
	 * at, which would be one song for the whole country.
	 *
	 * Null before the map has said anything and after the listener has turned the dial
	 * themselves: an explicit choice outranks the place until the map next moves.
	 */
	private followed: number | null = null;

	/** The in-flight (or finished) read, so several mounts share one fetch. */
	private reading: Promise<void> | null = null;

	/**
	 * Whether the remembered "on" has been acted on. Once only, and on the first
	 * station that can be placed: a reload that turned the radio back on and then kept
	 * turning it back on would be a play button that could not be pressed off.
	 */
	private resumed = false;

	/**
	 * How to stand down the wait for the listener's first gesture, or null when nothing
	 * is waiting on one. Holding the disarm rather than a flag is what keeps the
	 * listeners from outliving what they were for (see {@link awaitGesture}).
	 */
	private awaiting: (() => void) | null = null;

	/**
	 * The listener's two choices, written only where they make one — never from a
	 * refused autoplay or from anything the clock did.
	 */
	private readonly memory = localStorageWritableStore<MusicMemory>(MEMORY_KEY, { on: false });

	private readonly stateStore = writable<MusicState>({
		track: null,
		playing: false,
		stations: [],
		station: null
	});

	constructor() {
		// The station chosen last time, before anything is read: the collection may not
		// still hold it, and a key naming no station falls through to the first.
		this.tuned = get(this.memory).station;
	}

	/** What is on air and whether it is running, for a surface to subscribe to. */
	get state(): Readable<MusicState> {
		return this.stateStore;
	}

	/**
	 * Read the collection once and tune in, paused. Safe to call from every mount: the
	 * first call fetches and the rest await that same promise. A failed read leaves the
	 * player with no song — and so undrawn — rather than with a button that would play
	 * nothing; it is cleared, so a later mount tries again.
	 */
	load(): Promise<void> {
		this.reading ??= fetch('/data/music.json')
			.then((response) => {
				if (!response.ok) throw new Error(`Failed to load music (${response.status})`);
				return response.json() as Promise<MusicCollection>;
			})
			.then((collection) => {
				this.tracks = collection.tracks ?? [];
				// Force the regroup: a station() call before the fetch landed will have
				// grouped an empty collection under today's date.
				this.day = '';
				this.index = 0;
				// Nothing has been measured yet, so this is the day's order from its start.
				// It is what the plate letters while the probes are out, and it is replaced
				// by whatever is really on air the moment they are all in.
				this.tune();
				this.measure(this.station());
			})
			.catch((error) => {
				this.reading = null;
				throw error;
			});
		return this.reading;
	}

	/**
	 * Turn the radio on, or off if it is already on. The only entry point that may
	 * start sound, so it must be reached from a real click: browsers refuse a `play()`
	 * that no gesture asked for. Turning it on tunes in first — to the place the map is
	 * open on, and there at the moment it is at, since a radio that had been off for a
	 * while is not resumed where it stopped but joined where it now is.
	 */
	toggle(): void {
		const audio = this.element();
		if (!audio) return;

		// Wanted but not running is a radio something else stopped — the OS media keys,
		// a tab that was suspended. That click is asking for it back, not for silence.
		if (this.wanted && !audio.paused) {
			this.wanted = false;
			this.remember({ on: false });
			// A station on its way out is still sound coming from this radio, so it goes
			// silent with the one being turned off — otherwise the pause would leave the
			// last second of the previous station playing on with nothing to answer it.
			this.settle();
			audio.pause();
			return;
		}
		this.remember({ on: true });
		this.switchOn();
	}

	/**
	 * Tune to a station by the show it is: an id from {@link MusicState.stations}, or
	 * `null` for the songs that open no show. The radio stays on or off as it was, and
	 * the new station is joined where it now is — there is no starting one from the
	 * top. A show the collection has no station for is not tuned to.
	 *
	 * This is the listener's own hand on the dial, so it drops the place the map had been
	 * standing on: a station picked deliberately must survive the press that turns the
	 * sound on, and would not if that press went back to the town on screen.
	 */
	tuneTo(showId: number | null): void {
		this.followed = null;
		this.select(showId, true);
	}

	/**
	 * Tune to the show the map is looking at, if the radio is on — the map moving the
	 * dial rather than the listener. Which show a place flies is the map's own statement
	 * about it (its town's show, or the plurality of the towns under a region), so a
	 * reader who drills into a comarca hears what that comarca is mostly made of.
	 *
	 * The dial moves whether or not there is sound. It is the *dial* that follows the map,
	 * not the volume: a place on screen is a station on this radio, so the station said on
	 * the map's own band is the one the place flies, and pressing play there starts what
	 * the band has been saying all along. It held back while the radio was off for a while,
	 * on the reasoning that a station changing under a paused player would hand whoever
	 * pressed play next a station they did not leave it on — what that actually did was
	 * leave the band lettering the last town anybody had listened to, so a reader walking
	 * the map with the sound down saw one song for the whole country and the radio looked
	 * broken. Nothing starts playing here either way: sound is only ever started from a
	 * gesture (see {@link toggle}, {@link switchOn}), and everything below this leaves
	 * `wanted` exactly as it found it.
	 *
	 * Two things still make this the map's move and not the listener's, and each is
	 * deliberate:
	 *
	 * - **Nothing is remembered.** The listener's station is the one they turned the dial
	 *   to (see {@link remember}); where they happened to have the map when they closed
	 *   the page is not a choice about music.
	 * - **`null` is not a station here.** The dial's `null` means the songs that open no
	 *   show, while a place with no show is a place the map cannot name one for — an
	 *   unknown, and a radio does not retune on one, nor forget where it last was. Nor
	 *   does a show with no songs move it: there is no station to go to, so it stays
	 *   where it is rather than going quiet.
	 *
	 * Where the map is is noted as well as acted on (see {@link followed}), for the one
	 * case the dial cannot be moved in: a place named before the collection has been read
	 * has no station to go to yet, and {@link switchOn} aims at it again.
	 */
	follow(showId: number | null): void {
		if (showId === null) return;
		this.followed = showId;
		this.select(showId, false);
	}

	/**
	 * Start the sound, on the station the place on screen flies. The three ways a radio
	 * comes on — the press, a remembered "on" restored, and the gesture that restore
	 * waits for — are all one thing: sound where there was none, at wherever the map has
	 * got to by then. Aiming before the tune rather than tuning twice is what keeps the
	 * first thing heard from being a second of the old station.
	 *
	 * No crossfade: a fade is for a dial turned under a song that is already playing, and
	 * there is nothing here to come out of.
	 */
	private switchOn(): void {
		this.wanted = true;
		const moved = this.followed !== null && this.aim(this.followed);
		this.tune();
		if (moved) this.measure(this.station());
	}

	/**
	 * Put the dial on `showId` — the one place a station is chosen, whoever is choosing.
	 * A station that is not there, and the one already tuned, are both no-ops, so callers
	 * may say where they want to be as often as they like. The change is crossfaded when
	 * there is sound to crossfade (see {@link crossfade}); a station changed under a
	 * radio that is off is simply what it will be playing when it comes back on.
	 */
	private select(showId: number | null, remember: boolean): void {
		if (!this.aim(showId)) return;
		if (remember) this.remember({ station: showId });
		this.tune(false, true);
		this.measure(this.station());
	}

	/**
	 * Move the dial to `showId` without touching the sound, and say whether it moved. The
	 * one place the tuned station is decided, for the two things that then do different
	 * work with it: a change under a running radio, which is crossfaded ({@link select}),
	 * and a radio being turned on, which has nothing to fade ({@link switchOn}).
	 *
	 * A station that is not there and the one already tuned both leave it where it is, so
	 * callers may say where they want to be as often as they like.
	 */
	private aim(showId: number | null): boolean {
		const current = this.station();
		if (!current || current.showId === showId) return false;
		if (!this.stations.some((station) => station.showId === showId)) return false;

		this.tuned = showId;
		this.index = 0;
		return true;
	}

	/**
	 * Put the element on whatever the tuned station is playing at this instant, and
	 * arrange to come back when that song ends. Called on every boundary whether or not
	 * anyone is listening, so the plate says what is on air rather than what was on air
	 * when the listener last paused.
	 *
	 * `fade` says this is a change of station rather than the clock moving the one that
	 * is on along: the song a station hands over to its next is a cut because that is what
	 * a station does, and a song from a different station arriving over the top of it is a
	 * dial being turned.
	 */
	private tune(ended = false, fade = false): void {
		if (this.retuneAt !== null) {
			clearTimeout(this.retuneAt);
			this.retuneAt = null;
		}

		const station = this.station();
		const order = station?.tracks ?? [];
		if (order.length === 0) return;

		const position = stationPositionAt(order, this.durations, Date.now() - utcMidnightMs(this.day));

		if (!position) {
			// Not placeable: a length is still on its way, or a file will not decode. The
			// order still plays, from wherever it has got to — the same songs in the same
			// order as everyone else's, only not at the same second. The tune that follows
			// the last probe puts it back on air.
			//
			// With no clock to place it, the only thing that moves this station along is a
			// song running out — which is the one moment `ended` is the truth about, so it
			// is the one place the next song is chosen here rather than read off a clock.
			const at = Math.min(this.index, order.length - 1);
			this.air(order, ended ? (at + 1) % order.length : at, 0, fade);
			return;
		}

		this.air(order, position.index, position.offsetMs, fade);
		this.retuneAt = setTimeout(() => this.tune(), position.remainingMs + RETUNE_MARGIN_MS);
	}

	/** Letter one song as being on, and put the element on it at `offsetMs` into it. */
	private air(order: readonly MusicTrack[], index: number, offsetMs: number, fade = false): void {
		this.index = index;
		const track = order[index];
		this.stateStore.update((state) => ({ ...state, track }));

		const audio = this.audio;
		// Nobody has pressed play yet: there is no element to put anywhere, and the plate
		// above is all there is to keep up to date.
		if (!audio) return;

		if (this.loadedFile !== track.file) {
			// A dial turned on a radio that is actually making a sound: the new station
			// comes up under the old one instead of replacing it on this element. Asked of
			// the element rather than of `wanted`, because a radio that wants to play but
			// was refused has nothing to fade out of.
			if (fade && this.wanted && !audio.paused) {
				this.crossfade(track.file, offsetMs);
				return;
			}
			this.loadedFile = track.file;
			audio.src = musicTrackSrc(track.file);
			this.seek(audio, track.file, offsetMs);
		} else if (Math.abs(audio.currentTime * 1000 - offsetMs) > DRIFT_MS) {
			// The right song but the wrong moment of it — a tab that was suspended, or a
			// decode that fell behind. Anything smaller than the drift is left alone: a
			// seek is audible and being a second out is not.
			this.seek(audio, track.file, offsetMs);
		}

		if (this.wanted) void this.start(audio);
	}

	/**
	 * Move `audio` to `offsetMs` into `file`, waiting for the metadata if it is not in
	 * yet — `currentTime` cannot be set on an element that does not know how long it
	 * is. A seek that arrives after the station has moved on is dropped rather than
	 * landing in whatever song is loaded by then.
	 */
	private seek(audio: HTMLAudioElement, file: string, offsetMs: number): void {
		if (audio.readyState >= HAVE_METADATA) {
			audio.currentTime = offsetMs / 1000;
			return;
		}
		audio.addEventListener(
			'loadedmetadata',
			() => {
				if (this.loadedFile === file) audio.currentTime = offsetMs / 1000;
			},
			{ once: true }
		);
	}

	/**
	 * Bring `file` up at `offsetMs` while the station on air goes down, over
	 * {@link CROSSFADE_MS}. The new station gets an element of its own — the element is
	 * where a song comes out, and two songs cannot come out of one — and that element
	 * becomes the radio's the moment it is made, so everything that reads `this.audio`
	 * (the drift check, the seek, the pause) is already talking about the station that is
	 * arriving rather than the one that is leaving.
	 *
	 * The outgoing element is only ever *heard* out: it keeps playing its own song into
	 * the fade, which is what makes this a crossfade and not a fade to silence and back.
	 * It is then stopped and dropped, and only the arriving one is left.
	 *
	 * The ramp is equal-power (`cos`/`sin`) and not linear: two uncorrelated songs at half
	 * volume each are quieter than either at full, so a linear pair dips audibly in the
	 * middle — which is the hole in the sound this whole method exists to avoid.
	 */
	private crossfade(file: string, offsetMs: number): void {
		const from = this.audio;
		if (!from) return;

		// Whatever was still fading out goes now: a reader moving across the map can turn
		// the dial again before a fade is done, and a third song joining the two would be
		// a mix. Where the station that stays is *at* is where this fade starts from — it
		// is only ever below full when it is itself half way in, and starting its ramp
		// from full would be a jump up before the fall.
		const level = from.volume;
		this.settle();

		const to = this.deck(file);
		this.audio = to;
		this.loadedFile = file;
		to.volume = 0;
		this.seek(to, file, offsetMs);
		void this.start(to);

		const started = Date.now();
		const timer = setInterval(() => {
			const at = Math.min((Date.now() - started) / CROSSFADE_MS, 1);
			from.volume = level * Math.cos((at * Math.PI) / 2);
			to.volume = Math.sin((at * Math.PI) / 2);
			if (at === 1) this.settle();
		}, CROSSFADE_STEP_MS);

		this.fading = { from, level, timer };
	}

	/**
	 * End the fade that is running, if one is: the ramp stops and the station that was
	 * going out is stopped and let go. Its `pause` is not the radio pausing — the
	 * element's own listeners speak only for the element that is currently the radio's
	 * (see {@link deck}) — so nothing here reaches the button.
	 */
	private settle(): void {
		if (!this.fading) return;
		const { from } = this.fading;
		clearInterval(this.fading.timer);
		this.fading = null;
		from.pause();
	}

	/**
	 * The tuned station, regrouping the collection if the day has turned over since it
	 * was last asked — the orders are the day's, and the map is a page that can be left
	 * open across a midnight. What is tuned is carried across by show, not by position:
	 * a new day reorders each station's songs, not the stations.
	 */
	private station(): ShowShuffle | null {
		const day = utcDayIso();
		const regrouped = day !== this.day;
		if (regrouped) {
			this.day = day;
			this.stations = dailyShowShuffles(this.tracks, day);
		}
		if (this.stations.length === 0) return null;

		const tuned =
			this.stations.find((station) => station.showId === this.tuned) ?? this.stations[0];
		// The dial as a surface draws it, published from the one place that works out
		// which station is really on — and only when it has moved, since this is asked
		// again at every song boundary and a store set is a redraw.
		this.stateStore.update((state) =>
			!regrouped && state.station === tuned.showId
				? state
				: {
						...state,
						station: tuned.showId,
						stations: this.stations.map((station) => station.showId)
					}
		);
		return tuned;
	}

	/** Write down one of the listener's two choices, for the next time they are here. */
	private remember(choice: Partial<MusicMemory>): void {
		this.memory.update((memory) => ({ ...memory, ...choice }));
	}

	/**
	 * Turn the radio back on if that is how it was left, once there is a station to
	 * turn it on to. A reload is not a gesture, so the browser may refuse — that is
	 * reported as not playing and is not written down as the listener having turned it
	 * off, since they did not. What is asked for instead is the listener's next
	 * gesture, whatever it turns out to be (see {@link awaitGesture}): the policy is
	 * about gestures and not about this radio, so the first one there is will do.
	 */
	private resume(): void {
		if (this.resumed) return;
		this.resumed = true;
		if (!get(this.memory).on || !this.element()) return;
		this.switchOn();
		this.awaitGesture();
	}

	/**
	 * Turn the radio on at the listener's first gesture on the page — armed when a
	 * remembered "on" is restored, and the whole of what makes that memory worth
	 * keeping: an autoplay policy refuses a play that no gesture asked for, so a radio
	 * left on came back silent every time and the setting was a note nobody could act
	 * on. Any gesture carries the permission; it does not have to be about the music.
	 *
	 * Armed whether or not the restore was refused, because at that moment nobody knows
	 * yet — `play()` answers a turn later. A radio that is already on simply disarms
	 * this at the first click without doing anything.
	 *
	 * `click` and `keyup` and not the presses under them: they are the *end* of an
	 * interaction, by which time whatever the listener was pressing has already been
	 * handled. That matters because the first click of a visit is quite likely to be on
	 * the play button itself — and a radio turned on underneath that press would be
	 * turned off again by the press, which would read as a play button that does not
	 * work. For the same reason the decision is taken a task later than the event, so a
	 * keyboard press whose click comes after the keyup is handled before it: whatever
	 * that gesture did to the radio has happened by then, and this stands down if the
	 * radio is already on. A gesture's permission outlives the task it arrived in, so
	 * playing from there is still playing from a gesture.
	 *
	 * A pan or a wheel over the map is not one of these, and deliberately: neither
	 * counts as a gesture for the policy either, so a play from one would be refused —
	 * the listener has to have touched something.
	 */
	private awaitGesture(): void {
		if (!browser || this.awaiting) return;

		const act = () => {
			// The gesture may have been the listener turning the radio on themselves, or
			// they may have turned it off since the page loaded. Only a radio still
			// remembered as on, and not already on, is started here.
			if (!get(this.memory).on || this.wanted) return;
			this.switchOn();
		};

		const onGesture = () => {
			this.awaiting?.();
			setTimeout(act, 0);
		};

		const events = ['click', 'keyup'] as const;
		for (const event of events) window.addEventListener(event, onGesture, { passive: true });
		this.awaiting = () => {
			this.awaiting = null;
			for (const event of events) window.removeEventListener(event, onGesture);
		};
	}

	/**
	 * Read the length of every song in `station` that has not been read yet, then tune,
	 * since knowing them is what turns its order into a time of day. A file that will
	 * not decode is left unmeasured rather than recorded as zero — the truth about it
	 * is that the station cannot be placed, which is what the fallback above is for.
	 *
	 * The other stations are measured after it, so turning the dial is on air at once
	 * rather than stumbling through the same wait; they wait their turn so that they
	 * cannot delay the station somebody is actually listening to.
	 */
	private measure(station: ShowShuffle | null): void {
		if (!browser || !station) return;
		const showId = station.showId;
		void Promise.all(station.tracks.map((track) => this.probe(track.file))).then(() => {
			// The dial may have moved while the probes were out; that station's own
			// measure() will tune when it is ready.
			if (this.station()?.showId !== showId) return;
			this.tune();
			// The first station that can be placed is where a remembered "on" is acted
			// on: turning it back on before that would put the listener into the
			// fallback's first song and then jump them out of it a second later.
			this.resume();
			return Promise.all(
				this.stations
					.filter((other) => other.showId !== showId)
					.flatMap((other) => other.tracks.map((track) => this.probe(track.file)))
			);
		});
	}

	/**
	 * How long one song is, asked of an audio element that loads metadata and nothing
	 * else. Kept for as long as the page is open: a song is not a different length
	 * tomorrow. Resolves either way — a file that will not answer is one the station
	 * cannot be placed against, not an error anybody can act on.
	 */
	private probe(file: string): Promise<void> {
		const asked = this.probes.get(file);
		if (asked) return asked;

		const answer = new Promise<void>((resolve) => {
			const probe = new Audio();
			probe.preload = 'metadata';
			probe.addEventListener('loadedmetadata', () => {
				this.durations.set(file, probe.duration);
				resolve();
			});
			probe.addEventListener('error', () => resolve());
			probe.src = musicTrackSrc(file);
		});
		this.probes.set(file, answer);
		return answer;
	}

	/**
	 * `play()` and what to do when it is refused. A rejected play is the browser's
	 * autoplay policy or a file that would not decode; either way nothing is running,
	 * and the element's own `pause` event has not fired, so the flag is set here — and
	 * the radio is not left thinking it is on when it is not.
	 */
	private async start(audio: HTMLAudioElement): Promise<void> {
		try {
			await audio.play();
		} catch {
			this.wanted = false;
			this.stateStore.update((state) => ({ ...state, playing: false }));
		}
	}

	/**
	 * The audio element, built on first use with the song that is on air. Null on the
	 * server and before there is anything to play, which is what makes every method
	 * above safe to call from anywhere.
	 */
	private element(): HTMLAudioElement | null {
		if (!browser) return null;
		if (this.audio) return this.audio;
		const track = this.station()?.tracks[this.index];
		if (!track) return null;

		this.loadedFile = track.file;
		this.audio = this.deck(track.file);
		return this.audio;
	}

	/**
	 * One element carrying one song. There is a second of these only for as long as a
	 * crossfade lasts (see {@link crossfade}); the rest of the time the radio is this one
	 * element, moved from song to song.
	 *
	 * `playing` is kept from the element's own events rather than from the call that
	 * asked, so anything that stops it without going through this service — the OS
	 * media keys, the tab being suspended — is still reflected in what the button
	 * shows. A song that runs out is not the end of anything: the station is asked
	 * again, and the answer is the next song at the top of it.
	 *
	 * All three listeners speak only while this element *is* the radio's. An element on
	 * its way out of a fade is still playing and will still be stopped, and neither of
	 * those is a statement about the radio: it is the station nobody is listening to any
	 * more, and the button must go on describing the one they are.
	 */
	private deck(file: string): HTMLAudioElement {
		const audio = new Audio(musicTrackSrc(file));
		audio.preload = 'metadata';
		audio.addEventListener('play', () => {
			if (this.audio === audio) this.stateStore.update((state) => ({ ...state, playing: true }));
		});
		audio.addEventListener('pause', () => {
			if (this.audio === audio) this.stateStore.update((state) => ({ ...state, playing: false }));
		});
		audio.addEventListener('ended', () => {
			if (this.audio === audio) this.tune(true);
		});
		return audio;
	}
}

export const musicService = new MusicService();
