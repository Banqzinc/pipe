import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';
import type { RepoListItem } from '../queries/repos.ts';

export function useCreateRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { github_owner: string; github_name: string }) =>
      api.post<RepoListItem>('/repos', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useUpdateRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      auto_trigger_on_open?: boolean;
      pat?: string;
    }) => api.patch(`/repos/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useDeleteRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/repos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useSyncRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ synced: number }>(`/repos/${id}/sync`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
      void queryClient.invalidateQueries({ queryKey: ['prs'] });
    },
  });
}

export function useSyncAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ synced: number; repos: number }>('/repos/sync'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
      void queryClient.invalidateQueries({ queryKey: ['prs'] });
    },
  });
}
