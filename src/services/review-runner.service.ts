import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { PromptTemplate } from '../entities/PromptTemplate.entity';
import { RunStatus, FindingSeverity, FindingStatus } from '../entities/enums';
import { ContextPackBuilder, type ContextPack } from './context-pack.service';
import { analyzeRisk } from './risk-engine';
import { parseToolkitOutput, type ParsedFinding } from './output-parser';
import { logger } from '../lib/logger';
import { runEventBus } from '../lib/run-event-bus';
import { loadConfig } from '../config';

const CLI_TIMEOUT_MS = 300_000; // 5 minutes
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
  private queue: string[] = []; // run IDs
  private processing = false;

  async enqueueRun(runId: string): Promise<void> {
    logger.info({ runId }, 'Enqueueing run');
    this.queue.push(runId);
    if (!this.processing) {
      // Fire-and-forget: start processing the queue
      this.processQueue().catch((err) => {
        logger.error({ err }, 'Queue processing failed unexpectedly');
      });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const runId = this.queue.shift()!;
        await this.processRunWithRetry(runId);
      }
    } finally {
      this.processing = false;
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

    // 2. Build context pack
    const contextPackBuilder = new ContextPackBuilder();
    const contextPack = await contextPackBuilder.build(run);

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
    if (run.prompt) {
      prompt = run.prompt;
      logger.info({ runId }, 'Using user-supplied custom prompt');
    } else {
      prompt = await buildPrompt(pr, contextPack);
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

    logger.info({ runId, repoDir, allowedTools }, 'Spawning CLI');
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

      // Flush accumulated display text to DB every 5 seconds
      const flushInterval = setInterval(() => {
        if (displayText.length > lastFlushedLength) {
          lastFlushedLength = displayText.length;
          runRepo.update(runId, { cli_output: displayText }).catch((err) => {
            logger.warn({ runId, err }, 'Failed to flush cli_output');
          });
        }
      }, 5_000);

      // Manual timeout
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI timed out after ${CLI_TIMEOUT_MS}ms`));
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
          try {
            const event = JSON.parse(line);

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

      child.on('close', (code) => {
        clearInterval(flushInterval);
        clearTimeout(timeout);

        // Process any remaining data in line buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer);
            if (event.type === 'result') {
              resultLine = lineBuffer;
            }
          } catch {
            // ignore
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

        if (attempt < MAX_RETRIES) {
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

// --- Prompt Builder ---

export async function buildPrompt(pr: PullRequest, ctx: ContextPack): Promise<string> {
  const templateRepo = AppDataSource.getRepository(PromptTemplate);
  const template = await templateRepo.findOneBy({ name: 'default' });

  if (!template) {
    throw new Error('Default prompt template not found. Run migrations to create it.');
  }

  const parts: string[] = [];

  // System instructions from template (with placeholder replacement)
  const preamble = template.system_instructions
    .replace(/\{\{pr_number\}\}/g, String(pr.github_pr_number))
    .replace(/\{\{pr_title\}\}/g, pr.title);
  parts.push(preamble);

  // PR metadata — the toolkit reads the actual diff and rules from the repo
  parts.push(`\n## PR Metadata`);
  parts.push(`Branch: ${pr.branch_name} → ${pr.base_branch}`);

  if (pr.stack_id && pr.stack_position !== null && pr.stack_size !== null) {
    parts.push(`Stack position: ${pr.stack_position}/${pr.stack_size}`);
  }

  // Business context — toolkit uses MCP to fetch full content
  if (ctx.linearTicketId || ctx.notionUrl) {
    parts.push('\n## Business Context');
    if (ctx.linearTicketId) {
      parts.push(`Linear ticket: ${ctx.linearTicketId}`);
    }
    if (ctx.notionUrl) {
      parts.push(`Notion proposal: ${ctx.notionUrl}`);
    }
  }

  // Output instructions from template
  parts.push(`\n${template.output_instructions}`);

  return parts.join('\n');
}

// Module-level singleton
export const reviewRunner = new ReviewRunner();
