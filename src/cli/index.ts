#!/usr/bin/env node

import crypto from 'crypto';
import readline from 'readline';
import { loadCliConfig, saveCliConfig, requireConfig } from './config';
import { ghAuthStatus, ghAuthToken, ghRepoList, ghCreateWebhook, ghDeleteWebhook } from './gh';
import { PipeClient } from './api';

const argv = process.argv.slice(2);
function extractFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const val = args[i + 1];
  args.splice(i, 2);
  return val;
}
function extractBool(args: string[], flag: string): boolean {
  const i = args.indexOf(flag);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}
const ownerFlag = extractFlag(argv, '--owner');
const noWebhook = extractBool(argv, '--no-webhook');
const [command, subcommand, arg] = argv;

async function main() {
  switch (command) {
    case 'login':
      return login();
    case 'status':
      return status();
    case 'repo':
      switch (subcommand) {
        case 'add':
          return repoAdd(arg);
        case 'list':
          return repoList();
        case 'remove':
          return repoRemove(arg);
        default:
          console.error('Usage: pipe repo <add|list|remove>');
          process.exit(1);
      }
      break;
    default:
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

function printHelp() {
  console.log(`Usage: pipe <command>

Commands:
  login                  Configure server URL + API key
  status                 Check gh auth + Pipe server connectivity
  repo add [owner/name]  Connect a GitHub repo to Pipe
                         [--owner org] [--no-webhook]
  repo list              List connected repos
  repo remove owner/name Remove a connected repo + delete webhook`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// --- Commands ---

async function login() {
  const existing = loadCliConfig();
  const host = await prompt(`Pipe server URL${existing?.host ? ` [${existing.host}]` : ''}: `);
  const apiKey = await prompt('API key: ');

  const finalHost = host || existing?.host;
  if (!finalHost) {
    console.error('Server URL is required.');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('API key is required.');
    process.exit(1);
  }

  saveCliConfig({ host: finalHost, api_key: apiKey });
  console.log('Configuration saved.');

  // Verify connectivity
  try {
    const client = new PipeClient({ host: finalHost, api_key: apiKey });
    await client.health();
    console.log('Server connection verified.');
  } catch (err) {
    console.warn(`Warning: Could not reach server at ${finalHost}`);
  }
}

async function status() {
  // Check gh auth
  console.log('GitHub CLI:');
  try {
    await ghAuthStatus();
    console.log('  Authenticated');
  } catch (err) {
    console.log(`  Not authenticated — run \`gh auth login\``);
  }

  // Check Pipe server
  console.log('\nPipe server:');
  const config = loadCliConfig();
  if (!config) {
    console.log('  Not configured — run `pipe login`');
    return;
  }
  console.log(`  Host: ${config.host}`);
  try {
    const client = new PipeClient(config);
    await client.health();
    console.log('  Status: connected');
  } catch {
    console.log('  Status: unreachable');
  }
}

async function repoAdd(nameWithOwner?: string) {
  const config = requireConfig();
  await ghAuthStatus();

  const client = new PipeClient(config);

  // Check for existing repos to warn on duplicates
  const existingRepos = await client.listRepos();

  let owner: string;
  let name: string;

  if (nameWithOwner) {
    // Non-interactive
    const parts = nameWithOwner.split('/');
    if (parts.length !== 2) {
      console.error('Invalid format. Use owner/name.');
      process.exit(1);
    }
    [owner, name] = parts;
  } else {
    // Interactive: list repos from gh
    console.log(ownerFlag ? `Fetching repos for ${ownerFlag}...` : 'Fetching your GitHub repos...');
    const repos = await ghRepoList(ownerFlag);

    if (repos.length === 0) {
      console.error('No repos found. Check your `gh` auth scopes.');
      process.exit(1);
    }

    repos.forEach((r, i) => {
      const existing = existingRepos.find(
        e => `${e.github_owner}/${e.github_name}` === r.nameWithOwner
      );
      const tag = existing ? ' (already connected)' : '';
      const privacy = r.isPrivate ? ' [private]' : '';
      console.log(`  ${i + 1}. ${r.nameWithOwner}${privacy}${tag}`);
    });

    const choice = await prompt('\nSelect a repo (number): ');
    const idx = parseInt(choice, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= repos.length) {
      console.error('Invalid selection.');
      process.exit(1);
    }

    [owner, name] = repos[idx].nameWithOwner.split('/');
  }

  // Warn if already connected
  const duplicate = existingRepos.find(r => r.github_owner === owner && r.github_name === name);
  if (duplicate) {
    const confirm = await prompt(`${owner}/${name} is already connected. Continue? [y/N] `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  // Generate webhook secret
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  // Get GitHub token
  const pat = await ghAuthToken();

  // Create webhook on GitHub (skip with --no-webhook for local dev)
  let hookId: number | undefined;
  if (!noWebhook) {
    const webhookUrl = `${config.host.replace(/\/+$/, '')}/api/webhooks/github`;
    console.log(`Creating webhook on ${owner}/${name}...`);
    try {
      hookId = await ghCreateWebhook(owner, name, webhookUrl, webhookSecret, ['pull_request']);
    } catch (err) {
      console.error(`Failed to create webhook: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  } else {
    console.log('Skipping webhook creation (--no-webhook).');
  }

  // Register with Pipe server
  console.log('Registering repo with Pipe...');
  let repo: import('./api').Repo | undefined;
  try {
    repo = await client.createRepo({
      github_owner: owner,
      github_name: name,
      pat,
      webhook_secret: webhookSecret,
    });
  } catch (err) {
    console.error(`Failed to register repo: ${err instanceof Error ? err.message : err}`);
    // Rollback webhook if we created one
    if (hookId) {
      console.log('Rolling back webhook...');
      try {
        await ghDeleteWebhook(owner, name, hookId);
        console.log('Webhook removed.');
      } catch {
        console.error(`Warning: Could not delete webhook ${hookId}. Remove it manually.`);
      }
    }
    process.exit(1);
  }

  // Trigger initial sync
  console.log('Syncing open PRs...');
  try {
    const result = await client.syncRepo(repo.id);
    console.log(`Connected ${owner}/${name}. Webhook active. ${result.synced} open PRs synced.`);
  } catch {
    console.log(
      `Connected ${owner}/${name}. Webhook active. Initial sync failed — run \`pipe repo add\` or sync from the UI.`
    );
  }
}

async function repoList() {
  const config = requireConfig();
  const client = new PipeClient(config);
  const repos = await client.listRepos();

  if (repos.length === 0) {
    console.log('No repos connected. Run `pipe repo add` to get started.');
    return;
  }

  console.log('Connected repos:\n');
  for (const repo of repos) {
    const trigger = repo.auto_trigger_on_open ? 'auto' : 'manual';
    console.log(`  ${repo.github_owner}/${repo.github_name}  (${trigger})`);
  }
}

async function repoRemove(nameWithOwner?: string) {
  if (!nameWithOwner) {
    console.error('Usage: pipe repo remove owner/name');
    process.exit(1);
  }

  const parts = nameWithOwner.split('/');
  if (parts.length !== 2) {
    console.error('Invalid format. Use owner/name.');
    process.exit(1);
  }
  const [owner, name] = parts;

  const config = requireConfig();
  const client = new PipeClient(config);
  const repos = await client.listRepos();

  const repo = repos.find(r => r.github_owner === owner && r.github_name === name);
  if (!repo) {
    console.error(`Repo ${owner}/${name} not found on Pipe server.`);
    process.exit(1);
  }

  // Delete from Pipe
  console.log(`Removing ${owner}/${name} from Pipe...`);
  await client.deleteRepo(repo.id);

  // Try to clean up webhook on GitHub
  console.log('Checking for webhook on GitHub...');
  try {
    await ghAuthStatus();
    const { execFile: execFileCb } = await import('child_process');
    const { promisify } = await import('util');
    const execFile = promisify(execFileCb);
    const { stdout } = await execFile('gh', [
      'api',
      `repos/${owner}/${name}/hooks`,
      '--jq',
      `[.[] | select(.config.url | contains("/api/webhooks/github"))] | .[0].id`,
    ]);
    const hookId = parseInt(stdout.trim(), 10);
    if (!Number.isNaN(hookId)) {
      await ghDeleteWebhook(owner, name, hookId);
      console.log('Webhook deleted from GitHub.');
    } else {
      console.log('No matching webhook found on GitHub.');
    }
  } catch {
    console.log('Could not check/delete webhook on GitHub. Remove it manually if needed.');
  }

  console.log(`Removed ${owner}/${name}.`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
