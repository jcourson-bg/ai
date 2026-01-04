// Context Manager
export { Context, createContext } from './context';

// Filters (cheap, run every buildPrompt)
export {
  keepRecent,
  redact,
  redactOldToolResults,
  remove,
  truncate,
} from './filters';

// Compactors (expensive, run periodically)
export { concatenate, extractFacts, summarize } from './compactors';

// Token Estimation
export {
  createCharacterBasedEstimator,
  defaultTokenEstimator,
  estimatePromptTokens,
  estimateTextTokens,
} from './estimate-tokens';

// Types
export type {
  BuildPromptOptions,
  CompactOptions,
  CompactionTrigger,
  Compactor,
  ContextConfig,
  ContextSnapshot,
  Filter,
  FilterContext,
  Segment,
  TokenEstimator,
} from './types';
