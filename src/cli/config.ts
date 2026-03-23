import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CliConfig {
  host: string;
  api_key: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pipe');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadCliConfig(): CliConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.host && parsed.api_key) return parsed as CliConfig;
    return null;
  } catch {
    return null;
  }
}

export function saveCliConfig(config: CliConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function requireConfig(): CliConfig {
  const config = loadCliConfig();
  if (!config) {
    console.error('Not configured. Run `pipe login` first.');
    process.exit(1);
  }
  return config;
}
