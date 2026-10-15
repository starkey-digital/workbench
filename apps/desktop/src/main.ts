import './app.css';
import { mount } from 'svelte';
import { initSentry } from '$lib/sentry';
import { applyTheme, themePrefs } from '@workbench/chat-ui';

// Error tracking — no-op in dev, reports only in production builds.
initSentry();

// Before mount, so the first paint is already in the chosen theme.
applyTheme(themePrefs.theme);

const target = document.getElementById('app')!;

// `index.html?view=settings` is loaded by the dedicated settings OS window;
// every other window mounts the main app shell.
const view = new URLSearchParams(window.location.search).get('view');

const app =
	view === 'settings'
		? mount((await import('./SettingsWindow.svelte')).default, { target })
		: mount((await import('./App.svelte')).default, { target });

export default app;
