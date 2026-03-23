import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface RunStreamState {
  cliOutput: string;
  phase: string | null;
  phaseMessage: string | null;
  isDone: boolean;
  error: string | null;
}

type StreamAction =
  | { type: 'init'; text: string }
  | { type: 'cli_text'; text: string }
  | { type: 'cli_thinking'; text: string }
  | { type: 'phase'; phase: string; message: string }
  | { type: 'done'; status: string; error_message?: string }
  | { type: 'error'; message: string }
  | { type: 'reset' };

const initialState: RunStreamState = {
  cliOutput: '',
  phase: null,
  phaseMessage: null,
  isDone: false,
  error: null,
};

function reducer(state: RunStreamState, action: StreamAction): RunStreamState {
  switch (action.type) {
    case 'init':
      return { ...state, cliOutput: action.text };
    case 'cli_text':
    case 'cli_thinking':
      return { ...state, cliOutput: state.cliOutput + action.text };
    case 'phase':
      return { ...state, phase: action.phase, phaseMessage: action.message };
    case 'done':
      return {
        ...state,
        isDone: true,
        error: action.error_message ?? null,
      };
    case 'error':
      return { ...state, error: action.message };
    case 'reset':
      return initialState;
  }
}

export function useRunStream(runId: string, isActive: boolean): RunStreamState {
  const [state, dispatch] = useReducer(reducer, initialState);
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isActive) {
      dispatch({ type: 'reset' });
      return;
    }

    const url = `/api/runs/${runId}/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as StreamAction;
        dispatch(data);

        if (data.type === 'done') {
          es.close();
          void queryClient.invalidateQueries({ queryKey: ['runs', runId] });
          void queryClient.invalidateQueries({ queryKey: ['findings', runId] });
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {};


    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [runId, isActive, queryClient]);

  return state;
}
