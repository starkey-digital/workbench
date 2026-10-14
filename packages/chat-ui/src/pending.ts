import type { TranscriptItem } from '@workbench/types';

/** A prompt shown at once, until the agent echoes it back as a real item. */
export interface PendingPrompt {
	id: string;
	text: string;
	/** Data URLs of attached images, shown in the bubble. */
	previews: string[];
	/** Names of attached PDFs and text files. */
	files: string[];
	/** User items already in the chat when it was sent; only later ones can echo it. */
	after: number;
	/** Absolute index the next item had when it was sent. */
	at: number;
}

/**
 * The optimistic prompts the agent hasn't echoed back yet, and the image
 * previews of those it has, by the echo's id. `matched` holds the user items
 * already taken as echoes; it's updated in place.
 */
export function settlePending(
	pending: PendingPrompt[],
	items: TranscriptItem[],
	start: number,
	busy: boolean,
	matched: Set<string>
): { pending: PendingPrompt[]; previews: Record<string, string[]> } {
	const users = items.filter((i) => i.kind === 'user');
	// The CLI collapses runs of spaces in a slash command's echo, and echoes
	// an alias like `/design consent` as `/design-consent`.
	const norm = (s: string) => s.replace(/[\s-]+/g, ' ');
	// A terminal session's prompt comes back with its attachments as `@path` mentions.
	const same = (echo: string, sent: string) =>
		norm(echo) === norm(sent) || norm(echo).startsWith(`${norm(sent)} @`.trimStart());
	// A command the CLI can't run headless (`/design-login`) is never echoed,
	// only answered with a notice.
	const noticeSince = (at: number) => items.some((i, k) => i.kind === 'notice' && start + k >= at);
	const previews: Record<string, string[]> = {};
	const available = new Set(users.map((user) => user.id));
	for (const id of matched) if (!available.has(id)) matched.delete(id);
	const left = pending.filter((p) => {
		const echo = users
			.slice(p.after)
			.find((u) => u.kind === 'user' && !matched.has(u.id) && same(u.text, p.text));
		if (echo) matched.add(echo.id);
		if (echo && p.previews.length > 0) previews[echo.id] = p.previews;
		return !echo && !(!busy && p.text.startsWith('/') && noticeSince(p.at));
	});
	return { pending: left, previews };
}
