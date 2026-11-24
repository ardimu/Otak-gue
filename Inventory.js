/**
 * ============================================================
 * INVENTORY (perpetual, moving-average cost)
 *
 *  1. Add products to the "Items" sheet.
 *  2. Type movements into "Stock Movements" (columns A to G). Paste is fine.
 *  3. ACCOUNTING > Inventory > Process Stock Movements.
 *     The system works out each cost, fills columns H to M, and creates DRAFT journals:
 *       SALE            Dr Cost of Goods Sold, Cr Inventory (cost = quantity x moving average)
 *       SALES RETURN    Dr Inventory, Cr Cost of Goods Sold
 *       COUNT LOSS/GAIN Dr/Cr Inventory Adjustment against Inventory
 *     PURCHASE, PURCHASE RETURN and OPENING do not create journals: book the purchase through
 *     Assisted Entry as usual and enter the same quantity and cost here.
 *  4. ACCOUNTING > Inventory > Stock Summary compares stock value with the ledger.
 * Journals are drafts. Post them in Draft Management, or post the whole batch in Bank & Petty Cash Import.
 * ============================================================
 */

const INV = { ITEMS: 'Items', MOVES: 'Stock Movements' };
const ITEM_HEADERS = ['Item Code', 'Item Name', 'Unit', 'Inventory Account', 'COGS Account', 'Adjustment Account', 'Status'];
const MOVE_HEADERS = ['Date', 'Item Code', 'Type', 'Quantity', 'Unit Cost', 'Reference', 'Notes',
  'Status', 'Movement Value', 'Qty On Hand', 'Average Cost', 'Journal ID', 'Message'];

/* dir: stock goes IN or OUT. cost: INPUT = you must enter it, INPUT_OR_AVG = enter it or use the average,
   AVG = always the moving average. journal: which draft journal is created. */
const STOCK_TYPES = {
  'OPENING': { dir: 'IN', cost: 'INPUT', journal: '' },
  'PURCHASE': { dir: 'IN', cost: 'INPUT', journal: '' },
  'SALES RETURN': { dir: 'IN', cost: 'INPUT_OR_AVG', journal: 'COGSREV' },
  'SALE': { dir: 'OUT', cost: 'AVG', journal: 'COGS' },
  'PURCHASE RETURN': { dir: 'OUT', cost: 'INPUT_OR_AVG', journal: '' },
  'COUNT GAIN': { dir: 'IN', cost: 'INPUT_OR_AVG', journal: 'ADJGAIN' },
  'COUNT LOSS': { dir: 'OUT', cost: 'AVG', journal: 'ADJLOSS' }
};

function installInventorySheets_(ss, log) {
  if (!ss.getSheetByName(INV.ITEMS)) {
    const sh = ss.insertSheet(INV.ITEMS);
    writeTable_(sh, ITEM_HEADERS, []);
    styleHeader_(sh, ITEM_HEADERS.length);
    [110, 280, 80, 150, 140, 150, 90].forEach((w, i) => sh.setColumnWidth(i + 1, w));
    sh.getRange(2, 7, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive'], true).build());
    log.push(tr_('Created sheet "Items". Leave the account columns blank to use the defaults from Settings (inventory, COGS) and 5301.',
      'Lembar "Items" telah dibuat. Biarkan kolom akun kosong untuk menggunakan nilai bawaan dari Pengaturan (persediaan, beban pokok penjualan) dan 5301.'));
  } else log.push(tr_('Items: kept as is.', 'Items: tidak diubah.'));
  if (!ss.getSheetByName(INV.MOVES)) {
    const sh = ss.insertSheet(INV.MOVES);
    writeTable_(sh, MOVE_HEADERS, []);
    styleHeader_(sh, MOVE_HEADERS.length);
    sh.getRange(1, 8, 1, 6).setBackground('#5d6b65');
    [100, 110, 150, 90, 100, 130, 200, 80, 130, 110, 120, 130, 340].forEach((w, i) => sh.setColumnWidth(i + 1, w));
    sh.getRange(2, 3, 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STOCK_TYPES), true).build());
    sh.getRange(2, 5, 2000, 1).setNumberFormat('#,##0.00');
    sh.getRange(2, 9, 2000, 1).setNumberFormat('#,##0.00');
    sh.getRange(2, 11, 2000, 1).setNumberFormat('#,##0.00');
    log.push(tr_('Created sheet "Stock Movements". Type in columns A to G. Columns H to M are filled by the system.',
      'Lembar "Stock Movements" telah dibuat. Isi kolom A sampai G. Kolom H sampai M diisi oleh sistem.'));
  } else log.push(tr_('Stock Movements: kept as is.', 'Stock Movements: tidak diubah.'));
}


/* ============================================================
   ENGINE (pure)
============================================================ */

/**
 * items: Map code -> {name, active}. rows: [{n, date, item, type, qty, unitCost|null, status, journalId, storedValue|null}].
 * journalIds: Set of journal IDs that exist. Rows already DONE are replayed so the running average stays right.
 * Returns {res:[per row], state:Map item -> {qty, value}}. res.status: DONE, READY (to create its journal), or ERROR.
 */
function stockEngine_(items, rows, journalIds) {
  const res = rows.map(r => ({ n: r.n, status: r.status, message: '', moveValue: '', qtyAfter: '', avgAfter: '', valueAfter: 0, journal: '' }));
  const eff = rows.map(r => {
    const t = STOCK_TYPES[String(r.type).toUpperCase()];
    return r.status === 'DONE' && !(t && t.journal && !journalIds.has(r.journalId));
  });
  const lastDone = new Map();
  rows.forEach((r, i) => { if (eff[i] && r.date) lastDone.set(r.item, Math.max(lastDone.get(r.item) || 0, r.date.getTime())); });
  const order = rows.map((r, i) => i).filter(i => rows[i].date).sort((a, b) => (rows[a].date - rows[b].date) || (a - b));
  const state = new Map();
  order.forEach(i => {
    const r = rows[i], o = res[i], t = STOCK_TYPES[String(r.type).toUpperCase()], it = items.get(r.item);
    const fail = m => { o.status = 'ERROR'; o.message = m; };
    if (!it || !it.active) return fail(tr_('Item "' + r.item + '" is not in the Items sheet, or it is inactive.',
      'Item "' + r.item + '" tidak ada di lembar Items atau tidak aktif.'));
    if (!t) return fail(tr_('Unknown type "' + r.type + '". Use one of: ' + Object.keys(STOCK_TYPES).join(', ') + '.',
      'Jenis "' + r.type + '" tidak dikenal. Gunakan salah satu dari: ' + Object.keys(STOCK_TYPES).join(', ') + '.'));
    if (!(r.qty > 0)) return fail(tr_('Enter a quantity above zero.', 'Masukkan kuantitas lebih dari nol.'));
    if (!eff[i] && (lastDone.get(r.item) || 0) > r.date.getTime()) return fail(tr_('Dated before a movement of this item that was already processed. Use a later date.',
      'Tanggal lebih awal dari pergerakan item ini yang sudah diproses. Gunakan tanggal yang lebih kemudian.'));
    const st = state.get(r.item) || { qty: 0, value: 0 };
    const avg = st.qty > 0 ? st.value / st.qty : 0;
    let unit;
    if (t.cost === 'AVG') unit = avg;
    else if (r.unitCost !== null && r.unitCost >= 0) unit = r.unitCost;
    else if (t.cost === 'INPUT_OR_AVG' && avg > 0) unit = avg;
    else return fail(tr_('Enter the unit cost.', 'Masukkan biaya satuan.'));
    if (t.dir === 'OUT' && r.qty > st.qty + 1e-9) return fail(tr_('Not enough stock. On hand: ' + r2_(st.qty) + '.',
      'Persediaan tidak mencukupi. Sisa di tangan: ' + r2_(st.qty) + '.'));
    const mv = r2_(r.qty * unit);
    if (t.dir === 'IN') { st.qty += r.qty; st.value += mv; }
    else { st.qty -= r.qty; st.value -= mv; if (st.qty < 1e-9) { st.qty = 0; if (Math.abs(st.value) < 1) st.value = 0; } }
    state.set(r.item, st);
    o.moveValue = mv; o.qtyAfter = r2_(st.qty); o.avgAfter = st.qty > 0 ? r2_(st.value / st.qty) : 0; o.valueAfter = r2_(st.value);
    if (eff[i]) {
      o.status = 'DONE';
      if (t.journal && r.storedValue !== null && Math.abs(r.storedValue - mv) > 0.01) {
        o.message = tr_('The cost is now ' + mv + ', but journal ' + r.journalId + ' used ' + r.storedValue + '. Review.',
          'Biaya sekarang ' + mv + ', tetapi jurnal ' + r.journalId + ' menggunakan ' + r.storedValue + '. Periksa kembali.');
      }
    } else { o.status = 'READY'; o.journal = t.journal; }
  });
  rows.forEach((r, i) => { if (!r.date) { res[i].status = 'ERROR'; res[i].message = tr_('The date is not valid.', 'Tanggal tidak valid.'); } });
  return { res: res, state: state };
}

function journalSpecFor_(kind, item, row, value, accts) {
  const inv = accts.inv, cogs = accts.cogs, adj = accts.adj;
  const d = row.date, iso = isoDate_(d), what = item.name + ' x ' + row.qty;
  const spec = { date: iso, reference: row.ref, type: 'General Journal', lines: [] };
  if (kind === 'COGS') { spec.description = 'Cost of goods sold: ' + what; spec.lines = [{ code: cogs, debit: value, credit: 0, desc: what }, { code: inv, debit: 0, credit: value, desc: what }]; }
  else if (kind === 'COGSREV') { spec.description = 'Sales return, cost reversed: ' + what; spec.lines = [{ code: inv, debit: value, credit: 0, desc: what }, { code: cogs, debit: 0, credit: value, desc: what }]; }
  else if (kind === 'ADJLOSS') { spec.type = 'Inventory Adjustment'; spec.description = 'Stock count loss: ' + what; spec.lines = [{ code: adj, debit: value, credit: 0, desc: what }, { code: inv, debit: 0, credit: value, desc: what }]; }
  else { spec.type = 'Inventory Adjustment'; spec.description = 'Stock count gain: ' + what; spec.lines = [{ code: inv, debit: value, credit: 0, desc: what }, { code: adj, debit: 0, credit: value, desc: what }]; }
  return spec;
}


/* ============================================================
   SHEET FUNCTIONS
============================================================ */

function readItems_() {
  const m = readSettings_(), map = {};
  ACCOUNT_MAPPINGS.forEach(a => { map[a[0]] = String(m[mappingKey_(a)] || '').trim(); });
  const out = new Map();
  readSheetValues_(INV.ITEMS).filter(r => String(r[0]).trim()).forEach(r => {
    const code = String(r[0]).trim();
    out.set(code, {
      code: code, name: String(r[1]).trim() || code, unit: String(r[2]).trim(),
      inv: String(r[3]).trim() || map.merchandise, cogs: String(r[4]).trim() || map.cogs, adj: String(r[5]).trim() || '5301',
      active: String(r[6]).trim().toLowerCase() !== 'inactive'
    });
  });
  return out;
}

function readMovements_() {
  const sh = getRequiredSheet_(INV.MOVES);
  if (sh.getLastRow() < 2) return [];
  const rows = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, MOVE_HEADERS.length).getValues().forEach((r, i) => {
    if (r.slice(0, 7).every(x => String(x).trim() === '')) return;
    const uc = parseNumber_(r[4], 'AUTO'), q = parseNumber_(r[3], 'AUTO'), sv = parseNumber_(r[8], 'AUTO');
    rows.push({
      n: i + 2, date: parseDate_(r[0], 'AUTO'), item: String(r[1]).trim(), type: String(r[2]).trim().toUpperCase(),
      qty: q === null || isNaN(q) ? 0 : q, unitCost: uc === null || isNaN(uc) ? null : uc, ref: String(r[5]).trim(),
      status: String(r[7]).trim().toUpperCase(), storedValue: sv === null || isNaN(sv) ? null : sv, journalId: String(r[11]).trim()
    });
  });
  return rows;
}

function journalIdSet_() {
  const sh = getRequiredSheet_(SHEETS.JOURNAL), s = new Set();
  if (sh.getLastRow() >= 2) sh.getRange(2, COL.id + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(r => s.add(String(r[0]).trim()));
  return s;
}

/** Writes many draft journals in one go. Returns [{id} or {error}] in the same order as specs. */
function bulkDrafts_(specs, batchId) {
  const sheet = getRequiredSheet_(SHEETS.JOURNAL), coaMap = getCoaMap_(), ids = allocateIds_(sheet);
  const now = new Date(), user = getCurrentUser_(), rows = [], out = [];
  specs.forEach(sp => {
    try {
      const p = {
        date: sp.date, journalType: sp.type, description: sp.description, reference: sp.reference || '', party: '', taxDocNo: '',
        documentSource: 'Internal Memo', entryMode: 'MANUAL', transactionType: '', paymentMethod: '', paymentAccountCode: '', paymentAmount: 0,
        dueDate: '', origin: 'INVENTORY', batchId: batchId, linkedId: '', assistedSettings: {},
        lines: sp.lines.map(l => ({ accountCode: String(l.code), description: l.desc || '', debit: round2_(l.debit || 0), credit: round2_(l.credit || 0),
          taxType: '', taxRate: '', taxBase: '', taxAmount: '', partyName: '', partyId: '' }))
      };
      validateLines_(p.lines, coaMap, true);
      const id = ids.next(parseLocalDate_(sp.date));
      buildRows_(p, id, coaMap, { status: STATUS.DRAFT, createdAt: now, createdBy: user, updatedAt: now, postedAt: '', postedBy: '' }).forEach(r => rows.push(r));
      out.push({ id: id });
    } catch (e) { out.push({ error: e.message }); }
  });
  if (rows.length) {
    const start = Math.max(sheet.getLastRow() + 1, 2), needed = start + rows.length - 1;
    if (needed > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
    sheet.getRange(start, 1, rows.length, JOURNAL_HEADERS.length).setValues(rows);
    ids.save();
    SpreadsheetApp.flush();
  }
  return out;
}

function processStockMovements(options) {
  const web = !!(options && options.web);
  const r = withLock_(() => {
    const items = readItems_(), rows = readMovements_();
    if (!rows.length) throw new Error(tr_('The Stock Movements sheet has no rows. Type movements in columns A to G first.',
      'Lembar Stock Movements tidak memiliki baris. Isi pergerakan pada kolom A sampai G terlebih dahulu.'));
    const eng = stockEngine_(items, rows, journalIdSet_());
    const batchId = 'STK-' + Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss');
    const jobs = [];
    eng.res.forEach((o, i) => {
      if (o.status !== 'READY' || !o.journal) return;
      const it = items.get(rows[i].item);
      jobs.push({ i: i, spec: journalSpecFor_(o.journal, it, rows[i], o.moveValue, { inv: it.inv, cogs: it.cogs, adj: it.adj }) });
    });
    const made = jobs.length ? bulkDrafts_(jobs.map(j => j.spec), batchId) : [];
    let created = 0, failed = 0;
    jobs.forEach((j, k) => {
      const o = eng.res[j.i];
      if (made[k].id) { o.journalId = made[k].id; created++; } else { o.status = 'ERROR'; o.message = made[k].error; failed++; }
    });
    const sh = getRequiredSheet_(INV.MOVES), out = [];
    const first = rows[0].n, lastN = rows[rows.length - 1].n;
    const byRow = new Map(rows.map((x, i) => [x.n, i]));
    for (let n = first; n <= lastN; n++) {
      const i = byRow.get(n);
      if (i === undefined) { out.push(['', '', '', '', '', '']); continue; }
      const o = eng.res[i];
      const done = o.status === 'READY' ? 'DONE' : o.status;
      out.push([done, o.moveValue, o.qtyAfter, o.avgAfter, o.journalId || rows[i].journalId || '', o.message]);
    }
    sh.getRange(first, 8, out.length, 6).setValues(out);
    if (created) {
      const log = getRequiredSheet_(IMP.LOG), dates = jobs.filter((j, k) => made[k].id).map(j => rows[j.i].date).sort((a, b) => a - b);
      log.getRange(Math.max(log.getLastRow() + 1, 2), 1, 1, LOG_HEADERS.length).setValues([[batchId, new Date(), getCurrentUser_(), tr_('Inventory movements', 'Pergerakan persediaan'), '', created, failed, STATUS.DRAFT, dates[0], dates[dates.length - 1]]]);
    }
    const errors = eng.res.filter(o => o.status === 'ERROR').length;
    return { done: eng.res.filter(o => o.status === 'READY').length, created: created, errors: errors, batchId: batchId };
  });
    const message = r.done + tr_(' movement(s) processed.\n', ' pergerakan diproses.\n') +
      r.created + tr_(' draft journal(s) created', ' jurnal draf dibuat') +
      (r.created ? tr_(' (batch ', ' (batch ') + r.batchId + ')' : '') + tr_('.\n', '.\n') +
      (r.errors ? r.errors + tr_(' row(s) have an error. Read column M of the Stock Movements sheet, fix them, and process again.',
        ' baris memiliki kesalahan. Baca kolom M pada lembar Stock Movements, perbaiki, lalu proses kembali.') : tr_('No errors.', 'Tidak ada kesalahan.')) +
      (r.created ? tr_('\n\nReview the drafts in Draft Management, or post the whole batch in Bank & Petty Cash Import.',
        '\n\nTinjau draf di Kelola Draf, atau posting seluruh batch di Impor Bank & Kas Kecil.') : '');
    if (r.created) { try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_('journals'); } catch (e) {} }
    if (web) return { success: true, result: r, message: message };
  const ui = SpreadsheetApp.getUi();
  ui.alert(tr_('Stock movements processed', 'Pergerakan persediaan diproses'), message, ui.ButtonSet.OK);
}

/** Pure: stock value per item and per inventory account as at a date, against the ledger. */
function stockSummaryRows_(items, rows, journalIds, asOf, ledgerByAccount) {
  const done = rows.filter(r => r.status === 'DONE' && r.date && r.date <= asOf);
  const eng = stockEngine_(items, done, journalIds);
  const lines = [], perAcct = new Map();
  let total = 0;
  Array.from(eng.state.keys()).sort().forEach(code => {
    const st = eng.state.get(code), it = items.get(code);
    if (!st.qty && !r2_(st.value)) return;
    lines.push({ k: 'l', c: [code, it.name, it.unit, r2_(st.qty), st.qty ? r2_(st.value / st.qty) : 0, r2_(st.value), it.inv] });
    perAcct.set(it.inv, (perAcct.get(it.inv) || 0) + st.value);
    total += st.value;
  });
  lines.push({ k: 't', c: ['', tr_('Total stock value', 'Total nilai persediaan'), '', '', '', r2_(total), ''] });
  lines.push({ k: 'h', c: [tr_('Agreement with the ledger', 'Kesesuaian dengan Buku Besar')] });
  const accts = new Set(Array.from(perAcct.keys()).concat(Object.keys(ledgerByAccount)));
  let bad = false;
  Array.from(accts).sort().forEach(a => {
    const sv = r2_(perAcct.get(a) || 0), lv = r2_(ledgerByAccount[a] || 0), diff = r2_(sv - lv);
    if (diff) bad = true;
    lines.push({ k: diff ? 'x' : 'l', c: ['', tr_('Inventory account ' + a, 'Akun persediaan ' + a), '', '', '', sv,
      tr_('Ledger ' + lv + (diff ? ', difference ' + diff : ', agrees'), 'Buku Besar ' + lv + (diff ? ', selisih ' + diff : ', sesuai'))] });
  });
  if (bad) lines.push({ k: 'n', c: ['', tr_('A difference usually means purchases were booked without a matching stock movement, journals are still drafts, or a cost was entered differently.',
    'Selisih biasanya berarti pembelian dicatat tanpa pergerakan persediaan yang sesuai, jurnal masih berupa draf, atau biaya dimasukkan dengan nilai yang berbeda.')] });
  return { rows: lines, total: r2_(total), balanced: !bad };
}

function generateStockSummary(asOf, options) {
  const web = !!(options && options.web);
  const ui = web ? null : SpreadsheetApp.getUi();
  const today = isoDate_(new Date());
  let raw = asOf;
  if (!web) {
    const res = ui.prompt(tr_('Stock summary', 'Penilaian persediaan'),
      tr_('As at which date? Enter YYYY-MM-DD, for example ' + today + '.', 'Pada tanggal berapa? Masukkan YYYY-MM-DD, misalnya ' + today + '.'), ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    raw = res.getResponseText() || today;
  }
  raw = String(raw || today).trim();
  const dateError = tr_('Enter the date as YYYY-MM-DD.', 'Masukkan tanggal dalam format YYYY-MM-DD.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (web) throw new Error(dateError);
    ui.alert(dateError); return;
  }
  let asOfDate;
  try { asOfDate = parseLocalDate_(raw); }
  catch (e) {
    if (web) throw new Error(dateError);
    ui.alert(dateError); return;
  }
  const items = readItems_(), ledger = {};
  const invAccts = new Set(Array.from(items.values()).map(i => i.inv));
  loadPostedForReports_().forEach(l => { if (invAccts.has(l.code) && l.date <= asOfDate) ledger[l.code] = (ledger[l.code] || 0) + l.debit - l.credit; });
  const out = stockSummaryRows_(items, readMovements_(), journalIdSet_(), asOfDate, ledger);
  writeReport_('Stock Summary', { title: (readSettings_()['Company Name'] || '') + ' - ' + tr_('Stock Summary', 'Penilaian Persediaan'),
    subtitle: tr_('As at ' + isoDate_(asOfDate) + '. Moving-average cost. Processed movements only.',
      'Pada ' + isoDate_(asOfDate) + '. Biaya rata-rata bergerak. Hanya pergerakan yang sudah diproses.'),
    header: [tr_('Item', 'Item'), tr_('Name', 'Nama'), tr_('Unit', 'Satuan'), tr_('Quantity', 'Kuantitas'), tr_('Average cost', 'Biaya Rata-rata'),
      tr_('Stock value', 'Nilai Persediaan'), tr_('Inventory account', 'Akun Persediaan')],
    rows: out.rows, numFrom: 4, decimals: 2, widths: [110, 300, 80, 110, 120, 140, 340] });
  const message = tr_('Total stock value Rp ', 'Total nilai persediaan Rp ') + fmt_(out.total) + tr_('.\nLedger agreement: ', '.\nKesesuaian dengan Buku Besar: ') +
    (out.balanced ? tr_('yes', 'ya') : tr_('NO. See the bottom of the Stock Summary sheet.', 'TIDAK. Lihat bagian bawah lembar Stock Summary.'));
  if (web) return { success: true, total: out.total, balanced: out.balanced, message: message };
  ui.alert(tr_('Stock summary', 'Penilaian persediaan'), message, ui.ButtonSet.OK);
}
