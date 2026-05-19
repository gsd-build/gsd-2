import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBraveApiKey,
  getTavilyApiKey,
  MISSING_SEARCH_API_KEY_MESSAGE,
  resolveSearchProvider,
} from './provider.ts';

function withProjectEnv(
  files: Record<string, string>,
  run: () => void,
): void {
  const tempRoot = mkdtempSync(join(tmpdir(), 'gsd-search-provider-'));
  const tempHome = join(tempRoot, 'home');
  const projectRoot = join(tempRoot, 'project');
  const previousCwd = process.cwd();
  const previousEnv = {
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    GSD_HOME: process.env.GSD_HOME,
  };

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(tempHome, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(projectRoot, file), content);
  }

  try {
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.OLLAMA_API_KEY;
    process.env.GSD_HOME = tempHome;
    process.chdir(projectRoot);
    run();
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('search provider resolves BRAVE_API_KEY from project .env', () => {
  withProjectEnv({ '.env': 'BRAVE_API_KEY=project-brave-key\n' }, () => {
    assert.equal(getBraveApiKey(), 'project-brave-key');
    assert.equal(resolveSearchProvider(), 'brave');
  });
});

test('search provider resolves TAVILY_API_KEY from project .env.local', () => {
  withProjectEnv({ '.env.local': 'TAVILY_API_KEY=project-tavily-key\n' }, () => {
    assert.equal(getTavilyApiKey(), 'project-tavily-key');
    assert.equal(resolveSearchProvider(), 'tavily');
  });
});

test('missing search key guidance avoids interactive-only recovery tools', () => {
  assert.doesNotMatch(MISSING_SEARCH_API_KEY_MESSAGE, /secure_env_collect/);
  assert.match(MISSING_SEARCH_API_KEY_MESSAGE, /\.env/);
});
