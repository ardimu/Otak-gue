/**
 * ============================================================
 * BANK STATEMENT AND PETTY CASH IMPORT
 *
 * Flow: paste the statement into the "Bank Import" sheet, open
 * ACCOUNTING > Bank & Petty Cash Import, pick a profile, review, import.
 *
 * Banks change their file layout often. Nothing bank-specific is in this code:
 * the layout lives in the "Bank Profiles" sheet and the classification in "Bank Rules".
 * A new layout = a new row in Bank Profiles.
 *
 * Each transaction becomes one journal: Dr/Cr the bank (or petty cash) account against
 * the counter account. Imported as DRAFT (recommended) or POSTED. A fingerprint on every
 * row ("Import Key") stops the same transaction from being imported twice.
 * ============================================================
 */

const IMP = { PROFILES: 'Bank Profiles', RULES: 'Bank Rules', STAGING: 'Bank Import', LOG: 'Import Log' };

const PROFILE_HEADERS = ['Profile', 'Mode', 'Cash/Bank Account', 'Header Row', 'Date Column', 'Date Format',
  'Description Column', 'Reference Column', 'Account Column', 'Money Out Column', 'Money In Column',
  'Amount Column', 'Direction Column', 'Money Out Marker', 'Money In Marker', 'Balance Column',
  'Number Style', 'Status'];
const RULE_HEADERS = ['Keyword', 'Money', 'Account Code', 'Customer / Supplier', 'Status'];
const LOG_HEADERS = ['Batch ID', 'Imported At', 'Imported By', 'Profile', 'Cash/Bank Account',
  'Rows Imported', 'Rows Skipped', 'Status', 'First Date', 'Last Date'];

/* Columns can be a header text from the statement (Date) or a letter (A). "Money Out" = the bank's
   Debit column (money leaving the account). "Money In" = the bank's Credit column. Mode BANK or PETTY.
   These are generic examples. Copy a row and adjust it to your bank's file. */
const PROFILE_SEED = [
  ['Bank - separate Debit and Credit columns', 'BANK', '1102', 1, 'Date', 'AUTO', 'Description', 'Reference', '',
    'Debit', 'Credit', '', '', '', '', 'Balance', 'AUTO', 'Active'],
  ['Bank - one Amount column with DB/CR', 'BANK', '1102', 1, 'Date', 'AUTO', 'Description', 'Reference', '',
    '', '', 'Amount', '', 'DB|DEBIT|DR|D', 'CR|CREDIT|K|C', 'Balance', 'AUTO', 'Active'],
  ['Petty cash vouchers', 'PETTY', '1103', 1, 'Date', 'AUTO', 'Description', 'Voucher No', 'Account',
    '', '', 'Amount', '', '', '', '', 'AUTO', 'Active']
];
/* Keyword: words to look for in the description, separate alternatives with |. Money: In, Out, or Both. */
const RULE_SEED = [
  ['BIAYA ADM|ADMIN FEE|BIAYA ADMIN', 'Out', '6933', '', 'Active'],
  ['BUNGA|JASA GIRO|INTEREST', 'In', '7101', '', 'Active'],
  ['PAJAK BUNGA|PAJAK GIRO', 'Out', '9102', '', 'Active']
];

function installBankSheets_(ss, log) {
  const make = (name, headers, rows, widths) => {
    if (ss.getSheetByName(name)) { log.push(`${name}: kept as is.`); return; }
    const sh = ss.insertSheet(name);
    writeTable_(sh, headers, rows);
    styleHeader_(sh, headers.length);
    widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
    log.push(`Created sheet "${name}".`);
  };
  make(IMP.PROFILES, PROFILE_HEADERS, PROFILE_SEED, [260, 70, 140, 90, 120, 100, 150, 130, 120, 130, 120, 120, 130, 140, 140, 120, 110, 80]);
  make(IMP.RULES, RULE_HEADERS, RULE_SEED, [320, 70, 110, 200, 80]);
  make(IMP.LOG, LOG_HEADERS, [], [170, 150, 200, 260, 140, 110, 100, 90, 110, 110]);
  if (!ss.getSheetByName(IMP.STAGING)) {
    const sh = ss.insertSheet(IMP.STAGING);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    log.push('Created sheet "Bank Import". Paste statements there (Paste special > Values only).');
  }
}

function normHeader_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
}

function stagingPartyColumn_(sheet, values, headerIndex) {
  const header = values[headerIndex] || [];
  const found = header.findIndex(h => ['customer / supplier', 'customer/supplier', 'customer or supplier'].indexOf(normHeader_(h)) >= 0);
  if (found >= 0) return found;
  let last = 0;
  values.forEach(r => r.forEach((v, i) => { if (String(v == null ? '' : v).trim()) last = Math.max(last, i + 1); }));
  const col = last;
  sheet.getRange(headerIndex + 1, col + 1).setValue('Customer / Supplier');
  return col;
}

function bankPartyColumns_(header) {
  const h = header.map(normHeader_);
  const find = names => h.findIndex(x => names.indexOf(x) >= 0);
  return {
    both: find(['customer / supplier', 'customer/supplier', 'customer or supplier']),
    customer: find(['customer', 'customer name', 'nama customer', 'nama pelanggan']),
    supplier: find(['supplier', 'supplier name', 'nama supplier', 'nama pemasok'])
  };
}


/* ============================================================
   PARSING (pure functions)
============================================================ */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8,
  sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

function colIndex_(spec, header) {
  const s = String(spec == null ? '' : spec).trim();
  if (!s) return -1;
  const i = header.map(h => String(h).trim().toLowerCase()).indexOf(s.toLowerCase());
  if (i >= 0) return i;
  if (/^[A-Za-z]{1,2}$/.test(s)) {
    let n = 0;
    s.toUpperCase().split('').forEach(ch => { n = n * 26 + ch.charCodeAt(0) - 64; });
    return n - 1;
  }
  throw new Error(`Column "${s}" was not found. Headers in the sheet: ${header.filter(h => String(h).trim()).join(' | ') || '(none)'}`);
}

function validDate_(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

function parseDate_(v, fmt) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
  const t = String(v == null ? '' : v).trim();
  if (!t) return null;
  let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(t);
  if (m) return validDate_(+m[1], +m[2], +m[3]);
  const mdy = /^m+[\/\-. ]d+/i.test(String(fmt || ''));
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(t);
  if (m) return mdy ? validDate_(+m[3], +m[1], +m[2]) : validDate_(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[ \-]([A-Za-z]{3,9})[ \-,.]*(\d{2,4})/.exec(t);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return validDate_(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  return null;
}

/** Returns a number, null for a blank cell, or NaN for text that is not a number. */
function parseNumber_(v, style) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim().replace(/rp\.?/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s)) return NaN;
  let st = String(style || 'AUTO').toUpperCase();
  if (st === 'AUTO') {
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    const commas = (s.match(/,/g) || []).length, dots = (s.match(/\./g) || []).length;
    if (commas && dots) st = lc > ld ? 'ID' : 'EN';
    else if (commas) st = commas > 1 || s.length - lc - 1 === 3 ? 'EN' : 'ID';
    else if (dots) st = dots > 1 || s.length - ld - 1 === 3 ? 'ID' : 'EN';
    else st = 'EN';
  }
  s = st === 'ID' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

function markerList_(text, fallback) {
  return String(text || fallback).split('|').map(x => x.trim().toUpperCase()).filter(String);
}

/** Money out and money in for one statement row. Throws a readable error for bad rows. */
function readAmounts_(r, c, p) {
  const num = idx => {
    const n = parseNumber_(r[idx], p.numberStyle);
    if (n !== null && isNaN(n)) throw new Error('The amount "' + r[idx] + '" is not a number.');
    return n;
  };
  let out = 0, inn = 0;
  if (c.out >= 0 || c.in >= 0) {
    out = Math.abs(c.out >= 0 ? (num(c.out) || 0) : 0);
    inn = Math.abs(c.in >= 0 ? (num(c.in) || 0) : 0);
  } else {
    let text = String(r[c.amount] == null ? '' : r[c.amount]).trim();
    const outM = markerList_(p.outMarker, 'DB|DEBIT|DR|D'), inM = markerList_(p.inMarker, 'CR|CREDIT|K|C');
    let dir = '';
    const sfx = /\s*(DB|DR|CR|DEBIT|CREDIT|D|C|K)\s*$/i.exec(text);
    if (sfx && /\d/.test(text.slice(0, sfx.index))) { dir = sfx[1].toUpperCase(); text = text.slice(0, sfx.index); }
    if (c.dir >= 0) dir = String(r[c.dir] == null ? '' : r[c.dir]).trim().toUpperCase() || dir;
    const n = parseNumber_(text, p.numberStyle);
    if (n === null) return { out: 0, in: 0 };
    if (isNaN(n)) throw new Error('The amount "' + r[c.amount] + '" is not a number.');
    if (p.mode === 'PETTY') out = Math.abs(n);
    else if (dir) {
      if (outM.includes(dir)) out = Math.abs(n);
      else if (inM.includes(dir)) inn = Math.abs(n);
      else throw new Error('The direction "' + dir + '" is not listed in Money Out / Money In Marker.');
    } else if (n < 0) out = -n;
    else inn = n;
  }
  if (p.mode === 'PETTY' && inn > 0) throw new Error('A petty cash voucher must be an expense (positive amount).');
  if (out > 0 && inn > 0) throw new Error('The row has both a money out and a money in amount.');
  return { out: out, in: inn };
}

function findAccountByText_(text, coaMap) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  if (coaMap.has(t)) return coaMap.get(t);
  const low = t.toLowerCase();
  let found = null;
  coaMap.forEach(a => {
    if (!found && (low === a.name.toLowerCase() || low === (a.code + ' - ' + a.name).toLowerCase())) found = a;
  });
  return found;
}

function matchRule_(desc, isIn, rules) {
  const d = String(desc || '').toUpperCase();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.money === 'IN' && !isIn) continue;
    if (r.money === 'OUT' && isIn) continue;
    if (r.keywords.some(k => k && d.includes(k))) return r;
  }
  return null;
}

function isoDate_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function assertNotLockedWith_(date, lock) {
  if (lock && date.getTime() <= lock.getTime()) {
    throw new Error(`Journals dated on or before ${isoDate_(lock)} are locked. ` +
      'Use a later date, or change the Lock Date in ACCOUNTING > Setup > Company Profile & Settings > System.');
  }
}

/**
 * values = the staging sheet. ctx = { coaMap, rules, existing:Set, suspense }.
 * Returns { rows, skipped }. Rows with no readable date are counted as skipped (headers, totals, notes).
 */
function parseBankSheet_(values, p, ctx) {
  const header = p.headerRow > 0 && values[p.headerRow - 1] ? values[p.headerRow - 1].map(String) : [];
  const c = {
    date: colIndex_(p.dateCol, header), desc: colIndex_(p.descCol, header), ref: colIndex_(p.refCol, header),
    acct: colIndex_(p.acctCol, header), out: colIndex_(p.outCol, header), in: colIndex_(p.inCol, header),
    amount: colIndex_(p.amountCol, header), dir: colIndex_(p.dirCol, header), bal: colIndex_(p.balCol, header)
  };
  const partyCols = bankPartyColumns_(header);
  if (c.date < 0 || c.desc < 0) throw new Error('The profile needs a Date Column and a Description Column.');
  if (c.out < 0 && c.in < 0 && c.amount < 0) throw new Error('The profile needs Money Out / Money In columns, or an Amount column.');
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const seen = {};
  const rows = [];
  let skipped = 0;
  for (let i = p.headerRow; i < values.length; i++) {
    const r = values[i];
    if (r.every(x => String(x).trim() === '')) continue;
    const d = parseDate_(r[c.date], p.dateFormat);
    if (!d) { skipped++; continue; }
    const row = { n: i + 1, date: isoDate_(d), desc: clean(r[c.desc]), ref: c.ref >= 0 ? clean(r[c.ref]) : '',
      out: 0, in: 0, accountCode: '', accountName: '', party: '', status: 'NEW', note: '', key: '' };
    try {
      const a = readAmounts_(r, c, p);
      row.out = a.out; row.in = a.in;
    } catch (e) { row.status = 'ERROR'; row.note = e.message; rows.push(row); continue; }
    if (!row.out && !row.in) { skipped++; continue; }

    let acc = null, party = '';
    const fromSheet = (partyCols.both >= 0 ? clean(r[partyCols.both]) : '') ||
      (partyCols.customer >= 0 ? clean(r[partyCols.customer]) : '') ||
      (partyCols.supplier >= 0 ? clean(r[partyCols.supplier]) : '');
    if (c.acct >= 0) {
      acc = findAccountByText_(r[c.acct], ctx.coaMap);
      if (!acc && clean(r[c.acct])) row.note = 'Account "' + clean(r[c.acct]) + '" is not in the COA.';
    }
    if (!acc) {
      const m = matchRule_(row.desc, row.in > 0, ctx.rules);
      if (m) { acc = ctx.coaMap.get(m.account) || null; party = m.party; if (!acc) row.note = 'Rule account ' + m.account + ' is not in the COA.'; }
    }
    if (!acc && ctx.suspense) { acc = ctx.coaMap.get(ctx.suspense) || null; if (acc) row.note = 'Suspense account'; }
    if (acc) { row.accountCode = acc.code; row.accountName = acc.name; row.party = fromSheet || party; }

    const bal = c.bal >= 0 ? clean(r[c.bal]) : '';
    const base = [p.account, row.date, (row.in - row.out).toFixed(2), row.desc.toUpperCase().slice(0, 60), bal].join('|');
    seen[base] = (seen[base] || 0) + 1;
    row.key = base + '#' + seen[base];
    if (ctx.existing.has(row.key)) { row.status = 'DUPLICATE'; row.note = 'Already imported.'; }
    rows.push(row);
  }
  return { rows: rows, skipped: skipped };
}

/** Turns reviewed rows into Journal sheet rows (2 lines each). allocId(dateObj) returns a journal ID. */
function buildBankJournals_(rows, p, ctx, meta, allocId) {
  const sheetRows = [], errors = [];
  let imported = 0, missingPartyLines = 0;
  const bank = ctx.coaMap.get(p.account);
  rows.forEach(r => {
    try {
      const date = parseLocalDate_(r.date);
      const amt = Math.round((Number(r.in) || Number(r.out) || 0) * 100) / 100;
      const isIn = Number(r.in) > 0;
      if (!(amt > 0) || (Number(r.in) > 0 && Number(r.out) > 0)) throw new Error('The amount is not valid.');
      const counter = ctx.coaMap.get(String(r.accountCode));
      if (!counter || !counter.active) throw new Error('Choose an active counter account.');
      if (counter.code === bank.code) throw new Error('The counter account cannot be the bank account itself.');
      let party = null;
      if (r.party) {
        const name = String(r.party).trim();
        party = ctx.parties.get(name.toLowerCase()) || { id: '', name: name };
      }
      const lines = isIn ? [[bank, amt, 0], [counter, 0, amt]] : [[counter, amt, 0], [bank, 0, amt]];
      const bothCash = counter.group === 'Cash & Cash Equivalents' && p.mode === 'BANK';
      const jtype = bothCash ? 'Fund Transfer' : (isIn ? 'Cash Receipt Journal' : 'Cash Disbursement Journal');
      if (meta.status === STATUS.POSTED) {
        assertNotLockedWith_(date, ctx.lockDate);
        missingPartyLines += countMissingParty_(lines.map(l => ({ accountCode: l[0].code, partyId: party ? party.id : '' })), ctx.settings);
      }
      const id = allocId(date);
      lines.forEach((l, i) => {
        const o = {
          id: id, line: i + 1, date: date, period: date.getFullYear() * 100 + date.getMonth() + 1, type: jtype,
          status: meta.status, reference: r.ref || '', party: party ? party.name : '', source: p.mode === 'PETTY' ? 'Cash Voucher' : 'Bank Statement',
          description: String(r.desc || '').slice(0, 250), accountCode: l[0].code, accountName: l[0].name,
          debit: l[1] || '', credit: l[2] || '', entryMode: 'MANUAL', formState: '{}',
          partyId: party ? party.id : '', origin: p.mode === 'PETTY' ? 'PETTY' : 'BANK', batchId: meta.batchId, importKey: r.key || '',
          createdAt: meta.now, createdBy: meta.user, updatedAt: meta.now,
          postedAt: meta.status === STATUS.POSTED ? meta.now : '', postedBy: meta.status === STATUS.POSTED ? meta.user : ''
        };
        sheetRows.push(JOURNAL_FIELDS.map(f => (o[f[0]] === undefined ? '' : o[f[0]])));
      });
      imported++;
    } catch (e) {
      errors.push('Row ' + (r.n || '?') + ': ' + e.message);
    }
  });
  return { sheetRows: sheetRows, errors: errors, imported: imported, missingPartyLines: missingPartyLines };
}


/* ============================================================
   SHEET ACCESS
============================================================ */

function readImportProfile_(name) {
  const hit = readSheetValues_(IMP.PROFILES).find(r => String(r[0]).trim() === String(name).trim() &&
    String(r[17]).trim().toLowerCase() !== 'inactive');
  if (!hit) throw new Error(`Profile "${name}" was not found or is inactive in the Bank Profiles sheet.`);
  const s = i => String(hit[i] == null ? '' : hit[i]).trim();
  return {
    name: s(0), mode: s(1).toUpperCase() === 'PETTY' ? 'PETTY' : 'BANK', account: s(2), headerRow: Number(hit[3]) || 0,
    dateCol: s(4), dateFormat: s(5), descCol: s(6), refCol: s(7), acctCol: s(8), outCol: s(9), inCol: s(10),
    amountCol: s(11), dirCol: s(12), outMarker: s(13), inMarker: s(14), balCol: s(15), numberStyle: s(16) || 'AUTO'
  };
}

function readImportRules_() {
  return readSheetValues_(IMP.RULES)
    .filter(r => String(r[0]).trim() && String(r[2]).trim() && String(r[4]).trim().toLowerCase() !== 'inactive')
    .map(r => ({
      keywords: String(r[0]).split('|').map(k => k.trim().toUpperCase()).filter(String),
      money: ({ IN: 'IN', OUT: 'OUT' })[String(r[1]).trim().toUpperCase()] || 'BOTH',
      account: String(r[2]).trim(), party: String(r[3]).trim()
    }));
}

function importContext_() {
  const coaMap = getCoaMap_();
  const existing = new Set();
  const sh = getRequiredSheet_(SHEETS.JOURNAL);
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, COL.importKey + 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0]) existing.add(String(r[0])); });
  }
  const settings = readSettings_();
  const suspense = String(settings['Bank Suspense Account'] || '').trim();
  const parties = new Map(readParties_().filter(x => x.active).map(x => [x.name.toLowerCase(), x]));
  return { coaMap: coaMap, rules: readImportRules_(), existing: existing, suspense: suspense, parties: parties,
    settings: settings, lockDate: getLockDate_() };
}

function allocateIds_(sheet, settings) {
  const props = PropertiesService.getDocumentProperties();
  const mode = settings ? (String(settings.Mode || '').trim().toUpperCase() === 'LIVE' ? 'LIVE' : 'PRACTICE') : getCompanyMode_();
  const live = mode === 'LIVE';
  const maxByYear = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, COL.id + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(r => {
      const m = /^JV-(\d{4})-(\d+)$/.exec(String(r[0]).trim());
      if (m) maxByYear[m[1]] = Math.max(maxByYear[m[1]] || 0, Number(m[2]));
    });
  }
  const touched = {};
  const next = date => {
    const y = String(date.getFullYear());
    if (touched[y] === undefined) {
      const stored = live ? Number(props.getProperty('JOURNAL_SEQ_' + y) || 0) : 0;
      touched[y] = Math.max(maxByYear[y] || 0, stored);
      if (!live) props.deleteProperty('JOURNAL_SEQ_' + y);
    }
    touched[y]++;
    return 'JV-' + y + '-' + String(touched[y]).padStart(5, '0');
  };
  const save = () => {
    if (!live) return;
    Object.keys(touched).forEach(y => props.setProperty('JOURNAL_SEQ_' + y, String(touched[y])));
  };
  return { next: next, save: save };
}


/* ============================================================
   DIALOG FUNCTIONS
============================================================ */

function showBankImport() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile(indonesian ? 'BankImportId' : 'BankImport').setWidth(1180).setHeight(760),
    indonesian ? 'Impor Bank & Kas Kecil' : 'Bank & Petty Cash Import');
}

function getBankSetup() {
  const coaMap = getCoaMap_();
  const profiles = readSheetValues_(IMP.PROFILES)
    .filter(r => String(r[0]).trim() && String(r[17]).trim().toLowerCase() !== 'inactive')
    .map(r => {
      const a = coaMap.get(String(r[2]).trim());
      return { name: String(r[0]).trim(), mode: String(r[1]).trim().toUpperCase(), account: a ? a.code + ' - ' + a.name : String(r[2]) + ' (not in COA)' };
    });
  return {
    profiles: profiles,
    accounts: Array.from(coaMap.values()).filter(a => a.active).map(a => ({ code: a.code, name: a.name })),
    parties: getActiveParties_().map(p => p.name),
    suspense: String(readSettings_()['Bank Suspense Account'] || '').trim(),
    batches: getImportBatches()
  };
}

function previewBankImport(profileName) {
  const p = readImportProfile_(profileName);
  const ctx = importContext_();
  if (!ctx.coaMap.get(p.account)) throw new Error(`The profile account ${p.account} is not in the COA.`);
  const staging = getRequiredSheet_(IMP.STAGING);
  const values = staging.getDataRange().getValues();
  if (values.length <= p.headerRow || values.every(r => r.every(x => String(x).trim() === ''))) {
    throw new Error('The "Bank Import" sheet is empty. Paste the statement there first, starting at cell A1 (Paste special > Values only).');
  }
  const res = parseBankSheet_(values, p, ctx);
  stagingPartyColumn_(staging, values, Math.max(0, p.headerRow - 1));
  return { rows: res.rows, skipped: res.skipped, bank: p.account, mode: p.mode };
}

function importBankRows(payload) {
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const uploadStart = Date.now();
  console.log('Upload start: ' + rawRows.length + ' rows');
  if (!rawRows.length) {
    console.log('Bank Upload: ' + (Date.now() - uploadStart) + 'ms for 0 rows');
    throw new Error(tr_('There is nothing new to import.', 'Tidak ada baris baru untuk diimpor.'));
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const p = readImportProfile_(payload.profile);
    const status = payload.mode === 'POST' ? STATUS.POSTED : STATUS.DRAFT;
    const ctx = importContext_();
    if (!ctx.coaMap.get(p.account)) throw new Error(`The profile account ${p.account} is not in the COA.`);
    const rows = rawRows.filter(r => !ctx.existing.has(String(r.key)));
    if (!rows.length) throw new Error(tr_('There is nothing new to import.', 'Tidak ada baris baru untuk diimpor.'));
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const now = new Date(), user = getCurrentUser_();
    const batchId = 'BI-' + Utilities.formatDate(now, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss');
    const ids = allocateIds_(sheet, ctx.settings);
    const built = buildBankJournals_(rows, p, ctx, { status: status, batchId: batchId, now: now, user: user }, ids.next);
    if (!built.sheetRows.length) throw new Error('No row could be imported.\n' + built.errors.slice(0, 10).join('\n'));

    const start = Math.max(sheet.getLastRow() + 1, 2);
    const needed = start + built.sheetRows.length - 1;
    if (needed > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
    writeJournalRows_(sheet, built.sheetRows, start);
    ids.save();
    SpreadsheetApp.flush();
    if (built.missingPartyLines) console.warn('Post: ' + built.missingPartyLines + ' lines posted without Customer / Supplier');

    const dates = built.sheetRows.map(r => r[COL.date]).sort((a, b) => a - b);
    const log = getRequiredSheet_(IMP.LOG);
    log.getRange(Math.max(log.getLastRow() + 1, 2), 1, 1, LOG_HEADERS.length).setValues([[
      batchId, now, user, p.name, p.account, built.imported, rows.length - built.imported, status,
      dates[0], dates[dates.length - 1]]]);
    const durationMs = Date.now() - uploadStart;
    console.log('Bank Upload: ' + durationMs + 'ms for ' + rawRows.length + ' rows');
    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    return { batchId: batchId, imported: built.imported, skipped: rows.length - built.imported,
      status: status, errors: built.errors.slice(0, 15), successCount: built.imported,
      failedCount: rows.length - built.imported, durationMs: durationMs };
  } catch (e) {
    console.log('Upload failed: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function writeJournalRows_(sheet, rows, start) {
  const width = JOURNAL_HEADERS.length;
  const chunk = rows.length > 500 ? 200 : rows.length;
  const written = [];
  try {
    for (let i = 0; i < rows.length; i += chunk) {
      const size = Math.min(chunk, rows.length - i);
      sheet.getRange(start + i, 1, size, width).setValues(rows.slice(i, i + size));
      written.push({ row: start + i, size: size });
    }
  } catch (e) {
    written.forEach(w => sheet.getRange(w.row, 1, w.size, width).clearContent());
    throw e;
  }
}

function getImportBatches() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMP.LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const f = (v, p) => (v instanceof Date ? Utilities.formatDate(v, tz, p) : String(v || ''));
  const batches = sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEADERS.length).getValues().reverse().slice(0, 15).map(r => ({
    batchId: String(r[0]), at: f(r[1], 'dd MMM yyyy HH:mm'), profile: String(r[3]), imported: Number(r[5]) || 0,
    status: String(r[7]), from: f(r[8], 'dd MMM yyyy'), to: f(r[9], 'dd MMM yyyy'), missingParty: 0, missingRows: []
  }));
  const byBatch = new Map(batches.map(b => [b.batchId, b]));
  const settings = readSettings_();
  const codes = ['ar', 'ap'].map(k => String(settings[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim());
  const jsh = getRequiredSheet_(SHEETS.JOURNAL);
  if (jsh.getLastRow() >= 2) {
    jsh.getRange(2, 1, jsh.getLastRow() - 1, JOURNAL_HEADERS.length).getValues().forEach((r, i) => {
      const b = byBatch.get(String(r[COL.batchId]));
      if (!b || String(r[COL.status]) !== STATUS.DRAFT) return;
      if (!codes.includes(String(r[COL.accountCode]).trim()) || String(r[COL.partyId] || '').trim()) return;
      b.missingParty++;
      const debit = Number(r[COL.debit]) || 0, credit = Number(r[COL.credit]) || 0;
      const amount = debit > 0 ? debit : credit;
      const label = debit > 0 ? 'No Supplier' : 'No Customer';
      const desc = String(r[COL.lineDescription] || r[COL.description] || '');
      b.missingRows.push('Row ' + (i + 2) + ' - ' + desc + ' Rp ' + fmt_(amount) + ' - ' + label);
    });
  }
  return batches;
}

function setLogStatus_(batchId, status) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMP.LOG);
  if (!sh || sh.getLastRow() < 2) return;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  const col = sh.getRange(2, 8, sh.getLastRow() - 1, 1).getValues();
  let changed = false;
  ids.forEach((r, i) => {
    if (String(r[0]) === batchId && String(col[i][0]) !== status) { col[i][0] = status; changed = true; }
  });
  if (changed) sh.getRange(2, 8, col.length, 1).setValues(col);
}

function batchRows_(sheet, batchId) {
  const out = { numbers: [], rows: [] };
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues().forEach((r, i) => {
    if (String(r[COL.batchId]) === batchId) { out.numbers.push(i + 2); out.rows.push(r); }
  });
  return out;
}

/** Posts every draft journal of an import batch. All-or-nothing: one invalid journal stops the whole batch. */
function postImportBatch(batchId) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const found = batchRows_(sheet, batchId);
    if (!found.rows.length) throw new Error('Batch ' + batchId + ' was not found.');
    if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) throw new Error('Batch ' + batchId + ' has journals that are not drafts.');
    const coaMap = getCoaMap_(), settings = readSettings_(), byId = {};
    let missingPartyLines = 0;
    found.rows.forEach(r => { (byId[r[COL.id]] = byId[r[COL.id]] || []).push({
      accountCode: String(r[COL.accountCode]).trim(), debit: Number(r[COL.debit] || 0), credit: Number(r[COL.credit] || 0),
      partyId: String(r[COL.partyId] || '') }); });
    Object.keys(byId).forEach(id => {
      try { validateLines_(byId[id], coaMap, true); }
      catch (e) { throw new Error('Journal ' + id + ': ' + e.message + '\nNothing was posted.'); }
      missingPartyLines += countMissingParty_(byId[id], settings);
    });
    found.rows.forEach(r => assertNotLocked_(parseLocalDate_(r[COL.date])));
    const now = new Date(), user = getCurrentUser_();
    found.rows.forEach(r => { r[COL.status] = STATUS.POSTED; r[COL.postedAt] = now; r[COL.postedBy] = user; r[COL.updatedAt] = now; });
    writeRowGroups_(sheet, found.numbers, found.rows);
    SpreadsheetApp.flush();
    setLogStatus_(batchId, STATUS.POSTED);
    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    if (missingPartyLines) console.warn('Post: ' + missingPartyLines + ' lines posted without Customer / Supplier');
    return { message: tr_(Object.keys(byId).length + ' journals of batch ' + batchId + ' posted.', Object.keys(byId).length + ' jurnal dari batch ' + batchId + ' telah diposting.') };
  } finally {
    lock.releaseLock();
  }
}

function deleteImportBatch(batchId) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const found = batchRows_(sheet, batchId);
    if (!found.rows.length) throw new Error('Batch ' + batchId + ' was not found.');
    if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) throw new Error('Posted journals cannot be deleted.');
    const nums = found.numbers.slice().sort((a, b) => b - a);
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] - 1) j++;
      sheet.deleteRows(nums[j], j - i + 1);
      i = j + 1;
    }
    SpreadsheetApp.flush();
    setLogStatus_(batchId, 'DELETED');
    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    return { message: tr_('Batch ' + batchId + ' deleted (' + found.rows.length + ' lines).', 'Batch ' + batchId + ' dihapus (' + found.rows.length + ' baris).') };
  } finally {
    lock.releaseLock();
  }
}

function writeRowGroups_(sheet, numbers, rows) {
  let i = 0;
  while (i < numbers.length) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    sheet.getRange(numbers[i], 1, j - i + 1, JOURNAL_HEADERS.length).setValues(rows.slice(i, j + 1));
    i = j + 1;
  }
}
