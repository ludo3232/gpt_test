const http = require('http');
const { readFile, writeFile, mkdir } = require('fs/promises');
const { existsSync, createReadStream } = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'network-data.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const EMPTY_DATA = { networks: [], devices: [] };

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    await writeFile(DATA_FILE, JSON.stringify(EMPTY_DATA, null, 2));
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function staticPath(urlPath) {
  const requested = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}data${path.sep}`)) return null;
  return filePath;
}

async function handleApi(req, res) {
  await ensureDataFile();
  if (req.method === 'GET') {
    const content = await readFile(DATA_FILE, 'utf8');
    sendJson(res, 200, JSON.parse(content || JSON.stringify(EMPTY_DATA)));
    return;
  }
  if (req.method === 'POST') {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const cleanData = { networks: Array.isArray(data.networks) ? data.networks : [], devices: Array.isArray(data.devices) ? data.devices : [] };
    await writeFile(DATA_FILE, JSON.stringify(cleanData, null, 2));
    sendJson(res, 200, cleanData);
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/data') {
      await handleApi(req, res);
      return;
    }
    const filePath = staticPath(url.pathname);
    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

ensureDataFile().then(() => {
  server.listen(PORT, () => console.log(`NetHome Manager listening on http://localhost:${PORT}`));
});
