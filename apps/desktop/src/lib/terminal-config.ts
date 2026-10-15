import type { ITerminalOptions } from '@xterm/xterm';
import { TERMINAL_PALETTES, type Theme } from '@workbench/chat-ui';

export const terminalOptions: ITerminalOptions = {
	allowProposedApi: true,
	allowTransparency: false,
	convertEol: false,
	cursorBlink: true,
	lineHeight: 1.0,
	scrollback: 5000
};

export function searchDecorations(theme: Theme) {
	const { yellow, cursor } = TERMINAL_PALETTES[theme];
	return {
		matchBackground: yellow + '33',
		matchBorder: yellow + '66',
		matchOverviewRuler: yellow,
		activeMatchBackground: cursor + '44',
		activeMatchBorder: cursor,
		activeMatchColorOverviewRuler: cursor
	};
}
