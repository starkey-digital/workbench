import * as Sentry from '@sentry/svelte';
import type { ChatDiagnostic } from '@workbench/chat-ui';

// Public ingest DSN (write-only key). Overridable via VITE_SENTRY_DSN at build time.
const DSN =
	import.meta.env.VITE_SENTRY_DSN ??
	'https://708b68ab317b3d17816c9f8135337d11@sentry.starkeydigital.com/20';

/**
 * Initialise Sentry error tracking.
 *
 * Only runs in production builds (`tauri build`). During `tauri dev`
 * (`import.meta.env.DEV`), under the test runner (`MODE === 'test'`), or
 * without a DSN this is a no-op, so local development and tests never report
 * errors upstream.
 */
export function initSentry(): void {
	if (import.meta.env.MODE === 'test') return;
	if (!import.meta.env.PROD) return;
	if (!DSN) return;

	Sentry.init({
		dsn: DSN,
		release: `workbench@${__APP_VERSION__}`,
		environment: 'production',
		// Errors only — no performance/session tracing for a desktop app.
		tracesSampleRate: 0
	});
}

/** A chat's drift from the server or unreadable frame: a warning, its event trace attached. */
export function captureChatDiagnostic(d: ChatDiagnostic): void {
	if (import.meta.env.DEV) console.warn(`[chat] ${d.type}`, d.fields);
	Sentry.withScope((scope) => {
		scope.setTags({
			agent: d.agent,
			reason: d.reason ?? 'none',
			mismatched: d.mismatched.join(',') || 'none'
		});
		scope.setContext('chat', d.fields);
		scope.addAttachment({
			filename: 'chat-trace.json',
			data: JSON.stringify(d.trace),
			contentType: 'application/json'
		});
		Sentry.captureMessage(`chat.${d.type}`, 'warning');
	});
}
