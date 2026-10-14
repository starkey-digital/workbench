/**
 * Make a value under its own reactive root, for state that outlives the
 * component that first asks for it: a `$derived` belongs to the effect active
 * when it's created, and once that effect is destroyed it stops updating.
 * Call `destroy` when the value is let go of. A throw from `make` is rethrown.
 */
export function owned<T>(make: () => T): [value: T, destroy: () => void] {
	let value!: T;
	let failed = false;
	let error: unknown;
	const destroy = $effect.root(() => {
		try {
			value = make();
		} catch (e) {
			failed = true;
			error = e;
		}
	});
	if (failed) {
		destroy();
		throw error;
	}
	return [value, destroy];
}
