<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '../../utils.js';
	import { Button } from '../button/index.js';

	/**
	 * Walls off a view: a render error shows a Reload in its place instead of
	 * blanking the app. `onerror` reports it; `onreset` runs before the view is
	 * rebuilt (refetch what it shows).
	 */
	let {
		label,
		onerror,
		onreset,
		class: className,
		children
	}: {
		/** What failed, for the message: "This chat couldn't be shown." */
		label: string;
		onerror: (error: unknown) => void;
		onreset?: () => void;
		class?: string;
		children: Snippet;
	} = $props();

	// A Reload can fail again before a refetch lands; one report per view is enough.
	let reported = false;
</script>

<svelte:boundary
	onerror={(error) => {
		if (reported) return;
		reported = true;
		onerror(error);
	}}
>
	{@render children()}

	{#snippet failed(_error, reset)}
		<div
			class={cn(
				'flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-wb-ink-mute',
				className
			)}
			role="alert"
		>
			<p>This {label} couldn't be shown. The error was reported.</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					onreset?.();
					reset();
				}}>Reload view</Button
			>
		</div>
	{/snippet}
</svelte:boundary>
