// Context Window Middleware
export {
  contextWindow,
  contextWindowForModel,
  contextWindowPresets,
} from './context-window-middleware';

// Token Estimation
export {
  createCharacterBasedEstimator,
  defaultTokenEstimator,
  estimatePromptTokens,
  estimateTextTokens,
} from './estimate-tokens';

// Core Pruning Function
export { pruneContext } from './prune-context';

// Managed Context Agent
export {
  createManagedAgent,
  ManagedContextAgent,
} from './managed-context-agent';

// Types
export type {
  AnnotatedMessage,
  ContextWindowConfig,
  MessagePriority,
  PruneResult,
  PruningStrategy,
  TokenEstimator,
} from './types';

export type {
  AgentContextConfig,
  ManagedContextAgentSettings,
} from './managed-context-agent';
