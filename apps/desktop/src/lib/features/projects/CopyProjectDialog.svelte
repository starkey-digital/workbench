<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import * as Dialog from '@workbench/ui/dialog';
	import * as Select from '@workbench/ui/select';
	import { Button } from '@workbench/ui/button';
	import { Checkbox } from '@workbench/ui/checkbox';
	import { Input } from '@workbench/ui/input';
	import { Label } from '@workbench/ui/label';
	import { getInstancesStore, getProjectManager } from '$stores/context';

	const flow = getProjectManager().copy;
	const instances = getInstancesStore();

	let server = $derived(instances.remotes.find((r) => r.config.id === flow.serverId));
	let claude = $derived(flow.result?.claude);
</script>

<Dialog.Root
	open={flow.open}
	onOpenChange={(open) => {
		if (!flow.copying) flow.open = open;
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Copy {flow.project?.name} to a server</Dialog.Title>
			<Dialog.Description>
				Copies the whole folder (uncommitted work, local branches, .env files) to another Workbench
				server and adds it as a project there. node_modules, target and other ignored build output
				are left behind.
			</Dialog.Description>
		</Dialog.Header>

		{#if flow.result}
			<div class="space-y-2 text-sm">
				<p>Copied to <span class="font-mono text-xs">{flow.result.project.path}</span>.</p>
				{#if claude}
					<p>
						Claude config: {claude.written} files written{#if claude.mcpServersAdded.length}, MCP
							servers added: {claude.mcpServersAdded.join(', ')}{/if}.
					</p>
					{#if claude.accountsAdded.length}
						<p>Accounts added: {claude.accountsAdded.join(', ')}.</p>
					{/if}
					{#if claude.skipped.length}
						<details class="text-xs text-muted-foreground">
							<summary>{claude.skipped.length} already there, left unchanged</summary>
							<ul class="mt-1 max-h-32 overflow-y-auto font-mono">
								{#each claude.skipped as path (path)}
									<li class="truncate">{path}</li>
								{/each}
							</ul>
						</details>
					{/if}
					<p class="text-xs text-muted-foreground">
						Logins don't copy: run <span class="font-mono">claude /login</span> once per account on that
						machine.
					</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button onclick={() => (flow.open = false)}>Done</Button>
			</Dialog.Footer>
		{:else}
			<div class="space-y-4">
				<div class="space-y-1.5">
					<Label>Server</Label>
					{#if instances.remotes.length === 0}
						<p class="text-xs text-muted-foreground">
							Connect a server first (activity rail → Remote server).
						</p>
					{:else}
						<Select.Root type="single" bind:value={flow.serverId}>
							<Select.Trigger class="w-full" aria-label="Server">
								{server ? `${server.config.name} (${server.status})` : 'Choose a server'}
							</Select.Trigger>
							<Select.Content>
								{#each instances.remotes as remote (remote.config.id)}
									<Select.Item value={remote.config.id}>
										{remote.config.name} ({remote.status})
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
				</div>
				<div class="space-y-1.5">
					<Label for="copy-parent">Into folder on the server</Label>
					<Input
						id="copy-parent"
						bind:value={flow.parent}
						placeholder="Its clone folder, else home"
						class="font-mono text-xs"
					/>
				</div>
				<div class="space-y-2">
					<label class="flex items-start gap-2 text-sm">
						<Checkbox
							checked={flow.claudeConfig}
							onCheckedChange={(v) => (flow.claudeConfig = v === true)}
						/>
						<span>
							Claude config
							<span class="block text-xs text-muted-foreground">
								~/.claude CLAUDE.md, settings, skills, agents, commands, hooks and user MCP servers
							</span>
						</span>
					</label>
					<label class="flex items-start gap-2 text-sm">
						<Checkbox
							checked={flow.claudeAccounts}
							onCheckedChange={(v) => (flow.claudeAccounts = v === true)}
						/>
						<span>
							Claude accounts
							<span class="block text-xs text-muted-foreground">
								Your extra accounts and their config. Each signs in again there.
							</span>
						</span>
					</label>
					<p class="text-xs text-muted-foreground">
						Files already on the server are never overwritten. .env files, settings and MCP servers
						can hold secrets and travel as plain HTTP, so use a Tailscale address.
					</p>
				</div>
				{#if flow.error}
					<p class="text-xs text-destructive">{flow.error}</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="ghost" disabled={flow.copying} onclick={() => (flow.open = false)}>
					Cancel
				</Button>
				<Button disabled={!server || flow.copying} onclick={() => flow.copy(instances.remotes)}>
					{#if flow.copying}
						<LoaderIcon class="size-3.5 animate-spin" />
						Copying…
					{:else}
						Copy
					{/if}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
