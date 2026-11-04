import { describe, expect, it } from 'vitest';
import { encode } from 'uqr';
import { buildPairingUri } from '@workbench/transport';
import {
	boundHost,
	boundPort,
	defaultPairingAddress,
	pairingQr,
	pairingUrl,
	reachableAddresses
} from './server-pairing';

const TOKEN = 'f'.repeat(64);

describe('boundPort', () => {
	it('reads the port from IPv4 and IPv6 socket addresses', () => {
		expect(boundPort('0.0.0.0:4317')).toBe(4317);
		expect(boundPort('[::]:51234')).toBe(51234);
	});

	it('returns null without a usable port', () => {
		expect(boundPort(null)).toBeNull();
		expect(boundPort('0.0.0.0')).toBeNull();
		expect(boundPort('0.0.0.0:0')).toBeNull();
		expect(boundPort('0.0.0.0:70000')).toBeNull();
	});
});

describe('defaultPairingAddress', () => {
	it('picks the first (best-ranked) address', () => {
		expect(
			defaultPairingAddress([
				{ interface: 'utun4', address: '100.100.1.1', tailscale: true },
				{ interface: 'en0', address: '192.168.1.2', tailscale: false }
			])
		).toBe('100.100.1.1');
		expect(defaultPairingAddress([])).toBeUndefined();
	});
});

describe('reachableAddresses', () => {
	const lan = { interface: 'en0', address: '192.168.1.5', tailscale: false };
	const ts = { interface: 'utun4', address: '100.64.0.2', tailscale: true };

	it('is every address when listening on all interfaces', () => {
		expect(reachableAddresses('0.0.0.0', [ts, lan])).toEqual([ts, lan]);
	});

	it('is only the address listened on', () => {
		expect(reachableAddresses('100.64.0.2', [ts, lan])).toEqual([ts]);
	});

	it("keeps an address this machine doesn't list", () => {
		expect(reachableAddresses('10.0.0.9', [ts, lan])).toEqual([
			{ interface: '', address: '10.0.0.9', tailscale: false }
		]);
	});

	it('is nothing for loopback, which no other device reaches', () => {
		expect(reachableAddresses('127.0.0.1', [ts, lan])).toEqual([]);
	});
});

describe('boundHost', () => {
	it('drops the port and IPv6 brackets', () => {
		expect(boundHost('100.64.0.2:4317')).toBe('100.64.0.2');
		expect(boundHost('[::]:4317')).toBe('::');
		expect(boundHost(null)).toBeNull();
	});
});

describe('pairingQr', () => {
	it('encodes the pairing URI for the chosen address and bound port', () => {
		const qr = pairingQr('100.100.1.1', 4317, TOKEN);
		const expected = encode(
			buildPairingUri({ url: pairingUrl('100.100.1.1', 4317), token: TOKEN }),
			{ border: 2 }
		);
		expect(qr.size).toBe(expected.data.length);
		const darkModules = expected.data.flat().filter(Boolean).length;
		expect(qr.path.match(/M/g)).toHaveLength(darkModules);
		expect(qr.path.startsWith('M')).toBe(true);
	});

	it('changes when the token rotates', () => {
		expect(pairingQr('10.0.0.2', 4317, TOKEN).path).not.toBe(
			pairingQr('10.0.0.2', 4317, 'e'.repeat(64)).path
		);
	});
});
