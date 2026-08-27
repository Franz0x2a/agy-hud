import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { TodoItem } from './types.js';
import { sanitizeTerminalText } from './sanitize.js';

const MAX_TASK_FILE_BYTES = 512 * 1024;
const MAX_TASK_ITEMS = 256;

/** Read task progress only from the Antigravity brain that owns a transcript. */
export async function parseArtifactProgress(transcriptPath: string): Promise<TodoItem[]> {
  try {
    const transcript = await fs.realpath(transcriptPath);
    const logsDir = path.dirname(transcript);
    const systemDir = path.dirname(logsDir);
    const conversationDir = path.dirname(systemDir);

    if (!/^transcript(?:_full)?\.jsonl$/i.test(path.basename(transcript))) return [];
    if (path.basename(logsDir) !== 'logs') return [];
    if (path.basename(systemDir) !== '.system_generated') return [];
    if (path.basename(path.dirname(conversationDir)) !== 'brain') return [];

    const canonicalConversationDir = await fs.realpath(conversationDir);
    const taskPath = path.join(canonicalConversationDir, 'task.md');
    const taskStat = await fs.lstat(taskPath);
    if (!taskStat.isFile() || taskStat.isSymbolicLink() || taskStat.size > MAX_TASK_FILE_BYTES) return [];

    const canonicalTaskPath = await fs.realpath(taskPath);
    if (path.dirname(canonicalTaskPath) !== canonicalConversationDir) return [];
    const markdown = await fs.readFile(canonicalTaskPath, 'utf8');
    return parseTaskMarkdown(markdown);
  } catch {
    return [];
  }
}

function parseTaskMarkdown(markdown: string): TodoItem[] {
  const todos: TodoItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[([ xX\/~>\-])\]\s+(.+?)\s*$/);
    if (!match) continue;
    const content = sanitizeText(match[2]);
    if (!content) continue;
    const marker = match[1];
    todos.push({
      content,
      status: marker === 'x' || marker === 'X'
        ? 'completed'
        : marker === ' ' ? 'pending' : 'in_progress',
    });
    if (todos.length >= MAX_TASK_ITEMS) break;
  }
  return todos;
}

function sanitizeText(value: string): string {
  return sanitizeTerminalText(value).trim().slice(0, 500);
}
