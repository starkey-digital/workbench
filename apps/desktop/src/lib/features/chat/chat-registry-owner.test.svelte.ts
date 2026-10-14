import type { TranscriptMeta } from '$types/workbench';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./agent-api', () => ({
	loopbackAgentApi: { base: () => ({ baseUrl: 'http://127.0.0.1:1', token: 't' }) }
}));
vi.stubGlobal(
	'WebSocket',
	class {
		static OPEN = 1;
		readyState = 0;
		close() {}
		send() {}
	}
);

const { acquireChat, releaseChat } = await import('./chat-registry.svelte');

const meta = (busy: boolean): TranscriptMeta => ({
	title: null,
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

describe('chat registry ownership', () => {
	afterEach(() => releaseChat('p1'));

	it("keeps a chat's derived state live after the view that created it is gone", () => {
		let chat!: ReturnType<typeof acquireChat>['chat'];
		// Stands in for the first `SessionChat`, unmounted on a tab switch.
		const unmount = $effect.root(() => {
			chat = acquireChat('p1', { projectPath: '/repo', sessionId: 's1', paneId: 'p1' }).chat;
		});
		chat.meta = meta(true);
		flushSync();
		expect(chat.now.kind).toBe('thinking');
		unmount();

		chat.meta = meta(false);
		flushSync();
		expect(chat.now.kind).toBe('idle');
	});
});
