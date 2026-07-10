const API_URL = '/api/data';
const THEME_KEY = 'nethome-manager-theme';
const state = { networks: [], devices: [] };
let viewMode = 'tiles';

const $ = (id) => document.getElementById(id);
const normalize = (value) => (value || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function loadState() {
  const response = await fetch(API_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Impossible de charger le fichier de données serveur.');
  const data = await response.json();
  state.networks = Array.isArray(data.networks) ? data.networks : [];
  state.devices = Array.isArray(data.devices) ? data.devices : [];
}
async function saveState() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state)
  });
  if (!response.ok) throw new Error('Impossible d’enregistrer le fichier de données serveur.');
  render();
}
function handleStorageError(error) {
  alert(`${error.message}
Vérifiez que le serveur Node est lancé et que data/network-data.json est accessible en écriture.`);
}
function networkName(id) { return state.networks.find((n) => n.id === id)?.name || 'Sans réseau'; }
function ipValue(ip) { return (ip || '').split('.').reduce((acc, part) => (acc * 256) + Number(part || 0), 0); }
function statusClass(status) { return `status-${normalize(status).replace(/[^a-z0-9]+/g, '-')}`; }
function ipModeValue(device) { if (device.ipMode) return device.ipMode; if (device.staticIp) return 'fixed'; if (device.dhcp) return 'dhcp'; return 'none'; }
function ipModeLabel(device) { return { none: 'Non défini', fixed: 'IP Fixe', dhcp: 'DHCP', reservation: 'Statique (Réservation DHCP)' }[ipModeValue(device)] || 'Non défini'; }

function render() { renderSelects(); renderInventory(); }
function renderSelects() {
  const networkOptions = state.networks.map((n) => `<option value="${n.id}">${n.name} (${n.cidr})</option>`).join('');
  $('deviceNetwork').innerHTML = networkOptions || '<option value="">Ajoutez d’abord un réseau</option>';
  $('networkFilter').innerHTML = '<option value="all">Tous les réseaux</option>' + networkOptions;
  const types = [...new Set(state.devices.map((d) => d.type).filter(Boolean))].sort();
  $('typeFilter').innerHTML = '<option value="all">Tous les types</option>' + types.map((t) => `<option>${t}</option>`).join('');
}
function filteredDevices() {
  const query = normalize($('searchInput').value);
  const network = $('networkFilter').value;
  const type = $('typeFilter').value;
  const sort = $('sortSelect').value;
  return state.devices.filter((d) => {
    const haystack = normalize([d.name, d.type, d.ip, d.mac, d.status, d.location, d.login, d.password, d.url, d.notes, networkName(d.networkId)].join(' '));
    return (!query || haystack.includes(query)) && (network === 'all' || d.networkId === network) && (type === 'all' || d.type === type);
  }).sort((a, b) => {
    if (sort === 'ip') return ipValue(a.ip) - ipValue(b.ip);
    if (sort === 'network') return networkName(a.networkId).localeCompare(networkName(b.networkId));
    return (a[sort] || '').localeCompare(b[sort] || '', 'fr');
  });
}
function renderInventory() {
  const devices = filteredDevices();
  const container = $('inventory');
  container.className = viewMode === 'list' ? 'cards list' : 'cards';
  if (!devices.length) { container.innerHTML = emptyState(); return; }
  container.innerHTML = viewMode === 'list' ? renderTable(devices) : devices.map(renderCard).join('');
}
function renderCard(d) {
  return `<article class="device-card" role="button" tabindex="0" onclick="showDeviceDetails('${d.id}')" onkeydown="handleCardKey(event, '${d.id}')"><div class="card-top"><span class="badge">${networkName(d.networkId)}</span><span class="badge ${statusClass(d.status)}">${d.status}</span></div><h3>${d.name}</h3><p class="device-meta"><strong>${d.type}</strong> · ${d.location || 'emplacement non défini'}</p><dl class="mini-specs"><div><dt>IP</dt><dd>${d.ip || '-'}</dd></div><div><dt>Mode</dt><dd>${ipModeLabel(d)}</dd></div><div><dt>MAC</dt><dd>${d.mac || '-'}</dd></div><div><dt>Login</dt><dd>${d.login || '-'}</dd></div></dl>${d.url ? `<a class="manage-link" href="${d.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ouvrir l’interface de gestion</a>` : ''}${d.notes ? `<p class="notes">${d.notes}</p>` : ''}<div class="card-actions"><button onclick="event.stopPropagation(); editDevice('${d.id}')">Éditer</button><button class="danger" onclick="event.stopPropagation(); deleteDevice('${d.id}')">Supprimer</button></div></article>`;
}
function renderTable(devices) {
  const rows = devices.map((d) => `<tr class="clickable-row" onclick="showDeviceDetails('${d.id}')"><td>${d.name}</td><td>${networkName(d.networkId)}</td><td>${d.type}</td><td>${d.ip || '-'}</td><td>${d.mac || '-'}</td><td>${d.login || '-'}</td><td>${d.password || '-'}</td><td>${ipModeLabel(d)}</td><td>${d.url ? `<a href="${d.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Gestion</a>` : '-'}</td><td><span class="badge ${statusClass(d.status)}">${d.status}</span></td><td><button onclick="event.stopPropagation(); editDevice('${d.id}')">Éditer</button> <button class="danger" onclick="event.stopPropagation(); deleteDevice('${d.id}')">Supprimer</button></td></tr>`).join('');
  return `<table><thead><tr><th>Nom</th><th>Réseau</th><th>Type</th><th>IP</th><th>MAC</th><th>Login</th><th>Mot de passe</th><th>Adressage</th><th>URL</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function emptyState() { return $('emptyStateTemplate').innerHTML; }

$('networkForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('networkId').value || uid();
  const record = { id, name: $('networkName').value.trim(), cidr: $('networkCidr').value.trim(), zone: $('networkZone').value.trim(), notes: $('networkNotes').value.trim() };
  const index = state.networks.findIndex((n) => n.id === id);
  index >= 0 ? state.networks.splice(index, 1, record) : state.networks.push(record);
  event.target.reset(); $('networkId').value = ''; closeDialog('networkDialog'); void saveState().catch(handleStorageError);
});
$('deviceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('deviceId').value || uid();
  const ipMode = $('deviceIpMode').value;
  const record = { id, networkId: $('deviceNetwork').value, name: $('deviceName').value.trim(), type: $('deviceType').value, ip: $('deviceIp').value.trim(), mac: $('deviceMac').value.trim().toUpperCase(), status: $('deviceStatus').value, location: $('deviceLocation').value.trim(), login: $('deviceLogin').value.trim(), password: $('devicePassword').value, ipMode, staticIp: ipMode === 'fixed', dhcp: ipMode === 'dhcp', url: $('deviceUrl').value.trim(), notes: $('deviceNotes').value.trim() };
  const index = state.devices.findIndex((d) => d.id === id);
  index >= 0 ? state.devices.splice(index, 1, record) : state.devices.push(record);
  event.target.reset(); $('deviceId').value = ''; closeDialog('deviceDialog'); void saveState().catch(handleStorageError);
});
window.editNetwork = (id) => { const n = state.networks.find((item) => item.id === id); if (!n) return; $('networkId').value = n.id; $('networkName').value = n.name; $('networkCidr').value = n.cidr; $('networkZone').value = n.zone; $('networkNotes').value = n.notes; openDialog('networkDialog'); };
window.deleteNetwork = (id) => { if (state.devices.some((d) => d.networkId === id)) { alert('Supprimez ou déplacez d’abord les périphériques de ce réseau.'); return; } if (confirm('Supprimer ce réseau ?')) { state.networks = state.networks.filter((n) => n.id !== id); void saveState().catch(handleStorageError); } };
window.editDevice = (id) => { const d = state.devices.find((item) => item.id === id); if (!d) return; $('deviceId').value = d.id; $('deviceNetwork').value = d.networkId; $('deviceName').value = d.name; $('deviceType').value = d.type; $('deviceIp').value = d.ip || ''; $('deviceMac').value = d.mac || ''; $('deviceStatus').value = d.status; $('deviceLocation').value = d.location || ''; $('deviceLogin').value = d.login || ''; $('devicePassword').value = d.password || ''; $('deviceIpMode').value = ipModeValue(d); $('deviceUrl').value = d.url || ''; $('deviceNotes').value = d.notes || ''; openDialog('deviceDialog'); };
window.deleteDevice = (id) => { if (confirm('Supprimer ce périphérique ?')) { state.devices = state.devices.filter((d) => d.id !== id); void saveState().catch(handleStorageError); } };
window.handleCardKey = (event, id) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDeviceDetails(id); } };
window.showDeviceDetails = (id) => { const d = state.devices.find((item) => item.id === id); if (!d) return; $('deviceDetails').innerHTML = renderDetails(d); openDialog('deviceDetailsDialog'); };
function renderDetails(d) { const fields = [['Nom', d.name], ['Réseau', networkName(d.networkId)], ['Type', d.type], ['Statut', d.status], ['Emplacement', d.location], ['Adresse IP', d.ip], ['Mode IP', ipModeLabel(d)], ['Adresse MAC', d.mac], ['Login', d.login], ['Mot de passe', d.password], ['URL de gestion', d.url ? `<a href="${d.url}" target="_blank" rel="noopener">${d.url}</a>` : ''], ['Notes', d.notes]]; return fields.map(([label, value]) => `<div class="detail-row"><span>${label}</span><strong>${value || '-'}</strong></div>`).join(''); }
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }
$('openNetworkModal').onclick = () => { $('networkForm').reset(); $('networkId').value = ''; openDialog('networkDialog'); };
$('openDeviceModal').onclick = () => { $('deviceForm').reset(); $('deviceId').value = ''; openDialog('deviceDialog'); };
$('closeNetworkModal').onclick = () => closeDialog('networkDialog');
$('closeDeviceModal').onclick = () => closeDialog('deviceDialog');
$('closeDetailsModal').onclick = () => closeDialog('deviceDetailsDialog');
$('resetNetwork').onclick = () => { $('networkForm').reset(); $('networkId').value = ''; };
$('resetDevice').onclick = () => { $('deviceForm').reset(); $('deviceId').value = ''; };
$('deviceIp').addEventListener('input', (event) => { event.target.value = event.target.value.replace(/[^0-9.]/g, '').replace(/\.{2,}/g, '.').slice(0, 15); });
$('deviceMac').addEventListener('input', (event) => { const clean = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 12).toUpperCase(); event.target.value = clean.match(/.{1,2}/g)?.join(':') || ''; });
function applyTheme(theme) { document.body.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); $('themeSelect').value = theme; }
$('themeSelect').addEventListener('change', (event) => applyTheme(event.target.value));
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
['searchInput','networkFilter','typeFilter','sortSelect'].forEach((id) => $(id).addEventListener('input', renderInventory));
$('tileView').onclick = () => { viewMode = 'tiles'; $('tileView').classList.add('active'); $('listView').classList.remove('active'); renderInventory(); };
$('listView').onclick = () => { viewMode = 'list'; $('listView').classList.add('active'); $('tileView').classList.remove('active'); renderInventory(); };
$('exportData').onclick = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'nethome-manager.json' }); a.click(); URL.revokeObjectURL(a.href); };
$('importData').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; const imported = JSON.parse(await file.text()); state.networks = imported.networks || []; state.devices = imported.devices || []; void saveState().catch(handleStorageError); };
loadState().then(render).catch(handleStorageError);
