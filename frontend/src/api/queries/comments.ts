import { useQuery } from '@tanstack/react-query';
import { api } from '../client.ts';

export interface CommentReply {
  id: number;
  body: string;
  user: string;
  created_at: string;
  html_url: string;
}

export interface CommentThread {
  root_comment_id: number;
  path: string;
  line: number | null;
  root_body: string;
  root_user: string;
  root_created_at: string;
  root_html_url: string;
  replies: CommentReply[];
}

export interface PRCommentsResponse {
  threads: CommentThread[];
  issue_comments: CommentReply[];
}

export function usePRComments(prId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['pr-comments', prId],
    queryFn: () => api.get<PRCommentsResponse>(`/prs/${prId}/comments`),
    enabled: !!prId && enabled,
  });
}
