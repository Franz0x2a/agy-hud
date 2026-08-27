import { readStdin, getUsageFromStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
import { parseArtifactProgress } from "./artifacts.js";
import { render } from "./render/index.js";
import { countConfigs } from "./config-reader.js";
import { getGitStatus } from "./git.js";
import { loadConfig } from "./config.js";
import { parseExtraCmdArg, runExtraCmd } from "./extra-cmd.js";
import { getClaudeCodeVersion } from "./version.js";
import { getMemoryUsage } from "./memory.js";
import { resolveEffortLevel } from "./effort.js";
import { applyContextWindowFallback } from "./context-cache.js";
import { getUsageFromExternalSnapshot } from "./external-usage.js";
import { setLanguage, t } from "./i18n/index.js";
export { getUsageFromExternalSnapshot } from "./external-usage.js";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
export async function main(overrides = {}) {
    const deps = {
        readStdin,
        getUsageFromStdin,
        getUsageFromExternalSnapshot,
        parseTranscript,
        parseArtifactProgress,
        countConfigs,
        getGitStatus,
        loadConfig,
        parseExtraCmdArg,
        runExtraCmd,
        getClaudeCodeVersion,
        getMemoryUsage,
        applyContextWindowFallback,
        render,
        now: () => Date.now(),
        log: console.log,
        ...overrides,
    };
    try {
        const stdin = await deps.readStdin();
        if (!stdin) {
            // Running without stdin - this happens during setup verification
            const config = await deps.loadConfig();
            setLanguage(config.language);
            const isMacOS = process.platform === "darwin";
            deps.log(t("init.initializing"));
            if (isMacOS) {
                deps.log(t("init.macosNote"));
            }
            return;
        }
        const config = await deps.loadConfig();
        setLanguage(config.language);
        const transcriptPath = stdin.transcript_path ?? "";
        const transcript = needsTranscript(config)
            ? await deps.parseTranscript(transcriptPath)
            : { tools: [], agents: [], todos: [], skills: [], mcpServers: [] };
        if (config.display.showTodos) {
            const artifactTodos = await deps.parseArtifactProgress(transcriptPath);
            if (artifactTodos.length > 0) {
                transcript.todos = artifactTodos;
            }
        }
        deps.applyContextWindowFallback(stdin, {}, transcript.sessionName, {
            lastCompactBoundaryAt: transcript.lastCompactBoundaryAt,
            lastCompactPostTokens: transcript.lastCompactPostTokens,
        });
        const configCounts = config.display.showConfigCounts || config.display.showOutputStyle
            ? await deps.countConfigs(stdin.cwd)
            : { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0, outputStyle: undefined };
        const { claudeMdCount, rulesCount, mcpCount, hooksCount, outputStyle } = configCounts;
        const needsExtendedGit = config.gitStatus.showAheadBehind || config.gitStatus.showFileStats;
        const nativeGitStatus = getNativeVcsStatus(stdin);
        const nativeIsNonGit = nativeGitStatus?.vcsType !== undefined && nativeGitStatus.vcsType !== 'git';
        const gitStatus = config.gitStatus.enabled
            ? (nativeGitStatus && (!needsExtendedGit || nativeIsNonGit)
                ? nativeGitStatus
                : await deps.getGitStatus(stdin.cwd) ?? nativeGitStatus)
            : null;
        let usageData = null;
        if (config.display.showUsage !== false) {
            usageData = deps.getUsageFromStdin(stdin);
            if (!usageData) {
                usageData = deps.getUsageFromExternalSnapshot(config, deps.now());
            }
        }
        const extraCmd = deps.parseExtraCmdArg();
        const extraLabel = extraCmd ? await deps.runExtraCmd(extraCmd) : null;
        const sessionDuration = formatSessionDuration(transcript.sessionStart, deps.now);
        const claudeCodeVersion = (config.display.showAntigravityVersion || config.display.showClaudeCodeVersion)
            ? stdin.version ?? await deps.getClaudeCodeVersion()
            : undefined;
        const effortInfo = config.display.showEffortLevel
            ? resolveEffortLevel(stdin.effort)
            : null;
        const memoryUsage = config.display.showMemoryUsage && config.lineLayout === "expanded"
            ? await deps.getMemoryUsage()
            : null;
        const ctx = {
            stdin,
            transcript,
            claudeMdCount,
            rulesCount,
            mcpCount,
            hooksCount,
            sessionDuration,
            gitStatus,
            usageData,
            memoryUsage,
            config,
            extraLabel,
            outputStyle,
            claudeCodeVersion,
            effortLevel: effortInfo?.level,
            effortSymbol: effortInfo?.symbol,
        };
        deps.render(ctx);
    }
    catch (error) {
        deps.log("[agy-hud] Error:", error instanceof Error ? error.message : "Unknown error");
    }
}
function needsTranscript(config) {
    const display = config.display;
    return display.showTools
        || display.showAgents
        || display.showTodos
        || display.showSessionName
        || display.showDuration
        || display.showCost
        || display.showPromptCache
        || display.showSessionTokens
        || display.showSessionStartDate
        || display.showLastResponseAt
        || display.showSkills
        || display.showMcpActivity;
}
function getNativeVcsStatus(stdin) {
    const vcs = stdin.vcs;
    if (!vcs?.branch)
        return null;
    const vcsType = vcs.type?.toLowerCase();
    if (vcsType !== undefined && vcsType !== 'git' && vcsType !== 'jj' && vcsType !== 'hg')
        return null;
    return {
        branch: vcs.branch,
        isDirty: vcs.dirty === true,
        vcsType: vcsType ?? 'git',
        ahead: 0,
        behind: 0,
    };
}
export function formatSessionDuration(sessionStart, now = () => Date.now()) {
    if (!sessionStart) {
        return "";
    }
    const ms = now() - sessionStart.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1)
        return "<1m";
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a, b) => {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return a === b;
    }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
    void main();
}
//# sourceMappingURL=index.js.map