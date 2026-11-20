/**
 * ============================================================
 * PERIOD-END TOOLS
 *  - Depreciation from the "Fixed Assets" register (straight-line, monthly)
 *  - Year-end closing entries (profit and loss -> Income Summary -> Retained Earnings)
 *  - Reversing entries for posted journals
 *  - Lock date: journals dated on or before it cannot be posted
 *
 * Everything is created as a DRAFT journal so you can review it in Draft Management and post it.
 * Nothing here posts by itself.
 * Opening balances for a new financial year carry forward automatically: reports read the
 * whole ledger, and the closing entry moves the year's profit into Retained Earnings.
 * ============================================================
 */

const FA_SHEET = 'Fixed Assets';
const FA_HEADERS = ['Asset ID', 'Asset Name', 'Asset Account', 'Accumulated Depreciation Account',
  'Depreciation Expense Account', 'Acquisition Date', 'Cost', 'Residual Value', 'Useful Life (months)',
  'Method', 'Depreciation Starts', 'Disposal Date', 'Status'];

function installPeriodEndSheets_(ss, log) {
  if (ss.getSheetByName(FA_SHEET)) { log.push(`${FA_SHEET}: kept as is.`); return; }
  const sh = ss.insertSheet(FA_SHEET);
  writeTable_(sh, FA_HEADERS, []);
  styleHeader_(sh, FA_HEADERS.length);
  [90, 240, 120, 170, 170, 120, 130, 120, 130, 110, 130, 120, 90].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange(2, 10, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Straight-line'], true).build());
  sh.getRange(2, 13, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Disposed'], true).build());
  sh.getRange(2, 6, 500, 1).setNumberFormat('dd mmm yyyy');
  sh.getRange(2, 11, 500, 2).setNumberFormat('dd mmm yyyy');
  sh.getRange(2, 7, 500, 2).setNumberFormat('#,##0.00');
  log.push('Created sheet "Fixed Assets". Add one row per asset. Depreciation Starts is optional (default: acquisition month).');
}


/* ============================================================
   PURE PLANNING FUNCTIONS
============================================================ */

const pOf_ = d => d.getFullYear() * 100 + d.getMonth() + 1;
const monthsBetween_ = (a, b) => (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100 - a % 100);

/** Straight-line depreciation scheduled up to and including `period`. The last month absorbs rounding. */
function scheduledDepreciation_(a, period) {
  const end = a.endPeriod ? Math.min(period, a.endPeriod) : period;
  if (end < a.startPeriod) return 0;
  const n = Math.min(monthsBetween_(a.startPeriod, end) + 1, a.life);
  const base = a.cost - a.residual;
  return n >= a.life ? r2_(base) : r2_(base * n / a.life);
}

/** assets as read from the sheet, posted = { assetId: amount already booked (drafts included) } */
function planDepreciation_(assets, posted, period, coaMap) {
  const lines = [], warnings = [];
  assets.forEach(a => {
    const tag = `${a.id} ${a.name}`;
    if (!a.id || /\s/.test(a.id)) { warnings.push(`Asset "${a.id}" was skipped: the Asset ID must not be empty or contain spaces.`); return; }
    if (a.status === 'DISPOSED' && !a.endPeriod) { warnings.push(`${tag} is marked Disposed but has no Disposal Date. It was skipped.`); return; }
    if (!(a.cost > 0) || !(a.life > 0) || !a.startPeriod) { warnings.push(`${tag} was skipped: check Cost, Useful Life, and the dates.`); return; }
    if (a.residual < 0 || a.residual >= a.cost) { warnings.push(`${tag} was skipped: the Residual Value must be below the Cost.`); return; }
    const exp = coaMap.get(a.expAcc), acc = coaMap.get(a.accAcc);
    if (!exp || !exp.active || !acc || !acc.active) { warnings.push(`${tag} was skipped: the depreciation expense or accumulated depreciation account is not in the COA.`); return; }
    const scheduled = scheduledDepreciation_(a, period);
    const done = r2_(posted[a.id] || 0);
    const due = r2_(scheduled - done);
    lines.push({ id: a.id, name: a.name, scheduled: scheduled, posted: done, due: due > 0 ? due : 0, expAcc: a.expAcc, accAcc: a.accAcc });
  });
  return { lines: lines, warnings: warnings };
}

/** Closing plan for the financial year that ends at `period`. Returns two journals (as line lists). */
function planClosing_(posted, coa, period, m0, incomeSummary, retained) {
  const lastMonth = m0 === 1 ? 12 : m0 - 1;
  if (period % 100 !== lastMonth) throw new Error('Closing entries are created for the last month of the financial year. With your Fiscal Year Start Month that is month ' + lastMonth + '.');
  const fys = (period % 100 >= m0 ? Math.floor(period / 100) : Math.floor(period / 100) - 1) * 100 + m0;
  const accs = coa.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  const bal = {};
  posted.forEach(r => {
    if (NO_FLOW.includes(r.type) || r.period < fys || r.period > period) return;
    bal[r.code] = (bal[r.code] || 0) + r.debit - r.credit;
  });
  const isDist = a => sectionOf_(a) === 'EQ' && /^distributions$/i.test(a.parent);
  const pl = accs.filter(a => !isBs_(sectionOf_(a)) && r2_(bal[a.code] || 0) !== 0);
  const dist = accs.filter(a => isDist(a) && r2_(bal[a.code] || 0) !== 0);
  if (!pl.length && !dist.length) throw new Error('There is nothing to close: no profit and loss activity was found in this financial year.');
  const j1 = [], j2 = [];
  pl.forEach(a => {
    const v = r2_(bal[a.code]);
    j1.push(v > 0 ? { code: a.code, debit: 0, credit: v, desc: 'Close ' + a.name } : { code: a.code, debit: -v, credit: 0, desc: 'Close ' + a.name });
  });
  const profit = r2_(-pl.reduce((s, a) => s + r2_(bal[a.code]), 0));
  if (profit > 0) j1.push({ code: incomeSummary, debit: 0, credit: profit, desc: 'Profit for the year' });
  else if (profit < 0) j1.push({ code: incomeSummary, debit: -profit, credit: 0, desc: 'Loss for the year' });
  if (profit > 0) { j2.push({ code: incomeSummary, debit: profit, credit: 0, desc: 'Close income summary' }, { code: retained, debit: 0, credit: profit, desc: 'Profit transferred to retained earnings' }); }
  else if (profit < 0) { j2.push({ code: retained, debit: -profit, credit: 0, desc: 'Loss transferred to retained earnings' }, { code: incomeSummary, debit: 0, credit: -profit, desc: 'Close income summary' }); }
  dist.forEach(a => {
    const v = r2_(bal[a.code]);
    if (v > 0) j2.push({ code: retained, debit: v, credit: 0, desc: 'Close ' + a.name }, { code: a.code, debit: 0, credit: v, desc: 'Close ' + a.name });
    else j2.push({ code: a.code, debit: -v, credit: 0, desc: 'Close ' + a.name }, { code: retained, debit: 0, credit: -v, desc: 'Close ' + a.name });
  });
  return { fys: fys, profit: profit, plCount: pl.length, distCount: dist.length, j1: j1, j2: j2 };
}

/** Mirror image of a posted journal. rows = its sheet rows. */
function planReversal_(rows) {
  return rows.slice().sort((a, b) => Number(a[COL.line]) - Number(b[COL.line])).map(r => {
    const neg = v => (v === '' || v == null || isNaN(Number(v)) ? '' : -Number(v));
    return {
      code: String(r[COL.accountCode]).trim(), debit: Number(r[COL.credit]) || 0, credit: Number(r[COL.debit]) || 0,
      desc: String(r[COL.lineDescription] || ''), partyName: String(r[COL.party] || ''), partyId: String(r[COL.partyId] || ''),
      taxType: String(r[COL.taxType] || ''), taxRate: r[COL.taxRate], taxBase: neg(r[COL.taxBase]), taxAmount: neg(r[COL.taxAmount])
    };
  });
}

function lastDayIso_(period) {
  const d = new Date(Math.floor(period / 100), period % 100, 0, 12);
  return isoDate_(d);
}
function firstDayNextIso_(period) {
  const y = Math.floor(period / 100), m = period % 100;
  return isoDate_(new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 12));
}


/* ============================================================
   LOCK DATE
============================================================ */

function getLockDate_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  if (!sh || sh.getLastRow() < 2) return null;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().find(r => String(r[0]).trim() === 'Lock Date');
  if (!hit || hit[1] === '' || hit[1] == null) return null;
  return parseDate_(hit[1], 'AUTO');
}

function assertNotLocked_(date) {
  const lock = getLockDate_();
  if (lock && date.getTime() <= lock.getTime()) {
    throw new Error(`Journals dated on or before ${isoDate_(lock)} are locked. ` +
      'Use a later date, or change the Lock Date in ACCOUNTING > Setup > Company Profile & Settings > System.');
  }
}

function setLockDate(iso) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error('The system is busy. Please try again in a moment.');
  try {
    const sh = getRequiredSheet_(SHEETS.SETTINGS);
    const value = String(iso || '').trim();
    if (value) parseLocalDate_(value);
    const keys = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
    let row = keys.findIndex(r => String(r[0]).trim() === 'Lock Date') + 2;
    if (row < 2) { row = Math.max(sh.getLastRow() + 1, 2); sh.getRange(row, 1).setValue('Lock Date'); }
    sh.getRange(row, 2).setNumberFormat('@').setValue(value);
    return { lockDate: value, message: value ? 'Journals dated on or before ' + value + ' can no longer be posted.' : 'The lock date was cleared.' };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   JOURNAL CREATION AND DIALOG FUNCTIONS
============================================================ */

function showPeriodEnd() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile('PeriodEnd').setWidth(1000).setHeight(760), 'Period-End Tools');
}

function getPeriodEndSetup() {
  const lock = getLockDate_();
  const now = new Date();
  return {
    lockDate: lock ? isoDate_(lock) : '',
    fiscalStart: Number(readSettings_()['Fiscal Year Start Month']) || 1,
    month: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  };
}

function periodFrom_(text) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(text))) throw new Error('Enter the month as YYYY-MM, for example 2026-11.');
  return Number(String(text).replace('-', ''));
}

function batchExists_(sheet, batchId) {
  if (sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, COL.batchId + 1, sheet.getLastRow() - 1, 1).getValues().some(r => String(r[0]) === batchId);
}

/** Creates one DRAFT journal. spec = {date, type, description, origin, batchId, linkedId, lines:[{code, debit, credit, desc, ...}]} */
function createSystemJournal_(spec) {
  const sheet = getRequiredSheet_(SHEETS.JOURNAL), coaMap = getCoaMap_();
  const p = {
    date: spec.date, journalType: spec.type, description: spec.description, reference: spec.reference || '', party: '', taxDocNo: '',
    documentSource: 'Internal Memo', entryMode: 'MANUAL', transactionType: '', paymentMethod: '', paymentAccountCode: '', paymentAmount: 0,
    dueDate: '', origin: spec.origin, batchId: spec.batchId, linkedId: spec.linkedId || '', assistedSettings: {},
    lines: spec.lines.map(l => ({
      accountCode: String(l.code), description: l.desc || '', debit: round2_(l.debit || 0), credit: round2_(l.credit || 0),
      taxType: l.taxType || '', taxRate: l.taxRate === undefined ? '' : l.taxRate, taxBase: l.taxBase === undefined ? '' : l.taxBase,
      taxAmount: l.taxAmount === undefined ? '' : l.taxAmount, partyName: l.partyName || '', partyId: l.partyId || ''
    }))
  };
  validateLines_(p.lines, coaMap, true);
  const id = nextJournalId_(p.date, sheet);
  const now = new Date(), user = getCurrentUser_();
  replaceRows_(sheet, [], buildRows_(p, id, coaMap, { status: STATUS.DRAFT, createdAt: now, createdBy: user, updatedAt: now, postedAt: '', postedBy: '' }), id);
  return id;
}

function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error('The system is busy. Please try again in a moment.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ----- Depreciation ----- */
function readAssets_() {
  return readSheetValues_(FA_SHEET).filter(r => String(r[0]).trim() || String(r[1]).trim()).map(r => {
    const acq = parseDate_(r[5], 'AUTO'), st = parseDate_(r[10], 'AUTO'), end = parseDate_(r[11], 'AUTO');
    return {
      id: String(r[0]).trim(), name: String(r[1]).trim(), assetAcc: String(r[2]).trim(), accAcc: String(r[3]).trim(), expAcc: String(r[4]).trim(),
      cost: Number(r[6]) || 0, residual: Number(r[7]) || 0, life: Number(r[8]) || 0,
      startPeriod: st ? pOf_(st) : (acq ? pOf_(acq) : 0), endPeriod: end ? pOf_(end) : 0,
      status: String(r[12]).trim().toUpperCase() === 'DISPOSED' ? 'DISPOSED' : 'ACTIVE'
    };
  });
}

function depreciationPosted_() {
  const sheet = getRequiredSheet_(SHEETS.JOURNAL), out = {};
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues().forEach(r => {
    if (String(r[COL.origin]) !== 'DEPRECIATION') return;
    const id = String(r[COL.lineDescription]).split(' ')[0];
    out[id] = (out[id] || 0) + (Number(r[COL.credit]) || 0);
  });
  return out;
}

function previewDepreciation(monthText) {
  const period = periodFrom_(monthText);
  const plan = planDepreciation_(readAssets_(), depreciationPosted_(), period, getCoaMap_());
  return { lines: plan.lines, warnings: plan.warnings, total: r2_(plan.lines.reduce((s, l) => s + l.due, 0)) };
}

function createDepreciation(monthText) {
  return withLock_(() => {
    const period = periodFrom_(monthText);
    const plan = planDepreciation_(readAssets_(), depreciationPosted_(), period, getCoaMap_());
    const due = plan.lines.filter(l => l.due > 0);
    if (!due.length) throw new Error('There is no depreciation to book for this month. Everything scheduled has already been booked.' + (plan.warnings.length ? '\n' + plan.warnings.join('\n') : ''));
    const lines = [];
    due.forEach(l => {
      lines.push({ code: l.expAcc, debit: l.due, credit: 0, desc: l.id + ' ' + l.name });
      lines.push({ code: l.accAcc, debit: 0, credit: l.due, desc: l.id + ' ' + l.name });
    });
    const id = createSystemJournal_({ date: lastDayIso_(period), type: 'Adjusting Entry', description: 'Depreciation for ' + monthText,
      origin: 'DEPRECIATION', batchId: 'DEP-' + period, lines: lines });
    return { journalId: id, count: due.length, total: r2_(due.reduce((s, l) => s + l.due, 0)), warnings: plan.warnings,
      message: 'Draft ' + id + ' created for ' + due.length + ' assets. Review it in Draft Management, then post it.' };
  });
}

/* ----- Closing ----- */
function closingPlanFor_(monthText) {
  const period = periodFrom_(monthText), s = readSettings_();
  const m0 = Number(s['Fiscal Year Start Month']) || 1;
  const code = k => String(s[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim();
  const coa = readCoa_(), map = new Map(coa.map(a => [a.code, a]));
  const is = code('incomeSummary'), re = code('retainedEarnings');
  if (!map.get(is) || !map.get(re)) throw new Error('The Income Summary and Retained Earnings accounts must exist in the COA and in Settings.');
  const plan = planClosing_(loadPostedForReports_(), coa, period, m0, is, re);
  return { plan: plan, period: period };
}

function previewClosing(monthText) {
  const c = closingPlanFor_(monthText);
  const sheet = getRequiredSheet_(SHEETS.JOURNAL);
  const exists = batchExists_(sheet, 'CLOSE-' + c.period);
  let drafts = 0;
  const seen = new Set();
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues().forEach(r => {
      const p = Number(r[COL.period]);
      if (String(r[COL.status]) === STATUS.DRAFT && p >= c.plan.fys && p <= c.period && !seen.has(r[COL.id])) { seen.add(r[COL.id]); drafts++; }
    });
  }
  return { profit: c.plan.profit, accounts: c.plan.plCount, distributions: c.plan.distCount, existing: exists, draftsInYear: drafts, from: c.plan.fys };
}

function createClosing(monthText) {
  return withLock_(() => {
    const c = closingPlanFor_(monthText), sheet = getRequiredSheet_(SHEETS.JOURNAL);
    if (batchExists_(sheet, 'CLOSE-' + c.period)) throw new Error('Closing journals were already created for this year. Delete the draft closing journals first if you need to create them again.');
    const date = lastDayIso_(c.period), ids = [];
    ids.push(createSystemJournal_({ date: date, type: 'Closing Entry', description: 'Close profit and loss accounts to income summary',
      origin: 'CLOSING', batchId: 'CLOSE-' + c.period, lines: c.plan.j1 }));
    if (c.plan.j2.length) {
      ids.push(createSystemJournal_({ date: date, type: 'Closing Entry', description: 'Close income summary and distributions to retained earnings',
        origin: 'CLOSING', batchId: 'CLOSE-' + c.period, lines: c.plan.j2 }));
    }
    return { journalIds: ids, profit: c.plan.profit, message: 'Draft closing journals ' + ids.join(' and ') + ' created. Post the first one, then the second.' };
  });
}

/* ----- Reversing entries ----- */
function listAdjustingEntries(monthText) {
  const period = periodFrom_(monthText), sheet = getRequiredSheet_(SHEETS.JOURNAL);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues();
  const reversed = new Set(data.filter(r => String(r[COL.type]) === 'Reversing Entry' && r[COL.linkedId]).map(r => String(r[COL.linkedId])));
  const groups = new Map();
  data.forEach(r => {
    if (String(r[COL.status]) !== STATUS.POSTED || String(r[COL.type]) !== 'Adjusting Entry' || Number(r[COL.period]) !== period || String(r[COL.origin]) === 'DEPRECIATION') return;
    const id = String(r[COL.id]);
    if (!groups.has(id)) groups.set(id, { id: id, date: dateToIso_(r[COL.date]), description: String(r[COL.description]), total: 0, reversed: reversed.has(id) });
    groups.get(id).total += Number(r[COL.debit]) || 0;
  });
  return Array.from(groups.values());
}

function createReversals(payload) {
  return withLock_(() => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(x => String(x).trim()).filter(String) : [];
    if (!ids.length) throw new Error('Choose at least one journal.');
    const date = String(payload.date || '').trim();
    parseLocalDate_(date);
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const created = [], errors = [];
    ids.forEach(id => {
      try {
        const found = loadJournalRows_(sheet, id);
        if (!found.rows.length) throw new Error('was not found.');
        if (found.rows.some(r => String(r[COL.status]) !== STATUS.POSTED)) throw new Error('is not posted. Only posted journals can be reversed. Edit or delete drafts instead.');
        if (found.rows.some(r => String(r[COL.type]) === 'Reversing Entry')) throw new Error('is itself a reversal.');
        const all = sheet.getRange(2, COL.linkedId + 1, sheet.getLastRow() - 1, 1).getValues();
        const typeCol = sheet.getRange(2, COL.type + 1, sheet.getLastRow() - 1, 1).getValues();
        if (all.some((r, i) => String(r[0]) === id && String(typeCol[i][0]) === 'Reversing Entry')) throw new Error('has already been reversed.');
        const first = found.rows[0];
        const newId = createSystemJournal_({ date: date, type: 'Reversing Entry', description: 'Reversal of ' + id + ': ' + first[COL.description],
          reference: String(first[COL.reference] || ''), origin: 'REVERSAL', batchId: 'REV-' + id, linkedId: id, lines: planReversal_(found.rows) });
        created.push(newId);
      } catch (e) { errors.push(id + ' ' + e.message); }
    });
    if (!created.length) throw new Error(errors.join('\n'));
    return { created: created, errors: errors, message: created.length + ' reversing draft(s) created: ' + created.join(', ') + '. Post them in Draft Management.' };
  });
}
