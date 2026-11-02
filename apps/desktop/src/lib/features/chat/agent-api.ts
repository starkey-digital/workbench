import { agentClient, type AgentApi } from '@workbench/chat-ui';
import { loopbackServer, type ServerAddress } from '@workbench/transport';
import type { ClaudeAccount } from '$types/workbench';

/** The Workbench server a set of workspaces runs on: where its terminals and chats attach. */
export interface WorkbenchServer {
	/** Keys per-server caches (plan usage). */
	id: string;
	address: () => Promise<ServerAddress>;
	agents: ReturnType<typeof agentClient>;
	/** Another machine's server: its paths aren't on this one, and it has no native terminals. */
	remote: boolean;
	/** Its Claude logins, when they aren't this machine's settings. */
	accounts?: { readonly claudeAccounts: ClaudeAccount[]; readonly defaultAccountName: string };
}

export function workbenchServer(
	id: string,
	address: () => Promise<ServerAddress>,
	remote: boolean
): WorkbenchServer {
	return { id, address, agents: agentClient(address), remote };
}

export const loopbackWorkbench = workbenchServer('loopback', loopbackServer, false);

/** Chat sessions on the loopback server. */
export const loopbackAgentApi: AgentApi = loopbackWorkbench.agents;

/** A Claude account's plan limits, cached by the loopback server. */
export const planUsage = loopbackWorkbench.agents.usage;
