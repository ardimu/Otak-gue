const COMPANY_LOG_SHEET = 'Settings Log';
const COMPANY_LOG_HEADERS = ['Time', 'User', 'Setting', 'Old Value', 'New Value'];
const COMPANY_PROFILE_KEYS = ['Company Name', 'Legal Name', 'NPWP', 'NIB', 'Address', 'Phone', 'Email'];

function showCompanySettings() {
  ensureCompanySetup_();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile('CompanySettings').setWidth(980).setHeight(760),
    'Company Profile & Settings'
  );
}

function ensureCompanySetup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName(SHEETS.SETTINGS);
  if (!settings) throw new Error('Settings sheet was not found. Run Install / Update System first.');
  addMissingSettings_(settings);
  formatSettings_(settings);
  ensureSettingsLogSheet_();
  protectSettingsSheet_();
}

function ensureSettingsLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(COMPANY_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(COMPANY_LOG_SHEET);
    writeTable_(sheet, COMPANY_LOG_HEADERS, []);
    styleHeader_(sheet, COMPANY_LOG_HEADERS.length);
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, 260);
    sheet.setColumnWidth(5, 260);
  }
  return sheet;
}

function protectSettingsSheet_() {
  const sheet = getRequiredSheet_(SHEETS.SETTINGS);
  let protection = sheet.getProtection ? sheet.getProtection() : null;
  if (!protection) protection = sheet.protect();
  protection.setDescription('Company Settings');
  let owner = null;
  try { owner = SpreadsheetApp.getActiveSpreadsheet().getOwner(); } catch (e) {}
  const editors = protection.getEditors().filter(e => !owner || e.getEmail() !== owner.getEmail());
  if (editors.length) protection.removeEditors(editors);
}

function writeSettingsLog_(setting, oldValue, newValue) {
  const sheet = ensureSettingsLogSheet_();
  const shown = v => setting === 'Company Logo' && v ? '[image]' : String(v == null ? '' : v);
  const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([time, getCurrentUser_(), setting, shown(oldValue), shown(newValue)]);
}

function setSettingValue_(key, value) {
  const sheet = getRequiredSheet_(SHEETS.SETTINGS);
  const last = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(2, 1, last, 2).getDisplayValues();
  let row = -1, oldValue = '';
  values.forEach((r, i) => {
    if (String(r[0]).trim() === key) { row = i + 2; oldValue = String(r[1]); }
  });
  const next = String(value == null ? '' : value).trim();
  if (row < 0) {
    sheet.getRange(last + 1, 1, 1, 2).setValues([[key, next]]);
  } else {
    sheet.getRange(row, 2).setValue(next);
  }
  if (oldValue !== next) writeSettingsLog_(key, oldValue, next);
}

function getCompanyMode_() {
  const value = String(readSettings_()['Mode'] || '').trim().toUpperCase();
  return value === 'LIVE' ? 'LIVE' : 'PRACTICE';
}

function hasPostedJournal_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.JOURNAL);
  if (!sheet || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, COL.status + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .some(r => String(r[0]).trim().toUpperCase() === STATUS.POSTED);
}

function hasPostedOpeningBalance_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.JOURNAL);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, JOURNAL_HEADERS.length).getDisplayValues();
  return rows.some(r => String(r[COL.status]).trim().toUpperCase() === STATUS.POSTED &&
    String(r[COL.type]).trim() === 'Opening Entry');
}

function getGoLiveChecklist_() {
  let coaValid = false;
  try { coaValid = analyzeCoa_(readCoa_()).length === 0; } catch (e) { coaValid = false; }
  const settings = readSettings_();
  const map = getCoaMap_();
  const accountsComplete = ACCOUNT_MAPPINGS.every(m => {
    const code = String(settings[mappingKey_(m)] || '').trim();
    const account = map.get(code);
    return !!account && account.active;
  });
  return [
    { id: 'coa', label: 'COA is valid', ok: coaValid },
    { id: 'accounts', label: 'Default accounts are complete', ok: accountsComplete },
    { id: 'parties', label: 'Parties are filled in', ok: getActiveParties_().length > 0 },
    { id: 'opening', label: 'Opening balance has been created', ok: hasPostedOpeningBalance_() }
  ];
}

function getCompanySettings() {
  ensureCompanySetup_();
  const settings = readSettings_();
  const mode = getCompanyMode_();
  const options = readCoa_().filter(a => a.active).map(a => ({ code: a.code, name: a.name }));
  const mappings = ACCOUNT_MAPPINGS.map(m => ({
    key: mappingKey_(m),
    label: m[1],
    code: String(settings[mappingKey_(m)] || '').trim(),
    options: options
  }));
  return {
    mode: mode,
    profile: {
      'Company Name': settings['Company Name'] || '',
      'Legal Name': settings['Legal Name'] || '',
      'NPWP': settings['NPWP'] || '',
      'NIB': settings['NIB'] || '',
      'Address': settings['Address'] || '',
      'Phone': settings['Phone'] || '',
      'Email': settings['Email'] || '',
      'Company Logo': settings['Company Logo'] || ''
    },
    accounting: {
      businessType: BUSINESS_TYPES.includes(settings['Business Type']) ? settings['Business Type'] : 'Trading',
      businessTypes: BUSINESS_TYPES.slice(),
      fiscalStartMonth: Number(settings['Fiscal Year Start Month']) || 1,
      currency: 'IDR',
      inventoryMethod: 'Perpetual'
    },
    accounts: mappings,
    system: {
      mode: mode,
      lockDate: settings['Lock Date'] || '',
      suspense: settings['Bank Suspense Account'] || '',
      suspenseOptions: options,
      resetAvailable: mode === 'PRACTICE',
      goLiveDate: settings['Go Live Date'] || '',
      wentLiveBy: settings['Went Live By'] || ''
    },
    flags: {
      fiscalLocked: hasPostedJournal_(),
      currencyLocked: mode === 'LIVE',
      inventoryLocked: true
    },
    checklist: getGoLiveChecklist_()
  };
}

function saveCompanyProfile(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Profile data is empty or invalid.');
  if (!String(payload['Company Name'] || '').trim()) throw new Error('Company Name is required.');
  COMPANY_PROFILE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) setSettingValue_(key, payload[key]);
  });
  return { success: true, message: 'Profile saved.' };
}

function saveCompanyLogo(dataUrl) {
  const value = String(dataUrl || '').trim();
  const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.');
  if (value.length > 45000) throw new Error('Logo is too large. Choose a smaller image.');
  setSettingValue_('Company Logo', value);
  return { success: true, message: 'Company logo saved.' };
}

function removeCompanyLogo() {
  setSettingValue_('Company Logo', '');
  return { success: true, message: 'Company logo removed.' };
}

function saveCompanyAccounting(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Accounting data is empty or invalid.');
  const current = readSettings_();
  if (Object.prototype.hasOwnProperty.call(payload, 'businessType')) {
    const value = String(payload.businessType || '').trim();
    if (!BUSINESS_TYPES.includes(value)) throw new Error('Business Type must be Service, Trading, or Manufacturing.');
    setSettingValue_('Business Type', value);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'fiscalStartMonth')) {
    const value = Number(payload.fiscalStartMonth);
    if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error('Fiscal Year Start Month must be from 1 to 12.');
    if (hasPostedJournal_() && value !== Number(current['Fiscal Year Start Month'])) {
      throw new Error('Fiscal Year Start Month is locked after a posted journal exists.');
    }
    setSettingValue_('Fiscal Year Start Month', value);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'currency')) {
    const value = String(payload.currency || '').trim().toUpperCase();
    if (getCompanyMode_() === 'LIVE') throw new Error('Currency is locked after Go Live.');
    if (value !== 'IDR') throw new Error('Only IDR is supported.');
    setSettingValue_('Currency', 'IDR');
  }
  return { success: true, message: 'Accounting settings saved.' };
}

function saveCompanyAccounts(payload) {
  const mappings = payload && payload.mappings ? payload.mappings : {};
  const coa = getCoaMap_();
  ACCOUNT_MAPPINGS.forEach(m => {
    const key = mappingKey_(m);
    if (!Object.prototype.hasOwnProperty.call(mappings, key)) return;
    const code = String(mappings[key] || '').trim();
    if (!code) throw new Error('Choose an account for ' + m[1] + '.');
    const account = coa.get(code);
    if (!account) throw new Error('Account ' + code + ' does not exist in the COA.');
    if (!account.active) throw new Error('Account ' + code + ' is inactive.');
    setSettingValue_(key, code);
  });
  return { success: true, message: 'Default accounts saved.' };
}

function saveCompanySystem(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('System data is empty or invalid.');
  const mode = getCompanyMode_();
  if (Object.prototype.hasOwnProperty.call(payload, 'mode')) {
    const value = String(payload.mode || '').trim().toUpperCase();
    if (value !== mode) {
      if (mode === 'LIVE') throw new Error('LIVE mode is one way and cannot be changed.');
      if (value !== 'PRACTICE') throw new Error('Use Go Live to switch to LIVE mode.');
      setSettingValue_('Mode', 'PRACTICE');
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lockDate')) {
    const value = String(payload.lockDate || '').trim();
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Lock Date must be in YYYY-MM-DD format or blank.');
      const date = new Date(value + 'T00:00:00');
      if (isNaN(date.getTime()) || isoDate_(date) !== value) throw new Error('Lock Date is not a valid date.');
    }
    setSettingValue_('Lock Date', value);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'bankSuspenseAccount')) {
    const value = String(payload.bankSuspenseAccount || '').trim();
    if (value) {
      const account = getCoaMap_().get(value);
      if (!account) throw new Error('Bank Suspense Account does not exist in the COA.');
      if (!account.active) throw new Error('Bank Suspense Account is inactive.');
    }
    setSettingValue_('Bank Suspense Account', value);
  }
  return { success: true, message: 'System settings saved.' };
}

function clearPracticeData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEETS.JOURNAL, IMP.LOG].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  });
  const staging = ss.getSheetByName(IMP.STAGING);
  if (staging) {
    staging.getRange(1, 1, Math.max(staging.getLastRow(), 1), Math.max(staging.getLastColumn(), 1)).clearContent();
  }
  const props = PropertiesService.getDocumentProperties();
  props.getKeys().filter(key => /^JOURNAL_SEQ_/.test(key)).forEach(key => props.deleteProperty(key));
}

function resetPracticeData() {
  if (getCompanyMode_() === 'LIVE') throw new Error('Practice data cannot be reset after Go Live.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error('The system is busy. Please try again in a moment.');
  try {
    clearPracticeData_();
    writeSettingsLog_('Practice Data', 'Present', 'Deleted');
    return { success: true, message: 'Practice data has been reset.' };
  } finally {
    lock.releaseLock();
  }
}

function goLive(companyName) {
  if (getCompanyMode_() === 'LIVE') throw new Error('This system is already LIVE.');
  const settings = readSettings_();
  if (String(companyName == null ? '' : companyName).trim() !== String(settings['Company Name'] || '').trim()) {
    throw new Error('Company name does not match. Type the exact company name to continue.');
  }
  const failed = getGoLiveChecklist_().filter(item => !item.ok);
  if (failed.length) {
    throw new Error('Complete these checks first: ' + failed.map(item => item.label).join(', ') + '.');
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_MS)) throw new Error('The system is busy. Please try again in a moment.');
  try {
    clearPracticeData_();
    setSettingValue_('Mode', 'LIVE');
    setSettingValue_('Go Live Date', isoDate_(new Date()));
    setSettingValue_('Went Live By', getCurrentUser_());
    return { success: true, message: 'System is now LIVE.' };
  } finally {
    lock.releaseLock();
  }
}
