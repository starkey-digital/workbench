import './app.css';
import { mount } from 'svelte';
import { applyTheme, themePrefs } from '@workbench/chat-ui';
import App from './App.svelte';
import { initSentry } from './sentry';

// Before mount, so the first paint is already in the chosen theme.
applyTheme(themePrefs.theme);

async function boot() {
	initSentry();
	// Forward console.* to the Rust log plugin (→ logcat on Android). Best-effort:
	// never let logging setup block the app from mounting.
	try {
		const { attachConsole } = await import('@tauri-apps/plugin-log');
		await attachConsole();
	} catch {
		/* logging optional */
	}

	mount(App, { target: document.getElementById('app')! });
}

boot();
