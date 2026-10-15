import { expect, test } from 'bun:test';
import { runInput, runResult } from '../hooks/run';

test('a call gives one trimmed command line and its reason', () => {
	expect(runInput({ command: '  stripe login ', reason: ' To deploy ' })).toEqual({
		command: 'stripe login',
		reason: 'To deploy'
	});
	expect(runInput({ command: 'gh auth login', reason: '' })).toEqual({ command: 'gh auth login' });
});

test('a missing, empty or multi-line command is refused with why', () => {
	expect(runInput(undefined)).toBe('No command given.');
	expect(runInput({ command: '  ' })).toBe('No command given.');
	expect(runInput({ command: 7 })).toBe('No command given.');
	expect(runInput({ command: 'cd x\nrm -rf y' })).toMatch(/one command line/);
});

test('Claude reads what the person did, or that no chat showed it', () => {
	expect(runResult('stripe login', { behavior: 'allow' })).toMatch(/ran `stripe login`.*done/);
	expect(runResult('stripe login', { behavior: 'deny' })).toMatch(/chose not to run/);
	expect(runResult('stripe login', null)).toMatch(/`! stripe login`/);
	expect(runResult('stripe login', null, true)).toMatch(/Stopped.*was not run/);
});
