import { useMutation } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useApprovePR(prId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<{ review_id: number; html_url: string }>(`/prs/${prId}/approve`),
  });
}
