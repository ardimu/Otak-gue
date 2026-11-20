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
const bucketOf_ = days => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);

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
      if (!groups.has(key)) groups.set(key, { name: l.party || '(no customer or supplier)', events: [] });
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
  const who = side === 'AR' ? 'Customer' : 'Supplier', what = side === 'AR' ? 'Receivables' : 'Payables';
  const tot = [0, 0, 0, 0, 0], rows = [];
  let open = 0, un = 0;
  parties.forEach(p => {
    p.buckets.forEach((v, i) => { tot[i] += v; });
    open += p.open; un += p.unapplied;
    rows.push({ k: 'l', c: [p.name].concat(p.buckets, [p.open, p.unapplied, p.net]) });
  });
  rows.push({ k: 't', c: ['Total'].concat(tot.map(r2_), [r2_(open), r2_(un), r2_(open - un)]) });
  const unassigned = parties.find(p => p.name.indexOf('(no ') === 0);
  if (unassigned) rows.push({ k: 'x', c: ['Some lines have no ' + who.toLowerCase() + '. Edit them so they appear under the right name.'] });
  const summary = { title: meta.company + ' - ' + what + ' Aging', subtitle: 'As at ' + isoDate_(asOf) + '. Days past due date. Payments matched to the oldest invoice first.',
    header: [who].concat(AGING_BUCKETS, ['Open invoices', 'Unapplied payments', 'Net balance']), rows: rows, numFrom: 2, decimals: 0, widths: [300, 110, 110, 110, 110, 110, 130, 140, 130] };
  const items = [];
  parties.forEach(p => p.items.slice().sort((a, b) => a.due - b.due).forEach(o => {
    items.push({ k: 'l', c: [p.name, o.ref, o.id, isoDate_(o.date), isoDate_(o.due), o.amount, o.open, Math.max(o.days, 0)] });
  }));
  const detail = { title: meta.company + ' - ' + what + ' Open Items', subtitle: 'As at ' + isoDate_(asOf),
    header: [who, 'Reference', 'Journal ID', 'Date', 'Due date', 'Invoice amount', 'Open amount', 'Days overdue'], rows: items, numFrom: 6, decimals: 0, widths: [260, 140, 130, 100, 100, 130, 130, 110] };
  return { summary: summary, detail: detail, totals: { open: r2_(open), unapplied: r2_(un), overdue: r2_(tot[1] + tot[2] + tot[3] + tot[4]) } };
}

function generateAging() {
  const ui = SpreadsheetApp.getUi();
  const today = isoDate_(new Date());
  const res = ui.prompt('Receivables and payables aging', 'As at which date? Enter YYYY-MM-DD, for example ' + today + '.\nOnly posted journals are included.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  let asOf;
  try { asOf = parseLocalDate_(String(res.getResponseText() || today).trim()); } catch (e) { ui.alert('Enter the date as YYYY-MM-DD.'); return; }
  const s = readSettings_();
  const code = k => String(s[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim();
  const posted = loadPostedForReports_();
  const meta = { company: s['Company Name'] || '' };
  const out = [];
  [['AR', 'ar', 'AR'], ['AP', 'ap', 'AP']].forEach(d => {
    const lines = posted.filter(l => l.code === code(d[1]));
    const rep = agingReports_(agingBuild_(lines, d[0], asOf), d[0], asOf, meta);
    writeReport_(d[2] + ' Aging', rep.summary);
    writeReport_(d[2] + ' Open Items', rep.detail);
    out.push((d[0] === 'AR' ? 'Receivables' : 'Payables') + ': open Rp ' + fmt_(rep.totals.open) + ', overdue Rp ' + fmt_(rep.totals.overdue) +
      (rep.totals.unapplied ? ', unapplied payments Rp ' + fmt_(rep.totals.unapplied) : ''));
  });
  ui.alert('Aging as at ' + isoDate_(asOf), out.join('\n') + '\n\nSheets: AR Aging, AR Open Items, AP Aging, AP Open Items.', ui.ButtonSet.OK);
}
