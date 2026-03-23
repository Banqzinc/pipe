import type { CliConfig } from './config';

export class PipeClient {
  private host: string;
  private apiKey: string;

  constructor(config: CliConfig) {
    this.host = config.host.replace(/\/+$/, '');
    this.apiKey = config.api_key;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.host}/api${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async health(): Promise<{ status: string }> {
    const url = `${this.host}/api/health`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Health check failed (${res.status})`);
    return (await res.json()) as { status: string };
  }

  async listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  async createRepo(data: {
    github_owner: string;
    github_name: string;
    pat: string;
    webhook_secret: string;
  }): Promise<Repo> {
    return this.request<Repo>('POST', '/repos', data);
  }

  async deleteRepo(id: string): Promise<void> {
    return this.request<void>('DELETE', `/repos/${id}`);
  }

  async syncRepo(id: string): Promise<{ synced: number }> {
    return this.request<{ synced: number }>('POST', `/repos/${id}/sync`);
  }
}

export interface Repo {
  id: string;
  github_owner: string;
  github_name: string;
  auto_trigger_on_open: boolean;
  created_at: string;
  updated_at: string;
}
