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
    vars: function (params) { return { draftId: String((params && params.draftId) || ''), appMode: getCompanyMode_() }; }
  },
  journals: { en: 'Journal List', id: 'Daftar Jurnal', file: 'JournalList', idFile: 'JournalList', dashboard: true },
  'bank-import': { en: 'Bank & Petty Cash', id: 'Bank & Kas Kecil', file: 'BankImport', idFile: 'BankImportId', dashboard: true },
  drafts: { en: 'Draft Management', id: 'Kelola Draf', file: 'DraftManagement', idFile: 'DraftManagementId', dashboard: true },
  parties: { en: 'Parties', id: 'Pihak', file: 'PartiesManager', idFile: 'PartiesManagerId', dashboard: true },
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
  'export-excel': { en: 'Export to Excel', id: 'Ekspor ke Excel', file: 'WebAction', idFile: 'WebAction', action: 'export-excel', dashboard: true },
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
          ['parties', 'Parties', 'Pihak', 'PY'],
          ['export-excel', 'Export to Excel', 'Ekspor ke Excel', 'EX']
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
  template.company = String(readSettings_()['Company Name'] || (lang === 'ID' ? 'Perusahaan' : 'Company'));
  template.mode = getCompanyMode_();
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
  shell.company = String(readSettings_()['Company Name'] || (lang === 'ID' ? 'Perusahaan' : 'Company'));
  shell.mode = getCompanyMode_();
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

function webGetDashboard() {
  try {
    const cached = webCacheGet_(WEB_CACHE_DASH);
    if (cached) return cached;

    const settings = readSettings_();
    const selected = getReportSelection_();
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const fallback = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
    const periodText = /^\d{4}-\d{2}$/.test(String(selected.period || '')) ? String(selected.period) : fallback;
    const period = Number(periodText.replace('-', ''));
    const year = Math.floor(period / 100), month = period % 100;
    const fiscalStart = Number(settings['Fiscal Year Start Month']) || 1;
    const fiscalFrom = (month >= fiscalStart ? year : year - 1) * 100 + fiscalStart;
    const asOf = new Date(year, month, 0, 12, 0, 0);

    const coa = readCoa_();
    const coaMap = new Map(coa.map(a => [String(a.code).trim(), a]));
    const cashCodes = new Set(coa.filter(a => a.group === 'Cash & Cash Equivalents').map(a => String(a.code).trim()));
    const section = new Map(coa.map(a => [String(a.code).trim(), sectionOf_(a)]));
    const inflowSections = ['REV', 'CONTRA', 'OI'];
    const outflowSections = ['COS', 'OPEX', 'OX', 'TAX'];
    const arCode = mappingCode_(settings, 'ar');
    const apCode = mappingCode_(settings, 'ap');

    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues();
    let cash = 0, income = 0, expense = 0, incomeYtd = 0, expenseYtd = 0, drafts = 0;
    let tbEnd = 0, bsAssets = 0, bsLiabEq = 0;
    const recentMap = new Map();
    const arLines = [], apLines = [];

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

      if (status === STATUS.DRAFT) {
        if (id && !recentMap.has('D:' + id)) { drafts++; recentMap.set('D:' + id, true); }
        continue;
      }
      if (status !== STATUS.POSTED) continue;

      if (cashCodes.has(code) && rowPeriod <= period) cash += debit - credit;

      const sec = section.get(code);
      if (rowPeriod >= fiscalFrom && rowPeriod <= period && NO_FLOW.indexOf(type) < 0) {
        if (inflowSections.indexOf(sec) >= 0) { const v = -1 * (debit - credit); incomeYtd += v; if (rowPeriod === period) income += v; }
        else if (outflowSections.indexOf(sec) >= 0) { const v = (debit - credit); expenseYtd += v; if (rowPeriod === period) expense += v; }
      }

      if (rowPeriod <= period) {
        tbEnd += debit - credit;
        if (sec === 'CA' || sec === 'NCA') bsAssets += debit - credit;
        else if (sec === 'CL' || sec === 'NCL') bsLiabEq += credit - debit;
        else if (sec === 'EQ') bsLiabEq += credit - debit;
        else if (sec) bsLiabEq += credit - debit; // P&L in equity until closed
      }

      if (id) {
        const item = recentMap.get(id);
        if (!item || item === true) {
          recentMap.set(id, { journalId: id, date: date, journalType: type, description: String(r[COL.description] || ''), reference: String(r[COL.reference] || ''), party: String(r[COL.party] || ''), debit: 0, credit: 0, lines: 0 });
        }
        const rec = recentMap.get(id);
        if (rec && rec !== true) { rec.debit += debit; rec.credit += credit; rec.lines += 1; }
      }

      if (date <= asOf && (code === arCode || code === apCode)) {
        const line = { date: date, id: id, ref: String(r[COL.reference] || ''), desc: String(r[COL.lineDescription] || r[COL.description] || ''), party: String(r[COL.party] || ''), partyId: String(r[COL.partyId] || ''), due: r[COL.dueDate] instanceof Date ? r[COL.dueDate] : null, debit: debit, credit: credit };
        if (code === arCode) arLines.push(line);
        if (code === apCode) apLines.push(line);
      }
    }

    // Count drafts accurately (unique IDs)
    const draftIds = new Set();
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      if (String(r[COL.status] || '') === STATUS.DRAFT) draftIds.add(String(r[COL.id] || '').trim());
    }
    drafts = draftIds.size;

    const company = String(settings['Company Name'] || '');
    const currency = String(settings['Currency'] || 'IDR').trim() || 'IDR';
    const net = r2_(income - expense);
    const arTotals = agingReports_(agingBuild_(arLines, 'AR', asOf), 'AR', asOf, { company: company }).totals;
    const apTotals = agingReports_(agingBuild_(apLines, 'AP', asOf), 'AP', asOf, { company: company }).totals;

    const recent = Array.from(recentMap.values())
      .filter(v => v && v !== true)
      .sort((a, b) => (b.date - a.date) || String(b.journalId).localeCompare(String(a.journalId)))
      .slice(0, 6)
      .map(item => ({
        journalId: item.journalId, date: dateToIso_(item.date), journalType: item.journalType,
        description: item.description, reference: item.reference, party: item.party,
        debit: r2_(item.debit), credit: r2_(item.credit), lines: item.lines
      }));

    const tbDiff = Math.abs(r2_(tbEnd));
    const bsDiff = Math.abs(r2_(bsAssets - bsLiabEq));
    const checks = [];
    if (tbDiff > TOLERANCE || bsDiff > TOLERANCE) checks.push({ level: 'danger', text: tr_('Ledger or balance sheet is out of balance. Run Check COA & Settings.', 'Buku besar atau neraca tidak seimbang. Jalankan Periksa COA & Pengaturan.') });
    if (drafts) checks.push({ level: 'warn', text: tr_(drafts + ' journal draft(s) are waiting to be posted.', drafts + ' draf jurnal menunggu untuk diposting.') });
    if (arTotals.overdue > 0) checks.push({ level: 'warn', text: tr_('Some receivables are past their due date.', 'Ada piutang yang telah melewati jatuh tempo.') });
    if (!checks.length) checks.push({ level: 'ok', text: tr_('Ledger balances and no urgent action is needed.', 'Buku seimbang dan tidak ada tindakan mendesak.') });

    const result = {
      success: true, company: company, mode: getCompanyMode_(), currency: currency,
      profile: { legalName: String(settings['Legal Name'] || ''), npwp: String(settings['NPWP'] || ''), nib: String(settings['NIB'] || ''), address: String(settings['Address'] || ''), phone: String(settings['Phone'] || ''), email: String(settings['Email'] || ''), businessType: String(settings['Business Type'] || ''), goLiveDate: String(settings['Go Live Date'] || ''), fiscalStart: fiscalStart },
      period: periodText, fiscalFrom: String(fiscalFrom).slice(0, 4) + '-' + String(fiscalFrom).slice(4),
      hasData: values.length > 0, cash: r2_(cash), income: r2_(income), expense: r2_(expense), net: net,
      incomeYtd: r2_(incomeYtd), expenseYtd: r2_(expenseYtd),
      ar: arTotals.open, arOverdue: arTotals.overdue, ap: apTotals.open, apOverdue: apTotals.overdue,
      assets: r2_(bsAssets), liabilities: 0, equity: r2_(bsLiabEq), drafts: drafts, recent: recent, checks: checks,
      updatedAt: new Date().toISOString()
    };
    webCachePut_(WEB_CACHE_DASH, result, 120);
    return result;
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}

const WEB_CACHE_DASH = 'web:dashboard';
const WEB_CACHE_JOURNALS = 'web:journals:';

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
function webInvalidateCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const keys = [WEB_CACHE_DASH];
    for (let i = 0; i < 5; i++) keys.push(WEB_CACHE_JOURNALS + 'ALL:' + [50,100,200,500][i % 4]);
    ['ALL','POSTED','DRAFT'].forEach(s => [50,100,200,500].forEach(l => keys.push(WEB_CACHE_JOURNALS + s + ':' + l)));
    cache.removeAll(keys);
  } catch (e) {}
}

function webSetLanguage(lang) {
  setLanguage_(lang === 'ID' ? 'ID' : 'EN');
  webInvalidateCache_();
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

function webExportAccountingExcel() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    const token = ScriptApp.getOAuthToken();
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Export failed: HTTP ' + res.getResponseCode());
    const blob = res.getBlob().setName((ss.getName() || 'Accounting') + '.xlsx');
    const b64 = Utilities.base64Encode(blob.getBytes());
    return { success: true, fileName: blob.getName(), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: b64 };
  } catch (e) {
    return { success: false, message: e && e.message ? e.message : String(e) };
  }
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

    const settings = readSettings_();
    const period = Number(periodText.replace('-', ''));
    const m0 = Number(settings['Fiscal Year Start Month']) || 1;
    const year = Math.floor(period / 100), mi = period % 100 - 1;
    const monthEn = MONTH_NAMES[mi] + ' ' + year, monthId = MONTH_NAMES_ID[mi] + ' ' + year;
    const meta = {
      company: settings['Company Name'] || '',
      label: tr_('For the month ended ' + monthEn, 'Untuk bulan yang berakhir pada ' + monthId),
      bsLabel: tr_('As at end of the month ended ' + monthEn, 'Pada akhir bulan ' + monthId),
      eqLabel: tr_('Year to date to ' + monthEn, 'Sampai dengan tahun berjalan pada ' + monthId)
    };
    const all = computeReports_(loadPostedForReports_(), readCoa_(), period, m0, meta);
    const reports = {};
    keys.forEach(key => { reports[key] = webSerializeReport_(all[key]); });
    return {
      success: true,
      period: periodText,
      keys: keys,
      reports: reports,
      warnings: webSerializeReport_(all.warnings || []),
      generatedAt: new Date().toISOString()
    };
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

function webListJournals(options) {
  try {
    const opts = options || {};
    const status = String(opts.status || 'ALL').toUpperCase();
    const limit = Math.max(1, Math.min(500, Number(opts.limit) || 200));
    const cacheKey = WEB_CACHE_JOURNALS + status + ':' + limit;
    const cached = webCacheGet_(cacheKey);
    if (cached) return cached;
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues();
    const grouped = {};
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const id = String(row[COL.id] || '').trim();
      if (!id) continue;
      const rowStatus = String(row[COL.status] || '').toUpperCase();
      if (status !== 'ALL' && rowStatus !== status) continue;
      if (!grouped[id]) {
        grouped[id] = {
          journalId: id,
          date: '',
          journalType: '',
          status: rowStatus,
          description: '',
          reference: '',
          party: '',
          debit: 0,
          credit: 0,
          lineCount: 0,
          postedAt: '',
          updatedAt: ''
        };
      }
      const item = grouped[id];
      item.lineCount += 1;
      item.debit += Number(row[COL.debit]) || 0;
      item.credit += Number(row[COL.credit]) || 0;
      if (!item.date) item.date = dateToIso_(row[COL.date]);
      if (!item.journalType) item.journalType = String(row[COL.type] || '');
      if (!item.description && row[COL.description]) item.description = String(row[COL.description]);
      if (!item.reference && row[COL.reference]) item.reference = String(row[COL.reference]);
      if (!item.party && row[COL.party]) item.party = String(row[COL.party]);
      if (!item.postedAt && row[COL.postedAt]) item.postedAt = webDateTime_(row[COL.postedAt]);
      if (!item.updatedAt && row[COL.updatedAt]) item.updatedAt = webDateTime_(row[COL.updatedAt]);
    }
    const journals = Object.keys(grouped).map(key => grouped[key])
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.journalId).localeCompare(String(a.journalId)))
      .slice(0, limit);
    journals.forEach(item => {
      item.debit = r2_(item.debit);
      item.credit = r2_(item.credit);
    });
    const result = { success: true, journals: journals, count: journals.length };
    webCachePut_(cacheKey, result, 120);
    return result;
  } catch (error) {
    return { success: false, message: error && error.message ? error.message : String(error) };
  }
}
