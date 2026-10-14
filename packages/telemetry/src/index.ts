import * as Sentry from '@sentry/svelte';

/** Counts, flags and fixed labels only: never text, ids, titles, paths or URLs. */
export type Shape = Record<string, number | boolean | string | null>;

/** A chat-ui `ChatDiagnostic`, typed here by shape so this package needn't import chat-ui. */
export interface ChatReport {
	type: string;
	agent: string;
	reason?: string;
	mismatched: readonly string[];
	fields: Shape;
	trace: readonly Shape[];
}

// Public ingest DSN (write-only key), shared by both apps; releases tell them apart.
const DSN = 'https://708b68ab317b3d17816c9f8135337d11@sentry.starkeydigital.com/20';

let extended = false;

/**
 * Errors-only Sentry. Apps pass `enabled` from their build (release only, never
 * dev or tests), so local development never reports upstream.
 */
export function initSentry(opts: {
	enabled: boolean;
	release: string;
	/** A build-time override (`VITE_SENTRY_DSN`); empty disables reporting. */
	dsn?: string;
	/** Added to Sentry's defaults. */
	integrations?: ReturnType<typeof Sentry.breadcrumbsIntegration>[];
}): void {
	const dsn = opts.dsn ?? DSN;
	if (!opts.enabled || !dsn) return;
	Sentry.init({
		dsn,
		release: opts.release,
		environment: 'production',
		tracesSampleRate: 0,
		// Console lines carry error text with paths and addresses; logs keep them locally.
		integrations: (defaults) => [
			...defaults.filter((i) => i.name !== 'Console'),
			...(opts.integrations ?? [])
		]
	});
}

/** The opt-in `extendedDiagnostics` setting: breadcrumbs and traces ride along with errors. */
export function setExtendedDiagnostics(on: boolean): void {
	extended = on;
}

/** Recorded only with extended diagnostics on; sent only with a later error. */
export function breadcrumb(category: string, message: string, data?: Shape): void {
	if (extended) Sentry.addBreadcrumb({ category, message, level: 'info', data });
}

/** One of a chat's trace entries (socket and state events) as a breadcrumb. */
export function chatBreadcrumb(agent: string, entry: Shape): void {
	const { kind, at: _at, ...data } = entry;
	breadcrumb('chat.ws', String(kind), { agent, ...data });
}

function attachTrace(scope: Sentry.Scope, trace: readonly Shape[] | undefined): void {
	if (!extended || !trace) return;
	scope.addAttachment({
		filename: 'chat-trace.json',
		data: JSON.stringify(trace),
		contentType: 'application/json'
	});
}

/** A chat's drift from the server or an unreadable frame: a warning. */
export function captureChatDiagnostic(d: ChatReport): void {
	Sentry.withScope((scope) => {
		scope.setTags({
			agent: d.agent,
			reason: d.reason ?? 'none',
			mismatched: d.mismatched.join(',') || 'none'
		});
		scope.setContext('chat', d.fields);
		attachTrace(scope, d.trace);
		Sentry.captureMessage(`chat.${d.type}`, 'warning');
	});
}

/** A render error a view's boundary caught, tagged with the view. */
export function captureViewError(view: string, error: unknown, trace?: readonly Shape[]): void {
	Sentry.withScope((scope) => {
		scope.setTag('view', view);
		attachTrace(scope, trace);
		Sentry.captureException(error);
	});
}
