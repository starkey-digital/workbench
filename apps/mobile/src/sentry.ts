import * as Sentry from '@sentry/svelte';
import { initSentry as init } from '@workbench/telemetry';

/** Error tracking for release builds; a no-op in dev, tests, or with an empty `VITE_SENTRY_DSN`. */
export function initSentry(): void {
	init({
		enabled: import.meta.env.PROD && import.meta.env.MODE !== 'test',
		release: `workbench-mobile@${__APP_VERSION__}`,
		dsn: import.meta.env.VITE_SENTRY_DSN,
		// Request URLs carry server addresses and tokens.
		integrations: [Sentry.breadcrumbsIntegration({ fetch: false, xhr: false })]
	});
}
