import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useSendChatMessage(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ message_id: string }>(`/runs/${runId}/chat`, { message }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['chat-messages', runId] }),
  });
}
