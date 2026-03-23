import { In } from 'typeorm';
import { AppDataSource } from '../db/data-source';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { Finding } from '../entities/Finding.entity';
import { ReviewPost } from '../entities/ReviewPost.entity';
import { FindingStatus, FindingSeverity } from '../entities/enums';
import { decrypt } from '../lib/encryption';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { GitHubClient } from './github-client';

/**
 * Parse a unified diff to extract the valid line ranges on the RIGHT side (new file).
 * Returns a map of file path → Set of valid line numbers for inline comments.
 */
function parseDiffLineMap(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  let currentFile: string | null = null;

  for (const line of diff.split('\n')) {
    // Detect file header: +++ b/path/to/file
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      if (!result.has(currentFile)) {
        result.set(currentFile, new Set());
      }
      continue;
    }

    // Detect hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      const start = Number(hunkMatch[1]);
      const count = hunkMatch[2] != null ? Number(hunkMatch[2]) : 1;
      const lines = result.get(currentFile)!;
      // All lines in this hunk range are valid comment targets
      for (let i = start; i < start + count; i++) {
        lines.add(i);
      }
    }
  }

  return result;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  [FindingSeverity.Critical]: 0,
  [FindingSeverity.Warning]: 1,
  [FindingSeverity.Suggestion]: 2,
  [FindingSeverity.Nitpick]: 3,
};

export class PostingService {
  async postToGitHub(runId: string): Promise<{
    review_id: number;
    review_url: string;
    posted_count: number;
  }> {
    const runRepo = AppDataSource.getRepository(ReviewRun);
    const findingRepo = AppDataSource.getRepository(Finding);
    const postRepo = AppDataSource.getRepository(ReviewPost);

    // 1. Load run with PR and repo relations
    const run = await runRepo.findOne({
      where: { id: runId },
      relations: ['pullRequest', 'pullRequest.repo'],
    });

    if (!run) {
      throw new AppError('Run not found', 404, 'NOT_FOUND');
    }

    const pr = run.pullRequest;
    const repo = pr.repo;

    // 2. Decrypt repo PAT, create GitHubClient
    const pat = decrypt(repo.pat_token_encrypted);
    const client = new GitHubClient(pat);

    // 3. Stale check
    const currentPR = await client.getPR(repo.github_owner, repo.github_name, pr.github_pr_number);
    if (currentPR.head.sha !== run.head_sha) {
      throw new AppError(
        'PR has been updated since this review. Re-run to get fresh findings.',
        409,
        'STALE',
      );
    }

    // 4. Load accepted/edited findings
    const findings = await findingRepo.find({
      where: {
        run_id: runId,
        status: In([FindingStatus.Accepted, FindingStatus.Edited]),
      },
    });

    // 5. If no accepted/edited findings, throw
    if (findings.length === 0) {
      throw new AppError('No accepted findings to post', 400);
    }

    // 6. Fetch diff to validate comment line numbers
    const diff = await client.getPRDiff(repo.github_owner, repo.github_name, pr.github_pr_number);
    const diffLineMap = parseDiffLineMap(diff);

    // 7. Build GitHub review body, separating valid inline comments from out-of-diff ones
    const inlineComments: { path: string; line: number; side: 'RIGHT'; body: string }[] = [];
    const bodyComments: string[] = [];

    for (const f of findings) {
      const commentBody =
        f.status === FindingStatus.Edited && f.edited_body
          ? f.edited_body
          : `**${f.title}**\n\n${f.body}${f.suggested_fix ? `\n\n**Suggested fix:**\n\`\`\`\n${f.suggested_fix}\n\`\`\`` : ''}`;

      const validLines = diffLineMap.get(f.file_path);
      if (validLines && validLines.has(f.start_line)) {
        inlineComments.push({
          path: f.file_path,
          line: f.start_line,
          side: 'RIGHT' as const,
          body: commentBody,
        });
      } else {
        // Line not in diff — include as body comment
        bodyComments.push(`**${f.file_path}:${f.start_line}** — ${commentBody}`);
        logger.info(
          { runId, file: f.file_path, line: f.start_line },
          'Finding line not in diff, moving to review body',
        );
      }
    }

    const body = bodyComments.length > 0
      ? `### Additional findings (lines not in diff)\n\n${bodyComments.join('\n\n---\n\n')}`
      : '';

    const reviewBody = {
      event: 'COMMENT' as const,
      body,
      comments: inlineComments,
    };

    // 7. Call client.createReview
    let review;
    try {
      review = await client.createReview(
        repo.github_owner,
        repo.github_name,
        pr.github_pr_number,
        reviewBody,
      );
    } catch (err) {
      logger.error({ runId, err }, 'Failed to create GitHub review');
      throw new AppError(
        `Failed to post review to GitHub: ${err instanceof Error ? err.message : String(err)}`,
        502,
        'GITHUB_API_ERROR',
      );
    }

    // 8. Create ReviewPost record
    const post = postRepo.create({
      run_id: runId,
      github_review_id: String(review.id),
      posted_sha: run.head_sha,
      findings_count: findings.length,
      posted_at: new Date(),
    });
    await postRepo.save(post);

    // 9. Update all posted findings' status to Posted
    const findingIds = findings.map((f) => f.id);
    await findingRepo.update(findingIds, { status: FindingStatus.Posted });

    logger.info({ runId, reviewId: review.id, postedCount: findings.length }, 'Review posted to GitHub');

    // 10. Return result
    return {
      review_id: review.id,
      review_url: review.html_url,
      posted_count: findings.length,
    };
  }

  async exportFindings(runId: string): Promise<{
    markdown: string;
    findings_count: number;
  }> {
    const runRepo = AppDataSource.getRepository(ReviewRun);
    const findingRepo = AppDataSource.getRepository(Finding);

    // 1. Load run with PR relation
    const run = await runRepo.findOne({
      where: { id: runId },
      relations: ['pullRequest'],
    });

    if (!run) {
      throw new AppError('Run not found', 404, 'NOT_FOUND');
    }

    const pr = run.pullRequest;

    // 2. Load accepted/edited findings, ordered by severity then toolkit_order
    const findings = await findingRepo.find({
      where: {
        run_id: runId,
        status: In([FindingStatus.Accepted, FindingStatus.Edited]),
      },
      order: {
        toolkit_order: 'ASC',
      },
    });

    // Sort by severity first (critical first), then toolkit_order
    findings.sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.toolkit_order - b.toolkit_order;
    });

    // 3. Group by severity
    const groups: Record<FindingSeverity, Finding[]> = {
      [FindingSeverity.Critical]: [],
      [FindingSeverity.Warning]: [],
      [FindingSeverity.Suggestion]: [],
      [FindingSeverity.Nitpick]: [],
    };

    for (const finding of findings) {
      groups[finding.severity].push(finding);
    }

    // 4. Generate markdown
    const lines: string[] = [];
    lines.push(`# Self-Review Findings — PR #${pr.github_pr_number}: ${pr.title}`);
    lines.push('');

    const severityLabels: [FindingSeverity, string][] = [
      [FindingSeverity.Critical, 'Critical'],
      [FindingSeverity.Warning, 'Warning'],
      [FindingSeverity.Suggestion, 'Suggestion'],
      [FindingSeverity.Nitpick, 'Nitpick'],
    ];

    for (const [severity, label] of severityLabels) {
      const group = groups[severity];
      if (group.length === 0) continue;

      lines.push(`## ${label} (${group.length})`);

      for (const f of group) {
        const fileName = f.file_path.split('/').pop() ?? f.file_path;
        lines.push(`- [ ] **${fileName}:${f.start_line}** — ${f.title}`);
        // Indent body as blockquote
        const bodyText = f.status === FindingStatus.Edited && f.edited_body ? f.edited_body : f.body;
        lines.push(`  > ${bodyText}`);
        if (f.suggested_fix) {
          lines.push(`  \`\`\``);
          lines.push(`  ${f.suggested_fix}`);
          lines.push(`  \`\`\``);
        }
      }

      lines.push('');
    }

    const markdown = lines.join('\n');

    return {
      markdown,
      findings_count: findings.length,
    };
  }
}

export const postingService = new PostingService();
