import { expect, test } from 'bun:test';
import { askAnswer, asksInTerminalOnly, commandRowOutput, feedbackDraftLine } from '../hooks/lines';

test("where no classic hook reaches the mod, a person's ask shows as the terminal's", () => {
	for (const mode of ['default', 'acceptEdits', 'plan', 'bypassPermissions', undefined])
		expect(asksInTerminalOnly({ classicReached: false, approver: 'person', mode })).toBe(true);
});

test('PermissionRequest asks in chat where classic hooks reach the mod', () => {
	expect(asksInTerminalOnly({ classicReached: true, approver: 'person', mode: 'default' })).toBe(
		false
	);
});

test("auto mode's classifier, dontAsk, a host's callback or nobody answer it instead", () => {
	for (const mode of ['auto', 'dontAsk'])
		expect(asksInTerminalOnly({ classicReached: false, approver: 'person', mode })).toBe(false);
	for (const approver of ['host', undefined])
		expect(asksInTerminalOnly({ classicReached: false, approver, mode: 'default' })).toBe(false);
});

test('a queued feedback draft is pointed at the terminal, which alone reviews it', () => {
	expect(
		feedbackDraftLine({ title: ' Hooks skipped ' }, { success: true, message: 'queued' }, 'u1')
	).toEqual({
		type: 'system',
		subtype: 'local_command_output',
		content:
			'Claude drafted feedback about Claude Code: "Hooks skipped". Review and send it in the terminal with /feedback.',
		workbench_in_terminal: true,
		uuid: 'u1'
	});
	expect(feedbackDraftLine({}, { success: true }, 'u2')?.content).toBe(
		'Claude drafted feedback about Claude Code. Review and send it in the terminal with /feedback.'
	);
});

test('no draft written (feedback off, a failed write) says nothing', () => {
	expect(
		feedbackDraftLine({ title: 't' }, { success: false, message: 'off' }, 'u')
	).toBeUndefined();
	expect(feedbackDraftLine({ title: 't' }, undefined, 'u')).toBeUndefined();
});

test("a reply that isn't the server's answer throws, for the caller to fall back", () => {
	for (const text of ['<html>502</html>', '', 'null', '7', '[]']) {
		expect(() => askAnswer(text)).toThrow();
	}
});

test("a command's output row gives what it printed", () => {
	expect(
		commandRowOutput('<local-command-stdout>Goal set: tests pass</local-command-stdout>')
	).toBe('Goal set: tests pass');
	expect(commandRowOutput('<local-command-stderr>\nNo goal set\n</local-command-stderr>')).toBe(
		'No goal set'
	);
});

test('its name row, an empty output and mismatched tags give nothing', () => {
	expect(commandRowOutput('<command-name>/goal</command-name>')).toBeUndefined();
	expect(commandRowOutput('<local-command-stdout></local-command-stdout>')).toBeUndefined();
	expect(commandRowOutput('<local-command-stdout>x</local-command-stderr>')).toBeUndefined();
});
