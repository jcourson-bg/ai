import { LanguageModelV3 } from '@ai-sdk/provider';
import {
  Agent,
  AgentCallParameters,
  AgentStreamParameters,
} from '../agent/agent';
import { ToolLoopAgent } from '../agent/tool-loop-agent';
import { ToolLoopAgentSettings } from '../agent/tool-loop-agent-settings';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { resolveLanguageModel } from '../model/resolve-model';
import { LanguageModel } from '../types/language-model';
import { contextWindow, contextWindowPresets } from './context-window-middleware';
import {
  ContextWindowConfig,
  MessagePriority,
  PruneResult,
} from './types';

/**
 * Configuration for context management in an agent.
 */
export interface AgentContextConfig {
  /**
   * Maximum tokens for the prompt. Required unless using a preset.
   */
  maxPromptTokens?: number;

  /**
   * Use a preset for a known model. This sets maxPromptTokens automatically.
   */
  preset?: keyof typeof contextWindowPresets;

  /**
   * Strategy for pruning messages.
   * @default 'sliding-window'
   */
  strategy?: ContextWindowConfig['strategy'];

  /**
   * Number of recent messages to always keep.
   * @default 3
   */
  keepRecentMessages?: number;

  /**
   * Custom token estimator function.
   */
  estimateTokens?: ContextWindowConfig['estimateTokens'];

  /**
   * Custom priority assignment for messages.
   */
  assignPriority?: ContextWindowConfig['assignPriority'];

  /**
   * Callback when messages are pruned.
   */
  onPrune?: (result: PruneResult) => void;
}

/**
 * Settings for ManagedContextAgent.
 */
export type ManagedContextAgentSettings<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> = Omit<ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>, 'model'> & {
  /**
   * The language model to use.
   */
  model: LanguageModel;

  /**
   * Context management configuration.
   *
   * When provided, the agent automatically manages the context window
   * to prevent exceeding token limits.
   *
   * @example Using a preset
   * ```ts
   * context: { preset: 'gpt-4o' }
   * ```
   *
   * @example Custom configuration
   * ```ts
   * context: {
   *   maxPromptTokens: 100000,
   *   strategy: 'priority-based',
   *   onPrune: (result) => console.log(`Pruned ${result.removedCount} messages`)
   * }
   * ```
   */
  context: AgentContextConfig;
};

/**
 * An agent with built-in context management.
 *
 * This agent automatically manages the context window, pruning older
 * messages when the conversation exceeds the token limit. It combines
 * the power of the ToolLoopAgent with intelligent context management.
 *
 * @example Basic usage
 * ```ts
 * import { ManagedContextAgent } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const agent = new ManagedContextAgent({
 *   model: openai('gpt-4o'),
 *   context: { preset: 'gpt-4o' },
 *   instructions: 'You are a helpful assistant.',
 *   tools: {
 *     // your tools
 *   },
 * });
 *
 * // The agent can handle arbitrarily long conversations
 * const result = await agent.generate({
 *   messages: veryLongConversationHistory,
 * });
 * ```
 *
 * @example With priority-based pruning
 * ```ts
 * const agent = new ManagedContextAgent({
 *   model: openai('gpt-4o'),
 *   context: {
 *     maxPromptTokens: 100000,
 *     strategy: 'priority-based',
 *     assignPriority: (message) => {
 *       if (message.role === 'system') return 'critical';
 *       if (message.role === 'user') return 'high';
 *       if (message.role === 'tool') return 'low';
 *       return 'normal';
 *     },
 *     onPrune: (result) => {
 *       console.log(`Context pruned: removed ${result.removedCount} messages`);
 *     },
 *   },
 *   instructions: 'You are a research assistant.',
 *   tools: { search, analyze },
 * });
 * ```
 */
export class ManagedContextAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, OUTPUT>
{
  readonly version = 'agent-v1' as const;

  private readonly settings: ManagedContextAgentSettings<
    CALL_OPTIONS,
    TOOLS,
    OUTPUT
  >;
  private readonly managedModel: LanguageModel;
  private readonly innerAgent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;

  constructor(
    settings: ManagedContextAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
  ) {
    this.settings = settings;

    // Resolve context configuration
    const contextConfig = this.resolveContextConfig(settings.context);

    // Resolve and wrap the model with context management
    const resolvedModel = resolveLanguageModel(settings.model);
    this.managedModel = wrapLanguageModel({
      model: resolvedModel,
      middleware: contextWindow(contextConfig),
    });

    // Create inner agent with the wrapped model
    this.innerAgent = new ToolLoopAgent({
      ...settings,
      model: this.managedModel,
    });
  }

  private resolveContextConfig(
    config: AgentContextConfig,
  ): ContextWindowConfig {
    // Get maxPromptTokens from preset or direct config
    let maxPromptTokens: number;

    if (config.preset) {
      const preset = contextWindowPresets[config.preset];
      maxPromptTokens = preset.maxPromptTokens;
    } else if (config.maxPromptTokens) {
      maxPromptTokens = config.maxPromptTokens;
    } else {
      throw new Error(
        'ManagedContextAgent requires either context.preset or context.maxPromptTokens',
      );
    }

    return {
      maxPromptTokens,
      strategy: config.strategy ?? 'sliding-window',
      keepRecentMessages: config.keepRecentMessages ?? 3,
      estimateTokens: config.estimateTokens,
      assignPriority: config.assignPriority ?? this.defaultAssignPriority,
      onPrune: config.onPrune,
    };
  }

  /**
   * Default priority assignment that makes intelligent choices:
   * - System messages are critical
   * - User messages are high priority
   * - Recent assistant messages are normal
   * - Tool messages are low priority
   */
  private defaultAssignPriority = (
    message: { role: string },
    index: number,
    messages: { role: string }[],
  ): MessagePriority => {
    if (message.role === 'system') {
      return 'critical';
    }

    if (message.role === 'user') {
      return 'high';
    }

    if (message.role === 'tool') {
      return 'low';
    }

    // Recent assistant messages are more important
    const isRecent = index >= messages.length - 4;
    return isRecent ? 'normal' : 'low';
  };

  /**
   * The id of the agent.
   */
  get id(): string | undefined {
    return this.settings.id;
  }

  /**
   * The tools available to the agent.
   */
  get tools(): TOOLS {
    return this.settings.tools as TOOLS;
  }

  /**
   * The managed model with context window handling.
   */
  get model(): LanguageModel {
    return this.managedModel;
  }

  /**
   * Generates a response (non-streaming).
   */
  async generate(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
    return this.innerAgent.generate(options);
  }

  /**
   * Streams a response.
   */
  async stream(
    options: AgentStreamParameters<CALL_OPTIONS, TOOLS>,
  ): Promise<StreamTextResult<TOOLS, OUTPUT>> {
    return this.innerAgent.stream(options);
  }
}

/**
 * Creates a ManagedContextAgent with the given settings.
 *
 * This is a convenience function for creating agents with context management.
 *
 * @example
 * ```ts
 * const agent = createManagedAgent({
 *   model: openai('gpt-4o'),
 *   context: { preset: 'gpt-4o' },
 *   instructions: 'You are helpful.',
 * });
 * ```
 */
export function createManagedAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
>(
  settings: ManagedContextAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
): ManagedContextAgent<CALL_OPTIONS, TOOLS, OUTPUT> {
  return new ManagedContextAgent(settings);
}
