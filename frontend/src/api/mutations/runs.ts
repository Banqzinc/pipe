import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { prId: string; isSelfReview?: boolean }) =>
      api.post<{ id: string; status: string }>(`/prs/${params.prId}/runs`, {
        is_self_review: params.isSelfReview ?? false,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prs'] });
    },
  });
}
