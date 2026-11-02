<script lang="ts">
	import WorkspaceArea from '$features/workspaces/WorkspaceArea.svelte';
	import { setClaudeSessionStore, setWorkbenchServer, setWorkspaceStore } from '$stores/context';
	import type { RemoteInstance } from './instances.svelte';
	import { remoteSession } from './remote-session.svelte';

	/** A remote server's workspaces in the views the local ones use; key it by the instance. */
	let { instance }: { instance: RemoteInstance } = $props();

	// svelte-ignore state_referenced_locally
	const session = remoteSession(instance);
	setWorkbenchServer(session.server);
	setWorkspaceStore(session.workspaces);
	setClaudeSessionStore(session.sessions);
</script>

<WorkspaceArea projectFor={(ws) => session.projectFor(ws)} />
