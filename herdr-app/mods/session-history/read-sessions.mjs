import { listSessions } from './session-reader.mjs';
console.log(JSON.stringify(await listSessions()));
