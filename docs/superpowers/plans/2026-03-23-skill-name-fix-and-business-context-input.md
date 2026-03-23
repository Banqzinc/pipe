# Skill Name Fix + Business Context Input Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the skill name in the prompt template to be unambiguous, and add UI for reviewers to add/edit business context (Linear ticket, Notion URL) before running a review.

**Architecture:** Two independent changes. (A) Update the default prompt template text in the DB migration and frontend reset defaults. (B) Add a PATCH endpoint for PR business context fields, expose editable fields in the "Customize & Run" modal above the prompt textarea, and on the PR detail page.

**Tech Stack:** TypeScript, Express, TypeORM, React, TanStack Query

---

### Task 1: Fix skill name in prompt template defaults

The system_instructions says `Use /review-pr to review this PR` — should say `Use /review-pr (pr-review-toolkit) to review this PR` so it's unambiguous.

**Files:**
- Modify: `src/migrations/1774123000000-UpdatePromptTemplateDefaults.ts:3-7`
- Modify: `frontend/src/routes/_authed/workflow.tsx:6-10`

- [ ] **Step 1: Update the migration default text**

In `src/migrations/1774123000000-UpdatePromptTemplateDefaults.ts`, change line 5:

```typescript
// Before:
Use /review-pr to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.

// After:
Use /review-pr (pr-review-toolkit) to review this PR. You are running in the repo directory with the PR branch checked out — read the diff, discover rules, and analyze the code using your tools.
```

- [ ] **Step 2: Update the frontend reset defaults**

In `frontend/src/routes/_authed/workflow.tsx`, same change to `DEFAULT_SYSTEM_INSTRUCTIONS` line 8.

- [ ] **Step 3: Write a new migration to update existing DB rows**

Create `src/migrations/1774123500000-FixSkillNameInTemplate.ts`:

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSkillNameInTemplate1774123500000 implements MigrationInterface {
  name = 'FixSkillNameInTemplate1774123500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = REPLACE("system_instructions", 'Use /review-pr to review', 'Use /review-pr (pr-review-toolkit) to review') WHERE "system_instructions" LIKE '%Use /review-pr to review%'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "prompt_template" SET "system_instructions" = REPLACE("system_instructions", 'Use /review-pr (pr-review-toolkit) to review', 'Use /review-pr to review') WHERE "system_instructions" LIKE '%pr-review-toolkit%'`
    );
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/migrations/1774123000000-UpdatePromptTemplateDefaults.ts src/migrations/1774123500000-FixSkillNameInTemplate.ts frontend/src/routes/_authed/workflow.tsx
git commit -m "fix: clarify skill name in prompt template as /review-pr (pr-review-toolkit)"
```

---

### Task 2: Backend — PATCH endpoint for PR business context

Add a PATCH endpoint so the frontend can update `linear_ticket_id` and `notion_url` on a PR.

**Files:**
- Modify: `src/routes/pr.routes.ts` (add PATCH /:id route)

- [ ] **Step 1: Add PATCH /:id endpoint**

In `src/routes/pr.routes.ts`, add before the `export`:

```typescript
// PATCH /api/prs/:id — Update PR fields (business context)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prRepo = AppDataSource.getRepository(PullRequest);
    const id = req.params.id as string;

    const pr = await prRepo.findOneBy({ id });
    if (!pr) {
      throw new AppError('Pull request not found', 404, 'NOT_FOUND');
    }

    const { linear_ticket_id, notion_url } = req.body as {
      linear_ticket_id?: string | null;
      notion_url?: string | null;
    };

    if (linear_ticket_id !== undefined) pr.linear_ticket_id = linear_ticket_id || null;
    if (notion_url !== undefined) pr.notion_url = notion_url || null;

    await prRepo.save(pr);

    res.json({
      id: pr.id,
      linear_ticket_id: pr.linear_ticket_id,
      notion_url: pr.notion_url,
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/routes/pr.routes.ts
git commit -m "feat: add PATCH /api/prs/:id for business context editing"
```

---

### Task 3: Frontend — API hook for updating PR business context

**Files:**
- Create: `frontend/src/api/mutations/prs.ts`

- [ ] **Step 1: Create the mutation hook**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client.ts';

export function useUpdatePr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      prId: string;
      linear_ticket_id?: string | null;
      notion_url?: string | null;
    }) => {
      const { prId, ...body } = params;
      return api.patch<{ id: string; linear_ticket_id: string | null; notion_url: string | null }>(
        `/prs/${prId}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prs'] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/mutations/prs.ts
git commit -m "feat: add useUpdatePr mutation hook for business context"
```

---

### Task 4: Frontend — Business context fields in PromptPreviewModal

Add Linear ticket and Notion URL input fields above the prompt textarea in the Customize & Run modal. When the user edits these and clicks Run, the PR record is updated before the run starts, so `buildPrompt` picks up the new values.

**Files:**
- Modify: `frontend/src/components/common/prompt-preview-modal.tsx`

- [ ] **Step 1: Update PromptPreviewModal**

Add props for current business context values, import useUpdatePr, and add input fields above the prompt textarea:

```tsx
import { useState, useEffect } from 'react';
import { Modal } from './modal.tsx';
import { usePreviewPrompt } from '../../api/mutations/preview-prompt.ts';
import { useUpdatePr } from '../../api/mutations/prs.ts';

interface PromptPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  prId: string;
  linearTicketId?: string | null;
  notionUrl?: string | null;
  onRun: (prompt: string) => void;
  isRunning: boolean;
}

export function PromptPreviewModal({
  isOpen,
  onClose,
  prId,
  linearTicketId,
  notionUrl,
  onRun,
  isRunning,
}: PromptPreviewModalProps) {
  const previewPrompt = usePreviewPrompt();
  const updatePr = useUpdatePr();
  const [editedPrompt, setEditedPrompt] = useState('');
  const [linearId, setLinearId] = useState(linearTicketId ?? '');
  const [notionLink, setNotionLink] = useState(notionUrl ?? '');

  useEffect(() => {
    setLinearId(linearTicketId ?? '');
    setNotionLink(notionUrl ?? '');
  }, [linearTicketId, notionUrl]);

  useEffect(() => {
    if (isOpen && prId) {
      previewPrompt.mutate(prId, {
        onSuccess: (data) => {
          setEditedPrompt(data.prompt);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prId]);

  const handleRun = () => {
    // If business context changed, update PR first then run
    const contextChanged =
      (linearId || null) !== (linearTicketId || null) ||
      (notionLink || null) !== (notionUrl || null);

    if (contextChanged) {
      updatePr.mutate(
        { prId, linear_ticket_id: linearId || null, notion_url: notionLink || null },
        { onSuccess: () => onRun(editedPrompt) },
      );
    } else {
      onRun(editedPrompt);
    }
  };

  const summary = previewPrompt.data?.context_summary;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize & Run Review">
      <div className="px-6 py-4 space-y-4">
        {/* Business context inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Linear Ticket</label>
            <input
              type="text"
              value={linearId}
              onChange={(e) => setLinearId(e.target.value)}
              placeholder="e.g. CORE-558"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notion Proposal URL</label>
            <input
              type="text"
              value={notionLink}
              onChange={(e) => setNotionLink(e.target.value)}
              placeholder="https://notion.so/..."
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Context summary */}
        {summary && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {summary.stack_position != null && summary.stack_size != null && (
              <span>Stack {summary.stack_position}/{summary.stack_size}</span>
            )}
            <span>Toolkit reads diff & rules from repo</span>
          </div>
        )}

        {/* Loading / Error / Editor — same as current */}
        ...
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
        <button type="button" onClick={onClose} className="...">Cancel</button>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || updatePr.isPending || previewPrompt.isPending || !editedPrompt}
          className="..."
        >
          {isRunning || updatePr.isPending ? 'Starting...' : 'Run Review'}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/prompt-preview-modal.tsx
git commit -m "feat: add business context fields to Customize & Run modal"
```

---

### Task 5: Frontend — Thread business context props through callers

Pass `linearTicketId` and `notionUrl` from the PR data to PromptPreviewModal in all three places it's rendered.

**Files:**
- Modify: `frontend/src/routes/_authed/index.tsx` (inbox page)
- Modify: `frontend/src/routes/_authed/pr.$id.tsx` (PR detail page)
- Modify: `frontend/src/routes/_authed/run.$id.tsx` (run detail page)

- [ ] **Step 1: Inbox page — pass business context**

In `frontend/src/routes/_authed/index.tsx`, the `customizePrId` state tracks which PR is being customized. Look up that PR's data from the already-fetched `prs` array:

```tsx
// Before the PromptPreviewModal render:
const customizePr = customizePrId
  ? prs.find((p) => p.id === customizePrId)
  : null;

// On the modal:
<PromptPreviewModal
  isOpen={!!customizePrId}
  onClose={() => setCustomizePrId(null)}
  prId={customizePrId!}
  linearTicketId={customizePr?.linear_ticket_id}
  notionUrl={customizePr?.notion_url}
  onRun={handleCustomizeRunSubmit}
  isRunning={createRun.isPending}
/>
```

Note: `PullRequestListItem` already has `linear_ticket_id` in the API response (returned by `GET /api/prs`). Need to check if the frontend type includes it.

- [ ] **Step 2: PR detail page — pass business context**

In `frontend/src/routes/_authed/pr.$id.tsx`, the `pr` object has `linear_ticket_id` and `notion_url`:

```tsx
<PromptPreviewModal
  isOpen={showCustomize}
  onClose={() => setShowCustomize(false)}
  prId={id}
  linearTicketId={pr?.linear_ticket_id}
  notionUrl={pr?.notion_url}
  onRun={...}
  isRunning={createRun.isPending}
/>
```

- [ ] **Step 3: Run detail page — pass business context**

In `frontend/src/routes/_authed/run.$id.tsx`, the run has `run.pr` but it may not include `linear_ticket_id`. Check `RunDetailPr` type in `frontend/src/api/queries/runs.ts` — if it doesn't include these fields, add them and update the backend `GET /api/runs/:id` response.

- [ ] **Step 4: Verify PullRequestListItem type includes business context fields**

Check `frontend/src/api/queries/prs.ts` — the `PullRequestListItem` type and the `GET /api/prs` response must include `linear_ticket_id` and `notion_url`. The backend already returns them (confirmed in `pr.routes.ts:96`). If the frontend type is missing them, add them.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck && cd frontend && npx tsc --noEmit`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/_authed/index.tsx frontend/src/routes/_authed/pr.\$id.tsx frontend/src/routes/_authed/run.\$id.tsx frontend/src/api/queries/prs.ts frontend/src/api/queries/runs.ts
git commit -m "feat: thread business context to PromptPreviewModal in all pages"
```

---

### Task 6: Frontend — Business context fields on PR detail page

Add editable Linear ticket and Notion URL fields on the PR detail page (in the metadata section), so reviewers can add/edit business context even without opening the Customize modal.

**Files:**
- Modify: `frontend/src/routes/_authed/pr.$id.tsx`

- [ ] **Step 1: Add inline edit fields**

After the metadata row (branch/base, Linear link, Notion link), add an editable section below the "Run Review" area:

```tsx
// Inside PrDetailPage, add state:
const [editLinear, setEditLinear] = useState('');
const [editNotion, setEditNotion] = useState('');
const updatePr = useUpdatePr();

useEffect(() => {
  if (pr) {
    setEditLinear(pr.linear_ticket_id ?? '');
    setEditNotion(pr.notion_url ?? '');
  }
}, [pr]);

// In the JSX, after the metadata row and before "Run Review":
<div className="px-6 py-4 border-b border-gray-800">
  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Business Context</h3>
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="block text-xs text-gray-500 mb-1">Linear Ticket</label>
      <input
        type="text"
        value={editLinear}
        onChange={(e) => setEditLinear(e.target.value)}
        onBlur={() => {
          if ((editLinear || null) !== (pr?.linear_ticket_id || null)) {
            updatePr.mutate({ prId: id, linear_ticket_id: editLinear || null });
          }
        }}
        placeholder="e.g. CORE-558"
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
      />
    </div>
    <div>
      <label className="block text-xs text-gray-500 mb-1">Notion Proposal</label>
      <input
        type="text"
        value={editNotion}
        onChange={(e) => setEditNotion(e.target.value)}
        onBlur={() => {
          if ((editNotion || null) !== (pr?.notion_url || null)) {
            updatePr.mutate({ prId: id, notion_url: editNotion || null });
          }
        }}
        placeholder="https://notion.so/..."
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500"
      />
    </div>
  </div>
</div>
```

Saves on blur — no extra save button needed.

- [ ] **Step 2: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/_authed/pr.\$id.tsx
git commit -m "feat: add editable business context fields on PR detail page"
```
