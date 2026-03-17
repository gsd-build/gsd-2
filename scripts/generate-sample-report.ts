/**
 * Generates sample GSD HTML report + progression index.
 * npx tsx scripts/generate-sample-report.ts
 */

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateHtmlReport } from '../src/resources/extensions/gsd/export-html.js';
import { regenerateHtmlIndex } from '../src/resources/extensions/gsd/reports.js';

const NOW = Date.now();
const H = 3_600_000;

// ── Mock VisualizerData ───────────────────────────────────────────────────────

const mockData: any = {
  milestones: [
    {
      id: 'M001', title: 'Core Auth & User Management',
      status: 'complete', dependsOn: [],
      slices: [
        { id: 'S01', title: 'JWT Middleware', done: true, active: false, risk: 'high', depends: [],
          tasks: [
            { id: 'T01', title: 'Core token types', done: true, active: false, estimate: '1h' },
            { id: 'T02', title: 'Sign/verify helpers', done: true, active: false, estimate: '2h' },
            { id: 'T03', title: 'Refresh token flow', done: true, active: false, estimate: '3h' },
          ] },
        { id: 'S02', title: 'Login & Registration API', done: true, active: false, risk: 'medium', depends: ['S01'],
          tasks: [
            { id: 'T01', title: 'POST /auth/login', done: true, active: false, estimate: '2h' },
            { id: 'T02', title: 'POST /auth/register', done: true, active: false, estimate: '2h' },
            { id: 'T03', title: 'Rate limiting middleware', done: true, active: false, estimate: '1h' },
          ] },
        { id: 'S03', title: 'Password Reset Flow', done: true, active: false, risk: 'medium', depends: ['S02'],
          tasks: [
            { id: 'T01', title: 'Email token generation', done: true, active: false, estimate: '2h' },
            { id: 'T02', title: 'Reset endpoint + UI', done: true, active: false, estimate: '1h' },
          ] },
        { id: 'S04', title: 'User Profile CRUD', done: true, active: false, risk: 'low', depends: ['S02'],
          tasks: [
            { id: 'T01', title: 'GET/PUT /users/:id', done: true, active: false, estimate: '2h' },
            { id: 'T02', title: 'Avatar upload to S3', done: true, active: false, estimate: '2h' },
          ] },
      ],
    },
    {
      id: 'M002', title: 'Dashboard & Real-time Features',
      status: 'active', dependsOn: ['M001'],
      slices: [
        { id: 'S01', title: 'Dashboard Layout', done: true, active: false, risk: 'low', depends: [],
          tasks: [
            { id: 'T01', title: 'Sidebar navigation', done: true, active: false, estimate: '2h' },
            { id: 'T02', title: 'Header + breadcrumbs', done: true, active: false, estimate: '1h' },
            { id: 'T03', title: 'Responsive grid system', done: true, active: false, estimate: '2h' },
          ] },
        { id: 'S02', title: 'WebSocket Event Bus', done: true, active: false, risk: 'high', depends: [],
          tasks: [
            { id: 'T01', title: 'WS server setup', done: true, active: false, estimate: '3h' },
            { id: 'T02', title: 'Auth handshake', done: true, active: false, estimate: '2h' },
            { id: 'T03', title: 'Room/channel model', done: true, active: false, estimate: '3h' },
          ] },
        { id: 'S03', title: 'Live Activity Feed', done: false, active: true, risk: 'medium', depends: ['S01', 'S02'],
          tasks: [
            { id: 'T01', title: 'Feed data model', done: true, active: false, estimate: '1h' },
            { id: 'T02', title: 'Feed UI component', done: false, active: true, estimate: '3h' },
            { id: 'T03', title: 'Pagination + virtualization', done: false, active: false, estimate: '2h' },
          ] },
        { id: 'S04', title: 'Notifications System', done: false, active: false, risk: 'medium', depends: ['S02', 'S03'], tasks: [] },
        { id: 'S05', title: 'Analytics Charts', done: false, active: false, risk: 'low', depends: ['S01'], tasks: [] },
      ],
    },
    {
      id: 'M003', title: 'Billing & Subscription Engine',
      status: 'pending', dependsOn: ['M002'],
      slices: [
        { id: 'S01', title: 'Stripe integration', done: false, active: false, risk: 'high', depends: [], tasks: [] },
        { id: 'S02', title: 'Plan management', done: false, active: false, risk: 'medium', depends: ['S01'], tasks: [] },
        { id: 'S03', title: 'Invoice generation', done: false, active: false, risk: 'low', depends: ['S02'], tasks: [] },
        { id: 'S04', title: 'Usage metering', done: false, active: false, risk: 'medium', depends: ['S01'], tasks: [] },
      ],
    },
  ],
  phase: 'executing',
  totals: {
    units: 47,
    tokens: { input: 1_840_000, output: 312_000, cacheRead: 4_200_000, cacheWrite: 890_000, total: 7_242_000 },
    cost: 18.43,
    duration: 14 * H + 23 * 60_000,
    toolCalls: 1847,
    assistantMessages: 312,
    userMessages: 47,
    totalTruncationSections: 6,
    continueHereFiredCount: 3,
  },
  byPhase: [
    { phase: 'research',   units: 8,  cost: 1.84,  tokens: { total: 368_000  }, duration: 2   * H },
    { phase: 'planning',   units: 9,  cost: 2.12,  tokens: { total: 442_000  }, duration: 2.5 * H },
    { phase: 'execution',  units: 26, cost: 13.47, tokens: { total: 6_322_000 }, duration: 9   * H },
    { phase: 'completion', units: 4,  cost: 1.00,  tokens: { total: 110_000  }, duration: 0.9 * H },
  ],
  bySlice: [
    { sliceId: 'M001/S01', units: 6, cost: 3.12, tokens: { total: 980_000   }, duration: 3.2 * H },
    { sliceId: 'M001/S02', units: 5, cost: 2.87, tokens: { total: 842_000   }, duration: 2.8 * H },
    { sliceId: 'M001/S03', units: 4, cost: 2.21, tokens: { total: 701_000   }, duration: 2.1 * H },
    { sliceId: 'M001/S04', units: 4, cost: 1.98, tokens: { total: 634_000   }, duration: 1.9 * H },
    { sliceId: 'M002/S01', units: 5, cost: 2.43, tokens: { total: 789_000   }, duration: 2.3 * H },
    { sliceId: 'M002/S02', units: 6, cost: 3.87, tokens: { total: 1_100_000 }, duration: 3.7 * H },
    { sliceId: 'M002/S03', units: 3, cost: 1.93, tokens: { total: 580_000   }, duration: 1.6 * H },
  ],
  byModel: [
    { model: 'claude-sonnet-4-5', units: 32, cost: 14.21, tokens: { total: 5_800_000 } },
    { model: 'claude-haiku-4-5',  units: 15, cost: 4.22,  tokens: { total: 1_442_000 } },
  ],
  byTier: [
    { tier: 'light',    units: 15, cost: 4.22,  tokens: { total: 1_442_000 } },
    { tier: 'standard', units: 24, cost: 10.88, tokens: { total: 4_600_000 } },
    { tier: 'heavy',    units: 8,  cost: 3.33,  tokens: { total: 1_200_000 } },
  ],
  tierSavingsLine: 'Dynamic routing: 15/47 units downgraded (31%), saved ~$4.22',
  units: Array.from({ length: 47 }, (_, i) => {
    const types = ['research-milestone','plan-milestone','research-slice','plan-slice','execute-task','complete-slice','complete-milestone','reassess-milestone'];
    const models = ['claude-sonnet-4-5','claude-haiku-4-5'];
    const tiers  = ['light','standard','heavy'];
    const start  = NOW - (47 - i) * 1.8 * H;
    const dur    = (0.3 + (i % 5) * 0.25) * H;
    return {
      type: types[i % types.length],
      id: `M00${Math.min(3, Math.floor(i / 16) + 1)}/S0${(Math.floor(i / 5) % 5) + 1}/T0${(i % 4) + 1}`,
      model: models[i % 2],
      startedAt: start, finishedAt: start + dur,
      tokens: { input: 40_000 + i * 1200, output: 8_000 + i * 400, cacheRead: i > 8 ? 90_000 : 0, cacheWrite: i > 8 ? 18_000 : 0, total: 138_000 + i * 1600 },
      cost: 0.18 + i * 0.02,
      toolCalls: 28 + i * 3,
      assistantMessages: 6 + Math.floor(i / 5),
      userMessages: 1,
      tier: tiers[i % 3],
      modelDowngraded: i % 3 === 0,
      truncationSections: i % 8 === 0 ? 1 : 0,
      continueHereFired: i % 15 === 0,
    };
  }),
  criticalPath: {
    milestonePath: ['M001','M002','M003'],
    slicePath: ['S02','S03'],
    milestoneSlack: new Map([['M001',0],['M002',0],['M003',0]]),
    sliceSlack: new Map([['S01',1],['S02',0],['S03',0],['S04',1],['S05',2]]),
  },
  remainingSliceCount: 7,
  agentActivity: {
    currentUnit: { type: 'execute-task', id: 'M002/S03/T02', startedAt: NOW - 18 * 60_000 },
    elapsed: 18 * 60_000, completedUnits: 46, totalSlices: 13,
    completionRate: 3.2, active: true, sessionCost: 18.43, sessionTokens: 7_242_000,
  },
  changelog: {
    entries: [
      {
        milestoneId: 'M002', sliceId: 'S02', title: 'WebSocket Event Bus',
        oneLiner: 'Implemented authenticated WebSocket server with room-based pub/sub and auto-reconnect.',
        filesModified: [
          { path: 'src/ws/server.ts',          description: 'WS server bootstrap and auth handshake' },
          { path: 'src/ws/room-manager.ts',     description: 'Channel/room lifecycle management' },
          { path: 'src/ws/client.ts',           description: 'Browser-side client with exponential backoff reconnect' },
          { path: 'tests/ws/server.test.ts',    description: 'Integration tests for WS auth flow' },
        ],
        completedAt: new Date(NOW - 4 * H).toISOString(),
      },
      {
        milestoneId: 'M002', sliceId: 'S01', title: 'Dashboard Layout',
        oneLiner: 'Built responsive dashboard shell with collapsible sidebar, breadcrumbs, and dark/light mode support.',
        filesModified: [
          { path: 'src/components/Sidebar.tsx', description: 'Collapsible sidebar with active-route highlighting' },
          { path: 'src/components/Header.tsx',  description: 'Top bar with breadcrumbs and user menu' },
          { path: 'src/styles/layout.css',      description: 'CSS grid layout tokens' },
        ],
        completedAt: new Date(NOW - 8 * H).toISOString(),
      },
      {
        milestoneId: 'M001', sliceId: 'S04', title: 'User Profile CRUD',
        oneLiner: 'Added GET/PUT /users/:id with avatar upload to S3 and presigned URL delivery.',
        filesModified: [
          { path: 'src/routes/users.ts',        description: 'Profile read/update endpoints' },
          { path: 'src/services/storage.ts',    description: 'S3 upload + presigned URL helpers' },
          { path: 'tests/routes/users.test.ts', description: 'Profile endpoint tests' },
        ],
        completedAt: new Date(NOW - 12 * H).toISOString(),
      },
      {
        milestoneId: 'M001', sliceId: 'S01', title: 'JWT Middleware',
        oneLiner: 'Established JWT sign/verify pipeline with RS256, refresh token rotation, and sliding expiry.',
        filesModified: [
          { path: 'src/auth/jwt.ts',            description: 'Token sign/verify with RS256' },
          { path: 'src/auth/refresh.ts',        description: 'Refresh token rotation and revocation' },
          { path: 'src/middleware/auth.ts',      description: 'Express middleware for route protection' },
          { path: 'tests/auth/jwt.test.ts',     description: 'Unit tests for token lifecycle' },
        ],
        completedAt: new Date(NOW - 20 * H).toISOString(),
      },
    ],
  },
  sliceVerifications: [
    {
      milestoneId: 'M001', sliceId: 'S01',
      verificationResult: 'All JWT tests pass. Token rotation verified under concurrent load test.',
      blockerDiscovered: false,
      keyDecisions: [
        'RS256 over HS256 for multi-service key distribution',
        'Refresh tokens stored in httpOnly cookies — never localStorage',
      ],
      patternsEstablished: ['Auth middleware wraps all protected routes via createAuthMiddleware HOF'],
      provides: ['jwt-auth','refresh-rotation'],
      requires: [],
    },
    {
      milestoneId: 'M001', sliceId: 'S02',
      verificationResult: 'Login and registration return correct tokens and status codes. Rate limiter verified.',
      blockerDiscovered: false,
      keyDecisions: [
        'bcrypt rounds = 12 for production',
        'Email uniqueness enforced at DB constraint level, not app layer',
      ],
      patternsEstablished: ['All route handlers: validate (zod) → authorize → execute → respond'],
      provides: ['user-accounts','session-tokens'],
      requires: [{ slice: 'S01', provides: 'jwt-auth' }],
    },
    {
      milestoneId: 'M002', sliceId: 'S02',
      verificationResult: 'WS auth handshake working. 500-client concurrent load test passed without drops.',
      blockerDiscovered: false,
      keyDecisions: [
        'Room names scoped to orgId to prevent cross-tenant event leakage',
        'Heartbeat at 30s / disconnect after 3 missed beats',
      ],
      patternsEstablished: ['All WS event payloads use discriminated union: { type, payload }'],
      provides: ['ws-event-bus','realtime-rooms'],
      requires: [{ slice: 'S01', provides: 'jwt-auth' }],
    },
  ],
  knowledge: {
    exists: true,
    rules: [
      { id: 'R001', scope: 'auth',    content: 'Never store raw tokens in localStorage — httpOnly cookies only' },
      { id: 'R002', scope: 'api',     content: 'All endpoints must validate input with zod before touching the DB' },
      { id: 'R003', scope: 'ws',      content: 'WebSocket rooms must be scoped to orgId — no cross-tenant event leakage' },
      { id: 'R004', scope: 'testing', content: 'Integration tests must run against real Postgres via docker-compose, not mocks' },
    ],
    patterns: [
      { id: 'P001', content: 'Higher-order middleware: createAuthMiddleware(options) → Express.RequestHandler' },
      { id: 'P002', content: 'Route handler contract: validate → authorize → execute → respond, never skip steps' },
      { id: 'P003', content: 'All WebSocket event payloads: discriminated union { type: EventType, payload: ... }' },
    ],
    lessons: [
      { id: 'L001', content: 'bcrypt.compare is async — always await it; sync variant blocks the event loop in request handlers' },
      { id: 'L002', content: 'Postgres advisory locks needed for refresh token rotation to prevent race under concurrent requests' },
      { id: 'L003', content: 'S3 presigned URLs must be scoped to the requesting user — always verify ownership before signing' },
    ],
  },
  captures: {
    entries: [
      { id: 'c1', text: 'Consider per-user rate limiting rather than per-IP — more accurate behind load balancers', timestamp: new Date(NOW - 6 * H).toISOString(), status: 'resolved', resolution: 'inject', rationale: 'Addressed in M001/S03 rate limiter task' },
      { id: 'c2', text: 'WebSocket reconnect should use exponential backoff with jitter to avoid thundering herd on server restart', timestamp: new Date(NOW - 3 * H).toISOString(), status: 'resolved', resolution: 'inject', rationale: 'Added to M002/S02/T02' },
      { id: 'c3', text: 'Billing M003 — should we support annual plans with proration from day one, or defer?', timestamp: new Date(NOW - 1 * H).toISOString(), status: 'pending', resolution: undefined },
    ],
    pendingCount: 1,
    totalCount: 3,
  },
  health: {
    budgetCeiling: 50,
    tokenProfile: 'standard',
    truncationRate: 12.8,
    continueHereRate: 6.4,
    tierBreakdown: [
      { tier: 'light',    units: 15, cost: 4.22,  tokens: { total: 1_442_000 } },
      { tier: 'standard', units: 24, cost: 10.88, tokens: { total: 4_600_000 } },
      { tier: 'heavy',    units: 8,  cost: 3.33,  tokens: { total: 1_200_000 } },
    ],
    tierSavingsLine: 'Dynamic routing: 15/47 units downgraded (31%), saved ~$4.22',
    toolCalls: 1847, assistantMessages: 312, userMessages: 47,
  },
  discussion: [
    { milestoneId: 'M001', title: 'Core Auth & User Management',   state: 'discussed', hasContext: true,  hasDraft: false, lastUpdated: new Date(NOW - 48 * H).toISOString() },
    { milestoneId: 'M002', title: 'Dashboard & Real-time Features', state: 'discussed', hasContext: true,  hasDraft: false, lastUpdated: new Date(NOW - 24 * H).toISOString() },
    { milestoneId: 'M003', title: 'Billing & Subscription Engine',  state: 'draft',     hasContext: false, hasDraft: true,  lastUpdated: new Date(NOW - 2  * H).toISOString() },
  ],
  stats: {
    missingCount: 7,
    missingSlices: [{ milestoneId: 'M002', sliceId: 'S03', title: 'Live Activity Feed' }],
    updatedCount: 4,
    updatedSlices: [{ milestoneId: 'M002', sliceId: 'S02', title: 'WebSocket Event Bus', completedAt: new Date(NOW - 4 * H).toISOString() }],
    recentEntries: [],
  },
};

// ── Progression index ─────────────────────────────────────────────────────────

const indexData: any = {
  version: 1,
  projectName: 'saas-platform',
  projectPath: '/Users/dev/projects/saas-platform',
  gsdVersion: '2.25.0',
  entries: [
    {
      filename: 'M001-20260310T091200.html',
      generatedAt: new Date(NOW - 7 * 24 * H).toISOString(),
      milestoneId: 'M001', milestoneTitle: 'Core Auth & User Management',
      label: 'M001: Core Auth & User Management', kind: 'milestone',
      totalCost: 7.82, totalTokens: 2_840_000, totalDuration: 5.4 * H,
      doneSlices: 4, totalSlices: 13, doneMilestones: 1, totalMilestones: 3, phase: 'reassessing',
    },
    {
      filename: 'M002-20260314T143000.html',
      generatedAt: new Date(NOW - 3 * 24 * H).toISOString(),
      milestoneId: 'M002', milestoneTitle: 'Dashboard & Real-time Features',
      label: 'M002: Dashboard & Real-time Features', kind: 'milestone',
      totalCost: 13.21, totalTokens: 5_100_000, totalDuration: 10.1 * H,
      doneSlices: 8, totalSlices: 13, doneMilestones: 1, totalMilestones: 3, phase: 'executing',
    },
    {
      filename: 'M002-report.html',
      generatedAt: new Date(NOW - 2 * H).toISOString(),
      milestoneId: 'M002', milestoneTitle: 'Dashboard & Real-time Features',
      label: 'M002: Dashboard & Real-time Features', kind: 'manual',
      totalCost: 18.43, totalTokens: 7_242_000, totalDuration: 14.4 * H,
      doneSlices: 10, totalSlices: 13, doneMilestones: 1, totalMilestones: 3, phase: 'executing',
    },
  ],
};

// ── Write output ──────────────────────────────────────────────────────────────

const outDir = '/tmp/gsd-sample-report';
mkdirSync(outDir, { recursive: true });

// Full detail report (M002 current state)
const reportHtml = generateHtmlReport(mockData, {
  projectName: 'saas-platform',
  projectPath: '/Users/dev/projects/saas-platform',
  gsdVersion: '2.25.0',
  milestoneId: 'M002',
  indexRelPath: 'index.html',
});
writeFileSync(join(outDir, 'M002-report.html'), reportHtml, 'utf-8');

// Stub files for the other linked reports
const stub = (label: string) =>
  `<html><body style="background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:2rem;line-height:1.8">` +
  `<h1 style="color:#58a6ff;margin-bottom:.5rem">${label}</h1>` +
  `<p style="color:#8b949e">Stub — only M002-report.html has full content in this sample.</p>` +
  `<p style="margin-top:1rem"><a href="index.html" style="color:#58a6ff">← Back to index</a></p>` +
  `</body></html>`;

writeFileSync(join(outDir, 'M001-20260310T091200.html'), stub('M001: Core Auth &amp; User Management'), 'utf-8');
writeFileSync(join(outDir, 'M002-20260314T143000.html'), stub('M002: Dashboard &amp; Real-time Features (mid-milestone snapshot)'), 'utf-8');

// Index — regenerateHtmlIndex(basePath) writes to basePath/.gsd/reports/index.html
mkdirSync('/tmp/.gsd/reports', { recursive: true });
regenerateHtmlIndex('/tmp', indexData);
copyFileSync('/tmp/.gsd/reports/index.html', join(outDir, 'index.html'));

console.log('Written to', outDir);
console.log('  index.html        progression TOC + overview');
console.log('  M002-report.html  full detail report');
