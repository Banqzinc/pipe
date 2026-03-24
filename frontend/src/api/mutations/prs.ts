import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useUpdatePr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      prId: string;
      linear_ticket_id?: string | null;
      notion_url?: string | null;
      review_completed_at?: boolean | null;
    }) => {
      const { prId, ...body } = params;
      return api.patch<{
        id: string;
        linear_ticket_id: string | null;
        notion_url: string | null;
        review_completed_at: string | null;
      }>(`/prs/${prId}`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prs'] });
    },
  });
}
