/**
 * A queue that runs each task once the previous one settles, so tasks never
 * overlap and a failed one doesn't stop the rest.
 */
export function serial() {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => Promise<T>): Promise<T> => {
		const next = tail.catch(() => {}).then(task);
		tail = next;
		return next;
	};
}
