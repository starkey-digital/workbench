<script lang="ts">
	import { log } from '$lib/log';
	import { watch } from 'runed';
	import { onDestroy, onMount } from 'svelte';
	import { fontPrefs, TERMINAL_PALETTES, themePrefs } from '@workbench/chat-ui';
	import {
		attachNativeTerminal,
		detachNativeTerminal,
		resizeNativeTerminal,
		setNativeTerminalColors,
		setNativeTerminalVisible,
		onSessionTerminalExit
	} from '$lib/utils/terminal';

	let {
		terminalId,
		active
	}: {
		/** The server terminal it shows, which keys its view; fixed for this component's life (the parent re-keys). */
		terminalId: string;
		active: boolean;
	} = $props();

	let container: HTMLDivElement;
	let unlistenExit: (() => void) | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let mutationObserver: MutationObserver | null = null;
	let exited = $state(false);
	let terminalError = $state('');
	let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
	let created = $state(false);
	let overlayOpen = $state(false);
	/** Set by onDestroy: the async onMount checks it after each await, so no view outlives the pane. */
	let destroyed = false;

	// Convert DOM coordinates to NSView coordinates.
	// NSView uses points (same as CSS pixels) but y=0 is at the bottom.
	function domToNSView(rect: DOMRect): { x: number; y: number; width: number; height: number } {
		const windowHeight = window.innerHeight;
		return {
			x: rect.left,
			y: windowHeight - rect.bottom, // NSView y is from bottom
			width: rect.width,
			height: rect.height
		};
	}

	// Detect open overlays (sheets, dialogs) that render in the webview
	// and would appear behind the native terminal view.
	function checkOverlayOpen(): boolean {
		return document.querySelector('[data-state="open"][role="dialog"]') !== null;
	}

	function debouncedResize() {
		if (resizeTimeout) clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			if (!container || !created || exited) return;
			const rect = container.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			const nsRect = domToNSView(rect);
			void resizeNativeTerminal(terminalId, nsRect.x, nsRect.y, nsRect.width, nsRect.height);
		}, 100);
	}

	const palette = $derived(TERMINAL_PALETTES[themePrefs.theme]);

	watch(
		() => palette,
		(colors) => {
			if (created && !exited) void setNativeTerminalColors(terminalId, colors);
		},
		{ lazy: true }
	);

	// Show/hide based on active state AND overlay state.
	// Also re-measure and resize when becoming active, since the container
	// may have been display:none (class:hidden) when first mounted.
	watch(
		() => [created, exited, active, overlayOpen],
		() => {
			if (!created || exited) return;
			const shouldBeVisible = active && !overlayOpen;
			void setNativeTerminalVisible(terminalId, shouldBeVisible);
			if (active && container) {
				requestAnimationFrame(() => {
					const rect = container.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						const nsRect = domToNSView(rect);
						void resizeNativeTerminal(terminalId, nsRect.x, nsRect.y, nsRect.width, nsRect.height);
					}
				});
			}
		}
	);

	onMount(async () => {
		try {
			// Listen before attaching, so an exit right after the attach isn't missed.
			// Without the listener the view still attaches; only the exit overlay is lost.
			unlistenExit = await onSessionTerminalExit(terminalId, () => {
				exited = true;
			}).catch((e) => {
				log.warn('NativeTerminalPane', 'exit listener failed:', e);
				return null;
			});
			if (destroyed) {
				unlistenExit?.();
				return;
			}

			const rect = container.getBoundingClientRect();
			const nsRect = domToNSView(rect);
			const attachedWith = palette;

			await attachNativeTerminal({
				terminalId,
				x: nsRect.x,
				y: nsRect.y,
				width: nsRect.width,
				height: nsRect.height,
				fontSize: fontPrefs.value.terminalSize,
				palette: attachedWith
			});

			if (destroyed) {
				// onDestroy ran mid-attach, before there was a view to take down.
				void detachNativeTerminal(terminalId);
				return;
			}
			created = true;
			// The theme changed while attaching; the watch skipped it.
			if (palette !== attachedWith) void setNativeTerminalColors(terminalId, palette);

			// Set initial visibility
			if (!active) {
				await setNativeTerminalVisible(terminalId, false);
				if (destroyed) return;
			}

			// Track size changes
			resizeObserver = new ResizeObserver(() => {
				debouncedResize();
			});
			resizeObserver.observe(container);

			// Watch for overlay dialogs/sheets so we can hide the native
			// terminal view (it renders above the webview).
			overlayOpen = checkOverlayOpen();
			mutationObserver = new MutationObserver(() => {
				overlayOpen = checkOverlayOpen();
			});
			mutationObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ['data-state'],
				subtree: true,
				childList: true
			});
		} catch (error) {
			if (!destroyed) terminalError = `Failed to show native terminal: ${String(error)}`;
		}
	});

	onDestroy(() => {
		destroyed = true;
		if (resizeTimeout) clearTimeout(resizeTimeout);
		unlistenExit?.();
		resizeObserver?.disconnect();
		mutationObserver?.disconnect();
		// Only the view goes: the terminal is the server's, and ends when its pane closes.
		if (created && !exited) {
			void detachNativeTerminal(terminalId);
		}
	});
</script>

<div class="native-terminal-wrapper" style:background={palette.background} bind:this={container}>
	{#if terminalError}
		<div class="terminal-error" style:background={palette.background}>
			<div class="text-center">
				<p>{terminalError}</p>
				<button
					class="mt-2 rounded bg-wb-ink/10 px-3 py-1 text-xs hover:bg-wb-ink/20"
					type="button"
					onclick={() => (terminalError = '')}
				>
					Dismiss
				</button>
			</div>
		</div>
	{/if}
	{#if exited}
		<div class="terminal-error" style:background={palette.background}>
			<p class="text-sm text-muted-foreground">[process exited]</p>
		</div>
	{/if}
</div>

<style>
	.native-terminal-wrapper {
		position: relative;
		height: 100%;
		width: 100%;
		overflow: hidden;
		box-sizing: border-box;
	}

	.terminal-error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--wb-err);
		font-size: 13px;
	}
</style>
