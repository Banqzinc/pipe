import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { Finding } from '../entities/Finding.entity';
import { PromptTemplate } from '../entities/PromptTemplate.entity';
import { RunStatus, FindingSeverity, FindingStatus } from '../entities/enums';
import {
  ContextPackBuilder,
  type ContextPack,
  type StackContextPack,
} from './context-pack.service';
import { analyzeRisk } from './risk-engine';
import { parseToolkitOutput, type ParsedFinding } from './output-parser';
import { logger } from '../lib/logger';
import { runEventBus } from '../lib/run-event-bus';
import { loadConfig } from '../config';
import {
  fetchPRComments,
  type PRCommentContext,
} from './comment-fetcher.service';

const CLI_TIMEOUT_MS = 900_000; // 15 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapSeverity(severity: ParsedFinding['severity']): FindingSeverity {
  switch (severity) {
    case 'critical':
      return FindingSeverity.Critical;
    case 'warning':
      return FindingSeverity.Warning;
    case 'suggestion':
      return FindingSeverity.Suggestion;
    case 'nitpick':
      return FindingSeverity.Nitpick;
  }
}

/** Extract displayable content from a CLI stream-json event line.
 *  Returns { type, text } for content deltas, or null for non-content events. */
export function extractStreamContent(
  event: unknown,
): { type: 'cli_text' | 'cli_thinking'; text: string } | null {
  if (!event || typeof event !== 'object') return null;
  const ev = event as Record<string, unknown>;
  // Unwrap stream_event envelope: {"type":"stream_event","event":{...}}
  const inner = (ev.type === 'stream_event' ? ev.event : ev) as Record<string, any> | null;
  if (!inner || inner.type !== 'content_block_delta') return null;

  if (inner.delta?.type === 'text_delta') {
    return { type: 'cli_text', text: inner.delta.text ?? '' };
  }
  if (inner.delta?.type === 'thinking_delta') {
    return { type: 'cli_thinking', text: inner.delta.thinking ?? '' };
  }
  return null;
}

export class ReviewRunner {
  // Per-repo queues: runs on different repos execute in parallel,
  // runs on the same repo are sequential (shared git working directory).
  private repoQueues = new Map<string, { queue: string[]; processing: boolean }>();

  async enqueueRun(runId: string, repoId: string): Promise<void> {
    logger.info({ runId, repoId }, 'Enqueueing run');

    let entry = this.repoQueues.get(repoId);
    if (!entry) {
      entry = { queue: [], processing: false };
      this.repoQueues.set(repoId, entry);
    }

    entry.queue.push(runId);
    if (!entry.processing) {
      // Fire-and-forget: start processing this repo's queue
      this.processRepoQueue(repoId).catch((err) => {
        logger.error({ err, repoId }, 'Repo queue processing failed unexpectedly');
      });
    }
  }

  private async processRepoQueue(repoId: string): Promise<void> {
    const entry = this.repoQueues.get(repoId);
    if (!entry || entry.processing) return;
    entry.processing = true;

    try {
      while (entry.queue.length > 0) {
        const runId = entry.queue.shift()!;
        await this.processRunWithRetry(runId);
      }
    } finally {
      entry.processing = false;
      // Clean up empty entries to prevent memory leaks
      if (entry.queue.length === 0) {
        this.repoQueues.delete(repoId);
      }
    }
  }

  private async processRun(runId: string): Promise<void> {
    const runRepo = AppDataSource.getRepository(ReviewRun);
    const findingRepo = AppDataSource.getRepository(Finding);
    const prRepo = AppDataSource.getRepository(PullRequest);

    // 1. Update run status to 'running', set started_at
    await runRepo.update(runId, {
      status: RunStatus.Running,
      started_at: new Date(),
    });

    logger.info({ runId }, 'Run started');
    runEventBus.emit(runId, { type: 'phase', phase: 'context', message: 'Building context pack...' });

    // Load the run with PR relation
    const run = await runRepo.findOne({
      where: { id: runId },
      relations: ['pullRequest', 'pullRequest.repo'],
    });

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const pr = run.pullRequest;
    const isStackReview = !!run.stack_id;

    // 2. Build context pack
    const contextPackBuilder = new ContextPackBuilder();
    let contextPack: ContextPack | StackContextPack;
    let stackPrs: PullRequest[] = [];

    if (isStackReview) {
      runEventBus.emit(runId, {
        type: 'phase',
        phase: 'context',
        message: `Building context pack for stack (${run.stack_id})...`,
      });
      contextPack = await contextPackBuilder.buildForStack(run.stack_id!, pr.repo_id);

      // Load stack PRs for finding attribution
      stackPrs = await prRepo.find({
        where: { stack_id: run.stack_id!, repo_id: pr.repo_id },
        order: { stack_position: 'ASC' },
      });
    } else {
      contextPack = await contextPackBuilder.build(run);
    }

    // Store context pack in run record
    await runRepo.update(runId, {
      context_pack: contextPack as any,
    });

    // 3. Run risk engine on changed files
    runEventBus.emit(runId, { type: 'phase', phase: 'risk', message: 'Running risk analysis...' });
    const riskAnalysis = analyzeRisk(
      contextPack.changedFiles,
      contextPack.diff.split('\n').length,
    );

    await runRepo.update(runId, {
      risk_signals: riskAnalysis as any,
    });

    logger.info({ runId, riskLevel: riskAnalysis.overall_risk }, 'Risk analysis complete');

    // 4. Construct prompt — use custom prompt if user-supplied, otherwise build from template
    let prompt: string;
    let disableProjectRules = false;
    if (run.prompt) {
      prompt = run.prompt;
      logger.info({ runId }, 'Using user-supplied custom prompt');
    } else if (isStackReview && 'perPrDiffs' in contextPack) {
      prompt = await buildStackPrompt(contextPack.perPrDiffs, contextPack as StackContextPack);
      await runRepo.update(runId, { prompt });
    } else {
      // Check for prior review posts on this PR to include follow-up context
      let priorComments: PRCommentContext | undefined;
      const postRepo = AppDataSource.getRepository(ReviewPost);
      const priorPost = await postRepo.findOneBy({ run_id: run.id });
      // If no post on this run, check if any prior run on this PR has a post
      const hasPriorPost =
        priorPost ??
        (await postRepo
          .createQueryBuilder('post')
          .innerJoin('post.reviewRun', 'run')
          .where('run.pr_id = :prId', { prId: pr.id })
          .getOne());

      if (hasPriorPost) {
        try {
          priorComments = await fetchPRComments(pr);
          logger.info(
            { runId, threadCount: priorComments.threads.length },
            'Fetched prior review comments for follow-up',
          );
        } catch (err) {
          logger.warn({ runId, err }, 'Failed to fetch prior review comments, continuing without');
        }
      }

      const buildResult = await buildPrompt(pr, contextPack, priorComments);
      prompt = buildResult.prompt;
      disableProjectRules = buildResult.disableProjectRules;
      await runRepo.update(runId, { prompt });
    }

    // 5. Spawn CLI in the cloned repo directory — toolkit handles diff/rules/files
    const config = loadConfig();
    const repo = pr.repo;
    const repoDir = path.join(config.reposDir, repo.github_owner, repo.github_name);

    // Base tools the review skill needs (auto-approved in --print mode)
    const allowedTools: string[] = [
      'Skill',
      'Read', 'Grep', 'Glob', 'LS',
      'Bash',
      'Agent', 'Task', 'TaskOutput', 'TaskStop',
      'TodoWrite',
      'WebFetch', 'WebSearch',
    ];
    if (pr.linear_ticket_id) {
      allowedTools.push('mcp__claude_ai_Linear__*');
    }
    if (pr.notion_url) {
      allowedTools.push('mcp__claude_ai_Notion__*');
    }

    // If project rules are disabled, add instruction to the prompt
    if (disableProjectRules) {
      prompt += '\n\nIMPORTANT: Do not read or apply project rule files (CLAUDE.md, AGENTS.md, .cursor/rules, .review/rules). Skip all rule discovery.';
    }

    logger.info({ runId, repoDir, allowedTools, disableProjectRules }, 'Spawning CLI');
    runEventBus.emit(runId, { type: 'phase', phase: 'cli', message: 'Starting Claude review...' });
    const rawOutput = await this.spawnCli(prompt, repoDir, runId, allowedTools);

    // 6. Parse output
    const parseResult = parseToolkitOutput(rawOutput);

    logger.info(
      {
        runId,
        findingsCount: parseResult.findings.length,
        parseErrors: parseResult.parseErrors,
        isPartial: parseResult.isPartial,
      },
      'Output parsed',
    );

    runEventBus.emit(runId, { type: 'phase', phase: 'parsing', message: 'Parsing findings...' });

    // 7. Store brief in run record
    // 9. Store raw output in toolkit_raw_output
    await runRepo.update(runId, {
      brief: parseResult.brief as any,
      toolkit_raw_output: rawOutput,
    });

    // 8. Create Finding records from parsed findings
    if (parseResult.findings.length > 0) {
      const findingEntities = parseResult.findings.map((f, index) => {
        // For stack reviews, resolve pr_id from pr_number
        let prId: string | null = null;
        if (isStackReview && stackPrs.length > 0) {
          if (f.pr_number) {
            const matchedPr = stackPrs.find(
              (p) => p.github_pr_number === f.pr_number,
            );
            if (matchedPr) prId = matchedPr.id;
          }
          // Fallback: match file_path against each PR's changed files
          if (!prId && 'perPrDiffs' in contextPack) {
            const stackCtx = contextPack as StackContextPack;
            for (const prDiff of stackCtx.perPrDiffs) {
              if (prDiff.changedFiles.includes(f.file_path)) {
                prId = prDiff.prId;
                break;
              }
            }
          }
        }

        const finding = findingRepo.create({
          run_id: runId,
          file_path: f.file_path,
          start_line: f.start_line,
          end_line: f.end_line,
          severity: mapSeverity(f.severity),
          confidence: f.confidence,
          category: f.category,
          title: f.title,
          body: f.body,
          suggested_fix: f.suggested_fix,
          rule_ref: f.rule_ref,
          status: FindingStatus.Pending,
          toolkit_order: index,
          pr_id: prId,
        });
        return finding;
      });

      await findingRepo.save(findingEntities);
      logger.info({ runId, count: findingEntities.length }, 'Findings saved');
    }

    // 10. Update status
    let finalStatus: RunStatus;
    if (parseResult.parseErrors.length > 0 && parseResult.isPartial) {
      finalStatus = RunStatus.Partial;
    } else if (parseResult.parseErrors.length > 0) {
      finalStatus = RunStatus.Failed;
    } else {
      finalStatus = RunStatus.Completed;
    }

    // 11. Set completed_at
    await runRepo.update(runId, {
      status: finalStatus,
      completed_at: new Date(),
      error_message:
        parseResult.parseErrors.length > 0
          ? parseResult.parseErrors.join('; ')
          : null,
    });

    logger.info({ runId, status: finalStatus }, 'Run finished');
    runEventBus.emit(runId, { type: 'done', status: finalStatus });
  }

  private async spawnCli(
    prompt: string,
    cwd: string,
    runId: string,
    allowedTools?: string[],
  ): Promise<string> {
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '-p', prompt,
    ];
    if (allowedTools && allowedTools.length > 0) {
      args.push('--allowedTools', ...allowedTools);
    }

    return new Promise<string>((resolve, reject) => {
      const child = spawn('claude', args, { cwd });
      const runRepo = AppDataSource.getRepository(ReviewRun);

      let rawOutput = '';
      let displayText = '';
      let resultLine = '';
      let stderr = '';
      let lastFlushedLength = 0;
      let lineBuffer = '';
      let sessionId: string | null = null;
      let lineCount = 0;

      // Flush accumulated display text to DB every 5 seconds
      const flushInterval = setInterval(() => {
        if (displayText.length > lastFlushedLength) {
          lastFlushedLength = displayText.length;
          runRepo.update(runId, { cli_output: displayText }).catch((err) => {
            logger.warn({ runId, err }, 'Failed to flush cli_output');
          });
        }
      }, 5_000);

      // Manual timeout — flush accumulated output before rejecting
      const timeout = setTimeout(async () => {
        child.kill('SIGTERM');
        try {
          await runRepo.update(runId, {
            cli_output: displayText || undefined,
            toolkit_raw_output: rawOutput || undefined,
          });
        } catch (e) {
          logger.warn({ runId, err: e }, 'Failed to flush output on timeout');
        }
        const err = new Error(`CLI timed out after ${CLI_TIMEOUT_MS}ms`);
        (err as any).isTimeout = true;
        reject(err);
      }, CLI_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        lineBuffer += text;

        // Process complete newline-delimited JSON lines
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          lineCount++;
          if (lineCount <= 3) {
            logger.info({ runId, lineNum: lineCount, line: line.slice(0, 200) }, 'CLI stream line');
          }
          try {
            const event = JSON.parse(line);

            // Extract session_id from early system events
            if (!sessionId) {
              // Check top-level and nested locations
              const sid = event.session_id ?? event.sessionId;
              if (sid) {
                sessionId = sid;
                logger.info({ runId, sessionId }, 'Captured session_id from CLI stream');
              } else if (event.type === 'system' || event.type === 'init') {
                logger.info({ runId, eventType: event.type, eventKeys: Object.keys(event) }, 'System event without session_id');
              }
            }

            const content = extractStreamContent(event);
            if (content) {
              displayText += content.text;
              runEventBus.emit(runId, content);
            }

            // Capture the final result event for parseToolkitOutput
            if (event.type === 'result') {
              resultLine = line;
            }
          } catch {
            // Non-JSON line — ignore
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', async (code) => {
        clearInterval(flushInterval);
        clearTimeout(timeout);

        // Process any remaining data in line buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer);
            if (!sessionId && event.session_id) {
              sessionId = event.session_id;
            }
            if (event.type === 'result') {
              resultLine = lineBuffer;
            }
          } catch {
            // ignore
          }
        }

        // Persist session_id if captured
        if (sessionId) {
          try {
            await runRepo.update(runId, { session_id: sessionId });
          } catch (err) {
            logger.warn({ runId, err }, 'Failed to persist session_id');
          }
        }

        // Final flush of display text
        if (displayText.length > lastFlushedLength) {
          runRepo.update(runId, { cli_output: displayText }).catch((err) => {
            logger.warn({ runId, err }, 'Failed final cli_output flush');
          });
        }

        if (code !== 0) {
          reject(
            new Error(
              `CLI exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`,
            ),
          );
        } else if (resultLine) {
          // Return the result event JSON — parseToolkitOutput handles the envelope
          resolve(resultLine);
        } else {
          // Fallback: return raw output
          resolve(rawOutput);
        }
      });

      child.on('error', (err) => {
        clearInterval(flushInterval);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private async processRunWithRetry(runId: string): Promise<void> {
    const runRepo = AppDataSource.getRepository(ReviewRun);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.processRun(runId);
        return; // success
      } catch (err) {
        logger.error(
          { runId, attempt, maxRetries: MAX_RETRIES, err },
          'Run attempt failed',
        );

        const isTimeout = err instanceof Error && (err as any).isTimeout;
        if (attempt < MAX_RETRIES && !isTimeout) {
          await sleep(RETRY_DELAY_MS);
        } else {
          // All retries exhausted — mark as failed
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';
          await runRepo.update(runId, {
            status: RunStatus.Failed,
            completed_at: new Date(),
            error_message: `Failed after ${MAX_RETRIES} attempts: ${errorMessage}`,
          });
          logger.error(
            { runId, errorMessage },
            'Run failed after all retries',
          );
          runEventBus.emit(runId, { type: 'error', message: errorMessage });
          runEventBus.emit(runId, { type: 'done', status: RunStatus.Failed });
        }
      }
    }
  }
}

// --- Stack Prompt Builder ---

export async function buildStackPrompt(
  stackPrs: Array<{
    prId: string;
    prNumber: number;
    stackPosition: number;
    title: string;
  }>,
  ctx: StackContextPack,
): Promise<string> {
  const parts: string[] = [];

  parts.push(
    `You are a senior code reviewer analyzing a stack of ${stackPrs.length} PRs.`,
  );
  parts.push(
    'Review the entire stack holistically — look for cross-PR issues, architectural coherence, and consistency.',
  );
  parts.push('');
  parts.push(`## Repository`);
  parts.push(`${ctx.repoOwner}/${ctx.repoName}`);
  parts.push('');
  parts.push(`## Stack PRs (bottom to top)`);

  // Render in reverse stack order (top of stack first)
  const reversed = [...stackPrs].sort(
    (a, b) => b.stackPosition - a.stackPosition,
  );

  for (const pr of reversed) {
    parts.push(
      `- PR #${pr.prNumber}: ${pr.title} (${pr.stackPosition}/${stackPrs.length})`,
    );
  }

  parts.push('');
  parts.push('## Instructions');
  parts.push(
    'Use your tools to fetch the diff for each PR (`gh pr diff <number>`), read the codebase, and discover project rules.',
  );
  parts.push(
    'Do NOT rely on any pre-supplied diff. You have full access to the repository and GitHub CLI.',
  );

  // Business context
  if (ctx.linearTicketId || ctx.notionUrl) {
    parts.push('');
    parts.push('## Business Context');
    if (ctx.linearTicketId) {
      parts.push(`Linear ticket: ${ctx.linearTicketId}`);
    }
    if (ctx.notionUrl) {
      parts.push(`Notion proposal: ${ctx.notionUrl}`);
    }
  }

  // Load output format from prompt template (same schema as single-PR reviews)
  const templateRepo = AppDataSource.getRepository(PromptTemplate);
  const template = await templateRepo.findOneBy({ name: 'default' });

  let outputFormat = '';
  if (template) {
    const sections = template.sections;
    if (sections && sections.length > 0) {
      const outputSection = sections.find(
        (s: { key: string; content: string; enabled: boolean }) => s.key === 'output_format' && s.enabled,
      );
      if (outputSection) {
        outputFormat = outputSection.content;
      }
    }
    if (!outputFormat && template.output_instructions) {
      outputFormat = template.output_instructions;
    }
  }

  parts.push('');
  if (outputFormat) {
    parts.push(outputFormat);
  } else {
    parts.push('## Output Instructions');
    parts.push('Output a JSON object with "brief" and "findings" fields.');
  }
  parts.push('');
  parts.push(
    'IMPORTANT: Each finding MUST include "pr_number": <number> to attribute it to the correct PR in the stack.',
  );
  parts.push(
    'Look for: cross-PR inconsistencies, missing integration points, duplicated code across PRs, and issues that only become visible when viewing the full stack.',
  );

  return parts.join('\n');
}

// --- Prompt Builder ---

export interface BuildPromptResult {
  prompt: string;
  disableProjectRules: boolean;
}

export async function buildPrompt(
  pr: PullRequest,
  ctx: ContextPack,
  priorComments?: PRCommentContext,
): Promise<BuildPromptResult> {
  const templateRepo = AppDataSource.getRepository(PromptTemplate);
  const template = await templateRepo.findOneBy({ name: 'default' });

  if (!template) {
    throw new Error('Default prompt template not found. Run migrations to create it.');
  }

  const parts: string[] = [];
  let disableProjectRules = false;

  // Use sections if available, otherwise fall back to legacy fields
  const sections = template.sections;
  if (sections && sections.length > 0) {
    for (const section of sections) {
      if (!section.enabled) {
        if (section.key === 'rule_discovery') {
          disableProjectRules = true;
        }
        continue;
      }

      switch (section.key) {
        case 'review_instructions': {
          const preamble = section.content
            .replace(/\{\{pr_number\}\}/g, String(pr.github_pr_number))
            .replace(/\{\{pr_title\}\}/g, pr.title);
          parts.push(preamble);
          break;
        }
        case 'rule_discovery':
          // No prompt content — controls CLI flag only
          break;
        case 'pr_metadata': {
          parts.push(`\n## PR Metadata`);
          parts.push(`Branch: ${pr.branch_name} → ${pr.base_branch}`);
          if (pr.stack_id && pr.stack_position !== null && pr.stack_size !== null) {
            parts.push(`Stack position: ${pr.stack_position}/${pr.stack_size}`);
          }
          break;
        }
        case 'business_context': {
          if (ctx.linearTicketId || ctx.notionUrl) {
            parts.push('\n## Business Context');
            if (ctx.linearTicketId) {
              parts.push(`Linear ticket: ${ctx.linearTicketId}`);
            }
            if (ctx.notionUrl) {
              parts.push(`Notion proposal: ${ctx.notionUrl}`);
            }
          }
          break;
        }
        case 'prior_comments': {
          if (priorComments && priorComments.threads.length > 0) {
            parts.push('\n## Prior Review Comments');
            parts.push(
              'This PR has been reviewed before. Below are the comments that were posted and any replies from the author.',
            );
            parts.push(
              'Check whether each issue has been addressed in the current diff. If resolved, do not re-raise it.',
            );
            parts.push(
              'If still present or only partially fixed, include it in your findings with a note about what remains.',
            );

            for (let i = 0; i < priorComments.threads.length; i++) {
              const thread = priorComments.threads[i];
              const root = thread.rootComment;
              const location = root.line ? `${root.path}:${root.line}` : root.path;
              const excerpt =
                root.body.length > 120 ? `${root.body.slice(0, 120)}...` : root.body;

              parts.push(`\n### Thread ${i + 1}: [${location}]`);
              parts.push(`**Reviewer (@${root.user.login}):** ${excerpt}`);

              if (thread.replies.length > 0) {
                for (const reply of thread.replies) {
                  const replyExcerpt =
                    reply.body.length > 120
                      ? `${reply.body.slice(0, 120)}...`
                      : reply.body;
                  parts.push(`**@${reply.user.login}:** ${replyExcerpt}`);
                }
              } else {
                parts.push('*No replies*');
              }
            }
          }
          break;
        }
        case 'output_format': {
          parts.push(`\n${section.content}`);
          break;
        }
      }
    }
  } else {
    // Legacy fallback: no sections defined
    const preamble = template.system_instructions
      .replace(/\{\{pr_number\}\}/g, String(pr.github_pr_number))
      .replace(/\{\{pr_title\}\}/g, pr.title);
    parts.push(preamble);

    parts.push(`\n## PR Metadata`);
    parts.push(`Branch: ${pr.branch_name} → ${pr.base_branch}`);
    if (pr.stack_id && pr.stack_position !== null && pr.stack_size !== null) {
      parts.push(`Stack position: ${pr.stack_position}/${pr.stack_size}`);
    }

    if (ctx.linearTicketId || ctx.notionUrl) {
      parts.push('\n## Business Context');
      if (ctx.linearTicketId) {
        parts.push(`Linear ticket: ${ctx.linearTicketId}`);
      }
      if (ctx.notionUrl) {
        parts.push(`Notion proposal: ${ctx.notionUrl}`);
      }
    }

    if (priorComments && priorComments.threads.length > 0) {
      parts.push('\n## Prior Review Comments');
      parts.push(
        'This PR has been reviewed before. Below are the comments that were posted and any replies from the author.',
      );
      parts.push(
        'Check whether each issue has been addressed in the current diff. If resolved, do not re-raise it.',
      );
      parts.push(
        'If still present or only partially fixed, include it in your findings with a note about what remains.',
      );

      for (let i = 0; i < priorComments.threads.length; i++) {
        const thread = priorComments.threads[i];
        const root = thread.rootComment;
        const location = root.line ? `${root.path}:${root.line}` : root.path;
        const excerpt =
          root.body.length > 120 ? `${root.body.slice(0, 120)}...` : root.body;

        parts.push(`\n### Thread ${i + 1}: [${location}]`);
        parts.push(`**Reviewer (@${root.user.login}):** ${excerpt}`);

        if (thread.replies.length > 0) {
          for (const reply of thread.replies) {
            const replyExcerpt =
              reply.body.length > 120
                ? `${reply.body.slice(0, 120)}...`
                : reply.body;
            parts.push(`**@${reply.user.login}:** ${replyExcerpt}`);
          }
        } else {
          parts.push('*No replies*');
        }
      }
    }

    parts.push(`\n${template.output_instructions}`);
  }

  return { prompt: parts.join('\n'), disableProjectRules };
}

// Module-level singleton
export const reviewRunner = new ReviewRunner();
