#!/usr/bin/env node
/**
 * GitHub Actions CI/CD Workflow Monitor
 *
 * Commands:
 *   fail-fast <run-id>        Watch run, exit 1 on first job failure
 *   watch <run-id>            Watch run with status changes
 *   list-jobs <run-id>        List jobs in run
 *   tail <run-id> <job-name>  Get last N lines of job log
 *   analyze <run-id> <job>    Pattern analysis for failures
 *   wait-for <run-id> <job>   Block until keyword appears in logs
 *   compare <run1> <run2>     Compare job statuses between runs
 *   branch-runs <branch>      List recent runs for branch
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATUS_EMOJI = {
  success: '✅', failure: '❌', cancelled: '🚫', skipped: '⏭️',
  timed_out: '⏱️', in_progress: '▶️', queued: '⏳', action_required: '✋',
};

const DEFAULT_INTERVAL = 10;
const DEFAULT_TIMEOUT = 3600;

function getRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    return JSON.parse(execSync('gh repo view --json nameWithOwner', { encoding: 'utf-8' })).nameWithOwner;
  } catch (e) {
    console.error('❌ Could not determine repository.');
    process.exit(1);
  }
}

function ghRunView(runId, fields = 'status,conclusion,jobs') {
  const repo = getRepo();
  return JSON.parse(execSync(`gh run view ${runId} --repo ${repo} --json ${fields}`, { encoding: 'utf-8' }));
}

function ghRunList(opts = {}) {
  const repo = getRepo();
  let cmd = `gh run list --repo ${repo} --limit ${opts.limit || 10} --json databaseId,status,conclusion,headBranch,createdAt,displayTitle`;
  if (opts.branch) cmd += ` --branch ${opts.branch}`;
  return JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
}

function getJobLogs(runId, jobId) {
  const repo = getRepo();
  return execSync(`gh api repos/${repo}/actions/jobs/${jobId}/logs`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
}

function findJob(runId, jobName) {
  const run = ghRunView(runId, 'jobs');
  const job = run.jobs?.find(j => j.name === jobName);
  if (!job) {
    console.error(`❌ Job "${jobName}" not found. Available: ${run.jobs?.map(j => j.name).join(', ')}`);
    process.exit(1);
  }
  return job;
}

function formatStatus(status, conclusion) {
  return STATUS_EMOJI[conclusion || status] || '❓';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Commands

async function failFast(runId, opts = {}) {
  const interval = parseInt(opts.interval) || DEFAULT_INTERVAL;
  const repo = getRepo();
  console.log(`🔍 Watching run ${runId} (fail-fast)...\n`);
  
  const seen = new Set();
  while (true) {
    const run = ghRunView(runId);
    for (const job of run.jobs || []) {
      if (!seen.has(job.id)) {
        console.log(`${formatStatus(job.status, job.conclusion)} ${job.name}: ${job.conclusion || job.status}`);
        seen.add(job.id);
      }
      if (job.conclusion === 'failure') {
        console.log(`\n❌ Job "${job.name}" failed!`);
        console.log(`📋 View logs: gh run view ${runId} --repo ${repo} --log-failed`);
        process.exit(1);
      }
    }
    if (run.status === 'completed') {
      console.log(`\n${formatStatus(run.status, run.conclusion)} Run completed: ${run.conclusion}`);
      process.exit(run.conclusion === 'success' ? 0 : 1);
    }
    await sleep(interval * 1000);
  }
}

async function watch(runId, opts = {}) {
  const interval = parseInt(opts.interval) || 30;
  console.log(`👁️  Watching run ${runId}...\n`);
  
  let last = {};
  while (true) {
    const run = ghRunView(runId);
    const rs = `${run.status}:${run.conclusion}`;
    if (last.run !== rs) {
      console.log(`${formatStatus(run.status, run.conclusion)} Run: ${run.status}${run.conclusion ? ' → ' + run.conclusion : ''}`);
      last.run = rs;
    }
    for (const job of run.jobs || []) {
      const js = `${job.status}:${job.conclusion}`;
      const k = `job:${job.id}`;
      if (last[k] !== js) {
        console.log(`  ${formatStatus(job.status, job.conclusion)} ${job.name}: ${job.status}${job.conclusion ? ' → ' + job.conclusion : ''}`);
        last[k] = js;
      }
    }
    if (run.status === 'completed') {
      console.log(`\n${formatStatus(run.status, run.conclusion)} Completed: ${run.conclusion}`);
      process.exit(run.conclusion === 'success' ? 0 : 1);
    }
    await sleep(interval * 1000);
  }
}

function listJobs(runId, opts = {}) {
  const run = ghRunView(runId);
  let jobs = run.jobs || [];
  if (opts.status) jobs = jobs.filter(j => j.conclusion === opts.status || j.status === opts.status);
  
  console.log(`\n📋 Jobs in run ${runId}:\n`);
  for (const job of jobs) {
    console.log(`${formatStatus(job.status, job.conclusion)} ${(job.conclusion || job.status || '?').padEnd(12)} ${job.name}`);
  }
  
  const tmpDir = path.join(os.tmpdir(), 'gh_ci_monitor');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, `run_${runId}_jobs.json`), JSON.stringify(jobs, null, 2));
}

function tail(runId, jobName, opts = {}) {
  const lines = parseInt(opts.lines) || 100;
  const job = findJob(runId, jobName);
  const logs = getJobLogs(runId, job.id);
  console.log(logs.split('\n').slice(-lines).join('\n'));
}

async function waitFor(runId, jobName, opts = {}) {
  const keyword = opts.keyword;
  const timeout = parseInt(opts.timeout) || DEFAULT_TIMEOUT;
  const interval = parseInt(opts.interval) || 5;
  
  if (!keyword) { console.error('❌ --keyword required'); process.exit(1); }
  
  console.log(`🔍 Waiting for "${keyword}" in "${jobName}" (timeout: ${timeout}s)...\n`);
  
  const start = Date.now();
  let job = null;
  
  while (!job && Date.now() - start < timeout * 1000) {
    const run = ghRunView(runId);
    job = run.jobs?.find(j => j.name === jobName);
    if (!job) { console.log(`⏳ Waiting for job to start...`); await sleep(interval * 1000); }
  }
  
  if (!job) { console.error('❌ Timeout waiting for job'); process.exit(1); }
  console.log(`▶️  Job started (ID: ${job.id})`);
  
  while (Date.now() - start < timeout * 1000) {
    try {
      const logs = getJobLogs(runId, job.id);
      if (logs.includes(keyword)) {
        console.log(`\n✅ Found "${keyword}"!`);
        const lines = logs.split('\n');
        const idx = lines.findIndex(l => l.includes(keyword));
        if (idx >= 0) console.log('\n' + lines.slice(Math.max(0, idx - 2), idx + 3).join('\n'));
        process.exit(0);
      }
      console.log(`📝 Log: ${logs.length} chars (${Math.floor((Date.now() - start) / 1000)}s)`);
    } catch (e) {}
    await sleep(interval * 1000);
  }
  console.error(`❌ Timeout waiting for "${keyword}"`);
  process.exit(1);
}

function analyze(runId, jobName) {
  const job = findJob(runId, jobName);
  const logs = getJobLogs(runId, job.id);
  
  const patterns = [
    ['Errors', /error[:：]\s*(.+)/gi],
    ['NPM Errors', /npm ERR!\s*(.+)/gi],
    ['TypeScript', /error TS\d+:\s*(.+)/gi],
    ['Timeout', /timeout|timed?\s*out/gi],
    ['OOM', /out of memory|OOM|heap.*exceeded/gi],
    ['Network', /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/gi],
  ];
  
  console.log(`🔍 Analyzing "${job.name}"...\n`);
  for (const [name, regex] of patterns) {
    const matches = [...logs.matchAll(regex)].slice(0, 3);
    if (matches.length) {
      console.log(`❌ ${name}:`);
      for (const m of matches) console.log(`   • ${(m[1] || m[0]).trim().substring(0, 80)}`);
    }
  }
}

function compare(id1, id2) {
  const r1 = ghRunView(id1, 'jobs');
  const r2 = ghRunView(id2, 'jobs');
  const j1 = new Map((r1.jobs || []).map(j => [j.name, j]));
  const j2 = new Map((r2.jobs || []).map(j => [j.name, j]));
  
  console.log(`\n🔍 Comparing ${id1} vs ${id2}:\n`);
  for (const name of new Set([...j1.keys(), ...j2.keys()])) {
    const a = j1.get(name)?.conclusion || 'missing';
    const b = j2.get(name)?.conclusion || 'missing';
    const ch = a !== b ? ' ⚠️ CHANGED' : '';
    console.log(`${formatStatus(0, a)} ${formatStatus(0, b)} ${name.padEnd(25)} ${a.padEnd(10)} → ${b}${ch}`);
  }
}

function branchRuns(branch, opts = {}) {
  const runs = ghRunList({ branch, limit: parseInt(opts.limit) || 10 });
  console.log(`\n📋 Runs for "${branch}":\n`);
  for (const r of runs) {
    const d = new Date(r.createdAt).toLocaleDateString();
    console.log(`${formatStatus(r.status, r.conclusion)} ${String(r.databaseId).padEnd(10)} ${d} ${r.displayTitle?.substring(0, 40) || ''}`);
  }
}

function checkActions(workflowFile, opts = {}) {
  // Read workflow file and extract actions
  const wfPath = workflowFile || '.github/workflows/ci.yml';
  if (!fs.existsSync(wfPath)) {
    console.error(`❌ Workflow file not found: ${wfPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(wfPath, 'utf-8');
  const usesRegex = /uses:\s*(['"]?)([^'"\s]+)\1/g;
  const actions = new Set();
  let m;
  while ((m = usesRegex.exec(content)) !== null) {
    const action = m[2].split('@')[0]; // Remove version tag
    if (action.includes('/')) actions.add(action);
  }
  
  if (actions.size === 0) {
    console.log('No actions found in workflow.');
    return;
  }
  
  console.log(`\n🔍 Checking ${actions.size} actions via GraphQL...\n`);
  
  // Build GraphQL query for all actions at once
  const actionList = [...actions];
  const queryParts = actionList.map((action, i) => {
    const [owner, repo] = action.split('/');
    return `a${i}: repository(owner: "${owner}", name: "${repo}") {
      latestRelease { tagName }
      description
    }`;
  }).join('\n    ');
  
  const query = `query {
    ${queryParts}
  }`;
  
  try {
    const result = execSync(`gh api graphql -f query='${query}'`, { encoding: 'utf-8' });
    const data = JSON.parse(result).data;
    
    console.log('Action'.padEnd(35) + 'Latest'.padEnd(12) + 'Current'.padEnd(12) + 'Status');
    console.log('-'.repeat(70));
    
    actionList.forEach((action, i) => {
      const repoData = data[`a${i}`];
      const latestTag = repoData?.latestRelease?.tagName || 'N/A';
      
      // Find current version in workflow
      const versionMatch = content.match(new RegExp(`${action.replace('/', '/')}@([^\\s'"]+)`));
      const currentTag = versionMatch ? versionMatch[1] : 'N/A';
      
      const status = latestTag === currentTag ? '✅' : 
                     latestTag !== 'N/A' ? '⬆️  Update available' : '❓';
      
      console.log(action.padEnd(35) + latestTag.padEnd(12) + currentTag.padEnd(12) + status);
    });
  } catch (e) {
    console.error('❌ GraphQL query failed:', e.message);
  }
}

function listWorkflows(opts = {}) {
  const workflowsDir = '.github/workflows';
  if (!fs.existsSync(workflowsDir)) {
    console.error('❌ No .github/workflows directory found');
    process.exit(1);
  }
  
  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  console.log(`\n📋 Workflows (${files.length}):\n`);
  
  for (const f of files) {
    const content = fs.readFileSync(path.join(workflowsDir, f), 'utf-8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const name = nameMatch ? nameMatch[1].trim() : f;
    const triggerMatch = content.match(/^on:\s*(\w+)/m);
    const trigger = triggerMatch ? triggerMatch[1] : 'multiple';
    console.log(`  📄 ${f.padEnd(30)} "${name}" (on: ${trigger})`);
  }
}

// CLI

const [,, cmd, ...args] = process.argv;

if (!cmd) {
  console.log('GitHub Actions CI Monitor');
  console.log('\nUsage: ci_monitor.cjs <command> [options]\n');
  console.log('Commands:');
  console.log('  fail-fast <run-id>        Watch run, exit 1 on first job failure');
  console.log('  watch <run-id>            Watch run with status changes');
  console.log('  list-jobs <run-id>        List jobs in run');
  console.log('  tail <run-id> <job-name>  Get last N lines of job log');
  console.log('  analyze <run-id> <job>    Pattern analysis for failures');
  console.log('  wait-for <run-id> <job>   Block until keyword appears in logs');
  console.log('  compare <run1> <run2>     Compare job statuses between runs');
  console.log('  branch-runs <branch>      List recent runs for branch');
  console.log('  check-actions [file]      Check action versions via GraphQL');
  console.log('  list-workflows            List all workflow files');
  process.exit(0);
}

const opts = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { opts[args[i].slice(2)] = args[++i]; } else { pos.push(args[i]); }
}

const commands = { failFast, watch, listJobs, tail, waitFor, analyze, compare, branchRuns, checkActions, listWorkflows };
const fn = commands[cmd.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  console.error('\nAvailable commands:');
  console.error('  fail-fast <run-id>        Watch run, exit 1 on first job failure');
  console.error('  watch <run-id>            Watch run with status changes');
  console.error('  list-jobs <run-id>        List jobs in run');
  console.error('  tail <run-id> <job-name>  Get last N lines of job log');
  console.error('  analyze <run-id> <job>    Pattern analysis for failures');
  console.error('  wait-for <run-id> <job>   Block until keyword appears in logs');
  console.error('  compare <run1> <run2>     Compare job statuses between runs');
  console.error('  branch-runs <branch>      List recent runs for branch');
  console.error('  check-actions [file]      Check action versions via GraphQL');
  console.error('  list-workflows            List all workflow files');
  process.exit(1);
}
fn(...pos, opts);
