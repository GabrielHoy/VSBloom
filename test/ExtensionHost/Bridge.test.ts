import * as assert from 'assert';
import * as WS from 'ws';
import { GetExtensionAPI } from './Helpers/GetExtensionAPI';
import type { TestBridgeServer } from './Helpers/ExtensionHostTypes';

suite('Bridge', () => {
	let testBridge: TestBridgeServer;

	suiteSetup(async () => {
		const api = await GetExtensionAPI();
		testBridge = api.GetBridgeServer();
	});

	test('bridge server is running after activation', () => {
		assert.strictEqual(testBridge.IsRunning(), true);
	});

	test('GetServerPort returns a valid port number', () => {
		const port = testBridge.GetServerPort();
		assert.strictEqual(typeof port, 'number');
		assert.ok(port > 0 && port <= 65535, `Port ${port} should be in valid range`);
	});

	test('GetAuthToken returns a non-empty string', () => {
		const token = testBridge.GetAuthToken();
		assert.strictEqual(typeof token, 'string');
		assert.ok(token.length > 0, 'Auth token should be non-empty');
	});

	test('connection with wrong token is closed with code 4001', (done) => {
		const url = `ws://127.0.0.1:${testBridge.GetServerPort()}?token=definitely-wrong-token`;
		const ws = new WS.WebSocket(url);
		ws.on('close', (code: number) => {
			assert.strictEqual(code, 4001, 'Unauthorized connection should close with 4001');
			done();
		});
		ws.on('error', (err: Error) => done(err));
	});

	test('connection with no token is closed with code 4001', (done) => {
		const url = `ws://127.0.0.1:${testBridge.GetServerPort()}`;
		const ws = new WS.WebSocket(url);
		ws.on('close', (code: number) => {
			assert.strictEqual(code, 4001);
			done();
		});
		ws.on('error', (err: Error) => done(err));
	});

	test('authorised connection receives replicate-extension-config after client-ready', (done) => {
		const url = `ws://127.0.0.1:${testBridge.GetServerPort()}?token=${testBridge.GetAuthToken()}`;
		const ws = new WS.WebSocket(url);
		ws.on('open', () => {
			ws.send(JSON.stringify({ type: 'client-ready', windowId: 'bridge-test-window' }));
		});
		ws.on('message', (data: WS.RawData) => {
			const msg = JSON.parse(data.toString()) as { type: string };
			if (msg.type === 'replicate-extension-config') {
				ws.close();
				done();
			}
		});
		ws.on('error', (err: Error) => done(err));
	});

	test('OnClientReady event fires when a client completes the handshake', (done) => {
		const windowId = `test-onready-${Date.now()}`;
		const disposable = testBridge.OnClientReady((readyWindowId) => {
			if (readyWindowId === windowId) {
				disposable.dispose();
				done();
			}
		});

		const url = `ws://127.0.0.1:${testBridge.GetServerPort()}?token=${testBridge.GetAuthToken()}`;
		const ws = new WS.WebSocket(url);
		ws.on('open', () => {
			ws.send(JSON.stringify({ type: 'client-ready', windowId }));
		});
		ws.on('error', (err: Error) => {
			disposable.dispose();
			done(err);
		});
	});

	test('GetClientCount increments after client-ready and decrements on disconnect', (done) => {
		const countBefore = testBridge.GetClientCount();
		const windowId = `test-count-${Date.now()}`;

		const url = `ws://127.0.0.1:${testBridge.GetServerPort()}?token=${testBridge.GetAuthToken()}`;
		const ws = new WS.WebSocket(url);

		const readyDisposable = testBridge.OnClientReady((id) => {
			if (id !== windowId) {
				return;
			}
			readyDisposable.dispose();

			assert.strictEqual(
				testBridge.GetClientCount(),
				countBefore + 1,
				'Client count should increase after connection',
			);

			const disconnectDisposable = testBridge.OnClientDisconnected((disconnectedId) => {
				if (disconnectedId !== windowId) {
					return;
				}
				disconnectDisposable.dispose();
				assert.strictEqual(
					testBridge.GetClientCount(),
					countBefore,
					'Client count should return to original after disconnect',
				);
				done();
			});

			ws.close();
		});

		ws.on('open', () => {
			ws.send(JSON.stringify({ type: 'client-ready', windowId }));
		});
		ws.on('error', (err: Error) => {
			readyDisposable.dispose();
			done(err);
		});
	});
});
