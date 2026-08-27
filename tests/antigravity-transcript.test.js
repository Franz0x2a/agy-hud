import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseArtifactProgress } from '../dist/artifacts.js';
import { _setCreateReadStreamForTests, parseTranscript } from '../dist/transcript.js';

const fixtureUrl = new URL('./fixtures/antigravity-transcript.jsonl', import.meta.url);

test('parses Antigravity tool status from planner and action events', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agy-hud-transcript-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  await copyFile(fixtureUrl, transcriptPath);
  try {
    const data = await parseTranscript(transcriptPath);
    assert.deepEqual(
      data.tools.slice(0, 3).map(tool => ({ name: tool.name, target: tool.target, status: tool.status })),
      [
        { name: 'run_command', target: 'npm test', status: 'completed' },
        { name: 'view_file', target: '/workspace/src/index.ts', status: 'error' },
        { name: 'grep_search', target: 'normalizeStatusPayload', status: 'running' },
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parses Antigravity subagents, skills, and MCP activity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agy-hud-transcript-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  await copyFile(fixtureUrl, transcriptPath);
  try {
    const data = await parseTranscript(transcriptPath);
    assert.equal(data.agents.length, 1);
    assert.equal(data.agents[0].type, 'reviewer');
    assert.equal(data.agents[0].description, 'Review changes');
    assert.equal(data.agents[0].status, 'completed');
    assert.deepEqual(data.skills, ['test-driven-development']);
    assert.deepEqual(data.mcpServers, ['github']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('reads Plan progress only from the transcript owning conversation brain', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agy-hud-brain-'));
  const brainDir = path.join(root, 'brain', 'conversation-1');
  const logsDir = path.join(brainDir, '.system_generated', 'logs');
  const transcriptPath = path.join(logsDir, 'transcript.jsonl');
  await mkdir(logsDir, { recursive: true });
  await writeFile(transcriptPath, '', 'utf8');
  await writeFile(path.join(brainDir, 'task.md'), [
    '- [x] Normalize native status',
    '- [/] Render quota',
    '- [ ] Rewrite README',
    '- [ ] safe\u001b]0;owned\u0007\u0085\u202e task',
  ].join('\n'), 'utf8');

  try {
    const todos = await parseArtifactProgress(transcriptPath);
    assert.deepEqual(todos, [
      { content: 'Normalize native status', status: 'completed' },
      { content: 'Render quota', status: 'in_progress' },
      { content: 'Rewrite README', status: 'pending' },
      { content: 'safe task', status: 'pending' },
    ]);
    assert.deepEqual(await parseArtifactProgress(path.join(root, 'outside.jsonl')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('bounds transcript parsing to the recent tail while preserving live activity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agy-hud-large-transcript-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const planner = JSON.stringify({
    created_at: '2026-08-27T01:00:00.000Z',
    source: 'MODEL',
    status: 'DONE',
    step_index: 999,
    type: 'PLANNER_RESPONSE',
    tool_calls: [{ name: 'run_command', args: { CommandLine: 'npm test' } }],
  });
  const first = JSON.stringify({
    created_at: '2026-08-27T00:00:00.000Z',
    source: 'USER',
    type: 'USER_INPUT',
  });
  await writeFile(transcriptPath, `${first}\n${'x'.repeat(2 * 1024 * 1024 + 256)}\n${planner}\n`, 'utf8');
  let observedStart = 0;
  _setCreateReadStreamForTests((filePath, options) => {
    observedStart = options?.start ?? 0;
    return createReadStream(filePath, options);
  });
  try {
    const data = await parseTranscript(transcriptPath);
    assert.ok(observedStart > 0, 'large transcripts should be read from a bounded tail offset');
    assert.equal(data.tools.at(-1)?.name, 'run_command');
    assert.equal(data.tools.at(-1)?.target, 'npm test');
    assert.equal(data.sessionStart?.toISOString(), '2026-08-27T00:00:00.000Z');
    assert.equal(data.sessionTokens, undefined, 'tail-only parses must not show partial cumulative tokens');
  } finally {
    _setCreateReadStreamForTests(null);
    await rm(dir, { recursive: true, force: true });
  }
});

test('keeps a running Antigravity action pending until its terminal event', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agy-hud-action-lifecycle-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const lines = [
    {
      created_at: '2026-08-27T01:00:00.000Z', source: 'MODEL', status: 'DONE', step_index: 1,
      type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'run_command', args: { CommandLine: 'npm test' } }],
    },
    { created_at: '2026-08-27T01:00:01.000Z', source: 'TOOL', status: 'RUNNING', type: 'RUN_COMMAND' },
    { created_at: '2026-08-27T01:00:02.000Z', source: 'TOOL', status: 'DONE', type: 'RUN_COMMAND' },
  ];
  await writeFile(transcriptPath, `${lines.map(line => JSON.stringify(line)).join('\n')}\n`, 'utf8');

  try {
    const data = await parseTranscript(transcriptPath);
    assert.equal(data.tools.length, 1);
    assert.equal(data.tools[0].status, 'completed');
    assert.equal(data.tools[0].endTime?.toISOString(), '2026-08-27T01:00:02.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sanitizes terminal controls from legacy transcript fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agy-hud-legacy-sanitize-'));
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const escapeText = 'safe\u001b]0;owned\u0007\u0085\u202e text';
  const lines = [
    { type: 'custom-title', customTitle: escapeText },
    {
      type: 'assistant', timestamp: '2026-08-27T01:00:00.000Z', message: { content: [
        { type: 'tool_use', id: 'tool-1', name: `Read\u001b[2J`, input: { file_path: escapeText } },
        { type: 'tool_use', id: 'agent-1', name: 'Agent', input: { subagent_type: escapeText, description: escapeText } },
        { type: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: { todos: [{ content: escapeText, status: 'in_progress' }] } },
      ] },
    },
  ];
  await writeFile(transcriptPath, `${lines.map(line => JSON.stringify(line)).join('\n')}\n`, 'utf8');

  try {
    const data = await parseTranscript(transcriptPath);
    assert.equal(data.sessionName, 'safe text');
    assert.equal(data.tools[0].name, 'Read');
    assert.equal(data.tools[0].target, 'safe text');
    assert.equal(data.agents[0].type, 'safe text');
    assert.equal(data.agents[0].description, 'safe text');
    assert.deepEqual(data.todos, [{ content: 'safe text', status: 'in_progress' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
