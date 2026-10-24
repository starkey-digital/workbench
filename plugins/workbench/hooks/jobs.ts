import { taskNotification, taskStatus, type Line } from './lines';

// Background jobs (`run_in_background` Bash) in the tasks panel, by id, with
// the status last reported. A job's own notification says how it ended; the
// Stop hook's job list is the fallback when no notification names it.

const jobs = new Map<string, string>();
// Ended jobs are kept only so a repeated report is said once: the oldest go.
export const ENDED_KEPT = 200;

function prune() {
	let ended = [...jobs.values()].filter((status) => status !== 'running').length;
	for (const [id, status] of jobs) {
		if (ended <= ENDED_KEPT) return;
		if (status !== 'running') {
			jobs.delete(id);
			ended--;
		}
	}
}

/** A job just went to the background; false if it was reported already. */
export function startJob(id: string): boolean {
	if (jobs.has(id)) return false;
	jobs.set(id, 'running');
	return true;
}

function report(id: string, status: string, summary?: string): Line | undefined {
	if (jobs.get(id) === status) return undefined;
	jobs.set(id, status);
	if (status === 'running') return undefined;
	prune();
	return {
		type: 'system',
		subtype: 'task_notification',
		task_id: id,
		status,
		...(summary ? { summary } : {}),
		uuid: `wbmod-bg-done-${id}`
	};
}

/**
 * A `task-notification` delivery: the real outcome (completed, failed, killed)
 * of each task it names (one delivery can batch several). Sent for any task,
 * even one this load didn't start: a plugin reload forgets its jobs. `tracked`
 * names the subagents whose task this load ends itself, so their notification
 * can't override that (a chat's Stop).
 */
export function notifiedJobs(text: string, tracked: (id: string) => boolean = () => false): Line[] {
	return text
		.split('<task-notification>')
		.slice(1)
		.map((block) => taskNotification(block))
		.map((note) =>
			note && !tracked(note.id) ? report(note.id, note.status, note.summary) : undefined
		)
		.filter((line): line is Line => line !== undefined);
}

/**
 * The Stop hook's job list. A running job missing from it has ended; it's
 * called completed until its notification (if one comes) says otherwise.
 */
export function stoppedJobs(tasks: readonly { id: string; status: string }[]): Line[] {
	const live = new Map(tasks.map((t) => [t.id, t.status]));
	return [...jobs]
		.filter(([, status]) => status === 'running')
		.map(([id]) => report(id, taskStatus(live.get(id) ?? 'completed')))
		.filter((line): line is Line => line !== undefined);
}
