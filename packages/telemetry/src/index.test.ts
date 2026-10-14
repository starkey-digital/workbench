import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = { setTags: vi.fn(), setTag: vi.fn(), setContext: vi.fn(), addAttachment: vi.fn() };
vi.mock('@sentry/svelte', () => ({
	init: vi.fn(),
	addBreadcrumb: vi.fn(),
	captureMessage: vi.fn(),
	captureException: vi.fn(),
	withScope: (fn: (s: typeof scope) => void) => fn(scope)
}));

const Sentry = await import('@sentry/svelte');
const telemetry = await import('./index');

const report = {
	type: 'drift',
	agent: 'claude',
	reason: 'show',
	mismatched: ['busy'],
	fields: { busyLocal: true, busyServer: false },
	trace: [{ at: 1, kind: 'snapshot', items: 3 }]
};

describe('telemetry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		telemetry.setExtendedDiagnostics(false);
	});

	it('initialises only when enabled with a DSN', () => {
		telemetry.initSentry({ enabled: false, release: 'workbench@1' });
		telemetry.initSentry({ enabled: true, release: 'workbench@1', dsn: '' });
		expect(Sentry.init).not.toHaveBeenCalled();
		telemetry.initSentry({ enabled: true, release: 'workbench@1' });
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({ release: 'workbench@1', tracesSampleRate: 0 })
		);
	});

	it('records breadcrumbs only with extended diagnostics', () => {
		telemetry.chatBreadcrumb('codex', { at: 5, kind: 'close', code: 1006 });
		expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
		telemetry.setExtendedDiagnostics(true);
		telemetry.chatBreadcrumb('codex', { at: 5, kind: 'close', code: 1006 });
		expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
			category: 'chat.ws',
			message: 'close',
			level: 'info',
			data: { agent: 'codex', code: 1006 }
		});
	});

	it('reports drift either way, with its trace only when extended', () => {
		telemetry.captureChatDiagnostic(report);
		expect(Sentry.captureMessage).toHaveBeenCalledWith('chat.drift', 'warning');
		expect(scope.setTags).toHaveBeenCalledWith({
			agent: 'claude',
			reason: 'show',
			mismatched: 'busy'
		});
		expect(scope.addAttachment).not.toHaveBeenCalled();
		telemetry.setExtendedDiagnostics(true);
		telemetry.captureChatDiagnostic(report);
		expect(scope.addAttachment).toHaveBeenCalledWith(
			expect.objectContaining({ filename: 'chat-trace.json' })
		);
	});

	it('tags a view error with its view', () => {
		const error = new Error('boom');
		telemetry.captureViewError('chat', error, report.trace);
		expect(scope.setTag).toHaveBeenCalledWith('view', 'chat');
		expect(Sentry.captureException).toHaveBeenCalledWith(error);
		expect(scope.addAttachment).not.toHaveBeenCalled();
	});
});
