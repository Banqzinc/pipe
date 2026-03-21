import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { AppDataSource } from '../db/data-source';
import { PullRequest } from '../entities/PullRequest.entity';
import { Repo } from '../entities/Repo.entity';
import { ReviewRun } from '../entities/ReviewRun.entity';
import { decrypt } from '../lib/encryption';
import { logger } from '../lib/logger';
import { loadConfig } from '../config';
import { GitHubClient } from './github-client';

const execFile = promisify(execFileCb);

const MAX_DIFF_LINES = 3000;

const RULE_FILENAMES = ['CLAUDE.md', 'AGENTS.md'];

// --- Types ---

export interface ContextPack {
  diff: string;
  diffTruncated: boolean;
  changedFiles: string[];
  rules: Array<{ path: string; content: string }>;
  parentDiff: string | null;
  childDiff: string | null;
  linearTicketId: string | null;
  notionUrl: string | null;
}

// --- Builder ---

export class ContextPackBuilder {
  async build(run: ReviewRun): Promise<ContextPack> {
    const config = loadConfig();

    // 1. Load PR + Repo from DB
    logger.info({ runId: run.id, prId: run.pr_id }, 'Building context pack');

    const prRepo = AppDataSource.getRepository(PullRequest);
    const pr = await prRepo.findOne({
      where: { id: run.pr_id },
      relations: ['repo'],
    });
    if (!pr) {
      throw new Error(`PullRequest not found: ${run.pr_id}`);
    }

    const repo: Repo = pr.repo;
    if (!repo) {
      throw new Error(`Repo relation not loaded for PR: ${pr.id}`);
    }

    const pat = decrypt(repo.pat_token_encrypted);
    const client = new GitHubClient(pat);
    const owner = repo.github_owner;
    const name = repo.github_name;
    const prNumber = pr.github_pr_number;

    // 2. Fetch diff
    let diff = '';
    let diffTruncated = false;
    try {
      diff = await client.getPRDiff(owner, name, prNumber);
      const lines = diff.split('\n');
      if (lines.length > MAX_DIFF_LINES) {
        diff = lines.slice(0, MAX_DIFF_LINES).join('\n');
        diffTruncated = true;
        logger.warn(
          { runId: run.id, totalLines: lines.length },
          'Diff truncated to %d lines',
          MAX_DIFF_LINES,
        );
      }
    } catch (err) {
      logger.error({ runId: run.id, err }, 'Failed to fetch PR diff');
    }

    // 3. Fetch changed files
    let changedFiles: string[] = [];
    try {
      const files = await client.getPRFiles(owner, name, prNumber);
      changedFiles = files.map((f) => f.filename);
    } catch (err) {
      logger.error({ runId: run.id, err }, 'Failed to fetch PR files');
    }

    // 4. Clone/pull repo locally for rule discovery
    const repoDir = path.join(config.reposDir, owner, name);
    let cloneOk = false;
    try {
      await ensureRepo(repoDir, owner, name, pat, run.head_sha);
      cloneOk = true;
    } catch (err) {
      logger.error({ runId: run.id, repoDir, err }, 'Failed to clone/checkout repo');
    }

    // 5. Discover rules
    let rules: Array<{ path: string; content: string }> = [];
    if (cloneOk) {
      try {
        rules = discoverRules(repoDir, changedFiles);
        logger.info(
          { runId: run.id, ruleCount: rules.length },
          'Discovered %d rule files',
          rules.length,
        );
      } catch (err) {
        logger.error({ runId: run.id, err }, 'Failed to discover rules');
      }
    }

    // 6. Fetch stack context
    let parentDiff: string | null = null;
    let childDiff: string | null = null;

    if (pr.stack_id && pr.stack_position !== null) {
      try {
        const stackResult = await fetchStackDiffs(
          prRepo,
          client,
          owner,
          name,
          pr.stack_id,
          pr.stack_position,
        );
        parentDiff = stackResult.parentDiff;
        childDiff = stackResult.childDiff;
      } catch (err) {
        logger.error({ runId: run.id, err }, 'Failed to fetch stack diffs');
      }
    }

    // 7. Business context (pass-through)
    const linearTicketId = pr.linear_ticket_id;
    const notionUrl = pr.notion_url;

    const contextPack: ContextPack = {
      diff,
      diffTruncated,
      changedFiles,
      rules,
      parentDiff,
      childDiff,
      linearTicketId,
      notionUrl,
    };

    logger.info(
      {
        runId: run.id,
        diffLines: diff.split('\n').length,
        diffTruncated,
        changedFileCount: changedFiles.length,
        ruleCount: rules.length,
        hasParentDiff: parentDiff !== null,
        hasChildDiff: childDiff !== null,
        linearTicketId,
        notionUrl,
      },
      'Context pack built',
    );

    return contextPack;
  }
}

// --- Helpers ---

/**
 * Clone the repo if it doesn't exist, otherwise fetch and checkout the target SHA.
 * Uses execFile (not exec) to prevent shell injection.
 */
async function ensureRepo(
  repoDir: string,
  owner: string,
  name: string,
  pat: string,
  headSha: string,
): Promise<void> {
  const cloneUrl = `https://x-access-token:${pat}@github.com/${owner}/${name}.git`;

  if (!fs.existsSync(repoDir)) {
    // Create parent dirs
    fs.mkdirSync(path.dirname(repoDir), { recursive: true });

    logger.info({ repoDir }, 'Cloning repo');
    await execFile('git', ['clone', cloneUrl, repoDir]);
  }

  // Fetch latest and checkout target SHA
  logger.info({ repoDir, headSha }, 'Fetching and checking out HEAD SHA');
  await execFile('git', ['fetch', 'origin'], { cwd: repoDir });
  await execFile('git', ['checkout', headSha], { cwd: repoDir });
}

/**
 * Discover rule files from the cloned repo:
 * - CLAUDE.md and AGENTS.md at repo root
 * - CLAUDE.md and AGENTS.md in parent dirs of each changed file
 * - .cursor/rules/*.mdc files
 * - .review/rules/* files
 *
 * Deduplicates by relative path.
 */
function discoverRules(
  repoDir: string,
  changedFiles: string[],
): Array<{ path: string; content: string }> {
  const seen = new Set<string>();
  const rules: Array<{ path: string; content: string }> = [];

  function addRule(absolutePath: string): void {
    const relativePath = path.relative(repoDir, absolutePath);
    if (seen.has(relativePath)) return;
    if (!fs.existsSync(absolutePath)) return;

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      seen.add(relativePath);
      rules.push({ path: relativePath, content });
    } catch {
      // Skip unreadable files
    }
  }

  // Check repo root for CLAUDE.md, AGENTS.md
  for (const filename of RULE_FILENAMES) {
    addRule(path.join(repoDir, filename));
  }

  // Walk parent directories of each changed file
  for (const file of changedFiles) {
    let dir = path.dirname(file);
    while (dir && dir !== '.') {
      for (const filename of RULE_FILENAMES) {
        addRule(path.join(repoDir, dir, filename));
      }
      const parent = path.dirname(dir);
      if (parent === dir) break; // reached root
      dir = parent;
    }
  }

  // Glob for .cursor/rules/*.mdc
  const cursorRulesDir = path.join(repoDir, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir)) {
    try {
      const entries = fs.readdirSync(cursorRulesDir);
      for (const entry of entries) {
        if (entry.endsWith('.mdc')) {
          addRule(path.join(cursorRulesDir, entry));
        }
      }
    } catch {
      // Skip unreadable directory
    }
  }

  // Glob for .review/rules/*
  const reviewRulesDir = path.join(repoDir, '.review', 'rules');
  if (fs.existsSync(reviewRulesDir)) {
    try {
      const entries = fs.readdirSync(reviewRulesDir);
      for (const entry of entries) {
        addRule(path.join(reviewRulesDir, entry));
      }
    } catch {
      // Skip unreadable directory
    }
  }

  return rules;
}

/**
 * Fetch diffs for parent and child PRs in a stack.
 */
async function fetchStackDiffs(
  prRepo: ReturnType<typeof AppDataSource.getRepository<PullRequest>>,
  client: GitHubClient,
  owner: string,
  name: string,
  stackId: string,
  stackPosition: number,
): Promise<{ parentDiff: string | null; childDiff: string | null }> {
  let parentDiff: string | null = null;
  let childDiff: string | null = null;

  // Parent: same stack, position - 1
  const parentPr = await prRepo.findOneBy({
    stack_id: stackId,
    stack_position: stackPosition - 1,
  });
  if (parentPr) {
    try {
      parentDiff = await client.getPRDiff(owner, name, parentPr.github_pr_number);
      logger.info(
        { parentPrNumber: parentPr.github_pr_number },
        'Fetched parent stack diff',
      );
    } catch (err) {
      logger.error(
        { parentPrNumber: parentPr.github_pr_number, err },
        'Failed to fetch parent stack diff',
      );
    }
  }

  // Child: same stack, position + 1
  const childPr = await prRepo.findOneBy({
    stack_id: stackId,
    stack_position: stackPosition + 1,
  });
  if (childPr) {
    try {
      childDiff = await client.getPRDiff(owner, name, childPr.github_pr_number);
      logger.info(
        { childPrNumber: childPr.github_pr_number },
        'Fetched child stack diff',
      );
    } catch (err) {
      logger.error(
        { childPrNumber: childPr.github_pr_number, err },
        'Failed to fetch child stack diff',
      );
    }
  }

  return { parentDiff, childDiff };
}
