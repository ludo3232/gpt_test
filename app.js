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
window.sortTableBy = (key) => { tableSort = { key, direction: tableSort.key === key && tableSort.direction === 'asc' ? 'desc' : 'asc' }; renderInventory(); };
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
const ALLOWED_THEMES = ['ocean', 'ocean-deep', 'ocean-lagoon', 'ocean-night', 'dark', 'light', 'midnight', 'forest', 'slate', 'sunset', 'highcontrast'];
function applyTheme(theme) { const safeTheme = ALLOWED_THEMES.includes(theme) ? theme : 'ocean'; document.body.dataset.theme = safeTheme; localStorage.setItem(THEME_KEY, safeTheme); $('themeSelect').value = safeTheme; }
$('themeSelect').addEventListener('change', (event) => applyTheme(event.target.value));
applyTheme(localStorage.getItem(THEME_KEY) || 'ocean');
['searchInput','networkFilter','typeFilter','sortSelect'].forEach((id) => $(id).addEventListener('input', renderInventory));
$('tileView').onclick = () => { viewMode = 'tiles'; $('tileView').classList.add('active'); $('listView').classList.remove('active'); renderInventory(); };
$('listView').onclick = () => { viewMode = 'list'; $('listView').classList.add('active'); $('tileView').classList.remove('active'); renderInventory(); };
$('exportData').onclick = () => downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'nethome-manager.json');
$('importData').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; const imported = JSON.parse(await file.text()); state.networks = imported.networks || []; state.devices = imported.devices || []; void saveState().catch(handleStorageError); };
$('exportXlsx').onclick = exportXlsx;
$('importXlsx').onchange = (event) => { const file = event.target.files[0]; if (file) void importXlsx(file).catch(handleStorageError); };

function downloadBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}
function xmlEscape(value) { return String(value ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function xmlUnescape(value) { return String(value ?? '').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
function cellRef(column, row) { let name = ''; let n = column + 1; while (n) { const r = (n - 1) % 26; name = String.fromCharCode(65 + r) + name; n = Math.floor((n - 1) / 26); } return `${name}${row}`; }
function worksheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  const xmlRows = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${cellRef(columnIndex, rowIndex + 1)}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}
function xlsxFiles() {
  const networkHeaders = ['Nom', 'CIDR', 'Zone', 'Notes'];
  const deviceHeaders = ['Réseau', 'Nom', 'Type', 'Mode IP', 'IP', 'MAC', 'Statut', 'Emplacement', 'Login', 'Mot de passe', 'URL', 'Notes'];
  const networkRows = state.networks.map((n) => [n.name || '', n.cidr || '', n.zone || '', n.notes || '']);
  const deviceRows = state.devices.map((d) => [networkName(d.networkId), d.name || '', d.type || '', ipModeLabel(d), d.ip || '', d.mac || '', d.status || '', d.location || '', d.login || '', d.password || '', d.url || '', d.notes || '']);
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Réseaux" sheetId="1" r:id="rId1"/><sheet name="Périphériques" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': worksheetXml(networkHeaders, networkRows),
    'xl/worksheets/sheet2.xml': worksheetXml(deviceHeaders, deviceRows)
  };
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function u16(value) { return [value & 255, value >> 8 & 255]; }
function u32(value) { return [value & 255, value >> 8 & 255, value >> 16 & 255, value >> 24 & 255]; }
function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array([0x50,0x4b,0x03,0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...data]);
    const central = new Uint8Array([0x50,0x4b,0x01,0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]);
    localParts.push(local); centralParts.push(central); offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([0x50,0x4b,0x05,0x06, ...u16(0), ...u16(0), ...u16(centralParts.length), ...u16(centralParts.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function exportXlsx() { downloadBlob(zipStore(xlsxFiles()), 'nethome-manager.xlsx'); }
function parseWorksheet(xml) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => [...row[1].matchAll(/<c[^>]*>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/c>/g)].map((cell) => xmlUnescape(cell[1])));
}
async function unzipStore(buffer) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const files = {};
  let offset = 0;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b || bytes[offset + 2] !== 0x03 || bytes[offset + 3] !== 0x04) break;
    const method = bytes[offset + 8] | (bytes[offset + 9] << 8);
    const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
    const nameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (method === 0) {
      files[name] = decoder.decode(compressed);
    } else if (method === 8 && 'DecompressionStream' in window) {
      files[name] = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    } else if (method === 8) {
      throw new Error('Import XLSX compressé non supporté par ce navigateur. Essayez avec un navigateur récent.');
    } else {
      throw new Error('Format XLSX non supporté.');
    }
    offset = dataStart + compressedSize;
  }
  return files;
}
function ipModeFromLabel(label) {
  const normalized = normalize(label);
  if (normalized.includes('reservation')) return 'reservation';
  if (normalized.includes('dhcp')) return 'dhcp';
  if (normalized.includes('fixe') || normalized.includes('fixed')) return 'fixed';
  return 'none';
}
async function importXlsx(file) {
  const files = await unzipStore(await file.arrayBuffer());
  const networkRows = parseWorksheet(files['xl/worksheets/sheet1.xml'] || '');
  const deviceRows = parseWorksheet(files['xl/worksheets/sheet2.xml'] || '');
  const toObjects = (rows) => rows.slice(1).map((row) => Object.fromEntries((rows[0] || []).map((key, index) => [key, row[index] || ''])));
  const importedNetworks = toObjects(networkRows).filter((n) => n.Nom || n.name).map((n) => ({ id: uid(), name: n.Nom || n.name || '', cidr: n.CIDR || n.cidr || '', zone: n.Zone || n.zone || '', notes: n.Notes || n.notes || '' }));
  const networkIdsByName = new Map(importedNetworks.map((n) => [normalize(n.name), n.id]));
  state.networks = importedNetworks;
  state.devices = toObjects(deviceRows).filter((d) => d.Nom || d.name).map((d) => {
    const networkNameFromSheet = d['Réseau'] || d.Reseau || d.network || '';
    const ipMode = ipModeFromLabel(d['Mode IP'] || d.ipMode || '');
    return { id: uid(), networkId: networkIdsByName.get(normalize(networkNameFromSheet)) || '', name: d.Nom || d.name || '', type: d.Type || d.type || '', ipMode, staticIp: ipMode === 'fixed', dhcp: ipMode === 'dhcp', ip: d.IP || d.ip || '', mac: d.MAC || d.mac || '', status: d.Statut || d.status || 'Actif', location: d.Emplacement || d.location || '', login: d.Login || d.login || '', password: d['Mot de passe'] || d.password || '', url: d.URL || d.url || '', notes: d.Notes || d.notes || '' };
  });
  await saveState();
}

loadState().then(render).catch(handleStorageError);
