import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useUpdateFinding(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      findingId: string;
      status: string;
      edited_body?: string;
    }) =>
      api.patch(`/findings/${params.findingId}`, {
        status: params.status,
        edited_body: params.edited_body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['findings', runId] }),
  });
}

export function useBulkAction(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      action: string;
      filter?: { severity: string | string[] };
      ids?: string[];
    }) => api.post(`/runs/${runId}/findings/bulk`, params),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['findings', runId] }),
  });
}

export function usePostToGithub(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ review_id: number; review_url: string; posted_count: number }>(
        `/runs/${runId}/post`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['findings', runId] });
      void queryClient.invalidateQueries({ queryKey: ['runs', runId] });
    },
  });
}

export function useExportFindings(runId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<{ markdown: string; findings_count: number }>(
        `/runs/${runId}/export`,
      ),
  });
}
