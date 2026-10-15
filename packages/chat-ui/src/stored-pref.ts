/**
 * A per-device pref in localStorage. Every access is guarded: storage can
 * throw (private mode, blocked site data), and then a pref lasts the session.
 */
export function readPref(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writePref(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* applies to this session only */
	}
}

/** Another window (the desktop's settings) changed it. */
export function onPrefChange(key: string, apply: (raw: string | null) => void): void {
	if (typeof window !== 'undefined')
		window.addEventListener('storage', (e) => {
			if (e.key === key) apply(e.newValue);
		});
}
