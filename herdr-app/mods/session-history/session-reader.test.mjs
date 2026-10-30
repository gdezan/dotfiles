import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSessions, listCursor } from './session-reader.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('combines sessions across projects, newest first, with safe resume arguments', async () => {
  const result = await collectSessions({
    pi: async () => [{ path: '/history/my session.jsonl', cwd: '/projects/a', name: 'Pi title', firstMessage: 'first', modified: new Date(1000) }],
    claude: async () => [{ sessionId: 'abc', cwd: '/projects/b', summary: 'Claude title', lastModified: 2000 }],
  });
  assert.deepEqual(result.sessions.map(s => [s.agent, s.title, s.cwd, s.argv]), [
    ['claude', 'Claude title', '/projects/b', ['claude', '--resume', 'abc']],
    ['pi', 'Pi title', '/projects/a', ['pi', '--session', '/history/my session.jsonl']],
  ]);
  assert.deepEqual(result.errors, []);
});

test('a failed source does not hide other sessions; missing directory cannot be opened', async () => {
  const result = await collectSessions({
    pi: async () => { throw new Error('unavailable'); },
    claude: async () => [{ sessionId: 'abc', summary: '', lastModified: 2000 }],
  });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0], 'Pi history unavailable');
  assert.equal(result.sessions[0].cwd, null);
  assert.equal(result.sessions[0].title, 'Untitled session');
});

test("Cursor skips empty and malformed chats and uses the chat ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "cursor-sessions-"));
  try {
    for (const id of ["saved", "empty", "broken"]) await mkdir(join(root, "project", id), { recursive: true });
    await writeFile(join(root, "project", "saved", "meta.json"), JSON.stringify({ hasConversation: true, cwd: "/project", updatedAtMs: 7 }));
    await writeFile(join(root, "project", "empty", "meta.json"), JSON.stringify({ hasConversation: false, cwd: "/project" }));
    await writeFile(join(root, "project", "broken", "meta.json"), "{");
    const rows = await listCursor(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "saved");
    const result = await collectSessions({ cursor: async () => rows });
    assert.deepEqual(result.sessions[0].argv, ["cursor-agent", "--resume", "saved"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
