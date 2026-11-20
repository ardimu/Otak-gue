/**
 * ============================================================
 * ASSISTED ENTRY CATALOG
 * Two kinds of template. Both are plain data, so adding one is a few lines.
 *
 *  TXN  Purchase / sales / expense / payroll style. Uses the tax-aware engine
 *       (VAT, PPh, payment, amount basis). Fields: engine (SALES | PURCHASE | EXPENSE | PAYROLL),
 *       flip (true for returns), baseDefault ('auto' or an account code), categories, cogs, payDefault.
 *
 *  DSL  Any other journal. slots = account pickers, inputs = amount fields,
 *       lines = [side 'D'|'C', slotId, amount, description].
 *       amount = an input id | 'DminusC' | 'CminusD' | ['min', inputA, inputB]
 *       'DminusC' / 'CminusD' = what is needed to balance the lines before it.
 *
 * Account codes are only suggestions. If a code is not in your COA the picker stays empty.
 * ============================================================
 */

function pair_(id, group, label, jt, dr, cr, amountLabel, party, hint) {
  return {
    id: id, group: group, label: label, kind: 'DSL', journalType: jt, party: party || '', hint: hint || '',
    inputs: [{ id: 'amt', label: amountLabel }],
    slots: [
      { id: 'dr', label: dr[0], default: dr[1] || '', pick: dr[2] || 'any' },
      { id: 'cr', label: cr[0], default: cr[1] || '', pick: cr[2] || 'any' }
    ],
    lines: [['D', 'dr', 'amt', label], ['C', 'cr', 'amt', label]]
  };
}

const G_SALES = 'Sales and receivables', G_BUY = 'Purchases and payables', G_EXP = 'Expenses and petty cash',
  G_PAY = 'Payroll', G_TAX = 'Tax payments', G_CAP = 'Capital and equity', G_LOAN = 'Loans',
  G_FA = 'Fixed assets', G_CASH = 'Cash and bank', G_INV = 'Inventory and production',
  G_ADJ = 'Period-end adjustments';
const BANK = ['Bank or cash account', '1102', 'cash'];

const JOURNAL_TEMPLATES = [
  // ---- Sales and receivables
  { id: 'SALES', group: G_SALES, label: 'Sales invoice or cash sale', kind: 'TXN', engine: 'SALES',
    journalType: 'Sales Journal', baseLabel: 'Revenue account', amountLabel: 'Sales amount',
    payLabel: 'Cash or bank account that received the money', payAmountLabel: 'Amount received now',
    party: 'Customer', categories: true, cogs: true,
    hint: 'Choose "on credit" to book a receivable. Tick the cost option to also release inventory.' },
  { id: 'SALES_RETURN', group: G_SALES, label: 'Sales return', kind: 'TXN', engine: 'SALES', flip: true,
    baseDefault: '4202', journalType: 'Sales Journal', baseLabel: 'Sales returns account',
    amountLabel: 'Returned sales amount', payLabel: 'Cash or bank account that refunded',
    payAmountLabel: 'Amount refunded now', party: 'Customer',
    hint: 'Reverses a sale. The credit goes to receivables or to cash if you refunded.' },
  pair_('CUST_ADVANCE', G_SALES, 'Advance received from customer', 'Cash Receipt Journal',
    BANK, ['Customer advances account', '2111'], 'Advance received', 'Customer'),
  { id: 'CUST_RECEIPT', group: G_SALES, label: 'Collection of a customer invoice', kind: 'DSL',
    journalType: 'Cash Receipt Journal', party: 'Customer',
    hint: 'Pick the customer so the receivable is matched to them.',
    inputs: [{ id: 'rec', label: 'Amount received' },
      { id: 'wht', label: 'Income tax withheld by the customer', optional: true }],
    slots: [{ id: 'bank', label: 'Cash or bank account that received the money', default: '1102', pick: 'cash' },
      { id: 'tax', label: 'Prepaid income tax account (if tax was withheld)', default: '1503' },
      { id: 'ar', label: 'Trade receivables account', default: '1201' }],
    lines: [['D', 'bank', 'rec', 'Payment received from customer'],
      ['D', 'tax', 'wht', 'Income tax withheld by customer'],
      ['C', 'ar', 'DminusC', 'Settlement of customer invoice']] },

  // ---- Purchases and payables
  { id: 'PURCHASE', group: G_BUY, label: 'Purchase of goods or services', kind: 'TXN', engine: 'PURCHASE',
    journalType: 'Purchase Journal', baseLabel: 'Inventory, asset, or expense account',
    amountLabel: 'Purchase amount', payLabel: 'Cash or bank account used to pay',
    payAmountLabel: 'Amount paid now', party: 'Supplier', categories: true },
  { id: 'PURCHASE_RETURN', group: G_BUY, label: 'Purchase return', kind: 'TXN', engine: 'PURCHASE', flip: true,
    baseDefault: 'auto', journalType: 'Purchase Journal', baseLabel: 'Inventory or expense account returned',
    amountLabel: 'Returned purchase amount', payLabel: 'Cash or bank account that received the refund',
    payAmountLabel: 'Refund received now', party: 'Supplier', categories: true,
    hint: 'Reverses a purchase. The debit goes to payables or to cash if the supplier refunded.' },
  { id: 'FA_BUY', group: G_BUY, label: 'Purchase of a fixed asset', kind: 'TXN', engine: 'PURCHASE',
    journalType: 'Asset Acquisition', baseLabel: 'Fixed asset account', amountLabel: 'Asset price',
    payLabel: 'Cash or bank account used to pay', payAmountLabel: 'Amount paid now', party: 'Supplier' },
  { id: 'PREPAID', group: G_BUY, label: 'Prepaid expense (rent, insurance, subscriptions)', kind: 'TXN',
    engine: 'PURCHASE', baseDefault: '1402', journalType: 'Purchase Journal', baseLabel: 'Prepaid account',
    amountLabel: 'Prepaid amount', payLabel: 'Cash or bank account used to pay',
    payAmountLabel: 'Amount paid now', party: 'Supplier' },
  pair_('SUPP_ADVANCE', G_BUY, 'Advance paid to supplier', 'Cash Disbursement Journal',
    ['Purchase advances account', '1401'], BANK, 'Advance paid', 'Supplier'),
  pair_('SUPP_PAYMENT', G_BUY, 'Payment of a supplier invoice', 'Cash Disbursement Journal',
    ['Trade payables account', '2101'], BANK, 'Amount paid', 'Supplier',
    'Pick the supplier so the payable is matched to them.'),

  // ---- Expenses and petty cash
  { id: 'EXPENSE', group: G_EXP, label: 'Expense', kind: 'TXN', engine: 'EXPENSE',
    journalType: 'Cash Disbursement Journal', baseLabel: 'Expense account', amountLabel: 'Expense amount',
    payLabel: 'Cash or bank account used to pay', payAmountLabel: 'Amount paid now', party: 'Supplier' },
  { id: 'PETTY_EXPENSE', group: G_EXP, label: 'Expense paid from petty cash', kind: 'TXN', engine: 'EXPENSE',
    payDefault: '1103', journalType: 'Cash Disbursement Journal', baseLabel: 'Expense account',
    amountLabel: 'Expense amount', payLabel: 'Petty cash account', payAmountLabel: 'Amount paid now' },
  pair_('PETTY_REPLENISH', G_EXP, 'Petty cash replenishment', 'Fund Transfer',
    ['Petty cash account', '1103', 'cash'], BANK, 'Amount replenished'),

  // ---- Payroll
  { id: 'PAYROLL', group: G_PAY, label: 'Payroll (gross pay, PPh 21, net pay)', kind: 'TXN', engine: 'PAYROLL',
    baseDefault: '6101', journalType: 'Payroll Journal', baseLabel: 'Payroll expense account',
    amountLabel: 'Gross payroll', payLabel: 'Cash or bank account used to pay', payAmountLabel: 'Net pay now',
    hint: 'Tick Withholding Tax and choose PPh 21. Unpaid pay is booked to Salaries Payable.' },
  pair_('PAYROLL_PAY', G_PAY, 'Payment of accrued salaries', 'Cash Disbursement Journal',
    ['Salaries payable account', '2102'], BANK, 'Amount paid'),
  { id: 'BPJS_ACCRUE', group: G_PAY, label: 'BPJS employer contribution', kind: 'DSL', journalType: 'Payroll Journal',
    inputs: [{ id: 'hea', label: 'BPJS Kesehatan (employer share)', optional: true },
      { id: 'emp', label: 'BPJS Ketenagakerjaan (employer share)', optional: true }],
    slots: [{ id: 'eh', label: 'BPJS Kesehatan expense account', default: '6105' },
      { id: 'ee', label: 'BPJS Ketenagakerjaan expense account', default: '6106' },
      { id: 'pay', label: 'BPJS payable account', default: '2103' }],
    lines: [['D', 'eh', 'hea', 'BPJS Kesehatan employer share'], ['D', 'ee', 'emp', 'BPJS Ketenagakerjaan employer share'],
      ['C', 'pay', 'DminusC', 'BPJS payable']] },
  pair_('BPJS_PAY', G_PAY, 'Payment of BPJS', 'Cash Disbursement Journal',
    ['BPJS payable account', '2103'], BANK, 'Amount paid'),

  // ---- Tax payments
  { id: 'TAX_PAY', group: G_TAX, label: 'Payment of tax to the state treasury', kind: 'DSL',
    journalType: 'Cash Disbursement Journal',
    hint: 'Choose the tax payable account you are settling (PPh 21, 22, 23, 4(2), 25/29, or other).',
    inputs: [{ id: 'tax', label: 'Tax paid' }, { id: 'pen', label: 'Penalty or interest', optional: true }],
    slots: [{ id: 'acc', label: 'Tax payable account being settled', default: '2204' },
      { id: 'pa', label: 'Penalty or interest expense account', default: '6932' }, 
      { id: 'bank', label: 'Bank account used to pay', default: '1102', pick: 'cash' }],
    lines: [['D', 'acc', 'tax', 'Tax paid to the state treasury'], ['D', 'pa', 'pen', 'Tax penalty or interest'],
      ['C', 'bank', 'DminusC', 'Tax payment']] },
  { id: 'VAT_SETTLE', group: G_TAX, label: 'Monthly VAT settlement (output less input)', kind: 'DSL',
    journalType: 'General Journal',
    hint: 'Offsets Output VAT against Input VAT. Any excess output VAT is paid from the bank.',
    inputs: [{ id: 'out', label: 'Output VAT for the month' }, { id: 'inp', label: 'Input VAT for the month' }],
    slots: [{ id: 'o', label: 'Output VAT account', default: '2201' }, { id: 'i', label: 'Input VAT account', default: '1501' },
      { id: 'bank', label: 'Bank account used to pay', default: '1102', pick: 'cash' }],
    lines: [['D', 'o', 'out', 'Offset of output VAT'], ['C', 'i', ['min', 'out', 'inp'], 'Offset of input VAT'],
      ['C', 'bank', 'DminusC', 'VAT paid to the state treasury']] },

  // ---- Capital and equity
  pair_('CAP_IN', G_CAP, 'Capital deposit from owner or shareholder', 'Capital & Equity',
    ['Bank or cash account that received the money', '1102', 'cash'], ['Capital account', '3101'],
    'Capital received', 'Owner or shareholder', 'Debit the bank, credit capital.'),
  pair_('CAP_OUT', G_CAP, 'Owner withdrawal (prive)', 'Capital & Equity',
    ['Owner withdrawals account', '3201'], BANK, 'Amount withdrawn', 'Owner'),
  pair_('CAP_REFUND', G_CAP, 'Capital returned to owner', 'Capital & Equity',
    ['Capital account', '3101'], BANK, 'Amount returned', 'Owner or shareholder'),
  pair_('DIV_DECLARE', G_CAP, 'Dividend declared', 'Capital & Equity',
    ['Dividends declared account', '3202'], ['Dividends payable account', '2304'], 'Dividend declared', 'Shareholder'),
  pair_('DIV_PAY', G_CAP, 'Dividend paid', 'Capital & Equity',
    ['Dividends payable account', '2304'], BANK, 'Dividend paid', 'Shareholder'),

  // ---- Loans
  pair_('LOAN_IN', G_LOAN, 'Loan received', 'Loan & Financing',
    ['Bank account that received the loan', '1102', 'cash'], ['Loan account', '2401'], 'Loan received', 'Lender'),
  { id: 'LOAN_REPAY', group: G_LOAN, label: 'Loan installment (principal and interest)', kind: 'DSL',
    journalType: 'Loan & Financing', party: 'Lender',
    inputs: [{ id: 'prin', label: 'Principal repaid' }, { id: 'int', label: 'Interest paid', optional: true }],
    slots: [{ id: 'loan', label: 'Loan account', default: '2401' },
      { id: 'ia', label: 'Interest expense account', default: '8101' },
      { id: 'bank', label: 'Bank account used to pay', default: '1102', pick: 'cash' }],
    lines: [['D', 'loan', 'prin', 'Loan principal repaid'], ['D', 'ia', 'int', 'Loan interest'],
      ['C', 'bank', 'DminusC', 'Loan installment paid']] },
  pair_('INT_ACCRUE', G_LOAN, 'Interest accrued, not yet paid', 'Adjusting Entry',
    ['Interest expense account', '8101'], ['Accrued expenses account', '2110'], 'Interest accrued'),

  // ---- Fixed assets
  pair_('FA_DEPR', G_FA, 'Depreciation for the period', 'Adjusting Entry',
    ['Depreciation expense account', '6924'], ['Accumulated depreciation account', '1654'], 'Depreciation amount',
    '', 'Pick the pair for the asset class. Example: Office Equipment uses 6924 and 1654.'),
  { id: 'FA_SELL', group: G_FA, label: 'Sale or disposal of a fixed asset', kind: 'DSL', journalType: 'Asset Disposal',
    hint: 'Enter the proceeds, the original cost, and the accumulated depreciation. The gain or loss is worked out for you.',
    inputs: [{ id: 'proc', label: 'Proceeds received', optional: true }, { id: 'cost', label: 'Original cost of the asset' },
      { id: 'acc', label: 'Accumulated depreciation to date', optional: true }],
    slots: [{ id: 'bank', label: 'Cash or bank account that received the proceeds', default: '1102', pick: 'cash' },
      { id: 'ad', label: 'Accumulated depreciation account', default: '1654' },
      { id: 'as', label: 'Fixed asset account', default: '' },
      { id: 'g', label: 'Gain on disposal account', default: '7103' },
      { id: 'l', label: 'Loss on disposal account', default: '8103' }],
    lines: [['D', 'bank', 'proc', 'Proceeds from asset sale'], ['D', 'ad', 'acc', 'Accumulated depreciation removed'],
      ['C', 'as', 'cost', 'Asset removed at cost'], ['C', 'g', 'DminusC', 'Gain on asset disposal'],
      ['D', 'l', 'CminusD', 'Loss on asset disposal']] },

  // ---- Cash and bank
  { id: 'TRANSFER', group: G_CASH, label: 'Transfer between cash and bank accounts', kind: 'DSL', journalType: 'Fund Transfer',
    hint: 'Also use this for cash deposits and cash withdrawals.',
    inputs: [{ id: 'amt', label: 'Amount transferred' }, { id: 'fee', label: 'Transfer fee', optional: true }],
    slots: [{ id: 'from', label: 'From (cash or bank account)', default: '1102', pick: 'cash' },
      { id: 'to', label: 'To (cash or bank account)', default: '1101', pick: 'cash' },
      { id: 'fa', label: 'Bank charges account', default: '6933' }],
    lines: [['D', 'to', 'amt', 'Funds received'], ['D', 'fa', 'fee', 'Transfer fee'], ['C', 'from', 'DminusC', 'Funds sent']] },
  pair_('BANK_FEE', G_CASH, 'Bank charges', 'Cash Disbursement Journal',
    ['Bank charges account', '6933'], BANK, 'Charges'),
  { id: 'BANK_INTEREST', group: G_CASH, label: 'Bank interest received', kind: 'DSL', journalType: 'Cash Receipt Journal',
    inputs: [{ id: 'net', label: 'Interest received in the bank' }, { id: 'tax', label: 'Final tax withheld by the bank', optional: true }],
    slots: [{ id: 'bank', label: 'Bank account', default: '1102', pick: 'cash' },
      { id: 'ta', label: 'Final income tax expense account', default: '9102' },
      { id: 'inc', label: 'Interest income account', default: '7101' }],
    lines: [['D', 'bank', 'net', 'Interest received'], ['D', 'ta', 'tax', 'Final tax withheld by the bank'],
      ['C', 'inc', 'DminusC', 'Interest income']] },

  // ---- Inventory and production
  pair_('INV_LOSS', G_INV, 'Inventory write-off or shrinkage', 'Inventory Adjustment',
    ['Inventory adjustment expense account', '5301'], ['Inventory account', '1301'], 'Value written off'),
  pair_('INV_GAIN', G_INV, 'Inventory count gain', 'Inventory Adjustment',
    ['Inventory account', '1301'], ['Inventory adjustment account', '5301'], 'Value of the gain'),
  Object.assign(pair_('PROD_RM', G_INV, 'Raw materials issued to production', 'Production Transfer',
    ['Work in progress account', '1303'], ['Raw materials account', '1302'], 'Cost of materials issued'),
    { only: ['Manufacturing'] }),
  { id: 'PROD_COST', group: G_INV, label: 'Labor and overhead applied to production', kind: 'DSL',
    journalType: 'Production Transfer', only: ['Manufacturing'],
    inputs: [{ id: 'lab', label: 'Direct labor applied', optional: true }, { id: 'oh', label: 'Overhead applied', optional: true }],
    slots: [{ id: 'la', label: 'Direct labor account', default: '5201' }, { id: 'oa', label: 'Manufacturing overhead account', default: '5202' },
      { id: 'w', label: 'Work in progress account', default: '1303' }],
    lines: [['C', 'la', 'lab', 'Direct labor applied'], ['C', 'oa', 'oh', 'Overhead applied'],
      ['D', 'w', 'CminusD', 'Labor and overhead to work in progress']] },
  Object.assign(pair_('PROD_FG', G_INV, 'Finished goods transferred from production', 'Production Transfer',
    ['Finished goods account', '1304'], ['Work in progress account', '1303'], 'Cost of goods completed'),
    { only: ['Manufacturing'] }),

  // ---- Period-end adjustments
  pair_('ADJ_ACCRUED_EXP', G_ADJ, 'Accrued expense (incurred, not yet billed or paid)', 'Adjusting Entry',
    ['Expense account'], ['Accrued expenses account', '2110'], 'Expense accrued'),
  pair_('ADJ_PREPAID', G_ADJ, 'Prepaid expense used up', 'Adjusting Entry',
    ['Expense account'], ['Prepaid account', '1402'], 'Amount used up'),
  pair_('ADJ_UNEARNED', G_ADJ, 'Unearned revenue earned', 'Adjusting Entry',
    ['Customer advances and unearned revenue account', '2111'], ['Revenue account'], 'Revenue earned', 'Customer'),
  pair_('ADJ_ACCRUED_REV', G_ADJ, 'Accrued revenue (earned, not yet billed)', 'Adjusting Entry',
    ['Other receivables account', '1204'], ['Revenue account'], 'Revenue accrued', 'Customer'),
  pair_('ADJ_BAD_DEBT', G_ADJ, 'Allowance for doubtful accounts', 'Adjusting Entry',
    ['Bad debt expense account', '6934'], ['Allowance for doubtful accounts', '1202'], 'Allowance for the period')
];
