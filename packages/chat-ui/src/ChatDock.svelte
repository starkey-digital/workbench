<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClaudeAccount, SlashCommand } from '@workbench/types';
	import { cn } from '@workbench/ui';
	import type { AgentChat } from './agent-chat.svelte';
	import { accountChoices, agentName, limitNotice } from './chat-format';
	import { promptSuggestions } from './artifacts';
	import ChatCacheHint from './ChatCacheHint.svelte';
	import ChatComposer from './ChatComposer.svelte';
	import ChatCompacting from './ChatCompacting.svelte';
	import ChatGoal from './ChatGoal.svelte';
	import ChatOptions from './ChatOptions.svelte';
	import ChatPlan from './ChatPlan.svelte';
	import ChatPlugins from './ChatPlugins.svelte';
	import type { PluginManager } from './plugin-manager.svelte';
	import ChatSuggestions from './ChatSuggestions.svelte';
	import CodexControls from './CodexControls.svelte';

	let {
		chat,
		id,
		notice,
		answerHint,
		onResume,
		onThread,
		popover,
		accounts = [],
		defaultAccountName,
		class: className
	}: {
		chat: AgentChat;
		/** The composer's element id. */
		id: string;
		/** A host error shown in place of the chat's own notice. */
		notice?: string | null;
		/** The composer's placeholder while a request waits on the person; says where to answer it. */
		answerHint?: string;
		/** `/resume` is a terminal picker the CLI doesn't offer in chat, so the host provides it. */
		onResume: () => void;
		/** Open another Codex thread (CodexControls' thread list). */
		onThread: (sessionId: string, label: string) => void;
		/** Shown above the composer, e.g. the resume picker. */
		popover?: Snippet;
		/** The extra Claude accounts a Claude chat can move to; none hides the picker. */
		accounts?: Pick<ClaudeAccount, 'id' | 'name'>[];
		/** What the default `~/.claude` account is called. */
		defaultAccountName?: string;
		class?: string;
	} = $props();

	const RESUME: SlashCommand = {
		name: 'resume',
		description: 'Continue an earlier conversation from this folder'
	};
	/** `/plugin` is a terminal panel in the CLI; chat shows its own sheet. */
	const PLUGIN: SlashCommand = {
		name: 'plugin',
		description: 'Install, switch on or off, update and remove plugins'
	};
	const PLUGIN_NAMES = ['plugin', 'plugins'];

	const plugins = $derived(chat.plugins());
	/** The sheet is open for one account's plugins; moving to another closes it. */
	let openFor = $state.raw<PluginManager | null>(null);

	function openPlugins() {
		if (!plugins) return;
		openFor = plugins;
		void plugins.load();
	}

	const name = $derived(agentName(chat.agent));
	const shownNotice = $derived(notice ?? chat.notice);
	const limit = $derived(limitNotice(chat.meta?.rateLimit ?? null));
	const suggestions = $derived(
		promptSuggestions(chat.meta, chat.live && !chat.rewind, chat.draft.text)
	);
	const switchable = $derived(chat.agent === 'claude' && accounts.length > 0);
	/** At a limit, the other accounts to carry on under. */
	const fallbacks = $derived(
		switchable && limit?.tone === 'blocked'
			? accountChoices(accounts, defaultAccountName).filter((c) => c.id !== chat.accountId)
			: []
	);
	const commands = $derived([
		RESUME,
		...(plugins ? [PLUGIN] : []),
		...chat.commands.filter(
			(c) => c.name !== 'resume' && !(plugins && PLUGIN_NAMES.includes(c.name))
		)
	]);
	const disabledReason = $derived.by(() => {
		switch (chat.status) {
			case 'starting':
				return `Starting ${name}…`;
			case 'reconnecting':
				return 'Reconnecting…';
			case 'exited':
			case 'failed':
				return 'Restart the session to send messages';
			default:
				return chat.waiting ? (answerHint ?? `Answer ${name} first`) : null;
		}
	});

	function onCommand(command: string): boolean {
		if (plugins && PLUGIN_NAMES.includes(command)) {
			openPlugins();
			return true;
		}
		if (command !== 'resume') return false;
		onResume();
		return true;
	}
</script>

<div class={cn('flex flex-col gap-2', className)}>
	{#if shownNotice}
		<p class="text-xs text-wb-err" role="alert">{shownNotice}</p>
	{/if}
	{#if limit}
		<p
			class={cn(
				'rounded-md border px-3 py-2 text-xs',
				limit.tone === 'blocked'
					? 'border-wb-warn/50 bg-wb-warn/10 text-wb-ink'
					: 'border-wb-hair text-wb-ink-mute'
			)}
			role={limit.tone === 'blocked' ? 'alert' : undefined}
		>
			{limit.text}
			{#each fallbacks as account (account.key)}
				<button
					type="button"
					class="ml-2 rounded px-1.5 py-0.5 font-medium text-wb-accent hover:bg-wb-panel2 focus-visible:ring-1 focus-visible:ring-wb-accent focus-visible:outline-none disabled:opacity-50"
					disabled={Boolean(chat.meta?.busy) || !chat.live}
					onclick={() => chat.setAccount(account.id)}
				>
					Continue on {account.name}
				</button>
			{/each}
		</p>
	{/if}
	{#if chat.todos.length > 0}
		<ChatPlan steps={chat.todos} />
	{/if}
	<CodexControls {chat} {onThread} />
	<ChatCacheHint {chat} />
	{#if chat.meta?.compactingSince && chat.live}
		<ChatCompacting tokens={chat.meta.contextTokens} />
	{/if}
	{#if chat.meta?.goal && chat.live}
		<ChatGoal goal={chat.meta.goal} />
	{/if}
	{#if plugins && openFor === plugins}
		<ChatPlugins
			manager={plugins}
			busyTurn={Boolean(chat.meta?.busy) && chat.live}
			onRestart={() => chat.restart()}
			onClose={() => (openFor = null)}
		/>
	{/if}
	<ChatSuggestions {suggestions} onPick={(text) => (chat.draft.text = text)} />
	<ChatComposer
		{id}
		agent={chat.agent}
		bind:draft={chat.draft.text}
		bind:images={chat.draft.images}
		bind:files={chat.draft.files}
		busy={Boolean(chat.meta?.busy) && chat.live}
		stoppable={chat.stoppable}
		sendNow={chat.canSendNow && chat.live}
		{disabledReason}
		onSend={(text, images, files, now) => chat.prompt(text, images, files, now)}
		onStop={() => chat.interrupt()}
		{commands}
		{onCommand}
		loadFiles={() => chat.listFiles()}
		{popover}
	>
		{#snippet controls()}
			<ChatOptions
				agent={chat.agent}
				mode={chat.mode}
				meta={chat.meta}
				disabled={disabledReason !== null}
				accounts={switchable ? accounts : []}
				{defaultAccountName}
				accountId={chat.accountId}
				accountDisabled={Boolean(chat.meta?.busy)}
				onMode={(mode) => chat.setMode(mode)}
				onModel={(model) => chat.setModel(model)}
				onEffort={(effort) => chat.setEffort(effort)}
				onAccount={(id) => chat.setAccount(id)}
			/>
		{/snippet}
	</ChatComposer>
</div>
