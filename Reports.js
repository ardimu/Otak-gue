/**
 * ============================================================
 * MONTHLY FINANCIAL REPORTS
 * ACCOUNTING > Reports > Generate Reports for a Month...
 *
 * Reads POSTED journals only (drafts never appear). Writes six sheets:
 * Trial Balance, General Ledger, Income Statement, Balance Sheet, Equity Changes, Cash Flow.
 * Reports are snapshots. Run "Refresh Reports" after posting new journals.
 *
 * Where an account lands is decided by the COA columns:
 *   Account Type + Category  -> section of the statement
 *   Report Group             -> the line shown on the statement
 *   Parent Account           -> equity and cash flow classification
 * Fiscal year start comes from Settings (Fiscal Year Start Month).
 * ============================================================
 */

const REPORT_OPTIONS = [
  { key: 'tb', sheet: 'Trial Balance' },
  { key: 'gl', sheet: 'General Ledger' },
  { key: 'is', sheet: 'Income Statement' },
  { key: 'bs', sheet: 'Balance Sheet' },
  { key: 'eq', sheet: 'Equity Changes' },
  { key: 'cf', sheet: 'Cash Flow' }
];
const REPORT_KEYS = REPORT_OPTIONS.map(o => o.key);
const REPORT_SHEETS = REPORT_OPTIONS.map(o => o.sheet);
const NO_FLOW = ['Closing Entry', 'Opening Entry'];   // never count as income, expense, or cash movement

function sectionOf_(a) {
  const t = a.type, c = String(a.category || '').toLowerCase();
  if (t === 'ASSET') return /^non-?current/.test(c) ? 'NCA' : 'CA';
  if (t === 'LIABILITY') return /^non-?current/.test(c) ? 'NCL' : 'CL';
  if (t === 'EQUITY') return 'EQ';
  if (c === 'contra revenue') return 'CONTRA';
  if (c === 'revenue') return 'REV';
  if (c === 'cost of sales') return 'COS';
  if (c === 'operating expense') return 'OPEX';
  if (c === 'other income') return 'OI';
  if (c === 'other expense') return 'OX';
  if (/tax/.test(c)) return 'TAX';
  return ({ REVENUE: 'REV', COGS: 'COS', EXPENSE: 'OPEX', 'OTHER INCOME': 'OI', 'OTHER EXPENSE': 'OX', TAX: 'TAX', 'TAX EXPENSE': 'TAX' })[t] || '?';
}
const isBs_ = s => ['CA', 'NCA', 'CL', 'NCL', 'EQ'].includes(s);
const r2_ = n => Math.round(n * 100) / 100;

/**
 * Pure engine. posted = [{period, date, id, type, ref, desc, ldesc, party, code, debit, credit}]
 * coa = [{code, name, type, normal, parent, group, category}], period = YYYYMM, m0 = fiscal year start month.
 */
function computeReports_(posted, coa, period, m0, meta) {
  const accs = coa.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  const acc = new Map(accs.map(a => [a.code, a]));
  const sec = new Map(accs.map(a => [a.code, sectionOf_(a)]));
  const tx = new Map();
  const unknown = new Set();
  posted.forEach(r => {
    if (!acc.has(r.code)) { unknown.add(r.code); return; }
    if (!tx.has(r.code)) tx.set(r.code, []);
    tx.get(r.code).push(r);
  });
  const prev = p => (p % 100 === 1 ? (Math.floor(p / 100) - 1) * 100 + 12 : p - 1);
  const fysOf = p => { const y = Math.floor(p / 100), mo = p % 100; return (mo >= m0 ? y : y - 1) * 100 + m0; };
  const fys = fysOf(period), pm = prev(period);
  const net = (code, from, to, excl) => {
    let s = 0;
    (tx.get(code) || []).forEach(r => { if (r.period >= from && r.period <= to && !(excl && excl.includes(r.type))) s += r.debit - r.credit; });
    return s;
  };
  const netType = (code, from, to, type) => {
    let s = 0;
    (tx.get(code) || []).forEach(r => { if (r.period >= from && r.period <= to && r.type === type) s += r.debit - r.credit; });
    return s;
  };
  const sum = (list, f) => list.reduce((s, a) => s + f(a), 0);
  const isPL = a => !isBs_(sec.get(a.code));
  const plAccs = accs.filter(a => isPL(a)), bsAccs = accs.filter(a => !isPL(a));
  const label = meta.label, co = meta.company || '';
  const labelId = meta.labelId || label.replace('For the month ended ', 'Untuk bulan yang berakhir pada ');
  const displayLabel = tr_(label, labelId);
  const bsLabel = meta.bsLabel || tr_(label.replace('For ', 'As at end of '), labelId.replace('Untuk bulan yang berakhir pada ', 'Pada akhir bulan '));
  const eqLabel = meta.eqLabel || tr_(label.replace(/^For .* ended/, 'Year to date to'), labelId.replace(/^Untuk bulan yang berakhir pada/, 'Sampai dengan tahun berjalan pada'));
  const warnings = [];
  accs.filter(a => sec.get(a.code) === '?' && (tx.get(a.code) || []).length).forEach(a =>
    warnings.push(tr_(
      `Account ${a.code} ${a.name} has an unknown Account Type or Category ("${a.type}" / "${a.category}"). It is left out of the statements.`,
      `Akun ${a.code} ${a.name} memiliki Jenis Akun atau Kategori yang tidak dikenal ("${a.type}" / "${a.category}"). Akun ini tidak disertakan dalam laporan.`
    )));
  if (unknown.size) warnings.push(tr_('Journal lines use account codes that are not in the COA: ' + Array.from(unknown).join(', ') + '.',
    'Baris jurnal menggunakan kode akun yang tidak ada dalam Daftar Akun: ' + Array.from(unknown).join(', ') + '.'));

  /* ---------- Trial balance ---------- */
  const tbRows = [];
  const T = { od: 0, oc: 0, md: 0, mc: 0, ed: 0, ec: 0 };
  accs.forEach(a => {
    const open = net(a.code, 0, pm);
    let md = 0, mc = 0;
    (tx.get(a.code) || []).forEach(r => { if (r.period === period) { md += r.debit; mc += r.credit; } });
    const end = open + md - mc;
    if (!r2_(open) && !r2_(md) && !r2_(mc) && !r2_(end)) return;
    const row = [a.code, a.name, open > 0 ? r2_(open) : 0, open < 0 ? r2_(-open) : 0, r2_(md), r2_(mc), end > 0 ? r2_(end) : 0, end < 0 ? r2_(-end) : 0];
    T.od += row[2]; T.oc += row[3]; T.md += row[4]; T.mc += row[5]; T.ed += row[6]; T.ec += row[7];
    tbRows.push({ k: 'l', c: row });
  });
  tbRows.push({ k: 't', c: ['', tr_('Total', 'Total'), r2_(T.od), r2_(T.oc), r2_(T.md), r2_(T.mc), r2_(T.ed), r2_(T.ec)] });
  const tbDiff = r2_(T.ed - T.ec);
  tbRows.push({ k: tbDiff ? 'x' : 'n', c: ['', tbDiff
    ? tr_('WARNING: the trial balance does not balance. Difference: ' + tbDiff, 'PERINGATAN: neraca saldo tidak seimbang. Selisih: ' + tbDiff)
    : tr_('Check: debits equal credits.', 'Periksa: debit sama dengan kredit.')] });
  if (plAccs.some(a => r2_(net(a.code, 0, prev(fys))) !== 0)) {
    tbRows.push({ k: 'n', c: ['', tr_('Profit and loss accounts still carry balances from earlier financial years. They stay in the ledger until closing entries move them to retained earnings.',
      'Akun laba dan rugi masih memiliki saldo dari tahun buku sebelumnya. Akun tersebut tetap ada dalam buku besar hingga jurnal penutup memindahkannya ke Laba Ditahan.')] });
  }
  const tb = { title: co + ' - ' + tr_('Trial Balance', 'Neraca Saldo'), subtitle: displayLabel,
    header: [tr_('Code', 'Kode'), tr_('Account', 'Akun'), tr_('Opening debit', 'Saldo Awal Debit'), tr_('Opening credit', 'Saldo Awal Kredit'),
      tr_('Movement debit', 'Mutasi Debit'), tr_('Movement credit', 'Mutasi Kredit'), tr_('Ending debit', 'Saldo Akhir Debit'), tr_('Ending credit', 'Saldo Akhir Kredit')],
    rows: tbRows, numFrom: 3, decimals: 2, widths: [80, 320, 120, 120, 120, 120, 120, 120], diff: tbDiff };

  /* ---------- General ledger ---------- */
  const glRows = [];
  accs.forEach(a => {
    const list = (tx.get(a.code) || []).filter(r => r.period === period).sort((x, y) => (x.date - y.date) || String(x.id).localeCompare(String(y.id)) || (x.line - y.line));
    const open = net(a.code, 0, pm);
    if (!r2_(open) && !list.length) return;
    const sign = a.normal === 'CREDIT' ? -1 : 1;
    let bal = open * sign;
    glRows.push({ k: 'h', c: [a.code + ' - ' + a.name] });
    glRows.push({ k: 'l', c: ['', '', '', '', tr_('Opening balance', 'Saldo Awal'), '', '', '', r2_(bal)] });
    list.forEach(r => {
      bal += (r.debit - r.credit) * sign;
      glRows.push({ k: 'l', c: [r.date, r.id, r.type, r.ref, r.ldesc || r.desc, r.party, r.debit ? r2_(r.debit) : '', r.credit ? r2_(r.credit) : '', r2_(bal)] });
    });
    glRows.push({ k: 's', c: ['', '', '', '', tr_('Ending balance', 'Saldo Akhir'), '', r2_(sum(list, r => r.debit)), r2_(sum(list, r => r.credit)), r2_(bal)] });
  });
  const gl = { title: co + ' - ' + tr_('General Ledger', 'Buku Besar'), subtitle: displayLabel,
    header: [tr_('Date', 'Tanggal'), tr_('Journal ID', 'ID Jurnal'), tr_('Type', 'Jenis'), tr_('Reference', 'Referensi'), tr_('Description', 'Keterangan'),
      tr_('Customer / Supplier', 'Pelanggan / Pemasok'), tr_('Debit', 'Debit'), tr_('Credit', 'Kredit'), tr_('Balance', 'Saldo')],
    rows: glRows, numFrom: 7, decimals: 2, widths: [95, 120, 170, 120, 300, 160, 110, 110, 120], dateCol: 1 };

  /* ---------- Income statement ---------- */
  const cols = [[period, period], [fys, period]];
  const plNet = (a, c) => net(a.code, c[0], c[1], NO_FLOW);
  const groupsOf = s => Array.from(new Set(accs.filter(a => sec.get(a.code) === s).map(a => a.group)));
  const secDef = [
    ['REV', tr_('Revenue', 'Pendapatan'), -1, tr_('Total revenue', 'Total Pendapatan')],
    ['CONTRA', tr_('Sales adjustments', 'Penyesuaian Penjualan'), -1, tr_('Total sales adjustments', 'Total Penyesuaian Penjualan')],
    ['COS', tr_('Cost of sales', 'Beban Pokok Penjualan'), 1, tr_('Total cost of sales', 'Total Beban Pokok Penjualan')],
    ['OPEX', tr_('Operating expenses', 'Beban Operasional'), 1, tr_('Total operating expenses', 'Total Beban Operasional')],
    ['OI', tr_('Other income', 'Pendapatan Lain-lain'), -1, tr_('Total other income', 'Total Pendapatan Lain-lain')],
    ['OX', tr_('Other expenses', 'Beban Lain-lain'), 1, tr_('Total other expenses', 'Total Beban Lain-lain')],
    ['TAX', tr_('Income tax expense', 'Beban Pajak Penghasilan'), 1, tr_('Total income tax expense', 'Total Beban Pajak Penghasilan')]
  ];
  const tot = {};
  const isRows = [];
  const pair = f => cols.map(c => r2_(f(c)));
  const computed = {
    CONTRA: [tr_('Net revenue', 'Pendapatan Bersih'), () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i])],
    COS: [tr_('Gross profit', 'Laba Kotor'), () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i])],
    OPEX: [tr_('Operating profit', 'Laba Operasional'), () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i])],
    OX: [tr_('Profit before income tax', 'Laba sebelum pajak penghasilan'), () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i] + tot.OI[i] - tot.OX[i])],
    TAX: [tr_('Net profit', 'Laba Bersih'), () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i] + tot.OI[i] - tot.OX[i] - tot.TAX[i])]
  };
  let netProfit = [0, 0];
  secDef.forEach(d => {
    const lines = [];
    groupsOf(d[0]).forEach(g => {
      const list = accs.filter(a => sec.get(a.code) === d[0] && a.group === g);
      const v = pair(c => d[2] * sum(list, a => plNet(a, c)));
      if (v[0] || v[1]) lines.push([g, v[0], v[1]]);
    });
    tot[d[0]] = [r2_(sum(lines, l => l[1])), r2_(sum(lines, l => l[2]))];
    if (lines.length) {
      isRows.push({ k: 'h', c: [d[1]] });
      lines.forEach(l => isRows.push({ k: 'l', c: ['   ' + l[0], l[1], l[2]] }));
      isRows.push({ k: 's', c: [d[3], tot[d[0]][0], tot[d[0]][1]] });
    }
    if (computed[d[0]]) {
      const v = computed[d[0]][1]().map(r2_);
      isRows.push({ k: d[0] === 'TAX' ? 't' : 's', c: [computed[d[0]][0], v[0], v[1]] });
      if (d[0] === 'TAX') netProfit = v;
    }
  });
  warnings.forEach(w => isRows.push({ k: 'x', c: [w] }));
  const is = { title: co + ' - ' + tr_('Income Statement', 'Laporan Laba Rugi'), subtitle: displayLabel,
    header: ['', tr_('This month', 'Bulan Ini'), tr_('Year to date', 'Sampai dengan Tahun Berjalan')],
    rows: isRows, numFrom: 2, decimals: 0, widths: [380, 140, 140], net: netProfit };

  /* ---------- Balance sheet ---------- */
  const bsAt = P => {
    const f = fysOf(P);
    const bal = {};
    bsAccs.forEach(a => { bal[a.code] = net(a.code, 0, P); });
    return { bal: bal, cur: -sum(plAccs, a => net(a.code, f, P)), prior: -sum(plAccs, a => net(a.code, 0, prev(f))) };
  };
  const B = [bsAt(period), bsAt(pm)];
  const bsRows = [];
  const bsTot = {};
  const bsSection = (s, title, sign, totalLabel) => {
    const lines = [];
    groupsOf(s).forEach(g => {
      const list = accs.filter(a => sec.get(a.code) === s && a.group === g);
      const v = B.map(b => r2_(sign * sum(list, a => b.bal[a.code])));
      if (v[0] || v[1]) lines.push([g, v[0], v[1]]);
    });
    if (s === 'EQ') {
      const pr = B.map(b => r2_(b.prior)), cu = B.map(b => r2_(b.cur));
      if (pr[0] || pr[1]) lines.push([tr_("Prior years' profit not yet closed to retained earnings", "Laba tahun-tahun sebelumnya yang belum ditutup ke Laba Ditahan"), pr[0], pr[1]]);
      if (cu[0] || cu[1]) lines.push([tr_('Current year profit or loss', 'Laba atau rugi tahun berjalan'), cu[0], cu[1]]);
    }
    bsTot[s] = [r2_(sum(lines, l => l[1])), r2_(sum(lines, l => l[2]))];
    if (lines.length) {
      bsRows.push({ k: 'h', c: [title] });
      lines.forEach(l => bsRows.push({ k: 'l', c: ['   ' + l[0], l[1], l[2]] }));
      bsRows.push({ k: 's', c: [totalLabel, bsTot[s][0], bsTot[s][1]] });
    }
  };
  bsSection('CA', tr_('Current assets', 'Aset Lancar'), 1, tr_('Total current assets', 'Total Aset Lancar'));
  bsSection('NCA', tr_('Non-current assets', 'Aset Tidak Lancar'), 1, tr_('Total non-current assets', 'Total Aset Tidak Lancar'));
  const ta = [0, 1].map(i => r2_(bsTot.CA[i] + bsTot.NCA[i]));
  bsRows.push({ k: 't', c: [tr_('Total assets', 'Total Aset'), ta[0], ta[1]] });
  bsSection('CL', tr_('Current liabilities', 'Liabilitas Lancar'), -1, tr_('Total current liabilities', 'Total Liabilitas Lancar'));
  bsSection('NCL', tr_('Non-current liabilities', 'Liabilitas Tidak Lancar'), -1, tr_('Total non-current liabilities', 'Total Liabilitas Tidak Lancar'));
  const tl = [0, 1].map(i => r2_(bsTot.CL[i] + bsTot.NCL[i]));
  bsRows.push({ k: 's', c: [tr_('Total liabilities', 'Total Liabilitas'), tl[0], tl[1]] });
  bsSection('EQ', tr_('Equity', 'Ekuitas'), -1, tr_('Total equity', 'Total Ekuitas'));
  const tle = [0, 1].map(i => r2_(tl[i] + bsTot.EQ[i]));
  bsRows.push({ k: 't', c: [tr_('Total liabilities and equity', 'Total Liabilitas dan Ekuitas'), tle[0], tle[1]] });
  const bsDiff = [0, 1].map(i => r2_(ta[i] - tle[i]));
  bsRows.push({ k: bsDiff[0] || bsDiff[1] ? 'x' : 'n', c: [bsDiff[0] || bsDiff[1]
    ? tr_('WARNING: assets do not equal liabilities plus equity. Difference: ' + bsDiff[0], 'PERINGATAN: aset tidak sama dengan liabilitas ditambah ekuitas. Selisih: ' + bsDiff[0])
    : tr_('Check: assets equal liabilities plus equity.', 'Periksa: aset sama dengan liabilitas ditambah ekuitas.'), bsDiff[0], bsDiff[1]] });
  warnings.forEach(w => bsRows.push({ k: 'x', c: [w] }));
  const bs = { title: co + ' - ' + tr_('Balance Sheet', 'Neraca'), subtitle: bsLabel,
    header: ['', tr_('This month end', 'Akhir Bulan Ini'), tr_('Previous month end', 'Akhir Bulan Sebelumnya')],
    rows: bsRows, numFrom: 2, decimals: 0, widths: [420, 150, 150], ta: ta, tl: tl, te: bsTot.EQ, diff: bsDiff[0] };

  /* ---------- Equity changes (year to date) ---------- */
  const eqAccs = accs.filter(a => sec.get(a.code) === 'EQ');
  const isCap = a => /contributed capital/i.test(a.parent), isDist = a => /^distributions$/i.test(a.parent);
  const capAccs = eqAccs.filter(isCap), distAccs = eqAccs.filter(isDist), otherEq = eqAccs.filter(a => !isCap(a) && !isDist(a));
  const preFys = prev(fys);
  const openCap = -sum(capAccs, a => net(a.code, 0, preFys) + netType(a.code, fys, period, 'Opening Entry'));
  const openRe = -sum(eqAccs.filter(a => !isCap(a)), a => net(a.code, 0, preFys) + netType(a.code, fys, period, 'Opening Entry')) - sum(plAccs, a => net(a.code, 0, preFys));
  const mvProfit = netProfit[1];
  const mvCap = -sum(capAccs, a => net(a.code, fys, period, NO_FLOW));
  const mvDist = -sum(distAccs, a => net(a.code, fys, period, NO_FLOW));
  const mvOther = -sum(otherEq, a => net(a.code, fys, period, NO_FLOW));
  const closeCap = openCap + mvCap, closeRe = openRe + mvProfit + mvDist + mvOther;
  const eqRows = [
    { k: 'l', c: [tr_('Balance at start of the financial year', 'Saldo pada awal tahun buku'), r2_(openCap), r2_(openRe), r2_(openCap + openRe)] },
    { k: 'l', c: [tr_('Profit for the year to date', 'Laba untuk tahun berjalan'), '', r2_(mvProfit), r2_(mvProfit)] },
    { k: 'l', c: [tr_('Capital contributed or returned', 'Modal yang disetor atau dikembalikan'), r2_(mvCap), '', r2_(mvCap)] },
    { k: 'l', c: [tr_('Owner withdrawals and dividends', 'Penarikan pemilik dan dividen'), '', r2_(mvDist), r2_(mvDist)] },
    { k: 'l', c: [tr_('Other movements in equity', 'Pergerakan ekuitas lainnya'), '', r2_(mvOther), r2_(mvOther)] },
    { k: 't', c: [tr_('Balance at end of the period', 'Saldo pada akhir periode'), r2_(closeCap), r2_(closeRe), r2_(closeCap + closeRe)] }
  ];
  const eqDiff = r2_(closeCap + closeRe - bsTot.EQ[0]);
  eqRows.push({ k: eqDiff ? 'x' : 'n', c: [eqDiff
    ? tr_('WARNING: closing equity differs from the balance sheet by ' + eqDiff, 'PERINGATAN: saldo akhir ekuitas berbeda dengan neraca sebesar ' + eqDiff)
    : tr_('Check: closing equity agrees with the balance sheet.', 'Periksa: saldo akhir ekuitas sesuai dengan neraca.')] });
  const eq = { title: co + ' - ' + tr_('Statement of Changes in Equity', 'Laporan Perubahan Ekuitas'), subtitle: eqLabel,
    header: ['', tr_('Contributed capital', 'Modal Disetor'), tr_('Retained earnings and other', 'Laba Ditahan dan Lainnya'), tr_('Total equity', 'Total Ekuitas')],
    rows: eqRows, numFrom: 2, decimals: 0, widths: [380, 150, 190, 150], closing: closeCap + closeRe, diff: eqDiff };

  /* ---------- Cash flow (indirect) ---------- */
  const isCash = a => a.group === 'Cash & Cash Equivalents';
  const bucket = a => {
    const s = sec.get(a.code);
    if (isCash(a)) return 'CASH';
    if (s === 'EQ') return 'FIN';
    if (s === 'NCA' || /short-term investments/i.test(a.parent)) return 'INV';
    if (s === 'NCL') return /employee benefit/i.test(a.group) ? 'OPS' : 'FIN';
    if (s === 'CL') return /financial liabilities/i.test(a.parent) || /due to shareholders|dividends payable/i.test(a.group) ? 'FIN' : 'OPS';
    return 'OPS';
  };
  const cfPair = f => cols.map(c => r2_(f(c)));
  const effect = (list, c) => -sum(list, a => net(a.code, c[0], c[1], NO_FLOW));
  const deprAccs = plAccs.filter(a => /depreciation & amortization/i.test(a.parent));
  const glAccs = plAccs.filter(a => /disposal/i.test(a.group) && ['OI', 'OX'].includes(sec.get(a.code)));
  const dep = cfPair(c => sum(deprAccs, a => plNet(a, c)));
  const gain = cfPair(c => -sum(glAccs, a => plNet(a, c)));
  const cfRows = [];
  const buckets = { OPS: [], INV: [], FIN: [] };
  const sectionLines = (b) => {
    const lines = [];
    Array.from(new Set(bsAccs.filter(a => bucket(a) === b).map(a => a.group))).forEach(g => {
      const list = bsAccs.filter(a => bucket(a) === b && a.group === g);
      const first = list[0], s = sec.get(first.code);
      const v = cfPair(c => effect(list, c));
      const prefix = b === 'OPS'
        ? (s === 'CA' ? tr_('(Increase) or decrease in ', '(Kenaikan) atau penurunan ') : tr_('Increase or (decrease) in ', 'Kenaikan atau (penurunan) '))
        : tr_('Net movement in ', 'Pergerakan bersih ');
      if (v[0] || v[1]) lines.push([prefix + g.toLowerCase(), v[0], v[1]]);
    });
    return lines;
  };
  const opLines = [[tr_('Net profit', 'Laba Bersih'), netProfit[0], netProfit[1]]];
  if (dep[0] || dep[1]) opLines.push([tr_('Add back depreciation and amortization', 'Ditambahkan kembali penyusutan dan amortisasi'), dep[0], dep[1]]);
  if (gain[0] || gain[1]) opLines.push([tr_('Remove gain or loss on disposal of assets', 'Dikurangi keuntungan atau kerugian pelepasan aset'), -gain[0], -gain[1]]);
  sectionLines('OPS').forEach(l => opLines.push(l));
  const invLines = sectionLines('INV');
  if (dep[0] || dep[1]) invLines.push([tr_('Less: depreciation and amortization added back in operating activities', 'Dikurangi: penyusutan dan amortisasi yang ditambahkan kembali pada aktivitas operasi'), -dep[0], -dep[1]]);
  if (gain[0] || gain[1]) invLines.push([tr_('Gain or loss on disposal included in proceeds', 'Keuntungan atau kerugian pelepasan aset yang termasuk dalam penerimaan'), gain[0], gain[1]]);
  const finLines = sectionLines('FIN');
  const block = (title, lines, totalLabel) => {
    cfRows.push({ k: 'h', c: [title] });
    lines.forEach(l => cfRows.push({ k: 'l', c: ['   ' + l[0], r2_(l[1]), r2_(l[2])] }));
    const t = [r2_(sum(lines, l => l[1])), r2_(sum(lines, l => l[2]))];
    cfRows.push({ k: 's', c: [totalLabel, t[0], t[1]] });
    return t;
  };
  const op = block(tr_('Operating activities', 'Aktivitas Operasi'), opLines, tr_('Net cash from operating activities', 'Kas bersih dari aktivitas operasi'));
  const inv = block(tr_('Investing activities', 'Aktivitas Investasi'), invLines, tr_('Net cash from investing activities', 'Kas bersih dari aktivitas investasi'));
  const fin = block(tr_('Financing activities', 'Aktivitas Pendanaan'), finLines, tr_('Net cash from financing activities', 'Kas bersih dari aktivitas pendanaan'));
  const netChange = [0, 1].map(i => r2_(op[i] + inv[i] + fin[i]));
  const cashAccs = bsAccs.filter(isCash);
  const cashNet = cfPair(c => sum(cashAccs, a => net(a.code, c[0], c[1], NO_FLOW)));
  const cashEnd = r2_(sum(cashAccs, a => net(a.code, 0, period)));
  cfRows.push({ k: 't', c: [tr_('Net increase or (decrease) in cash', 'Kenaikan atau (penurunan) kas bersih'), netChange[0], netChange[1]] });
  cfRows.push({ k: 'l', c: [tr_('Cash and cash equivalents at the start of the period', 'Kas dan setara kas pada awal periode'), r2_(cashEnd - cashNet[0]), r2_(cashEnd - cashNet[1])] });
  cfRows.push({ k: 't', c: [tr_('Cash and cash equivalents at the end of the period', 'Kas dan setara kas pada akhir periode'), cashEnd, cashEnd] });
  const cfDiff = [0, 1].map(i => r2_(netChange[i] - cashNet[i]));
  cfRows.push({ k: cfDiff[0] || cfDiff[1] ? 'x' : 'n', c: [cfDiff[0] || cfDiff[1]
    ? tr_('WARNING: the cash flow differs from the actual cash movement. Check unmapped accounts.', 'PERINGATAN: arus kas berbeda dengan pergerakan kas sebenarnya. Periksa akun yang belum dipetakan.')
    : tr_('Check: the cash flow agrees with the change in cash and bank accounts.', 'Periksa: arus kas sesuai dengan perubahan akun kas dan bank.'), cfDiff[0], cfDiff[1]] });
  const cf = { title: co + ' - ' + tr_('Cash Flow Statement (indirect method)', 'Laporan Arus Kas (metode tidak langsung)'), subtitle: displayLabel,
    header: ['', tr_('This month', 'Bulan Ini'), tr_('Year to date', 'Sampai dengan Tahun Berjalan')],
    rows: cfRows, numFrom: 2, decimals: 0, widths: [460, 140, 140], diff: cfDiff, net: netChange };

  return { tb: tb, gl: gl, is: is, bs: bs, eq: eq, cf: cf, warnings: warnings };
}


/* ============================================================
   MENU ACTIONS AND SHEET WRITING
============================================================ */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function getReportSelection_() {
  const props = PropertiesService.getDocumentProperties();
  const now = new Date();
  const fallback = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let period = String(props.getProperty('REPORT_PERIOD') || fallback).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) period = fallback;
  let mode = String(props.getProperty('REPORT_MODE') || 'all');
  if (mode === 'balance') mode = 'custom';
  if (['all', 'custom'].indexOf(mode) < 0) mode = 'all';
  let reports = [];
  try {
    const saved = JSON.parse(props.getProperty('REPORT_SELECTION') || 'null');
    if (Array.isArray(saved)) reports = saved.filter(key => REPORT_KEYS.indexOf(key) >= 0);
  } catch (e) {}
  if (mode === 'all' || !reports.length) { mode = 'all'; reports = REPORT_KEYS.slice(); }
  return { period: period, mode: mode, reports: reports };
}

function showReportDialog_() {
  const indonesian = getLanguage() === 'ID';
  const t = HtmlService.createTemplateFromFile(indonesian ? 'ReportOptionsId' : 'ReportOptions');
  t.initial = getReportSelection_();
  SpreadsheetApp.getUi().showModalDialog(
    t.evaluate().setWidth(500).setHeight(540),
    indonesian ? 'Pilih Laporan' : 'Choose Reports'
  );
}

function generateReports() {
  showReportDialog_();
}

function generateReportSelection(payload) {
  const p = payload || {};
  const period = String(p.period || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(tr_('Enter the month as YYYY-MM, for example 2026-11.', 'Masukkan bulan dalam format YYYY-MM, misalnya 2026-11.'));
  }
  const mode = String(p.mode || '');
  let reports;
  if (mode === 'all') reports = REPORT_KEYS.slice();
  else if (mode === 'custom') {
    reports = Array.isArray(p.reports) ? p.reports.filter(key => REPORT_KEYS.indexOf(key) >= 0) : [];
    if (!reports.length) throw new Error(tr_('Choose at least one report.', 'Pilih minimal satu laporan.'));
  } else throw new Error(tr_('Choose a report option.', 'Pilih opsi laporan.'));

  const props = PropertiesService.getDocumentProperties();
  props.setProperty('REPORT_PERIOD', period);
  props.setProperty('REPORT_MODE', mode);
  props.setProperty('REPORT_SELECTION', JSON.stringify(reports));
  const result = runReports_(period, reports, { web: p.web === true });
  return { period: period, reports: reports, message: result.message, sheets: result.sheets };
}

function refreshReports() {
  const selection = getReportSelection_();
  runReports_(selection.period, selection.reports);
}

function loadPostedForReports_() {
  const sheet = getRequiredSheet_(SHEETS.JOURNAL);
  if (sheet.getLastRow() < 2) return [];
  const out = [];
  sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues().forEach(r => {
    if (String(r[COL.status]) !== STATUS.POSTED) return;
    const date = r[COL.date] instanceof Date ? r[COL.date] : new Date(r[COL.date]);
    const period = Number(r[COL.period]) || (date.getFullYear() * 100 + date.getMonth() + 1);
    out.push({
      period: period, date: date, id: String(r[COL.id]), line: Number(r[COL.line]) || 0, type: String(r[COL.type]),
      ref: String(r[COL.reference]), desc: String(r[COL.description]), ldesc: String(r[COL.lineDescription]),
      party: String(r[COL.party]), partyId: String(r[COL.partyId] || ''), due: r[COL.dueDate] instanceof Date ? r[COL.dueDate] : null,
      code: String(r[COL.accountCode]).trim(),
      debit: Number(r[COL.debit]) || 0, credit: Number(r[COL.credit]) || 0
    });
  });
  return out;
}

function runReports_(text, keys, options) {
  const web = !!(options && options.web);
  const ui = web ? null : SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requested = Array.isArray(keys) ? keys.filter(key => REPORT_KEYS.indexOf(key) >= 0) : REPORT_KEYS.slice();
  const chosen = requested.length ? requested : REPORT_KEYS.slice();
  const reportOptions = chosen.map(key => REPORT_OPTIONS.filter(o => o.key === key)[0]);
  const period = Number(text.replace('-', ''));
  const settings = readSettings_();
  const m0 = Number(settings['Fiscal Year Start Month']) || 1;
  const year = Math.floor(period / 100), mi = period % 100 - 1;
  const monthEn = MONTH_NAMES[mi] + ' ' + year, monthId = MONTH_NAMES_ID[mi] + ' ' + year;
  const label = tr_('For the month ended ' + monthEn, 'Untuk bulan yang berakhir pada ' + monthId);
  const bsLabel = tr_('As at end of the month ended ' + monthEn, 'Pada akhir bulan ' + monthId);
  const eqLabel = tr_('Year to date to ' + monthEn, 'Sampai dengan tahun berjalan pada ' + monthId);
  const meta = { company: settings['Company Name'] || '', label: label, bsLabel: bsLabel, eqLabel: eqLabel };
  const reports = computeReports_(loadPostedForReports_(), readCoa_(), period, m0, meta);
  const written = [];
  reportOptions.forEach(opt => {
    const sh = ss.getSheetByName(opt.sheet);
    if (sh && sh.isHidden()) sh.showSheet();
    writeReport_(opt.sheet, reports[opt.key]);
    written.push(opt.sheet);
  });
  const firstKey = chosen.indexOf('is') >= 0 ? 'is' : chosen[0];
  const firstOption = REPORT_OPTIONS.filter(o => o.key === firstKey)[0];
  const active = ss.getSheetByName(firstOption.sheet);
  if (active) ss.setActiveSheet(active);
  REPORT_OPTIONS.forEach(opt => {
    if (chosen.indexOf(opt.key) >= 0) return;
    const sh = ss.getSheetByName(opt.sheet);
    if (sh && !sh.isHidden() && sh.getSheetId() !== ss.getActiveSheet().getSheetId()) sh.hideSheet();
  });
  const checksByKey = {
    tb: tr_('Trial balance: ' + (reports.tb.diff ? 'DOES NOT BALANCE (' + reports.tb.diff + ')' : 'balanced'),
      'Neraca Saldo: ' + (reports.tb.diff ? 'TIDAK SEIMBANG (' + reports.tb.diff + ')' : 'seimbang')),
    bs: tr_('Balance sheet: ' + (reports.bs.diff ? 'DOES NOT BALANCE (' + reports.bs.diff + ')' : 'balanced'),
      'Neraca: ' + (reports.bs.diff ? 'TIDAK SEIMBANG (' + reports.bs.diff + ')' : 'seimbang')),
    eq: tr_('Equity statement agrees with balance sheet: ' + (reports.eq.diff ? 'NO (' + reports.eq.diff + ')' : 'yes'),
      'Laporan perubahan ekuitas sesuai dengan neraca: ' + (reports.eq.diff ? 'TIDAK (' + reports.eq.diff + ')' : 'ya')),
    cf: tr_('Cash flow agrees with cash and bank: ' + (reports.cf.diff[0] || reports.cf.diff[1] ? 'NO' : 'yes'),
      'Arus kas sesuai dengan kas dan bank: ' + (reports.cf.diff[0] || reports.cf.diff[1] ? 'TIDAK' : 'ya'))
  };
  const checks = chosen.map(key => checksByKey[key]).filter(Boolean);
  const message = checks.concat(reports.warnings).join('\n') + tr_('\n\nSheets: ', '\n\nLembar: ') + written.join(', ') + '.';
  if (web) return { success: true, sheets: written, checks: checks, message: message };
  ui.alert(tr_('Reports for ' + monthEn, 'Laporan untuk bulan ' + monthId), message, ui.ButtonSet.OK);
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function writeReport_(name, rep) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (sh) {
    sh.clear();
    sh.setFrozenRows(0);
    if (sh.getImages) sh.getImages().forEach(image => image.remove());
  } else sh = ss.insertSheet(name);
  const settings = readSettings_();
  const mode = getCompanyMode_();
  const banner = mode === 'LIVE' ? tr_('LIVE MODE', 'MODE LANGSUNG') : tr_('PRACTICE MODE — not company data', 'MODE LATIHAN — bukan data perusahaan');
  const npwp = settings['NPWP'] || '';
  const width = rep.header.length;
  const pad = c => c.concat(new Array(width - c.length).fill(''));
  const data = [
    pad([rep.title]),
    pad([npwp ? tr_('NPWP: ', 'NPWP: ') + npwp : '']),
    pad([banner]),
    pad([rep.subtitle]),
    pad([]),
    rep.header
  ].concat(rep.rows.map(r => pad(r.c)));
  if (sh.getMaxRows() < data.length + 5) sh.insertRowsAfter(sh.getMaxRows(), data.length + 5 - sh.getMaxRows());
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.getRange(1, 1, data.length, width).setValues(data);

  const last = colLetter_(width), first = 7;
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setFontColor('#5d6b65');
  sh.getRange(3, 1, 1, width).setFontWeight('bold')
    .setBackground(mode === 'LIVE' ? '#e2eee8' : '#fff3cd')
    .setFontColor(mode === 'LIVE' ? '#1f5c46' : '#8a5a00');
  sh.getRange(4, 1).setFontColor('#5d6b65');
  sh.getRange(6, 1, 1, width).setFontWeight('bold').setBackground('#1f5c46').setFontColor('#ffffff');
  sh.getRange(first, rep.numFrom, rep.rows.length, width - rep.numFrom + 1)
    .setNumberFormat(rep.decimals ? '#,##0.00;(#,##0.00);-' : '#,##0;(#,##0);-').setHorizontalAlignment('right');
  if (rep.dateCol) sh.getRange(first, rep.dateCol, rep.rows.length, 1).setNumberFormat('dd mmm yyyy').setHorizontalAlignment('left');
  const ranges = kinds => rep.rows.map((r, i) => (kinds.includes(r.k) ? `A${i + first}:${last}${i + first}` : null)).filter(Boolean);
  const apply = (kinds, fn) => { const l = ranges(kinds); if (l.length) fn(sh.getRangeList(l)); };
  apply(['h'], rl => rl.setFontWeight('bold').setBackground('#e2eee8'));
  apply(['s'], rl => rl.setFontWeight('bold').setBorder(true, null, null, null, null, null, '#9fb0a4', SpreadsheetApp.BorderStyle.SOLID));
  apply(['t'], rl => rl.setFontWeight('bold').setBackground('#f4f7f3').setBorder(true, null, true, null, null, null, '#1d2a25', SpreadsheetApp.BorderStyle.DOUBLE));
  apply(['n'], rl => rl.setFontColor('#5d6b65').setFontStyle('italic'));
  apply(['x'], rl => rl.setFontColor('#a8322a').setFontWeight('bold'));
  rep.widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(6);
  const logo = settings['Company Logo'] || '';
  const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(logo);
  if (match) {
    try {
      const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), 'image/' + match[1], 'company-logo');
      const totalWidth = (rep.widths || []).reduce((sum, value) => sum + value, 0);
      const image = sh.insertImage(blob, 1, 1, Math.max(0, totalWidth - 80), 0);
      image.setWidth(72).setHeight(72);
    } catch (e) {}
  }
}
