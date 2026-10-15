/**
 * The font and size of terminals and chat, kept per device (a phone wants other
 * sizes than a desktop). The faces are bundled by `@workbench/theme`.
 */

import { onPrefChange, readPref, writePref } from './stored-pref.ts';

export interface FontChoice {
	id: string;
	label: string;
	/** CSS font-family; empty means the app's own font. */
	family: string;
}

const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const TERMINAL_FONTS: readonly FontChoice[] = [
	{ id: 'system', label: 'System', family: `JetBrains Mono, Cascadia Mono, ${MONO_FALLBACK}` },
	{
		id: 'jetbrains-mono',
		label: 'JetBrains Mono',
		family: `'JetBrains Mono Variable', ${MONO_FALLBACK}`
	},
	{ id: 'fira-code', label: 'Fira Code', family: `'Fira Code Variable', ${MONO_FALLBACK}` },
	{
		id: 'source-code-pro',
		label: 'Source Code Pro',
		family: `'Source Code Pro Variable', ${MONO_FALLBACK}`
	},
	{ id: 'ibm-plex-mono', label: 'IBM Plex Mono', family: `'IBM Plex Mono', ${MONO_FALLBACK}` },
	{ id: 'geist-mono', label: 'Geist Mono', family: `'Geist Mono Variable', ${MONO_FALLBACK}` }
];

export const CHAT_FONTS: readonly FontChoice[] = [
	{ id: 'system', label: 'System', family: '' },
	{ id: 'inter', label: 'Inter', family: "'Inter Variable', sans-serif" },
	{ id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: "'IBM Plex Sans Variable', sans-serif" },
	{
		id: 'atkinson-hyperlegible',
		label: 'Atkinson Hyperlegible',
		family: "'Atkinson Hyperlegible Next Variable', sans-serif"
	},
	{
		id: 'jetbrains-mono',
		label: 'JetBrains Mono',
		family: `'JetBrains Mono Variable', ${MONO_FALLBACK}`
	}
];

const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);
export const TERMINAL_FONT_SIZES: readonly number[] = range(9, 24);
export const CHAT_FONT_SIZES: readonly number[] = range(11, 24);

export interface FontPrefsValue {
	terminalFont: string;
	terminalSize: number;
	chatFont: string;
	chatSize: number;
}

export const FONT_DEFAULTS: FontPrefsValue = {
	terminalFont: 'system',
	terminalSize: 13,
	chatFont: 'system',
	chatSize: 14
};

const STORAGE_KEY = 'workbench.fonts';

/** Saved prefs, each unknown or missing field falling back to its default. */
export function parseFontPrefs(raw: string | null): FontPrefsValue {
	let saved: Partial<Record<keyof FontPrefsValue, unknown>> = {};
	try {
		saved = raw ? (JSON.parse(raw) ?? {}) : {};
	} catch {
		/* keep the defaults */
	}
	const pick = (value: unknown, choices: readonly FontChoice[], fallback: string) =>
		choices.some((c) => c.id === value) ? (value as string) : fallback;
	const size = (value: unknown, sizes: readonly number[], fallback: number) =>
		sizes.includes(value as number) ? (value as number) : fallback;
	return {
		terminalFont: pick(saved.terminalFont, TERMINAL_FONTS, FONT_DEFAULTS.terminalFont),
		terminalSize: size(saved.terminalSize, TERMINAL_FONT_SIZES, FONT_DEFAULTS.terminalSize),
		chatFont: pick(saved.chatFont, CHAT_FONTS, FONT_DEFAULTS.chatFont),
		chatSize: size(saved.chatSize, CHAT_FONT_SIZES, FONT_DEFAULTS.chatSize)
	};
}

function familyOf(choices: readonly FontChoice[], id: string): string {
	return choices.find((c) => c.id === id)?.family ?? choices[0].family;
}

export class FontPrefs {
	value = $state.raw<FontPrefsValue>(parseFontPrefs(readPref(STORAGE_KEY)));

	terminalFamily = $derived(familyOf(TERMINAL_FONTS, this.value.terminalFont));
	/** Undefined for the app's own font, so a `style:` directive leaves it alone. */
	chatFamily = $derived(familyOf(CHAT_FONTS, this.value.chatFont) || undefined);

	constructor() {
		onPrefChange(STORAGE_KEY, (raw) => (this.value = parseFontPrefs(raw)));
	}

	set(patch: Partial<FontPrefsValue>) {
		this.value = { ...this.value, ...patch };
		writePref(STORAGE_KEY, JSON.stringify(this.value));
	}
}

export const fontPrefs = new FontPrefs();

/** Waits for a bundled face so xterm measures its cells in it, not the fallback. */
async function loadFont(family: string, size: number): Promise<void> {
	try {
		await document.fonts.load(`${size}px ${family}`);
	} catch {
		/* measure with whatever is there */
	}
}

/**
 * The terminal font as xterm options, once its face has loaded: again if the
 * choice changed while it loaded, so a terminal never measures an unloaded one.
 */
export async function terminalFont(): Promise<{ fontFamily: string; fontSize: number }> {
	for (;;) {
		const fontFamily = fontPrefs.terminalFamily;
		const fontSize = fontPrefs.value.terminalSize;
		await loadFont(fontFamily, fontSize);
		if (fontFamily === fontPrefs.terminalFamily && fontSize === fontPrefs.value.terminalSize)
			return { fontFamily, fontSize };
	}
}
