import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useChatStream(runId: string) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    // Close any existing connection
    eventSourceRef.current?.close();

    setIsStreaming(true);
    setCurrentResponse('');

    const es = new EventSource(`/api/runs/${runId}/chat/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_text') {
          setCurrentResponse((prev) => prev + data.text);
        }
        if (data.type === 'chat_done') {
          setIsStreaming(false);
          es.close();
          eventSourceRef.current = null;
          // Refresh messages from DB
          void queryClient.invalidateQueries({ queryKey: ['chat-messages', runId] });
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
      es.close();
      eventSourceRef.current = null;
    };
  }, [runId, queryClient]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);

  return { isStreaming, currentResponse, connect, disconnect };
}
