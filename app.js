const STORAGE_KEY = 'nethome-manager-v1';
const THEME_KEY = 'nethome-manager-theme';
const state = loadState();
let viewMode = 'tiles';

const $ = (id) => document.getElementById(id);
const normalize = (value) => (value || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadState() {
  const fallback = { networks: [], devices: [] };
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || fallback; } catch { return fallback; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }

function seedDemoData() {
  state.networks = [
    { id: uid(), name: 'LAN Principal', cidr: '192.168.1.0/24', zone: 'Production', notes: 'Postes fixes, NAS et imprimantes.' },
    { id: uid(), name: 'IoT', cidr: '192.168.30.0/24', zone: 'Objets connectés', notes: 'Réseau isolé avec accès Internet uniquement.' },
    { id: uid(), name: 'Invités', cidr: '192.168.50.0/24', zone: 'Wi-Fi invité', notes: 'Bail DHCP court.' }
  ];
  const [lan, iot, guest] = state.networks;
  state.devices = [
    { id: uid(), networkId: lan.id, name: 'Routeur fibre', type: 'Routeur', ip: '192.168.1.1', mac: '00:11:22:33:44:55', status: 'Actif', location: 'Baie réseau', login: 'admin', password: 'admin-demo', staticIp: true, dhcp: false, url: 'https://192.168.1.1', notes: 'Passerelle et DNS local.' },
    { id: uid(), networkId: lan.id, name: 'NAS', type: 'Serveur', ip: '192.168.1.10', mac: 'AA:BB:CC:DD:EE:10', status: 'Actif', location: 'Baie réseau', login: 'nas-admin', password: 'demo-visible', staticIp: true, dhcp: false, url: 'https://192.168.1.10:5001', notes: 'SMB, sauvegardes, monitoring.' },
    { id: uid(), networkId: iot.id, name: 'Thermostat', type: 'IoT', ip: '192.168.30.21', mac: 'AA:BB:CC:30:00:21', status: 'À vérifier', location: 'Couloir', login: '', password: '', staticIp: false, dhcp: true, url: 'http://192.168.30.21', notes: 'Vérifier mises à jour firmware.' },
    { id: uid(), networkId: guest.id, name: 'Téléphone invité', type: 'Mobile', ip: '192.168.50.42', mac: 'AA:BB:CC:50:00:42', status: 'Réservé', location: 'Wi-Fi', login: '', password: '', staticIp: false, dhcp: true, url: '', notes: '' }
  ];
  saveState();
}

function networkName(id) { return state.networks.find((n) => n.id === id)?.name || 'Sans réseau'; }
function ipValue(ip) { return (ip || '').split('.').reduce((acc, part) => (acc * 256) + Number(part || 0), 0); }
function statusClass(status) { return `status-${normalize(status).replace(/[^a-z0-9]+/g, '-')}`; }

function render() { renderSelects(); renderSummary(); renderInventory(); }
function renderSelects() {
  const networkOptions = state.networks.map((n) => `<option value="${n.id}">${n.name} (${n.cidr})</option>`).join('');
  $('deviceNetwork').innerHTML = networkOptions || '<option value="">Ajoutez d’abord un réseau</option>';
  $('networkFilter').innerHTML = '<option value="all">Tous les réseaux</option>' + networkOptions;
  const types = [...new Set(state.devices.map((d) => d.type).filter(Boolean))].sort();
  $('typeFilter').innerHTML = '<option value="all">Tous les types</option>' + types.map((t) => `<option>${t}</option>`).join('');
}
function renderSummary() {
  const active = state.devices.filter((d) => d.status === 'Actif').length;
  const types = new Set(state.devices.map((d) => d.type)).size;
  $('summaryCards').innerHTML = [
    ['Réseaux', state.networks.length], ['Périphériques', state.devices.length], ['Actifs', active], ['Types', types]
  ].map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('overviewList').innerHTML = state.networks.map((n) => {
    const count = state.devices.filter((d) => d.networkId === n.id).length;
    return `<div class="overview-item"><strong>${n.name}</strong><br><span>${n.cidr} · ${n.zone || 'zone non définie'} · ${count} périphérique(s)</span><div class="card-actions"><button onclick="editNetwork('${n.id}')">Éditer</button><button class="danger" onclick="deleteNetwork('${n.id}')">Supprimer</button></div></div>`;
  }).join('') || emptyState();
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
  return `<article class="device-card"><span class="badge">${networkName(d.networkId)}</span><span class="badge ${statusClass(d.status)}">${d.status}</span><h3>${d.name}</h3><p><strong>${d.type}</strong> · ${d.location || 'emplacement non défini'}</p><p>IP: ${d.ip || '-'} · ${(d.staticIp ? 'IP Fixe' : '')}${(d.staticIp && d.dhcp ? ' / ' : '')}${(d.dhcp ? 'DHCP' : '') || 'adressage non défini'}<br>MAC: ${d.mac || '-'}</p><p>Login: ${d.login || '-'}<br>Mot de passe: ${d.password || '-'}</p>${d.url ? `<p><a href="${d.url}" target="_blank" rel="noopener">Ouvrir l’interface de gestion</a></p>` : ''}<p>${d.notes || ''}</p><div class="card-actions"><button onclick="editDevice('${d.id}')">Éditer</button><button class="danger" onclick="deleteDevice('${d.id}')">Supprimer</button></div></article>`;
}
function renderTable(devices) {
  const rows = devices.map((d) => `<tr><td>${d.name}</td><td>${networkName(d.networkId)}</td><td>${d.type}</td><td>${d.ip || '-'}</td><td>${d.mac || '-'}</td><td>${d.login || '-'}</td><td>${d.password || '-'}</td><td>${d.staticIp ? 'IP Fixe' : ''}${d.staticIp && d.dhcp ? ' / ' : ''}${d.dhcp ? 'DHCP' : ''}</td><td>${d.url ? `<a href="${d.url}" target="_blank" rel="noopener">Gestion</a>` : '-'}</td><td><span class="badge ${statusClass(d.status)}">${d.status}</span></td><td><button onclick="editDevice('${d.id}')">Éditer</button> <button class="danger" onclick="deleteDevice('${d.id}')">Supprimer</button></td></tr>`).join('');
  return `<table><thead><tr><th>Nom</th><th>Réseau</th><th>Type</th><th>IP</th><th>MAC</th><th>Login</th><th>Mot de passe</th><th>Adressage</th><th>URL</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function emptyState() { return $('emptyStateTemplate').innerHTML; }

$('networkForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('networkId').value || uid();
  const record = { id, name: $('networkName').value.trim(), cidr: $('networkCidr').value.trim(), zone: $('networkZone').value.trim(), notes: $('networkNotes').value.trim() };
  const index = state.networks.findIndex((n) => n.id === id);
  index >= 0 ? state.networks.splice(index, 1, record) : state.networks.push(record);
  event.target.reset(); $('networkId').value = ''; closeDialog('networkDialog'); saveState();
});
$('deviceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('deviceId').value || uid();
  const record = { id, networkId: $('deviceNetwork').value, name: $('deviceName').value.trim(), type: $('deviceType').value, ip: $('deviceIp').value.trim(), mac: $('deviceMac').value.trim().toUpperCase(), status: $('deviceStatus').value, location: $('deviceLocation').value.trim(), login: $('deviceLogin').value.trim(), password: $('devicePassword').value, staticIp: $('deviceStaticIp').checked, dhcp: $('deviceDhcp').checked, url: $('deviceUrl').value.trim(), notes: $('deviceNotes').value.trim() };
  const index = state.devices.findIndex((d) => d.id === id);
  index >= 0 ? state.devices.splice(index, 1, record) : state.devices.push(record);
  event.target.reset(); $('deviceId').value = ''; closeDialog('deviceDialog'); saveState();
});
window.editNetwork = (id) => { const n = state.networks.find((item) => item.id === id); if (!n) return; $('networkId').value = n.id; $('networkName').value = n.name; $('networkCidr').value = n.cidr; $('networkZone').value = n.zone; $('networkNotes').value = n.notes; openDialog('networkDialog'); };
window.deleteNetwork = (id) => { if (state.devices.some((d) => d.networkId === id)) { alert('Supprimez ou déplacez d’abord les périphériques de ce réseau.'); return; } if (confirm('Supprimer ce réseau ?')) { state.networks = state.networks.filter((n) => n.id !== id); saveState(); } };
window.editDevice = (id) => { const d = state.devices.find((item) => item.id === id); if (!d) return; $('deviceId').value = d.id; $('deviceNetwork').value = d.networkId; $('deviceName').value = d.name; $('deviceType').value = d.type; $('deviceIp').value = d.ip || ''; $('deviceMac').value = d.mac || ''; $('deviceStatus').value = d.status; $('deviceLocation').value = d.location || ''; $('deviceLogin').value = d.login || ''; $('devicePassword').value = d.password || ''; $('deviceStaticIp').checked = Boolean(d.staticIp); $('deviceDhcp').checked = Boolean(d.dhcp); $('deviceUrl').value = d.url || ''; $('deviceNotes').value = d.notes || ''; openDialog('deviceDialog'); };
window.deleteDevice = (id) => { if (confirm('Supprimer ce périphérique ?')) { state.devices = state.devices.filter((d) => d.id !== id); saveState(); } };
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }
$('openNetworkModal').onclick = () => { $('networkForm').reset(); $('networkId').value = ''; openDialog('networkDialog'); };
$('openDeviceModal').onclick = () => { $('deviceForm').reset(); $('deviceId').value = ''; openDialog('deviceDialog'); };
$('closeNetworkModal').onclick = () => closeDialog('networkDialog');
$('closeDeviceModal').onclick = () => closeDialog('deviceDialog');
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
$('seedDemo').onclick = seedDemoData;
$('exportData').onclick = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'nethome-manager.json' }); a.click(); URL.revokeObjectURL(a.href); };
$('importData').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; const imported = JSON.parse(await file.text()); state.networks = imported.networks || []; state.devices = imported.devices || []; saveState(); };
render();
