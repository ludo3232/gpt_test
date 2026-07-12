const http = require('http');
const { randomUUID } = require('crypto');
const { createReadStream, promises: fs } = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'recipes-db.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PUBLIC_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.svg', 'image/svg+xml'],
]);

async function ensureStorage() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try { await fs.access(DATA_FILE); } catch { await fs.writeFile(DATA_FILE, '[]\n'); }
}

async function readRecipes() {
  await ensureStorage();
  const content = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(content || '[]');
}

async function writeRecipes(recipes) {
  await ensureStorage();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(recipes, null, 2)}\n`);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extensionForMime(mime) {
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[mime] || '.jpg';
}

function parseDataUrl(value) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(value || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function persistPhotos(photos = []) {
  const urls = [];
  for (const photo of photos) {
    if (typeof photo === 'string' && photo.startsWith('/uploads/')) {
      urls.push(photo);
      continue;
    }
    const parsed = parseDataUrl(photo);
    if (!parsed) continue;
    const filename = `${Date.now()}-${randomUUID()}${extensionForMime(parsed.mime)}`;
    await fs.writeFile(path.join(UPLOAD_DIR, filename), parsed.buffer);
    urls.push(`/uploads/${filename}`);
  }
  return urls;
}

function normalizeRecipe(recipe) {
  return {
    id: recipe.id || randomUUID(),
    name: String(recipe.name || '').trim(),
    type: String(recipe.type || 'Autre'),
    servings: Number(recipe.servings || 1),
    time: String(recipe.time || '').trim(),
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(String) : [],
    steps: String(recipe.steps || '').trim(),
    photos: Array.isArray(recipe.photos) ? recipe.photos : [],
    theme: recipe.theme || '',
    updatedAt: new Date().toISOString(),
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/recipes' && req.method === 'GET') return sendJson(res, 200, await readRecipes());
  if (url.pathname === '/api/recipes' && req.method === 'PUT') {
    const imported = [];
    for (const item of JSON.parse((await readBody(req)).toString('utf8') || '[]')) {
      const recipe = normalizeRecipe(item);
      recipe.photos = await persistPhotos(recipe.photos);
      imported.push(recipe);
    }
    await writeRecipes(imported);
    return sendJson(res, 200, imported);
  }
  if (url.pathname === '/api/recipes' && req.method === 'POST') {
    const recipe = normalizeRecipe(JSON.parse((await readBody(req)).toString('utf8') || '{}'));
    recipe.photos = await persistPhotos(recipe.photos);
    const recipes = await readRecipes();
    recipes.unshift(recipe);
    await writeRecipes(recipes);
    return sendJson(res, 201, recipe);
  }
  const match = url.pathname.match(/^\/api\/recipes\/([^/]+)$/);
  if (!match) return false;
  const id = decodeURIComponent(match[1]);
  const recipes = await readRecipes();
  const index = recipes.findIndex((recipe) => recipe.id === id);
  if (index < 0) return sendJson(res, 404, { error: 'Recette introuvable' });
  if (req.method === 'PUT') {
    const recipe = normalizeRecipe({ ...JSON.parse((await readBody(req)).toString('utf8') || '{}'), id });
    recipe.photos = await persistPhotos(recipe.photos);
    recipes[index] = recipe;
    await writeRecipes(recipes);
    return sendJson(res, 200, recipe);
  }
  if (req.method === 'DELETE') {
    recipes.splice(index, 1);
    await writeRecipes(recipes);
    return sendJson(res, 200, { ok: true });
  }
  return false;
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': PUBLIC_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled === false) sendJson(res, 405, { error: 'Méthode non autorisée' });
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

ensureStorage().then(() => server.listen(PORT, () => console.log(`Livre de recettes: http://localhost:${PORT}`)));
