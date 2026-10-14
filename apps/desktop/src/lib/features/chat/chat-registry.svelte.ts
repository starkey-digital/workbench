import type { ChatTarget } from '$types/workbench';
import { AgentChat, ChatDraft, owned, type PaneProcess } from '@workbench/chat-ui';
import { loopbackAgentApi } from './agent-api';

/**
 * Chat connections by pane. A chat outlives its view: hidden workspaces
 * unmount `SessionChat`, but the connection stays open so a question or
 * approval in a background chat still reaches the sidebar and notifications.
 * Released when the pane goes back to the terminal or leaves the snapshot.
 * Every chat only attaches: the server's workspace service runs the session.
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache: views must not re-run as chats come and go
const chats = new Map<
	string,
	{
		chat: AgentChat;
		/** Ends the reactive root the chat's deriveds belong to. */
		destroy: () => void;
		generation: number | undefined;
		pane: Partial<PaneProcess>;
	}
>();
/**
 * Composer drafts by pane. They outlive the chat (Terminal | Chat toggles
 * release it); an emptied one is dropped on release, so a closed pane leaves
 * at most its unsent draft in memory until the app restarts.
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache, like `chats`
const drafts = new Map<string, ChatDraft>();

/**
 * The pane's chat, created on first use or when the pane moved to another
 * session. `pane` is the process it attaches to.
 */
export function acquireChat(
	paneId: string,
	body: ChatTarget,
	pane: Partial<PaneProcess> = {}
): { chat: AgentChat; created: boolean } {
	const existing = chats.get(paneId);
	// `/clear` re-keys the same chat; any other new id is a different conversation.
	if (existing && existing.chat.sessionId === body.sessionId) {
		followPane(paneId, pane);
		return { chat: existing.chat, created: false };
	}
	if (existing) drop(existing);
	let draft = drafts.get(paneId);
	// Owned by nothing that unmounts: it outlives views and chats alike.
	if (!draft) drafts.set(paneId, (draft = owned(() => new ChatDraft())[0]));
	// Its own root: it outlives the `SessionChat` that first asks for it.
	const [chat, destroy] = owned(
		() => new AgentChat(body, loopbackAgentApi, { draft, pane: () => processOf(paneId) })
	);
	chats.set(paneId, { chat, destroy, generation: pane.generation, pane });
	return { chat, created: true };
}

/**
 * Re-attach the pane's chat when it runs a process the chat isn't attached
 * to: every spawn (a Restart, from any device) bumps the pane's generation,
 * whether or not this window saw the pane stop. An ended chat re-attaches
 * once its pane runs again.
 */
export function followPane(paneId: string, pane: Partial<PaneProcess>): void {
	const entry = chats.get(paneId);
	if (entry) entry.pane = pane;
	if (!entry || pane.status !== 'running') return;
	const restarted = pane.generation !== undefined && pane.generation !== entry.generation;
	const ended = entry.chat.status === 'exited' || entry.chat.status === 'failed';
	if (!restarted && !ended) return;
	entry.generation = pane.generation;
	void entry.chat.attach();
}

/** The pane's process as last seen, for its chat to tell a relaunch from an end. */
function processOf(paneId: string): PaneProcess | null {
	const { status, generation } = chats.get(paneId)?.pane ?? {};
	return status && generation !== undefined ? { status, generation } : null;
}

function drop(entry: { chat: AgentChat; destroy: () => void }): void {
	entry.chat.dispose();
	entry.destroy();
}

export function releaseChat(paneId: string): void {
	const entry = chats.get(paneId);
	if (entry) drop(entry);
	chats.delete(paneId);
	const draft = drafts.get(paneId);
	if (draft && !draft.text && draft.images.length === 0 && draft.files.length === 0)
		drafts.delete(paneId);
}
