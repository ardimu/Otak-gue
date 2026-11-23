/**
 * ============================================================
 * ACCOUNTING SYSTEM FOR GOOGLE SHEETS
 * Stage 1: Foundation (setup, journal entry, drafts, posting)
 * ============================================================
 *
 * Sheets used
 *   Settings : company, business type, default account mapping
 *   COA      : chart of accounts
 *   Journal  : ONE sheet, one row per journal line.
 *              Status = DRAFT or POSTED. Reports will read POSTED only.
 *
 * Files in this project
 *   Code.gs, JournalForm.html, DraftManagement.html
 *
 * First run
 *   Reload the spreadsheet, then ACCOUNTING > Setup > Install / Update System.
 * ============================================================
 */

const SHEETS = { SETTINGS: 'Settings', COA: 'COA', JOURNAL: 'Journal' };
const STATUS = { DRAFT: 'DRAFT', POSTED: 'POSTED' };
const LOCK_MS = 30000;
const TOLERANCE = 0.005;
const BUSINESS_TYPES = ['Service', 'Trading', 'Manufacturing'];

const JOURNAL_TYPES = [
  { group: 'Everyday', items: [
    'General Journal', 'Sales Journal', 'Purchase Journal',
    'Cash Receipt Journal', 'Cash Disbursement Journal'
  ]},
  { group: 'Specialized', items: [
    'Payroll Journal', 'Asset Acquisition', 'Asset Disposal',
    'Capital & Equity', 'Loan & Financing', 'Fund Transfer',
    'Inventory Adjustment', 'Production Transfer'
  ]},
  { group: 'Period-end', items: [
    'Adjusting Entry', 'Reversing Entry', 'Closing Entry',
    'Opening Entry', 'Correction Entry', 'Reclassification Entry'
  ]}
];

/* One row per journal line. [key, header]. Order = column order. */
const JOURNAL_FIELDS = [
  ['id', 'Journal ID'], ['line', 'Line'], ['date', 'Date'],
  ['period', 'Period (YYYYMM)'], ['type', 'Journal Type'], ['status', 'Status'],
  ['reference', 'Reference'], ['party', 'Customer / Supplier'],
  ['taxDocNo', 'Tax Document No.'], ['source', 'Supporting Document'],
  ['description', 'Description'], ['accountCode', 'Account Code'],
  ['accountName', 'Account Name'], ['lineDescription', 'Line Description'],
  ['debit', 'Debit'], ['credit', 'Credit'], ['taxType', 'Tax Type'],
  ['taxRate', 'Tax Rate (%)'], ['taxBase', 'Tax Base'], ['taxAmount', 'Tax Amount'],
  ['entryMode', 'Entry Mode'], ['transactionType', 'Transaction Type'],
  ['paymentMethod', 'Payment Method'], ['paymentAccount', 'Payment Account'],
  ['paymentAmount', 'Payment Amount'], ['linkedId', 'Linked Journal ID'],
  ['createdAt', 'Created At'], ['createdBy', 'Created By'],
  ['updatedAt', 'Updated At'], ['postedAt', 'Posted At'], ['postedBy', 'Posted By'],
  ['formState', 'Form State (System)'],
  ['partyId', 'Party ID'], ['dueDate', 'Due Date'], ['origin', 'Origin'], ['batchId', 'Batch ID'],
  ['importKey', 'Import Key']
];
const JOURNAL_HEADERS = JOURNAL_FIELDS.map(f => f[1]);
const COL = {};
JOURNAL_FIELDS.forEach((f, i) => { COL[f[0]] = i; });

/* Accounts the form and reports rely on. [key, label, default code] */
const ACCOUNT_MAPPINGS = [
  ['ar', 'Trade Receivables', '1201'],
  ['ap', 'Trade Payables', '2101'],
  ['salariesPayable', 'Salaries Payable', '2102'],
  ['inputVat', 'Input VAT (PPN Masukan)', '1501'],
  ['outputVat', 'Output VAT (PPN Keluaran)', '2201'],
  ['merchandise', 'Merchandise Inventory', '1301'],
  ['rawMaterials', 'Raw Materials', '1302'],
  ['finishedGoods', 'Finished Goods', '1304'],
  ['cogs', 'Cost of Goods Sold', '5101'],
  ['salesProduct', 'Default Product Sales', '4101'],
  ['salesService', 'Default Service Revenue', '4102'],
  ['salesRental', 'Default Rental Revenue', '4104'],
  ['pph21Payable', 'PPh 21 Payable', '2202'],
  ['pph22Payable', 'PPh 22 Payable', '2203'],
  ['pph23Payable', 'PPh 23 Payable', '2204'],
  ['pph42Payable', 'PPh 4(2) Payable', '2205'],
  ['prepaidPph22', 'Prepaid PPh 22', '1502'],
  ['prepaidPph23', 'Prepaid PPh 23', '1503'],
  ['finalTaxExpense', 'Final Income Tax Expense', '9102'],
  ['retainedEarnings', 'Retained Earnings', '3301'],
  ['incomeSummary', 'Income Summary', '3900'],
  ['openingEquity', 'Opening Balance Equity', '3302']
];

const PARTY_ACCOUNT_GROUPS = {
  Customer: ['Trade Receivables', 'Other Receivables', 'Customer Advances'],
  Supplier: ['Trade Payables', 'Purchase Advances', 'Other Payables']
};

const GENERAL_SETTINGS = [
  ['Company Name', 'My Company', 'Shown on report headers.'],
  ['Legal Name', '', 'Legal entity name used on official documents.'],
  ['NPWP', '', 'Company tax ID. Shown on report headers.'],
  ['NIB', '', 'Business identification number.'],
  ['Address', '', 'Registered company address.'],
  ['Phone', '', 'Company phone number.'],
  ['Email', '', 'Company email address.'],
  ['Company Logo', '', 'Small image shown in the report header.'],
  ['Business Type', 'Trading', 'Service, Trading, or Manufacturing. Sets the default accounts in Assisted Entry.'],
  ['Inventory Method', 'Perpetual', 'Perpetual only.'],
  ['Fiscal Year Start Month', 1, '1 = January. Used by reports.'],
  ['Currency', 'IDR', ''],
  ['Bank Suspense Account', '', 'Optional. Account code for bank lines you cannot classify yet. Leave blank to choose an account for every line.'],
  ['Lock Date', '', 'Optional. Journals dated on or before this date cannot be posted or edited (YYYY-MM-DD). Leave blank for no lock.'],
  ['Language', 'English', 'English or Bahasa Indonesia. Managed in the accounting menu.'],
  ['Mode', 'PRACTICE', 'PRACTICE or LIVE. Managed in Company Profile & Settings.'],
  ['Go Live Date', '', 'Date when the system moved to LIVE.'],
  ['Went Live By', '', 'User who moved the system to LIVE.']
];

/* ------------------------------------------------------------
   COA TEMPLATE
   Block = (type, normal, category, parent, items, groupByName)
   Item  = [code, name, reportGroup?, normalOverride?]
------------------------------------------------------------ */
function coaBlock_(type, normal, category, parent, items, groupByName) {
  return items.map(i => [
    i[0], i[1], type, i[3] || normal, parent,
    i[2] || (groupByName ? i[1] : parent), category
  ]);
}

const COA_TEMPLATE = [].concat(
  // ASSETS
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Cash & Cash Equivalents', [
    ['1101', 'Cash on Hand'], ['1102', 'Bank Accounts'], ['1103', 'Petty Cash']]),
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Short-Term Investments', [
    ['1104', 'Short-Term Investments']]),
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Receivables', [
    ['1201', 'Trade Receivables'],
    ['1202', 'Allowance for Doubtful Accounts', null, 'Credit'],
    ['1203', 'Employee Receivables', 'Other Receivables'],
    ['1204', 'Other Receivables']], true),
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Inventories', [
    ['1301', 'Merchandise Inventory'], ['1302', 'Raw Materials'],
    ['1303', 'Work in Progress'], ['1304', 'Finished Goods']], true),
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Prepayments & Advances', [
    ['1401', 'Purchase Advances'], ['1402', 'Prepaid Expenses'],
    ['1403', 'Prepaid Rent'], ['1404', 'Prepaid Insurance']], true),
  coaBlock_('ASSET', 'Debit', 'Current Asset', 'Tax Assets', [
    ['1501', 'Input VAT (PPN Masukan)', 'Input VAT'],
    ['1502', 'Prepaid PPh 22', 'Prepaid Income Taxes'],
    ['1503', 'Prepaid PPh 23', 'Prepaid Income Taxes'],
    ['1504', 'Prepaid PPh 25 (Installments)', 'Prepaid Income Taxes']]),
  coaBlock_('ASSET', 'Debit', 'Non-Current Asset', 'Property, Plant & Equipment', [
    ['1601', 'Land'], ['1602', 'Buildings'], ['1603', 'Vehicles'],
    ['1604', 'Machinery'], ['1605', 'Office Equipment'],
    ['1606', 'Furniture & Fixtures'], ['1607', 'Computer Equipment'],
    ['1608', 'Construction in Progress']], true),
  coaBlock_('ASSET', 'Credit', 'Non-Current Asset', 'Accumulated Depreciation', [
    ['1651', 'Accumulated Depreciation - Buildings'],
    ['1652', 'Accumulated Depreciation - Vehicles'],
    ['1653', 'Accumulated Depreciation - Machinery'],
    ['1654', 'Accumulated Depreciation - Office Equipment'],
    ['1655', 'Accumulated Depreciation - Furniture & Fixtures'],
    ['1656', 'Accumulated Depreciation - Computer Equipment']], true),
  coaBlock_('ASSET', 'Debit', 'Non-Current Asset', 'Long-Term Investments', [
    ['1701', 'Long-Term Investments']]),
  coaBlock_('ASSET', 'Debit', 'Non-Current Asset', 'Intangible Assets', [
    ['1801', 'Goodwill'], ['1802', 'Other Intangible Assets'],
    ['1803', 'Accumulated Amortization', null, 'Credit']], true),
  coaBlock_('ASSET', 'Debit', 'Non-Current Asset', 'Other Non-Current Assets', [
    ['1901', 'Security Deposits']], true),

  // LIABILITIES
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Trade Payables', [
    ['2101', 'Trade Payables']]),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Payroll Liabilities', [
    ['2102', 'Salaries Payable'], ['2103', 'BPJS Payable'],
    ['2104', 'Bonus & THR Provision']], true),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Accrued Liabilities', [
    ['2110', 'Accrued Expenses']]),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Customer Advances', [
    ['2111', 'Customer Advances & Unearned Revenue']]),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Tax Liabilities', [
    ['2201', 'Output VAT (PPN Keluaran)', 'Output VAT'],
    ['2202', 'PPh 21 Payable', 'Withholding Taxes Payable'],
    ['2203', 'PPh 22 Payable', 'Withholding Taxes Payable'],
    ['2204', 'PPh 23 Payable', 'Withholding Taxes Payable'],
    ['2205', 'PPh 4(2) Payable', 'Withholding Taxes Payable'],
    ['2206', 'Corporate Income Tax Payable (PPh 25/29)', 'Income Tax Payable'],
    ['2207', 'Other Taxes Payable']]),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Financial Liabilities', [
    ['2301', 'Bank Loans - Current Portion', 'Bank Loans'],
    ['2302', 'Lease Liabilities - Current', 'Lease Liabilities']]),
  coaBlock_('LIABILITY', 'Credit', 'Current Liability', 'Other Liabilities', [
    ['2303', 'Due to Shareholders - Current', 'Due to Shareholders'],
    ['2304', 'Dividends Payable'], ['2305', 'Other Payables']]),
  coaBlock_('LIABILITY', 'Credit', 'Non-Current Liability', 'Financial Liabilities', [
    ['2401', 'Bank Loans - Long-Term', 'Bank Loans'],
    ['2402', 'Lease Liabilities - Long-Term', 'Lease Liabilities']]),
  coaBlock_('LIABILITY', 'Credit', 'Non-Current Liability', 'Other Liabilities', [
    ['2403', 'Due to Shareholders - Long-Term', 'Due to Shareholders'],
    ['2404', 'Employee Benefits Liability']]),

  // EQUITY
  coaBlock_('EQUITY', 'Credit', 'Equity', 'Contributed Capital', [
    ['3101', 'Paid-in Capital', 'Share Capital'],
    ['3102', 'Additional Paid-in Capital']]),
  coaBlock_('EQUITY', 'Debit', 'Equity', 'Distributions', [
    ['3201', 'Owner Withdrawals (Prive)', 'Owner Withdrawals'],
    ['3202', 'Dividends Declared', 'Dividends']]),
  coaBlock_('EQUITY', 'Credit', 'Equity', 'Retained Earnings', [
    ['3301', 'Retained Earnings'], ['3302', 'Opening Balance Equity']]),
  coaBlock_('EQUITY', 'Credit', 'Equity', 'Clearing', [
    ['3900', 'Income Summary']]),

  // REVENUE
  coaBlock_('REVENUE', 'Credit', 'Revenue', 'Operating Revenue', [
    ['4101', 'Product Sales'], ['4102', 'Service Revenue'],
    ['4103', 'Project Revenue']], true),
  coaBlock_('REVENUE', 'Credit', 'Revenue', 'Other Operating Revenue', [
    ['4104', 'Rental Revenue'], ['4105', 'Commission Revenue']], true),
  coaBlock_('REVENUE', 'Debit', 'Contra Revenue', 'Sales Adjustments', [
    ['4201', 'Sales Discounts'], ['4202', 'Sales Returns & Allowances']], true),

  // COST OF SALES
  coaBlock_('COGS', 'Debit', 'Cost of Sales', 'Cost of Sales', [
    ['5101', 'Cost of Goods Sold'], ['5102', 'Cost of Services']], true),
  coaBlock_('COGS', 'Debit', 'Cost of Sales', 'Production Costs', [
    ['5201', 'Direct Labor'], ['5202', 'Manufacturing Overhead']], true),
  coaBlock_('COGS', 'Debit', 'Cost of Sales', 'Inventory Adjustments', [
    ['5301', 'Inventory Adjustments & Shrinkage']], true),

  // OPERATING EXPENSES
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Personnel Expenses', [
    ['6101', 'Salaries & Allowances'], ['6102', 'Overtime'],
    ['6103', 'Holiday Allowance (THR)'], ['6104', 'Bonus'],
    ['6105', 'BPJS Kesehatan (Health)'], ['6106', 'BPJS Ketenagakerjaan (Employment)'],
    ['6107', 'Training & Development'], ['6108', 'Recruitment'],
    ['6109', 'Uniforms']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Utilities Expenses', [
    ['6201', 'Electricity'], ['6202', 'Water'], ['6203', 'Internet'],
    ['6204', 'Telephone']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Occupancy Expenses', [
    ['6301', 'Office Rent'], ['6302', 'Cleaning'], ['6303', 'Security']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Transportation Expenses', [
    ['6401', 'Transportation'], ['6402', 'Fuel'], ['6403', 'Parking & Tolls'],
    ['6404', 'Business Travel']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Office Expenses', [
    ['6501', 'Office Supplies'], ['6502', 'Meals & Refreshments'],
    ['6503', 'Entertainment']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Marketing Expenses', [
    ['6601', 'Advertising & Promotion']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Selling & Distribution', [
    ['6701', 'Packaging'], ['6702', 'Shipping & Delivery']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Professional Fees', [
    ['6801', 'Legal Fees'], ['6802', 'Audit Fees'], ['6803', 'Consulting Fees']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'IT Expenses', [
    ['6901', 'Software & Subscriptions'], ['6902', 'Hosting & Domain']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Maintenance Expenses', [
    ['6911', 'Repairs & Maintenance'], ['6912', 'Vehicle Maintenance']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'Depreciation & Amortization', [
    ['6921', 'Depreciation - Buildings'], ['6922', 'Depreciation - Vehicles'],
    ['6923', 'Depreciation - Machinery'], ['6924', 'Depreciation - Office Equipment'],
    ['6925', 'Depreciation - Furniture & Fixtures'],
    ['6926', 'Depreciation - Computer Equipment'],
    ['6927', 'Amortization Expense']], true),
  coaBlock_('EXPENSE', 'Debit', 'Operating Expense', 'General & Administrative', [
    ['6931', 'Insurance'], ['6932', 'Taxes & Levies (Non-Income)'],
    ['6933', 'Bank Charges'], ['6934', 'Bad Debt Expense'], ['6935', 'Donations'],
    ['6936', 'Research & Development'], ['6999', 'Miscellaneous Expenses']], true),

  // OTHER INCOME / EXPENSE / TAX
  coaBlock_('OTHER INCOME', 'Credit', 'Other Income', 'Other Income', [
    ['7101', 'Interest Income'], ['7102', 'Foreign Exchange Gain'],
    ['7103', 'Gain on Asset Disposal'], ['7104', 'Other Non-Operating Income']], true),
  coaBlock_('OTHER EXPENSE', 'Debit', 'Other Expense', 'Other Expenses', [
    ['8101', 'Interest Expense'], ['8102', 'Foreign Exchange Loss'],
    ['8103', 'Loss on Asset Disposal'], ['8104', 'Other Non-Operating Expense']], true),
  coaBlock_('TAX', 'Debit', 'Income Tax Expense', 'Income Tax', [
    ['9101', 'Corporate Income Tax Expense'],
    ['9102', 'Final Income Tax Expense (PPh Final)']], true)
);

const COA_HEADERS = [
  'Account Type', 'Account Name', 'Account Code', 'Normal Balance',
  'Parent Account', 'Report Group', 'Category', 'Status'
];


/* ============================================================
   1. MENU
============================================================ */

function onOpen() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi()
    .createMenu('Menu')
    .addItem(indonesian ? 'Akuntansi' : 'Accounting', 'showAccountingMenu')
    .addItem(indonesian ? 'Profil & Pengaturan Perusahaan' : 'Company Profile & Settings', 'showCompanySettings')
    .addToUi();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getLanguage() {
  try {
    const value = String(PropertiesService.getDocumentProperties().getProperty('UI_LANGUAGE') || '').trim().toUpperCase();
    return value === 'ID' ? 'ID' : 'EN';
  } catch (e) { return 'EN'; }
}

function tr_(english, indonesian) {
  return getLanguage() === 'ID' ? indonesian : english;
}

function setLanguage_(code) {
  const indonesian = code === 'ID';
  const value = indonesian ? 'Bahasa Indonesia' : 'English';
  setSettingValue_('Language', value);
  PropertiesService.getDocumentProperties().setProperty('UI_LANGUAGE', indonesian ? 'ID' : 'EN');
  return value;
}

function useLanguageEnglish() {
  setLanguage_('EN');
  showAccountingMenu();
  return { success: true, language: 'EN' };
}

function useLanguageIndonesian() {
  setLanguage_('ID');
  showAccountingMenu();
  return { success: true, language: 'ID' };
}

function showAccountingMenu() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi().showSidebar(
    HtmlService.createTemplateFromFile(indonesian ? 'AccountingMenuId' : 'AccountingMenu')
      .evaluate()
      .setTitle(indonesian ? 'AKUNTANSI' : 'ACCOUNTING')
  );
}


/* ============================================================
   2. SETUP
============================================================ */

function installSystem(options) {
  const web = !!(options && options.web);
  const ui = web ? null : SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];

  // Settings
  let settings = ss.getSheetByName(SHEETS.SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEETS.SETTINGS);
    writeTable_(settings, ['Setting', 'Value', 'Notes'], settingsRows_());
    log.push('Created sheet "Settings".');
  } else {
    const added = addMissingSettings_(settings);
    log.push(added ? `Settings: added ${added} missing row(s).` : 'Settings: already complete.');
  }
  formatSettings_(settings);
  const initialLanguage = String(readSettings_()['Language'] || '').trim().toLowerCase().indexOf('indonesia') >= 0 ? 'ID' : 'EN';
  PropertiesService.getDocumentProperties().setProperty('UI_LANGUAGE', initialLanguage);
  ensureCompanySetup_();

  // COA
  let coa = ss.getSheetByName(SHEETS.COA);
  let writeNewCoa = !coa;
  if (coa && !coaIsCurrent_()) {
    let replaceCoa = false;
    if (web) replaceCoa = options.replaceCoa === true;
    else {
      const answer = ui.alert(
        'Replace the chart of accounts?',
        'The current COA sheet does not match the new template ' +
        '(English names, new account codes, tax accounts for PPh 21/22/23/4(2)).\n\n' +
        'YES: keep your current sheet as a backup and create the new COA.\n' +
        'NO: keep the current COA. You must then update the account codes in Settings yourself.',
        ui.ButtonSet.YES_NO
      );
      replaceCoa = answer === ui.Button.YES;
    }
    if (replaceCoa) {
      const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmm');
      const backupName = uniqueSheetName_(ss, 'COA_BACKUP_' + stamp);
      coa.setName(backupName);
      writeNewCoa = true;
      log.push(`Old COA kept as "${backupName}".`);
    } else log.push('COA: outdated sheet kept. Update the account codes in Settings yourself.');
  }
  if (writeNewCoa) {
    coa = ss.insertSheet(SHEETS.COA);
    writeTable_(coa, COA_HEADERS, COA_TEMPLATE.map(r => [r[2], r[1], r[0], r[3], r[4], r[5], r[6], 'Active']));
    log.push(`Created new COA with ${COA_TEMPLATE.length} accounts.`);
  } else {
    log.push('COA: kept as is.');
  }
  formatCoa_(ss.getSheetByName(SHEETS.COA));

  // Journal
  let journal = ss.getSheetByName(SHEETS.JOURNAL);
  if (!journal) {
    journal = ss.insertSheet(SHEETS.JOURNAL);
    log.push('Created sheet "Journal".');
  }
  ensureJournalHeaders_(journal);
  formatJournal_(journal);

  installMasterData_(ss, log);
  installBankSheets_(ss, log);
  installPeriodEndSheets_(ss, log);
  installInventorySheets_(ss, log);

  const legacy = ['DRAFT', 'JOURNAL HEADER', 'JOURNAL DETAIL'].filter(n => ss.getSheetByName(n));
  if (legacy.length) {
    log.push(`Old sheets found (${legacy.join(', ')}). They are no longer used. ` +
      'Check them, then delete or archive them.');
  }

  const message = log.join('\n') + '\n\nNext: ACCOUNTING > Setup > Check COA & Settings.';
  if (web) return { success: true, log: log.join('\n'), message: message };
  ui.alert('Setup finished', message, ui.ButtonSet.OK);
}

function runSetupCheck(options) {
  const issues = collectSetupIssues_();
  if (options && options.web) return { success: issues.length === 0, issues: issues };
  const ui = SpreadsheetApp.getUi();
  if (!issues.length) {
    ui.alert('Check passed', 'COA and Settings look consistent.', ui.ButtonSet.OK);
    return;
  }
  const shown = issues.slice(0, 20).join('\n');
  const more = issues.length > 20 ? `\n...and ${issues.length - 20} more.` : '';
  ui.alert(`${issues.length} issue(s) found`, shown + more, ui.ButtonSet.OK);
}

function settingsRows_() {
  return GENERAL_SETTINGS.concat(ACCOUNT_MAPPINGS.map(m => [
    mappingKey_(m), m[2], 'Account code used by Assisted Entry and reports. Must exist in the COA.'
  ]));
}

function mappingKey_(m) { return 'Account: ' + m[1]; }

function mappingCode_(settings, key) {
  const m = ACCOUNT_MAPPINGS.find(x => x[0] === key);
  return m ? String((settings && settings[mappingKey_(m)]) || m[2]).trim() : '';
}

function isPartyAccount_(account, partyType, settings) {
  if (!account) return false;
  const code = String(account.code || '').trim();
  const group = String(account.group || '').trim();
  const name = String(account.name || '').trim();
  if (/employee|allowance|doubtful/i.test(name)) return false;
  const customer = code === mappingCode_(settings, 'ar') ||
    PARTY_ACCOUNT_GROUPS.Customer.includes(group) ||
    /trade receivables|other receivables|customer advances/i.test(name);
  const supplier = code === mappingCode_(settings, 'ap') ||
    PARTY_ACCOUNT_GROUPS.Supplier.includes(group) ||
    /trade payables|purchase advances|other payables/i.test(name);
  const want = String(partyType || '').toLowerCase();
  if (want === 'customer') return customer;
  if (want === 'supplier') return supplier;
  return customer || supplier;
}

function partyAccountCodes_(coa, settings) {
  const out = { Customer: [], Supplier: [] };
  coa.forEach(a => {
    if (isPartyAccount_(a, 'Customer', settings)) out.Customer.push(a.code);
    if (isPartyAccount_(a, 'Supplier', settings)) out.Supplier.push(a.code);
  });
  return out;
}

function allowedAccountCodesFor_(journalType, coa, settings) {
  if (!journalType || ['General Journal', 'Correction Entry', 'Reclassification Entry'].includes(journalType)) return null;
  const codes = new Set();
  const add = a => codes.add(a.code);
  const types = t => coa.filter(a => String(a.type || '').toUpperCase() === t).forEach(add);
  const groups = names => coa.filter(a => {
    const text = (String(a.group || '') + ' ' + String(a.name || '')).toLowerCase();
    return names.some(n => text.includes(String(n).toLowerCase()));
  }).forEach(add);
  const code = key => mappingCode_(settings, key);

  if (journalType === 'Opening Entry') {
    ['ASSET', 'LIABILITY', 'EQUITY'].forEach(types);
  } else if (journalType === 'Closing Entry') {
    [code('incomeSummary'), code('retainedEarnings'), '3201', '3202'].filter(Boolean).forEach(c => {
      const a = coa.find(x => String(x.code) === c); if (a) add(a);
    });
    ['REVENUE', 'COGS', 'EXPENSE'].forEach(types);
    coa.filter(a => /production costs|direct labor|manufacturing overhead/i.test(
      String(a.parent || '') + ' ' + String(a.group || '') + ' ' + String(a.name || '')
    )).forEach(a => codes.delete(a.code));
  } else if (journalType === 'Reversing Entry') {
    groups(['Accrued', 'Payroll Liabilities', 'Tax Liabilities', 'Customer Advances', 'Receivable']);
    ['REVENUE', 'EXPENSE'].forEach(types);
  } else if (journalType === 'Adjusting Entry') {
    ['REVENUE', 'EXPENSE'].forEach(types);
    groups(['Accrued', 'Payroll Liabilities', 'Tax Liabilities', 'Customer Advances',
      'Receivable', 'Prepaid', 'Prepayment', 'Depreciation', 'Amortization',
      'Inventory Adjustments', 'Allowance']);
  }
  return codes.size ? codes : null;
}

function validateJournalScopes_(p, coaMap) {
  const coa = readCoa_();
  const settings = readSettings_();
  const allowed = allowedAccountCodesFor_(p.journalType, coa, settings);
  p.lines.forEach((l, i) => {
    const account = coaMap.get(l.accountCode) || coa.find(a => String(a.code) === l.accountCode) || null;
    if (allowed && !allowed.has(l.accountCode)) {
      throw new Error(tr_(`Line ${i + 1}: account ${l.accountCode} is not allowed in ${p.journalType}.`,
        `Baris ${i + 1}: akun ${l.accountCode} tidak diizinkan dalam ${p.journalType}.`));
    }
    if (l.party && !isPartyAccount_(account, '', settings)) {
      throw new Error(tr_(`Line ${i + 1}: Customer / Supplier cannot be entered for account ${l.accountCode}. Use it only for receivable or payable accounts.`,
        `Baris ${i + 1}: Pelanggan / Pemasok tidak dapat diisi pada akun ${l.accountCode}. Gunakan hanya pada akun piutang atau utang.`));
    }
  });
}

function addMissingSettings_(sheet) {
  const existing = new Set(Object.keys(readSettings_()));
  const missing = settingsRows_().filter(r => !existing.has(r[0]));
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
  return missing.length;
}

function writeTable_(sheet, headers, rows) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function styleHeader_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold').setBackground('#1f5c46').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function formatSettings_(sheet) {
  styleHeader_(sheet, 3);
  sheet.setColumnWidth(1, 260); sheet.setColumnWidth(2, 160); sheet.setColumnWidth(3, 520);
  const keys = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getDisplayValues();
  keys.forEach((r, i) => {
    if (String(r[0]).trim() === 'Business Type') {
      sheet.getRange(i + 2, 2).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(BUSINESS_TYPES, true).build());
    }
  });
}

function formatCoa_(sheet) {
  styleHeader_(sheet, COA_HEADERS.length);
  const n = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 4, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Debit', 'Credit'], true).build());
  sheet.getRange(2, 8, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive'], true).build());
  [150, 300, 110, 120, 220, 260, 170, 90].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

function ensureJournalHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, JOURNAL_HEADERS.length).setValues([JOURNAL_HEADERS]);
    return;
  }
  const width = Math.max(sheet.getLastColumn(), JOURNAL_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  JOURNAL_HEADERS.forEach((h, i) => {
    const have = String(current[i] || '').trim();
    if (!have) {
      sheet.getRange(1, i + 1).setValue(h);   // new column added at the end
    } else if (have !== h) {
      throw new Error(
        `Sheet "Journal" column ${i + 1} should be "${h}" but is "${have}".
` +
        'Rename the old sheet, then run Install / Update System again.');
    }
  });
}

function formatJournal_(sheet) {
  styleHeader_(sheet, JOURNAL_HEADERS.length);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const fmt = (key, f) => sheet.getRange(2, COL[key] + 1, rows, 1).setNumberFormat(f);

  ['id', 'type', 'status', 'reference', 'party', 'taxDocNo', 'source', 'description',
   'accountName', 'lineDescription', 'taxType', 'entryMode', 'transactionType',
   'paymentMethod', 'linkedId', 'createdBy', 'postedBy', 'formState', 'partyId', 'origin', 'batchId', 'importKey']
    .forEach(k => fmt(k, '@'));
  fmt('date', 'dd mmm yyyy');
  fmt('dueDate', 'dd mmm yyyy');
  fmt('period', '0');
  ['debit', 'credit', 'taxBase', 'taxAmount', 'paymentAmount'].forEach(k => fmt(k, '#,##0.00'));
  fmt('taxRate', '0.00');
  ['createdAt', 'updatedAt', 'postedAt'].forEach(k => fmt(k, 'dd mmm yyyy hh:mm'));

  [110, 45, 95, 90, 170, 80, 120, 160, 140, 150, 260, 90, 220, 220, 120, 120].forEach(
    (w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.hideColumns(COL.formState + 1);

  if (!sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sheet.protect()
      .setDescription('Journal rows are written by the ACCOUNTING menu. Edit by hand only with care.')
      .setWarningOnly(true);
  }
}

function uniqueSheetName_(ss, base) {
  let name = base, n = 1;
  while (ss.getSheetByName(name)) { name = `${base}_${n++}`; }
  return name;
}


/* ============================================================
   3. COA, SETTINGS, CONFIG
============================================================ */

function readCoa_() {
  const sheet = getRequiredSheet_(SHEETS.COA);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const head = values[0].map(h => String(h).trim().toLowerCase());
  const idx = name => {
    const i = head.indexOf(name.toLowerCase());
    if (i < 0) throw new Error(`COA column "${name}" was not found.`);
    return i;
  };
  const c = {
    type: idx('Account Type'), name: idx('Account Name'), code: idx('Account Code'),
    normal: idx('Normal Balance'), parent: idx('Parent Account'),
    group: idx('Report Group'), category: idx('Category'), status: idx('Status')
  };
  const seen = new Set();
  const out = [];
  values.slice(1).forEach((r, i) => {
    const name = String(r[c.name]).trim();
    const code = String(r[c.code]).trim();
    if (!name && !code) return;
    if (!name || !code) throw new Error(`COA row ${i + 2} is incomplete (name or code is empty).`);
    if (seen.has(code)) throw new Error(`COA has a duplicate account code: ${code}.`);
    seen.add(code);
    const status = String(r[c.status]).trim().toLowerCase();
    out.push({
      code: code, name: name,
      type: String(r[c.type]).trim().toUpperCase(),
      normal: normalizeSide_(r[c.normal]),
      parent: String(r[c.parent]).trim(),
      group: String(r[c.group]).trim(),
      category: String(r[c.category]).trim(),
      active: !['inactive', 'nonaktif', 'inactive account'].includes(status)
    });
  });
  return out;
}

function normalizeSide_(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'DEBIT' || s === 'DEBET') return 'DEBIT';
  if (s === 'CREDIT' || s === 'KREDIT') return 'CREDIT';
  return s;
}

function getCoaMap_() {
  return new Map(readCoa_().map(a => [a.code, a]));
}

function readSettings_() {
  const sheet = getRequiredSheet_(SHEETS.SETTINGS);
  const out = {};
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(r => {
    const k = String(r[0]).trim();
    if (k) out[k] = String(r[1]).trim();
  });
  return out;
}

/** Everything the journal form needs, in one call. Primitives only. */
function getAppConfig() {
  const s = readSettings_();
  const coa = readCoa_();
  const mappings = {};
  ACCOUNT_MAPPINGS.forEach(m => { mappings[m[0]] = s[mappingKey_(m)] || ''; });
  const customMappings = {};
  Object.keys(s).filter(key => key.indexOf(CUSTOM_ACCOUNT_PREFIX) === 0).forEach(key => {
    customMappings[key.slice(CUSTOM_ACCOUNT_PREFIX.length)] = String(s[key] || '').trim();
  });
  const businessType = BUSINESS_TYPES.includes(s['Business Type']) ? s['Business Type'] : 'Trading';
  const accountScopes = {};
  JOURNAL_TYPES.forEach(g => g.items.forEach(type => {
    const allowed = allowedAccountCodesFor_(type, coa, s);
    if (allowed) accountScopes[type] = Array.from(allowed);
  }));
  return {
    company: s['Company Name'] || '',
    businessType: businessType,
    mappings: mappings,
    customMappings: customMappings,
    journalTypes: JOURNAL_TYPES,
    fiscalStartMonth: Number(s['Fiscal Year Start Month']) || 1,
    parties: getActiveParties_(),
    templates: JOURNAL_TEMPLATES.filter(t => !t.only || t.only.includes(businessType)),
    tax: getTaxConfig_(),
    partyAccountCodes: partyAccountCodes_(coa, s),
    accountScopes: accountScopes,
    accounts: coa.filter(a => a.active).map(a => ({
      code: a.code, name: a.name, type: a.type, normal: a.normal,
      group: a.group, category: a.category
    }))
  };
}

function coaIsCurrent_() {
  try {
    const codes = new Set(readCoa_().map(a => a.code));
    return ACCOUNT_MAPPINGS.every(m => codes.has(m[2]));
  } catch (e) { return false; }
}

/** Pure check of normal balance, type, and report mapping. Used by the menu check and tests. */
function analyzeCoa_(coa) {
  const issues = [];
  const debitTypes = ['ASSET', 'COGS', 'EXPENSE', 'OTHER EXPENSE', 'TAX', 'TAX EXPENSE'];
  const creditTypes = ['LIABILITY', 'EQUITY', 'REVENUE', 'OTHER INCOME'];
  coa.forEach(a => {
    const label = `COA ${a.code} ${a.name}`;
    if (!['DEBIT', 'CREDIT'].includes(a.normal)) {
      issues.push(`${label}: Normal Balance must be Debit or Credit.`);
      return;
    }
    if (!a.group) issues.push(`${label}: Report Group is empty.`);
    if (!a.category) issues.push(`${label}: Category is empty.`);
    let expected = debitTypes.includes(a.type) ? 'DEBIT' : creditTypes.includes(a.type) ? 'CREDIT' : '';
    if (!expected) {
      issues.push(`${label}: unknown Account Type "${a.type}".`);
      return;
    }
    const contra = /^(accumulated|allowance)/i.test(a.name) ||
      /contra/i.test(a.category) || /^distributions$/i.test(a.parent);
    if (contra) expected = expected === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    if (a.normal !== expected) {
      issues.push(`${label}: Normal Balance is ${a.normal}, expected ${expected}.`);
    }
  });
  return issues;
}

function collectSetupIssues_() {
  const issues = [];
  let coa;
  try { coa = readCoa_(); } catch (e) { return ['COA: ' + e.message]; }
  let s;
  try { s = readSettings_(); } catch (e) { return ['Settings: ' + e.message]; }

  if (!BUSINESS_TYPES.includes(s['Business Type'])) {
    issues.push('Settings: Business Type must be Service, Trading, or Manufacturing.');
  }
  const byCode = new Map(coa.map(a => [a.code, a]));
  const allKeys = ACCOUNT_MAPPINGS.map(m => mappingKey_(m))
    .concat(Object.keys(s).filter(key => key.indexOf(CUSTOM_ACCOUNT_PREFIX) === 0));
  allKeys.forEach(key => {
    const code = String(s[key] || '').trim();
    const acc = byCode.get(code);
    if (!code) issues.push(`Settings: "${key}" is empty.`);
    else if (!acc) issues.push(`Settings: "${key}" uses ${code}, which is not in the COA.`);
    else if (!acc.active) issues.push(`Settings: "${key}" uses ${code}, which is inactive.`);
  });
  return issues.concat(analyzeCoa_(coa));
}


/* ============================================================
   4. DIALOGS
============================================================ */

function showJournalDialog(draftId) {
  const indonesian = getLanguage() === 'ID';
  const t = HtmlService.createTemplateFromFile(indonesian ? 'JournalFormId' : 'JournalForm');
  t.draftId = typeof draftId === 'string' ? draftId : '';
  t.appMode = getCompanyMode_();
  SpreadsheetApp.getUi().showModalDialog(
    t.evaluate().setWidth(1120).setHeight(820),
    t.draftId
      ? (indonesian ? 'Ubah Draf ' + t.draftId : 'Edit Draft ' + t.draftId)
      : (indonesian ? 'Jurnal Baru' : 'New Journal Entry')
  );
}

function showDraftManagement() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile(indonesian ? 'DraftManagementId' : 'DraftManagement').setWidth(1050).setHeight(640),
    indonesian ? 'Kelola Draf' : 'Draft Management'
  );
}

function showUserGuide() {
  const indonesian = getLanguage() === 'ID';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile(indonesian ? 'UserGuideId' : 'UserGuide').setWidth(1080).setHeight(760),
    indonesian ? 'Panduan Pengguna & SOP' : 'Accounting User Guide & SOP'
  );
}

/** Called from Draft Management. Confirms the draft can be read, then opens the form. */
function openDraftEditor(journalId) {
  const id = String(journalId || '').trim();
  getDraftById(id);
  showJournalDialog(id);
  return { success: true, journalId: id };
}


/* ============================================================
   5. SAVE / POST
============================================================ */

/**
 * payload.action = 'DRAFT' | 'POST'
 * payload.journalId = existing draft ID when editing
 */
function saveJournal(payload) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) {
    throw new Error(tr_('The system is processing another transaction. Please try again in a moment.', 'Sistem sedang memproses transaksi lain. Silakan coba lagi sebentar.'));
  }
  try {
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const coaMap = getCoaMap_();
    const p = normalizePayload_(payload);
    validateHeader_(p);
    validateAssistedPayment_(p, coaMap);
    const isPost = p.action === 'POST';
    const totals = validateLines_(p.lines, coaMap, isPost);
    validateJournalScopes_(p, coaMap);
    resolveParties_(p);
    if (isPost) requirePartyOnArAp_(p.lines);
    assertNotLocked_(parseLocalDate_(p.date));

    const now = new Date();
    const user = getCurrentUser_();
    let journalId = p.journalId;
    let createdAt = now, createdBy = user;
    let oldRows = [];

    if (journalId) {
      const found = loadJournalRows_(sheet, journalId);
      if (!found.rows.length) {
        throw new Error(tr_(`Draft ${journalId} was not found. Nothing was saved.`, `Draf ${journalId} tidak ditemukan. Tidak ada data yang disimpan.`));
      }
      if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) {
        throw new Error(tr_(`Journal ${journalId} is already posted and cannot be changed.`, `Jurnal ${journalId} telah diposting dan tidak dapat diubah.`));
      }
      createdAt = found.rows[0][COL.createdAt] || now;
      createdBy = String(found.rows[0][COL.createdBy] || '').trim() || user;
      oldRows = found.rowNumbers;
    } else {
      journalId = nextJournalId_(p.date, sheet);
    }

    const rows = buildRows_(p, journalId, coaMap, {
      status: isPost ? STATUS.POSTED : STATUS.DRAFT,
      createdAt: createdAt, createdBy: createdBy, updatedAt: now,
      postedAt: isPost ? now : '', postedBy: isPost ? user : ''
    });
    replaceRows_(sheet, oldRows, rows, journalId);

    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    return {
      success: true,
      journalId: journalId,
      status: isPost ? STATUS.POSTED : STATUS.DRAFT,
      createdBy: String(createdBy),
      postedBy: isPost ? user : '',
      debit: totals.debit,
      credit: totals.credit,
      message: isPost ? tr_('Journal posted.', 'Jurnal telah diposting.') : tr_(p.journalId ? 'Draft updated.' : 'Draft saved.', p.journalId ? 'Draf telah diperbarui.' : 'Draf telah disimpan.')
    };
  } finally {
    lock.releaseLock();
  }
}

function normalizePayload_(p) {
  if (!p || typeof p !== 'object') throw new Error('The journal data is empty or invalid.');
  const str = v => String(v == null ? '' : v).trim();
  return {
    action: str(p.action).toUpperCase(),
    journalId: str(p.journalId),
    date: p.date,
    journalType: str(p.journalType),
    description: str(p.description),
    reference: str(p.reference),
    party: str(p.party),
    taxDocNo: str(p.taxDocNo),
    documentSource: str(p.documentSource),
    entryMode: str(p.entryMode || 'MANUAL').toUpperCase(),
    transactionType: str(p.transactionType),
    paymentMethod: str(p.paymentMethod),
    paymentAccountCode: str(p.paymentAccountCode),
    paymentAmount: toNumber_(p.paymentAmount, 'Payment amount'),
    linkedId: str(p.linkedId),
    dueDate: str(p.dueDate),
    origin: str(p.origin).toUpperCase(),
    batchId: str(p.batchId),
    assistedSettings: p.assistedSettings && typeof p.assistedSettings === 'object' ? p.assistedSettings : {},
    lines: (Array.isArray(p.lines) ? p.lines : []).map(l => ({
      accountCode: str(l.accountCode),
      description: str(l.description),
      party: str(l.party),
      debit: round2_(toNumber_(l.debit, 'Debit')),
      credit: round2_(toNumber_(l.credit, 'Credit')),
      taxType: str(l.taxType),
      taxRate: blankOrNumber_(l.taxRate, 'Tax rate'),
      taxBase: blankOrNumber_(l.taxBase, 'Tax base'),
      taxAmount: blankOrNumber_(l.taxAmount, 'Tax amount')
    }))
  };
}

function validateHeader_(p) {
  if (!['DRAFT', 'POST'].includes(p.action)) throw new Error('Action must be DRAFT or POST.');
  parseLocalDate_(p.date);
  if (!p.journalType) throw new Error('Select a journal type.');
  if (!p.description) throw new Error('Enter a description.');
  if (!['MANUAL', 'ASSISTED'].includes(p.entryMode)) throw new Error('Entry mode is not valid.');
}

function validateAssistedPayment_(p, coaMap) {
  if (p.entryMode !== 'ASSISTED' || !p.paymentMethod) return;
  if (!['CASH_BANK', 'CREDIT', 'PARTIAL'].includes(p.paymentMethod)) {
    throw new Error('Payment method is not valid.');
  }
  if (p.paymentAmount < 0) throw new Error('Payment amount cannot be negative.');
  if (p.paymentMethod !== 'CREDIT') {
    const acc = coaMap.get(p.paymentAccountCode);
    if (!acc || !acc.active) throw new Error('Select a valid Cash/Bank account for the payment.');
  }
}

function validateLines_(lines, coaMap, isPost) {
  if (!lines.length) throw new Error('Add at least one journal line.');
  lines.forEach((l, i) => {
    const n = i + 1;
    const acc = coaMap.get(l.accountCode);
    if (!acc) throw new Error(`Line ${n}: account "${l.accountCode}" is not in the COA.`);
    if (!acc.active) throw new Error(`Line ${n}: account ${acc.code} - ${acc.name} is inactive.`);
    if (l.debit < 0 || l.credit < 0) throw new Error(`Line ${n}: amounts cannot be negative.`);
    if (l.debit > 0 && l.credit > 0) throw new Error(`Line ${n}: use either Debit or Credit, not both.`);
    if (l.debit === 0 && l.credit === 0) throw new Error(`Line ${n}: enter a Debit or a Credit amount.`);
  });
  const t = totals_(lines);
  if (isPost) {
    if (lines.length < 2) throw new Error('A posted journal needs at least two lines.');
    if (Math.abs(t.debit - t.credit) > TOLERANCE) {
      throw new Error(
        'The journal is not balanced.\n' +
        `Total debit: ${fmt_(t.debit)}\nTotal credit: ${fmt_(t.credit)}\n` +
        `Difference: ${fmt_(t.debit - t.credit)}`);
    }
  }
  return t;
}

function buildRows_(p, id, coaMap, meta) {
  const date = parseLocalDate_(p.date);
  const period = date.getFullYear() * 100 + date.getMonth() + 1;
  const assisted = p.entryMode === 'ASSISTED';
  const formState = JSON.stringify(p.assistedSettings || {});
  return p.lines.map((l, i) => {
    const acc = coaMap.get(l.accountCode);
    const o = {
      id: id, line: i + 1, date: date, period: period, type: p.journalType,
      status: meta.status, reference: p.reference, party: l.partyName || '', partyId: l.partyId || '', taxDocNo: p.taxDocNo,
      source: p.documentSource, description: p.description,
      accountCode: acc.code, accountName: acc.name, lineDescription: l.description,
      debit: l.debit || '', credit: l.credit || '',
      taxType: l.taxType, taxRate: l.taxRate, taxBase: l.taxBase, taxAmount: l.taxAmount,
      entryMode: p.entryMode,
      transactionType: assisted ? p.transactionType : '',
      paymentMethod: assisted ? p.paymentMethod : '',
      paymentAccount: assisted ? p.paymentAccountCode : '',
      paymentAmount: assisted ? p.paymentAmount : '',
      linkedId: p.linkedId,
      dueDate: p.dueDate ? parseLocalDate_(p.dueDate) : '',
      origin: p.origin || (assisted ? 'ASSISTED' : 'MANUAL'), batchId: p.batchId,
      createdAt: meta.createdAt, createdBy: meta.createdBy, updatedAt: meta.updatedAt,
      postedAt: meta.postedAt, postedBy: meta.postedBy, formState: formState
    };
    return JOURNAL_FIELDS.map(f => (o[f[0]] === undefined ? '' : o[f[0]]));
  });
}

/** Append the new block, check it, then remove the old rows. The old draft survives any failure. */
function replaceRows_(sheet, oldRowNumbers, newRows, journalId) {
  const width = JOURNAL_HEADERS.length;
  const start = Math.max(sheet.getLastRow() + 1, 2);
  const needed = start + newRows.length - 1;
  if (needed > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
  }
  sheet.getRange(start, 1, newRows.length, width).setValues(newRows);
  SpreadsheetApp.flush();

  const saved = sheet.getRange(start, 1, newRows.length, width).getValues();
  const ok = saved.every((r, i) =>
    String(r[COL.id]).trim() === journalId &&
    Math.abs(Number(r[COL.debit] || 0) - Number(newRows[i][COL.debit] || 0)) < TOLERANCE &&
    Math.abs(Number(r[COL.credit] || 0) - Number(newRows[i][COL.credit] || 0)) < TOLERANCE);
  if (!ok) {
    sheet.getRange(start, 1, newRows.length, width).clearContent();
    throw new Error('Saving could not be verified. Your previous version was kept.');
  }
  oldRowNumbers.slice().sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
  SpreadsheetApp.flush();
}

function nextJournalId_(dateValue, sheet) {
  const year = String(parseLocalDate_(dateValue).getFullYear());
  const props = PropertiesService.getDocumentProperties();
  const key = 'JOURNAL_SEQ_' + year;
  const live = getCompanyMode_() === 'LIVE';
  let seq = live ? Number(props.getProperty(key) || 0) : 0;
  if (sheet.getLastRow() >= 2) {
    const re = new RegExp('^JV-' + year + '-(\\d+)$');
    sheet.getRange(2, COL.id + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(r => {
      const m = re.exec(String(r[0]).trim());
      if (m) seq = Math.max(seq, Number(m[1]));
    });
  }
  if (!live) props.deleteProperty(key);
  seq++;
  if (live) props.setProperty(key, String(seq));
  return 'JV-' + year + '-' + String(seq).padStart(5, '0');
}


/* ============================================================
   6. DRAFTS
============================================================ */

function getDraftList() {
  const sheet = getRequiredSheet_(SHEETS.JOURNAL);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getValues();
  const settings = readSettings_();
  const codes = ['ar', 'ap'].map(k => String(settings[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim());
  const groups = new Map();
  data.forEach((r, i) => {
    if (String(r[COL.status]) !== STATUS.DRAFT) return;
    const id = String(r[COL.id]).trim();
    if (!id) return;
    if (!groups.has(id)) {
      groups.set(id, {
        journalId: id, date: dateToIso_(r[COL.date]), journalType: String(r[COL.type]),
        description: String(r[COL.description]), reference: String(r[COL.reference]),
        debit: 0, credit: 0, lineCount: 0, updatedMs: 0, missingParty: 0, missingRows: []
      });
    }
    const g = groups.get(id);
    g.debit += Number(r[COL.debit] || 0);
    g.credit += Number(r[COL.credit] || 0);
    g.lineCount++;
    if (r[COL.updatedAt] instanceof Date) g.updatedMs = Math.max(g.updatedMs, r[COL.updatedAt].getTime());
    if (codes.includes(String(r[COL.accountCode]).trim()) && !String(r[COL.partyId] || '').trim()) {
      g.missingParty++;
      const debit = Number(r[COL.debit]) || 0, credit = Number(r[COL.credit]) || 0;
      const amount = debit > 0 ? debit : credit;
      const label = debit > 0 ? 'No Supplier' : 'No Customer';
      const desc = String(r[COL.lineDescription] || r[COL.description] || '');
      g.missingRows.push('Row ' + (i + 2) + ' - ' + desc + ' Rp ' + Number(amount).toLocaleString('id-ID') + ' - ' + label);
    }
  });
  return Array.from(groups.values())
    .sort((a, b) => b.updatedMs - a.updatedMs)
    .map(g => ({
      journalId: g.journalId, date: g.date, journalType: g.journalType,
      description: g.description, reference: g.reference,
      debit: g.debit, credit: g.credit, lineCount: g.lineCount,
      missingParty: g.missingParty, missingRows: g.missingRows,
      updatedAt: g.updatedMs ? Utilities.formatDate(new Date(g.updatedMs),
        SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'dd MMM yyyy HH:mm') : ''
    }));
}

/** Returns plain strings and numbers only. Date objects cannot cross google.script.run. */
function getDraftById(journalId) {
  const id = String(journalId || '').trim();
  if (!id) throw new Error('Journal ID is empty.');
  const found = loadJournalRows_(getRequiredSheet_(SHEETS.JOURNAL), id);
  if (!found.rows.length) throw new Error(`Draft ${id} was not found.`);
  if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) {
    throw new Error(`Journal ${id} is already posted and cannot be edited.`);
  }
  const rows = found.rows.slice().sort((a, b) => Number(a[COL.line]) - Number(b[COL.line]));
  const f = rows[0];
  const num = v => (v === '' || v == null ? '' : Number(v));
  return {
    journalId: id,
    date: dateToIso_(f[COL.date]),
    journalType: String(f[COL.type]),
    description: String(f[COL.description]),
    reference: String(f[COL.reference]),
    party: String(f[COL.party]),
    taxDocNo: String(f[COL.taxDocNo]),
    dueDate: dateToIso_(f[COL.dueDate]),
    origin: String(f[COL.origin] || ''),
    documentSource: String(f[COL.source]),
    entryMode: String(f[COL.entryMode] || 'MANUAL'),
    transactionType: String(f[COL.transactionType]),
    paymentMethod: String(f[COL.paymentMethod]),
    paymentAccountCode: String(f[COL.paymentAccount]),
    paymentAmount: Number(f[COL.paymentAmount] || 0),
    linkedId: String(f[COL.linkedId]),
    assistedSettings: parseJsonSafe_(f[COL.formState]),
    lines: rows.map(r => ({
      accountCode: String(r[COL.accountCode]).trim(),
      accountName: String(r[COL.accountName]),
      description: String(r[COL.lineDescription]),
      party: String(r[COL.party] || ''),
      debit: Number(r[COL.debit] || 0),
      credit: Number(r[COL.credit] || 0),
      taxType: String(r[COL.taxType] || ''),
      taxRate: num(r[COL.taxRate]),
      taxBase: num(r[COL.taxBase]),
      taxAmount: num(r[COL.taxAmount])
    }))
  };
}

function deleteDraft(journalId) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const id = String(journalId || '').trim();
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const found = loadJournalRows_(sheet, id);
    if (!found.rows.length) throw new Error(`Draft ${id} was not found.`);
    if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) {
      throw new Error(`Journal ${id} is posted. Posted journals cannot be deleted.`);
    }
    found.rowNumbers.slice().sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
    SpreadsheetApp.flush();
    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    return { success: true, journalId: id, message: tr_(`Draft ${id} deleted.`, `Draf ${id} telah dihapus.`) };
  } finally {
    lock.releaseLock();
  }
}

/** Post button in Draft Management: validates, then flips Status to POSTED. */
function postDraftFromManagement(journalId) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const id = String(journalId || '').trim();
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const found = loadJournalRows_(sheet, id);
    if (!found.rows.length) throw new Error(`Draft ${id} was not found.`);
    if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) {
      throw new Error(`Journal ${id} is already posted.`);
    }
    const lines = found.rows.map(r => ({
      accountCode: String(r[COL.accountCode]).trim(),
      debit: Number(r[COL.debit] || 0),
      credit: Number(r[COL.credit] || 0),
      partyId: String(r[COL.partyId] || '')
    }));
    validateLines_(lines, getCoaMap_(), true);
    requirePartyOnArAp_(lines);
    assertNotLocked_(parseLocalDate_(found.rows[0][COL.date]));

    const now = new Date();
    const user = getCurrentUser_();
    found.rows.forEach((r, i) => {
      r[COL.status] = STATUS.POSTED;
      r[COL.postedAt] = now;
      r[COL.postedBy] = user;
      r[COL.updatedAt] = now;
      sheet.getRange(found.rowNumbers[i], 1, 1, JOURNAL_HEADERS.length).setValues([r]);
    });
    SpreadsheetApp.flush();
    try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {}
    return { success: true, journalId: id, message: tr_(`Journal ${id} posted.`, `Jurnal ${id} telah diposting.`) };
  } finally {
    lock.releaseLock();
  }
}

/** Posts a filtered list of drafts. Each journal is validated on its own; failures stay in Draft. */
function postDraftList(journalIds) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error(tr_('The system is busy. Please try again in a moment.', 'Sistem sedang sibuk. Silakan coba lagi sebentar.'));
  try {
    const ids = (Array.isArray(journalIds) ? journalIds : []).map(x => String(x || '').trim()).filter(Boolean);
    if (!ids.length) return { posted: [], failures: [], missingPartyLines: 0, message: tr_('No drafts to post', 'Tidak ada draf untuk diposting') };
    const sheet = getRequiredSheet_(SHEETS.JOURNAL);
    const coaMap = getCoaMap_(), settings = readSettings_();
    const now = new Date(), user = getCurrentUser_();
    const posted = [], failures = [], updates = [];
    let missingPartyLines = 0;
    ids.forEach(id => {
      try {
        const found = loadJournalRows_(sheet, id);
        if (!found.rows.length) throw new Error('Draft was not found.');
        if (found.rows.some(r => String(r[COL.status]) !== STATUS.DRAFT)) throw new Error('Journal is already posted.');
        const lines = found.rows.map(r => ({
          accountCode: String(r[COL.accountCode]).trim(), debit: Number(r[COL.debit] || 0),
          credit: Number(r[COL.credit] || 0), partyId: String(r[COL.partyId] || '')
        }));
        validateLines_(lines, coaMap, true);
        assertNotLocked_(parseLocalDate_(found.rows[0][COL.date]));
        missingPartyLines += countMissingParty_(lines, settings);
        found.rows.forEach((r, i) => {
          const before = r.slice();
          r[COL.status] = STATUS.POSTED;
          r[COL.postedAt] = now;
          r[COL.postedBy] = user;
          r[COL.updatedAt] = now;
          updates.push({ number: found.rowNumbers[i], before: before, after: r });
        });
        posted.push(id);
      } catch (e) {
        failures.push({ journalNo: id, reason: e.message });
      }
    });
    if (updates.length) writeDraftPosts_(sheet, updates);
    SpreadsheetApp.flush();
    if (posted.length) { try { if (typeof webInvalidateCache_ === 'function') webInvalidateCache_(); } catch (e) {} }
    if (missingPartyLines) console.warn('Post: ' + missingPartyLines + ' lines posted without Customer / Supplier');
    return { posted: posted, failures: failures, missingPartyLines: missingPartyLines,
      message: tr_(posted.length + ' posted, ' + failures.length + ' failed.', posted.length + ' diposting, ' + failures.length + ' gagal.') };
  } finally {
    lock.releaseLock();
  }
}

function writeDraftPosts_(sheet, updates) {
  const sorted = updates.slice().sort((a, b) => a.number - b.number);
  const groups = [];
  sorted.forEach(u => {
    const last = groups[groups.length - 1];
    if (last && last.rows[last.rows.length - 1].number + 1 === u.number) last.rows.push(u);
    else groups.push({ number: u.number, rows: [u] });
  });
  const written = [];
  try {
    groups.forEach(g => {
      sheet.getRange(g.number, 1, g.rows.length, JOURNAL_HEADERS.length).setValues(g.rows.map(x => x.after));
      written.push(g);
    });
  } catch (e) {
    written.forEach(g => sheet.getRange(g.number, 1, g.rows.length, JOURNAL_HEADERS.length).setValues(g.rows.map(x => x.before)));
    console.error('Post All write failed: ' + e.message);
    throw e;
  }
}


/* ============================================================
   7. HELPERS
============================================================ */

function getRequiredSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Sheet "${name}" was not found. Run ACCOUNTING > Setup > Install / Update System.`);
  }
  return sheet;
}

function loadJournalRows_(sheet, id) {
  const out = { rowNumbers: [], rows: [] };
  const last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, JOURNAL_HEADERS.length).getValues().forEach((r, i) => {
    if (String(r[COL.id]).trim() === id) {
      out.rowNumbers.push(i + 2);
      out.rows.push(r);
    }
  });
  return out;
}

function getCurrentUser_() {
  try {
    const active = Session.getActiveUser().getEmail();
    if (active) return active;
    const effective = Session.getEffectiveUser().getEmail();
    if (effective) return effective;
  } catch (e) { /* fall through */ }
  return 'Unknown user';
}

function toNumber_(v, label) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label} is not a valid number.`);
  return n;
}

function blankOrNumber_(v, label) {
  return v === '' || v == null ? '' : toNumber_(v, label);
}

function round2_(n) { return Math.round(n * 100) / 100; }

function totals_(lines) {
  return lines.reduce((t, l) => {
    t.debit += l.debit;
    t.credit += l.credit;
    return t;
  }, { debit: 0, credit: 0 });
}

function fmt_(n) { return Number(n || 0).toLocaleString('id-ID'); }

function parseJsonSafe_(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}

function parseLocalDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
  }
  const parts = String(value || '').trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some(x => !Number.isFinite(x))) {
    throw new Error('The transaction date is not valid.');
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) {
    throw new Error('The transaction date is not valid.');
  }
  return d;
}

function dateToIso_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}


/* ============================================================
   8. PARTIES
============================================================ */

/** Links every line to a customer/supplier from the Parties sheet. A line party overrides the header party. */
function resolveParties_(p) {
  const byName = new Map(readParties_().filter(x => x.active).map(x => [x.name.toLowerCase(), x]));
  const settings = readSettings_();
  const coaMap = getCoaMap_();
  const find = name => {
    if (!name) return null;
    const x = byName.get(name.toLowerCase());
    if (!x) throw new Error(`"${name}" is not in the Parties sheet. Add the customer or supplier first.`);
    return x;
  };
  const header = find(p.party);
  p.lines.forEach(l => {
    const eligible = isPartyAccount_(coaMap.get(l.accountCode), '', settings);
    const x = eligible ? (l.party ? find(l.party) : header) : null;
    l.partyName = x ? x.name : '';
    l.partyId = x ? x.id : '';
  });
}

function countMissingParty_(lines, settings) {
  const s = settings || readSettings_();
  const codes = ['ar', 'ap'].map(k => String(s[mappingKey_(ACCOUNT_MAPPINGS.find(m => m[0] === k))] || '').trim());
  return lines.reduce((n, l) => n + (codes.includes(String(l.accountCode)) && !l.partyId ? 1 : 0), 0);
}

function requirePartyOnArAp_(lines, settings) {
  const missing = countMissingParty_(lines, settings);
  if (missing) console.warn('Post: ' + missing + ' lines posted without Customer / Supplier');
  return missing;
}

