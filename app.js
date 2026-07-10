const API_URL = '/api/data';
const THEME_KEY = 'nethome-manager-theme';
const state = { networks: [], devices: [] };
let viewMode = 'tiles';
let tableSort = { key: 'name', direction: 'asc' };

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
function actionButtons(d) { return `<button onclick="event.stopPropagation(); editDevice('${d.id}')">Éditer</button> <button class="danger" onclick="event.stopPropagation(); deleteDevice('${d.id}')">Supprimer</button>`; }
const TABLE_COLUMNS = [
  { key: 'name', label: 'Nom', cell: (d) => `<strong>${d.name}</strong>`, value: (d) => d.name, className: 'name-cell' },
  { key: 'network', label: 'Réseau', cell: (d) => networkName(d.networkId), value: (d) => networkName(d.networkId) },
  { key: 'type', label: 'Type', cell: (d) => d.type || '-', value: (d) => d.type },
  { key: 'addressing', label: 'Adressage', cell: (d) => ipModeLabel(d), value: (d) => ipModeLabel(d) },
  { key: 'ip', label: 'IP', cell: (d) => d.ip || '-', value: (d) => ipValue(d.ip) },
  { key: 'mac', label: 'MAC', cell: (d) => d.mac || '-', value: (d) => d.mac },
  { key: 'login', label: 'Login', cell: (d) => d.login || '-', value: (d) => d.login },
  { key: 'password', label: 'Mot de passe', cell: (d) => d.password || '-', value: (d) => d.password },
  { key: 'url', label: 'URL', cell: (d) => d.url ? `<a href="${d.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Gestion</a>` : '-', value: (d) => d.url },
  { key: 'status', label: 'Statut', cell: (d) => `<span class="badge ${statusClass(d.status)}">${d.status}</span>`, value: (d) => d.status },
  { key: 'actions', label: 'Actions', cell: actionButtons, value: () => '' }
];
function sortDevicesForTable(devices) {
  const column = TABLE_COLUMNS.find((item) => item.key === tableSort.key) || TABLE_COLUMNS[0];
  const factor = tableSort.direction === 'asc' ? 1 : -1;
  return [...devices].sort((a, b) => String(column.value(a) ?? '').localeCompare(String(column.value(b) ?? ''), 'fr', { numeric: true }) * factor);
}
function render() { renderSelects(); renderInventory(); }
function renderSelects() {
  const networkOptions = state.networks.map((n) => `<option value="${n.id}">${n.name} (${n.cidr})</option>`).join('');
  $('deviceNetwork').innerHTML = networkOptions || '<option value="">Ajoutez d’abord un réseau</option>';
  $('networkFilter').innerHTML = '<option value="all">Tous les réseaux</option>' + networkOptions;
  const types = [...new Set(state.devices.map((d) => d.type).filter(Boolean))].sort();
  $('typeFilter').innerHTML = '<option value="all">Tous les types</option>' + types.map((t) => `<option>${t}</option>`).join('');
  renderNetworkManager();
}
function renderNetworkManager() {
  $('networkManagerList').innerHTML = state.networks.map((n) => {
    const count = state.devices.filter((d) => d.networkId === n.id).length;
    return `<div class="network-manager-item"><div><strong>${n.name}</strong><span>${n.cidr} · ${n.zone || 'zone non définie'} · ${count} appareil(s)</span></div><div class="card-actions"><button type="button" onclick="editNetwork('${n.id}')">Éditer</button><button type="button" class="danger" onclick="deleteNetwork('${n.id}')">Supprimer</button></div></div>`;
  }).join('') || '<div class="empty-state">Aucun réseau enregistré.</div>';
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
  const columns = TABLE_COLUMNS;
  const sortedDevices = sortDevicesForTable(devices);
  const headers = columns.map((column) => `<th><button class="sortable-header" onclick="sortTableBy('${column.key}')">${column.label}${tableSort.key === column.key ? ` <span>${tableSort.direction === 'asc' ? '▲' : '▼'}</span>` : ''}</button></th>`).join('');
  const rows = sortedDevices.map((d) => `<tr class="clickable-row" onclick="showDeviceDetails('${d.id}')">${columns.map((column) => `<td class="${column.className || ''}">${column.cell(d)}</td>`).join('')}</tr>`).join('');
  return `<table class="sortable-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}
function emptyState() { return $('emptyStateTemplate').innerHTML; }

$('networkForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('networkId').value || uid();
  const record = { id, name: $('networkName').value.trim(), cidr: $('networkCidr').value.trim(), zone: $('networkZone').value.trim(), notes: $('networkNotes').value.trim() };
  const index = state.networks.findIndex((n) => n.id === id);
  index >= 0 ? state.networks.splice(index, 1, record) : state.networks.push(record);
  event.target.reset(); $('networkId').value = ''; void saveState().catch(handleStorageError);
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
window.sortTableBy = (key) => { tableSort = { key, direction: tableSort.key === key && tableSort.direction === 'asc' ? 'desc' : 'asc' }; renderInventory(); };
window.handleCardKey = (event, id) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDeviceDetails(id); } };
window.showDeviceDetails = (id) => { const d = state.devices.find((item) => item.id === id); if (!d) return; $('deviceDetails').innerHTML = renderDetails(d); openDialog('deviceDetailsDialog'); };
function renderDetails(d) { const fields = [['Nom', d.name], ['Réseau', networkName(d.networkId)], ['Type', d.type], ['Statut', d.status], ['Emplacement', d.location], ['Adresse IP', d.ip], ['Mode IP', ipModeLabel(d)], ['Adresse MAC', d.mac], ['Login', d.login], ['Mot de passe', d.password], ['URL de gestion', d.url ? `<a href="${d.url}" target="_blank" rel="noopener">${d.url}</a>` : ''], ['Notes', d.notes]]; return fields.map(([label, value]) => `<div class="detail-row"><span>${label}</span><strong>${value || '-'}</strong></div>`).join(''); }
function openDialog(id) { if (!$(id).open) $(id).showModal(); }
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
const ALLOWED_THEMES = ['ocean', 'ocean-deep', 'ocean-lagoon', 'ocean-night', 'dark', 'light', 'midnight', 'forest', 'slate', 'sunset', 'highcontrast'];
function applyTheme(theme) { const safeTheme = ALLOWED_THEMES.includes(theme) ? theme : 'ocean'; document.body.dataset.theme = safeTheme; localStorage.setItem(THEME_KEY, safeTheme); $('themeSelect').value = safeTheme; }
$('themeSelect').addEventListener('change', (event) => applyTheme(event.target.value));
applyTheme(localStorage.getItem(THEME_KEY) || 'ocean');
['searchInput','networkFilter','typeFilter','sortSelect'].forEach((id) => $(id).addEventListener('input', renderInventory));
$('tileView').onclick = () => { viewMode = 'tiles'; $('tileView').classList.add('active'); $('listView').classList.remove('active'); renderInventory(); };
$('listView').onclick = () => { viewMode = 'list'; $('listView').classList.add('active'); $('tileView').classList.remove('active'); renderInventory(); };
$('exportData').onclick = () => downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'nethome-manager.json');
$('importData').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; const imported = JSON.parse(await file.text()); state.networks = imported.networks || []; state.devices = imported.devices || []; void saveState().catch(handleStorageError); };
$('exportPdf').onclick = exportPdf;

function downloadBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}
function printableValue(value) { return String(value ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function exportPdf() {
  const devices = sortDevicesForTable(filteredDevices());
  const columns = TABLE_COLUMNS.filter((column) => column.key !== 'actions');
  const rows = devices.map((d) => `<tr>${columns.map((column) => `<td>${printableValue(column.key === 'network' ? networkName(d.networkId) : column.key === 'addressing' ? ipModeLabel(d) : column.value(d) || '')}</td>`).join('')}</tr>`).join('');
  const table = `<table><thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const popup = window.open('', '_blank');
  if (!popup) { alert('Autorisez les popups pour exporter en PDF.'); return; }
  popup.document.write(`<!doctype html><html><head><title>Inventaire réseau</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{margin-top:0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#e5f6fb}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimer / enregistrer en PDF</button><h1>Inventaire réseau</h1>${table}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

loadState().then(render).catch(handleStorageError);
