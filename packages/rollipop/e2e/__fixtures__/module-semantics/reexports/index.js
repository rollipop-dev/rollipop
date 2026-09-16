import { actions } from './barrel.js';
import { renamed } from './reexport.js';
import { group } from './outer.js';
import {
  count,
  increment,
  keptGroup,
  local,
  namedDefault,
  value,
} from './kept.js';

actions.increment();
increment();

globalThis.result = [
  Object.keys(actions).sort(),
  actions.value,
  renamed === actions,
  renamed.value,
  globalThis.reexportExecuted,
  value.answer,
  count,
  local,
  namedDefault,
  group.nestedValue(),
  keptGroup.nestedValue(),
];
