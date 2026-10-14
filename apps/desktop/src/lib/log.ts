// Desktop-local, like terminal IO: the log file is this machine's.
import { invoke } from '@tauri-apps/api/core';

type Level = 'error' | 'warn' | 'info';

function describe(detail: unknown): string {
	if (detail instanceof Error) return detail.message;
	if (typeof detail === 'string') return detail;
	try {
		return JSON.stringify(detail) ?? String(detail);
	} catch {
		return String(detail);
	}
}

function write(level: Level, target: string, message: string, detail?: unknown): void {
	const line = `[${target}] ${message}`;
	if (detail === undefined) console[level](line);
	else console[level](line, detail);
	if (import.meta.env.MODE === 'test') return;
	const text = detail === undefined ? message : `${message} ${describe(detail)}`;
	invoke('log_frontend', { level, target, message: text }).catch(() => {});
}

/**
 * The webview's log: the devtools console, and `workbench.log` through the
 * `log_frontend` command (capped and rate-limited there). Never pass tokens, URLs or prompt text.
 */
export const log = {
	error: (target: string, message: string, detail?: unknown) =>
		write('error', target, message, detail),
	warn: (target: string, message: string, detail?: unknown) =>
		write('warn', target, message, detail),
	info: (target: string, message: string, detail?: unknown) =>
		write('info', target, message, detail)
};
