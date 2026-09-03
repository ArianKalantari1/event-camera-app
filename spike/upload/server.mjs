// Upload spike server.
//
// Two modes:
//   MODE=mock (default) — no credentials, no dependencies. Accepts the PUT itself,
//                         writes to .uploads/, and can inject latency and failures
//                         so the client's retry path actually gets exercised.
//   MODE=r2            — mints real presigned PUTs against R2 (or any S3 API).
//                         Needs: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//
// Metrics from every run are appended to metrics.jsonl. Testing happens on a phone;
// the evidence lands here.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const DIR       = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC    = path.join(DIR, 'public');
const UPLOADS   = path.join(DIR, '.uploads');
const METRICS   = path.join(DIR, 'metrics.jsonl');

const MODE       = process.env.MODE || 'mock';
const PORT       = Number(process.env.PORT || 3000);
const FAIL_RATE  = Number(process.env.FAIL_RATE || 0);   // 0..1, mock only
const LATENCY_MS = Number(process.env.LATENCY_MS || 0);  // added per upload, mock only

await fsp.mkdir(UPLOADS, { recursive: true });

let presignR2 = null;
if (MODE === 'r2') {
  const need = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const missing = need.filter(k => !process.env[k]);
  if (missing.length) { console.error('MODE=r2 needs: ' + missing.join(', ')); process.exit(1); }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  // Plain S3 API on purpose. Nothing here is R2-specific except the endpoint,
  // so moving to S3 later is an env change, not a rewrite.
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });

  presignR2 = async (key, contentType) => {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 900 }
    );
    // The signature covers Content-Type, so the client must send exactly this.
    return { url, headers: { 'content-type': contentType } };
  };
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/api/presign')   return await presign(req, res);
    if (req.method === 'PUT'  && url.pathname === '/api/mock-put')  return await mockPut(req, res, url);
    if (req.method === 'POST' && url.pathname === '/api/metric')    return await metric(req, res);
    if (req.method === 'GET'  && url.pathname === '/api/uploads')   return await listUploads(res);
    if (req.method === 'GET')                                       return await serveStatic(url, res);
    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err && err.message || err) });
  }
});

async function presign(req, res){
  const { filename = 'photo.jpg', contentType = 'application/octet-stream', size = 0 } = await readJSON(req);
  const ext = (path.extname(filename) || '.jpg').toLowerCase().slice(0, 6);
  const key = `spike/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}${ext}`;

  if (MODE === 'r2') {
    const { url, headers } = await presignR2(key, contentType);
    console.log(`presign r2   ${key}  ${contentType}  ${fmt(size)}`);
    return send(res, 200, { key, url, headers, mode: 'r2' });
  }
  console.log(`presign mock ${key}  ${contentType}  ${fmt(size)}`);
  send(res, 200, {
    key,
    url: `/api/mock-put?key=${encodeURIComponent(key)}`,
    headers: { 'content-type': contentType },
    mode: 'mock'
  });
}

async function mockPut(req, res, url){
  const key = url.searchParams.get('key');
  if (!key || key.includes('..')) return send(res, 400, { error: 'bad key' });

  const dest = path.join(UPLOADS, key.replace(/[\/]/g, '__'));
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);

  if (LATENCY_MS) await new Promise(r => setTimeout(r, LATENCY_MS));
  if (FAIL_RATE && Math.random() < FAIL_RATE) {
    console.log(`mock-put     ${key}  INJECTED FAILURE`);
    return send(res, 503, { error: 'injected failure' });
  }

  await fsp.writeFile(dest, buf);
  console.log(`mock-put     ${key}  ${fmt(buf.length)}  ok`);
  send(res, 200, { ok: true, bytes: buf.length });
}

async function metric(req, res){
  const m = await readJSON(req);
  m.at = new Date().toISOString();
  m.mode = MODE;
  await fsp.appendFile(METRICS, JSON.stringify(m) + '\n');
  const shrink = m.outBytes ? ` ${fmt(m.originalBytes)}->${fmt(m.outBytes)}` : ' (original)';
  console.log(`metric       ${m.name}${shrink}  upload ${m.uploadMs}ms  attempts ${m.attempts}  total ${m.totalMs}ms`);
  send(res, 200, { ok: true });
}

async function listUploads(res){
  const files = await fsp.readdir(UPLOADS);
  const rows = await Promise.all(files.map(async f => {
    const s = await fsp.stat(path.join(UPLOADS, f));
    return { file: f, bytes: s.size, at: s.mtime };
  }));
  send(res, 200, rows);
}

async function serveStatic(url, res){
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function readJSON(req){
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const fmt = b => b < 1024*1024 ? Math.round(b/1024) + 'KB' : (b/1048576).toFixed(1) + 'MB';

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nupload spike · MODE=${MODE}  port ${PORT}`);
  if (MODE === 'mock' && (FAIL_RATE || LATENCY_MS))
    console.log(`chaos: FAIL_RATE=${FAIL_RATE} LATENCY_MS=${LATENCY_MS}`);
  console.log(`\n  laptop:  http://localhost:${PORT}`);
  for (const [name, addrs] of Object.entries(lanAddresses()))
    for (const a of addrs) console.log(`  phone:   http://${a}:${PORT}   (${name}, same wifi)`);
  console.log(`\nmetrics -> ${path.relative(process.cwd(), METRICS)}\n`);
});

function lanAddresses(){
  const out = {};
  for (const [name, list] of Object.entries(os.networkInterfaces() || {})) {
    const v4 = (list || []).filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    if (v4.length) out[name] = v4;
  }
  return out;
}
