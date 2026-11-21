/**
 * ============================================================
 * MASTER DATA: Parties, Tax Rates, PPh 21 TER, Tax Brackets
 * All rates live in sheets, so a regulation change = edit a cell, not the code.
 * Existing sheets are never overwritten by Install / Update System.
 * ============================================================
 */

const MASTER = { PARTIES: 'Parties', TAX_RATES: 'Tax Rates', TER: 'PPh21 TER', BRACKETS: 'Tax Brackets' };
const PARTY_HEADERS = ['Party ID', 'Name', 'Type', 'Tax ID (NPWP/NIK)', 'Address', 'Payment Terms (days)', 'Status', 'Phone'];
const TAX_RATE_HEADERS = ['Tax', 'Code', 'Object', 'Method', 'Rate (%)', 'Base Factor',
  'No-NPWP Multiplier', 'Add-on', 'Bracket', 'Notes', 'Status'];
const TER_HEADERS = ['Category', 'Above', 'Up To', 'Rate (%)'];
const BRACKET_HEADERS = ['Name', 'Above', 'Up To', 'Rate (%)'];

/* Method: RATE = rate x base factor x amount | TER = table lookup | TIERED = Tax Brackets | MANUAL = you enter it.
   Add-on = Yes means the importer pays it on top (PPh 22 on import). Rates are suggestions: verify before posting. */
const TAX_RATE_SEED = [
  ['PPH21', 'EMP_TER', 'Permanent employee, monthly (TER)', 'TER', '', 1, 1.2, '', '',
    'Every month except the last. Include allowances, THR and bonus paid that month. Category follows the PTKP status.', 'Active'],
  ['PPH21', 'EMP_LAST', 'Permanent employee, last month of the year (Article 17)', 'MANUAL', '', 1, 1.2, '', '',
    'Work out the annual tax with Article 17 rates, deduct PPh 21 already withheld, then enter the amount.', 'Active'],
  ['PPH21', 'DAILY', 'Daily or piece-rate worker', 'RATE', 0.5, 1, 1.2, '', '',
    '0% if daily pay is Rp 450,000 or less. Article 17 applies above Rp 2,500,000 per day. Edit the rate if needed.', 'Active'],
  ['PPH21', 'SEVERANCE', 'Severance pay (final)', 'TIERED', '', 1, '', '', 'SEVERANCE',
    'Progressive final tiers (PP 68/2009). Payments within 2 calendar years count together.', 'Active'],
  ['PPH21', 'PENSION_LUMPSUM', 'Pension, THT or JHT paid in one go (final)', 'TIERED', '', 1, '', '', 'PENSION_LUMPSUM',
    'Final tiers (PP 68/2009). Payments within 2 calendar years count together.', 'Active'],
  ['PPH21', 'NONEMP', 'Freelancer, expert, or other non-employee', 'RATE', 5, 0.5, 1.2, '', '',
    'Taxable base is 50% of gross. 5% fits the first Rp 60 million of the year. Use Other rate once cumulative income is higher.', 'Active'],
  ['PPH21', 'OTHER_21', 'Other PPh 21', 'MANUAL', '', 1, '', '', '', 'Enter the rate or the amount from your own calculation.', 'Active'],
  ['PPH22', 'IMPORT_API', 'Import, with importer ID (API)', 'RATE', 2.5, 1, '', 'Yes', '',
    'Base is the import value (CIF plus import duty). Use the amount field if it differs from the purchase amount.', 'Active'],
  ['PPH22', 'IMPORT_NONAPI', 'Import, without API', 'RATE', 7.5, 1, '', 'Yes', '',
    'Base is the import value (CIF plus import duty). Use the amount field if it differs from the purchase amount.', 'Active'],
  ['PPH22', 'GOV_PURCHASE', 'Purchase by government, BUMN, or other designated withholding agent', 'RATE', 1.5, 1, 2, '', '',
    'Base is the purchase price excluding VAT.', 'Active'],
  ['PPH22', 'OTHER_22', 'Other PPh 22', 'MANUAL', '', 1, 2, '', '', 'Enter the rate or the amount.', 'Active'],
  ['PPH23', 'SERVICE_TECH', 'Technical services', 'RATE', 2, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'SERVICE_MGMT', 'Management services', 'RATE', 2, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'SERVICE_CONSULT', 'Consulting services', 'RATE', 2, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'SERVICE_OTHER', 'Other services listed under PPh 23', 'RATE', 2, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'RENT_ASSET', 'Rent of assets other than land and buildings', 'RATE', 2, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'ROYALTY', 'Royalty', 'RATE', 15, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'INTEREST', 'Interest', 'RATE', 15, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'PRIZE', 'Prizes and awards', 'RATE', 15, 1, 2, '', '', '', 'Active'],
  ['PPH23', 'OTHER_23', 'Other PPh 23', 'MANUAL', '', 1, 2, '', '', 'Enter the rate or the amount.', 'Active'],
  ['PPH42', 'RENT_LAND', 'Rent of land and/or buildings', 'RATE', 10, 1, '', '', '', 'Final tax.', 'Active'],
  ['PPH42', 'CONSTRUCTION', 'Construction services', 'MANUAL', '', 1, '', '', '',
    'Rate depends on the contractor classification and the type of work. Enter it.', 'Active'],
  ['PPH42', 'OTHER_42', 'Other PPh 4(2) final', 'MANUAL', '', 1, '', '', '', 'Enter the rate or the amount.', 'Active']
];

/* Monthly TER (PP 58/2023). [upper limit, rate %]. Last row has no upper limit. */
const TER_A = [[5400000,0],[5650000,0.25],[5950000,0.5],[6300000,0.75],[6750000,1],[7500000,1.25],[8550000,1.5],
  [9650000,1.75],[10050000,2],[10350000,2.25],[10700000,2.5],[11050000,3],[11600000,3.5],[12500000,4],[13750000,5],
  [15100000,6],[16950000,7],[19750000,8],[24150000,9],[26450000,10],[28000000,11],[30050000,12],[32400000,13],
  [35400000,14],[39100000,15],[43850000,16],[47800000,17],[51400000,18],[56300000,19],[62200000,20],[68600000,21],
  [77500000,22],[89000000,23],[103000000,24],[125000000,25],[157000000,26],[206000000,27],[337000000,28],
  [454000000,29],[550000000,30],[695000000,31],[910000000,32],[1400000000,33],[null,34]];
const TER_B = [[6200000,0],[6500000,0.25],[6850000,0.5],[7300000,0.75],[9200000,1],[10750000,1.5],[11250000,2],
  [11600000,2.5],[12600000,3],[13600000,4],[14950000,5],[16400000,6],[18450000,7],[21850000,8],[26000000,9],
  [27700000,10],[29350000,11],[31450000,12],[33950000,13],[37100000,14],[41100000,15],[45800000,16],[49500000,17],
  [53800000,18],[58500000,19],[64000000,20],[71000000,21],[80000000,22],[93000000,23],[109000000,24],[129000000,25],
  [163000000,26],[211000000,27],[374000000,28],[459000000,29],[555000000,30],[704000000,31],[957000000,32],
  [1405000000,33],[null,34]];
const TER_C = [[6600000,0],[6950000,0.25],[7350000,0.5],[7800000,0.75],[8850000,1],[9800000,1.25],[10950000,1.5],
  [11200000,1.75],[12050000,2],[12950000,3],[14150000,4],[15550000,5],[17050000,6],[19500000,7],[22700000,8],
  [26600000,9],[28100000,10],[30100000,11],[32600000,12],[35400000,13],[38900000,14],[43000000,15],[47400000,16],
  [51200000,17],[55800000,18],[60400000,19],[66700000,20],[74500000,21],[83200000,22],[95600000,23],[110000000,24],
  [134000000,25],[169000000,26],[221000000,27],[390000000,28],[463000000,29],[561000000,30],[709000000,31],
  [965000000,32],[1419000000,33],[null,34]];

/* Progressive tiers: [name, above, up to, rate %] */
const BRACKET_SEED = [
  ['ART17', 0, 60000000, 5], ['ART17', 60000000, 250000000, 15], ['ART17', 250000000, 500000000, 25],
  ['ART17', 500000000, 5000000000, 30], ['ART17', 5000000000, '', 35],
  ['SEVERANCE', 0, 50000000, 0], ['SEVERANCE', 50000000, 100000000, 5],
  ['SEVERANCE', 100000000, 500000000, 15], ['SEVERANCE', 500000000, '', 25],
  ['PENSION_LUMPSUM', 0, 50000000, 0], ['PENSION_LUMPSUM', 50000000, '', 5]
];

function terRows_() {
  const out = [];
  [['A', TER_A], ['B', TER_B], ['C', TER_C]].forEach(pair => {
    let prev = 0;
    pair[1].forEach(r => {
      out.push([pair[0], prev, r[0] == null ? '' : r[0], r[1]]);
      prev = r[0];
    });
  });
  return out;
}

/** Called by installSystem(). Creates only the sheets that are missing. */
function installMasterData_(ss, log) {
  const make = (name, headers, rows, widths) => {
    if (ss.getSheetByName(name)) { log.push(`${name}: kept as is.`); return; }
    const sh = ss.insertSheet(name);
    writeTable_(sh, headers, rows);
    styleHeader_(sh, headers.length);
    widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
    log.push(`Created sheet "${name}"${rows.length ? ` with ${rows.length} rows` : ''}.`);
  };
  make(MASTER.PARTIES, PARTY_HEADERS, [], [100, 260, 100, 170, 300, 150, 90, 150]);
  make(MASTER.TAX_RATES, TAX_RATE_HEADERS, TAX_RATE_SEED, [80, 150, 380, 90, 80, 90, 140, 70, 160, 520, 80]);
  make(MASTER.TER, TER_HEADERS, terRows_(), [90, 130, 130, 90]);
  make(MASTER.BRACKETS, BRACKET_HEADERS, BRACKET_SEED, [170, 130, 130, 90]);
  const parties = ss.getSheetByName(MASTER.PARTIES);
  if (parties) {
    ensurePartyHeaders_(parties);
    if (parties.getLastRow() <= 1) {
      parties.getRange(2, 3, 500, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(['Customer', 'Supplier', 'Both'], true).build());
      parties.getRange(2, 7, 500, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive'], true).build());
    }
  }
}

function ensurePartyHeaders_(sheet) {
  const width = Math.max(sheet.getLastColumn(), PARTY_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  PARTY_HEADERS.forEach((header, i) => {
    if (!String(current[i] || '').trim()) sheet.getRange(1, i + 1).setValue(header);
  });
  sheet.setColumnWidth(PARTY_HEADERS.length, 150);
}

function readSheetValues_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  return values.length > 1 ? values.slice(1) : [];
}

function readParties_() {
  return readSheetValues_(MASTER.PARTIES).filter(r => String(r[0]).trim() && String(r[1]).trim()).map(r => ({
    id: String(r[0]).trim(), name: String(r[1]).trim(), type: String(r[2]).trim() || 'Both',
    taxId: String(r[3]).trim(), address: String(r[4]).trim(), terms: Number(r[5]) || 0,
    active: String(r[6]).trim().toLowerCase() !== 'inactive', phone: String(r[7] || '').trim()
  }));
}

function getActiveParties_() {
  return readParties_().filter(p => p.active).map(p => ({ id: p.id, name: p.name, type: p.type, terms: p.terms, phone: p.phone }));
}

/** Rates, TER rows and tiers for the journal form. Primitives only. */
function getTaxConfig_() {
  const num = v => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v));
  const objects = readSheetValues_(MASTER.TAX_RATES)
    .filter(r => String(r[1]).trim() && String(r[10]).trim().toLowerCase() !== 'inactive')
    .map(r => ({
      tax: String(r[0]).trim(), code: String(r[1]).trim(), label: String(r[2]).trim(),
      method: String(r[3]).trim().toUpperCase() || 'RATE', rate: num(r[4]),
      factor: num(r[5]) === '' ? 1 : num(r[5]), mult: num(r[6]),
      addOn: String(r[7]).trim().toLowerCase() === 'yes', bracket: String(r[8]).trim(),
      notes: String(r[9]).trim()
    }));
  const ter = readSheetValues_(MASTER.TER).filter(r => String(r[0]).trim())
    .map(r => ({ cat: String(r[0]).trim().toUpperCase(), from: Number(r[1]) || 0, to: num(r[2]), rate: Number(r[3]) || 0 }))
    .sort((a, b) => a.cat === b.cat ? a.from - b.from : (a.cat < b.cat ? -1 : 1));
  const brackets = {};
  readSheetValues_(MASTER.BRACKETS).filter(r => String(r[0]).trim()).forEach(r => {
    const k = String(r[0]).trim();
    (brackets[k] = brackets[k] || []).push({ from: Number(r[1]) || 0, to: num(r[2]), rate: Number(r[3]) || 0 });
  });
  Object.keys(brackets).forEach(k => brackets[k].sort((a, b) => a.from - b.from));
  return { objects: objects, ter: ter, brackets: brackets };
}

function showPartiesManager() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile(indonesian ? 'PartiesManagerId' : 'PartiesManager').setWidth(940).setHeight(640),
    indonesian ? 'Kelola Pihak' : 'Parties (Customer or Supplier)'
  );
}

function nextPartyId_(all, type) {
  const prefix = type === 'Customer' ? 'CUS' : (type === 'Supplier' ? 'SUP' : 'BTH');
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let seq = 0;
  all.forEach(p => { const m = re.exec(p.id); if (m) seq = Math.max(seq, Number(m[1])); });
  return prefix + '-' + String(seq + 1).padStart(4, '0');
}

function partyFormData_(payload, all, excludeId) {
  const name = String(payload && payload.name || '').trim();
  if (!name) throw new Error('Enter the name.');
  const type = ['Customer', 'Supplier', 'Both'].includes(payload && payload.type) ? payload.type : 'Both';
  const terms = Number(payload && payload.terms) || 0;
  if (all.some(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId)) {
    throw new Error(`"${name}" already exists in the Parties sheet.`);
  }
  return {
    name: name, type: type, terms: terms,
    taxId: String(payload && payload.taxId || '').trim(),
    address: String(payload && payload.address || '').trim(),
    phone: String(payload && payload.phone || '').trim(),
    active: payload && payload.active === false ? false : true
  };
}

function partyRowNumber_(sheet, id) {
  const last = Math.max(sheet.getLastRow(), 1);
  if (last < 2 || !id) return -1;
  const values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) return i + 2;
  }
  return -1;
}

function partyIsReferenced_(party) {
  if (!party) return false;
  const journal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.JOURNAL);
  if (!journal || journal.getLastRow() < 2) return false;
  const name = party.name.toLowerCase();
  return [COL.party, COL.partyId].some(index => {
    const values = journal.getRange(2, index + 1, journal.getLastRow() - 1, 1).getDisplayValues();
    return values.some(r => {
      const value = String(r[0]).trim();
      return value === party.id || value.toLowerCase() === name;
    });
  });
}

function getPartiesForManager() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MASTER.PARTIES);
  if (!sheet) return [];
  ensurePartyHeaders_(sheet);
  return readParties_().map(p => ({
    id: p.id, name: p.name, type: p.type, taxId: p.taxId, address: p.address,
    phone: p.phone, terms: p.terms, active: p.active
  }));
}

/** Quick add from the journal form. Names must be unique. */
function addParty(payload) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const sheet = getRequiredSheet_(MASTER.PARTIES);
    ensurePartyHeaders_(sheet);
    const all = readParties_();
    const data = partyFormData_(payload, all, '');
    const id = nextPartyId_(all, data.type);
    const row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, 1, 1, PARTY_HEADERS.length).setValues([[
      id, data.name, data.type, data.taxId, data.address, data.terms, 'Active', data.phone
    ]]);
    SpreadsheetApp.flush();
    return { id: id, name: data.name, type: data.type, terms: data.terms, phone: data.phone };
  } finally {
    lock.releaseLock();
  }
}

function saveParty(payload) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const sheet = getRequiredSheet_(MASTER.PARTIES);
    ensurePartyHeaders_(sheet);
    const all = readParties_();
    const id = String(payload && payload.id || '').trim();
    const row = partyRowNumber_(sheet, id);
    if (id && row < 0) throw new Error('Party was not found.');
    const data = partyFormData_(payload, all, id);
    const partyId = id || nextPartyId_(all, data.type);
    sheet.getRange(row >= 0 ? row : Math.max(sheet.getLastRow() + 1, 2), 1, 1, PARTY_HEADERS.length).setValues([[
      partyId, data.name, data.type, data.taxId, data.address, data.terms,
      data.active ? 'Active' : 'Inactive', data.phone
    ]]);
    SpreadsheetApp.flush();
    return { id: partyId, name: data.name, type: data.type, terms: data.terms, phone: data.phone, active: data.active,
      message: tr_('Party saved.', 'Pihak tersimpan.') };
  } finally {
    lock.releaseLock();
  }
}

function deleteParty(id) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const partyId = String(id == null ? '' : id).trim();
    if (!partyId) throw new Error('Choose a party.');
    const sheet = getRequiredSheet_(MASTER.PARTIES);
    ensurePartyHeaders_(sheet);
    const row = partyRowNumber_(sheet, partyId);
    if (row < 0) throw new Error('Party was not found.');
    const party = readParties_().find(p => p.id === partyId);
    if (partyIsReferenced_(party)) {
      sheet.getRange(row, 7).setValue('Inactive');
      return { success: true, deactivated: true,
        message: tr_('Party is used in journals and has been set to Inactive.', 'Pihak digunakan dalam jurnal dan telah dinonaktifkan.') };
    }
    sheet.deleteRow(row);
    return { success: true, deactivated: false, message: tr_('Party deleted.', 'Pihak dihapus.') };
  } finally {
    lock.releaseLock();
  }
}
