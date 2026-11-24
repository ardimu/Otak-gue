/**
 * ============================================================
 * WEB APP ENTRY POINT
 * Apps Script Web App + Spreadsheet as the data store.
 * Route with ?page=... ; raw pages are rendered inside the web shell.
 * ============================================================
 */

const WEB_PAGES = {
  home: { en: 'Dashboard', id: 'Beranda', file: 'WebHome', idFile: 'WebHome' },
  'journal-new': {
    en: 'New Journal Entry', id: 'Jurnal Baru', file: 'JournalForm', idFile: 'JournalFormId',
    vars: function (params) { return { draftId: String((params && params.draftId) || ''), appMode: webRequestContext_().mode }; }
  },
  journals: { en: 'Journal List', id: 'Daftar Jurnal', file: 'JournalList', idFile: 'JournalList', dashboard: true },
  'bank-import': { en: 'Bank & Petty Cash', id: 'Bank & Kas Kecil', file: 'BankImport', idFile: 'BankImportId', dashboard: true },
  drafts: { en: 'Draft Management', id: 'Kelola Draf', file: 'DraftManagement', idFile: 'DraftManagementId', dashboard: true },
  parties: { en: 'Parties', id: 'Pihak', file: 'PartiesManager', idFile: 'PartiesManagerId', dashboard: true },
  'export-excel': { en: 'Export to Excel', id: 'Ekspor ke Excel', file: 'WebAction', idFile: 'WebAction', action: 'export-hub', dashboard: true },
  'period-end': { en: 'Period-End Tools', id: 'Alat Akhir Periode', file: 'PeriodEnd', idFile: 'PeriodEndId', dashboard: true },
  'inventory-movements': { en: 'Process Stock Movements', id: 'Proses Mutasi Persediaan', file: 'WebAction', idFile: 'WebAction', action: 'stock-movements', dashboard: true },
  'inventory-summary': { en: 'Stock Summary', id: 'Ringkasan Persediaan', file: 'WebAction', idFile: 'WebAction', action: 'stock-summary', dashboard: true },
  'reports-view': {
    en: 'Financial Report', id: 'Laporan Keuangan', file: 'ReportViewer', idFile: 'ReportViewer', dashboard: true,
    vars: function (params) { return { reportKeys: String((params && params.keys) || 'is,bs,eq,cf') }; }
  },
  'trial-balance': {
    en: 'Trial Balance', id: 'Neraca Saldo', file: 'ReportViewer', idFile: 'ReportViewer', dashboard: true,
    vars: function () { return { reportKeys: 'tb' }; }
  },
  'general-ledger': {
    en: 'General Ledger', id: 'Buku Besar', file: 'ReportViewer', idFile: 'ReportViewer', dashboard: true,
    vars: function () { return { reportKeys: 'gl' }; }
  },
  'reports-aging': { en: 'AR & AP Aging', id: 'Umur Piutang & Utang', file: 'WebAction', idFile: 'WebAction', action: 'aging', dashboard: true },
  'settings-profile': { en: 'Company Profile', id: 'Profil Perusahaan', file: 'CompanySettings', idFile: 'CompanySettingsId', tab: 'profile', dashboard: true },
  'settings-accounting': { en: 'Accounting Settings', id: 'Pengaturan Akuntansi', file: 'CompanySettings', idFile: 'CompanySettingsId', tab: 'accounting', dashboard: true },
  'settings-accounts': { en: 'Default Accounts', id: 'Akun Bawaan', file: 'CompanySettings', idFile: 'CompanySettingsId', tab: 'accounts', dashboard: true },
  'settings-system': { en: 'System Settings', id: 'Pengaturan Sistem', file: 'CompanySettings', idFile: 'CompanySettingsId', tab: 'system', dashboard: true },
  'system-install': { en: 'Install / Update System', id: 'Instal / Perbarui Sistem', file: 'WebAction', idFile: 'WebAction', action: 'install', dashboard: true },
  'system-check': { en: 'Check COA & Settings', id: 'Periksa COA & Pengaturan', file: 'WebAction', idFile: 'WebAction', action: 'check', dashboard: true },
  guide: { en: 'User Guide / SOP', id: 'Panduan Pengguna / SOP', file: 'UserGuide', idFile: 'UserGuideId', dashboard: true }
};

const WEB_NAV = [
  {
    key: 'accounting', en: 'Accounting', id: 'Akuntansi', type: 'flyout', groups: [
      {
        en: 'Transaction & Input', id: 'Transaksi & Input', items: [
          ['journals', 'Journal List', 'Daftar Jurnal', 'JL'],
          ['bank-import', 'Bank & Petty Cash', 'Bank & Kas Kecil', 'BC'],
          ['drafts', 'Draft Management', 'Kelola Draf', 'DM'],
          ['trial-balance', 'Trial Balance', 'Neraca Saldo', 'TB'],
          ['general-ledger', 'General Ledger', 'Buku Besar', 'GL']
        ]
      },
      {
        en: 'Reports', id: 'Laporan', items: [
          ['period-end', 'Period-End Tools', 'Alat Akhir Periode', 'PE'],
          ['reports-view', 'Financial Report', 'Laporan Keuangan', 'FR'],
          ['reports-aging', 'AR & AP Aging', 'Umur Piutang & Utang', 'AG']
        ]
      },
      {
        en: 'Assets', id: 'Aset', items: [
          ['inventory-summary', 'Stock Summary', 'Ringkasan Persediaan', 'IS'],
          ['inventory-movements', 'Process Stock Movements', 'Proses Mutasi Persediaan', 'IM']
        ]
      },
      {
        en: 'Other Support', id: 'Dukungan Lain', items: [
          ['parties', 'Parties', 'Pihak', 'PY']
        ]
      }
    ]
  },
  {
    key: 'system', en: 'System', id: 'Sistem', type: 'flyout', groups: [
      {
        en: 'Settings', id: 'Pengaturan', items: [
          ['settings-profile', 'Company Profile', 'Profil Perusahaan', 'CP'],
          ['settings-accounting', 'Accounting Settings', 'Pengaturan Akuntansi', 'AS'],
          ['settings-accounts', 'Default Accounts', 'Akun Bawaan', 'DA'],
          ['settings-system', 'System Settings', 'Pengaturan Sistem', 'SS']
        ]
      },
      {
        en: 'Maintenance', id: 'Pemeliharaan', items: [
          ['system-install', 'Install / Update System', 'Instal / Perbarui Sistem', 'IN'],
          ['system-check', 'Check COA & Settings', 'Periksa COA & Pengaturan', 'CK']
        ]
      },
      {
        en: 'Help', id: 'Bantuan', items: [
          ['guide', 'User Guide / SOP', 'Panduan Pengguna / SOP', 'GD']
        ]
      }
    ]
  }
];

function doGet(e) {
  if (!webAuthorize_()) {
    return HtmlService.createHtmlOutput(webDeniedHtml_()).setTitle('Access denied');
  }
  const params = e && e.parameter ? e.parameter : {};
  const requested = String(params.page || 'home');
  const page = Object.prototype.hasOwnProperty.call(WEB_PAGES, requested) ? requested : 'home';
  const def = WEB_PAGES[page];
  const lang = getLanguage() === 'ID' ? 'ID' : 'EN';
  const raw = String(params.raw || '') === '1';
  const output = webRenderPage_(def, page, params, lang, raw);
  return output.setTitle((lang === 'ID' ? def.id : def.en) + ' - Accounting');
}

function webRenderPage_(def, page, params, lang, raw) {
  const ctx = webRequestContext_();
  const file = lang === 'ID' && def.idFile ? def.idFile : def.file;
  const template = HtmlService.createTemplateFromFile(file);
  const vars = def.vars ? def.vars(params) : {};
  Object.keys(vars).forEach(key => { template[key] = vars[key]; });
  const baseUrl = ScriptApp.getService().getUrl();
  template.lang = lang;
  template.page = page;
  template.params = params;
  template.period = String(params.period || getReportSelection_().period);
  template.action = def.action || '';
  template.tab = String(params.tab || def.tab || '');
  template.reportKeys = String(params.keys || template.reportKeys || (vars.reportKeys || ''));
  template.webMode = true;
  template.baseUrl = baseUrl;
  template.company = String(ctx.settings['Company Name'] || (lang === 'ID' ? 'Perusahaan' : 'Company'));
  template.mode = ctx.mode;
  let content = template.evaluate().getContent();

  if (raw) {
    content = webInjectRawShims_(content, template.tab, baseUrl);
    return HtmlService.createHtmlOutput(content)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const shell = HtmlService.createTemplateFromFile('WebApp');
  shell.nav = webNavHtml_(page, lang, baseUrl);
  shell.title = lang === 'ID' ? def.id : def.en;
  shell.page = page;
  shell.lang = lang;
  shell.baseUrl = baseUrl;
  shell.company = String(ctx.settings['Company Name'] || (lang === 'ID' ? 'Perusahaan' : 'Company'));
  shell.mode = ctx.mode;
  const framePage = def.dashboard ? page : 'home';
  shell.frameSrc = baseUrl + '?page=' + encodeURIComponent(framePage) + '&raw=1';
  return shell.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function webInjectRawShims_(content, tab, baseUrl) {
  const theme = include('WebTheme');
  if (/<head[^>]*>/i.test(content)) {
    content = content.replace(/<\/head>/i, theme + '</head>');
  } else {
    content = theme + content;
  }
  content = content.replace(/<base\s+target="_top"\s*\/?>/i, '<base target="_self">');
  const baseJson = JSON.stringify(String(baseUrl || ''));
  let shim = '<script>' +
    'var WEB_BASE=' + baseJson + ';' +
    'var WEB_DASH=' + JSON.stringify(Object.keys(WEB_PAGES).filter(function(k){return WEB_PAGES[k].dashboard;})) + ';' +
    'window.webGoPage=function(k,l,q){' +
    '  q=q||""; k=String(k||"");' +
    '  if(WEB_DASH.indexOf(k)>=0 && window.parent && window.parent.webNavigate){ window.parent.webNavigate(k,l,q); return; }' +
    '  if(window.parent && window.parent.webOpenModal) window.parent.webOpenModal(k,l,q);' +
    '  else if(WEB_BASE) window.top.location.href=WEB_BASE+"?page="+encodeURIComponent(k)+(q?"&"+q:"");' +
    '};' +
    'document.addEventListener("click",function(e){' +
    '  var a=e.target.closest && e.target.closest(\'a[href^="?page="]\');' +
    '  if(a){' +
    '    e.preventDefault();' +
    '    var href=a.getAttribute("href");' +
    '    var key=decodeURIComponent((href.split("page=")[1]||"").split("&")[0]);' +
    '    var extra=href.indexOf("&")>=0?href.slice(href.indexOf("&")+1):"";' +
    '    if(WEB_DASH.indexOf(key)>=0 && window.parent && window.parent.webNavigate){ window.parent.webNavigate(key,a.textContent.trim(),extra); return; }' +
    '    if(window.parent && window.parent.webOpenModal) window.parent.webOpenModal(key, a.textContent.trim(), extra);' +
    '    else if(WEB_BASE) window.top.location.href=WEB_BASE+href;' +
    '  }' +
    '});' +
    'if (window.google && google.script) {' +
    '  google.script.host = google.script.host || {};' +
    '  google.script.host.close = function () {' +
    '    if(window.parent && window.parent.webCloseModal) window.parent.webCloseModal();' +
    '    else if(WEB_BASE) window.top.location.href=WEB_BASE+"?page=home";' +
    '  };' +
    '}' +
    '<\/script>';
  if (tab) {
    shim += '<script>document.addEventListener("DOMContentLoaded",function(){' +
      'var b=document.querySelector(\'[data-tab="' + String(tab).replace(/[^a-z0-9_-]/gi, '') + '"]\');' +
      'if(b){b.click();}' +
      '});<\/script>';
  }
  const index = content.toLowerCase().lastIndexOf('</body>');
  if (index < 0) return content + shim;
  return content.slice(0, index) + shim + content.slice(index);
}

function webNavHtml_(page, lang, baseUrl) {
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const base = String(baseUrl || '');
  const label = item => esc(lang === 'ID' ? item.id : item.en);
  const pageInMenu = menu => (menu.groups || []).some(group => (group.items || []).some(item => item[0] === page));
  const linkAttrs = (key, text) => {
    const def = WEB_PAGES[key] || {};
    if (def.dashboard) {
      return ' href="' + esc(base + '?page=' + encodeURIComponent(key)) + '" data-page-link="1" data-page="' + esc(key) + '"';
    }
    return ' href="' + esc(base + '?page=' + encodeURIComponent(key)) + '" data-modal="1" data-page="' + esc(key) + '" data-label="' + esc(text) + '"';
  };
  let html = '<a class="web-menu-label web-menu-home' + (page === 'home' ? ' active' : '') +
    '" href="' + esc(base + '?page=home') + '" data-home="1">' +
    (lang === 'ID' ? 'Beranda' : 'Home') + '<span class="web-home-mark"></span></a>';

  WEB_NAV.forEach(menu => {
    const active = pageInMenu(menu);
    html += '<div class="web-menu' + (active ? ' active' : '') + '">' +
      '<input class="web-menu-toggle" type="checkbox" id="webMenu_' + esc(menu.key) + '">' +
      '<label class="web-menu-label" for="webMenu_' + esc(menu.key) + '">' + label(menu) + '<span class="web-caret">▾</span></label>' +
      '<div class="web-dropdown' + (menu.type === 'sections' ? ' web-dropdown-sections' : '') + '">';
    (menu.groups || []).forEach((group, gi) => {
      if (menu.type === 'sections') {
        if (gi > 0) html += '<div class="web-dropdown-sep"></div>';
        html += '<div class="web-dropdown-title">' + label(group) + '</div>';
        (group.items || []).forEach(item => {
          const key = item[0], text = lang === 'ID' ? item[2] : item[1], icon = item[3];
          html += '<a class="' + (key === page ? 'active' : '') + '"' + linkAttrs(key, text) + '>' +
            '<span class="web-icon">' + esc(icon) + '</span><span>' + esc(text) + '</span></a>';
        });
        return;
      }
      const hasSingle = (menu.groups || []).length === 1;
      if (hasSingle) {
        (group.items || []).forEach(item => {
          const key = item[0], text = lang === 'ID' ? item[2] : item[1], icon = item[3];
          html += '<a class="' + (key === page ? 'active' : '') + '"' + linkAttrs(key, text) + '>' +
            '<span class="web-icon">' + esc(icon) + '</span><span>' + esc(text) + '</span></a>';
        });
      } else {
        html += '<div class="web-flyout"><div class="web-flyout-label">' + label(group) + '<span class="web-flyout-arrow">›</span></div><div class="web-submenu">';
        (group.items || []).forEach(item => {
          const key = item[0], text = lang === 'ID' ? item[2] : item[1], icon = item[3];
          html += '<a class="' + (key === page ? 'active' : '') + '"' + linkAttrs(key, text) + '>' +
            '<span class="web-icon">' + esc(icon) + '</span><span>' + esc(text) + '</span></a>';
        });
        html += '</div></div>';
      }
    });
    html += '</div></div>';
  });
  return html;
}

function webAuthorize_() {
  const allow = String(PropertiesService.getScriptProperties().getProperty('WEB_ALLOWED_EMAILS') || '').trim();
  if (!allow) return true;
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  const list = allow.split(/[;,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.indexOf(email) >= 0;
}

function webDeniedHtml_() {
  return '<!doctype html><html><body style="font:14px Segoe UI,Arial,sans-serif;padding:40px">' +
    '<h2>Access denied</h2><p>Your Google account is not in <code>WEB_ALLOWED_EMAILS</code>.</p></body></html>';
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: dashboard reads period KPI rows and six cached recent journals instead of scanning 37 Journal columns.
function webGetDashboard() {
  try {
    const ctx = webRequestContext_();
    const selected = getReportSelection_();
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const fallback = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
    const periodText = /^\d{4}-\d{2}$/.test(String(selected.period || '')) ? String(selected.period) : fallback;
    const period = Number(periodText.replace('-', ''));
    const year = Math.floor(period / 100), month = period % 100;
    const fiscalStart = ctx.fiscalStart;
    const fiscalFrom = (month >= fiscalStart ? year : year - 1) * 100 + fiscalStart;

    const cacheKey = webDashboardCacheKey_(periodText);
    const cached = webCacheGet_(cacheKey);
    if (cached) return cached;

    const summary = webGetDashboardSummary_(ctx);
    const result = webDashboardFromSummary_(ctx, summary, periodText, period, fiscalFrom);
    webCachePut_(cacheKey, result, 120);
    return result;
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}

function webDashboardFromSummary_(ctx, summary, periodText, period, fiscalFrom) {
  const settings = ctx.settings;
  const fiscalStart = ctx.fiscalStart;
  const company = String(settings['Company Name'] || '');
  const currency = String(settings['Currency'] || 'IDR').trim() || 'IDR';
  const periodKey = String(periodText.replace('-', ''));
  let cash = 0, income = 0, expense = 0, incomeYtd = 0, expenseYtd = 0, drafts = 0;
  let tbEnd = 0, bsAssets = 0, bsLiab = 0, bsEq = 0, hasData = false, updatedAt = '';
  const recentById = new Map();

  summary.forEach(row => {
    const p = Number(row.period);
    if (row.hasData) hasData = true;
    drafts += Number(row.draftCount) || 0;
    if (p <= period) {
      cash += Number(row.cash) || 0;
      tbEnd += Number(row.tb) || 0;
      bsAssets += Number(row.assets) || 0;
      bsLiab += Number(row.liabilities) || 0;
      bsEq += Number(row.equity) || 0;
    }
    if (p >= fiscalFrom && p <= period) {
      incomeYtd += Number(row.income) || 0;
      expenseYtd += Number(row.expense) || 0;
    }
    if (p === period) {
      income += Number(row.income) || 0;
      expense += Number(row.expense) || 0;
    }
    if (row.updatedAt) updatedAt = row.updatedAt;
    (row.recent || []).forEach(item => {
      if (item && item.journalId && !recentById.has(item.journalId)) recentById.set(item.journalId, item);
    });
  });

  const current = summary.get(periodKey) || {};
  const ar = Number(current.ar) || 0, arOverdue = Number(current.arOverdue) || 0;
  const ap = Number(current.ap) || 0, apOverdue = Number(current.apOverdue) || 0;
  const net = r2_(income - expense);
  const recent = Array.from(recentById.values())
    .map(item => ({ item: item, dateValue: new Date(item.date) }))
    .sort((a, b) => (b.dateValue - a.dateValue) || String(b.item.journalId).localeCompare(String(a.item.journalId)))
    .slice(0, 6)
    .map(entry => ({
      journalId: entry.item.journalId, date: dateToIso_(entry.dateValue), journalType: entry.item.journalType,
      description: entry.item.description, reference: entry.item.reference, party: entry.item.party,
      debit: r2_(Number(entry.item.debit) || 0), credit: r2_(Number(entry.item.credit) || 0), lines: Number(entry.item.lines) || 0
    }));

  const tbDiff = Math.abs(r2_(tbEnd));
  const bsDiff = Math.abs(r2_(bsAssets - (bsLiab + bsEq)));
  const checks = [];
  if (tbDiff > TOLERANCE || bsDiff > TOLERANCE) checks.push({ level: 'danger', text: tr_('Ledger or balance sheet is out of balance. Run Check COA & Settings.', 'Buku besar atau neraca tidak seimbang. Jalankan Periksa COA & Pengaturan.') });
  if (drafts) checks.push({ level: 'warn', text: tr_(drafts + ' journal draft(s) are waiting to be posted.', drafts + ' draf jurnal menunggu untuk diposting.') });
  if (arOverdue > 0) checks.push({ level: 'warn', text: tr_('Some receivables are past their due date.', 'Ada piutang yang telah melewati jatuh tempo.') });
  if (!checks.length) checks.push({ level: 'ok', text: tr_('Ledger balances and no urgent action is needed.', 'Buku seimbang dan tidak ada tindakan mendesak.') });

  return {
    success: true, company: company, mode: ctx.mode, currency: currency,
    profile: { legalName: String(settings['Legal Name'] || ''), npwp: String(settings['NPWP'] || ''), nib: String(settings['NIB'] || ''), address: String(settings['Address'] || ''), phone: String(settings['Phone'] || ''), email: String(settings['Email'] || ''), businessType: String(settings['Business Type'] || ''), goLiveDate: String(settings['Go Live Date'] || ''), fiscalStart: fiscalStart },
    period: periodText, fiscalFrom: String(fiscalFrom).slice(0, 4) + '-' + String(fiscalFrom).slice(4),
    hasData: hasData, cash: r2_(cash), income: r2_(income), expense: r2_(expense), net: net,
    incomeYtd: r2_(incomeYtd), expenseYtd: r2_(expenseYtd),
    ar: ar, arOverdue: arOverdue, ap: ap, apOverdue: apOverdue,
    assets: r2_(bsAssets), liabilities: r2_(bsLiab), equity: r2_(bsEq), drafts: drafts, recent: recent, checks: checks,
    updatedAt: updatedAt || new Date().toISOString()
  };
}

function webGetDashboardSummary_(ctx) {
  const rev = webDataRevision_('journals');
  const props = PropertiesService.getDocumentProperties();
  const builtRev = String(props.getProperty('WEB_DASH_SUMMARY_REV') || '');
  let summary = builtRev === rev ? webReadDashboardSummary_() : null;
  if (!summary) {
    webBuildDashboardSummary_(ctx);
    props.setProperty('WEB_DASH_SUMMARY_REV', rev);
    summary = webReadDashboardSummary_() || new Map();
  }
  return summary;
}

function webReadDashboardSummary_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WEB_DASH_SUMMARY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return new Map();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, WEB_DASH_SUMMARY_HEADERS.length).getValues();
  const out = new Map();
  values.forEach(r => {
    const period = String(r[0] || '').trim();
    if (!/^\d{6}$/.test(period)) return;
    let recent = [];
    try { recent = JSON.parse(String(r[15] || '[]')); } catch (e) { recent = []; }
    out.set(period, {
      period: period,
      hasData: String(r[1]) === '1' || String(r[1]) === 'true',
      draftCount: Number(r[3]) || 0,
      cash: Number(r[4]) || 0, income: Number(r[5]) || 0, expense: Number(r[6]) || 0, tb: Number(r[7]) || 0,
      assets: Number(r[8]) || 0, liabilities: Number(r[9]) || 0, equity: Number(r[10]) || 0,
      ar: Number(r[11]) || 0, arOverdue: Number(r[12]) || 0, ap: Number(r[13]) || 0, apOverdue: Number(r[14]) || 0,
      recent: recent, updatedAt: String(r[16] || '')
    });
  });
  return out;
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: one Journal read creates per-YYYYMM KPI rows; normal dashboard loads never touch the Journal sheet.
function webBuildDashboardSummary_(ctx) {
  const sheet = webEnsureDashboardSummarySheet_();
  const values = readJournalRows_();
  const buckets = new Map();
  const reportRows = new Map();
  const allAr = [], allAp = [];

  const bucketFor = period => {
    const key = String(period);
    if (!buckets.has(key)) {
      buckets.set(key, { period: key, hasData: false, postedLines: 0, draftIds: new Set(), cash: 0, income: 0, expense: 0, tb: 0, assets: 0, liabilities: 0, equity: 0, recent: new Map(), arLines: [], apLines: [] });
    }
    return buckets.get(key);
  };

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const status = String(r[COL.status] || '');
    const code = String(r[COL.accountCode] || '').trim();
    const debit = Number(r[COL.debit]) || 0;
    const credit = Number(r[COL.credit]) || 0;
    const id = String(r[COL.id] || '').trim();
    const type = String(r[COL.type] || '');
    const date = r[COL.date] instanceof Date ? r[COL.date] : new Date(r[COL.date]);
    const rowPeriod = Number(r[COL.period]) || (date.getFullYear() * 100 + date.getMonth() + 1);
    const b = bucketFor(rowPeriod);
    b.hasData = true;
    if (status === STATUS.DRAFT) {
      if (id) b.draftIds.add(id);
      continue;
    }
    if (status !== STATUS.POSTED) continue;

    const reportKey = rowPeriod + '|' + type + '|' + code;
    let reportRow = reportRows.get(reportKey);
    if (!reportRow) {
      reportRow = { period: rowPeriod, type: type, code: code, debit: 0, credit: 0 };
      reportRows.set(reportKey, reportRow);
    }
    reportRow.debit += debit;
    reportRow.credit += credit;

    b.postedLines++;
    if (ctx.cashCodes.has(code)) b.cash += debit - credit;
    const sec = ctx.section.get(code);
    if (NO_FLOW.indexOf(type) < 0) {
      if (['REV', 'CONTRA', 'OI'].indexOf(sec) >= 0) b.income += -1 * (debit - credit);
      else if (['COS', 'OPEX', 'OX', 'TAX'].indexOf(sec) >= 0) b.expense += debit - credit;
    }
    b.tb += debit - credit;
    if (sec === 'CA' || sec === 'NCA') b.assets += debit - credit;
    else if (sec === 'CL' || sec === 'NCL') b.liabilities += credit - debit;
    else if (sec === 'EQ') b.equity += credit - debit;
    else if (sec) b.equity += credit - debit;

    if (id) {
      const rec = b.recent.get(id) || { journalId: id, date: date, journalType: type, description: String(r[COL.description] || ''), reference: String(r[COL.reference] || ''), party: String(r[COL.party] || ''), debit: 0, credit: 0, lines: 0 };
      rec.debit += debit;
      rec.credit += credit;
      rec.lines += 1;
      b.recent.set(id, rec);
    }

    const line = { date: date, id: id, ref: String(r[COL.reference] || ''), desc: String(r[COL.lineDescription] || r[COL.description] || ''), party: String(r[COL.party] || ''), partyId: String(r[COL.partyId] || ''), due: r[COL.dueDate] instanceof Date ? r[COL.dueDate] : null, debit: debit, credit: credit };
    if (code === ctx.arCode) { b.arLines.push(line); allAr.push(line); }
    if (code === ctx.apCode) { b.apLines.push(line); allAp.push(line); }
  }

  allAr.sort((a, b) => (a.date - b.date) || String(a.id).localeCompare(String(b.id)));
  allAp.sort((a, b) => (a.date - b.date) || String(a.id).localeCompare(String(b.id)));
  const periods = Array.from(buckets.keys()).sort();
  let ai = 0, pi = 0;
  const activeAr = [], activeAp = [];
  const company = String(ctx.settings['Company Name'] || '');
  const rows = periods.map(period => {
    const b = buckets.get(period);
    const asOf = webPeriodAsOf_(period);
    while (ai < allAr.length && allAr[ai].date <= asOf) activeAr.push(allAr[ai++]);
    while (pi < allAp.length && allAp[pi].date <= asOf) activeAp.push(allAp[pi++]);
    const arTotals = agingTotalsOnly_(activeAr, 'AR', asOf);
    const apTotals = agingTotalsOnly_(activeAp, 'AP', asOf);
    const recent = Array.from(b.recent.values())
      .sort((a, b2) => (b2.date - a.date) || String(b2.journalId).localeCompare(String(a.journalId)))
      .slice(0, 6)
      .map(item => ({ journalId: item.journalId, date: dateToIso_(item.date), journalType: item.journalType, description: item.description, reference: item.reference, party: item.party, debit: r2_(item.debit), credit: r2_(item.credit), lines: item.lines }));
    return [
      period, b.hasData ? 1 : 0, b.postedLines, b.draftIds.size,
      r2_(b.cash), r2_(b.income), r2_(b.expense), r2_(b.tb),
      r2_(b.assets), r2_(b.liabilities), r2_(b.equity),
      arTotals.open, arTotals.overdue, apTotals.open, apTotals.overdue,
      JSON.stringify(recent), new Date().toISOString()
    ];
  });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, WEB_DASH_SUMMARY_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, WEB_DASH_SUMMARY_HEADERS.length).setValues(rows);
  webWriteReportSummary_(reportRows);
  PropertiesService.getDocumentProperties().setProperty('WEB_DASH_SUMMARY_REV', webDataRevision_('journals'));
  return rows;
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: per-period/account/type totals let reports reuse prior periods without re-reading every journal line.
function webEnsureReportSummarySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REPORT_SUMMARY_SHEET);
  if (!sheet) sheet = ss.insertSheet(REPORT_SUMMARY_SHEET);
  const head = sheet.getRange(1, 1, 1, REPORT_SUMMARY_HEADERS.length).getDisplayValues()[0];
  if (head[0] !== REPORT_SUMMARY_HEADERS[0]) sheet.getRange(1, 1, 1, REPORT_SUMMARY_HEADERS.length).setValues([REPORT_SUMMARY_HEADERS]);
  return sheet;
}

function webWriteReportSummary_(rows) {
  const sheet = webEnsureReportSummarySheet_();
  const values = Array.from(rows.values())
    .sort((a, b) => a.period - b.period || String(a.type).localeCompare(String(b.type)) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
    .map(row => [row.period, row.type, row.code, row.debit, row.credit, new Date().toISOString()]);
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, REPORT_SUMMARY_HEADERS.length).clearContent();
  if (values.length) sheet.getRange(2, 1, values.length, REPORT_SUMMARY_HEADERS.length).setValues(values);
  PropertiesService.getDocumentProperties().setProperty('WEB_REPORT_SUMMARY_REV', webDataRevision_('journals'));
}

function webGetReportSummary_() {
  const rev = webDataRevision_('journals');
  const props = PropertiesService.getDocumentProperties();
  if (String(props.getProperty('WEB_REPORT_SUMMARY_REV') || '') !== rev) {
    webBuildDashboardSummary_(webRequestContext_());
    props.setProperty('WEB_REPORT_SUMMARY_REV', rev);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORT_SUMMARY_SHEET);
  const out = new Map();
  if (!sheet || sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, REPORT_SUMMARY_HEADERS.length).getValues();
  values.forEach(r => {
    const period = Number(r[0]) || 0;
    if (!period) return;
    out.set(period + '|' + String(r[1]) + '|' + String(r[2]), {
      period: period, type: String(r[1]), code: String(r[2]),
      debit: Number(r[3]) || 0, credit: Number(r[4]) || 0
    });
  });
  return out;
}

function webEnsureDashboardSummarySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(WEB_DASH_SUMMARY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(WEB_DASH_SUMMARY_SHEET);
    sheet.getRange(1, 1, 1, WEB_DASH_SUMMARY_HEADERS.length).setValues([WEB_DASH_SUMMARY_HEADERS]);
  }
  const head = sheet.getRange(1, 1, 1, WEB_DASH_SUMMARY_HEADERS.length).getDisplayValues()[0];
  if (!head.length || head[0] !== WEB_DASH_SUMMARY_HEADERS[0]) {
    sheet.getRange(1, 1, 1, WEB_DASH_SUMMARY_HEADERS.length).setValues([WEB_DASH_SUMMARY_HEADERS]);
  }
  return sheet;
}

function webPeriodAsOf_(period) {
  const p = Number(period);
  return new Date(Math.floor(p / 100), p % 100, 0, 12, 0, 0);
}

const WEB_DASH_SUMMARY_SHEET = 'Dashboard Summary';
const WEB_DASH_SUMMARY_HEADERS = ['Period', 'HasData', 'PostedLines', 'DraftCount', 'Cash', 'Income', 'Expense', 'TB', 'Assets', 'Liabilities', 'Equity', 'AROpen', 'AROverdue', 'APOpen', 'APOverdue', 'RecentJson', 'UpdatedAt'];
const WEB_REV_PROP_PREFIX = 'WEB_REV_';
let WEB_REQUEST_CONTEXT = null;
let WEB_REV_CACHE = {};

// OPTIMIZED FOR >100K ROWS / SCALABLE: scoped revisions replace global cache flushing, so unrelated screens keep their cached data.
function webDataRevision_(scope) {
  const key = WEB_REV_PROP_PREFIX + String(scope || 'data');
  if (Object.prototype.hasOwnProperty.call(WEB_REV_CACHE, key)) return WEB_REV_CACHE[key];
  const props = PropertiesService.getDocumentProperties();
  let value = String(props.getProperty(key) || '');
  if (!value) {
    value = '1';
    props.setProperty(key, value);
  }
  WEB_REV_CACHE[key] = value;
  return value;
}
function webBumpDataRevision_(scope) {
  const key = WEB_REV_PROP_PREFIX + String(scope || 'data');
  const props = PropertiesService.getDocumentProperties();
  const next = String((Number(webDataRevision_(scope)) || 1) + 1);
  props.setProperty(key, next);
  WEB_REV_CACHE[key] = next;
  return next;
}
function webCacheKey_(name, parts) {
  const nameText = String(name || '');
  const scope = nameText.indexOf('dashboard') === 0 ? 'dashboard' : (nameText.indexOf('journals') === 0 ? 'journals' : 'config');
  const tail = (parts || []).map(p => encodeURIComponent(String(p))).join(':');
  return 'web:v1:' + webDataRevision_(scope) + ':' + nameText + (tail ? ':' + tail : '');
}
function webCacheGet_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function webCachePut_(key, value, seconds) {
  try {
    const raw = JSON.stringify(value);
    if (raw.length < 95000) CacheService.getScriptCache().put(key, raw, seconds || 120);
  } catch (e) {}
}
// OPTIMIZED FOR >100K ROWS / SCALABLE: large report/list payloads are chunked so repeat loads stay cached.
function webCachePutLarge_(key, value, seconds) {
  try {
    const raw = JSON.stringify(value);
    if (raw.length < 95000) {
      webCachePut_(key, value, seconds);
      return;
    }
    const cache = CacheService.getScriptCache();
    const size = 80000;
    const parts = [];
    for (let i = 0; i < raw.length; i += size) parts.push(raw.substr(i, size));
    cache.put(key + '#n', String(parts.length), seconds || 120);
    parts.forEach((part, index) => cache.put(key + '#' + index, part, seconds || 120));
  } catch (e) {}
}
function webCacheGetLarge_(key) {
  const direct = webCacheGet_(key);
  if (direct !== null) return direct;
  try {
    const cache = CacheService.getScriptCache();
    const rawCount = cache.get(key + '#n');
    if (!rawCount) return null;
    const count = Number(rawCount) || 0;
    if (!count) return null;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const part = cache.get(key + '#' + i);
      if (part === null) return null;
      parts.push(part);
    }
    return JSON.parse(parts.join(''));
  } catch (e) { return null; }
}
function webCacheJournalsKey_(status, limit) {
  return webCacheKey_('journals:' + String(status || 'ALL') + ':' + Number(limit || 0), [getLanguage()]);
}
function webJournalListCacheKey_(opts) {
  const o = opts || {};
  return webCacheKey_('journals:list', [getLanguage(), String(o.status || 'ALL'), String(o.search || ''), String(o.startDate || ''), String(o.endDate || ''), String(o.journalId || '')]);
}
function webDashboardCacheKey_(period) {
  return webCacheKey_('dashboard', [getLanguage(), String(period || '')]);
}
function webConfigCacheKey_() {
  return webCacheKey_('config', [getLanguage()]);
}
// OPTIMIZED FOR >100K ROWS / SCALABLE: invalidate only scopes touched by the mutation, never every cached screen.
function webInvalidateCache_(scope) {
  const s = String(scope || 'journals');
  const scopes = [];
  if (s === 'journals' || s === 'bank' || s === 'inventory') scopes.push('journals', 'dashboard');
  else if (s === 'config' || s === 'settings' || s === 'language') scopes.push('config', 'dashboard');
  else if (s === 'dashboard') scopes.push('dashboard');
  else scopes.push(s);
  scopes.forEach(item => webBumpDataRevision_(item));
  if (scopes.indexOf('config') >= 0) WEB_REQUEST_CONTEXT = null;
  try {
    const cache = CacheService.getScriptCache();
    const keys = [];
    if (scopes.indexOf('journals') >= 0) {
      ['ALL', 'POSTED', 'DRAFT'].forEach(status => [50, 100, 200, 500].forEach(limit => keys.push(webCacheJournalsKey_(status, limit))));
    }
    if (scopes.indexOf('config') >= 0) keys.push(webConfigCacheKey_());
    if (keys.length) cache.removeAll(keys);
  } catch (e) {}
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: Settings and COA are read once per request and reused by shell, page vars, dashboard and aging metadata.
function webRequestContext_() {
  if (WEB_REQUEST_CONTEXT) return WEB_REQUEST_CONTEXT;
  const cacheKey = webConfigCacheKey_();
  const cached = webCacheGet_(cacheKey);
  const data = cached && cached.settings && cached.coa ? cached : webBuildRequestContextData_();
  if (!cached) webCachePut_(cacheKey, data, 300);
  WEB_REQUEST_CONTEXT = webHydrateRequestContext_(data);
  return WEB_REQUEST_CONTEXT;
}
function webBuildRequestContextData_() {
  const settings = readSettings_();
  const coa = readCoa_();
  return { settings: settings, coa: coa, mode: String(settings['Mode'] || '').trim().toUpperCase() === 'LIVE' ? 'LIVE' : 'PRACTICE' };
}
function webHydrateRequestContext_(data) {
  const settings = data.settings || {};
  const coa = data.coa || [];
  return {
    settings: settings,
    coa: coa,
    mode: data.mode || (String(settings['Mode'] || '').trim().toUpperCase() === 'LIVE' ? 'LIVE' : 'PRACTICE'),
    coaMap: new Map(coa.map(a => [String(a.code).trim(), a])),
    cashCodes: new Set(coa.filter(a => a.group === 'Cash & Cash Equivalents').map(a => String(a.code).trim())),
    section: new Map(coa.map(a => [String(a.code).trim(), sectionOf_(a)])),
    arCode: mappingCode_(settings, 'ar'),
    apCode: mappingCode_(settings, 'ap'),
    fiscalStart: Number(settings['Fiscal Year Start Month']) || 1
  };
}

function webSetLanguage(lang) {
  setLanguage_(lang === 'ID' ? 'ID' : 'EN');
  webInvalidateCache_('language');
  return { success: true, language: getLanguage() };
}

function webProcessStockMovements() {
  return processStockMovements({ web: true });
}

function webGenerateStockSummary(date) {
  return generateStockSummary(date, { web: true });
}

function webGenerateAging(date) {
  return generateAging(date, { web: true });
}

function webInstallSystem(options) {
  return installSystem({ web: true, replaceCoa: !!(options && options.replaceCoa) });
}

function webRunSetupCheck() {
  return runSetupCheck({ web: true });
}

function webExportSopPdf() {
  try {
    const lang = getLanguage() === 'ID' ? 'ID' : 'EN';
    const file = lang === 'ID' ? 'UserGuideId' : 'UserGuide';
    const html = HtmlService.createHtmlOutputFromFile(file).getContent();
    const blob = Utilities.newBlob(html, 'text/html', 'SOP.html').getAs('application/pdf');
    blob.setName((lang === 'ID' ? 'Panduan_SOP' : 'Accounting_SOP') + '.pdf');
    const b64 = Utilities.base64Encode(blob.getBytes());
    return { success: true, fileName: blob.getName(), mimeType: 'application/pdf', data: b64 };
  } catch (e) {
    return { success: false, message: e && e.message ? e.message : String(e) };
  }
}

function webDateTime_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);
  const zone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(date, zone, 'yyyy-MM-dd HH:mm');
}

function webSerializeReport_(value) {
  if (value instanceof Date) return dateToIso_(value);
  if (Array.isArray(value)) return value.map(webSerializeReport_);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => { out[key] = webSerializeReport_(value[key]); });
    return out;
  }
  return value;
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: report payloads are cached per period/key set and invalidated by journal revision.
function webGetReportData(payload) {
  try {
    const p = payload || {};
    const periodText = String(p.period || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodText)) {
      return { success: false, message: 'Invalid period.' };
    }
    const mode = String(p.mode || 'all') === 'custom' ? 'custom' : 'all';
    const requested = Array.isArray(p.reports) ? p.reports.filter(key => REPORT_KEYS.indexOf(key) >= 0) : [];
    const defaultKeys = REPORT_KEYS.filter(key => key !== 'tb' && key !== 'gl');
    const keys = mode === 'all' ? defaultKeys : requested;
    if (!keys.length) return { success: false, message: 'Choose at least one report.' };

    const cacheKey = webCacheKey_('journals:report', [getLanguage(), periodText, mode, keys.join(',')]);
    const cached = webCacheGetLarge_(cacheKey);
    if (cached) return cached;

    const ctx = webRequestContext_();
    const settings = ctx.settings;
    const period = Number(periodText.replace('-', ''));
    const m0 = ctx.fiscalStart;
    const year = Math.floor(period / 100), mi = period % 100 - 1;
    const monthEn = MONTH_NAMES[mi] + ' ' + year, monthId = MONTH_NAMES_ID[mi] + ' ' + year;
    const meta = {
      company: settings['Company Name'] || '',
      label: tr_('For the month ended ' + monthEn, 'Untuk bulan yang berakhir pada ' + monthId),
      bsLabel: tr_('As at end of the month ended ' + monthEn, 'Pada akhir bulan ' + monthId),
      eqLabel: tr_('Year to date to ' + monthEn, 'Sampai dengan tahun berjalan pada ' + monthId)
    };
    // OPTIMIZED FOR >100K ROWS / SCALABLE: prior periods come from per-account totals; only the selected month reads journal lines.
    const all = computeReports_(loadPostedForWebReports_(period), ctx.coa, period, m0, meta);
    const reports = {};
    keys.forEach(key => { reports[key] = webSerializeReport_(all[key]); });
    const result = {
      success: true,
      period: periodText,
      keys: keys,
      reports: reports,
      warnings: webSerializeReport_(all.warnings || []),
      generatedAt: new Date().toISOString()
    };
    webCachePutLarge_(cacheKey, result, 120);
    return result;
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}

function webSearchItems_(lang) {
  const id = lang === 'ID';
  const items = [];
  WEB_NAV.forEach(menu => {
    (menu.groups || []).forEach(group => {
      (group.items || []).forEach(item => {
        const key = item[0];
        const def = WEB_PAGES[key];
        if (!def) return;
        items.push({
          key: key,
          label: id ? item[2] : item[1],
          icon: item[3],
          group: id ? group.id : group.en,
          mode: def.dashboard ? 'dashboard' : 'modal'
        });
      });
    });
  });
  return items;
}

// OPTIMIZED FOR >100K ROWS / SCALABLE: Journal List aggregates only 12 needed columns and memoizes date formatting per execution.
function webJournalDate_(value, cache, zone, withTime) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return withTime ? String(value) : '';
  const key = (withTime ? 't:' : 'd:') + date.getTime();
  if (cache.has(key)) return cache.get(key);
  const text = Utilities.formatDate(date, zone, withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  cache.set(key, text);
  return text;
}

function webListJournalGroups_(status, startDate, endDate, journalId, search) {
  const cols = [COL.id, COL.date, COL.period, COL.status, COL.type, COL.description, COL.reference, COL.party, COL.debit, COL.credit, COL.postedAt, COL.updatedAt];
  const cache = new Map();
  const zone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const archived = new Set(journalArchivedYears_());
  const grouped = {};
  const collect = (sheet, skipArchived) => {
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 2) return;
    const count = last - 1;
    const vals = {};
    cols.forEach(col => { vals[col] = sheet.getRange(2, col + 1, count, 1).getValues(); });
    for (let i = 0; i < count; i++) {
      const id = String(vals[COL.id][i][0] || '').trim();
      if (!id) continue;
      const rowStatus = String(vals[COL.status][i][0] || '').toUpperCase();
      if (status !== 'ALL' && rowStatus !== status) continue;
      const isoDate = webJournalDate_(vals[COL.date][i][0], cache, zone, false);
      if (skipArchived) {
        const period = journalRowPeriodFromScan_(vals[COL.date][i][0], vals[COL.period][i][0]);
        if (archived.has(Math.floor(period / 100))) continue;
      }
      if (!grouped[id]) {
        grouped[id] = {
          journalId: id, date: isoDate, journalType: '', status: rowStatus,
          description: '', reference: '', party: '', debit: 0, credit: 0,
          lineCount: 0, postedAt: '', updatedAt: '', searchText: ''
        };
      }
      const entry = grouped[id];
      entry.searchText += [id, rowStatus, vals[COL.type][i][0], vals[COL.description][i][0], vals[COL.reference][i][0], vals[COL.party][i][0]].map(v => String(v || '').toLowerCase()).join('\u0001') + '\u0002';
      entry.lineCount += 1;
      entry.debit += Number(vals[COL.debit][i][0]) || 0;
      entry.credit += Number(vals[COL.credit][i][0]) || 0;
      if (!entry.journalType) entry.journalType = String(vals[COL.type][i][0] || '');
      if (!entry.description && vals[COL.description][i][0]) entry.description = String(vals[COL.description][i][0]);
      if (!entry.reference && vals[COL.reference][i][0]) entry.reference = String(vals[COL.reference][i][0]);
      if (!entry.party && vals[COL.party][i][0]) entry.party = String(vals[COL.party][i][0]);
      if (!entry.postedAt && vals[COL.postedAt][i][0]) entry.postedAt = webJournalDate_(vals[COL.postedAt][i][0], cache, zone, true);
      if (!entry.updatedAt && vals[COL.updatedAt][i][0]) entry.updatedAt = webJournalDate_(vals[COL.updatedAt][i][0], cache, zone, true);
    }
  };
  collect(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.JOURNAL), true);
  archived.forEach(year => {
    if (startDate && year * 100 + 12 < Number(startDate.replace('-', ''))) return;
    if (endDate && year * 100 + 1 > Number(endDate.replace('-', ''))) return;
    collect(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(journalArchiveSheetName_(year)), false);
  });
  const all = Object.keys(grouped).map(key => grouped[key]).filter(item => {
    if (journalId && item.journalId !== journalId) return false;
    if (startDate && item.date < startDate) return false;
    if (endDate && item.date > endDate) return false;
    return !search || item.searchText.indexOf(search) >= 0;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.journalId).localeCompare(String(a.journalId)));
  const stats = {
    total: all.length,
    posted: all.filter(item => item.status === 'POSTED').length,
    draft: all.filter(item => item.status === 'DRAFT').length,
    debit: all.reduce((sum, item) => sum + Number(item.debit || 0), 0)
  };
  return { all: all, stats: stats };
}

function webJournalPage_(cached, opts) {
  const all = cached.all || [];
  const pageSize = Math.max(1, Math.min(500, Number(opts.pageSize) || 50));
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(opts.page) || 1));
  const journals = (opts.all ? all : all.slice((page - 1) * pageSize, page * pageSize)).map(item => ({
    journalId: item.journalId, date: item.date, journalType: item.journalType,
    status: item.status, description: item.description, reference: item.reference, party: item.party,
    debit: r2_(item.debit), credit: r2_(item.credit), lineCount: item.lineCount,
    postedAt: item.postedAt, updatedAt: item.updatedAt
  }));
  return { success: true, journals: journals, count: journals.length, stats: cached.stats, total: all.length, page: page, pageSize: pageSize, totalPages: totalPages };
}

function webListJournals(options) {
  try {
    const opts = options || {};
    const status = String(opts.status || 'ALL').toUpperCase();
    const search = String(opts.search || '').trim().toLowerCase();
    const startDate = String(opts.startDate || '');
    const endDate = String(opts.endDate || '');
    const journalId = String(opts.journalId || '').trim();
    const cacheKey = webJournalListCacheKey_({ status: status, search: search, startDate: startDate, endDate: endDate, journalId: journalId });
    const cached = webCacheGetLarge_(cacheKey);
    if (cached) return webJournalPage_(cached, opts);

    const grouped = webListJournalGroups_(status, startDate, endDate, journalId, search);
    const cacheValue = {
      all: grouped.all.map(item => ({
        journalId: item.journalId, date: item.date, journalType: item.journalType, status: item.status,
        description: item.description, reference: item.reference, party: item.party,
        debit: item.debit, credit: item.credit, lineCount: item.lineCount,
        postedAt: item.postedAt, updatedAt: item.updatedAt
      })),
      stats: grouped.stats
    };
    webCachePutLarge_(cacheKey, cacheValue, 120);
    return webJournalPage_(cacheValue, opts);
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}

function webArchiveJournalYear(year) {
  try {
    const result = archiveJournalYear_(year);
    webInvalidateCache_('journals');
    return result;
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}

const EXPORT_FILE_NAMES = {
  FINANCIAL_REPORT: 'Financial_Report',
  TRIAL_BALANCE: 'Trial_Balance',
  GENERAL_LEDGER: 'General_Ledger',
  AGING: 'AR_AP_Aging',
  JOURNAL_LIST: 'Journal_List',
  BANK_TRANSACTIONS: 'Bank_Transactions',
  DRAFT_MANAGEMENT: 'Draft_Management'
};

function exportCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return dateToIso_(value);
  return JSON.stringify(value);
}

function exportTodayIso_() {
  const zone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd');
}

function exportCompactDate_(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replace(/-/g, '') : '';
}

function exportSafeToken_(value, max) {
  const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return text ? text.slice(0, max || 12) : '';
}

function exportDateToken_(p) {
  const period = String(p.period || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period.replace('-', '');
  const start = exportCompactDate_(p.startDate);
  const end = exportCompactDate_(p.endDate);
  if (start && end) return start === end ? start : start + '-' + end;
  if (start || end) return start || end;
  const asOf = exportCompactDate_(p.asOf);
  return asOf || exportCompactDate_(exportTodayIso_());
}

function exportExtraTokens_(p) {
  const tokens = [];
  const status = String(p.status || '').trim();
  if (status && status !== 'ALL') tokens.push(exportSafeToken_(status, 12));
  const account = exportSafeToken_(p.accountCode, 12);
  if (account) tokens.push(account);
  const profile = exportSafeToken_(p.profile, 12);
  if (profile) tokens.push(profile);
  return tokens.slice(0, 2);
}

function exportFileName_(type, p) {
  const base = EXPORT_FILE_NAMES[type] || 'Export';
  const parts = exportExtraTokens_(p).concat([exportDateToken_(p)]).filter(Boolean);
  if (type === 'FINANCIAL_REPORT') {
    const key = String(p.reportKey || (Array.isArray(p.reports) && p.reports.length ? p.reports[0] : '') || '').toUpperCase();
    if (key) parts.unshift(exportSafeToken_(key, 8));
  }
  return base + '_' + parts.join('_') + '.xlsx';
}

function exportInDateRange_(dateValue, p) {
  const start = exportCompactDate_(p.startDate);
  const end = exportCompactDate_(p.endDate);
  if (!start && !end) return true;
  const date = exportCompactDate_(dateValue);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function exportMatchesSearch_(p, values) {
  const q = String(p.search || '').trim().toLowerCase();
  if (!q) return true;
  return (values || []).some(value => String(exportCell_(value)).toLowerCase().includes(q));
}

function exportReady_(headers, rows, fileName) {
  return {
    fileName: fileName,
    headers: (headers || []).map(exportCell_),
    rows: (rows || []).map(row => (Array.isArray(row) ? row : [row]).map(exportCell_))
  };
}

function exportReportRows_(p) {
  const type = String(p.type || '').toUpperCase();
  const key = type === 'TRIAL_BALANCE' ? 'tb' : type === 'GENERAL_LEDGER' ? 'gl'
    : String(p.reportKey || (Array.isArray(p.reports) && p.reports.length ? p.reports[0] : '') || 'is');
  const result = webGetReportData({
    period: String(p.period || ''),
    mode: 'custom',
    reports: [key],
    web: true
  });
  if (!result || !result.success) throw new Error(result && result.message ? result.message : tr_('Report data is not available.', 'Data laporan tidak tersedia.'));
  const report = result.reports[key];
  if (!report) throw new Error(tr_('Report data is not available.', 'Data laporan tidak tersedia.'));
  return {
    headers: report.header || [],
    rows: (report.rows || []).map(row => row.c || [])
  };
}

function exportAgingRows_(p) {
  const asOf = String(p.asOf || p.endDate || exportTodayIso_()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(tr_('Enter the date as YYYY-MM-DD.', 'Masukkan tanggal dalam format YYYY-MM-DD.'));
  }
  const result = generateAging(asOf, { web: true, dataOnly: true });
  if (!result || !result.success) throw new Error(result && result.message ? result.message : tr_('Aging data is not available.', 'Data umur piutang dan utang tidak tersedia.'));
  const headers = [tr_('Type', 'Jenis'), tr_('Customer / Supplier', 'Pelanggan / Pemasok')]
    .concat(AGING_BUCKETS.map((bucket, i) => tr_(bucket, AGING_BUCKETS_ID[i])))
    .concat([tr_('Open invoices', 'Faktur belum lunas'), tr_('Unapplied payments', 'Pembayaran belum dialokasikan'), tr_('Net balance', 'Saldo bersih')]);
  const rows = [];
  (result.reports || []).forEach(entry => {
    const report = entry.report || {};
    ((report.summary && report.summary.rows) || []).forEach(row => {
      rows.push([entry.side].concat(row.c || []));
    });
  });
  return {
    headers: headers,
    rows: rows.filter(row => exportMatchesSearch_(p, [row[1]]))
  };
}

function exportJournalRows_(p) {
  const result = webListJournals({
    status: String(p.status || 'ALL').toUpperCase(),
    search: p.search || '',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    all: true
  });
  if (!result || !result.success) throw new Error(result && result.message ? result.message : tr_('Journal data is not available.', 'Data jurnal tidak tersedia.'));
  const journals = result.journals || [];
  const headers = [tr_('ID & Type', 'ID & Jenis'), tr_('Date', 'Tanggal'), tr_('Description', 'Keterangan'),
    tr_('Party', 'Pihak'), 'Status', tr_('Debit', 'Debet'), tr_('Credit', 'Kredit'), tr_('Lines', 'Baris')];
  const rows = journals.map(item => [
    String(item.journalId || '') + (item.journalType ? '\n' + item.journalType : ''),
    item.date || '',
    String(item.description || '') + (item.reference ? '\n' + item.reference : ''),
    item.party || '',
    item.status || '',
    Number(item.debit) || 0,
    Number(item.credit) || 0,
    Number(item.lineCount) || 0
  ]);
  return { headers: headers, rows: rows };
}

function exportBankRows_(p) {
  const profile = String(p.profile || '').trim();
  const preview = previewBankImport(profile);
  const setup = getBankSetup();
  const accountNames = new Map((setup.accounts || []).map(a => [String(a.code), String(a.name || '')]));
  const edits = p.edits && typeof p.edits === 'object' ? p.edits : {};
  const headers = [tr_('Row', 'Baris'), tr_('Date', 'Tanggal'), tr_('Description', 'Keterangan'), tr_('Reference', 'Referensi'),
    tr_('Money out', 'Uang Keluar'), tr_('Money in', 'Uang Masuk'), tr_('Counter account', 'Akun Lawan'),
    tr_('Customer / Supplier', 'Pelanggan / Pemasok'), 'Status'];
  const rows = [];
  (preview.rows || []).forEach(item => {
    const edit = edits[String(item.key)] || {};
    const code = String(edit.accountCode || item.accountCode || '').trim();
    const party = edit.party !== undefined ? String(edit.party || '').trim() : String(item.party || '').trim();
    const rawStatus = String(item.status || '').toUpperCase();
    const statusKey = rawStatus === 'ERROR' ? 'ERROR' : rawStatus === 'DUPLICATE' ? 'DUPLICATE' : code ? 'NEW' : 'NEEDS_ACCOUNT';
    const statusLabel = statusKey === 'ERROR' ? tr_('Error', 'Kesalahan')
      : statusKey === 'DUPLICATE' ? tr_('Already imported', 'Sudah Diimpor')
        : statusKey === 'NEW' ? tr_('New', 'Baru') : tr_('Needs account', 'Perlu Akun');
    const account = code ? code + (accountNames.get(code) ? ' - ' + accountNames.get(code) : '') : '';
    const status = String(p.status || 'ALL').toUpperCase();
    if (status !== 'ALL' && status !== statusKey) return;
    if (!exportInDateRange_(item.date, p)) return;
    if (p.accountCode && !code.toLowerCase().includes(String(p.accountCode).trim().toLowerCase())) return;
    if (!exportMatchesSearch_(p, [item.n, item.date, item.desc, item.ref, account, party, statusLabel])) return;
    rows.push([item.n, item.date, item.desc || '', item.ref || '', Number(item.out) || 0, Number(item.in) || 0, account, party, statusLabel]);
  });
  return { headers: headers, rows: rows };
}

function exportDraftRows_(p) {
  const result = getDraftList({
    search: p.search || '', startDate: p.startDate || '', endDate: p.endDate || '',
    failedIds: Array.isArray(p.failedIds) ? p.failedIds : [], all: true
  });
  if (!result || !result.success) throw new Error(result && result.message ? result.message : tr_('Draft data is not available.', 'Data draf tidak tersedia.'));
  const headers = [tr_('Journal ID', 'ID Jurnal'), tr_('Date', 'Tanggal'), tr_('Description', 'Keterangan'),
    tr_('Lines', 'Baris'), tr_('Debit', 'Debet'), tr_('Credit', 'Kredit'), tr_('Updated', 'Diperbarui')];
  const rows = (result.drafts || []).map(item => [
    item.journalId || '',
    item.date || '',
    String(item.description || '') + (item.journalType ? '\n' + item.journalType : ''),
    Number(item.lineCount) || 0,
    Number(item.debit) || 0,
    Number(item.credit) || 0,
    item.updatedAt || ''
  ]);
  return { headers: headers, rows: rows };
}

function exportReportToExcel(params) {
  const p = params || {};
  let type = String(p.type || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (type === 'AR_AP_AGING' || type === 'AGING_REPORT') type = 'AGING';
  if (type === 'BANK_IMPORT' || type === 'BANK_CASH') type = 'BANK_TRANSACTIONS';
  let data;
  if (type === 'FINANCIAL_REPORT' || type === 'TRIAL_BALANCE' || type === 'GENERAL_LEDGER') data = exportReportRows_(p);
  else if (type === 'AGING') data = exportAgingRows_(p);
  else if (type === 'JOURNAL_LIST') data = exportJournalRows_(p);
  else if (type === 'BANK_TRANSACTIONS') data = exportBankRows_(p);
  else if (type === 'DRAFT_MANAGEMENT') data = exportDraftRows_(p);
  else throw new Error(tr_('Unknown export type: ', 'Jenis ekspor tidak dikenal: ') + type);
  return exportReady_(data.headers, data.rows, exportFileName_(type, p));
}
