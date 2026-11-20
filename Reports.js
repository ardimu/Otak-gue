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

const REPORT_SHEETS = ['Trial Balance', 'General Ledger', 'Income Statement', 'Balance Sheet', 'Equity Changes', 'Cash Flow'];
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
  const warnings = [];
  accs.filter(a => sec.get(a.code) === '?' && (tx.get(a.code) || []).length).forEach(a =>
    warnings.push(`Account ${a.code} ${a.name} has an unknown Account Type or Category ("${a.type}" / "${a.category}"). It is left out of the statements.`));
  if (unknown.size) warnings.push('Journal lines use account codes that are not in the COA: ' + Array.from(unknown).join(', ') + '.');

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
  tbRows.push({ k: 't', c: ['', 'Total', r2_(T.od), r2_(T.oc), r2_(T.md), r2_(T.mc), r2_(T.ed), r2_(T.ec)] });
  const tbDiff = r2_(T.ed - T.ec);
  tbRows.push({ k: tbDiff ? 'x' : 'n', c: ['', tbDiff ? 'WARNING: the trial balance does not balance. Difference: ' + tbDiff : 'Check: debits equal credits.'] });
  if (plAccs.some(a => r2_(net(a.code, 0, prev(fys))) !== 0)) {
    tbRows.push({ k: 'n', c: ['', 'Profit and loss accounts still carry balances from earlier financial years. They stay in the ledger until closing entries move them to retained earnings.'] });
  }
  const tb = { title: co + ' - Trial Balance', subtitle: label, header: ['Code', 'Account', 'Opening debit', 'Opening credit', 'Movement debit', 'Movement credit', 'Ending debit', 'Ending credit'],
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
    glRows.push({ k: 'l', c: ['', '', '', '', 'Opening balance', '', '', '', r2_(bal)] });
    list.forEach(r => {
      bal += (r.debit - r.credit) * sign;
      glRows.push({ k: 'l', c: [r.date, r.id, r.type, r.ref, r.ldesc || r.desc, r.party, r.debit ? r2_(r.debit) : '', r.credit ? r2_(r.credit) : '', r2_(bal)] });
    });
    glRows.push({ k: 's', c: ['', '', '', '', 'Ending balance', '', r2_(sum(list, r => r.debit)), r2_(sum(list, r => r.credit)), r2_(bal)] });
  });
  const gl = { title: co + ' - General Ledger', subtitle: label, header: ['Date', 'Journal ID', 'Type', 'Reference', 'Description', 'Customer / Supplier', 'Debit', 'Credit', 'Balance'],
    rows: glRows, numFrom: 7, decimals: 2, widths: [95, 120, 170, 120, 300, 160, 110, 110, 120], dateCol: 1 };

  /* ---------- Income statement ---------- */
  const cols = [[period, period], [fys, period]];
  const plNet = (a, c) => net(a.code, c[0], c[1], NO_FLOW);
  const groupsOf = s => Array.from(new Set(accs.filter(a => sec.get(a.code) === s).map(a => a.group)));
  const secDef = [['REV', 'Revenue', -1], ['CONTRA', 'Sales adjustments', -1], ['COS', 'Cost of sales', 1], ['OPEX', 'Operating expenses', 1],
    ['OI', 'Other income', -1], ['OX', 'Other expenses', 1], ['TAX', 'Income tax expense', 1]];
  const tot = {};
  const isRows = [];
  const pair = f => cols.map(c => r2_(f(c)));
  const computed = {
    CONTRA: ['Net revenue', () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i])],
    COS: ['Gross profit', () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i])],
    OPEX: ['Operating profit', () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i])],
    OX: ['Profit before income tax', () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i] + tot.OI[i] - tot.OX[i])],
    TAX: ['Net profit', () => [0, 1].map(i => tot.REV[i] + tot.CONTRA[i] - tot.COS[i] - tot.OPEX[i] + tot.OI[i] - tot.OX[i] - tot.TAX[i])]
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
      isRows.push({ k: 's', c: ['Total ' + d[1].toLowerCase(), tot[d[0]][0], tot[d[0]][1]] });
    }
    if (computed[d[0]]) {
      const v = computed[d[0]][1]().map(r2_);
      isRows.push({ k: d[0] === 'TAX' ? 't' : 's', c: [computed[d[0]][0], v[0], v[1]] });
      if (d[0] === 'TAX') netProfit = v;
    }
  });
  warnings.forEach(w => isRows.push({ k: 'x', c: [w] }));
  const is = { title: co + ' - Income Statement', subtitle: label, header: ['', 'This month', 'Year to date'], rows: isRows, numFrom: 2, decimals: 0, widths: [380, 140, 140], net: netProfit };

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
  const bsSection = (s, title, sign) => {
    const lines = [];
    groupsOf(s).forEach(g => {
      const list = accs.filter(a => sec.get(a.code) === s && a.group === g);
      const v = B.map(b => r2_(sign * sum(list, a => b.bal[a.code])));
      if (v[0] || v[1]) lines.push([g, v[0], v[1]]);
    });
    if (s === 'EQ') {
      const pr = B.map(b => r2_(b.prior)), cu = B.map(b => r2_(b.cur));
      if (pr[0] || pr[1]) lines.push(["Prior years' profit not yet closed to retained earnings", pr[0], pr[1]]);
      if (cu[0] || cu[1]) lines.push(['Current year profit or loss', cu[0], cu[1]]);
    }
    bsTot[s] = [r2_(sum(lines, l => l[1])), r2_(sum(lines, l => l[2]))];
    if (lines.length) {
      bsRows.push({ k: 'h', c: [title] });
      lines.forEach(l => bsRows.push({ k: 'l', c: ['   ' + l[0], l[1], l[2]] }));
      bsRows.push({ k: 's', c: ['Total ' + title.toLowerCase(), bsTot[s][0], bsTot[s][1]] });
    }
  };
  bsSection('CA', 'Current assets', 1); bsSection('NCA', 'Non-current assets', 1);
  const ta = [0, 1].map(i => r2_(bsTot.CA[i] + bsTot.NCA[i]));
  bsRows.push({ k: 't', c: ['Total assets', ta[0], ta[1]] });
  bsSection('CL', 'Current liabilities', -1); bsSection('NCL', 'Non-current liabilities', -1);
  const tl = [0, 1].map(i => r2_(bsTot.CL[i] + bsTot.NCL[i]));
  bsRows.push({ k: 's', c: ['Total liabilities', tl[0], tl[1]] });
  bsSection('EQ', 'Equity', -1);
  const tle = [0, 1].map(i => r2_(tl[i] + bsTot.EQ[i]));
  bsRows.push({ k: 't', c: ['Total liabilities and equity', tle[0], tle[1]] });
  const bsDiff = [0, 1].map(i => r2_(ta[i] - tle[i]));
  bsRows.push({ k: bsDiff[0] || bsDiff[1] ? 'x' : 'n', c: [bsDiff[0] || bsDiff[1] ? 'WARNING: assets do not equal liabilities plus equity. Difference: ' + bsDiff[0] : 'Check: assets equal liabilities plus equity.', bsDiff[0], bsDiff[1]] });
  warnings.forEach(w => bsRows.push({ k: 'x', c: [w] }));
  const bs = { title: co + ' - Balance Sheet', subtitle: label.replace('For ', 'As at end of '), header: ['', 'This month end', 'Previous month end'], rows: bsRows, numFrom: 2, decimals: 0, widths: [420, 150, 150], ta: ta, tl: tl, te: bsTot.EQ, diff: bsDiff[0] };

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
    { k: 'l', c: ['Balance at start of the financial year', r2_(openCap), r2_(openRe), r2_(openCap + openRe)] },
    { k: 'l', c: ['Profit for the year to date', '', r2_(mvProfit), r2_(mvProfit)] },
    { k: 'l', c: ['Capital contributed or returned', r2_(mvCap), '', r2_(mvCap)] },
    { k: 'l', c: ['Owner withdrawals and dividends', '', r2_(mvDist), r2_(mvDist)] },
    { k: 'l', c: ['Other movements in equity', '', r2_(mvOther), r2_(mvOther)] },
    { k: 't', c: ['Balance at end of the period', r2_(closeCap), r2_(closeRe), r2_(closeCap + closeRe)] }
  ];
  const eqDiff = r2_(closeCap + closeRe - bsTot.EQ[0]);
  eqRows.push({ k: eqDiff ? 'x' : 'n', c: [eqDiff ? 'WARNING: closing equity differs from the balance sheet by ' + eqDiff : 'Check: closing equity agrees with the balance sheet.'] });
  const eq = { title: co + ' - Statement of Changes in Equity', subtitle: label.replace(/^For .* ended/, 'Year to date to'), header: ['', 'Contributed capital', 'Retained earnings and other', 'Total equity'],
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
      if (v[0] || v[1]) lines.push([(b === 'OPS' ? (s === 'CA' ? '(Increase) or decrease in ' : 'Increase or (decrease) in ') : (b === 'INV' ? 'Net movement in ' : 'Net movement in ')) + g.toLowerCase(), v[0], v[1]]);
    });
    return lines;
  };
  const opLines = [['Net profit', netProfit[0], netProfit[1]]];
  if (dep[0] || dep[1]) opLines.push(['Add back depreciation and amortization', dep[0], dep[1]]);
  if (gain[0] || gain[1]) opLines.push(['Remove gain or loss on disposal of assets', -gain[0], -gain[1]]);
  sectionLines('OPS').forEach(l => opLines.push(l));
  const invLines = sectionLines('INV');
  if (dep[0] || dep[1]) invLines.push(['Less: depreciation and amortization added back in operating activities', -dep[0], -dep[1]]);
  if (gain[0] || gain[1]) invLines.push(['Gain or loss on disposal included in proceeds', gain[0], gain[1]]);
  const finLines = sectionLines('FIN');
  const block = (title, lines, totalLabel) => {
    cfRows.push({ k: 'h', c: [title] });
    lines.forEach(l => cfRows.push({ k: 'l', c: ['   ' + l[0], r2_(l[1]), r2_(l[2])] }));
    const t = [r2_(sum(lines, l => l[1])), r2_(sum(lines, l => l[2]))];
    cfRows.push({ k: 's', c: [totalLabel, t[0], t[1]] });
    return t;
  };
  const op = block('Operating activities', opLines, 'Net cash from operating activities');
  const inv = block('Investing activities', invLines, 'Net cash from investing activities');
  const fin = block('Financing activities', finLines, 'Net cash from financing activities');
  const netChange = [0, 1].map(i => r2_(op[i] + inv[i] + fin[i]));
  const cashAccs = bsAccs.filter(isCash);
  const cashNet = cfPair(c => sum(cashAccs, a => net(a.code, c[0], c[1], NO_FLOW)));
  const cashEnd = r2_(sum(cashAccs, a => net(a.code, 0, period)));
  cfRows.push({ k: 't', c: ['Net increase or (decrease) in cash', netChange[0], netChange[1]] });
  cfRows.push({ k: 'l', c: ['Cash and cash equivalents at the start of the period', r2_(cashEnd - cashNet[0]), r2_(cashEnd - cashNet[1])] });
  cfRows.push({ k: 't', c: ['Cash and cash equivalents at the end of the period', cashEnd, cashEnd] });
  const cfDiff = [0, 1].map(i => r2_(netChange[i] - cashNet[i]));
  cfRows.push({ k: cfDiff[0] || cfDiff[1] ? 'x' : 'n', c: [cfDiff[0] || cfDiff[1] ? 'WARNING: the cash flow differs from the actual cash movement. Check unmapped accounts.' : 'Check: the cash flow agrees with the change in cash and bank accounts.', cfDiff[0], cfDiff[1]] });
  const cf = { title: co + ' - Cash Flow Statement (indirect method)', subtitle: label, header: ['', 'This month', 'Year to date'], rows: cfRows, numFrom: 2, decimals: 0, widths: [460, 140, 140], diff: cfDiff, net: netChange };

  return { tb: tb, gl: gl, is: is, bs: bs, eq: eq, cf: cf, warnings: warnings };
}


/* ============================================================
   MENU ACTIONS AND SHEET WRITING
============================================================ */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function generateReports() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const now = new Date();
  const def = props.getProperty('REPORT_PERIOD') || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
  const res = ui.prompt('Generate reports', 'Which month? Enter it as YYYY-MM, for example 2026-11.\nOnly posted journals are included.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const text = String(res.getResponseText() || def).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) { ui.alert('Enter the month as YYYY-MM, for example 2026-11.'); return; }
  props.setProperty('REPORT_PERIOD', text);
  runReports_(text);
}

function refreshReports() {
  const p = PropertiesService.getDocumentProperties().getProperty('REPORT_PERIOD');
  if (!p) { generateReports(); return; }
  runReports_(p);
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

function runReports_(text) {
  const ui = SpreadsheetApp.getUi();
  const period = Number(text.replace('-', ''));
  const settings = readSettings_();
  const m0 = Number(settings['Fiscal Year Start Month']) || 1;
  const monthName = MONTH_NAMES[period % 100 - 1] + ' ' + Math.floor(period / 100);
  const meta = { company: settings['Company Name'] || '', label: 'For the month ended ' + monthName };
  const reports = computeReports_(loadPostedForReports_(), readCoa_(), period, m0, meta);
  writeReport_('Trial Balance', reports.tb);
  writeReport_('General Ledger', reports.gl);
  writeReport_('Income Statement', reports.is);
  writeReport_('Balance Sheet', reports.bs);
  writeReport_('Equity Changes', reports.eq);
  writeReport_('Cash Flow', reports.cf);
  const checks = [
    'Trial balance: ' + (reports.tb.diff ? 'DOES NOT BALANCE (' + reports.tb.diff + ')' : 'balanced'),
    'Balance sheet: ' + (reports.bs.diff ? 'DOES NOT BALANCE (' + reports.bs.diff + ')' : 'balanced'),
    'Equity statement agrees with balance sheet: ' + (reports.eq.diff ? 'NO (' + reports.eq.diff + ')' : 'yes'),
    'Cash flow agrees with cash and bank: ' + (reports.cf.diff[0] || reports.cf.diff[1] ? 'NO' : 'yes')
  ];
  ui.alert('Reports for ' + monthName, checks.concat(reports.warnings).join('\n') +
    '\n\nSheets: ' + REPORT_SHEETS.join(', ') + '.', ui.ButtonSet.OK);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Income Statement'));
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
  const banner = mode === 'LIVE' ? 'LIVE MODE' : 'PRACTICE MODE — not company data';
  const npwp = settings['NPWP'] || '';
  const width = rep.header.length;
  const pad = c => c.concat(new Array(width - c.length).fill(''));
  const data = [
    pad([rep.title]),
    pad([npwp ? 'NPWP: ' + npwp : '']),
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
