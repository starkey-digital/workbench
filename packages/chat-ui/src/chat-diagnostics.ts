import type { AgentKind, AgentServerMsg, TranscriptItem, TranscriptMeta } from '@workbench/types';
import { awaitsAnswer } from './chat-format';

/**
 * One event in a chat's trace. Shape only: `kind` is a fixed label from this
 * package, values are counts and flags, never text, ids, titles or URLs.
 */
export interface TraceEntry {
	at: number;
	kind: string;
	[field: string]: number | boolean | string | null;
}

export type TraceData = Record<string, number | boolean | null>;

/** What a chat looked like on each side of a resync, compared field by field. */
export interface ChatShape {
	busy: boolean;
	/** Absolute index past the newest item. */
	end: number;
	waiting: number;
	unread: number;
}

export function chatShape(
	items: TranscriptItem[],
	start: number,
	meta: TranscriptMeta | null
): ChatShape {
	return {
		busy: !!meta?.busy,
		end: start + items.length,
		waiting: items.filter(awaitsAnswer).length,
		unread: meta?.unreadQueued?.length ?? 0
	};
}

interface Timing {
	msSinceLastFrame: number | null;
	msSinceLastMeta: number | null;
	framesSinceSnapshot: number;
}

/** What a chat tells its monitor for "Copy diagnostics". */
export interface ChatState extends ChatShape {
	status: string;
	canResync: boolean;
	start: number;
	items: number;
	historyItems: number;
	pending: number;
	busyForMs: number | null;
	tasks: number;
}

/** What "Copy diagnostics" copies: a chat's state and recent events, shape only. */
export interface ChatDiagnostics extends ChatState, Timing {
	agent: AgentKind;
	trace: TraceEntry[];
}

export type ResyncReason = 'show' | 'stale' | 'manual' | 'frame-error' | 'misaligned';

/** Something about a chat a host may want to report (Sentry); shape only. */
export interface ChatDiagnostic {
	type: 'drift' | 'frame-error';
	agent: AgentKind;
	/** What asked for the snapshot that showed the drift. */
	reason?: ResyncReason;
	/** Fields that disagreed with the server. */
	mismatched: (keyof ChatShape)[];
	fields: TraceData;
	trace: TraceEntry[];
}

const TRACE_SIZE = 200;
/** Busy with no frame this long, the chat asks for a fresh snapshot. */
export const STALE_BUSY_MS = 60_000;
/** Each probe that found the turn just quiet waits twice as long, up to this. */
const MAX_STALE_MS = 16 * 60_000;

/**
 * A chat's flight recorder: a ring of recent socket and state events, the
 * timing of the last frames, and the busy-but-silent probe.
 */
export class ChatMonitor {
	private ring: TraceEntry[] = [];
	private head = 0;
	lastFrameAt = 0;
	lastMetaAt = 0;
	framesSinceSnapshot = 0;
	private staleTimer: ReturnType<typeof setTimeout> | null = null;
	private staleMs = STALE_BUSY_MS;

	/** `onStale`: the chat was busy and silent; false stops the probe (it can't resync). */
	constructor(
		private readonly agent: AgentKind,
		private readonly onStale: () => boolean,
		private readonly report?: (d: ChatDiagnostic) => void
	) {}

	trace(kind: string, data: TraceData = {}): void {
		const entry: TraceEntry = { ...data, at: Date.now(), kind };
		if (this.ring.length < TRACE_SIZE) this.ring.push(entry);
		else this.ring[this.head] = entry;
		this.head = (this.head + 1) % TRACE_SIZE;
	}

	/** Oldest first. */
	entries(): TraceEntry[] {
		return [...this.ring.slice(this.head), ...this.ring.slice(0, this.head)];
	}

	/** Note a frame from the server, before it's applied. */
	received(msg: AgentServerMsg): void {
		const now = Date.now();
		this.lastFrameAt = now;
		if (msg.t === 'snapshot') {
			this.framesSinceSnapshot = 0;
			this.lastMetaAt = now;
			this.trace('snapshot', {
				items: msg.items.length,
				start: msg.start,
				busy: msg.meta.busy,
				exited: msg.exited
			});
			return;
		}
		this.framesSinceSnapshot++;
		if (msg.t === 'update') {
			this.staleMs = STALE_BUSY_MS;
			if (msg.meta) this.lastMetaAt = now;
			this.traceUpdate(msg.changes.length, msg.meta ? msg.meta.busy : null);
		} else if (['exit', 'replaced', 'revoked', 'error'].includes(msg.t)) this.trace(msg.t);
	}

	/**
	 * A streaming turn sends up to 20 updates a second: a run of them is one
	 * entry, so the ring keeps the events around it. A busy change starts a new one.
	 */
	private traceUpdate(changes: number, busy: boolean | null): void {
		const last = this.ring[(this.head + TRACE_SIZE - 1) % TRACE_SIZE];
		if (last?.kind === 'update' && (busy === null || busy === last.busy)) {
			last.frames = Number(last.frames) + 1;
			last.changes = Number(last.changes) + changes;
			last.lastAt = Date.now();
			return;
		}
		this.trace('update', { frames: 1, changes, busy });
	}

	/** While busy, a chat that hears nothing for a minute asks for a snapshot. */
	watchBusy(busy: boolean): void {
		if (this.staleTimer) clearTimeout(this.staleTimer);
		this.staleTimer = busy ? setTimeout(this.probe, this.staleMs) : null;
	}

	private probe = () => {
		this.staleTimer = null;
		const quiet = Date.now() - this.lastFrameAt;
		if (quiet < this.staleMs) return this.watchBusy(true);
		this.trace('stale', { quietMs: quiet });
		if (!this.onStale()) return;
		this.staleMs = Math.min(this.staleMs * 2, MAX_STALE_MS);
		this.watchBusy(true);
	};

	/** Compare the chat with the snapshot a resync brought; report what disagreed. */
	checkDrift(reason: ResyncReason, local: ChatShape, server: ChatShape): void {
		// Mid-turn, items and answers may still be on their way; busy can't be.
		const settled = !server.busy || !local.busy;
		const mismatched = (Object.keys(local) as (keyof ChatShape)[]).filter(
			(k) => local[k] !== server[k] && (k === 'busy' || settled)
		);
		if (mismatched.length === 0) return;
		const fields: TraceData = {
			busyLocal: local.busy,
			busyServer: server.busy,
			endLocal: local.end,
			endServer: server.end,
			waitingLocal: local.waiting,
			waitingServer: server.waiting,
			unreadLocal: local.unread,
			unreadServer: server.unread,
			...this.timing()
		};
		this.trace('drift', fields);
		this.report?.({
			type: 'drift',
			agent: this.agent,
			reason,
			mismatched,
			fields,
			trace: this.entries()
		});
	}

	describe(state: ChatState): ChatDiagnostics {
		return { agent: this.agent, ...state, ...this.timing(), trace: this.entries() };
	}

	private timing(): Timing {
		const now = Date.now();
		return {
			msSinceLastFrame: this.lastFrameAt ? now - this.lastFrameAt : null,
			msSinceLastMeta: this.lastMetaAt ? now - this.lastMetaAt : null,
			framesSinceSnapshot: this.framesSinceSnapshot
		};
	}

	/** A frame that couldn't be read or applied; only the error's class goes out. */
	frameError(error: unknown): void {
		this.trace('frame-error');
		this.report?.({
			type: 'frame-error',
			agent: this.agent,
			mismatched: [],
			fields: { typeError: error instanceof TypeError, syntaxError: error instanceof SyntaxError },
			trace: this.entries()
		});
	}

	dispose(): void {
		if (this.staleTimer) clearTimeout(this.staleTimer);
		this.staleTimer = null;
	}
}

/** A host's reporter that passes each type of report on at most once per `ms`. */
export function throttled(
	send: (d: ChatDiagnostic) => void,
	ms = 10 * 60_000
): (d: ChatDiagnostic) => void {
	const last = new Map<string, number>();
	return (d) => {
		const key = `${d.type}:${d.agent}`;
		const now = Date.now();
		if (now - (last.get(key) ?? -Infinity) < ms) return;
		last.set(key, now);
		send(d);
	};
}
