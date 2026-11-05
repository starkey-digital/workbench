/** A clone URL from what was typed: a URL as is, `owner/repo` on GitHub, blank as blank. */
export function repoUrl(input: string): string {
	const s = input.trim();
	if (!s) return '';
	if (s.includes('://') || s.startsWith('git@')) return s;
	return `https://github.com/${s}`;
}
