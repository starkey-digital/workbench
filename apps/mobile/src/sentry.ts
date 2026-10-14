import * as Sentry from '@sentry/svelte';
import type { ChatDiagnostic } from '@workbench/chat-ui';

// The desktop's public ingest DSN (write-only key); releases tell the apps apart.
// Overridable via VITE_SENTRY_DSN at build time.
const DSN =
	import.meta.env.VITE_SENTRY_DSN ??
	'https://708b68ab317b3d17816c9f8135337d11@sentry.starkeydigital.com/20';

/** Error tracking for release builds; a no-op in dev, tests, or without a DSN. */
export function initSentry(): void {
	if (import.meta.env.MODE === 'test' || !import.meta.env.PROD || !DSN) return;
	Sentry.init({
		dsn: DSN,
		release: `workbench-mobile@${__APP_VERSION__}`,
		environment: 'production',
		tracesSampleRate: 0,
		// Request URLs and console lines can carry server addresses and pairing links.
		// Sentry 11 records console lines in its own `Console` integration.
		integrations: (defaults) => [
			...defaults.filter((i) => i.name !== 'Console'),
			Sentry.breadcrumbsIntegration({ fetch: false, xhr: false })
		]
	});
}

/** A chat's drift from the server or unreadable frame: a warning, its event trace attached. */
export function captureChatDiagnostic(d: ChatDiagnostic): void {
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
