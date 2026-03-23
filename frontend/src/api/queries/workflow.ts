import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface PromptTemplateData {
  id: string;
  name: string;
  system_instructions: string;
  output_instructions: string;
  updated_at: string;
}

export function usePromptTemplate() {
  return useQuery({
    queryKey: ['workflow', 'prompt-template'],
    queryFn: () => api.get<PromptTemplateData>('/workflow/prompt-template'),
  });
}
