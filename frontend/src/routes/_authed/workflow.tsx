import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { usePromptTemplate } from '../../api/queries/workflow.ts';
import { useUpdatePromptTemplate } from '../../api/mutations/workflow.ts';

const DEFAULT_SYSTEM_INSTRUCTIONS = `You are a senior code reviewer analyzing PR #{{pr_number}}: {{pr_title}}.

Use /review-pr (pr-review-toolkit) to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

If business context is provided (Linear tickets, Notion proposals), use your MCP servers to fetch the full content for deeper understanding of the intent behind the changes.`;

const DEFAULT_OUTPUT_INSTRUCTIONS = `Output a JSON object matching this exact schema:
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
}`;

function WorkflowPage() {
  const { data: template, isLoading } = usePromptTemplate();
  const updateTemplate = useUpdatePromptTemplate();

  const [systemInstructions, setSystemInstructions] = useState('');
  const [outputInstructions, setOutputInstructions] = useState('');
  const [systemSaved, setSystemSaved] = useState(false);
  const [outputSaved, setOutputSaved] = useState(false);

  useEffect(() => {
    if (template) {
      setSystemInstructions(template.system_instructions);
      setOutputInstructions(template.output_instructions);
    }
  }, [template]);

  const handleSaveSystem = () => {
    updateTemplate.mutate(
      { system_instructions: systemInstructions },
      {
        onSuccess: () => {
          setSystemSaved(true);
          setTimeout(() => setSystemSaved(false), 2000);
        },
      },
    );
  };

  const handleSaveOutput = () => {
    updateTemplate.mutate(
      { output_instructions: outputInstructions },
      {
        onSuccess: () => {
          setOutputSaved(true);
          setTimeout(() => setOutputSaved(false), 2000);
        },
      },
    );
  };

  const handleReset = () => {
    if (
      !window.confirm(
        'Reset both sections to their original defaults? This cannot be undone.',
      )
    ) {
      return;
    }
    setSystemInstructions(DEFAULT_SYSTEM_INSTRUCTIONS);
    setOutputInstructions(DEFAULT_OUTPUT_INSTRUCTIONS);
    updateTemplate.mutate({
      system_instructions: DEFAULT_SYSTEM_INSTRUCTIONS,
      output_instructions: DEFAULT_OUTPUT_INSTRUCTIONS,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-500 text-sm">Loading template...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Workflow</h1>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Reset to Default
        </button>
      </div>

      {/* Review Instructions */}
      <section className="mb-8">
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Review Instructions
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Prepended to every review prompt. Use{' '}
          <code className="bg-gray-800 px-1 py-0.5 rounded text-gray-400">
            {'{{pr_number}}'}
          </code>{' '}
          and{' '}
          <code className="bg-gray-800 px-1 py-0.5 rounded text-gray-400">
            {'{{pr_title}}'}
          </code>{' '}
          as placeholders.
        </p>
        <textarea
          value={systemInstructions}
          onChange={(e) => setSystemInstructions(e.target.value)}
          rows={6}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleSaveSystem}
            disabled={updateTemplate.isPending}
            className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {updateTemplate.isPending ? 'Saving...' : 'Save'}
          </button>
          {systemSaved && (
            <span className="text-xs text-green-400">Saved</span>
          )}
        </div>
      </section>

      {/* Output Instructions */}
      <section>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Output Instructions
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Appended after the PR data. Defines the expected output format.
        </p>
        <textarea
          value={outputInstructions}
          onChange={(e) => setOutputInstructions(e.target.value)}
          rows={18}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleSaveOutput}
            disabled={updateTemplate.isPending}
            className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
          >
            {updateTemplate.isPending ? 'Saving...' : 'Save'}
          </button>
          {outputSaved && (
            <span className="text-xs text-green-400">Saved</span>
          )}
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/_authed/workflow')({
  component: WorkflowPage,
});
