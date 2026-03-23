import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFile('gh', args);
  return stdout.trim();
}

export async function ghAuthStatus(): Promise<void> {
  try {
    await gh(['auth', 'status']);
  } catch {
    throw new Error('GitHub CLI not authenticated. Run `gh auth login` first.');
  }
}

export async function ghAuthToken(): Promise<string> {
  const token = await gh(['auth', 'token']);
  if (!token) throw new Error('Could not retrieve GitHub token from `gh auth token`.');
  return token;
}

export interface GhRepo {
  nameWithOwner: string;
  isPrivate: boolean;
}

export async function ghRepoList(owner?: string): Promise<GhRepo[]> {
  const args = ['repo', 'list', '--json', 'nameWithOwner,isPrivate', '--limit', '100'];
  if (owner) args.splice(2, 0, owner);
  const raw = await gh(args);
  return JSON.parse(raw) as GhRepo[];
}

export async function ghCreateWebhook(
  owner: string,
  repo: string,
  url: string,
  secret: string,
  events: string[]
): Promise<number> {
  const payload = JSON.stringify({
    name: 'web',
    active: true,
    events,
    config: {
      url,
      content_type: 'json',
      secret,
      insecure_ssl: '0',
    },
  });

  const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = execFileCb(
      'gh',
      ['api', `repos/${owner}/${repo}/hooks`, '--method', 'POST', '--input', '-'],
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve({ stdout: stdout as string, stderr: stderr as string });
      }
    );
    proc.stdin!.write(payload);
    proc.stdin!.end();
  });

  const parsed = JSON.parse(stdout);
  return parsed.id as number;
}

export async function ghDeleteWebhook(owner: string, repo: string, hookId: number): Promise<void> {
  await gh(['api', `repos/${owner}/${repo}/hooks/${hookId}`, '--method', 'DELETE']);
}
