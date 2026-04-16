// src/lib/permissions.js
// Single source of truth for Process-Based Access Control (PBAC).
// Each RULE maps a permission key → array of roles that are granted it.
// getPermissions(role) returns a flat { key: boolean } object for use in App.jsx and components.

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  ACCOUNTANT: 'accountant',
  ADMIN_STAFF: 'admin_staff',
  FACTORY_LEAD: 'factory_lead',
  STOCK_MANAGER: 'stock_manager',
  SITE_TEAM: 'site_team',
};

const { SUPER_ADMIN: SA, OWNER: OW, ACCOUNTANT: AC, ADMIN_STAFF: AS, FACTORY_LEAD: FL, STOCK_MANAGER: SM, SITE_TEAM: ST } = ROLES;

// Convenience sets
const ADMIN_OWNER = [SA, OW];
const STOCK_LEVEL = [SA, OW, AC, AS, FL, SM];       // can see stock / ledger
const ALL_ROLES = [SA, OW, AC, AS, FL, SM, ST];

// ---------------------------------------------------------------------------
// RULES — permission key → roles that have it
// ---------------------------------------------------------------------------
export const RULES = {

  // ── Dashboard module tiles ──────────────────────────────────────────────
  'module.admin': [SA, OW],
  'module.led': [SA, OW, AC, AS, FL],
  'module.signage': [SA, OW, AC, AS, FL],
  'module.tasks': ALL_ROLES,
  'module.crm': [SA, OW, AC],
  'module.reports': ALL_ROLES,             // BOQ Tracker
  'module.misc_stock': STOCK_LEVEL,
  'module.structural': [SA, OW, AC, AS, FL, SM],
  'module.cut_list': [SA, OW, AS, FL, SM, ST],
  'module.payroll': [SA, OW, AC, AS],

  // ── Global Settings ─────────────────────────────────────────────────────
  'globalSettings.view': ADMIN_OWNER,
  'globalSettings.editExchangeRate': ADMIN_OWNER,

  // ── User Manager ────────────────────────────────────────────────────────
  'userManager.view': ADMIN_OWNER,
  'userManager.create': ADMIN_OWNER,
  'userManager.edit': ADMIN_OWNER,
  'userManager.delete': ADMIN_OWNER,

  // ── Backup Manager ──────────────────────────────────────────────────────
  'backupManager.view': ADMIN_OWNER,
  'backupManager.create': ADMIN_OWNER,
  'backupManager.restore': ADMIN_OWNER,

  // ── Project Manager ─────────────────────────────────────────────────────
  'projectManager.view': ADMIN_OWNER,
  'projectManager.createEdit': ADMIN_OWNER,
  'projectManager.delete': ADMIN_OWNER,

  // ── LED Calculator ──────────────────────────────────────────────────────
  'led.view': ADMIN_OWNER,
  'led.createQuote': ADMIN_OWNER,
  'led.editSpecs': ADMIN_OWNER,
  'led.editPricing': ADMIN_OWNER,
  'led.editTerms': ADMIN_OWNER,
  'led.clone': ADMIN_OWNER,
  'led.save': ADMIN_OWNER,
  'led.exportPdf': ADMIN_OWNER,

  // ── Saved Quotes (LED) ──────────────────────────────────────────────────
  // Admin Staff & Factory Lead can view the list but NOT financial amounts
  'savedQuotes.view': [SA, OW, AC, AS, FL],
  'savedQuotes.hideAmounts': [AS, FL],              // true = hide cost/sell columns
  'savedQuotes.load': ADMIN_OWNER,
  'savedQuotes.clone': ADMIN_OWNER,
  'savedQuotes.downloadBOM': [SA, OW, AC, AS, FL, SM],
  'savedQuotes.delete': ADMIN_OWNER,

  // ── Quote Image Library ─────────────────────────────────────────────────
  'quoteImages.view': ADMIN_OWNER,
  'quoteImages.upload': ADMIN_OWNER,
  'quoteImages.delete': ADMIN_OWNER,

  // ── Signage Calculator ──────────────────────────────────────────────────
  'signage.view': ADMIN_OWNER,
  'signage.createQuote': ADMIN_OWNER,
  'signage.editSpecs': ADMIN_OWNER,
  'signage.editPricing': ADMIN_OWNER,
  'signage.editTerms': ADMIN_OWNER,
  'signage.clone': ADMIN_OWNER,
  'signage.save': ADMIN_OWNER,
  'signage.exportPdf': ADMIN_OWNER,

  // ── Signage Quotes Manager ──────────────────────────────────────────────
  'signageQuotes.view': [SA, OW, AC, AS, FL],
  'signageQuotes.hideAmounts': [AS, FL],
  'signageQuotes.load': ADMIN_OWNER,
  'signageQuotes.clone': ADMIN_OWNER,
  'signageQuotes.downloadExcel': [SA, OW, AC, AS, FL, SM],
  'signageQuotes.downloadBOM': [SA, OW, AC, AS, FL, SM],
  'signageQuotes.delete': ADMIN_OWNER,

  // ── LED Inventory Manager ───────────────────────────────────────────────
  'inventory.view': STOCK_LEVEL,
  'inventory.add': ADMIN_OWNER,
  'inventory.editSpecs': ADMIN_OWNER,
  'inventory.editPricing': ADMIN_OWNER,
  'inventory.delete': ADMIN_OWNER,
  'inventory.batch': ADMIN_OWNER,

  // ── LED Inventory Ledger ────────────────────────────────────────────────
  'inventoryLedger.view': STOCK_LEVEL,
  'inventoryLedger.add': STOCK_LEVEL,
  'inventoryLedger.edit': STOCK_LEVEL,
  'inventoryLedger.delete': STOCK_LEVEL,

  // ── Signage Inventory Manager ───────────────────────────────────────────
  'signageInventory.view': STOCK_LEVEL,
  'signageInventory.add': ADMIN_OWNER,
  'signageInventory.editSpecs': ADMIN_OWNER,
  'signageInventory.editPricing': ADMIN_OWNER,
  'signageInventory.delete': ADMIN_OWNER,

  // ── Signage Ledger ──────────────────────────────────────────────────────
  'signageLedger.view': STOCK_LEVEL,
  'signageLedger.add': STOCK_LEVEL,
  'signageLedger.edit': STOCK_LEVEL,
  'signageLedger.delete': STOCK_LEVEL,

  // ── Misc Stock ──────────────────────────────────────────────────────────
  'miscStock.view': STOCK_LEVEL,
  'miscStock.addEdit': ADMIN_OWNER,
  'miscStock.duplicate': ADMIN_OWNER,
  'miscStock.delete': ADMIN_OWNER,
  'miscStock.addTransaction': STOCK_LEVEL,
  'miscStock.editDeleteTransaction': STOCK_LEVEL,

  // ── BOQ Tracker ─────────────────────────────────────────────────────────
  'boq.view': ALL_ROLES,
  'boq.create': ADMIN_OWNER,
  'boq.editMeta': ADMIN_OWNER,           // name / pipeline stages
  'boq.updateFactoryStatus': [SA, OW, AS, FL],
  'boq.updateSiteStatus': [SA, OW, AS, FL, ST],
  'boq.uploadFactoryImages': [SA, OW, AS, FL],
  'boq.uploadSiteImages': [SA, OW, AS, FL, ST],
  'boq.batchStatusUpdate': [SA, OW, AS, FL, ST],
  'boq.batchDelete': ADMIN_OWNER,
  'boq.delete': ADMIN_OWNER,

  // ── Structural Planner ──────────────────────────────────────────────────
  'structural.addEdit': ADMIN_OWNER,
  'structural.delete':  ADMIN_OWNER,
  'structural.save':    [SA, OW, AC, AS, FL, SM],

  // ── Cut List Calculator ─────────────────────────────────────────────────
  'cutList.use': [SA, OW, AS, FL, SM, ST],

  // ── CRM ─────────────────────────────────────────────────────────────────
  'crm.viewAll': [SA, OW, AC],
  'crm.create': ADMIN_OWNER,
  'crm.editMove': ADMIN_OWNER,
  'crm.assign': ADMIN_OWNER,
  'crm.delete': ADMIN_OWNER,

  // ── Task Manager ────────────────────────────────────────────────────────
  // viewAll = see every user's tasks; viewOwn = see only own tasks
  'tasks.viewAll': ADMIN_OWNER,
  'tasks.viewOwn': ALL_ROLES,
  // create / edit / complete: all roles can act on their own tasks;
  // ForOthers flags gate whether they can touch other users' tasks
  'tasks.create': ALL_ROLES,
  'tasks.createForOthers': ADMIN_OWNER,
  'tasks.assignOther': ADMIN_OWNER,
  'tasks.edit': ALL_ROLES,
  'tasks.editOthers': ADMIN_OWNER,
  'tasks.complete': ALL_ROLES,
  'tasks.completeOthers': ADMIN_OWNER,
  'tasks.delete': ADMIN_OWNER,

  // ── Attendance ──────────────────────────────────────────────────────────
  'attendance.viewAll': [SA, OW, AC, AS],
  'attendance.markEdit': [SA, OW, AC, AS],
  'attendance.bulkFill': [SA, OW, AC, AS],

  // ── Employee ────────────────────────────────────────────────────────────
  'employee.view': [SA, OW, AC],
  'employee.addEdit': [SA, OW, AC],
  'employee.delete': ADMIN_OWNER,
  'employee.salaryIncrements': [SA, OW, AC],
  'employee.advances': [SA, OW, AC],

  // ── Payroll ─────────────────────────────────────────────────────────────
  'payroll.view': [SA, OW, AC],
  'payroll.export': [SA, OW, AC],
};

// ---------------------------------------------------------------------------
// getPermissions — returns a flat { 'namespace.key': boolean } object
// ---------------------------------------------------------------------------
export function getPermissions(role) {
  const perms = {};
  for (const [key, allowed] of Object.entries(RULES)) {
    perms[key] = allowed.includes(role);
  }
  return perms;
}

// Convenience: check a single permission without building the full object
export function can(role, permission) {
  const allowed = RULES[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}
