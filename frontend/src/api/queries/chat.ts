import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useChatMessages(runId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['chat-messages', runId],
    queryFn: () =>
      api.get<{ messages: ChatMessage[] }>(`/runs/${runId}/chat/messages`),
    enabled: !!runId && enabled,
  });
}
