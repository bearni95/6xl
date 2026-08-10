import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

/**
 * The visit counter's off switch.
 *
 * What is worth holding here is not the store — it is the *contract with a program we
 * did not write*. Umami reads one literal key, tests it for truthiness, and does so
 * before every send. Every assertion below is about one of those three facts, because
 * each of them is something a well-meaning refactor could break without any test that
 * only knew about the store ever noticing: namespacing the key the way every other
 * service key is namespaced, writing `'false'` for "off" (a truthy string, which would
 * silence the counter while the switch read as on), or caching the answer.
 */

/** The literal string the tracker looks for. Spelled out rather than imported, so a
 * change to the constant has to disagree with this file to land. */
const KEY = 'umami.disabled';

/** A service over whatever localStorage currently says, built fresh each time. */
async function freshService() {
	vi.resetModules();
	const module = await import('$services/analytics.service');
	return module.analyticsService;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('analyticsService', () => {
	it('counts by default, because nothing has been asked of it', async () => {
		const service = await freshService();
		expect(get(service.counted)).toBe(true);
		expect(get(service.operable)).toBe(true);
		// Counting stores nothing: an untouched browser must come away with no key.
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('reads the browser it woke up in', async () => {
		localStorage.setItem(KEY, '1');
		const service = await freshService();
		expect(get(service.counted)).toBe(false);
	});

	it('takes any truthy value as off, the way the tracker does', async () => {
		// Somebody who set the key by hand, or by another site's instructions, gets the
		// switch they already flipped — not a second mechanism disagreeing with it.
		localStorage.setItem(KEY, 'true');
		const service = await freshService();
		expect(get(service.counted)).toBe(false);
	});

	it('writes the key the tracker reads, under the name it reads it by', async () => {
		const service = await freshService();
		service.setCounted(false);
		expect(localStorage.getItem(KEY)).toBe('1');
		expect(get(service.counted)).toBe(false);
	});

	it('removes the key rather than writing a falsy one', async () => {
		localStorage.setItem(KEY, '1');
		const service = await freshService();
		service.setCounted(true);
		// The tracker tests truthiness, so `'false'` here would silence it forever while
		// the switch said it was counting. Nothing left behind is the only safe "on".
		expect(localStorage.getItem(KEY)).toBeNull();
		expect(get(service.counted)).toBe(true);
	});

	it('survives the round trip', async () => {
		const first = await freshService();
		first.setCounted(false);
		const second = await freshService();
		expect(get(second.counted)).toBe(false);
		second.setCounted(true);
		const third = await freshService();
		expect(get(third.counted)).toBe(true);
	});

	it('tells the truth when the browser refuses the write', async () => {
		const service = await freshService();
		vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		service.setCounted(false);
		// The switch must say what the next pageview will actually do, not what was
		// asked for: the key never landed, so the counter is still counting.
		expect(get(service.counted)).toBe(true);
	});

	it('does not throw when storage will not answer at all', async () => {
		const service = await freshService();
		vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => service.setCounted(true)).not.toThrow();
	});
});
