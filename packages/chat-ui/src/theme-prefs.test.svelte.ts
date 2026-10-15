import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, parseThemeChoice, ThemePrefs } from './theme-prefs.svelte.ts';

describe('parseThemeChoice', () => {
	it('keeps a known choice and falls back to dark otherwise', () => {
		expect(parseThemeChoice('light')).toBe('light');
		expect(parseThemeChoice('system')).toBe('system');
		expect(parseThemeChoice(null)).toBe('dark');
		expect(parseThemeChoice('sepia')).toBe('dark');
	});
});

describe('ThemePrefs', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('saves a choice and resolves system to dark without matchMedia', () => {
		const store: Record<string, string> = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => (store[k] = v)
		});
		const prefs = new ThemePrefs();
		expect(prefs.theme).toBe('dark');

		prefs.set('light');
		expect(prefs.theme).toBe('light');
		expect(store['workbench.theme']).toBe('light');

		prefs.set('system');
		expect(prefs.theme).toBe('dark');
	});
});

describe('applyTheme', () => {
	it('toggles the dark class and the color scheme', () => {
		let dark = true;
		const root = {
			classList: { toggle: (_: string, on: boolean) => (dark = on) },
			style: { colorScheme: '' }
		} as unknown as HTMLElement;
		applyTheme('light', root);
		expect(dark).toBe(false);
		expect(root.style.colorScheme).toBe('light');
		applyTheme('dark', root);
		expect(dark).toBe(true);
	});
});
