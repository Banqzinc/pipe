import crypto from 'node:crypto';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../db/data-source';
import { Repo } from '../entities/Repo.entity';
import { PullRequest } from '../entities/PullRequest.entity';
import { PrStatus } from '../entities/enums';
import { GitHubClient } from './github-client';
import { decrypt } from '../lib/encryption';
import { logger } from '../lib/logger';

const ROOT_BRANCHES = new Set(['main', 'master', 'develop']);

export class SyncService {
  /**
   * Sync all open PRs for a repo from GitHub.
   * Returns the number of PRs synced (upserted).
   */
  async syncRepo(repoId: string): Promise<number> {
    const repoRepo = AppDataSource.getRepository(Repo);
    const prRepo = AppDataSource.getRepository(PullRequest);

    // 1. Load repo from DB
    const repo = await repoRepo.findOneBy({ id: repoId });
    if (!repo) {
      throw new Error(`Repo not found: ${repoId}`);
    }

    // 2. Decrypt PAT, create GitHubClient
    const pat = decrypt(repo.pat_token_encrypted);
    const client = new GitHubClient(pat);

    // 3. Fetch all open PRs via client.listOpenPRs()
    const openPRs = await client.listOpenPRs(repo.github_owner, repo.github_name);

    // 4. For each PR: upsert PullRequest record
    const openPrNumbers: number[] = [];

    for (const ghPr of openPRs) {
      openPrNumbers.push(ghPr.number);

      const linearTicket = SyncService.extractLinearTicket(ghPr.head.ref, ghPr.body);

      await prRepo.upsert(
        {
          repo_id: repoId,
          github_pr_number: ghPr.number,
          title: ghPr.title,
          author: ghPr.user.login,
          branch_name: ghPr.head.ref,
          base_branch: ghPr.base.ref,
          head_sha: ghPr.head.sha,
          status: PrStatus.Open,
          is_draft: ghPr.draft,
          linear_ticket_id: linearTicket,
        },
        {
          conflictPaths: ['repo_id', 'github_pr_number'],
        },
      );
    }

    // Detect stacks and update
    const stackInput = openPRs.map((ghPr) => ({
      github_pr_number: ghPr.number,
      base_branch: ghPr.base.ref,
      branch_name: ghPr.head.ref,
    }));
    const stacks = SyncService.detectStacks(stackInput);

    for (const [prNumber, stackInfo] of stacks) {
      await prRepo.update(
        { repo_id: repoId, github_pr_number: prNumber },
        {
          stack_id: stackInfo.stack_id,
          stack_position: stackInfo.stack_position,
          stack_size: stackInfo.stack_size,
        },
      );
    }

    // Clear stack info for PRs not in any stack
    const stackedNumbers = Array.from(stacks.keys());
    if (openPrNumbers.length > 0) {
      const unStackedPrs = openPrNumbers.filter((n) => !stackedNumbers.includes(n));
      if (unStackedPrs.length > 0) {
        await prRepo.update(
          { repo_id: repoId, github_pr_number: In(unStackedPrs) },
          { stack_id: null, stack_position: null, stack_size: null },
        );
      }
    }

    // 5. Mark PRs not in the open list as closed (if they were open)
    if (openPrNumbers.length > 0) {
      await prRepo.update(
        {
          repo_id: repoId,
          status: PrStatus.Open,
          github_pr_number: Not(In(openPrNumbers)),
        },
        { status: PrStatus.Closed },
      );
    } else {
      // No open PRs — close all that were open
      await prRepo.update(
        { repo_id: repoId, status: PrStatus.Open },
        { status: PrStatus.Closed },
      );
    }

    logger.info(
      { repoId, synced: openPRs.length },
      'Synced open PRs for repo',
    );

    return openPRs.length;
  }

  /**
   * Extract Linear ticket ID from branch name or description.
   * Regex: /([A-Z]+-\d+)/ — first match from branch name, then description.
   * Case-insensitive on branch name (e.g. "core-558" matches as "CORE-558").
   */
  static extractLinearTicket(
    branchName: string,
    description?: string | null,
  ): string | null {
    const pattern = /([A-Z]+-\d+)/i;

    const branchMatch = branchName.match(pattern);
    if (branchMatch) {
      return branchMatch[1].toUpperCase();
    }

    if (description) {
      const descMatch = description.match(pattern);
      if (descMatch) {
        return descMatch[1].toUpperCase();
      }
    }

    return null;
  }

  /**
   * Detect stacks from a list of PRs.
   * A PR is stacked if its base_branch is NOT main/master/develop.
   * Walk base_branch chains to find the root PR (targeting main).
   * stack_id = deterministic hash of root PR's branch name.
   * stack_position = distance from root (1 = closest to main).
   * stack_size = total PRs in the chain.
   */
  static detectStacks(
    prs: Array<{
      github_pr_number: number;
      base_branch: string;
      branch_name: string;
    }>,
  ): Map<number, { stack_id: string; stack_position: number; stack_size: number }> {
    const result = new Map<
      number,
      { stack_id: string; stack_position: number; stack_size: number }
    >();

    if (prs.length === 0) return result;

    // Build a map: branch_name → PR
    const branchToPr = new Map<string, (typeof prs)[0]>();
    for (const pr of prs) {
      branchToPr.set(pr.branch_name, pr);
    }

    // Build adjacency: for each PR whose base is not a root branch,
    // find the parent PR (the one whose branch_name === this PR's base_branch)
    // child.base_branch === parent.branch_name

    // Build chains: group PRs into stacks by walking to root
    // A "root" PR of a stack is one whose base_branch IS a root branch (main/master/develop)
    // and at least one other PR's base_branch points to its branch_name.

    // Map from root PR's branch_name to ordered list of PRs in the chain
    const chains = new Map<string, Array<(typeof prs)[0]>>();

    // For each PR, walk up the chain to find the root
    function findRoot(
      pr: (typeof prs)[0],
      visited: Set<string>,
    ): (typeof prs)[0] | null {
      if (ROOT_BRANCHES.has(pr.base_branch)) {
        return pr; // This PR targets main — it's the root of its stack
      }

      const parent = branchToPr.get(pr.base_branch);
      if (!parent || visited.has(parent.branch_name)) {
        // Parent not in our PR list or circular — orphan stacked PR
        return null;
      }

      visited.add(parent.branch_name);
      return findRoot(parent, visited);
    }

    // Identify all stacked PRs (base != root branch)
    const stackedPrs = prs.filter((pr) => !ROOT_BRANCHES.has(pr.base_branch));

    if (stackedPrs.length === 0) return result;

    // For each stacked PR, find its root
    for (const pr of stackedPrs) {
      const visited = new Set<string>([pr.branch_name]);
      const root = findRoot(pr, visited);

      if (root) {
        if (!chains.has(root.branch_name)) {
          chains.set(root.branch_name, [root]);
        }
        const chain = chains.get(root.branch_name)!;
        if (!chain.includes(pr)) {
          chain.push(pr);
        }
      }
      // If root is null, this is an orphan stacked PR — we skip it
      // (its base_branch points to a branch not in our PR list)
    }

    // Also ensure root PRs that have children are included
    // (they may not be in stackedPrs since their base IS main)
    // Already handled above — root is added to chain when first child finds it.

    // Now sort each chain by position (walk from root)
    for (const [rootBranch, chain] of chains) {
      if (chain.length <= 1) {
        // A root PR with no children in the list isn't really a stack
        continue;
      }

      // Sort: root first, then each subsequent PR whose base_branch === previous branch_name
      const ordered: Array<(typeof prs)[0]> = [];
      const remaining = new Set(chain);

      // Find the root (the one targeting main/master/develop)
      const rootPr = chain.find((pr) => ROOT_BRANCHES.has(pr.base_branch));
      if (!rootPr) continue;

      ordered.push(rootPr);
      remaining.delete(rootPr);

      let currentBranch = rootPr.branch_name;
      while (remaining.size > 0) {
        const next = Array.from(remaining).find(
          (pr) => pr.base_branch === currentBranch,
        );
        if (!next) break;
        ordered.push(next);
        remaining.delete(next);
        currentBranch = next.branch_name;
      }

      // Add any remaining PRs that we couldn't order (shouldn't happen in well-formed stacks)
      for (const pr of remaining) {
        ordered.push(pr);
      }

      const stackId = crypto
        .createHash('sha256')
        .update(rootBranch)
        .digest('hex')
        .slice(0, 16);

      for (let i = 0; i < ordered.length; i++) {
        result.set(ordered[i].github_pr_number, {
          stack_id: stackId,
          stack_position: i + 1,
          stack_size: ordered.length,
        });
      }
    }

    return result;
  }
}
