import { describe, it, expect, vi } from 'vitest';

const error = vi.fn();
vi.mock('svelte-sonner', () => ({ toast: { error: (m: string) => error(m) } }));

import { attempt } from './attempt';

describe('attempt', () => {
	it('returns what the step returns', async () => {
		expect(await attempt('load projects', async () => 3)).toBe(3);
		expect(error).not.toHaveBeenCalled();
	});

	it('shows a failure, string rejections included, and carries on', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await attempt('load projects', () => Promise.reject('the file is corrupt'));
		expect(result).toBeUndefined();
		expect(error).toHaveBeenCalledWith("Couldn't load projects: the file is corrupt");
		expect(log).toHaveBeenCalledWith('[attempt] load projects failed:', 'the file is corrupt');
		log.mockRestore();
	});
});
