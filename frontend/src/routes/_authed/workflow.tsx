import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { usePromptTemplate } from '../../api/queries/workflow.ts';
import type { PromptSection } from '../../api/queries/workflow.ts';
import { useUpdatePromptTemplate } from '../../api/mutations/workflow.ts';
import { PromptSectionCard } from '../../components/workflow/prompt-section-card.tsx';
import { Button } from '@/components/ui/button.tsx';

const DEFAULT_SECTIONS: PromptSection[] = [
  {
    key: 'review_instructions',
    name: 'Review Instructions',
    description: 'Prepended to every review prompt. Use {{pr_number}} and {{pr_title}} as placeholders.',
    enabled: true,
    content: `You are a senior code reviewer analyzing PR #{{pr_number}}: {{pr_title}}.

Use /review-pr (pr-review-toolkit) to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

If business context is provided (Linear tickets, Notion proposals), use your MCP servers to fetch the full content for deeper understanding of the intent behind the changes.`,
    editable: true,
    system: false,
  },
  {
    key: 'rule_discovery',
    name: 'Project Rules (CLAUDE.md, AGENTS.md)',
    description: 'When enabled, the reviewer reads and applies project rule files found in the repository.',
    enabled: true,
    content: '',
    editable: false,
    system: true,
  },
  {
    key: 'pr_metadata',
    name: 'PR Metadata',
    description: 'Branch info, stack position, and other PR metadata. Auto-generated at run time.',
    enabled: true,
    content: '',
    editable: false,
    system: true,
  },
  {
    key: 'business_context',
    name: 'Business Context (Linear, Notion)',
    description: 'Includes linked Linear ticket IDs and Notion proposal URLs. Auto-generated at run time.',
    enabled: true,
    content: '',
    editable: false,
    system: true,
  },
  {
    key: 'prior_comments',
    name: 'Prior Review Comments',
    description: 'Includes prior review comment threads for follow-up context. Auto-generated at run time.',
    enabled: true,
    content: '',
    editable: false,
    system: true,
  },
  {
    key: 'output_format',
    name: 'Output Format',
    description: 'Defines the expected JSON output schema for findings and brief.',
    enabled: true,
    content: `Output a JSON object matching this exact schema:
{
  "brief": {
    "critical_issues": [{ "summary": string, "file": string, "line": number }],
    "important_issues": [{ "summary": string, "file": string, "line": number }],
    "suggestions": [string],
    "strengths": [string],
    "recommended_actions": [string]
  },
  "findings": [{
    "file_path": string,
    "start_line": number,
    "end_line": number | null,
    "severity": "critical" | "warning" | "suggestion" | "nitpick",
    "confidence": number (0-1),
    "category": string | null,
    "title": string,
    "body": string (markdown),
    "suggested_fix": string | null (code),
    "rule_ref": string | null
  }]
}`,
    editable: true,
    system: false,
  },
];

function WorkflowPage() {
  const { data: template, isLoading } = usePromptTemplate();
  const updateTemplate = useUpdatePromptTemplate();

  const [sections, setSections] = useState<PromptSection[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (template) {
      setSections(template.sections ?? DEFAULT_SECTIONS);
    }
  }, [template]);

  const handleSectionChange = (
    key: string,
    updates: { enabled?: boolean; content?: string },
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? {
              ...s,
              ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
              ...(updates.content !== undefined && s.editable ? { content: updates.content } : {}),
            }
          : s,
      ),
    );
  };

  const handleSave = () => {
    updateTemplate.mutate(
      {
        sections: sections.map((s) => ({
          key: s.key,
          enabled: s.enabled,
          ...(s.editable ? { content: s.content } : {}),
        })),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  const handleReset = () => {
    if (
      !window.confirm(
        'Reset all sections to their original defaults? This cannot be undone.',
      )
    ) {
      return;
    }
    setSections(DEFAULT_SECTIONS);
    updateTemplate.mutate({
      sections: DEFAULT_SECTIONS.map((s) => ({
        key: s.key,
        enabled: s.enabled,
        ...(s.editable ? { content: s.content } : {}),
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground text-sm">Loading template...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Workflow</h1>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          Reset to Default
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Configure which sections are included in the review prompt. Toggle sections on/off and edit the content of editable sections.
      </p>

      <div className="space-y-3">
        {sections.map((section) => (
          <PromptSectionCard
            key={section.key}
            section={section}
            onChange={handleSectionChange}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} disabled={updateTemplate.isPending}>
          {updateTemplate.isPending ? 'Saving...' : 'Save'}
        </Button>
        {saved && (
          <span className="text-xs text-green-400">Saved</span>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_authed/workflow')({
  component: WorkflowPage,
});
