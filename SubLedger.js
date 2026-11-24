/**
 * ============================================================
 * RECEIVABLES AND PAYABLES SUB-LEDGER
 * ACCOUNTING > Reports > AR and AP Aging...
 *
 * Built from POSTED journal lines on the Trade Receivables and Trade Payables accounts.
 * Each line carries a customer or supplier (required when posting). Invoices are the lines on the
 * normal side (receivable debits, payable credits). Payments are matched to the oldest open invoice
 * first (FIFO). A payment with no invoice to match becomes an "unapplied" amount (an advance).
 * Aging counts days past the due date (the invoice date when no due date was entered).
 * ============================================================
 */

const AGING_BUCKETS = ['Not yet due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days'];
const AGING_BUCKETS_ID = ['Belum jatuh tempo', '1-30 hari', '31-60 hari', '61-90 hari', 'Lebih dari 90 hari'];
const bucketOf_ = days => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);
function noPartyLabel_() { return tr_('(no customer or supplier)', '(tanpa pelanggan atau pemasok)'); }

/**
 * lines = [{date, due, id, line, ref, party, partyId, debit, credit}] on ONE control account.
 * side = 'AR' (invoice = debit) or 'AP' (invoice = credit). asOf = Date.
 */
function agingBuild_(lines, side, asOf) {
  const groups = new Map();
  lines.filter(l => l.date <= asOf)
    .sort((a, b) => (a.date - b.date) || String(a.id).localeCompare(String(b.id)) || (a.line - b.line))
    .forEach(l => {
      const key = l.partyId || l.party || '';
      if (!groups.has(key)) groups.set(key, { name: l.party || noPartyLabel_(), events: [] });
      groups.get(key).events.push(l);
    });
  const parties = [];
  groups.forEach(g => {
    const open = [];
    let pool = 0;
    g.events.forEach(l => {
      const net = side === 'AR' ? l.debit - l.credit : l.credit - l.debit;
      if (net > 0) {
        const used = Math.min(pool, net);
        pool -= used;
        if (net - used > 0.004) open.push({ ref: l.ref, id: l.id, date: l.date, due: l.due || l.date, amount: r2_(net), open: r2_(net - used) });
      } else if (net < 0) {
        let rest = -net;
        for (let i = 0; i < open.length && rest > 0.004; i++) {
          const take = Math.min(open[i].open, rest);
          open[i].open = r2_(open[i].open - take);
          rest -= take;
        }
        for (let i = open.length - 1; i >= 0; i--) if (open[i].open <= 0.004) open.splice(i, 1);
        pool += rest;
      }
    });
    const buckets = [0, 0, 0, 0, 0];
    open.forEach(o => {
      o.days = Math.floor((asOf - o.due) / 86400000);
      buckets[bucketOf_(o.days)] += o.open;
    });
    const openTotal = r2_(open.reduce((s, o) => s + o.open, 0));
    const unapplied = r2_(pool);
    if (openTotal || unapplied) {
      parties.push({ name: g.name, items: open, buckets: buckets.map(r2_), open: openTotal, unapplied: unapplied, net: r2_(openTotal - unapplied) });
    }
  });
  parties.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return parties;
}

function agingReports_(parties, side, asOf, meta) {
  const who = side === 'AR' ? tr_('Customer', 'Pelanggan') : tr_('Supplier', 'Pemasok');
  const what = side === 'AR' ? tr_('Receivables', 'Piutang') : tr_('Payables', 'Utang');
  const agingTitle = side === 'AR' ? tr_('Receivables Aging', 'Umur Piutang') : tr_('Payables Aging', 'Umur Utang');
  const itemsTitle = side === 'AR' ? tr_('Receivables Open Items', 'Item Terbuka Piutang') : tr_('Payables Open Items', 'Item Terbuka Utang');
  const tot = [0, 0, 0, 0, 0], rows = [];
  let open = 0, un = 0;
  parties.forEach(p => {
    p.buckets.forEach((v, i) => { tot[i] += v; });
    open += p.open; un += p.unapplied;
    rows.push({ k: 'l', c: [p.name].concat(p.buckets, [p.open, p.unapplied, p.net]) });
  });
  rows.push({ k: 't', c: [tr_('Total', 'Total')].concat(tot.map(r2_), [r2_(open), r2_(un), r2_(open - un)]) });
  const unassigned = parties.find(p => p.name === noPartyLabel_() || p.name.indexOf('(no ') === 0);
  if (unassigned) rows.push({ k: 'x', c: [tr_('Some lines have no ' + who.toLowerCase() + '. Edit them so they appear under the right name.',
    'Ada baris tanpa ' + who.toLowerCase() + '. Edit baris tersebut agar muncul di bawah nama yang tepat.')] });
  const summary = { title: meta.company + ' - ' + agingTitle,
    subtitle: tr_('As at ' + isoDate_(asOf) + '. Days past due date. Payments matched to the oldest invoice first.',
      'Pada ' + isoDate_(asOf) + '. Hari keterlambatan dihitung sejak tanggal jatuh tempo. Pembayaran dicocokkan dengan faktur tertua terlebih dahulu.'),
    header: [who].concat(AGING_BUCKETS.map((b, i) => tr_(b, AGING_BUCKETS_ID[i])),
      [tr_('Open invoices', 'Faktur belum lunas'), tr_('Unapplied payments', 'Pembayaran belum dialokasikan'), tr_('Net balance', 'Saldo Bersih')]),
    rows: rows, numFrom: 2, decimals: 0, widths: [300, 110, 110, 110, 110, 110, 130, 140, 130] };
  const items = [];
  parties.forEach(p => p.items.slice().sort((a, b) => a.due - b.due).forEach(o => {
    items.push({ k: 'l', c: [p.name, o.ref, o.id, isoDate_(o.date), isoDate_(o.due), o.amount, o.open, Math.max(o.days, 0)] });
  }));
  const detail = { title: meta.company + ' - ' + itemsTitle, subtitle: tr_('As at ' + isoDate_(asOf), 'Pada ' + isoDate_(asOf)),
    header: [who, tr_('Reference', 'Referensi'), tr_('Journal ID', 'ID Jurnal'), tr_('Date', 'Tanggal'), tr_('Due date', 'Tanggal Jatuh Tempo'),
      tr_('Invoice amount', 'Jumlah Faktur'), tr_('Open amount', 'Jumlah Belum Lunas'), tr_('Days overdue', 'Hari Keterlambatan')],
    rows: items, numFrom: 6, decimals: 0, widths: [260, 140, 130, 100, 100, 130, 130, 110] };
  return { summary: summary, detail: detail, totals: { open: r2_(open), unapplied: r2_(un), overdue: r2_(tot[1] + tot[2] + tot[3] + tot[4]) } };
}

function generateAging(asOf, options) {
  const web = !!(options && options.web);
  const dataOnly = !!(options && options.dataOnly);
  const ui = web ? null : SpreadsheetApp.getUi();
  const today = isoDate_(new Date());
  let raw = asOf;
  if (!web) {
    const res = ui.prompt(tr_('Receivables and payables aging', 'Umur piutang dan utang'),
      tr_('As at which date? Enter YYYY-MM-DD, for example ' + today + '.\nOnly posted journals are included.',
        'Pada tanggal berapa? Masukkan YYYY-MM-DD, misalnya ' + today + '.\nHanya jurnal yang sudah diposting yang disertakan.'), ui.ButtonSet.OK_CANCEL);
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
  const s = readSettings_();
  const code = k => String(s[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim();
  const posted = loadPostedForReports_();
  const meta = { company: s['Company Name'] || '' };
  const out = [];
  const reports = [];
  [['AR', 'ar', 'AR'], ['AP', 'ap', 'AP']].forEach(d => {
    const lines = posted.filter(l => l.code === code(d[1]));
    const rep = agingReports_(agingBuild_(lines, d[0], asOfDate), d[0], asOfDate, meta);
    reports.push({ side: d[0], report: rep });
    if (dataOnly) return;
    writeReport_(d[2] + ' Aging', rep.summary);
    writeReport_(d[2] + ' Open Items', rep.detail);
    out.push((d[0] === 'AR' ? tr_('Receivables', 'Piutang') : tr_('Payables', 'Utang')) + tr_(': open Rp ', ': saldo belum lunas Rp ') + fmt_(rep.totals.open) +
      tr_(', overdue Rp ', ', telah jatuh tempo Rp ') + fmt_(rep.totals.overdue) +
      (rep.totals.unapplied ? tr_(', unapplied payments Rp ', ', pembayaran belum dialokasikan Rp ') + fmt_(rep.totals.unapplied) : ''));
  });
  if (dataOnly) return { success: true, asOf: isoDate_(asOfDate), reports: reports };
  const sheets = 'AR Aging, AR Open Items, AP Aging, AP Open Items';
  const message = out.join('\n') + tr_('\n\nSheets: ', '\n\nLembar: ') + sheets + '.';
  if (web) return { success: true, message: message, sheets: sheets };
  ui.alert(tr_('Aging as at ' + isoDate_(asOfDate), 'Umur pada ' + isoDate_(asOfDate)), message, ui.ButtonSet.OK);
}
