import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.ts';

interface PipeConfig {
  googleClientId: string;
}

export function useConfig() {
  return useQuery<PipeConfig>({
    queryKey: ['config'],
    queryFn: () => api.get<PipeConfig>('/auth/config'),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 3,
  });
}

export function useGoogleClientId(): string | undefined {
  const { data } = useConfig();
  return data?.googleClientId || undefined;
}
