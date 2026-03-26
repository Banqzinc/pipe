import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';
import type { CommentReply } from '../queries/comments.ts';

export function useReplyToComment(prId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { commentId: number; body: string }) =>
      api.post<CommentReply>(
        `/prs/${prId}/comments/${params.commentId}/replies`,
        { body: params.body },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['pr-comments', prId] }),
  });
}

export function useResolveThread(prId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { commentId: number; threadNodeId: string; resolved: boolean }) =>
      api.post<{ resolved: boolean }>(
        `/prs/${prId}/comments/${params.commentId}/resolve`,
        { resolved: params.resolved, threadNodeId: params.threadNodeId },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['pr-comments', prId] }),
  });
}
