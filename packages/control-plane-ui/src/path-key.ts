/** One spelling per folder: `/` separators, no trailing one, a Windows drive path in lower case. */
export function pathKey(path: string): string {
	const key = path.replace(/\\/g, '/').replace(/(?<=.)\/+$/, '');
	return /^[A-Za-z]:\//.test(key) ? key.toLowerCase() : key;
}
