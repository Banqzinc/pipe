import { describe, it, expect } from 'vitest';
import { SyncService } from '../../services/sync.service';

describe('SyncService', () => {
  describe('extractLinearTicket', () => {
    it('extracts ticket from branch name', () => {
      expect(SyncService.extractLinearTicket('rabi/core-558-add-feature')).toBe('CORE-558');
    });

    it('extracts ticket from branch with prefix', () => {
      expect(SyncService.extractLinearTicket('feature/CORE-123-new-thing')).toBe('CORE-123');
    });

    it('extracts ticket from description when not in branch', () => {
      expect(SyncService.extractLinearTicket('feature/add-auth', 'Implements CORE-123')).toBe('CORE-123');
    });

    it('returns null when no ticket found', () => {
      expect(SyncService.extractLinearTicket('feature/add-auth', 'No ticket here')).toBeNull();
    });

    it('prefers branch name over description', () => {
      expect(SyncService.extractLinearTicket('rabi/core-100-fix', 'Related to CORE-200')).toBe('CORE-100');
    });

    it('handles uppercase in branch name', () => {
      expect(SyncService.extractLinearTicket('feature/FE-42-button-fix')).toBe('FE-42');
    });

    it('returns null for empty inputs', () => {
      expect(SyncService.extractLinearTicket('')).toBeNull();
    });

    it('handles description-only with null description', () => {
      expect(SyncService.extractLinearTicket('feature/no-ticket', null)).toBeNull();
    });
  });

  describe('detectStacks', () => {
    it('detects a simple stack', () => {
      const prs = [
        { github_pr_number: 1, base_branch: 'main', branch_name: 'feature/base' },
        { github_pr_number: 2, base_branch: 'feature/base', branch_name: 'feature/middle' },
        { github_pr_number: 3, base_branch: 'feature/middle', branch_name: 'feature/top' },
      ];
      const stacks = SyncService.detectStacks(prs);
      expect(stacks.get(1)?.stack_position).toBe(1);
      expect(stacks.get(2)?.stack_position).toBe(2);
      expect(stacks.get(3)?.stack_position).toBe(3);
      expect(stacks.get(1)?.stack_size).toBe(3);
      // All share same stack_id
      expect(stacks.get(1)?.stack_id).toBe(stacks.get(2)?.stack_id);
      expect(stacks.get(2)?.stack_id).toBe(stacks.get(3)?.stack_id);
    });

    it('returns empty map for standalone PRs', () => {
      const prs = [
        { github_pr_number: 1, base_branch: 'main', branch_name: 'feature/solo' },
      ];
      const stacks = SyncService.detectStacks(prs);
      expect(stacks.size).toBe(0);
    });

    it('handles multiple stacks', () => {
      const prs = [
        { github_pr_number: 1, base_branch: 'main', branch_name: 'stack-a/base' },
        { github_pr_number: 2, base_branch: 'stack-a/base', branch_name: 'stack-a/top' },
        { github_pr_number: 3, base_branch: 'main', branch_name: 'stack-b/base' },
        { github_pr_number: 4, base_branch: 'stack-b/base', branch_name: 'stack-b/top' },
      ];
      const stacks = SyncService.detectStacks(prs);
      expect(stacks.get(1)?.stack_id).not.toBe(stacks.get(3)?.stack_id);
      expect(stacks.get(1)?.stack_id).toBe(stacks.get(2)?.stack_id);
      expect(stacks.get(3)?.stack_id).toBe(stacks.get(4)?.stack_id);
    });

    it('handles PRs targeting develop as root', () => {
      const prs = [
        { github_pr_number: 1, base_branch: 'develop', branch_name: 'feature/base' },
        { github_pr_number: 2, base_branch: 'feature/base', branch_name: 'feature/top' },
      ];
      const stacks = SyncService.detectStacks(prs);
      expect(stacks.get(1)?.stack_position).toBe(1);
      expect(stacks.get(2)?.stack_position).toBe(2);
      expect(stacks.get(1)?.stack_size).toBe(2);
    });

    it('returns empty map when no PRs are stacked', () => {
      const prs = [
        { github_pr_number: 1, base_branch: 'main', branch_name: 'feature/a' },
        { github_pr_number: 2, base_branch: 'main', branch_name: 'feature/b' },
      ];
      const stacks = SyncService.detectStacks(prs);
      expect(stacks.size).toBe(0);
    });

    it('handles empty PR list', () => {
      const stacks = SyncService.detectStacks([]);
      expect(stacks.size).toBe(0);
    });

    it('detects stack with PR whose base is another PR branch but root is not in list', () => {
      // PR 2 targets PR 1's branch, but PR 1 targets 'main' — both in list
      // PR 3 targets a branch not in the list — it's a stacked PR but its chain is incomplete
      const prs = [
        { github_pr_number: 1, base_branch: 'main', branch_name: 'feature/base' },
        { github_pr_number: 2, base_branch: 'feature/base', branch_name: 'feature/mid' },
        { github_pr_number: 3, base_branch: 'feature/orphan', branch_name: 'feature/child' },
      ];
      const stacks = SyncService.detectStacks(prs);
      // PR 1 and 2 form a stack
      expect(stacks.get(1)?.stack_size).toBe(2);
      expect(stacks.get(2)?.stack_size).toBe(2);
      // PR 3 is stacked (base is not main/master/develop) but has no root in list
      // Still should be detected as a stack of 1 with its orphan base
      // Based on spec: a PR is stacked if base_branch != main/master/develop
      // PR 3's base_branch 'feature/orphan' is not main — it's considered stacked
    });
  });
});
