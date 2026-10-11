<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import * as DropdownMenu from '@workbench/ui/dropdown-menu';
	import { cn } from '@workbench/ui';
	import type {
		AgentKind,
		ClaudeAccount,
		CodexMode,
		EffortLevel,
		PermissionMode,
		TranscriptMeta
	} from '@workbench/types';
	import {
		accountChoices,
		canPickModel,
		currentModel,
		effortLabel,
		isRiskyMode,
		modeLabel,
		modeOptions
	} from './chat-format';

	let {
		agent,
		mode,
		meta,
		disabled,
		accounts = [],
		defaultAccountName,
		accountId,
		accountDisabled,
		onMode,
		onModel,
		onEffort,
		onAccount
	}: {
		agent: AgentKind;
		mode: PermissionMode | CodexMode | null;
		meta: TranscriptMeta | null;
		disabled: boolean;
		/** The extra Claude accounts; none leaves the account choice out. */
		accounts?: Pick<ClaudeAccount, 'id' | 'name'>[];
		/** What the default `~/.claude` account is called. */
		defaultAccountName?: string;
		accountId: string | undefined;
		/** A switch restarts the session, so not mid-turn. */
		accountDisabled: boolean;
		onMode: (mode: PermissionMode | CodexMode) => void;
		onModel: (model: string) => void;
		onEffort: (effort: EffortLevel) => void;
		onAccount: (accountId: string | undefined) => void;
	} = $props();

	const modes = $derived(modeOptions(agent));
	const risky = $derived(isRiskyMode(mode));
	const model = $derived(currentModel(meta));
	const models = $derived(meta?.models ?? []);
	const levels = $derived(model?.effortLevels ?? []);
	/** A picked level the new model doesn't take falls back to its default. */
	const effort = $derived(meta?.effort && levels.includes(meta.effort) ? meta.effort : null);
	const choices = $derived(
		agent === 'claude' && accounts.length > 0 ? accountChoices(accounts, defaultAccountName) : []
	);
	const account = $derived(choices.find((c) => c.id === accountId) ?? choices[0]);
	/** Each agent's everyday mode; any other (plan, bypass) is worth seeing at a glance. */
	const usualMode = $derived(mode === null || mode === (agent === 'codex' ? 'auto' : 'default'));
	/** The trigger names what matters most: an unusual mode, else the model. */
	const summary = $derived(usualMode ? (model?.displayName ?? 'Options') : modeLabel(mode, agent));
</script>

{#snippet current(value: string, danger = false)}
	<span
		class={cn(
			'ms-auto max-w-32 truncate ps-3 text-xs',
			danger ? 'text-wb-err' : 'text-muted-foreground'
		)}>{value}</span
	>
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				{disabled}
				class={cn(
					'flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap hover:bg-wb-panel2 hover:text-wb-ink focus-visible:ring-1 focus-visible:ring-wb-accent focus-visible:outline-none disabled:opacity-50',
					risky ? 'text-wb-err' : 'text-wb-ink-mute'
				)}
				title={agent === 'codex' ? 'Approvals, sandbox and model' : 'Mode, model and account'}
			>
				<SlidersHorizontalIcon class="size-3.5 shrink-0" />
				<span class="truncate">{summary}</span>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-64">
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger>
				{agent === 'codex' ? 'Approvals' : 'Mode'}
				{@render current(modeLabel(mode, agent), risky)}
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent class="w-64">
				<DropdownMenu.RadioGroup
					value={mode ?? (agent === 'codex' ? '' : 'default')}
					onValueChange={(value) => onMode(value as PermissionMode | CodexMode)}
				>
					{#each modes as option (option.mode)}
						<DropdownMenu.RadioItem value={option.mode} class="flex-col items-start gap-0">
							<span class={cn(option.risky && 'text-wb-err')}>{option.label}</span>
							<span class="text-[11px] text-muted-foreground">{option.hint}</span>
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
		{#if models.length > 0}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					Model
					{@render current(model?.displayName ?? '')}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-72">
					<DropdownMenu.RadioGroup
						value={model?.value ?? ''}
						onValueChange={(value) => onModel(value)}
					>
						{#each models as option (option.value)}
							<DropdownMenu.RadioItem
								value={option.value}
								disabled={!canPickModel(option, model)}
								class="flex-col items-start gap-0"
							>
								<span>{option.displayName}</span>
								{#if option.description}
									<span class="text-[11px] text-muted-foreground">{option.description}</span>
								{/if}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
		{#if levels.length > 0}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					Effort
					{@render current(effortLabel(effort))}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-48">
					<DropdownMenu.RadioGroup
						value={effort ?? ''}
						onValueChange={(value) => onEffort(value as EffortLevel)}
					>
						{#each levels as level (level)}
							<DropdownMenu.RadioItem value={level}>{effortLabel(level)}</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
		{#if account}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger disabled={accountDisabled}>
					Account
					{@render current(account.name)}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-64">
					<DropdownMenu.Label class="text-[11px] font-normal text-muted-foreground">
						Continue this chat on another account. It restarts there and re-reads the conversation,
						so the next reply starts with a cold cache.
					</DropdownMenu.Label>
					<!-- Checked from `accountId`, the server's account: a refused switch never shows as picked. -->
					{#each choices as choice (choice.key)}
						<DropdownMenu.Item onSelect={() => onAccount(choice.id)}>
							<CheckIcon class={['size-3.5', choice.key !== account.key && 'invisible']} />
							{choice.name}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
