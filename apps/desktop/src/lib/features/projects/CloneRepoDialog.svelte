<script lang="ts">
	import { watch } from 'runed';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import * as Dialog from '@workbench/ui/dialog';
	import { Button } from '@workbench/ui/button';
	import { Input } from '@workbench/ui/input';
	import { Label } from '@workbench/ui/label';
	import { invoke } from '@tauri-apps/api/core';
	import { selectFolder } from '$lib/utils/dialog';
	import { baseName } from '$lib/utils/path';
	import { repoUrl } from '@workbench/control-plane-ui';
	import { getProjectStore, getWorkbenchSettingsStore } from '$stores/context';
	import type { GitHubRepo } from '$types/workbench';
	import GitHubRepoPicker from './GitHubRepoPicker.svelte';

	let {
		open = $bindable(false)
	}: {
		open?: boolean;
	} = $props();

	const projectStore = getProjectStore();
	const settingsStore = getWorkbenchSettingsStore();

	let repos: GitHubRepo[] = $state([]);
	let loadingRepos = $state(false);
	let reposError: string | null = $state(null);
	let selectedRepo = $state<GitHubRepo | null>(null);
	let manualInput = $state('');
	let cloneDir = $state('');
	let cloning = $state(false);
	let cloneError: string | null = $state(null);

	let resolvedUrl = $derived(selectedRepo?.url ?? repoUrl(manualInput));

	let repoName = $derived.by(() => {
		if (selectedRepo) return selectedRepo.name;
		const m = manualInput.trim();
		if (!m) return '';
		return baseName(m.replace(/\.git$/, ''));
	});

	let resolvedDestPath = $derived.by(() => {
		if (!cloneDir || !repoName) return '';
		const sep = cloneDir.includes('\\') ? '\\' : '/';
		return `${cloneDir}${sep}${repoName}`;
	});

	function resetState() {
		selectedRepo = null;
		manualInput = '';
		cloneError = null;
		cloneDir = settingsStore.cloneBaseDir ?? '';
		repos = [];
		reposError = null;
	}

	// onOpenChange is only fired by user interactions, not programmatic open changes.
	watch(
		() => open,
		(isOpen) => {
			if (isOpen) {
				resetState();
				loadRepos();
			}
		}
	);

	async function loadRepos() {
		loadingRepos = true;
		reposError = null;
		try {
			repos = await invoke<GitHubRepo[]>('github_list_repos');
		} catch (e) {
			reposError = String(e);
		} finally {
			loadingRepos = false;
		}
	}

	async function pickDir() {
		const dir = await selectFolder(cloneDir || undefined, 'Select Destination Directory');
		if (dir !== null) cloneDir = dir;
	}

	async function handleClone() {
		if (!resolvedUrl || !resolvedDestPath) return;
		cloning = true;
		cloneError = null;
		try {
			await invoke('clone_repo', { url: resolvedUrl, destPath: resolvedDestPath });
			const name = repoName || baseName(resolvedDestPath) || 'Cloned Repo';
			await projectStore.add({ name, path: resolvedDestPath });
			projectStore.openProject(resolvedDestPath);
			open = false;
		} catch (e) {
			cloneError = String(e);
		} finally {
			cloning = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
		<Dialog.Header class="shrink-0">
			<Dialog.Title class="flex items-center gap-2">
				<DownloadIcon class="size-4" />
				Clone Repository
			</Dialog.Title>
			<Dialog.Description>
				Choose a repository from your account or enter a URL to clone.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
			<GitHubRepoPicker
				{repos}
				loading={loadingRepos}
				error={reposError}
				onretry={loadRepos}
				bind:selected={selectedRepo}
				bind:typed={manualInput}
			/>

			<!-- Destination row -->
			<div class="flex flex-col gap-1.5">
				<Label class="text-xs text-muted-foreground">Destination</Label>
				<div class="flex items-center gap-2">
					<Input
						class="h-8 flex-1 font-mono text-xs text-muted-foreground"
						value={resolvedDestPath || '(choose a directory)'}
						readonly
					/>
					<Button variant="outline" size="sm" class="h-8 shrink-0 gap-1.5" onclick={pickDir}>
						<FolderIcon class="size-3" />
						Browse
					</Button>
				</div>
			</div>

			{#if cloneError}
				<p class="text-xs text-destructive">{cloneError}</p>
			{/if}
		</div>

		<Dialog.Footer class="shrink-0">
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Cancel</Button>
			<Button
				size="sm"
				class="gap-1.5"
				onclick={handleClone}
				disabled={!resolvedUrl || !resolvedDestPath || cloning}
			>
				{#if cloning}
					<LoaderIcon class="size-3 animate-spin" />
					Cloning…
				{:else}
					<DownloadIcon class="size-3" />
					Clone
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
