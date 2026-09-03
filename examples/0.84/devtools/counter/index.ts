import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import { defineDevframe, defineRpcFunction } from 'devframe';

export interface CounterState {
  count: number;
  lastAction: string;
}

const clientAssetsPath = fileURLToPath(new URL('./dist', import.meta.url));

if (!existsSync(clientAssetsPath)) {
  console.warn(chalk.yellow('Run `yarn devtools:build` to build the devframe client assets.\n'));
}

export const counterDevframe = defineDevframe({
  id: 'example-counter',
  name: 'Counter',
  version: '1.0.0',
  packageName: 'example-0.84',
  homepage: 'https://github.com/rollipop-dev/rollipop',
  description: 'A shared-state counter',
  icon: 'ph:timer-duotone',
  clientAssets: clientAssetsPath,
  capabilities: {
    dev: true,
    build: false,
  },
  async setup(context) {
    const rpc = context.scope('example-counter').rpc;
    const state = await rpc.sharedState<CounterState>('counter', {
      initialValue: {
        count: 0,
        lastAction: 'Ready',
      },
    });

    rpc.register(
      defineRpcFunction({
        name: 'decrement',
        type: 'action',
        handler: () => {
          state.mutate((draft) => {
            draft.count -= 1;
            draft.lastAction = 'Decremented';
          });
        },
      }),
    );
    rpc.register(
      defineRpcFunction({
        name: 'increment',
        type: 'action',
        handler: () => {
          state.mutate((draft) => {
            draft.count += 1;
            draft.lastAction = 'Incremented';
          });
        },
      }),
    );
    rpc.register(
      defineRpcFunction({
        name: 'reset',
        type: 'action',
        handler: () => {
          state.mutate((draft) => {
            draft.count = 0;
            draft.lastAction = 'Reset';
          });
        },
      }),
    );
  },
});
