import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';
import type { PromptTemplateData } from '../queries/workflow.ts';

export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      system_instructions?: string;
      output_instructions?: string;
      sections?: Array<{ key: string; enabled: boolean; content?: string }>;
    }) => api.put<PromptTemplateData>('/workflow/prompt-template', params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', 'prompt-template'] });
    },
  });
}
