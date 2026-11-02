<script lang="ts">
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import type { ActiveClaudeSession } from '$types/workbench';

	/** Running Claude and Codex counts for a project or branch row. */
	let { sessions }: { sessions: ActiveClaudeSession[] } = $props();
</script>

{#each ['claude', 'codex'] as const as agent (agent)}
	{@const count = sessions.filter((s) => s.sessionType === agent).length}
	{#if count > 0}
		<span
			class={[
				'inline-flex shrink-0 items-center gap-1 rounded px-1 py-px font-mono text-[9.5px] font-semibold',
				agent === 'claude' ? 'bg-wb-claude/20 text-wb-claude' : 'bg-wb-codex/20 text-wb-codex'
			]}
			><AgentIcon {agent} class="size-2.5" /><span class="sr-only"
				>{agent === 'claude' ? 'Claude' : 'Codex'}:</span
			>{count}</span
		>
	{/if}
{/each}
