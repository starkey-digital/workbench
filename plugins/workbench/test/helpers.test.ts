import { expect, test } from 'bun:test';
import { PendingAsks } from '../hooks/asks';
import { attachedFiles, effortFor, midTurn, raisesEffort, withAttachments } from '../hooks/lines';

test('identical calls asked in parallel are each found, oldest first', () => {
	const asks = new PendingAsks();
	const input = { command: 'ls' };
	asks.note('Bash', input, { id: 'a' });
	asks.note('Bash', { ...input }, { id: 'b' });
	expect(asks.take('Bash', input)?.id).toBe('a');
	expect(asks.take('Bash', input)?.id).toBe('b');
	expect(asks.take('Bash', input)).toBeUndefined();
});

test('a call settled without a dialog leaves the queue', () => {
	const asks = new PendingAsks();
	asks.note('Bash', {}, { id: 'a' });
	asks.note('Bash', {}, { id: 'b' });
	asks.drop('a');
	expect(asks.take('Bash', {})?.id).toBe('b');
	expect(asks.take('Bash', {})).toBeUndefined();
});

test('a call noted twice is pending once', () => {
	const asks = new PendingAsks();
	asks.note('Bash', {}, { id: 'a' });
	asks.note('Bash', {}, { id: 'a', reason: 'later' });
	expect(asks.take('Bash', {})).toEqual({ id: 'a', reason: 'later' });
	expect(asks.take('Bash', {})).toBeUndefined();
});

test('only the newest pending calls are kept', () => {
	const asks = new PendingAsks();
	for (let i = 0; i < 60; i++) asks.note('Bash', { i }, { id: `c${i}` });
	expect(asks.take('Bash', { i: 0 })).toBeUndefined();
	expect(asks.take('Bash', { i: 9 })).toBeUndefined();
	expect(asks.take('Bash', { i: 10 })?.id).toBe('c10');
	expect(asks.take('Bash', { i: 59 })?.id).toBe('c59');
});

test('only the files the server attached are listed', () => {
	const text = 'use @workbench/ui like @Component does\n\n@/tmp/a.png';
	expect(withAttachments(text, ['/tmp/a.png'])).toBe(
		`${text}\n\nAttached files (read each with the Read tool):\n- /tmp/a.png`
	);
	expect(withAttachments('see @workbench/ui', [])).toBe('see @workbench/ui');
	expect(midTurn('hi @scope/pkg', [])).not.toContain('Attached files');
});

test('without a list from the server every mention counts, as before', () => {
	expect(withAttachments('look @/tmp/a.png and @"/tmp/b c.txt"')).toBe(
		'look @/tmp/a.png and @"/tmp/b c.txt"\n\nAttached files (read each with the Read tool):\n- /tmp/a.png\n- /tmp/b c.txt'
	);
});

test("a prompt line's attachments", () => {
	expect(attachedFiles({ type: 'user' })).toBeUndefined();
	expect(attachedFiles({ type: 'user', workbench_attachments: ['/a', 3, ''] })).toEqual(['/a']);
});

test('ultrathink raises a turn only as a word, not quoted or in a path', () => {
	expect(raisesEffort('ultrathink about the cache')).toBe(true);
	expect(raisesEffort('please Ultrathink.')).toBe(true);
	expect(raisesEffort('(ultrathink) then fix it')).toBe(true);
	expect(raisesEffort('what does "ultrathink" do')).toBe(false);
	expect(raisesEffort('read docs/ultrathink.md')).toBe(false);
	expect(raisesEffort('ultrathinking')).toBe(false);
});

test("the chat's effort pick survives an ultrathink turn but gives way to a TUI pick", () => {
	// First request: the pick applies; the engine's own level is the base.
	let r = effortFor<string>('low', 'medium', undefined, false);
	expect(r).toEqual({ sent: 'low', base: { value: 'medium' }, cleared: false });
	// An ultrathink turn: the engine raised it, so it runs raised and the pick stays.
	r = effortFor('low', 'xhigh', r.base, true);
	expect(r).toEqual({ sent: 'xhigh', base: { value: 'medium' }, cleared: false });
	// The next turn is back to the pick.
	r = effortFor('low', 'medium', r.base, false);
	expect(r.sent).toBe('low');
	// A pick in the TUI (or an admin cap) moves the engine off its base: the pick goes.
	r = effortFor('low', 'high', r.base, false);
	expect(r).toEqual({ sent: 'high', base: undefined, cleared: true });
	// No chat pick: the engine's level, untouched.
	expect(effortFor<string>(undefined, 'high', undefined, true).sent).toBe('high');
});
