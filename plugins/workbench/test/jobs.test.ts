import { expect, test } from 'bun:test';
import { ENDED_KEPT, notifiedJob, startJob } from '../hooks/jobs';

const note = (id: string, status: string) =>
	`<task-notification><task-id>${id}</task-id><status>${status}</status></task-notification>`;

test('a job started before a plugin reload still reports how it ended', () => {
	// This load never saw `startJob('b1')`: the job ran before the reload.
	expect(notifiedJob(note('b1', 'completed'))).toMatchObject({
		subtype: 'task_notification',
		task_id: 'b1',
		status: 'completed'
	});
	// Said once.
	expect(notifiedJob(note('b1', 'completed'))).toBeUndefined();
});

test('a subagent this load tracks ends its own task, not by its notification', () => {
	expect(notifiedJob(note('a1', 'completed'), (id) => id === 'a1')).toBeUndefined();
});

test("a known job's notification reports its outcome", () => {
	expect(startJob('b2')).toBe(true);
	expect(notifiedJob(note('b2', 'killed'))).toMatchObject({ task_id: 'b2', status: 'stopped' });
});

test('ended jobs are forgotten oldest first, running ones never', () => {
	expect(startJob('keep')).toBe(true);
	for (let i = 0; i <= ENDED_KEPT; i++) notifiedJob(note(`old${i}`, 'completed'));
	// The oldest ended job was forgotten, so its report is said again.
	expect(notifiedJob(note('old0', 'completed'))).toBeDefined();
	expect(notifiedJob(note('old5', 'completed'))).toBeUndefined();
	expect(startJob('keep')).toBe(false);
});
