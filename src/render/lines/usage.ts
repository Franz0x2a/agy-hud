import type { QuotaWindow, RenderContext, StdinData } from "../../types.js";
import { isLimitReached } from "../../types.js";
import type { MessageKey } from "../../i18n/types.js";
import { shouldHideUsage } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";
import { progressLabel } from "./label-align.js";
import type { TimeFormatMode, UsageValueMode } from "../../config.js";
import { formatResetTime } from "../format-reset-time.js";

export function renderUsageLine(
  ctx: RenderContext,
  alignLabels = false,
): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (display?.showUsage === false) {
    return null;
  }

  if (!ctx.usageData) {
    return null;
  }

  if (shouldHideUsage(ctx.stdin)) {
    return null;
  }

  const usageLabel = progressLabel("label.usage", colors, alignLabels);

  if (ctx.usageData.quotaWindows?.length) {
    return renderNativeQuota(ctx, alignLabels);
  }

  if (ctx.usageData.balanceLabel) {
    return `${usageLabel} ${ctx.usageData.balanceLabel}`;
  }

  const timeFormat: TimeFormatMode = display?.timeFormat ?? 'relative';
  const showResetLabel = display?.showResetLabel ?? true;
  const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";
  const usageCompact = display?.usageCompact ?? false;
  const usageValueMode = display?.usageValue ?? 'percent';

  if (isLimitReached(ctx.usageData)) {
    const resetTime =
      ctx.usageData.fiveHour === 100
        ? formatResetTime(ctx.usageData.fiveHourResetAt, timeFormat)
        : formatResetTime(ctx.usageData.sevenDayResetAt, timeFormat);
    if (usageCompact) {
      return critical(`⚠ Limit${resetTime ? ` (${resetTime})` : ""}`, colors);
    }
    const resetSuffix = resetTime
      ? showResetLabel
        ? ` (${t(resetsKey)} ${resetTime})`
        : ` (${resetTime})`
      : "";
    return `${usageLabel} ${critical(`⚠ ${t("status.limitReached")}${resetSuffix}`, colors)}`;
  }

  const threshold = display?.usageThreshold ?? 0;
  const fiveHour = ctx.usageData.fiveHour;
  const sevenDay = ctx.usageData.sevenDay;

  const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
  if (effectiveUsage < threshold) {
    return null;
  }

  const sevenDayThreshold = display?.sevenDayThreshold ?? 80;

  if (usageCompact) {
    const fiveHourPart = fiveHour !== null
      ? formatCompactWindowPart("5h", fiveHour, ctx.usageData.fiveHourResetAt, timeFormat, colors, usageValueMode)
      : null;
    const sevenDayPart = (sevenDay !== null && (fiveHour === null || sevenDay >= sevenDayThreshold))
      ? formatCompactWindowPart("7d", sevenDay, ctx.usageData.sevenDayResetAt, timeFormat, colors, usageValueMode)
      : null;

    if (fiveHourPart && sevenDayPart) {
      return `${fiveHourPart} | ${sevenDayPart}`;
    }
    return fiveHourPart ?? sevenDayPart ?? null;
  }

  const usageBarEnabled = display?.usageBarEnabled ?? true;
  const barWidth = getAdaptiveBarWidth();

  if (fiveHour === null && sevenDay !== null) {
    const weeklyOnlyPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      alignLabels,
      usageValueMode,
    });
    return `${usageLabel} ${weeklyOnlyPart}`;
  }

  const fiveHourPart = formatUsageWindowPart({
    label: "5h",
    percent: fiveHour,
    resetAt: ctx.usageData.fiveHourResetAt,
    colors,
    usageBarEnabled,
    barWidth,
    timeFormat,
    showResetLabel,
    usageValueMode,
  });

  if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
    const sevenDayPart = formatUsageWindowPart({
      label: t("label.weekly"),
      labelKey: "label.weekly",
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
      timeFormat,
      showResetLabel,
      forceLabel: true,
      alignLabels,
      usageValueMode,
    });
    return `${usageLabel} ${fiveHourPart} | ${sevenDayPart}`;
  }

  return `${usageLabel} ${fiveHourPart}`;
}

const QUOTA_PERIOD_META_TOKENS = new Set([
  '1h', '5h', '24h', '1d', 'daily', 'weekly', '7d', 'monthly', '30d',
  'wtu', 'quota', 'limit', 'window', 'rolling', 'short', 'long',
  'shared', 'pool', 'base', 'baseline', 'sprint',
]);

const THIRD_PARTY_MODEL_TOKENS = new Set([
  '3p', 'claude', 'opus', 'sonnet', 'haiku', 'anthropic',
  'gpt', 'openai', 'o1', 'o3', 'o4', 'codex', 'deepseek', 'llama', 'qwen', 'mistral', 'grok',
]);

const THIRD_PARTY_BUCKET_TOKENS = new Set([
  '3p', 'thirdparty', 'claude', 'anthropic', 'gpt', 'openai', 'opus', 'sonnet', 'haiku', 'codex',
]);

type ScoredQuotaWindow = {
  window: QuotaWindow;
  index: number;
  score: number;
  periodKey: string;
  periodRank: number;
};

function tokenizeQuotaId(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function detectQuotaPeriod(tokens: string[], id: string): { key: string; rank: number } {
  const tokenSet = new Set(tokens);
  if (tokenSet.has('1h')) return { key: '1h', rank: 1 };
  if (tokenSet.has('5h')) return { key: '5h', rank: 2 };
  if (tokenSet.has('daily') || tokenSet.has('24h') || tokenSet.has('1d')) return { key: 'daily', rank: 3 };
  if (tokenSet.has('weekly') || tokenSet.has('7d')) return { key: 'weekly', rank: 4 };
  if (tokenSet.has('monthly') || tokenSet.has('30d')) return { key: 'monthly', rank: 5 };
  return { key: `other:${id.toLowerCase()}`, rank: 6 };
}

function scoreVariantMatch(variantTokens: string[], modelTokens: Set<string>): number {
  if (variantTokens.length === 0) {
    return 20;
  }
  let matched = 0;
  for (const token of variantTokens) {
    if (modelTokens.has(token)) {
      matched += 1;
    }
  }
  const unmatched = variantTokens.length - matched;
  if (matched > 0 && unmatched === 0) {
    return 30 + matched;
  }
  if (matched > 0) {
    return 15 + matched;
  }
  return 10;
}

function selectQuotaWindowsForModel(
  windows: QuotaWindow[],
  model?: StdinData['model'],
): QuotaWindow[] {
  if (windows.length <= 1) {
    return windows;
  }

  const modelText = [model?.id, model?.display_name].filter(Boolean).join(' ').toLowerCase();
  const modelTokens = new Set(tokenizeQuotaId(modelText));
  if (modelTokens.size === 0) {
    return windows.slice(0, 2);
  }

  const isGeminiModel = modelTokens.has('gemini');
  const hasAny3pBucket = windows.some((window) =>
    tokenizeQuotaId(window.id).some((token) => token === '3p' || token === 'thirdparty'),
  );
  const isThirdPartyModel = !isGeminiModel && (
    Array.from(modelTokens).some((token) => THIRD_PARTY_MODEL_TOKENS.has(token))
    || hasAny3pBucket
  );

  const scored: ScoredQuotaWindow[] = windows.map((window, index) => {
    const tokens = tokenizeQuotaId(window.id);
    const tokenSet = new Set(tokens);
    const hasGemini = tokenSet.has('gemini');
    const hasThirdParty = tokens.some((token) => THIRD_PARTY_BUCKET_TOKENS.has(token));
    const isGenericBucket = !hasGemini && !hasThirdParty;
    const period = detectQuotaPeriod(tokens, window.id);

    let score = 0;
    if (isGeminiModel) {
      if (hasThirdParty && !hasGemini) {
        score = -1;
      } else if (hasGemini) {
        const variantTokens = tokens.filter(
          (token) => token !== 'gemini' && !QUOTA_PERIOD_META_TOKENS.has(token),
        );
        score = scoreVariantMatch(variantTokens, modelTokens);
      } else if (isGenericBucket) {
        score = 5;
      }
    } else if (isThirdPartyModel) {
      if (hasGemini && !hasThirdParty) {
        score = -1;
      } else if (hasThirdParty) {
        const variantTokens = tokens.filter(
          (token) => token !== '3p' && token !== 'thirdparty' && !QUOTA_PERIOD_META_TOKENS.has(token),
        );
        score = scoreVariantMatch(variantTokens, modelTokens);
      } else if (isGenericBucket) {
        score = 5;
      }
    } else {
      score = 5;
    }

    return {
      window,
      index,
      score,
      periodKey: period.key,
      periodRank: period.rank,
    };
  });

  const primary = scored.filter((entry) => entry.score >= 20);
  const sameFamily = scored.filter((entry) => entry.score >= 10);
  const positive = scored.filter((entry) => entry.score > 0);
  const pool = primary.length > 0
    ? primary
    : sameFamily.length > 0
      ? sameFamily
      : positive;

  if (pool.length === 0) {
    return windows.slice(0, 2);
  }

  const byPeriod = new Map<string, ScoredQuotaWindow>();
  for (const entry of pool) {
    const existing = byPeriod.get(entry.periodKey);
    if (!existing || entry.score > existing.score) {
      byPeriod.set(entry.periodKey, entry);
    }
  }

  return Array.from(byPeriod.values())
    .sort((a, b) => (b.score - a.score) || (a.periodRank - b.periodRank) || (a.index - b.index))
    .slice(0, 2)
    .sort((a, b) => (a.periodRank - b.periodRank) || (a.index - b.index))
    .map((entry) => entry.window);
}

function renderNativeQuota(ctx: RenderContext, alignLabels: boolean): string | null {
  const windows = ctx.usageData?.quotaWindows;
  if (!windows?.length) return null;
  const colors = ctx.config?.colors;
  const display = ctx.config?.display;
  const timeFormat: TimeFormatMode = display?.timeFormat ?? 'relative';
  const showResetLabel = display?.showResetLabel ?? true;
  const quotaLabel = progressLabel('label.quota', colors, alignLabels);
  const barWidth = getAdaptiveBarWidth();
  const selectedWindows = selectQuotaWindowsForModel(windows, ctx.stdin.model);

  const rendered = selectedWindows.map((window) => {
    const remaining = Math.min(100, Math.max(0, window.remainingPercent));
    const used = 100 - remaining;
    const reset = formatResetTime(window.resetAt, timeFormat);
    const resetKey = timeFormat === 'absolute' ? 'format.resets' : 'format.resetsIn';
    const windowLabel = windows.length > 1
      ? `${label(humanizeQuotaId(window.id), colors)} `
      : '';
    const bar = display?.usageBarEnabled === false ? '' : `${quotaBar(used, barWidth, colors)} `;
    const remainingText = `${t('format.remaining')} ${formatPercent(remaining)}%`;
    const coloredRemaining = `${getQuotaColor(used, colors)}${remainingText}${RESET}`;
    const resetText = reset
      ? ` ${label(`(${showResetLabel ? `${t(resetKey)} ` : ''}${reset})`, colors)}`
      : '';
    return `${windowLabel}${bar}${coloredRemaining}${resetText}`;
  });

  return `${quotaLabel} ${rendered.join(' | ')}`;
}

function formatPercent(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

function humanizeQuotaId(value: string): string {
  return value.replace(/[-_]+/g, ' ');
}

function formatCompactWindowPart(
  windowLabel: string,
  percent: number | null,
  resetAt: Date | null,
  timeFormat: TimeFormatMode,
  colors?: RenderContext["config"]["colors"],
  usageValueMode: UsageValueMode = 'percent',
): string {
  const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
  const reset = formatResetTime(resetAt, timeFormat);
  const styledLabel = label(`${windowLabel}:`, colors);
  return reset
    ? `${styledLabel} ${usageDisplay} ${label(`(${reset})`, colors)}`
    : `${styledLabel} ${usageDisplay}`;
}

function formatUsagePercent(
  percent: number | null,
  colors?: RenderContext["config"]["colors"],
  mode: UsageValueMode = 'percent',
): string {
  if (percent === null) {
    return label("--", colors);
  }
  const color = getQuotaColor(percent, colors);
  const displayPercent = mode === 'remaining' ? Math.max(0, 100 - percent) : percent;
  return `${color}${displayPercent}%${RESET}`;
}

function formatUsageWindowPart({
  label: windowLabel,
  labelKey,
  percent,
  resetAt,
  colors,
  usageBarEnabled,
  barWidth,
  timeFormat = 'relative',
  showResetLabel,
  forceLabel = false,
  alignLabels = false,
  usageValueMode = 'percent',
}: {
  label: string;
  labelKey?: MessageKey;
  percent: number | null;
  resetAt: Date | null;
  colors?: RenderContext["config"]["colors"];
  usageBarEnabled: boolean;
  barWidth: number;
  timeFormat?: TimeFormatMode;
  showResetLabel: boolean;
  forceLabel?: boolean;
  alignLabels?: boolean;
  usageValueMode?: UsageValueMode;
}): string {
  const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
  const reset = formatResetTime(resetAt, timeFormat);
  const styledLabel = labelKey
    ? progressLabel(labelKey, colors, alignLabels)
    : label(windowLabel, colors);
  const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";

  const resetSuffix = reset
    ? showResetLabel
      ? `(${t(resetsKey)} ${reset})`
      : `(${reset})`
    : "";

  if (usageBarEnabled) {
    const body = resetSuffix
      ? `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay} ${resetSuffix}`
      : `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay}`;
    return forceLabel ? `${styledLabel} ${body}` : body;
  }

  return resetSuffix
    ? `${styledLabel} ${usageDisplay} ${resetSuffix}`
    : `${styledLabel} ${usageDisplay}`;
}
