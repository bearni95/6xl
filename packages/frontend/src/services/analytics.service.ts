import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * The key the visit counter looks for, spelled the way *it* spells it.
 *
 * This is the one localStorage key in the game that is not ours to name. Every other
 * one goes through the service classes and comes out namespaced (`array-service:`,
 * `object-service:`); this one has to be the literal string the Umami script reads,
 * because the whole point of writing it is that a program we did not write finds it.
 */
const DISABLED_KEY = 'umami.disabled';

/**
 * What it writes there.
 *
 * The script's test is truthiness — `y?.getItem("umami.disabled")` short-circuits its
 * whole send — so any non-empty string would do. `'1'` is the spelling Umami's own
 * documentation uses, and matching it means a reader who set the key by hand before
 * this switch existed, or who reads about it anywhere else, finds the switch already
 * flipped rather than a second mechanism disagreeing with the first.
 */
const DISABLED_VALUE = '1';

/**
 * The visit counter's off switch, and the reason it is a switch at all.
 *
 * The game counts visits with Umami, self-hosted at umami.bearni.io, on the legitimate
 * interest of knowing whether anybody opens it (GDPR art. 6(1)(f); see the privacy
 * notice, §3). An interest is not a permission slip: art. 21 gives every reader the
 * right to object to processing done on that basis, and a right that can only be
 * exercised by writing an email — or, as it stood, by typing a key into a devtools
 * console — is a right most people will never exercise. So it is a control on screen,
 * on the storage note that explains the counter and on the settings sheet.
 *
 * **It is reachable signed out**, which is why the switch is not only on the settings
 * sheet: the counter counts every visitor, and an opt-out that first asks you to open
 * an account would be worse than none. The storage note is on the same full-view sheet
 * anybody can raise from the menu, and the switch sits under it there.
 *
 * **Nothing here is a consent record.** Counting does not run on consent, so the state
 * this holds is an objection, not a permission, and its absence is not somebody having
 * agreed to anything. That is also why it is not in the acceptance ledger and not on
 * the server at all: an objection to being counted that had to be stored against an
 * account would need the account to be identified to be honoured, which is the thing
 * being objected to. It lives in the browser it applies to and nowhere else.
 *
 * **What it costs the reader to switch off is nothing**, and what it costs the counter
 * is immediate: the script re-reads the key before *every* send, not once at load, so
 * a flip takes effect on the next pageview without a reload — and the page the switch
 * is on has already been counted either way.
 */
class AnalyticsService {
	/** Whether visits from this browser are being counted. */
	private countedStore = writable(true);
	/** Whether the switch can be operated at all — see {@link operable}. */
	private operableStore = writable(false);
	private initialised = false;

	constructor() {
		this.init();
	}

	/** Whether visits from this browser are counted right now. */
	get counted(): Readable<boolean> {
		return this.countedStore;
	}

	/**
	 * Whether the switch does anything.
	 *
	 * A browser that refuses localStorage — private windows on some engines, storage
	 * blocked outright — is one where Umami's own read of the key throws and it counts
	 * regardless, and where nothing we write would survive to stop it. There is no
	 * honest switch to draw in that case, so the surfaces say so instead of offering a
	 * control that silently does nothing.
	 */
	get operable(): Readable<boolean> {
		return this.operableStore;
	}

	/** Read the browser's current answer. Safe to call more than once. */
	init(): void {
		if (this.initialised || !browser) return;
		this.initialised = true;
		const storage = this.storage();
		this.operableStore.set(storage !== null);
		this.countedStore.set(!this.readDisabled(storage));
	}

	/**
	 * Count this browser's visits, or stop counting them.
	 *
	 * Writing the key is the "off" and removing it is the "on" — rather than writing a
	 * falsy value for "on" — because the tracker tests the key's truthiness and not its
	 * contents, and because an opt-out that leaves nothing behind when it is switched
	 * back off is one less thing stored on somebody's machine.
	 */
	setCounted(counted: boolean): void {
		const storage = this.storage();
		if (!storage) return;
		try {
			if (counted) storage.removeItem(DISABLED_KEY);
			else storage.setItem(DISABLED_KEY, DISABLED_VALUE);
		} catch {
			// Storage that reads but will not write (a full quota, a locked-down profile).
			// Re-read rather than assume: the store must say what the browser will
			// actually do on the next pageview, not what was asked for.
			this.countedStore.set(!this.readDisabled(storage));
			return;
		}
		this.countedStore.set(counted);
	}

	/** localStorage if this browser will hand it over, null if it will not. */
	private storage(): Storage | null {
		if (!browser) return null;
		try {
			// Reading the property is itself what throws when storage is blocked, so the
			// access has to be inside the try — as it is in the tracker's own script.
			return window.localStorage;
		} catch {
			return null;
		}
	}

	/** Whether the key is set to something the tracker would take as "stay quiet". */
	private readDisabled(storage: Storage | null): boolean {
		if (!storage) return false;
		try {
			return !!storage.getItem(DISABLED_KEY);
		} catch {
			return false;
		}
	}
}

export const analyticsService = new AnalyticsService();

export { DISABLED_KEY as ANALYTICS_DISABLED_KEY, DISABLED_VALUE as ANALYTICS_DISABLED_VALUE };
