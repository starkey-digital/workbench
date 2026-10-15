/**
 * Light or dark, kept per device like the fonts: a phone outdoors wants light
 * while the desktop stays dark. `system` follows the OS.
 */
import { MediaQuery } from 'svelte/reactivity';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const THEME_CHOICES: readonly { id: ThemeChoice; label: string }[] = [
	{ id: 'dark', label: 'Dark' },
	{ id: 'light', label: 'Light' },
	{ id: 'system', label: 'System' }
];

const STORAGE_KEY = 'workbench.theme';

export function parseThemeChoice(raw: string | null): ThemeChoice {
	return THEME_CHOICES.some((c) => c.id === raw) ? (raw as ThemeChoice) : 'dark';
}

function read(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export class ThemePrefs {
	choice = $state<ThemeChoice>(parseThemeChoice(read()));

	// jsdom has no matchMedia.
	#systemDark =
		typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? new MediaQuery('(prefers-color-scheme: dark)', true)
			: undefined;

	theme: Theme = $derived(
		this.choice !== 'system' ? this.choice : this.#systemDark?.current === false ? 'light' : 'dark'
	);

	constructor() {
		// Another window (the desktop's settings) changed it.
		if (typeof window !== 'undefined')
			window.addEventListener('storage', (e) => {
				if (e.key === STORAGE_KEY) this.choice = parseThemeChoice(e.newValue);
			});
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		try {
			localStorage.setItem(STORAGE_KEY, choice);
		} catch {
			/* applies to this session only */
		}
	}
}

export const themePrefs = new ThemePrefs();

/** Puts `theme` on the document: the `.dark` class the tokens key off, and native controls. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
}

/** An xterm `ITheme` without depending on xterm here. */
export interface TerminalPalette {
	background: string;
	foreground: string;
	cursor: string;
	selectionBackground: string;
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
}

/** The light palette darkens every ANSI colour so each reads on the pale background. */
export const TERMINAL_PALETTES: Record<Theme, TerminalPalette> = {
	dark: {
		background: '#1a1a1e',
		foreground: '#dcdcde',
		cursor: '#c4b5fd',
		selectionBackground: '#7c3aed33',
		black: '#1a1a1e',
		red: '#f87171',
		green: '#4ade80',
		yellow: '#fbbf24',
		blue: '#93a3f8',
		magenta: '#c4b5fd',
		cyan: '#67e8f9',
		white: '#e4e4e7',
		brightBlack: '#63636e',
		brightRed: '#fca5a5',
		brightGreen: '#86efac',
		brightYellow: '#fde68a',
		brightBlue: '#b4bffc',
		brightMagenta: '#ddd6fe',
		brightCyan: '#a5f3fc',
		brightWhite: '#fafafa'
	},
	light: {
		background: '#fbfbfc',
		foreground: '#1f2328',
		cursor: '#6d28d9',
		selectionBackground: '#6d28d933',
		black: '#1f2328',
		red: '#c4262e',
		green: '#1a7f37',
		yellow: '#8a5a00',
		blue: '#0b5cd5',
		magenta: '#8a3fc7',
		cyan: '#0a7285',
		white: '#6e7781',
		brightBlack: '#57606a',
		brightRed: '#a40e26',
		brightGreen: '#116329',
		brightYellow: '#6c4400',
		brightBlue: '#0550ae',
		brightMagenta: '#6e2bab',
		brightCyan: '#045c6b',
		brightWhite: '#8c959f'
	}
};
