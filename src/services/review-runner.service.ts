import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { RunStatus, FindingSeverity, FindingStatus } from '../entities/enums';
import { ContextPackBuilder, type ContextPack } from './context-pack.service';
import { analyzeRisk } from './risk-engine';
import { parseToolkitOutput, type ParsedFinding } from './output-parser';
import { logger } from '../lib/logger';

const execFileAsync = promisify(execFileCb);

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
    const riskAnalysis = analyzeRisk(
      contextPack.changedFiles,
      contextPack.diff.split('\n').length,
    );

    await runRepo.update(runId, {
      risk_signals: riskAnalysis as any,
    });

    logger.info({ runId, riskLevel: riskAnalysis.overall_risk }, 'Risk analysis complete');

    // 4. Construct prompt
    const prompt = buildPrompt(pr, contextPack);

    // 5. Spawn CLI
    logger.info({ runId }, 'Spawning CLI');
    const rawOutput = await this.spawnCli(prompt);

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
  }

  private async spawnCli(prompt: string): Promise<string> {
    const { stdout } = await execFileAsync(
      'claude',
      ['--print', '--output-format', 'json', '-p', prompt],
      { timeout: CLI_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }, // 50MB max buffer
    );
    return stdout;
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
        }
      }
    }
  }
}

// --- Prompt Builder ---

function buildPrompt(pr: PullRequest, ctx: ContextPack): string {
  const parts: string[] = [];

  parts.push(`You are reviewing PR #${pr.github_pr_number}: ${pr.title}`);

  // Rules
  if (ctx.rules.length > 0) {
    parts.push('\n## Rules');
    parts.push(ctx.rules.map((r) => `### ${r.path}\n${r.content}`).join('\n\n'));
  }

  // PR Diff
  parts.push('\n## PR Diff');
  parts.push(ctx.diff);
  if (ctx.diffTruncated) {
    parts.push('\n[DIFF TRUNCATED — only first 3000 lines shown]');
  }

  // Changed Files
  parts.push('\n## Changed Files');
  parts.push(ctx.changedFiles.join('\n'));

  // Business Context
  if (ctx.linearTicketId) {
    parts.push('\n## Business Context');
    parts.push(`Linear ticket: ${ctx.linearTicketId}`);
    if (ctx.notionUrl) {
      parts.push(`Notion proposal: ${ctx.notionUrl}`);
    }
    parts.push(
      'Use your MCP servers to fetch the ticket and proposal content for context.',
    );
  }

  // Parent PR context
  if (ctx.parentDiff) {
    parts.push(
      '\n## CONTEXT ONLY — Parent PR Diff (do not review directly)',
    );
    parts.push(ctx.parentDiff);
  }

  // Child PR context
  if (ctx.childDiff) {
    parts.push(
      '\n## CONTEXT ONLY — Child PR Diff (do not review directly)',
    );
    parts.push(ctx.childDiff);
  }

  // Output schema instructions
  parts.push(`
Review this PR and output a JSON object matching this exact schema:
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
}

Focus on high-value findings. Fewer comments is better than more. Cite specific repo rules when applicable.`);

  return parts.join('\n');
}

// Module-level singleton
export const reviewRunner = new ReviewRunner();
