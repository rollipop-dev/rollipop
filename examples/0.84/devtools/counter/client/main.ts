import { connectDevframe } from 'devframe/client';

import type { CounterState } from '../index';
import './style.css';

const count = getElement('count');
const lastAction = getElement('last-action');
const connectionStatus = getElement('connection-status');
const buttons = [getButton('decrement'), getButton('reset'), getButton('increment')];

try {
  const client = await connectDevframe({
    transport: 'sse',
    simpleAuth: false,
    otpParam: false,
  });
  await client.ensureTrusted();

  const rpc = client.scope('example-counter').rpc;
  const state = await rpc.sharedState<CounterState>('counter');
  const render = (value: CounterState) => {
    count.textContent = String(value.count);
    lastAction.textContent = value.lastAction;
  };

  render(state.value());
  state.on('updated', render);
  connectionStatus.textContent = 'Connected';

  getButton('decrement').addEventListener('click', () => rpc.call('decrement'));
  getButton('reset').addEventListener('click', () => rpc.call('reset'));
  getButton('increment').addEventListener('click', () => rpc.call('increment'));
} catch (error) {
  connectionStatus.textContent = 'Connection failed';
  lastAction.textContent = error instanceof Error ? error.message : String(error);
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function getElement(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element == null) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

function getButton(id: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (element == null) {
    throw new Error(`Missing button #${id}`);
  }
  return element;
}
