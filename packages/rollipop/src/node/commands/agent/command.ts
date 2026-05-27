import type { CommandDefinition } from '../../types';
import { action, getAgentGuide, type AgentCommandOptions } from './action';

export const command: CommandDefinition<AgentCommandOptions> = {
  name: 'agent',
  description: 'Print guidance for connecting LLM agents to Rollipop diagnostics.',
  helpText: getAgentGuide(),
  action,
};
