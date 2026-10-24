<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderGitIcon from '@lucide/svelte/icons/folder-git-2';
	import { onMount } from 'svelte';
	import { baseName, type ProjectConfig } from '@workbench/types';
	import type { MobileClient } from './client.svelte';
	import { pathKey, tildePath } from './home-format';
	import {
		accountFromOption,
		accountOption,
		DEFAULT_LOGIN,
		FOLLOW_ACTIVE,
		FolderBrowser,
		unknownAccount
	} from './project-sheet.svelte';
	import Sheet from './Sheet.svelte';

	/** Adds a project (pick a host folder, then name it) or edits `project`. */
	let {
		client,
		project,
		onClose,
		onRemoved
	}: {
		client: MobileClient;
		/** Absent: add a new one. */
		project?: ProjectConfig;
		onClose: () => void;
		onRemoved: (path: string) => void;
	} = $props();

	const store = $derived(client.store!);
	// Seeded once: the sheet is mounted per open.
	// svelte-ignore state_referenced_locally
	let path = $state(project?.path ?? '');
	// svelte-ignore state_referenced_locally
	let name = $state(project?.name ?? '');
	// svelte-ignore state_referenced_locally
	let group = $state(project?.group ?? '');
	// svelte-ignore state_referenced_locally
	let account = $state(accountOption(project?.claudeAccountId));
	let saving = $state(false);
	let confirmingRemove = $state(false);
	let error = $state<string | null>(null);

	const browser = new FolderBrowser((p) => store.listFolders(p));
	const registered = $derived(new Set(store.projects.map((p) => pathKey(p.path))));
	const groups = $derived([...new Set(store.projects.flatMap((p) => (p.group ? [p.group] : [])))]);
	const picking = $derived(!path);

	onMount(() => {
		if (!project) void browser.open();
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		error = null;
		const edit = {
			path,
			name: name.trim(),
			group: group.trim() || undefined,
			claudeAccountId: accountFromOption(account)
		};
		try {
			await (project ? store.updateProject(edit) : store.addProject(edit));
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!project) return;
		saving = true;
		error = null;
		try {
			await store.removeProject(project.path);
			onRemoved(project.path);
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			confirmingRemove = false;
		} finally {
			saving = false;
		}
	}

	const field =
		'h-10 rounded-lg border border-wb-hair bg-wb-panel2 px-3 text-[13.5px] font-normal text-wb-ink placeholder:text-wb-ink-soft focus:border-wb-ink-soft focus:outline-none';
	const label = 'flex flex-col gap-1.5 text-[12px] font-semibold text-wb-ink-mute';
</script>

<Sheet label={project ? `Edit ${project.name}` : 'Add project'} {onClose}>
	<div class="flex flex-col gap-3 text-sm">
		<div class="flex items-center gap-2">
			<h2 class="min-w-0 flex-1 truncate font-semibold">
				{project ? 'Edit project' : picking ? 'Pick a folder' : 'Add project'}
			</h2>
			<button
				type="button"
				class="h-9 rounded-lg border border-wb-hair px-3 text-xs"
				onclick={onClose}>Cancel</button
			>
		</div>

		{#if picking}
			{@const listing = browser.listing}
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="grid size-9 shrink-0 place-items-center rounded-lg border border-wb-hair active:bg-wb-panel2 disabled:opacity-40"
					aria-label="Up one folder"
					disabled={!listing?.parent || browser.loading}
					onclick={() => browser.open(listing?.parent ?? undefined)}
				>
					<ArrowUpIcon class="size-4" />
				</button>
				<span class="min-w-0 flex-1 truncate font-mono text-xs text-wb-ink-mute"
					>{listing ? tildePath(listing.path) : '…'}</span
				>
			</div>
			{#if browser.error}<p class="text-xs break-words text-wb-err" role="alert">
					{browser.error}
				</p>{/if}
			<ul class="flex max-h-[45vh] flex-col overflow-y-auto rounded-lg border border-wb-hair-soft">
				{#each listing?.folders ?? [] as folder (folder.path)}
					{@const added = registered.has(pathKey(folder.path))}
					<li class="border-b border-wb-hair-soft last:border-b-0">
						<button
							type="button"
							class="flex min-h-11 w-full items-center gap-2.5 px-3 text-left active:bg-wb-panel2"
							onclick={() => browser.open(folder.path)}
						>
							{#if folder.git}
								<FolderGitIcon class="size-4 shrink-0 text-wb-accent" />
							{:else}
								<FolderIcon class="size-4 shrink-0 text-wb-ink-soft" />
							{/if}
							<span class="min-w-0 flex-1 truncate text-[13.5px]">{folder.name}</span>
							{#if added}<span class="shrink-0 text-[11px] text-wb-ink-soft">Added</span>{/if}
						</button>
					</li>
				{:else}
					<li class="px-3 py-3 text-xs text-wb-ink-soft" role="status">
						{browser.loading ? 'Loading…' : 'No folders here.'}
					</li>
				{/each}
			</ul>
			<button
				type="button"
				class="h-10 rounded-lg bg-wb-accent text-[13px] font-semibold text-wb-accent-ink active:brightness-90 disabled:opacity-50"
				disabled={!listing || browser.loading || registered.has(pathKey(listing.path))}
				onclick={() => {
					if (listing) path = listing.path;
				}}
			>
				{listing && registered.has(pathKey(listing.path))
					? 'Already a project'
					: `Use ${listing ? baseName(listing.path) || listing.path : 'this folder'}`}
			</button>
		{:else}
			<form class="flex flex-col gap-3" onsubmit={save}>
				<div class="flex items-center gap-2">
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-wb-ink-mute"
						>{tildePath(path)}</span
					>
					{#if !project}
						<button
							type="button"
							class="shrink-0 text-xs text-wb-accent"
							onclick={() => (path = '')}>Change</button
						>
					{/if}
				</div>
				<label class={label}
					>Name
					<input class={field} bind:value={name} placeholder={baseName(path)} />
				</label>
				<label class={label}
					>Group
					<input
						class={field}
						bind:value={group}
						list="project-groups"
						placeholder="None"
						autocapitalize="words"
					/>
					<datalist id="project-groups">
						{#each groups as g (g)}<option value={g}></option>{/each}
					</datalist>
				</label>
				{#if client.accounts.length || unknownAccount(account, client.accounts)}
					<label class={label}
						>Claude account for new sessions
						<select class={field} bind:value={account}>
							<option value={FOLLOW_ACTIVE}>Active account</option>
							<option value={DEFAULT_LOGIN}>{client.defaultAccountName}</option>
							{#each client.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
							{#if unknownAccount(account, client.accounts)}
								<option value={account}>Account not on this phone ({account})</option>
							{/if}
						</select>
					</label>
				{/if}
				{#if error}<p class="text-xs break-words text-wb-err" role="alert">{error}</p>{/if}
				<button
					type="submit"
					class="h-10 rounded-lg bg-wb-accent text-[13px] font-semibold text-wb-accent-ink active:brightness-90 disabled:opacity-50"
					disabled={saving}
				>
					{project ? 'Save' : 'Add project'}
				</button>
			</form>
			{#if project}
				{#if confirmingRemove}
					<div class="flex flex-col gap-2 rounded-lg border border-wb-err/40 p-3">
						<p class="text-xs text-wb-ink-mute">
							Remove {project.name} from Workbench? Its open sessions end; the folder stays on disk.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								class="h-9 flex-1 rounded-lg bg-wb-err/15 text-[13px] font-semibold text-wb-err disabled:opacity-50"
								disabled={saving}
								onclick={remove}>Remove</button
							>
							<button
								type="button"
								class="h-9 flex-1 rounded-lg border border-wb-hair text-[13px] text-wb-ink-mute"
								onclick={() => (confirmingRemove = false)}>Keep</button
							>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="h-10 rounded-lg border border-wb-hair text-[13px] font-medium text-wb-err active:bg-wb-panel2"
						onclick={() => (confirmingRemove = true)}>Remove project</button
					>
				{/if}
			{/if}
		{/if}
	</div>
</Sheet>
