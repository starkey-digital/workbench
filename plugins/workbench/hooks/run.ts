// The `run_in_terminal` tool: Claude hands the person a shell command to run
// themselves (an interactive login, anything needing a browser or a TTY). The
// chat shows it with Run, which opens a new Workbench terminal running it, and
// Done or Skip, which answer the call so Claude carries on by itself.

export const RUN_TOOL_NAME = 'run_in_terminal';

export const RUN_TOOL_SPEC = {
	name: RUN_TOOL_NAME,
	description:
		'Ask the person to run a shell command themselves, in a new Workbench terminal they open with one click. ' +
		'Use it instead of telling them to type `! <command>` whenever they must run something you cannot: ' +
		'interactive logins (`stripe login`, `gh auth login`, `gcloud auth login`), anything that opens a browser, ' +
		'prompts for a password or needs a TTY. Waits until they mark it done or skip it, then returns which. ' +
		"You do not see the command's output: check its effect yourself afterwards if it matters.",
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'One shell command line, exactly as it should run.' },
			reason: { type: 'string', description: 'Why they need to run it, in one short sentence.' }
		},
		required: ['command'],
		additionalProperties: false
	}
};

export type RunInput = { command: string; reason?: string };

/** The call's input when it is one usable command line; else why not. */
export function runInput(input: unknown): RunInput | string {
	const { command, reason } = (input ?? {}) as { command?: unknown; reason?: unknown };
	if (typeof command !== 'string' || !command.trim()) return 'No command given.';
	if (/[\r\n]/.test(command.trim()))
		return 'Give one command line; chain steps with && or ask for each in turn.';
	return {
		command: command.trim(),
		...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {})
	};
}

/** What Claude reads: the chat's answer, or that no chat showed it. */
export function runResult(command: string, answer: { behavior?: string } | null): string {
	if (!answer)
		return (
			'No Workbench chat is showing this session, so nothing was shown. ' +
			`Ask the person to run it themselves: \`! ${command}\``
		);
	return answer.behavior === 'allow'
		? `The person ran \`${command}\` in a Workbench terminal and marked it done. ` +
				'Its output is not visible to you: check its effect if it matters.'
		: `The person chose not to run \`${command}\`. Ask before trying another way.`;
}
