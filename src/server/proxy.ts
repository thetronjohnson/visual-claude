import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server, type IncomingMessage, type ServerResponse, request as httpRequest } from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { handleWsConnection } from './ws-handler.js';
import { editQueue } from './edit-queue.js';

let httpServer: Server | null = null;

const ACCESS_TOKEN = process.env.LAYRR_ACCESS_TOKEN || '';
const SHARE_PASSWORD = process.env.LAYRR_SHARE_PASSWORD || '';
const COOKIE_NAME = '__layrr_auth';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

function isAuthenticated(req: IncomingMessage): boolean {
  if (!ACCESS_TOKEN) return true; // no token configured = open access (CLI standalone mode)

  // Check query param
  const url = new URL(req.url || '/', `http://localhost`);
  if (url.searchParams.get('token') === ACCESS_TOKEN) return true;

  // Check cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME] === ACCESS_TOKEN) return true;

  return false;
}

function setAuthCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${ACCESS_TOKEN}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
}

function servePasswordGate(res: ServerResponse, error?: string) {
  const errorHtml = error ? `<p style="color:#fb7185;font-size:13px;margin-bottom:16px">${error}</p>` : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Layrr — Enter Password</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:rgba(24,24,27,.92);border:1px solid rgba(228,228,231,.1);border-radius:12px;padding:32px;width:100%;max-width:360px}
h1{font-size:18px;font-weight:600;margin-bottom:4px}
p.sub{font-size:13px;color:#a1a1aa;margin-bottom:24px}
label{display:block;font-size:12px;font-weight:500;color:#a1a1aa;margin-bottom:6px}
input{width:100%;padding:10px 12px;background:rgba(24,24,27,1);border:1px solid rgba(228,228,231,.1);border-radius:8px;color:#fafafa;font-size:14px;outline:none}
input:focus{border-color:rgba(228,228,231,.3)}
button{width:100%;margin-top:16px;padding:10px;background:#fafafa;color:#09090b;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
button:hover{opacity:.9}
</style></head>
<body>
<div class="card">
<h1>This site is password protected</h1>
<p class="sub">Enter the password to continue</p>
${errorHtml}
<form method="POST" action="/__layrr__/auth">
<label for="password">Password</label>
<input type="password" id="password" name="password" placeholder="Enter password" autofocus required>
<button type="submit">Continue</button>
</form>
</div>
</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveAccessDenied(res: ServerResponse) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access Denied</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:rgba(24,24,27,.92);border:1px solid rgba(228,228,231,.1);border-radius:12px;padding:32px;text-align:center;max-width:360px}
h1{font-size:18px;font-weight:600;margin-bottom:8px}
p{font-size:13px;color:#a1a1aa}
</style></head>
<body>
<div class="card">
<h1>Access Denied</h1>
<p>This editor is private. Use a valid Layrr access token to continue.</p>
</div>
</body></html>`;
  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

export async function startProxy(
  targetPort: number,
  proxyPort: number,
  projectRoot: string
): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const overlayPath = join(__dirname, '..', 'overlay.js');

  const fontsDir = join(__dirname, '..', 'fonts');

  const MIME: Record<string, string> = {
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
  };

  httpServer = createServer(async (req, res) => {
    // Password auth endpoint — always accessible
    if (req.url === '/__layrr__/auth' && req.method === 'POST') {
      const body = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      });
      const params = new URLSearchParams(body);
      const password = params.get('password') || '';

      if (SHARE_PASSWORD && password === SHARE_PASSWORD) {
        setAuthCookie(res);
        res.writeHead(302, { Location: '/' });
        res.end();
      } else {
        servePasswordGate(res, 'Incorrect password');
      }
      return;
    }

    // Auth check — set cookie if token in URL, gate if not authenticated
    if (ACCESS_TOKEN) {
      const url = new URL(req.url || '/', `http://localhost`);
      if (url.searchParams.get('token') === ACCESS_TOKEN) {
        // Valid token in URL — set cookie and redirect to strip token from URL
        setAuthCookie(res);
        url.searchParams.delete('token');
        const cleanUrl = url.pathname + (url.search || '');
        res.writeHead(302, { Location: cleanUrl });
        res.end();
        return;
      } else if (!isAuthenticated(req)) {
        if (SHARE_PASSWORD) {
          servePasswordGate(res);
        } else {
          serveAccessDenied(res);
        }
        return;
      }
    }

    // Serve overlay JS
    if (req.url === '/__layrr__/overlay.js') {
      try {
        const js = readFileSync(overlayPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(js);
      } catch {
        res.writeHead(500);
        res.end('// overlay not built');
      }
      return;
    }

    // Edit status REST fallback
    if (req.url === '/__layrr__/edit-status') {
      const result = editQueue.lastResult;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result || { success: null }));
      return;
    }

    if (req.url === '/__layrr__/history') {
      try {
        const log = execSync(
          'git log --all --grep="\\[layrr\\]" --format="%H|%s|%ar" -20',
          { cwd: projectRoot, encoding: 'utf-8' }
        ).trim();
        const head = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
        const commits = log ? log.split('\n').map(line => {
          const [hash, ...rest] = line.split('|');
          const timeAgo = rest.pop()!;
          const message = rest.join('|').replace('[layrr] ', '');
          return { hash, message, timeAgo };
        }) : [];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ head, commits }));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ head: '', commits: [] }));
      }
      return;
    }

    // Serve font assets
    if (req.url?.startsWith('/__layrr__/fonts/')) {
      const fileName = req.url.replace('/__layrr__/fonts/', '');
      const filePath = join(fontsDir, fileName);
      const ext = '.' + fileName.split('.').pop();
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Proxy everything else to dev server
    const targetUrl = `http://localhost:${targetPort}${req.url}`;

    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key !== 'host' && value) {
          headers[key] = Array.isArray(value) ? value[0] : value;
        }
      }

      const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await new Promise<string>((resolve) => {
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', () => resolve(Buffer.concat(chunks).toString()));
          })
        : undefined;

      const resp = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
      });

      const contentType = resp.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
        let html = await resp.text();
        const overlayScript = `
          <script>window.__LAYRR_WS_PORT__ = ${proxyPort};</script>
          <script src="/__layrr__/overlay.js"></script>
        `;
        html = html.replace('</body>', `${overlayScript}</body>`);

        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
          if (key !== 'content-length' && key !== 'content-encoding') {
            respHeaders[key] = value;
          }
        });
        respHeaders['content-type'] = 'text/html; charset=utf-8';

        res.writeHead(resp.status, respHeaders);
        res.end(html);
      } else {
        const body = Buffer.from(await resp.arrayBuffer());
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
          if (key !== 'content-encoding' && key !== 'content-length') {
            respHeaders[key] = value;
          }
        });

        res.writeHead(resp.status, respHeaders);
        res.end(body);
      }
    } catch (err: any) {
      res.writeHead(502);
      res.end(`Proxy error: ${err.message}`);
    }
  });

  // WebSocket server for layrr overlay
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => handleWsConnection(ws, projectRoot));

  // Handle WebSocket upgrades: layrr overlay vs dev server (HMR, etc.)
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/__layrr__/ws')) {
      // Auth check for WebSocket
      if (ACCESS_TOKEN && !isAuthenticated(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Proxy WebSocket to dev server (HMR etc.) — auth via cookie
      if (ACCESS_TOKEN && !isAuthenticated(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const proxyReq = httpRequest({
        hostname: 'localhost',
        port: targetPort,
        path: req.url,
        method: 'GET',
        headers: { ...req.headers, host: `localhost:${targetPort}` },
      });

      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(
          `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n` +
          Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
          '\r\n\r\n'
        );
        if (proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });

      proxyReq.on('error', () => socket.destroy());
      socket.on('error', () => proxyReq.destroy());

      proxyReq.end();
    }
  });

  return new Promise((resolve) => {
    httpServer!.listen(proxyPort, () => resolve());
  });
}

export function stopProxy() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}
