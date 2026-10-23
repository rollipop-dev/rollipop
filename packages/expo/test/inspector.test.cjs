const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const events = require('node:events');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const { default: createExpoInspector } = require('../dist/inspector.cjs');

void test('Expo native Network inspector stays connected and closes with the dev server', async () => {
  const api = await import('rollipop');
  const root = path.resolve(__dirname, '../../../examples/expo-58');
  const inspector = createExpoInspector(resolveExpoCompatibility(root), 'http://localhost:0');
  const network = inspector.websocketEndpoints['/inspector/network'];
  const server = await api.createDevServer(await api.getDefaultConfig(root, 'development'), {
    host: '127.0.0.1',
    port: 0,
    inspector,
  });
  let socket;
  try {
    const address = await server.instance.listen({ host: '127.0.0.1', port: 0 });
    socket = new WebSocket(`${address.replace('http:', 'ws:')}/inspector/network`);
    await events.once(socket, 'open', { signal: AbortSignal.timeout(5000) });
    socket.send(
      JSON.stringify({ method: 'Network.requestWillBeSent', params: { requestId: 'test' } }),
    );
    await delay(100);
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(network.clients.size, 1);
    const closed = events.once(socket, 'close', { signal: AbortSignal.timeout(5000) });
    await server.instance.close();
    await closed;
    assert.equal(network.clients.size, 0);
  } finally {
    socket?.close();
    await server.instance.close();
  }
});
