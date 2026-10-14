import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptItem, TranscriptMeta } from '@workbench/types';
import type { AgentApi } from './agent-api';
import { AgentChat } from './agent-chat.svelte';
import { STALE_BUSY_MS, type ChatDiagnostic } from './chat-diagnostics';

class FakeSocket {
	static OPEN = 1;
	static all: FakeSocket[] = [];
	readyState = FakeSocket.OPEN;
	sent: Record<string, unknown>[] = [];
	onmessage: ((e: { data: string }) => void) | null = null;
	onclose: ((e?: { code?: number }) => void) | null = null;
	constructor(readonly url: string) {
		FakeSocket.all.push(this);
	}
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		this.readyState = 3;
	}
	emit(msg: unknown) {
		this.onmessage?.({ data: JSON.stringify(msg) });
	}
	raw(data: string) {
		this.onmessage?.({ data });
	}
}

const meta = (busy = false): TranscriptMeta => ({
	title: 'Secret project title',
	model: null,
	permissionMode: 'default',
	contextTokens: null,
	busy,
	tasks: [],
	retry: null,
	rateLimit: null,
	models: [],
	modelChoice: null,
	effort: null
});

const user: TranscriptItem = { kind: 'user', id: 'u1', text: 'my secret prompt', timestamp: '' };
const reply: TranscriptItem = { kind: 'text', id: 'a1', text: 'an answer' };

const snapshot = (busy: boolean, items: TranscriptItem[] = [user]) => ({
	t: 'snapshot',
	sessionId: 'sid',
	start: 0,
	items,
	meta: meta(busy),
	commands: [],
	exited: false,
	resync: true
});

const api: AgentApi = { socketUrl: async (id) => `ws://test/agent/claude/${id}/ws?token=secret` };

async function connected(busy = true) {
	const report = vi.fn<(d: ChatDiagnostic) => void>();
	const chat = new AgentChat({ projectPath: '/repo', sessionId: 'sid' }, api, { report });
	await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
	const ws = FakeSocket.all[0];
	ws.emit(snapshot(busy));
	return { chat, ws, report };
}

describe('AgentChat diagnostics', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('WebSocket', FakeSocket);
		FakeSocket.all = [];
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('resyncs a busy chat that heard nothing for a minute, and reports the drift', async () => {
		const { chat, ws, report } = await connected();
		vi.advanceTimersByTime(STALE_BUSY_MS - 1);
		expect(ws.sent).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
		// The turn had ended: the lost meta is caught and put right.
		ws.emit(snapshot(false, [user, reply]));
		expect(chat.meta?.busy).toBe(false);
		expect(report).toHaveBeenCalledOnce();
		const d = report.mock.calls[0][0];
		expect(d).toMatchObject({ type: 'drift', reason: 'stale', mismatched: ['busy', 'end'] });
		expect(d.fields).toMatchObject({
			busyLocal: true,
			busyServer: false,
			endLocal: 1,
			endServer: 2
		});
		expect(d.trace.map((e) => e.kind)).toContain('stale');
	});

	it('keeps probing while a turn stays quiet, but not once it is idle', async () => {
		const { ws } = await connected();
		vi.advanceTimersByTime(STALE_BUSY_MS / 2);
		ws.emit({ t: 'update', changes: [[1, reply]] });
		vi.advanceTimersByTime(STALE_BUSY_MS / 2);
		expect(ws.sent).toEqual([]); // a frame came within the minute
		vi.advanceTimersByTime(STALE_BUSY_MS);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
		ws.emit(snapshot(false, [user, reply]));
		vi.advanceTimersByTime(STALE_BUSY_MS * 3);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
	});

	it('reports nothing when the snapshot agrees', async () => {
		const { chat, ws, report } = await connected(false);
		vi.advanceTimersByTime(10_000);
		chat.resync();
		ws.emit(snapshot(false));
		expect(report).not.toHaveBeenCalled();
	});

	it('resyncs on an update whose index disagrees with the chat', async () => {
		const { chat, ws } = await connected(false);
		vi.advanceTimersByTime(10_000);
		ws.emit({ t: 'update', changes: [[4, reply]] });
		expect(chat.items.map((i) => i.id)).toEqual(['u1', 'a1']);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
	});

	it('reports an unreadable frame by its class only, and resyncs', async () => {
		const { ws, report } = await connected(false);
		vi.advanceTimersByTime(10_000);
		ws.raw('{"t":"snapshot", "secret');
		expect(report).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'frame-error',
				fields: { typeError: false, syntaxError: true }
			})
		);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
	});

	it('Resync now skips the throttle', async () => {
		const { chat, ws } = await connected(false);
		chat.resyncNow();
		expect(ws.sent).toEqual([{ t: 'resync' }]);
	});

	it('copies shape only: no prompt text, title, session id or URL', async () => {
		const { chat, ws } = await connected();
		chat.prompt('another secret');
		ws.emit({ t: 'update', changes: [[1, reply]], meta: meta(true) });
		const d = chat.diagnostics();
		expect(d).toMatchObject({ agent: 'claude', status: 'live', items: 2, pending: 1, busy: true });
		const json = JSON.stringify(d);
		for (const secret of ['secret', 'sid', 'ws://', 'an answer', 'u1'])
			expect(json).not.toContain(secret);
		expect(d.trace.map((e) => e.kind)).toEqual(['connect', 'snapshot', 'prompt', 'update']);
	});

	it('keeps the last 200 events', async () => {
		const { chat, ws } = await connected(false);
		for (let i = 0; i < 250; i++) ws.emit({ t: 'error', message: 'no' });
		const trace = chat.diagnostics().trace;
		expect(trace).toHaveLength(200);
		expect(trace.every((e) => e.kind === 'error')).toBe(true);
	});

	it('folds a run of updates into one entry until busy changes', async () => {
		const { chat, ws } = await connected(false);
		ws.emit({ t: 'update', changes: [[1, reply]], meta: meta(true) });
		for (let i = 0; i < 30; i++) ws.emit({ t: 'update', changes: [[1, reply]] });
		ws.emit({ t: 'update', changes: [], meta: meta(false) });
		const updates = chat.diagnostics().trace.filter((e) => e.kind === 'update');
		expect(updates).toMatchObject([
			{ frames: 31, changes: 31, busy: true },
			{ frames: 1, changes: 0, busy: false }
		]);
	});

	it('defers a misaligned resync the throttle holds back, rather than dropping it', async () => {
		const { ws } = await connected(false);
		ws.emit({ t: 'update', changes: [[4, reply]] });
		expect(ws.sent).toEqual([]);
		vi.advanceTimersByTime(5_000);
		expect(ws.sent).toEqual([{ t: 'resync' }]);
	});

	it('does not probe a turn that waits on the person', async () => {
		const { ws } = await connected();
		const ask = { kind: 'approval', id: 'r1', tool: 'Bash', input: {}, canAlwaysAllow: false };
		ws.emit({ t: 'update', changes: [[1, { ...ask, expired: false }]] });
		vi.advanceTimersByTime(STALE_BUSY_MS * 4);
		expect(ws.sent).toEqual([]);
	});

	it('clears a sent prompt’s timer when no turn came of it', async () => {
		const { chat, ws } = await connected(false);
		chat.prompt('/design-login');
		expect(chat.busySince).not.toBeNull();
		ws.emit({ t: 'update', changes: [[1, { kind: 'notice', id: 'n1', text: 'Not available' }]] });
		expect(chat.pending).toEqual([]);
		expect(chat.busySince).toBeNull();
	});
});
