import { initSentry as init } from '@workbench/telemetry';

/**
 * Initialise Sentry error tracking. Only in production builds (`tauri build`):
 * `tauri dev`, the test runner and an empty `VITE_SENTRY_DSN` never report.
 */
export function initSentry(): void {
	init({
		enabled: import.meta.env.PROD && import.meta.env.MODE !== 'test',
		release: `workbench@${__APP_VERSION__}`,
		dsn: import.meta.env.VITE_SENTRY_DSN
	});
}
