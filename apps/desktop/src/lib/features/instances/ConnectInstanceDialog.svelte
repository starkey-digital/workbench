<script lang="ts">
	import * as Dialog from '@workbench/ui/dialog';
	import { Button } from '@workbench/ui/button';
	import { Input } from '@workbench/ui/input';
	import { getInstancesStore } from '$stores/context';
	import { probeHealth, type RemoteInstance } from './instances.svelte';

	const DEFAULT_URL = 'http://localhost:4317';

	let {
		open = $bindable(false),
		editing = $bindable(null)
	}: {
		open?: boolean;
		/** The server being edited; null adds one. Cleared on close, so reopening it re-seeds. */
		editing?: RemoteInstance | null;
	} = $props();

	const instances = getInstancesStore();

	let name = $derived(editing?.config.name ?? '');
	let url = $derived(editing?.config.url ?? DEFAULT_URL);
	let token = $derived(editing?.config.token ?? '');
	let copyFolder = $derived(editing?.config.copyFolder ?? '');
	let testState = $state<'idle' | 'testing' | 'ok' | 'fail'>('idle');
	let testMessage = $state('');

	function close() {
		open = false;
		editing = null;
		name = '';
		url = DEFAULT_URL;
		token = '';
		copyFolder = '';
		testState = 'idle';
		testMessage = '';
	}

	async function test() {
		const base = url.trim().replace(/\/$/, '');
		if (!base) return;
		testState = 'testing';
		testMessage = '';
		try {
			const res = await probeHealth(base, token.trim() || undefined);
			testState = res.ok ? 'ok' : 'fail';
			if (!res.ok) testMessage = `${res.status} ${res.statusText}`;
		} catch (e) {
			testState = 'fail';
			testMessage = e instanceof Error ? e.message : String(e);
		}
	}

	function save() {
		const base = url.trim().replace(/\/$/, '');
		if (!base) return;
		const config = {
			name: name.trim() || base.replace(/^https?:\/\//, ''),
			url: base,
			token: token.trim() || undefined,
			copyFolder: copyFolder.trim() || undefined
		};
		if (editing) {
			instances.update(editing.config.id, config);
		} else {
			instances.setActive(instances.add(config).config.id);
		}
		close();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && close()}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit instance' : 'Connect instance'}</Dialog.Title>
			<Dialog.Description>
				{editing
					? 'A new URL or token reconnects to the server.'
					: 'Connect to a Workbench server to manage its projects and spawn sessions there.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 py-2">
			<label class="flex flex-col gap-1 text-sm">
				Name
				<Input bind:value={name} placeholder="linux-box" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Server URL
				<Input
					bind:value={url}
					oninput={() => (testState = 'idle')}
					placeholder="http://host:4317"
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Token (optional)
				<Input
					bind:value={token}
					oninput={() => (testState = 'idle')}
					type="password"
					placeholder="bearer token"
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Copy projects into (optional)
				<Input
					bind:value={copyFolder}
					placeholder="Its clone folder, else home"
					class="font-mono text-xs"
				/>
			</label>

			<div class="flex items-center gap-2">
				<Button variant="secondary" size="sm" onclick={test} disabled={testState === 'testing'}>
					{testState === 'testing' ? 'Testing…' : 'Test connection'}
				</Button>
				{#if testState === 'ok'}
					<span class="text-xs text-wb-ok">● reachable</span>
				{:else if testState === 'fail'}
					<span class="text-xs text-wb-err">● {testMessage || 'unreachable'}</span>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="ghost" onclick={close}>Cancel</Button>
			<Button onclick={save}>{editing ? 'Save' : 'Add'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
