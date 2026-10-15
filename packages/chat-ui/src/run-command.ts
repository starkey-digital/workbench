import { getContext, setContext } from 'svelte';

/**
 * Opens a new terminal tab beside the chat running `command` (a login,
 * anything that needs the person). Set by a host's chat view; without one,
 * commands only show.
 */
export type RunCommand = (command: string) => void;

const KEY = Symbol('chat-run-command');

/** Call during the host component's init; chat components below it use it. */
export function setRunCommand(run: RunCommand): void {
	setContext(KEY, run);
}

export function getRunCommand(): RunCommand | undefined {
	return getContext<RunCommand | undefined>(KEY);
}

/** The terminal tab's label for a command: its start, as a tab can show it. */
export function commandTabLabel(command: string): string {
	return command.length > 32 ? `${command.slice(0, 31)}…` : command;
}
