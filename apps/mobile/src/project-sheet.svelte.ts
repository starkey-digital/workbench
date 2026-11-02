import type { ClaudeAccount } from '@workbench/types';

/** Account `<select>` values that aren't account ids: `:` never starts one. */
export const FOLLOW_ACTIVE = ':active';
export const DEFAULT_LOGIN = ':default';

/** A project's `claudeAccountId` as an option, an id this phone doesn't know included, so saving keeps it. */
export function accountOption(id: string | undefined): string {
	if (id === undefined) return FOLLOW_ACTIVE;
	return id === '' ? DEFAULT_LOGIN : id;
}

/** A saved account missing from `accounts` (removed, or added after this phone loaded them). */
export function unknownAccount(option: string, accounts: Pick<ClaudeAccount, 'id'>[]): boolean {
	return (
		option !== FOLLOW_ACTIVE && option !== DEFAULT_LOGIN && !accounts.some((a) => a.id === option)
	);
}

export function accountFromOption(option: string): string | undefined {
	if (option === FOLLOW_ACTIVE) return undefined;
	return option === DEFAULT_LOGIN ? '' : option;
}
