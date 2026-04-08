import type {
  PRListItem,
  RunDetail,
  Finding,
  CommentThread,
  IssueComment,
  StackPR,
} from './api';

// --- ANSI colors ---

export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const severityColor: Record<string, string> = {
  critical: RED,
  warning: YELLOW,
  suggestion: BLUE,
  nitpick: GRAY,
};

const statusColor: Record<string, string> = {
  completed: GREEN,
  failed: RED,
  partial: YELLOW,
  running: CYAN,
  queued: GRAY,
};

// --- Helpers ---

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function section(title: string): string {
  const line = '─'.repeat(50);
  return `\n${DIM}── ${RESET}${BOLD}${title} ${DIM}${line.slice(title.length + 4)}${RESET}`;
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

// --- Formatters ---

export function formatPRHeader(run: RunDetail): string {
  const pr = run.pr;
  const repo = `${pr.repo.github_owner}/${pr.repo.github_name}`;
  const color = statusColor[run.status] ?? GRAY;
  const date = run.completed_at
    ? new Date(run.completed_at).toLocaleString()
    : run.started_at
      ? new Date(run.started_at).toLocaleString()
      : '';

  const lines: string[] = [];
  lines.push(`${BOLD}PR #${pr.github_pr_number}: ${pr.title}${RESET}`);
  lines.push(`${DIM}${repo} | ${pr.base_branch}${RESET}`);
  lines.push(`${DIM}Run: ${run.id.slice(0, 8)} | ${color}${run.status}${RESET}${date ? ` ${DIM}| ${date}${RESET}` : ''}`);

  if (run.risk_signals && run.risk_signals.signals.length > 0) {
    const badges = run.risk_signals.signals
      .map((s) => {
        const c = s.level === 'high' ? RED : s.level === 'medium' ? YELLOW : GREEN;
        return `${c}${s.name}${RESET}`;
      })
      .join(' ');
    lines.push(`Risk: ${badges}`);
  }

  return lines.join('\n');
}

export function formatArchitecture(arch: RunDetail['architecture_review']): string {
  if (!arch) return '';

  const lines: string[] = [];
  lines.push(section('Architecture'));
  lines.push(arch.summary);

  if (arch.patterns.length > 0) {
    lines.push('');
    lines.push(`${BOLD}Patterns:${RESET}`);
    for (const p of arch.patterns) {
      const color =
        p.assessment === 'good' ? GREEN : p.assessment === 'problematic' ? RED : YELLOW;
      lines.push(`  ${color}[${p.assessment}]${RESET} ${BOLD}${p.name}${RESET}`);
      lines.push(`  ${DIM}${p.description}${RESET}`);
    }
  }

  if (arch.concerns.length > 0) {
    lines.push('');
    lines.push(`${BOLD}Concerns:${RESET}`);
    for (const c of arch.concerns) {
      const color = c.severity === 'high' ? RED : c.severity === 'medium' ? YELLOW : BLUE;
      lines.push(`  ${color}(${c.severity})${RESET} ${BOLD}${c.title}${RESET}`);
      lines.push(`  ${DIM}${c.description}${RESET}`);
      if (c.affected_files.length > 0) {
        lines.push(`  ${GRAY}Files: ${c.affected_files.join(', ')}${RESET}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatBrief(brief: RunDetail['brief']): string {
  if (!brief) return '';

  const lines: string[] = [];
  lines.push(section('Brief'));

  if (brief.critical_issues.length > 0) {
    lines.push(`${RED}${BOLD}Critical Issues (${brief.critical_issues.length}):${RESET}`);
    for (const issue of brief.critical_issues) {
      lines.push(`  ${RED}*${RESET} ${issue.summary} ${GRAY}${issue.file}:${issue.line}${RESET}`);
    }
  }

  if (brief.important_issues.length > 0) {
    lines.push(`${YELLOW}${BOLD}Important Issues (${brief.important_issues.length}):${RESET}`);
    for (const issue of brief.important_issues) {
      lines.push(`  ${YELLOW}*${RESET} ${issue.summary} ${GRAY}${issue.file}:${issue.line}${RESET}`);
    }
  }

  if (brief.suggestions.length > 0) {
    lines.push(`${BLUE}${BOLD}Suggestions (${brief.suggestions.length}):${RESET}`);
    for (const s of brief.suggestions) {
      lines.push(`  ${BLUE}-${RESET} ${s}`);
    }
  }

  if (brief.strengths.length > 0) {
    lines.push(`${GREEN}${BOLD}Strengths (${brief.strengths.length}):${RESET}`);
    for (const s of brief.strengths) {
      lines.push(`  ${GREEN}+${RESET} ${s}`);
    }
  }

  if (brief.recommended_actions.length > 0) {
    lines.push(`${MAGENTA}${BOLD}Recommended Actions:${RESET}`);
    for (const a of brief.recommended_actions) {
      lines.push(`  ${MAGENTA}-${RESET} ${a}`);
    }
  }

  return lines.join('\n');
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return `\n${DIM}No findings.${RESET}`;

  // Group by severity
  const groups: Record<string, Finding[]> = {};
  for (const f of findings) {
    (groups[f.severity] ??= []).push(f);
  }

  const order = ['critical', 'warning', 'suggestion', 'nitpick'];
  const lines: string[] = [];
  lines.push(section(`Findings (${findings.length})`));

  for (const severity of order) {
    const group = groups[severity];
    if (!group || group.length === 0) continue;

    const color = severityColor[severity] ?? GRAY;
    lines.push('');

    for (const f of group) {
      const label = pad(severity.toUpperCase(), 10);
      const status = f.status !== 'pending' ? ` ${DIM}[${f.status}]${RESET}` : '';
      lines.push(
        `  ${color}${BOLD}${label}${RESET} ${GRAY}${f.file_path}:${f.start_line}${RESET}${status}`,
      );
      lines.push(`  ${' '.repeat(10)} ${f.title}`);
      if (f.body && f.body !== f.title) {
        // Show first 2 lines of body
        const bodyLines = f.body.split('\n').slice(0, 2);
        for (const bl of bodyLines) {
          lines.push(`  ${' '.repeat(10)} ${DIM}${bl}${RESET}`);
        }
      }
      if (f.suggested_fix) {
        lines.push(`  ${' '.repeat(10)} ${CYAN}Fix: ${truncate(f.suggested_fix.split('\n')[0], 80)}${RESET}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatComments(
  threads: CommentThread[],
  issueComments?: IssueComment[],
): string {
  const totalThreads = threads.length;
  const totalIssue = issueComments?.length ?? 0;
  if (totalThreads === 0 && totalIssue === 0) return `\n${DIM}No comments.${RESET}`;

  const lines: string[] = [];
  lines.push(section(`Comments (${totalThreads} threads${totalIssue > 0 ? ` + ${totalIssue} discussion` : ''})`));

  // Review comment threads
  for (const thread of threads) {
    const location = thread.line ? `${thread.path}:${thread.line}` : thread.path;
    const resolved = thread.is_resolved ? ` ${GREEN}[resolved]${RESET}` : '';
    const bodyExcerpt = truncate(thread.root_body.replace(/\n/g, ' '), 120);

    lines.push('');
    lines.push(`  ${BOLD}@${thread.root_user}${RESET} on ${GRAY}${location}${RESET}${resolved}`);
    lines.push(`  ${DIM}> ${bodyExcerpt}${RESET}`);

    for (const reply of thread.replies) {
      const replyExcerpt = truncate(reply.body.replace(/\n/g, ' '), 100);
      lines.push(`  ${GRAY}└${RESET} ${BOLD}@${reply.user}:${RESET} ${replyExcerpt}`);
    }
  }

  // Issue/discussion comments
  if (issueComments && issueComments.length > 0) {
    lines.push('');
    lines.push(`  ${DIM}── Discussion ──${RESET}`);
    for (const c of issueComments) {
      const excerpt = truncate(c.body.replace(/\n/g, ' '), 120);
      lines.push(`  ${BOLD}@${c.user}:${RESET} ${excerpt}`);
    }
  }

  return lines.join('\n');
}

export function formatPRList(prs: PRListItem[]): string {
  if (prs.length === 0) return `${DIM}No pull requests found.${RESET}`;

  const lines: string[] = [];

  // Header
  lines.push(
    `${DIM}${pad('#', 6)} ${pad('PR', 52)} ${pad('Status', 14)} ${pad('Findings', 10)}${RESET}`,
  );

  for (const pr of prs) {
    const num = `#${pr.github_pr_number}`;
    const title = truncate(pr.title, 48);
    const run = pr.latest_run;

    let status = 'No review';
    let statusC = GRAY;
    if (run) {
      status = run.status;
      statusC = statusColor[run.status] ?? GRAY;
    }

    let findings = '—';
    if (run && run.findings_count.total > 0) {
      const crit = run.findings_count.pending;
      findings = `${run.findings_count.total}${crit > 0 ? ` (${crit} pending)` : ''}`;
    }

    lines.push(
      `${pad(num, 6)} ${pad(title, 52)} ${statusC}${pad(status, 14)}${RESET} ${findings}`,
    );
  }

  return lines.join('\n');
}

export function formatStackPRHeader(pr: StackPR): string {
  return `\n${BOLD}${CYAN}PR #${pr.github_pr_number}${RESET} ${pr.title} ${DIM}(${pr.stack_position}/${pr.stack_size})${RESET}`;
}

export function formatJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
