import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface RepoListItem {
  id: string;
  github_owner: string;
  github_name: string;
  auto_trigger_on_open: boolean;
  created_at: string;
  updated_at: string;
}

export function useRepos() {
  return useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get<RepoListItem[]>('/repos'),
  });
}
