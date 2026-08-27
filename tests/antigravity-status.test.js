import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  getQuotaWindows,
  normalizeStatusPayload,
} from '../dist/antigravity/status.js';

const fixtureUrl = new URL('./fixtures/statusline-1.1.22.json', import.meta.url);

test('normalizes the documented Antigravity 1.1.22 status payload', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const data = normalizeStatusPayload(fixture);

  assert.ok(data);
  assert.equal(data.version, '1.1.22');
  assert.equal(data.context_window.used_percentage, 14.24);
  assert.equal(data.context_window.current_usage.cache_read_input_tokens, 20857);
  assert.equal(data.agent_state, 'idle');
  assert.equal(data.vcs.branch, 'main');
  assert.equal(data.sandbox.allow_network, true);
  assert.equal(data.cost.total_cost_usd, 1.234567);
  assert.equal(data.vim.mode, 'NORMAL');

  assert.deepEqual(getQuotaWindows(data), [{
    id: 'gemini-weekly',
    remainingPercent: 93.78,
    resetAt: new Date('2026-07-06T07:50:32Z'),
    resetInSeconds: 560580,
  }]);
});

test('preserves explicit zero and false values from native status data', () => {
  const data = normalizeStatusPayload({
    context_window: {
      context_window_size: 1048576,
      used_percentage: 0,
      remaining_percentage: 100,
      current_usage: { input_tokens: 0 },
    },
    quota: {
      daily: {
        remaining_fraction: 0,
        reset_in_seconds: 0,
      },
    },
    task_count: 0,
    pending_input_count: 0,
    tool_confirmation_pending: false,
    sandbox: { enabled: false, allow_network: false },
  });

  assert.ok(data);
  assert.equal(data.context_window.used_percentage, 0);
  assert.equal(data.task_count, 0);
  assert.equal(data.pending_input_count, 0);
  assert.equal(data.tool_confirmation_pending, false);
  assert.equal(data.sandbox.enabled, false);
  assert.deepEqual(getQuotaWindows(data), [{
    id: 'daily',
    remainingPercent: 0,
    resetAt: null,
    resetInSeconds: 0,
  }]);
});

test('rejects non-object payloads and invalid quota windows without throwing', () => {
  assert.equal(normalizeStatusPayload(null), null);
  assert.equal(normalizeStatusPayload([]), null);
  assert.equal(normalizeStatusPayload('invalid'), null);

  const data = normalizeStatusPayload({
    quota: {
      broken: { remaining_fraction: Number.NaN },
      oversized: { remaining_fraction: 5 },
    },
  });

  assert.ok(data);
  assert.deepEqual(getQuotaWindows(data), []);
});

test('sanitizes terminal control data and bounds native subagent metadata', () => {
  const payload = normalizeStatusPayload({
    agent_state: 'wor\u001b[31mking\u202e\u001b]0;owned\u0007\u0085',
    execution_mode: 'plan\u0000ning',
    subagents: Array.from({ length: 600 }, (_, index) => ({
      status: index === 0 ? 'run\u001b[2Jning' : 'idle',
    })),
  });
  assert.equal(payload.agent_state, 'working');
  assert.equal(payload.execution_mode, 'planning');
  assert.equal(payload.subagents.length, 256);
  assert.equal(payload.subagents[0].status, 'running');
});
