/**
 * Tiny zero-dependency Node server that proxies Luma Dream Machine API and
 * hosts uploaded keyframes for the browser demo. Run with:
 *
 *   LUMAAI_API_KEY=luma-... node server.mjs
 *
 * For Luma's servers to fetch the extracted keyframe, this server must be
 * reachable from the public internet. Options:
 *   - Deploy somewhere (Render, Fly, Vercel-style host that allows long-lived process), or
 *   - Run locally + expose via `ngrok http 3000` and set PUBLIC_URL=https://<id>.ngrok.app, or
 *   - Paste an existing public image URL in the UI (no upload).
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const LUMAAI_API_KEY = process.env.LUMAAI_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '');
const LUMA_BASE = 'https://api.lumalabs.ai/dream-machine/v1';
const UPLOAD_DIR = resolve(__dirname, 'tmp-uploads');
const PUBLIC_DIR = resolve(__dirname, 'public');

await mkdir(UPLOAD_DIR, { recursive: true });

if (!LUMAAI_API_KEY) {
  console.warn(
    '[warn] LUMAAI_API_KEY is not set. Generation requests will fail. ' +
      'Start the server with `LUMAAI_API_KEY=luma-... node server.mjs`.',
  );
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'content-type': 'application/json; charset=utf-8',
  });
}

async function readBodyBuffer(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) {
      const err = new Error('Payload too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBodyJson(req) {
  const buf = await readBodyBuffer(req, 1024 * 1024);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON');
    err.status = 400;
    throw err;
  }
}

function publicBaseFromReq(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto =
    req.headers['x-forwarded-proto']?.toString().split(',')[0].trim() || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function serveStaticFile(res, filePath, fallbackStatus = 404) {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      send(res, fallbackStatus, 'Not Found');
      return;
    }
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': s.size,
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, fallbackStatus, 'Not Found');
  }
}

async function handleUploadFrame(req, res) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('image/')) {
    return sendJson(res, 400, {
      error: 'Send the keyframe as a raw image body with Content-Type: image/<type>.',
    });
  }
  const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
  const buf = await readBodyBuffer(req, 15 * 1024 * 1024);
  const id = randomUUID();
  const filename = `${id}${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), buf);
  const base = publicBaseFromReq(req);
  const url = `${base}/uploads/${filename}`;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(base);
  return sendJson(res, 200, {
    url,
    isLocal,
    bytes: buf.length,
    note: isLocal
      ? 'Server is on localhost; Luma cannot reach this URL. Either set PUBLIC_URL=<https url> (e.g. ngrok) or paste an existing public image URL in the UI.'
      : undefined,
  });
}

async function handleGenerate(req, res) {
  if (!LUMAAI_API_KEY) {
    return sendJson(res, 500, { error: 'LUMAAI_API_KEY is not configured on the server.' });
  }
  const body = await readBodyJson(req);
  const { imageUrl, prompt, cameraMotion, model, resolution, duration } = body;
  if (!imageUrl || typeof imageUrl !== 'string') {
    return sendJson(res, 400, { error: 'imageUrl (string) is required' });
  }

  // Build a Ray-2 image-to-video request: orbit the object so it reads as 3D-ish.
  const finalPrompt =
    (prompt && String(prompt).trim()) ||
    'Smooth slow orbit around the object, locked-on, even studio lighting, no zoom';

  const payload = {
    model: model || 'ray-2',
    resolution: resolution || '720p',
    duration: duration || '5s',
    prompt: finalPrompt,
    keyframes: {
      frame0: { type: 'image', url: imageUrl },
    },
  };

  if (cameraMotion && typeof cameraMotion === 'string') {
    // The Luma API accepts a `concepts` list to bias camera motion.
    payload.concepts = [{ key: cameraMotion }];
  }

  const lumaRes = await fetch(`${LUMA_BASE}/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${LUMAAI_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await lumaRes.text();
  res.writeHead(lumaRes.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function handleGetGeneration(req, res, id) {
  if (!LUMAAI_API_KEY) {
    return sendJson(res, 500, { error: 'LUMAAI_API_KEY is not configured on the server.' });
  }
  if (!/^[a-f0-9-]{8,}$/i.test(id)) {
    return sendJson(res, 400, { error: 'invalid id' });
  }
  const lumaRes = await fetch(`${LUMA_BASE}/generations/${id}`, {
    headers: {
      authorization: `Bearer ${LUMAAI_API_KEY}`,
      accept: 'application/json',
    },
  });
  const text = await lumaRes.text();
  res.writeHead(lumaRes.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function handleConcepts(req, res) {
  if (!LUMAAI_API_KEY) {
    return sendJson(res, 500, { error: 'LUMAAI_API_KEY is not configured on the server.' });
  }
  const lumaRes = await fetch(`${LUMA_BASE}/generations/concepts/list`, {
    headers: {
      authorization: `Bearer ${LUMAAI_API_KEY}`,
      accept: 'application/json',
    },
  });
  const text = await lumaRes.text();
  res.writeHead(lumaRes.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return serveStaticFile(res, join(PUBLIC_DIR, 'index.html'));
    }
    if (req.method === 'GET' && pathname.startsWith('/static/')) {
      const safe = pathname.replace(/^\/static\//, '').replace(/\.\.+/g, '');
      return serveStaticFile(res, join(PUBLIC_DIR, safe));
    }
    if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
      const safe = pathname.replace(/^\/uploads\//, '').replace(/\.\.+/g, '');
      return serveStaticFile(res, join(UPLOAD_DIR, safe));
    }
    if (req.method === 'POST' && pathname === '/api/upload-frame') {
      return handleUploadFrame(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/generate') {
      return handleGenerate(req, res);
    }
    if (req.method === 'GET' && pathname.startsWith('/api/generation/')) {
      const id = pathname.replace('/api/generation/', '');
      return handleGetGeneration(req, res, id);
    }
    if (req.method === 'GET' && pathname === '/api/concepts') {
      return handleConcepts(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        hasKey: Boolean(LUMAAI_API_KEY),
        publicUrl: publicBaseFromReq(req),
      });
    }
    send(res, 404, 'Not Found');
  } catch (err) {
    const status = err?.status || 500;
    sendJson(res, status, { error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`[luma-demo] listening on http://localhost:${PORT}`);
  console.log(`[luma-demo] public base: ${PUBLIC_URL || `(derived from request host)`}`);
});
