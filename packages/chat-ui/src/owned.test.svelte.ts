// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { owned } from './owned.svelte.ts';

class Counter {
	count = $state(0);
	double = $derived(this.count * 2);
}

describe('owned', () => {
	it('keeps deriveds live after the component that made it is gone', () => {
		let counter!: Counter;
		const unmount = $effect.root(() => {
			[counter] = owned(() => new Counter());
		});
		unmount();
		counter.count = 2;
		flushSync();
		expect(counter.double).toBe(4);
	});

	it('stops its effects on destroy', () => {
		let runs = 0;
		const [counter, destroy] = owned(() => {
			const c = new Counter();
			$effect(() => {
				void c.count;
				runs++;
			});
			return c;
		});
		flushSync();
		counter.count = 1;
		flushSync();
		expect(runs).toBe(2);
		destroy();
		counter.count = 2;
		flushSync();
		expect(runs).toBe(2);
	});

	it('rethrows what making it threw', () => {
		expect(() =>
			owned(() => {
				throw new Error('nope');
			})
		).toThrow('nope');
	});
});
