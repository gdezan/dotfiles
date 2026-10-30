import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function collectSessions(sources) {
  const sessions = [], errors = [];
  const mappings = {
    pi: session => ({ agent: 'pi', title: session.name || session.firstMessage || 'Untitled session', cwd: session.cwd || null, modified: +session.modified || 0, argv: ['pi', '--session', session.path] }),
    claude: session => ({ agent: 'claude', title: session.summary || 'Untitled session', cwd: session.cwd || null, modified: session.lastModified || 0, argv: ['claude', '--resume', session.sessionId] }),
    cursor: session => ({ agent: 'cursor', title: 'Cursor conversation', cwd: session.cwd || null, modified: session.updatedAtMs || 0, argv: ['cursor-agent', '--resume', session.id] }),
  };
  const labels = { pi: 'Pi', claude: 'Claude', cursor: 'Cursor' };
  const results = await Promise.allSettled(Object.values(sources).map(load => load()));
  Object.keys(sources).forEach((source, index) => {
    const result = results[index];
    if (result.status === 'rejected') errors.push(`${labels[source]} history unavailable`);
    else sessions.push(...result.value.map(mappings[source]).map(session => ({ ...session, title: session.title.replace(/\s+/g, ' ').trim().slice(0, 180) || 'Untitled session' })));
  });
  sessions.sort((a, b) => b.modified - a.modified);
  return { sessions, errors };
}

async function listPi() {
  const root = process.env.PI_MANAGED_INSTALL_ROOT || join(homedir(), '.pi/agent/install');
  const version = (await readFile(join(root, 'current-version'), 'utf8')).trim();
  const module = join(root, 'releases', version, 'node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js');
  const { SessionManager } = await import(pathToFileURL(module).href);
  return process.env.PI_CODING_AGENT_SESSION_DIR
    ? SessionManager.listAll(process.env.PI_CODING_AGENT_SESSION_DIR)
    : SessionManager.listAll();
}

async function listClaude() {
  const { listSessions } = await import('@anthropic-ai/claude-agent-sdk');
  return listSessions();
}

export async function listCursor(root = join(homedir(), '.cursor/chats')) {
  let projects;
  try { projects = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const sessions = [];
  for (const project of projects.filter(entry => entry.isDirectory())) {
    const path = join(root, project.name);
    for (const chat of await readdir(path, { withFileTypes: true })) {
      if (!chat.isDirectory()) continue;
      try {
        const meta = JSON.parse(await readFile(join(path, chat.name, 'meta.json'), 'utf8'));
        if (meta.hasConversation && meta.cwd) sessions.push({ ...meta, id: chat.name });
      } catch {}
    }
  }
  return sessions;
}

export async function listSessions() {
  return collectSessions({ pi: listPi, claude: listClaude, cursor: listCursor });
}
