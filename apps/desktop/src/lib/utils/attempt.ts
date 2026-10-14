import { toast } from 'svelte-sonner';

/**
 * Run a step that must not stop what follows it (a boot step, an event
 * handler): a failure is logged under `what` and shown, never thrown.
 */
export async function attempt<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
	try {
		return await run();
	} catch (e) {
		console.error(`[attempt] ${what} failed:`, e);
		toast.error(`Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`);
		return undefined;
	}
}
