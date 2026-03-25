import { useMutation } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface PreviewPromptResult {
  prompt: string;
  context_summary: {
    has_linear_ticket: boolean;
    has_notion_url: boolean;
    has_prior_comments?: boolean;
    stack_position: number | null;
    stack_size: number | null;
  };
}

export function usePreviewPrompt() {
  return useMutation({
    mutationFn: (prId: string) =>
      api.post<PreviewPromptResult>(`/prs/${prId}/preview-prompt`),
  });
}

export function usePreviewStackPrompt() {
  return useMutation({
    mutationFn: (stackId: string) =>
      api.post<PreviewPromptResult>(`/stacks/${stackId}/preview-prompt`),
  });
}
