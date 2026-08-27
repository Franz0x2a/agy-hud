import { label } from "../colors.js";
import { t } from "../../i18n/index.js";
export function renderEnvironmentLine(ctx) {
    const display = ctx.config?.display;
    const totalCounts = ctx.claudeMdCount + ctx.rulesCount + ctx.mcpCount + ctx.hooksCount;
    const threshold = display?.environmentThreshold ?? 0;
    const showCounts = display?.showConfigCounts !== false;
    const showOutputStyle = display?.showOutputStyle === true;
    const parts = [];
    if (showCounts && totalCounts >= threshold && totalCounts > 0) {
        if (ctx.claudeMdCount > 0) {
            parts.push(`${ctx.claudeMdCount} CLAUDE.md`);
        }
        if (ctx.rulesCount > 0) {
            parts.push(`${ctx.rulesCount} ${t("label.rules")}`);
        }
        if (ctx.mcpCount > 0) {
            parts.push(`${ctx.mcpCount} MCPs`);
        }
        if (ctx.hooksCount > 0) {
            parts.push(`${ctx.hooksCount} ${t("label.hooks")}`);
        }
    }
    if (showOutputStyle && ctx.outputStyle) {
        parts.push(`style: ${ctx.outputStyle}`);
    }
    if (display?.showSandbox && ctx.stdin.sandbox) {
        parts.push(`sandbox:${ctx.stdin.sandbox.enabled ? 'on' : 'off'}`);
        if (typeof ctx.stdin.sandbox.allow_network === 'boolean') {
            parts.push(`network:${ctx.stdin.sandbox.allow_network ? 'on' : 'off'}`);
        }
    }
    if (display?.showArtifacts && typeof ctx.stdin.artifact_count === 'number') {
        parts.push(`artifacts:${ctx.stdin.artifact_count}`);
    }
    if (display?.showTaskCount && typeof ctx.stdin.task_count === 'number') {
        parts.push(`tasks:${ctx.stdin.task_count}`);
    }
    if (display?.showTaskCount && Array.isArray(ctx.stdin.subagents)) {
        parts.push(`subagents:${ctx.stdin.subagents.length}`);
    }
    if (display?.showPendingInput && typeof ctx.stdin.pending_input_count === 'number') {
        parts.push(`input:${ctx.stdin.pending_input_count}`);
    }
    if (display?.showToolConfirmation && typeof ctx.stdin.tool_confirmation_pending === 'boolean') {
        parts.push(`confirm:${ctx.stdin.tool_confirmation_pending ? 'pending' : 'clear'}`);
    }
    if (display?.showVimMode && ctx.stdin.vim?.mode) {
        parts.push(`vim:${ctx.stdin.vim.mode}`);
    }
    if (display?.showPlanTier && ctx.stdin.plan_tier) {
        parts.push(`plan:${ctx.stdin.plan_tier}`);
    }
    if (display?.showAccount && ctx.stdin.email) {
        parts.push(ctx.stdin.email);
    }
    if (display?.showSkills && ctx.transcript.skills?.length > 0) {
        parts.push(`skills:${ctx.transcript.skills.slice(-3).join(',')}`);
    }
    if (display?.showMcpActivity && ctx.transcript.mcpServers?.length > 0) {
        parts.push(`mcp:${ctx.transcript.mcpServers.slice(-3).join(',')}`);
    }
    if (parts.length === 0) {
        return null;
    }
    return label(parts.join(" | "), ctx.config?.colors);
}
//# sourceMappingURL=environment.js.map