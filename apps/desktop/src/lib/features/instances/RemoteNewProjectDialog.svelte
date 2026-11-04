<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import * as Dialog from '@workbench/ui/dialog';
	import { Button } from '@workbench/ui/button';
	import { Checkbox } from '@workbench/ui/checkbox';
	import { Input } from '@workbench/ui/input';
	import { Label } from '@workbench/ui/label';
	import FolderBrowserView from '$components/FolderBrowserView.svelte';
	import GitHubRepoPicker from '$features/projects/GitHubRepoPicker.svelte';
	import type { NewProjectFlow } from './new-project.svelte';

	let {
		flow,
		server,
		onclose
	}: {
		flow: NewProjectFlow;
		/** The server's name, for the title. */
		server: string;
		onclose: () => void;
	} = $props();

	async function finish(step: Promise<void>) {
		await step;
		if (flow.added) onclose();
	}
</script>

<Dialog.Root
	open
	onOpenChange={(open) => {
		if (!open && !flow.busy) onclose();
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>New project on {server}</Dialog.Title>
			<Dialog.Description>
				Pick where it goes on that machine, then add the folder, make a new one, or clone a
				repository into it.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
			<div class="flex gap-1 rounded-md bg-wb-panel2 p-0.5" role="tablist">
				{#each [['folder', 'Folder'], ['clone', 'Clone']] as const as [mode, label] (mode)}
					<button
						type="button"
						role="tab"
						aria-selected={flow.mode === mode}
						class={[
							'flex-1 rounded px-2 py-1 text-xs transition-colors',
							flow.mode === mode ? 'bg-wb-panel text-wb-ink shadow-sm' : 'text-wb-ink-soft'
						]}
						onclick={() => flow.setMode(mode)}
					>
						{label}
					</button>
				{/each}
			</div>

			<div class="space-y-1.5">
				<Label>Location</Label>
				<FolderBrowserView browser={flow.browser} isProject={(p) => flow.isProject(p)} />
			</div>

			{#if flow.mode === 'folder'}
				<Button
					variant="secondary"
					disabled={!flow.here || flow.hereIsProject || flow.busy}
					onclick={() => finish(flow.addHere())}
				>
					{flow.hereIsProject ? 'Already a project' : 'Add this folder'}
				</Button>

				<div class="space-y-2">
					<Label for="new-folder">Or make a new folder here</Label>
					<div class="flex gap-1.5">
						<Input
							id="new-folder"
							bind:value={flow.newFolder}
							placeholder="my-project"
							class="font-mono text-xs"
							disabled={flow.busy}
						/>
						<Button
							disabled={!flow.here || !flow.newFolder.trim() || flow.busy}
							onclick={() => finish(flow.createHere())}
						>
							<FolderPlusIcon class="size-3.5" />
							Create
						</Button>
					</div>
					<label class="flex items-center gap-2 text-xs text-muted-foreground">
						<Checkbox
							checked={flow.gitInit}
							onCheckedChange={(v) => (flow.gitInit = v === true)}
							disabled={flow.busy}
						/>
						Make it a git repository
					</label>
				</div>
			{:else}
				<GitHubRepoPicker
					repos={flow.repos}
					loading={flow.reposLoading}
					error={flow.reposError}
					onretry={() => flow.loadRepos()}
					bind:selected={flow.repo}
					bind:typed={flow.url}
				/>
				<p class="text-xs text-muted-foreground">
					Uses the server's own git and <span class="font-mono">gh</span> login.
				</p>
			{/if}

			{#if flow.error}
				<p class="text-xs text-destructive" role="alert">{flow.error}</p>
			{/if}
		</div>

		<Dialog.Footer class="shrink-0">
			<Button variant="ghost" disabled={flow.busy} onclick={onclose}>Cancel</Button>
			{#if flow.mode === 'clone'}
				<Button
					disabled={!flow.here || !flow.cloneUrl || flow.busy}
					onclick={() => finish(flow.cloneHere())}
				>
					{#if flow.busy}
						<LoaderIcon class="size-3.5 animate-spin" />
						Cloning…
					{:else}
						<DownloadIcon class="size-3.5" />
						Clone here
					{/if}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
