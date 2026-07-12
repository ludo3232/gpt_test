const TYPES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Sauce', 'Autre'];
const STORAGE_KEY = 'recipe-book-db-v1';
let recipes = [];
let selectedPhotos = [];

const $ = (id) => document.getElementById(id);
const form = $('recipeForm');
const template = $('cardTemplate');

function fillSelect(select, includeAll = false) {
  select.innerHTML = includeAll ? '<option value="all">Tous les types</option>' : '';
  TYPES.forEach((type) => select.add(new Option(type, type)));
}

async function loadRecipes() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    recipes = JSON.parse(stored);
  } else {
    try {
      const response = await fetch('data/recipes-db.json');
      recipes = response.ok ? await response.json() : [];
    } catch {
      recipes = [];
    }
  }
  render();
}

function saveRecipes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

function parseIngredient(line, factor) {
  const match = line.trim().match(/^([0-9]+(?:[,.][0-9]+)?)(\s*)(.*)$/);
  if (!match) return line;
  const value = Number(match[1].replace(',', '.')) * factor;
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}${match[2]}${match[3]}`;
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

function resetForm() {
  form.reset();
  $('recipeId').value = '';
  $('servings').value = 4;
  selectedPhotos = [];
  $('photoPreview').innerHTML = '';
  $('formTitle').textContent = 'Ajouter une recette';
}

function renderPhotoPreview() {
  $('photoPreview').innerHTML = selectedPhotos.map((src) => `<img src="${src}" alt="Photo de recette">`).join('');
}

function render() {
  const query = $('search').value.toLowerCase();
  const type = $('filterType').value;
  const sortBy = $('sortBy').value;
  let visible = recipes.filter((recipe) => {
    const haystack = [recipe.name, recipe.type, recipe.time, recipe.steps, ...recipe.ingredients].join(' ').toLowerCase();
    return haystack.includes(query) && (type === 'all' || recipe.type === type);
  });
  visible.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'type' ? a.type.localeCompare(b.type) : b.updatedAt.localeCompare(a.updatedAt));
  $('recipeList').innerHTML = '';
  if (!visible.length) {
    $('recipeList').innerHTML = '<p class="panel muted" style="padding:1rem">Aucune recette pour le moment.</p>';
    return;
  }
  visible.forEach((recipe) => $('recipeList').appendChild(cardFor(recipe)));
}

function cardFor(recipe) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.card');
  const cover = node.querySelector('.cover');
  if (recipe.photos?.[0]) cover.innerHTML = `<img src="${recipe.photos[0]}" alt="${recipe.name}">`;
  else cover.textContent = 'Aucune photo';
  node.querySelector('.badge').textContent = recipe.type;
  node.querySelector('h3').textContent = recipe.name;
  node.querySelector('.meta').textContent = `${recipe.time || 'Temps libre'} · base ${recipe.servings} personne(s)`;
  node.querySelector('.steps').textContent = recipe.steps;
  const target = node.querySelector('.targetServings');
  const list = node.querySelector('.ingredientList');
  const drawIngredients = () => {
    const factor = Number(target.value || recipe.servings) / recipe.servings;
    list.innerHTML = recipe.ingredients.map((line) => `<li>${parseIngredient(line, factor)}</li>`).join('');
  };
  target.value = recipe.servings;
  target.addEventListener('input', drawIngredients);
  drawIngredients();
  node.querySelector('.photos').innerHTML = (recipe.photos || []).map((src) => `<img src="${src}" alt="Photo de ${recipe.name}">`).join('');
  node.querySelector('.edit').addEventListener('click', () => editRecipe(recipe.id));
  node.querySelector('.delete').addEventListener('click', () => deleteRecipe(recipe.id));
  return card;
}

function editRecipe(id) {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) return;
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
  scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  recipes = recipes.filter((recipe) => recipe.id !== id);
  saveRecipes();
  render();
}

function downloadDatabase() {
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'recipes-db.json' });
  link.click();
  URL.revokeObjectURL(link.href);
}

fillSelect($('type'));
fillSelect($('filterType'), true);
['search', 'filterType', 'sortBy'].forEach((id) => $(id).addEventListener('input', render));
$('resetBtn').addEventListener('click', resetForm);
$('exportBtn').addEventListener('click', downloadDatabase);
$('importInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  recipes = JSON.parse(await file.text());
  saveRecipes();
  render();
});
$('photos').addEventListener('change', async (event) => {
  selectedPhotos = await Promise.all([...event.target.files].map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  })));
  renderPhotoPreview();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const recipe = recipeFromForm();
  const index = recipes.findIndex((item) => item.id === recipe.id);
  if (index >= 0) recipes[index] = recipe;
  else recipes.unshift(recipe);
  saveRecipes();
  resetForm();
  render();
});

loadRecipes();
