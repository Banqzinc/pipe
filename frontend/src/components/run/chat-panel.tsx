import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button.tsx';
import { useChatMessages } from '../../api/queries/chat.ts';
import type { ChatMessage } from '../../api/queries/chat.ts';
import { useSendChatMessage } from '../../api/mutations/chat.ts';
import { useChatStream } from '../../hooks/use-chat-stream.ts';

interface ChatPanelProps {
  runId: string;
  sessionId: string | null;
  isComplete: boolean;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
}

export function ChatPanel({
  runId,
  sessionId,
  isComplete,
  pendingMessage,
  onPendingMessageConsumed,
}: ChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasSession = sessionId != null;
  const enabled = isComplete && hasSession;

  const { data: messagesData } = useChatMessages(runId, enabled && isExpanded);
  const sendMessage = useSendChatMessage(runId);
  const chatStream = useChatStream(runId);

  const messages: ChatMessage[] = messagesData?.messages ?? [];

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, chatStream.currentResponse, scrollToBottom]);

  // Handle pending message from "Discuss" button
  useEffect(() => {
    if (pendingMessage) {
      setIsExpanded(true);
      setInput(pendingMessage);
      onPendingMessageConsumed?.();
      // Focus textarea after expanding
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [pendingMessage, onPendingMessageConsumed]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sendMessage.isPending || chatStream.isStreaming) return;

    setInput('');
    sendMessage.mutate(trimmed, {
      onSuccess: () => {
        chatStream.connect();
      },
    });
  }, [input, sendMessage, chatStream]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Collapsed bar
  if (!isExpanded) {
    return (
      <div className="sticky bottom-0 z-50 w-full border-t border-border bg-card">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChatIcon />
          <span>Chat with Claude</span>
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="sticky bottom-0 z-50 w-full border-t border-border bg-card flex flex-col max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ChatIcon />
          <span>Chat with Claude</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setIsExpanded(false)}
          aria-label="Minimize chat"
        >
          <MinimizeIcon />
        </Button>
      </div>

      {/* No session state */}
      {!hasSession && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            Re-run the review to enable chat
          </p>
        </div>
      )}

      {/* Chat content */}
      {hasSession && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && !chatStream.isStreaming && !sendMessage.isPending && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">
                  Ask Claude about any finding in this review
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Optimistic user message while sending */}
            {sendMessage.isPending && sendMessage.variables && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-primary/10 text-foreground">
                  {sendMessage.variables}
                </div>
              </div>
            )}

            {/* Streaming assistant response */}
            {chatStream.isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                  {chatStream.currentResponse ? (
                    <div className="prose prose-sm prose-invert max-w-none text-foreground [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:break-all">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {chatStream.currentResponse}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <PulsingDot />
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this review..."
              rows={1}
              className="flex-1 resize-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={!enabled || chatStream.isStreaming}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={
                !input.trim() ||
                !enabled ||
                sendMessage.isPending ||
                chatStream.isStreaming
              }
            >
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-primary/10 text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
        <div className="prose prose-sm prose-invert max-w-none text-foreground [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:break-all">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function PulsingDot() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-pulse" />
      <span
        className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-pulse"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-pulse"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}
