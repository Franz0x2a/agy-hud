import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG } from '../dist/config.js';
import { setLanguage } from '../dist/i18n/index.js';
import { renderEnvironmentLine, renderIdentityLine, renderProjectLine, renderUsageLine } from '../dist/render/lines/index.js';
import { renderSessionLine } from '../dist/render/session-line.js';
import { getUsageFromStdin } from '../dist/stdin.js';

const stripAnsi = value => value
  ?.replace(/\x1b\[[0-9;]*m/g, '')
  .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '') ?? value;

function context(stdin, display = {}) {
  return {
    stdin,
    transcript: { tools: [], agents: [], todos: [], skills: ['test-driven-development'], mcpServers: ['github'] },
    claudeMdCount: 0,
    rulesCount: 0,
    mcpCount: 0,
    hooksCount: 0,
    sessionDuration: '',
    gitStatus: { branch: 'main', isDirty: true, ahead: 0, behind: 0 },
    usageData: getUsageFromStdin(stdin),
    memoryUsage: null,
    config: {
      ...DEFAULT_CONFIG,
      display: { ...DEFAULT_CONFIG.display, ...display },
    },
    extraLabel: null,
  };
}

test('Essential status shows native agent state and execution mode', () => {
  setLanguage('en');
  const ctx = context({
    cwd: '/workspace/agy-hud',
    model: { display_name: 'Gemini 3.5 Pro' },
    agent_state: 'idle',
    execution_mode: 'planning',
  });
  const line = stripAnsi(renderProjectLine(ctx));
  assert.match(line, /^AGY · Gemini 3\.5 Pro · READY · planning · /);
  assert.match(line, /agy-hud git:\(main\*\)/);
});

test('Essential context shows an awaiting state before the first model response', () => {
  setLanguage('en');
  const ctx = context({
    context_window: {
      context_window_size: 1048576,
      used_percentage: 0,
      remaining_percentage: 100,
      current_usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });
  const line = stripAnsi(renderIdentityLine(ctx));
  assert.match(line, /-- \/ 1\.0M · awaiting first response/);
  assert.doesNotMatch(line, /0%/);
});

test('Essential context does not claim awaiting after native token activity', () => {
  setLanguage('en');
  const activityFrames = [
    { current_usage: { output_tokens: 1 } },
    { total_input_tokens: 1 },
    { total_output_tokens: 1 },
  ];

  for (const activity of activityFrames) {
    const ctx = context({
      context_window: {
        context_window_size: 1048576,
        used_percentage: 0,
        remaining_percentage: 100,
        current_usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          ...activity.current_usage,
        },
        ...activity,
      },
    });
    const line = stripAnsi(renderIdentityLine(ctx));
    assert.doesNotMatch(line, /awaiting first response/, JSON.stringify(activity));
    assert.match(line, /0%/, JSON.stringify(activity));
  }
});

test('native quota renders remaining percentage with decimal precision and reset countdown', () => {
  setLanguage('zh-Hans');
  const reset = new Date(Date.now() + (6 * 24 + 11) * 60 * 60 * 1000);
  const ctx = context({
    quota: {
      'gemini-weekly': {
        remaining_fraction: 0.9378,
        reset_time: reset.toISOString(),
        reset_in_seconds: (6 * 24 + 11) * 60 * 60,
      },
    },
  });
  const line = stripAnsi(renderUsageLine(ctx));
  assert.match(line, /额度/);
  assert.match(line, /剩余 93\.8%/);
  assert.match(line, /重置剩余 6d 11h/);
});

test('Full runtime toggles expose all current Antigravity status fields', () => {
  setLanguage('en');
  const ctx = context({
    version: '1.1.22',
    sandbox: { enabled: true, allow_network: false },
    artifact_count: 2,
    plan_tier: 'Pro',
    email: 'developer@example.com',
    pending_input_count: 3,
    tool_confirmation_pending: true,
    task_count: 4,
    subagents: [{ status: 'working' }, { status: 'idle' }],
    vim: { mode: 'NORMAL' },
  }, {
    showSandbox: true,
    showArtifacts: true,
    showTaskCount: true,
    showPendingInput: true,
    showToolConfirmation: true,
    showVimMode: true,
    showPlanTier: true,
    showAccount: true,
    showAntigravityVersion: true,
    showSkills: true,
    showMcpActivity: true,
  });
  const line = stripAnsi(renderEnvironmentLine(ctx));
  for (const expected of [
    'sandbox:on', 'network:off', 'artifacts:2', 'tasks:4', 'subagents:2', 'input:3',
    'confirm:pending', 'vim:NORMAL', 'plan:Pro', 'developer@example.com',
    'skills:test-driven-development', 'mcp:github',
  ]) {
    assert.ok(line.includes(expected), `missing ${expected} in ${line}`);
  }
});

test('compact layout retains native state, quota, and Antigravity version', () => {
  setLanguage('en');
  const reset = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const ctx = context({
    cwd: '/workspace/agy-hud',
    model: { display_name: 'Gemini 3.5 Pro' },
    agent_state: 'working',
    execution_mode: 'execution',
    version: '1.1.22',
    quota: {
      weekly: { remaining_fraction: 0.75, reset_time: reset.toISOString() },
    },
  }, { showAntigravityVersion: true });
  ctx.claudeCodeVersion = '1.1.22';
  const line = stripAnsi(renderSessionLine(ctx));
  assert.match(line, /WORKING · execution/);
  assert.match(line, /Remaining 75%/);
  assert.match(line, /agy v1\.1\.22/);
});

test('compact layout labels native non-git VCS correctly', () => {
  setLanguage('en');
  const ctx = context({ cwd: '/workspace/agy-hud' });
  ctx.gitStatus = { branch: 'main', isDirty: true, ahead: 0, behind: 0, vcsType: 'jj' };
  const line = stripAnsi(renderSessionLine(ctx));
  assert.match(line, /jj:\(main\*\)/);
  assert.doesNotMatch(line, /git:\(main\*\)/);
});
