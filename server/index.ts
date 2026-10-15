// Takt server: HTTP + WebSocket wrapper around the shared plant runtime, plus the static console.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { PlantRuntime } from '../shared/runtime.ts';
import { SqliteStore } from './store.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DIST = new URL('../web/dist/', import.meta.url).pathname;

const runtime = new PlantRuntime(new SqliteStore(), {
  readReport: async () => JSON.parse(await readFile(new URL('../pipegen/trt_report.json', import.meta.url), 'utf8')),
});
const n = runtime.start();
console.log(`[sim] backfilled ${n} cycles since ${new Date(runtime.shiftStart).toLocaleTimeString()}`);

// ---------------------------------------------------------------- HTTP
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' };
const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
};
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
async function serveStatic(path: string, res: ServerResponse) {
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) return json(res, 403, {});
  try { if (!(await stat(file)).isFile()) throw 0; } catch {
    // a missing hashed asset (e.g. a tab opened before a rebuild) must 404, never fall back to HTML
    if (path.startsWith('/assets/') || extname(path)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    file = join(DIST, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch { res.writeHead(404); res.end('Build the console first: npm run build'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    try {
      const body = req.method === 'GET' ? undefined : await readBody(req);
      const r = await runtime.handle(req.method ?? 'GET', url.pathname, url.searchParams, body);
      return json(res, r.status, r.body);
    } catch (e) { return json(res, 400, { error: String(e) }); }
  }
  return serveStatic(url.pathname, res);
});

const clients = new Set<WebSocket>();
runtime.subscribe(m => { const s = JSON.stringify(m); for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s); });
new WebSocketServer({ server, path: '/ws' }).on('connection', ws => {
  clients.add(ws);
  for (const l of runtime.liveStates()) ws.send(JSON.stringify({ kind: 'live', live: l }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => console.log(`Takt server → http://localhost:${PORT}  (API /api, WS /ws)`));
