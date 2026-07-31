import { emit } from '@jz92/ai-core';
import type { AIEnvironment } from '@jz92/ai-core';
import { observe } from './observe.js';
import { think } from './think.js';
import { act } from './act.js';
import { reflect } from './reflect.js';
import type { AgentState } from './types.js';
import { critique } from './critique.js';

const getEnv = (): AIEnvironment =>
  (process.env.NODE_ENV as AIEnvironment) ?? 'development';

export type RunAgentConfig = {
  task: string;
  domain: string;
  maxIterations?: number;
  traceId?: string;
};

export type RunAgentResult = {
  finalAnswer: string | null;
  state: AgentState;
  iterationsUsed: number;
  maxIterationsExceeded: boolean;
};

const DEFAULT_MAX_ITERATIONS = 8;

// ── runAgent ─────────────────────────────────────────────────────────────────
// The actual ReAct loop: observe -> think -> act -> reflect, repeated until
// reflect() signals completion or maxIterations is hit. The guard here is what
// stops a genuinely runaway loop from calling the model forever — this is the
// one piece of Phase 1 that's a real safety mechanism, not just structure.

export const runAgent = async (
  config: RunAgentConfig,
): Promise<RunAgentResult> => {
  const { task, domain, traceId } = config;
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let state: AgentState = {
    domain,
    task,
    messages: [],
    iteration: 0,
    maxIterations,
    traceId,
  };

  while (state.iteration < maxIterations) {
    emit({
      source: 'agents',
      type: 'loop.iteration',
      traceId: traceId ?? '',
      timestamp: new Date().toISOString(),
      durationMs: 0,
      env: getEnv(),
      domain,
      iteration: state.iteration,
      maxIterations,
    });

    const { state: observedState } = observe(state);
    const thinkResult = await think(observedState);
    const actResult = await act(thinkResult);
    const { state: reflectedState, isDone, finalAnswer } = reflect(actResult);

    if (isDone && finalAnswer) {
      const critiqueResult = await critique(reflectedState, finalAnswer);

      emit({
        source: 'agents',
        type: 'loop.complete',
        traceId: traceId ?? '',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        env: getEnv(),
        domain,
        iteration: reflectedState.iteration,
        maxIterations,
      });

      return {
        finalAnswer: critiqueResult.finalAnswer,
        state: reflectedState,
        iterationsUsed: reflectedState.iteration + 1,
        maxIterationsExceeded: false,
      };
    }

    state = { ...reflectedState, iteration: reflectedState.iteration + 1 };
  }

  // Loop exhausted its budget without the model signalling completion —
  // this is the guard actually firing, not a silent infinite loop.
  emit({
    source: 'agents',
    type: 'loop.max_iterations_exceeded',
    traceId: traceId ?? '',
    timestamp: new Date().toISOString(),
    durationMs: 0,
    env: getEnv(),
    domain,
    iteration: state.iteration,
    maxIterations,
  });
  emit({
    source: 'agents',
    type: 'loop.failed',
    traceId: traceId ?? '',
    timestamp: new Date().toISOString(),
    durationMs: 0,
    env: getEnv(),
    domain,
    iteration: state.iteration,
    maxIterations,
    reason: 'max iterations exceeded without task completion',
  });

  return {
    finalAnswer: null,
    state,
    iterationsUsed: state.iteration,
    maxIterationsExceeded: true,
  };
};
