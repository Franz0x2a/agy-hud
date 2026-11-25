import type { QuotaWindow, StdinData } from '../types.js';
import { sanitizeTerminalText } from '../sanitize.js';

const MAX_STRING_LENGTH = 4096;
const MAX_QUOTA_WINDOWS = 64;
const MAX_SUBAGENTS = 256;

function sanitizeString(value: string): string {
  return sanitizeTerminalText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH) return undefined;
  return sanitizeString(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function percentage(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed === undefined ? undefined : Math.min(100, Math.max(0, parsed));
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      result[key] = removeUndefined(child);
    }
  }
  return result;
}

function normalizeCurrentUsage(value: unknown): {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
} | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    input_tokens: nonNegativeNumber(value.input_tokens),
    output_tokens: nonNegativeNumber(value.output_tokens),
    cache_creation_input_tokens: nonNegativeNumber(value.cache_creation_input_tokens),
    cache_read_input_tokens: nonNegativeNumber(value.cache_read_input_tokens),
  };
}

function normalizeContextWindow(value: unknown): StdinData['context_window'] {
  if (!isRecord(value)) return undefined;
  return {
    context_window_size: nonNegativeNumber(value.context_window_size),
    total_input_tokens: value.total_input_tokens === null ? null : nonNegativeNumber(value.total_input_tokens),
    total_output_tokens: value.total_output_tokens === null ? null : nonNegativeNumber(value.total_output_tokens),
    current_usage: normalizeCurrentUsage(value.current_usage),
    used_percentage: value.used_percentage === null ? null : percentage(value.used_percentage),
    remaining_percentage: value.remaining_percentage === null ? null : percentage(value.remaining_percentage),
  };
}

function normalizeQuota(value: unknown): StdinData['quota'] {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const result: NonNullable<StdinData['quota']> = {};
  for (const [id, rawWindow] of Object.entries(value).slice(0, MAX_QUOTA_WINDOWS)) {
    const safeId = sanitizeString(id);
    if (!safeId || safeId.length > 128 || !isRecord(rawWindow)) continue;
    if (rawWindow.disabled === true) continue;
    const remainingFraction = finiteNumber(rawWindow.remaining_fraction);
    if (remainingFraction === undefined || remainingFraction < 0 || remainingFraction > 1) continue;
    result[safeId] = {
      remaining_fraction: remainingFraction,
      reset_time: rawWindow.reset_time === null ? null : stringValue(rawWindow.reset_time),
      reset_in_seconds: rawWindow.reset_in_seconds === null
        ? null
        : nonNegativeNumber(rawWindow.reset_in_seconds),
    };
  }
  return result;
}

function normalizeWorkspace(value: unknown): StdinData['workspace'] {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    current_dir: stringValue(value.current_dir),
    project_dir: stringValue(value.project_dir),
    git_worktree: stringValue(value.git_worktree),
    added_dirs: Array.isArray(value.added_dirs)
      ? value.added_dirs.slice(0, 64).map(stringValue).filter((item): item is string => item !== undefined)
      : undefined,
  };
}

function normalizeModel(value: unknown): StdinData['model'] {
  if (!isRecord(value)) return undefined;
  return {
    id: stringValue(value.id),
    display_name: stringValue(value.display_name),
  };
}

function normalizeSubagents(value: unknown): StdinData['subagents'] {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, MAX_SUBAGENTS).map((raw) => {
    if (!isRecord(raw)) return {};
    return {
      id: stringValue(raw.id),
      type: stringValue(raw.type),
      status: stringValue(raw.status),
      description: stringValue(raw.description),
    };
  });
}

function normalizeCost(value: unknown): StdinData['cost'] {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    total_cost_usd: value.total_cost_usd === null ? null : nonNegativeNumber(value.total_cost_usd),
    total_duration_ms: value.total_duration_ms === null ? null : nonNegativeNumber(value.total_duration_ms),
    total_api_duration_ms: value.total_api_duration_ms === null ? null : nonNegativeNumber(value.total_api_duration_ms),
    total_lines_added: value.total_lines_added === null ? null : nonNegativeNumber(value.total_lines_added),
    total_lines_removed: value.total_lines_removed === null ? null : nonNegativeNumber(value.total_lines_removed),
  };
}

export function normalizeStatusPayload(value: unknown): StdinData | null {
  if (!isRecord(value)) return null;

  const vcs = isRecord(value.vcs) ? {
    type: stringValue(value.vcs.type),
    branch: stringValue(value.vcs.branch),
    client: stringValue(value.vcs.client),
    dirty: booleanValue(value.vcs.dirty),
  } : value.vcs === null ? null : undefined;

  const sandbox = isRecord(value.sandbox) ? {
    enabled: booleanValue(value.sandbox.enabled),
    allow_network: booleanValue(value.sandbox.allow_network),
  } : value.sandbox === null ? null : undefined;

  const vim = isRecord(value.vim) ? { mode: stringValue(value.vim.mode) }
    : value.vim === null ? null : undefined;

  const normalized: StdinData = {
    session_id: stringValue(value.session_id),
    conversation_id: stringValue(value.conversation_id),
    transcript_path: stringValue(value.transcript_path),
    cwd: stringValue(value.cwd),
    workspace: normalizeWorkspace(value.workspace),
    model: normalizeModel(value.model),
    context_window: normalizeContextWindow(value.context_window),
    cost: normalizeCost(value.cost),
    version: stringValue(value.version),
    product: stringValue(value.product),
    exceeds_200k_tokens: value.exceeds_200k_tokens === null ? null : booleanValue(value.exceeds_200k_tokens),
    quota: normalizeQuota(value.quota),
    agent_state: stringValue(value.agent_state),
    vcs,
    sandbox,
    artifact_count: nonNegativeNumber(value.artifact_count),
    plan_tier: stringValue(value.plan_tier),
    email: stringValue(value.email),
    pending_input_count: nonNegativeNumber(value.pending_input_count),
    tool_confirmation_pending: booleanValue(value.tool_confirmation_pending),
    task_count: nonNegativeNumber(value.task_count),
    subagents: normalizeSubagents(value.subagents),
    terminal_width: nonNegativeNumber(value.terminal_width),
    execution_mode: stringValue(value.execution_mode),
    vim,
  };
  return removeUndefined(normalized) as StdinData;
}

export function getQuotaWindows(stdin: StdinData): QuotaWindow[] {
  if (!stdin.quota) return [];

  const windows: QuotaWindow[] = [];
  for (const [id, window] of Object.entries(stdin.quota).slice(0, MAX_QUOTA_WINDOWS)) {
    if (window.disabled === true) continue;
    const fraction = window.remaining_fraction;
    if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;

    const resetTime = window.reset_time;
    const parsedReset = typeof resetTime === 'string' ? new Date(resetTime) : null;
    windows.push({
      id,
      remainingPercent: fraction * 100,
      resetAt: parsedReset && !Number.isNaN(parsedReset.getTime()) ? parsedReset : null,
      resetInSeconds: typeof window.reset_in_seconds === 'number'
        && Number.isFinite(window.reset_in_seconds)
        && window.reset_in_seconds >= 0
        ? window.reset_in_seconds
        : null,
    });
  }
  return windows;
}
