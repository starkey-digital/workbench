import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_DEFAULTS, FontPrefs, parseFontPrefs } from './font-prefs.svelte.ts';

describe('parseFontPrefs', () => {
	it('falls back to the defaults for nothing saved or unreadable JSON', () => {
		expect(parseFontPrefs(null)).toEqual(FONT_DEFAULTS);
		expect(parseFontPrefs('{oops')).toEqual(FONT_DEFAULTS);
		expect(parseFontPrefs('null')).toEqual(FONT_DEFAULTS);
	});

	it('keeps known choices and replaces unknown ones field by field', () => {
		expect(
			parseFontPrefs(
				JSON.stringify({
					terminalFont: 'fira-code',
					terminalSize: 99,
					chatFont: 'comic',
					chatSize: 18
				})
			)
		).toEqual({ terminalFont: 'fira-code', terminalSize: 13, chatFont: 'system', chatSize: 18 });
	});
});

describe('FontPrefs', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('saves a change and resolves its CSS families', () => {
		const store: Record<string, string> = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => (store[k] = v)
		});
		const prefs = new FontPrefs();
		expect(prefs.chatFamily).toBeUndefined();

		prefs.set({ terminalFont: 'jetbrains-mono', chatFont: 'inter', chatSize: 16 });

		expect(prefs.terminalFamily).toMatch(/^'JetBrains Mono Variable'/);
		expect(prefs.chatFamily).toMatch(/^'Inter Variable'/);
		expect(new FontPrefs().value).toEqual({
			...FONT_DEFAULTS,
			terminalFont: 'jetbrains-mono',
			chatFont: 'inter',
			chatSize: 16
		});
	});

	it('still applies a change when storage throws', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		const prefs = new FontPrefs();
		prefs.set({ terminalSize: 16 });
		expect(prefs.value.terminalSize).toBe(16);
	});
});
