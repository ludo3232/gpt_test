const TYPES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Sauce', 'Autre'];
const STORAGE_KEY = 'recipe-book-theme-v1';
let recipes = [];
let selectedPhotos = [];
let viewMode = window.matchMedia('(max-width: 520px)').matches ? 'list' : 'cards';

const $ = (id) => document.getElementById(id);
const form = $('recipeForm');
const template = $('cardTemplate');

function fillSelect(select, includeAll = false) {
  select.innerHTML = includeAll ? '<option value="all">Tous les types</option>' : '';
  TYPES.forEach((type) => select.add(new Option(type, type)));
}

async function loadRecipes() {
  try {
    const response = await fetch('/api/recipes');
    recipes = response.ok ? await response.json() : [];
  } catch {
    recipes = [];
  }
  render();
}

async function saveRecipeToServer(recipe) {
  const isUpdate = recipes.some((item) => item.id === recipe.id);
  const response = await fetch(isUpdate ? `/api/recipes/${encodeURIComponent(recipe.id)}` : '/api/recipes', {
    method: isUpdate ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });
  if (!response.ok) throw new Error('Impossible de sauvegarder la recette sur le serveur.');
  return response.json();
}

async function replaceServerDatabase(nextRecipes) {
  const response = await fetch('/api/recipes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextRecipes),
  });
  if (!response.ok) throw new Error('Impossible d’importer la base sur le serveur.');
  return response.json();
}

function parseIngredient(line, factor) {
  const match = line.trim().match(/^([0-9]+(?:[,.][0-9]+)?)(\s*)(.*)$/);
  if (!match) return line;
  const value = Number(match[1].replace(',', '.')) * factor;
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${match[2]}${match[3]}`;
}

function scaledIngredients(recipe, targetServings = recipe.servings) {
  const factor = Number(targetServings || recipe.servings) / recipe.servings;
  return recipe.ingredients.map((line) => parseIngredient(line, factor));
}

function recipeFromForm() {
  return {
    id: $('recipeId').value || crypto.randomUUID(),
    name: $('name').value.trim(),
    type: $('type').value,
    servings: Number($('servings').value),
    time: $('time').value.trim(),
    ingredients: $('ingredients').value.split('\n').map((line) => line.trim()).filter(Boolean),
    steps: $('steps').value.trim(),
    photos: selectedPhotos,
    updatedAt: new Date().toISOString(),
  };
}

function openRecipeDialog(recipe = null) {
  resetForm(false);
  if (recipe) fillForm(recipe);
  $('recipeDialog').showModal();
}

function fillForm(recipe) {
  $('recipeId').value = recipe.id;
  $('name').value = recipe.name;
  $('type').value = recipe.type;
  $('servings').value = recipe.servings;
  $('time').value = recipe.time;
  $('ingredients').value = recipe.ingredients.join('\n');
  $('steps').value = recipe.steps;
  selectedPhotos = recipe.photos || [];
  renderPhotoPreview();
  $('formTitle').textContent = 'Modifier la recette';
  $('deleteEditBtn').style.display = 'inline-flex';
}

function resetForm(clearTitle = true) {
  form.reset();
  $('recipeId').value = '';
  $('servings').value = 4;
  selectedPhotos = [];
  $('photoPreview').innerHTML = '';
  $('deleteEditBtn').style.display = 'none';
  if (clearTitle) $('formTitle').textContent = 'Ajouter une recette';
}

function renderPhotoPreview() {
  $('photoPreview').className = 'photo-edit-grid';
  $('photoPreview').innerHTML = selectedPhotos.map((src, index) => `
    <div class="photo-edit">
      <img src="${src}" alt="Photo de recette ${index + 1}">
      <button type="button" class="${index === 0 ? 'main-photo' : 'ghost'}" data-main-photo="${index}">${index === 0 ? 'Photo principale' : 'Définir principale'}</button>
      <button type="button" class="ghost" data-remove-photo="${index}">Supprimer</button>
    </div>`).join('');
}

function visibleRecipes() {
  const query = $('search').value.toLowerCase();
  const type = $('filterType').value;
  const sortBy = $('sortBy').value;
  const visible = recipes.filter((recipe) => {
    const haystack = [recipe.name, recipe.type, recipe.time, recipe.steps, ...recipe.ingredients].join(' ').toLowerCase();
    return haystack.includes(query) && (type === 'all' || recipe.type === type);
  });
  return visible.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'type' ? a.type.localeCompare(b.type) : b.updatedAt.localeCompare(a.updatedAt));
}

function render() {
  const list = $('recipeList');
  list.className = viewMode === 'list' ? 'cards list' : 'cards';
  list.innerHTML = '';
  const visible = visibleRecipes();
  if (!visible.length) {
    list.innerHTML = '<p class="panel muted" style="padding:1rem">Aucune recette pour le moment.</p>';
    return;
  }
  visible.forEach((recipe) => list.appendChild(cardFor(recipe)));
}

function cardFor(recipe) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.card');
  const cover = node.querySelector('.cover');
  card.addEventListener('click', () => openDetail(recipe.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openDetail(recipe.id);
  });
  if (recipe.photos?.[0]) cover.innerHTML = `<img src="${recipe.photos[0]}" alt="${recipe.name}">`;
  else cover.textContent = 'Aucune photo';
  cover.addEventListener('click', (event) => {
    event.stopPropagation();
    if (recipe.photos?.[0]) openImage(recipe.photos[0]);
  });
  node.querySelector('.badge').textContent = recipe.type;
  node.querySelector('h3').textContent = recipe.name;
  node.querySelector('.meta').textContent = `${recipe.time || 'Temps libre'} · base ${recipe.servings} personne(s)`;
  node.querySelector('.steps').textContent = recipe.steps;
  const target = node.querySelector('.targetServings');
  const list = node.querySelector('.ingredientList');
  const drawIngredients = () => {
    list.innerHTML = scaledIngredients(recipe, target.value).map((line) => `<li>${line}</li>`).join('');
  };
  target.value = recipe.servings;
  target.addEventListener('input', drawIngredients);
  target.addEventListener('click', (event) => event.stopPropagation());
  drawIngredients();
  node.querySelector('.photos').innerHTML = (recipe.photos || []).map((src) => `<img src="${src}" alt="Photo de ${recipe.name}">`).join('');
  node.querySelectorAll('.photos img').forEach((img) => img.addEventListener('click', (event) => {
    event.stopPropagation();
    openImage(img.src);
  }));
  return card;
}

function wireButton(button, action) {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    action();
  });
}

function editRecipe(id) {
  const recipe = recipes.find((item) => item.id === id);
  if (recipe) openRecipeDialog(recipe);
}

async function deleteRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  const response = await fetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    alert('Impossible de supprimer la recette sur le serveur.');
    return;
  }
  recipes = recipes.filter((recipe) => recipe.id !== id);
  render();
  closeDialog('detailDialog');
}


function openDetail(id) {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) return;
  $('detailContent').innerHTML = detailMarkup(recipe);
  $('detailContent').querySelector('[data-close]').addEventListener('click', () => $('detailDialog').close());
  $('detailContent').querySelector('[data-edit]').addEventListener('click', () => editRecipe(id));
  $('detailContent').querySelector('[data-pdf]').addEventListener('click', () => exportRecipePdf(id));
  $('detailContent').querySelectorAll('img').forEach((img) => img.addEventListener('click', () => openImage(img.src)));
  $('detailDialog').showModal();
}

function detailMarkup(recipe) {
  const photos = recipe.photos || [];
  return `
    <div class="modal-head"><div><span class="badge">${recipe.type}</span><h2>${recipe.name}</h2><p class="meta">${recipe.time || 'Temps libre'} · base ${recipe.servings} personne(s)</p></div><button class="ghost icon" data-close type="button">×</button></div>
    <div class="detail-top">
      <div class="detail-cover">${photos[0] ? `<img src="${photos[0]}" alt="${recipe.name}">` : '<p class="panel muted" style="padding:1rem">Aucune photo</p>'}</div>
      <div><div class="detail-actions"><button data-edit type="button">Modifier</button><button data-pdf class="ghost" type="button">Exporter en PDF</button></div><p class="steps">${recipe.steps}</p></div>
    </div>
    <div class="detail-grid"><section><h3>Ingrédients</h3><ul>${scaledIngredients(recipe).map((line) => `<li>${line}</li>`).join('')}</ul></section><section><h3>Photos</h3><div class="photo-grid">${photos.map((src) => `<img src="${src}" alt="Photo de ${recipe.name}">`).join('')}</div></section></div>`;
}

function openImage(src) {
  $('largeImage').src = src;
  $('imageDialog').showModal();
}

function downloadDatabase() {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'recipes-db.json' });
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportRecipePdf(id) {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) return;
  const popup = window.open('', '_blank');
  if (!popup) {
    alert('Autorisez les popups pour exporter la recette en PDF.');
    return;
  }
  popup.document.write(pdfDocument(recipe));
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}

function pdfDocument(recipe) {
  const photos = recipe.photos || [];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${recipe.name}</title><style>
    @page { margin: 16mm; } body { font-family: Arial, sans-serif; color: #142032; } h1 { color: #0b6f66; margin-bottom: 0; } .meta { color: #607084; } .hero { width: 100%; max-height: 100mm; object-fit: cover; border-radius: 8px; margin: 12px 0; } .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 18px; } li { margin: 5px 0; } .steps { white-space: pre-wrap; line-height: 1.45; } .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; } .photos img { width: 100%; height: 42mm; object-fit: cover; border-radius: 6px; } @media print { button { display: none; } }
  </style></head><body><button onclick="print()">Imprimer / enregistrer en PDF</button><h1>${recipe.name}</h1><p class="meta">${recipe.type} · ${recipe.time || 'Temps libre'} · ${recipe.servings} personne(s)</p>${photos[0] ? `<img class="hero" src="${photos[0]}" alt="${recipe.name}">` : ''}<div class="grid"><section><h2>Ingrédients</h2><ul>${scaledIngredients(recipe).map((line) => `<li>${line}</li>`).join('')}</ul></section><section><h2>Préparation</h2><p class="steps">${recipe.steps}</p></section></div>${photos.length > 1 ? `<h2>Photos</h2><div class="photos">${photos.slice(1).map((src) => `<img src="${src}" alt="Photo de ${recipe.name}">`).join('')}</div>` : ''}</body></html>`;
}

fillSelect($('type'));
fillSelect($('filterType'), true);
['search', 'filterType', 'sortBy'].forEach((id) => $(id).addEventListener('input', render));
$('openRecipeBtn').addEventListener('click', () => openRecipeDialog());
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('resetBtn').addEventListener('click', () => resetForm());
$('exportBtn').addEventListener('click', downloadDatabase);
$('cardViewBtn').addEventListener('click', () => setView('cards'));
$('listViewBtn').addEventListener('click', () => setView('list'));
$('themeSelect').addEventListener('change', (event) => setTheme(event.target.value));
$('deleteEditBtn').addEventListener('click', async () => {
  const id = $('recipeId').value;
  if (!id) return;
  await deleteRecipe(id);
  closeDialog('recipeDialog');
  resetForm();
});
$('photoPreview').addEventListener('click', (event) => {
  const removeIndex = event.target.dataset.removePhoto;
  const mainIndex = event.target.dataset.mainPhoto;
  if (removeIndex !== undefined) {
    selectedPhotos.splice(Number(removeIndex), 1);
    renderPhotoPreview();
  }
  if (mainIndex !== undefined) {
    const [photo] = selectedPhotos.splice(Number(mainIndex), 1);
    selectedPhotos.unshift(photo);
    renderPhotoPreview();
  }
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
$('importInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  recipes = await replaceServerDatabase(JSON.parse(await file.text()));
  render();
});
$('photos').addEventListener('change', async (event) => {
  const addedPhotos = await Promise.all([...event.target.files].map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  })));
  selectedPhotos = [...selectedPhotos, ...addedPhotos];
  event.target.value = '';
  renderPhotoPreview();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const recipe = await saveRecipeToServer(recipeFromForm());
  const index = recipes.findIndex((item) => item.id === recipe.id);
  if (index >= 0) recipes[index] = recipe;
  else recipes.unshift(recipe);
  resetForm();
  $('recipeDialog').close();
  render();
});

function setView(nextMode) {
  viewMode = nextMode;
  $('cardViewBtn').classList.toggle('active', nextMode === 'cards');
  $('listViewBtn').classList.toggle('active', nextMode === 'list');
  render();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog?.open) dialog.close();
}

function setTheme(theme) {
  document.body.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-orange', 'theme-slate', 'theme-light', 'theme-cream');
  if (theme && theme !== 'network') document.body.classList.add(`theme-${theme}`);
  $('themeSelect').value = theme || 'network';
  localStorage.setItem(STORAGE_KEY, theme || 'network');
}

setTheme(localStorage.getItem(STORAGE_KEY) || 'network');
setView(viewMode);
loadRecipes();
