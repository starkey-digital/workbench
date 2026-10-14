/** Small, platform-neutral helpers for native Codex controls. */
export function pcm16(samples: Float32Array): string {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
	}
	return btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join(''));
}

export function decodeAudio(data: string): Float32Array {
	const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
	if (bytes.length % 2) throw new Error('Invalid PCM audio');
	const view = new DataView(bytes.buffer);
	return Float32Array.from(
		{ length: bytes.length / 2 },
		(_, i) => view.getInt16(i * 2, true) / 32768
	);
}

/** The end of a Codex task's output, from an `inspect` of its thread. */
export function codexTaskOutput(result: unknown): { text: string; bytes: number } {
	const entries = (
		result as {
			data?: {
				item: { text?: string; aggregatedOutput?: string; content?: { text?: string }[] };
			}[];
		}
	).data;
	const text = [...(entries ?? [])]
		.reverse()
		.flatMap(({ item }) =>
			item.text
				? [item.text]
				: item.aggregatedOutput
					? [item.aggregatedOutput]
					: (item.content ?? []).flatMap((c) => (c.text ? [c.text] : []))
		)
		.join('\n\n');
	return { text: text.slice(-65536), bytes: new TextEncoder().encode(text).length };
}
