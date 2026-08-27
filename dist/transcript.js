import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'readline';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './antigravity-config-dir.js';
import { sanitizeTerminalText } from './sanitize.js';
const TRANSCRIPT_CACHE_VERSION = 7;
const MAX_TRANSCRIPT_READ_BYTES = 2 * 1024 * 1024;
const MAX_TRANSCRIPT_PREFIX_BYTES = 64 * 1024;
let createReadStreamImpl = fs.createReadStream;
function normalizeTokenCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.trunc(value));
}
function normalizeSessionTokens(tokens) {
    if (!tokens || typeof tokens !== 'object') {
        return undefined;
    }
    const raw = tokens;
    return {
        inputTokens: normalizeTokenCount(raw.inputTokens),
        outputTokens: normalizeTokenCount(raw.outputTokens),
        cacheCreationTokens: normalizeTokenCount(raw.cacheCreationTokens),
        cacheReadTokens: normalizeTokenCount(raw.cacheReadTokens),
    };
}
function getTranscriptCachePath(transcriptPath, homeDir) {
    const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
    return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${hash}.json`);
}
function canonicalizeTranscriptPath(transcriptPath) {
    try {
        return fs.realpathSync(transcriptPath);
    }
    catch {
        return null;
    }
}
function readTranscriptFileState(transcriptPath) {
    try {
        const stat = fs.statSync(transcriptPath);
        if (!stat.isFile()) {
            return null;
        }
        return {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
        };
    }
    catch {
        return null;
    }
}
function readTranscriptStart(transcriptPath) {
    let fd;
    try {
        fd = fs.openSync(transcriptPath, 'r');
        const buffer = Buffer.alloc(MAX_TRANSCRIPT_PREFIX_BYTES);
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        const prefix = buffer.subarray(0, bytesRead).toString('utf8');
        for (const line of prefix.split(/\r?\n/)) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const timestamp = parseTimestamp(entry.created_at ?? entry.timestamp);
                if (timestamp)
                    return timestamp;
            }
            catch {
                // The first bounded chunk can end inside a JSON line.
            }
        }
    }
    catch {
        return undefined;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
    return undefined;
}
function serializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: tool.startTime.toISOString(),
            endTime: tool.endTime?.toISOString(),
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: agent.startTime.toISOString(),
            endTime: agent.endTime?.toISOString(),
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        skills: [...data.skills],
        mcpServers: [...data.mcpServers],
        sessionStart: data.sessionStart?.toISOString(),
        sessionName: data.sessionName,
        lastAssistantResponseAt: data.lastAssistantResponseAt?.toISOString(),
        sessionTokens: data.sessionTokens,
        lastCompactBoundaryAt: data.lastCompactBoundaryAt?.toISOString(),
        lastCompactPostTokens: data.lastCompactPostTokens,
    };
}
function deserializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: new Date(tool.startTime),
            endTime: tool.endTime ? new Date(tool.endTime) : undefined,
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: new Date(agent.startTime),
            endTime: agent.endTime ? new Date(agent.endTime) : undefined,
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        skills: Array.isArray(data.skills) ? [...data.skills] : [],
        mcpServers: Array.isArray(data.mcpServers) ? [...data.mcpServers] : [],
        sessionStart: data.sessionStart ? new Date(data.sessionStart) : undefined,
        sessionName: data.sessionName,
        lastAssistantResponseAt: data.lastAssistantResponseAt ? new Date(data.lastAssistantResponseAt) : undefined,
        sessionTokens: normalizeSessionTokens(data.sessionTokens),
        lastCompactBoundaryAt: data.lastCompactBoundaryAt ? new Date(data.lastCompactBoundaryAt) : undefined,
        lastCompactPostTokens: typeof data.lastCompactPostTokens === 'number' ? data.lastCompactPostTokens : undefined,
    };
}
function readTranscriptCache(transcriptPath, state) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version !== TRANSCRIPT_CACHE_VERSION
            || !parsed.data
            || !parsed.transcriptPath
            || parsed.transcriptPath !== path.resolve(transcriptPath)
            || parsed.transcriptState?.mtimeMs !== state.mtimeMs
            || parsed.transcriptState?.size !== state.size) {
            return null;
        }
        return deserializeTranscriptData(parsed.data);
    }
    catch {
        return null;
    }
}
function writeTranscriptCache(transcriptPath, state, data) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const payload = {
            version: TRANSCRIPT_CACHE_VERSION,
            transcriptPath: path.resolve(transcriptPath),
            transcriptState: state,
            data: serializeTranscriptData(data),
        };
        fs.writeFileSync(cachePath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    }
    catch {
        // Cache failures are non-fatal; fall back to fresh parsing next time.
    }
}
export async function parseTranscript(transcriptPath) {
    const result = {
        tools: [],
        agents: [],
        todos: [],
        skills: [],
        mcpServers: [],
    };
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return result;
    }
    const canonicalTranscriptPath = canonicalizeTranscriptPath(transcriptPath);
    if (!canonicalTranscriptPath) {
        return result;
    }
    const transcriptState = readTranscriptFileState(canonicalTranscriptPath);
    if (!transcriptState) {
        return result;
    }
    const cached = readTranscriptCache(canonicalTranscriptPath, transcriptState);
    if (cached) {
        return cached;
    }
    const toolMap = new Map();
    const agentMap = new Map();
    const pendingAntigravityTools = [];
    const pendingAntigravityAgents = [];
    const skills = new Set();
    const mcpServers = new Set();
    let latestTodos = [];
    const taskIdToIndex = new Map();
    const queueCompletionMap = new Map();
    let latestSlug;
    let customTitle;
    let lastCompactBoundaryAt;
    let lastCompactPostTokens;
    const sessionTokens = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
    };
    let lastUsageKey;
    let parsedCleanly = false;
    const start = Math.max(0, transcriptState.size - MAX_TRANSCRIPT_READ_BYTES);
    if (start > 0) {
        result.sessionStart = readTranscriptStart(canonicalTranscriptPath);
    }
    try {
        const fileStream = createReadStreamImpl(canonicalTranscriptPath, { start });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        for await (const line of rl) {
            if (!line.trim()) {
                lastUsageKey = undefined;
                continue;
            }
            try {
                const entry = JSON.parse(line);
                if (isAntigravityEntry(entry)) {
                    processAntigravityEntry(entry, toolMap, agentMap, pendingAntigravityTools, pendingAntigravityAgents, skills, mcpServers, result);
                    continue;
                }
                if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
                    customTitle = sanitizeTranscriptText(entry.customTitle).trim().slice(0, 500) || undefined;
                }
                else if (typeof entry.slug === 'string') {
                    latestSlug = sanitizeTranscriptText(entry.slug).trim().slice(0, 500) || undefined;
                }
                // Accumulate token usage from assistant messages.
                // Claude Code can write the same API response to the transcript 2-3 times
                // consecutively (dual-logging). Skip consecutive duplicates to avoid inflating counts.
                if (entry.type === 'assistant' && entry.message?.usage) {
                    const usage = entry.message.usage;
                    const key = `${usage.input_tokens}|${usage.output_tokens}|${usage.cache_creation_input_tokens}|${usage.cache_read_input_tokens}`;
                    if (key !== lastUsageKey) {
                        sessionTokens.inputTokens += normalizeTokenCount(usage.input_tokens);
                        sessionTokens.outputTokens += normalizeTokenCount(usage.output_tokens);
                        sessionTokens.cacheCreationTokens += normalizeTokenCount(usage.cache_creation_input_tokens);
                        sessionTokens.cacheReadTokens += normalizeTokenCount(usage.cache_read_input_tokens);
                    }
                    lastUsageKey = key;
                }
                else {
                    lastUsageKey = undefined;
                }
                // Track Claude Code's compact_boundary marker. Both manual (/compact)
                // and auto compaction emit this system entry with compactMetadata; we
                // take the most recent one's timestamp so callers can distinguish a
                // legitimate post-compact zero frame from a transient stdin glitch.
                if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
                    const ts = entry.timestamp ? new Date(entry.timestamp) : null;
                    if (ts && !Number.isNaN(ts.getTime())) {
                        if (!lastCompactBoundaryAt || ts.getTime() > lastCompactBoundaryAt.getTime()) {
                            lastCompactBoundaryAt = ts;
                            const post = entry.compactMetadata?.postTokens;
                            lastCompactPostTokens = typeof post === 'number' && Number.isFinite(post) && post >= 0
                                ? Math.trunc(post)
                                : undefined;
                        }
                    }
                }
                // Capture accurate background-agent completion timestamps from queue-operation entries.
                // The tool_result timestamp in the parent transcript is written at launch time, not
                // when the agent actually finishes, so we override with the enqueue timestamp.
                if (entry.type === 'queue-operation' && entry.operation === 'enqueue' && entry.content) {
                    const taskIdMatch = entry.content.match(/<task-id>([^<]+)<\/task-id>/);
                    const toolUseIdMatch = entry.content.match(/<tool-use-id>([^<]+)<\/tool-use-id>/);
                    if (taskIdMatch && toolUseIdMatch && entry.timestamp) {
                        const ts = new Date(entry.timestamp);
                        if (!Number.isNaN(ts.getTime())) {
                            queueCompletionMap.set(toolUseIdMatch[1], ts);
                        }
                    }
                }
                processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result);
            }
            catch {
                lastUsageKey = undefined;
                // Skip malformed lines
            }
        }
        parsedCleanly = true;
    }
    catch {
        // Return partial results on error
    }
    // Resolve agent completion: prefer queue-operation timestamps (accurate for
    // background agents), fall back to tool_result timestamps (inline agents).
    // Status is deferred so background agents show ◐ until they truly finish.
    for (const [toolUseId, endTime] of queueCompletionMap) {
        const agent = agentMap.get(toolUseId);
        if (agent?.background) {
            agent.endTime = endTime;
            agent.status = 'completed';
        }
    }
    for (const agent of agentMap.values()) {
        if (agent.status === 'running' && agent.endTime) {
            agent.status = 'completed';
        }
    }
    result.tools = Array.from(toolMap.values()).slice(-20);
    result.agents = Array.from(agentMap.values()).slice(-10);
    result.todos = latestTodos;
    result.skills = Array.from(skills).slice(-20);
    result.mcpServers = Array.from(mcpServers).slice(-20);
    result.sessionName = customTitle ?? latestSlug;
    // A tail-only parse cannot produce a truthful cumulative token total.
    // Hide it instead of presenting a plausible but under-counted value.
    result.sessionTokens = start === 0 ? sessionTokens : undefined;
    result.lastCompactBoundaryAt = lastCompactBoundaryAt;
    result.lastCompactPostTokens = lastCompactPostTokens;
    if (parsedCleanly) {
        writeTranscriptCache(canonicalTranscriptPath, transcriptState, result);
    }
    return result;
}
function isAntigravityEntry(entry) {
    return typeof entry.created_at === 'string'
        || typeof entry.step_index === 'number'
        || Array.isArray(entry.tool_calls);
}
function processAntigravityEntry(entry, toolMap, agentMap, pendingTools, pendingAgents, skills, mcpServers, result) {
    const timestamp = parseTimestamp(entry.created_at);
    if (!result.sessionStart && timestamp) {
        result.sessionStart = timestamp;
    }
    if (entry.source === 'MODEL' && timestamp) {
        result.lastAssistantResponseAt = timestamp;
    }
    if (entry.type === 'PLANNER_RESPONSE' && Array.isArray(entry.tool_calls)) {
        entry.tool_calls.forEach((call, index) => {
            const name = typeof call.name === 'string'
                ? sanitizeTranscriptText(call.name).trim().slice(0, 128)
                : '';
            if (!name)
                return;
            const args = call.args && typeof call.args === 'object' ? call.args : {};
            if (name.toLowerCase() === 'skill') {
                const skill = firstString(args, ['Skill', 'skill', 'name']);
                if (skill)
                    skills.add(skill);
                return;
            }
            const mcpMatch = name.match(/^mcp__(.+?)__/i);
            if (mcpMatch?.[1]) {
                mcpServers.add(mcpMatch[1]);
            }
            if (name === 'invoke_subagent') {
                const subagents = Array.isArray(args.Subagents) ? args.Subagents : [];
                subagents.forEach((raw, agentIndex) => {
                    if (!raw || typeof raw !== 'object')
                        return;
                    const subagent = raw;
                    const id = `agy-agent-${entry.step_index ?? 'unknown'}-${index}-${agentIndex}`;
                    const agent = {
                        id,
                        type: firstString(subagent, ['TypeName', 'Role']) ?? 'agent',
                        description: firstString(args, ['toolSummary', 'toolAction'])
                            ?? firstString(subagent, ['Prompt']),
                        status: 'running',
                        startTime: timestamp ?? new Date(),
                    };
                    agentMap.set(id, agent);
                    pendingAgents.push(agent);
                });
                return;
            }
            const id = `agy-tool-${entry.step_index ?? 'unknown'}-${index}`;
            const tool = {
                id,
                name,
                target: extractAntigravityTarget(name, args),
                status: 'running',
                startTime: timestamp ?? new Date(),
            };
            toolMap.set(id, tool);
            pendingTools.push(tool);
        });
        return;
    }
    if (entry.type === 'INVOKE_SUBAGENT') {
        for (const agent of pendingAgents.splice(0)) {
            agent.status = 'completed';
            if (timestamp)
                agent.endTime = timestamp;
        }
        return;
    }
    const expectedTool = antigravityActionToolName(entry.type);
    if (!expectedTool)
        return;
    const pendingIndex = expectedTool === '*'
        ? pendingTools.length - 1
        : pendingTools.findIndex((tool) => canonicalToolName(tool.name) === expectedTool);
    if (pendingIndex < 0)
        return;
    const tool = pendingTools[pendingIndex];
    tool.status = entry.status === 'ERROR'
        ? 'error'
        : entry.status === 'RUNNING' ? 'running' : 'completed';
    if (tool.status === 'running')
        return;
    pendingTools.splice(pendingIndex, 1);
    if (timestamp)
        tool.endTime = timestamp;
}
function parseTimestamp(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function firstString(source, keys) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) {
            return sanitizeTranscriptText(value).trim().slice(0, 500);
        }
    }
    return undefined;
}
function sanitizeTranscriptText(value) {
    return sanitizeTerminalText(value);
}
function canonicalToolName(name) {
    return name.toLowerCase();
}
function antigravityActionToolName(type) {
    switch (type) {
        case 'RUN_COMMAND': return 'run_command';
        case 'VIEW_FILE': return 'view_file';
        case 'GREP_SEARCH': return 'grep_search';
        case 'LIST_DIRECTORY': return 'list_directory';
        case 'READ_URL_CONTENT': return 'read_url_content';
        case 'SEARCH_WEB': return 'search_web';
        case 'CODE_ACTION': return '*';
        case 'GENERIC': return '*';
        default: return null;
    }
}
function extractAntigravityTarget(name, args) {
    const lower = name.toLowerCase();
    switch (lower) {
        case 'run_command':
            return firstString(args, ['CommandLine']);
        case 'view_file':
            return firstString(args, ['AbsolutePath']);
        case 'grep_search':
            return firstString(args, ['Query']);
        case 'list_directory':
        case 'list_dir':
            return firstString(args, ['DirectoryPath', 'AbsolutePath']);
        case 'read_url_content':
            return firstString(args, ['Url', 'URL']);
        case 'search_web':
            return firstString(args, ['Query', 'query']);
        case 'write_to_file':
        case 'replace_file_content':
            return firstString(args, ['TargetFile', 'AbsolutePath']);
        default:
            return firstString(args, ['toolSummary', 'toolAction']);
    }
}
export function _setCreateReadStreamForTests(impl) {
    createReadStreamImpl = impl ?? fs.createReadStream;
}
function processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result) {
    const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
    const hasValidTimestamp = !Number.isNaN(timestamp.getTime());
    if (!result.sessionStart && entry.timestamp && hasValidTimestamp) {
        result.sessionStart = timestamp;
    }
    if (entry.type === 'assistant' && entry.timestamp && hasValidTimestamp) {
        result.lastAssistantResponseAt = timestamp;
    }
    const content = entry.message?.content;
    if (!content || !Array.isArray(content))
        return;
    for (const block of content) {
        if (block.type === 'tool_use' && block.id && block.name) {
            const safeToolName = sanitizeTranscriptText(block.name).trim().slice(0, 128);
            const toolEntry = {
                id: block.id,
                name: safeToolName,
                target: extractTarget(safeToolName, block.input),
                status: 'running',
                startTime: timestamp,
            };
            if (block.name === 'Task' || block.name === 'Agent') {
                const input = block.input;
                const agentEntry = {
                    id: block.id,
                    type: safeLegacyString(input?.subagent_type, 128) ?? 'agent',
                    model: safeLegacyString(input?.model, 128),
                    description: safeLegacyString(input?.description, 500),
                    status: 'running',
                    startTime: timestamp,
                    background: input?.run_in_background === true,
                };
                agentMap.set(block.id, agentEntry);
            }
            else if (block.name === 'TodoWrite') {
                const input = block.input;
                if (input?.todos && Array.isArray(input.todos)) {
                    // Build a FIFO queue of taskIds per content string, ordered by the
                    // old array position. Two todos that share the same content must
                    // each get their own taskId back after the rebuild, so we cannot
                    // collapse duplicates to one index.
                    const contentToTaskIds = new Map();
                    const taskIdsByOldIndex = [];
                    for (const [taskId, idx] of taskIdToIndex) {
                        if (idx < latestTodos.length) {
                            taskIdsByOldIndex.push([idx, taskId]);
                        }
                    }
                    taskIdsByOldIndex.sort((a, b) => a[0] - b[0]);
                    for (const [idx, taskId] of taskIdsByOldIndex) {
                        const content = latestTodos[idx].content;
                        const ids = contentToTaskIds.get(content) ?? [];
                        ids.push(taskId);
                        contentToTaskIds.set(content, ids);
                    }
                    latestTodos.length = 0;
                    taskIdToIndex.clear();
                    latestTodos.push(...input.todos.slice(0, 256).map((todo) => ({
                        content: sanitizeTranscriptText(String(todo?.content ?? '')).trim().slice(0, 500),
                        status: normalizeTaskStatus(todo?.status) ?? 'pending',
                    })).filter((todo) => todo.content.length > 0));
                    // Consume one queued taskId per new todo that matches by content,
                    // so duplicate-content items still each get their own taskId.
                    for (let i = 0; i < latestTodos.length; i++) {
                        const ids = contentToTaskIds.get(latestTodos[i].content);
                        if (ids && ids.length > 0) {
                            const taskId = ids.shift();
                            taskIdToIndex.set(taskId, i);
                            if (ids.length === 0) {
                                contentToTaskIds.delete(latestTodos[i].content);
                            }
                        }
                    }
                }
            }
            else if (block.name === 'TaskCreate') {
                const input = block.input;
                const subject = safeLegacyString(input?.subject, 500) ?? '';
                const description = safeLegacyString(input?.description, 500) ?? '';
                const content = subject || description || 'Untitled task';
                const status = normalizeTaskStatus(input?.status) ?? 'pending';
                latestTodos.push({ content, status });
                const rawTaskId = input?.taskId;
                const taskId = typeof rawTaskId === 'string' || typeof rawTaskId === 'number'
                    ? String(rawTaskId)
                    : block.id;
                if (taskId) {
                    taskIdToIndex.set(taskId, latestTodos.length - 1);
                }
            }
            else if (block.name === 'TaskUpdate') {
                const input = block.input;
                const index = resolveTaskIndex(input?.taskId, taskIdToIndex, latestTodos);
                if (index !== null) {
                    const status = normalizeTaskStatus(input?.status);
                    if (status) {
                        latestTodos[index].status = status;
                    }
                    const subject = safeLegacyString(input?.subject, 500) ?? '';
                    const description = safeLegacyString(input?.description, 500) ?? '';
                    const content = subject || description;
                    if (content) {
                        latestTodos[index].content = content;
                    }
                }
            }
            else {
                toolMap.set(block.id, toolEntry);
            }
        }
        if (block.type === 'tool_result' && block.tool_use_id) {
            const tool = toolMap.get(block.tool_use_id);
            if (tool) {
                tool.status = block.is_error ? 'error' : 'completed';
                tool.endTime = timestamp;
            }
            const agent = agentMap.get(block.tool_use_id);
            if (agent && !agent.background) {
                agent.endTime = timestamp;
            }
        }
    }
}
function extractTarget(toolName, input) {
    if (!input)
        return undefined;
    switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
            return safeLegacyString(input.file_path ?? input.path, 500);
        case 'Glob':
            return safeLegacyString(input.pattern, 500);
        case 'Grep':
            return safeLegacyString(input.pattern, 500);
        case 'Skill':
            return safeLegacyString(input.skill, 500);
        case 'Bash': {
            const cmd = safeLegacyString(input.command, 500);
            return cmd ? cmd.slice(0, 30) + (cmd.length > 30 ? '...' : '') : undefined;
        }
    }
    return undefined;
}
function safeLegacyString(value, maxLength) {
    if (typeof value !== 'string')
        return undefined;
    return sanitizeTranscriptText(value).trim().slice(0, maxLength) || undefined;
}
function resolveTaskIndex(taskId, taskIdToIndex, latestTodos) {
    if (typeof taskId === 'string' || typeof taskId === 'number') {
        const key = String(taskId);
        const mapped = taskIdToIndex.get(key);
        if (typeof mapped === 'number') {
            return mapped;
        }
        if (/^\d+$/.test(key)) {
            const numericIndex = Number.parseInt(key, 10) - 1;
            if (numericIndex >= 0 && numericIndex < latestTodos.length) {
                return numericIndex;
            }
        }
    }
    return null;
}
function normalizeTaskStatus(status) {
    if (typeof status !== 'string')
        return null;
    switch (status) {
        case 'pending':
        case 'not_started':
            return 'pending';
        case 'in_progress':
        case 'running':
            return 'in_progress';
        case 'completed':
        case 'complete':
        case 'done':
            return 'completed';
        default:
            return null;
    }
}
//# sourceMappingURL=transcript.js.map