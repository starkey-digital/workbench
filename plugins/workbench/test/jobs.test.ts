import { expect, test } from 'bun:test';
import { ENDED_KEPT, notifiedJobs, startJob } from '../hooks/jobs';

const note = (id: string, status: string) =>
	`<task-notification><task-id>${id}</task-id><status>${status}</status></task-notification>`;
const notifiedJob = (text: string, tracked?: (id: string) => boolean) =>
	notifiedJobs(text, tracked)[0];

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

test('a batched delivery ends every job it names', () => {
	expect(startJob('b3')).toBe(true);
	expect(startJob('b4')).toBe(true);
	expect(notifiedJobs(`${note('b3', 'completed')}\n${note('b4', 'failed')}`)).toMatchObject([
		{ task_id: 'b3', status: 'completed' },
		{ task_id: 'b4', status: 'failed' }
	]);
});

test('ended jobs are forgotten oldest first, running ones never', () => {
	expect(startJob('keep')).toBe(true);
	for (let i = 0; i <= ENDED_KEPT; i++) notifiedJob(note(`old${i}`, 'completed'));
	// The oldest ended job was forgotten, so its report is said again.
	expect(notifiedJob(note('old0', 'completed'))).toBeDefined();
	expect(notifiedJob(note('old5', 'completed'))).toBeUndefined();
	expect(startJob('keep')).toBe(false);
});
