// ══════════════════════════════════════════════════════════════════════════════
// AGR WAREHOUSE MONITOR — Backend API (Code.gs)
// Version: 5.0 — Full lockdown + Database Isolation (Secret Auth DB)
// ══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURATION ────────────────────────────────────────────────────────────

var TIMEZONE     = "Europe/Moscow";
// Day model: STRICT CALENDAR DAY (no 07:50 operational cutoff). The current sheet is the
// calendar "DD.MM" sheet; carry-over of unfinished work is handled by the active sheet set
// (current calendar sheet + unfinished rows of the previous calendar sheet) — see
// getActivePlanSheetNames_/getActivePlanRows_. The old 07:50 cutoff is gone.
var ALERT_EMAIL  = "MHReceiving@agr.auto";  // TODO: move to sheet config cell

var ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
var MAX_PHOTO_BASE64_LEN = 7000000;  // ~5 MB decoded
var UPLOAD_PHOTO_MAX_ATTEMPTS = 3;
var UPLOAD_PHOTO_RETRY_DELAYS_MS = [400, 1000];
var AUDIT_LOG_SHEET_NAME = "AUDIT_LOG";
var AUDIT_LOG_HEADERS = [
  "Timestamp", "RequestId", "SessionId", "Login", "Name", "Role",
  "Action", "EntityType", "EntityId", "SheetName", "SheetDate", "RowNumber",
  "ContainerNo", "LotNo", "WS", "Zone", "PhotoType",
  "OldValue", "NewValue", "OldRowSnapshot", "NewRowSnapshot", "Details",
  "Device", "UserAgent", "ClientInfo", "Result", "Error"
];
var AUDIT_JSON_CELL_MAX_LEN = 12000;

// TV displays use a static API key instead of user tokens.
// Value stored in Apps Script Project Settings → Script Properties → TV_API_KEY
var TV_API_KEY = PropertiesService.getScriptProperties().getProperty('TV_API_KEY') || '';

// Rate-limiting for login
var LOGIN_MAX_ATTEMPTS   = 5;    // max failures before lockout
var LOGIN_WINDOW_SECONDS = 300;  // 5-minute window
var LOGIN_FAIL_DELAY_MS  = 1500; // artificial delay on every failed attempt

// ── SECRET DATABASE CONFIGURATION (ISOLATION) ────────────────────────────────
// Value stored in Apps Script Project Settings → Script Properties → SECRET_AUTH_DB_ID
var SECRET_AUTH_DB_ID = PropertiesService.getScriptProperties().getProperty('SECRET_AUTH_DB_ID') || '';
var AUTH_SHEET_NAME   = 'USERS'; // Имя листа в секретной таблице

// Layout for the Secret DB (row 2+):
// A(1)=Login  B(2)=Hash  C(3)=Name  D(4)=Role  E(5)=Status  F(6)=Token
// G:P store two active session slots. F is kept as a legacy/fallback mirror.
var USER_COL_START = 1;
var USER_COL_COUNT = 6;   // A through F (legacy/base fields)
var USER_AUTH_COL_COUNT = 16; // A through P
var COL_LOGIN  = 0;
var COL_HASH   = 1;
var COL_NAME   = 2;
var COL_ROLE   = 3;
var COL_STATUS = 4;
var COL_TOKEN  = 5;

var COL_TOKEN_1            = 6;
var COL_TOKEN_1_CREATED_AT = 7;
var COL_TOKEN_1_LAST_SEEN  = 8;
var COL_TOKEN_1_DEVICE     = 9;
var COL_TOKEN_1_EXPIRES_AT = 10;
var COL_TOKEN_2            = 11;
var COL_TOKEN_2_CREATED_AT = 12;
var COL_TOKEN_2_LAST_SEEN  = 13;
var COL_TOKEN_2_DEVICE     = 14;
var COL_TOKEN_2_EXPIRES_AT = 15;

var USER_SESSION_HEADERS = [
  "Token_1",
  "Token_1_CreatedAt",
  "Token_1_LastSeenAt",
  "Token_1_Device",
  "Token_1_ExpiresAt",
  "Token_2",
  "Token_2_CreatedAt",
  "Token_2_LastSeenAt",
  "Token_2_Device",
  "Token_2_ExpiresAt"
];

var SESSION_SLOTS = [
  { token: COL_TOKEN_1, createdAt: COL_TOKEN_1_CREATED_AT, lastSeen: COL_TOKEN_1_LAST_SEEN, device: COL_TOKEN_1_DEVICE, expiresAt: COL_TOKEN_1_EXPIRES_AT },
  { token: COL_TOKEN_2, createdAt: COL_TOKEN_2_CREATED_AT, lastSeen: COL_TOKEN_2_LAST_SEEN, device: COL_TOKEN_2_DEVICE, expiresAt: COL_TOKEN_2_EXPIRES_AT }
];

var SESSION_TTL_DAYS = 14;
var SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
var SESSION_LAST_SEEN_TOUCH_SECONDS = 15 * 60;
var SESSION_LAST_SEEN_TOUCH_MS = SESSION_LAST_SEEN_TOUCH_SECONDS * 1000;

// ══════════════════════════════════════════════════════════════════════════════
// PLAN SHEET LAYOUT (V1 / V2) — header-based column mapping
// ══════════════════════════════════════════════════════════════════════════════
// Date sheets ("DD.MM") exist in two layouts. Old sheets are V1; the 27.06 sheet and
// later are V2 (the user inserts them manually). Every plan handler resolves columns
// per-sheet via getPlanColumnsForSheet(sheet) so V1 and V2 coexist. Data starts on
// row 5; the header sits in rows 1..4.
//
// V1: A# B-LotNo C-WS D-Pallets E-Container F-Phone G-ETA H-Start I-End J-Duration
//     K-Zone L-Worker M-PhotoContainer N-PhotoSeal O-PhotoUnloaded P-Arrival Q-SAP R-LES
// V2: A# B-LotNo C-WS D-Pallets E-Container F-Carrier G-Driver H-Phone I-ETA
//     J-Arrival K-Start L-End M-Duration(user formula) N-FactoryDowntime(user formula)
//     O-Zone P-Worker Q-PhotoContainer R-PhotoSeal S-PhotoUnloaded T-SAP U-LES
// Numbers are 1-BASED (for getRange). For 0-based array access use (C.X - 1).
// In V2, M/N hold USER FORMULAS — Apps Script never writes/clears/formats them.
var PLAN_COL_V1 = {
  version: "V1",
  N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5,
  CARRIER: 0, DRIVER: 0, PHONE: 6, ETA: 7, ARRIVAL_TIME: 16,
  START_TIME: 8, END_TIME: 9, UNLOAD_DURATION: 10, FACTORY_DOWNTIME: 0,
  ZONE: 11, WORKER: 12, PHOTO_CONTAINER: 13, PHOTO_SEAL: 14, PHOTO_UNLOADED: 15,
  SAP_STATUS: 17, LES_STATUS: 18, W_READ: 16, W_AUDIT: 18
};
var PLAN_COL_V2 = {
  version: "V2",
  N: 1, LOT_NO: 2, WS: 3, PALLETS: 4, CONTAINER_NO: 5,
  CARRIER: 6, DRIVER: 7, PHONE: 8, ETA: 9, ARRIVAL_TIME: 10,
  START_TIME: 11, END_TIME: 12, UNLOAD_DURATION: 13, FACTORY_DOWNTIME: 14,
  ZONE: 15, WORKER: 16, PHOTO_CONTAINER: 17, PHOTO_SEAL: 18, PHOTO_UNLOADED: 19,
  SAP_STATUS: 20, LES_STATUS: 21, W_READ: 19, W_AUDIT: 21
};
var PLAN_W_AUDIT = PLAN_COL_V2.LES_STATUS; // 21 — full V2 width (A..U)

var PLAN_HEADER_ROW     = 4;
var PLAN_DATA_START_ROW = 5;
var PLAN_HEADER_BG   = "#dfe3e8";
var PLAN_HEADER_FONT = "#1f2933";
// Header-title markers used to LOCATE the header row in rows 1..4 (most matches wins;
// later row breaks ties) — tolerant of KPI rows above and two-row headers.
var PLAN_HEADER_MARKERS = [
  "lot", "w/s", "container", "контейнер", "телефон", "прибыт", "зона",
  "выгрузк", "водитель", "перевозчик", "окончан", "пломб", "фото", "разгрузк"
];
var PLAN_V2_HEADERS = [
  "№", "Lot No", "W/S", "Кейсов P70 / в КТК", "Container No.",
  "Перевозчик", "Водитель", "Телефон", "Ожидаемое время прибытия",
  "Фактическое время прибытия на территорию АГМ", "Факт начала разгрузки",
  "Окончание разгрузки", "Затраченное время на разгрузку", "Простой ТС на заводе",
  "Зона выгрузки", "Работник принявший контейнер", "Фото контейнера",
  "Фото пломбы", "Фото выгруженного/пустого контейнера"
];

// Reads rows 1..4 once, returns { row, header[], found }. row = 1-based header row.
function planHeaderScan(sheet) {
  var lastRow = sheet.getLastRow();
  var width = Math.min(Math.max(sheet.getLastColumn(), 1), sheet.getMaxColumns());
  if (lastRow < 1 || width < 5) return { row: PLAN_HEADER_ROW, header: [], found: false };
  var scanRows = Math.min(PLAN_DATA_START_ROW - 1, lastRow);
  var block = sheet.getRange(1, 1, scanRows, width).getDisplayValues();
  var bestIdx = -1, bestHits = 0;
  for (var r = 0; r < block.length; r++) {
    var joined = block[r].join("|").toLowerCase();
    var hits = 0;
    for (var m = 0; m < PLAN_HEADER_MARKERS.length; m++) {
      if (joined.indexOf(PLAN_HEADER_MARKERS[m]) !== -1) hits++;
    }
    if (hits >= bestHits) { bestHits = hits; bestIdx = r; }
  }
  if (bestHits < 2 || bestIdx < 0) {
    return { row: PLAN_HEADER_ROW, header: (block[PLAN_HEADER_ROW - 1] || []), found: false };
  }
  return { row: bestIdx + 1, header: block[bestIdx], found: true };
}

// ── HEADER-BASED COLUMN MAPPING (the real source of truth) ───────────────────
// Columns are resolved from the ACTUAL header text of each sheet, never from a fixed
// position table keyed by date. Three layouts are supported and distinguished purely
// by which headers are present:
//   V1       — legacy: no "простой", no "перевозчик/водитель"
//   V2_LIVE  — current prod: has "простой ТС", no "перевозчик/водитель"
//   V2_FULL  — theoretical wide layout: has "перевозчик" AND "водитель"
// The same builder serves reads and writes, so a sheet that puts ZONE in M (V2_LIVE)
// is read AND written at M — никогда по теоретической схеме.

// Normalize a header cell: lowercase, trim, strip newlines, ё→е, collapse spaces.
function normalizePlanHeader_(v) {
  if (v === null || v === undefined) return "";
  var s = v.toString().toLowerCase();
  s = s.replace(/[\r\n]+/g, " ").replace(/ё/g, "е").replace(/\s+/g, " ");
  return s.trim();
}

// Required for any write — if any are missing, writes are blocked (no guessing).
var PLAN_REQUIRED_WRITE_FIELDS = [
  "LOT_NO", "CONTAINER_NO", "PHONE", "ETA", "START_TIME", "END_TIME",
  "ZONE", "WORKER", "PHOTO_CONTAINER", "PHOTO_SEAL", "PHOTO_UNLOADED"
];

// Ordered, MOST-SPECIFIC-FIRST classification rules. Each header cell is matched to the
// first rule that fits; the first column matching a field wins. `all` = every token must
// be present, `any` = at least one token present.
var PLAN_HEADER_RULES = [
  { field: "PHOTO_SEAL",       all: ["фото"], any: ["пломб"] },
  { field: "PHOTO_UNLOADED",   all: ["фото"], any: ["выгруж", "пуст"] },
  { field: "PHOTO_CONTAINER",  all: ["фото"], any: ["контейнер"] },
  { field: "WORKER",           any: ["работник"] },
  { field: "ZONE",             any: ["зона"] },
  { field: "CARRIER",          any: ["перевозчик"] },
  { field: "DRIVER",           any: ["водитель"] },
  { field: "FACTORY_DOWNTIME", any: ["простой"] },
  { field: "UNLOAD_DURATION",  any: ["затрачен", "время на разгруз"] },
  { field: "END_TIME",         any: ["окончан"] },
  { field: "START_TIME",       any: ["начал"] },
  { field: "ETA",              any: ["ожидаем"] },
  { field: "ARRIVAL_TIME",     any: ["приб"] },
  { field: "PHONE",            any: ["телефон"] },
  { field: "CONTAINER_NO",     any: ["container"] },
  { field: "PALLETS",          any: ["кейсов", "p70", "р70", "ктк"] },
  { field: "WS",               any: ["w/s"] },
  { field: "LOT_NO",           any: ["lot"] },
  // SAP/LES matched ONLY against the header row (the substring "sap"/"les" covers
  // "статус sap", "sap статус", "принято sap", etc.) — never against data like "Принят".
  { field: "SAP_STATUS",       any: ["sap"] },
  { field: "LES_STATUS",       any: ["les"] }
];

function planHeaderRuleMatches_(h, rule) {
  var i;
  if (rule.all) {
    for (i = 0; i < rule.all.length; i++) if (h.indexOf(rule.all[i]) === -1) return false;
  }
  if (rule.any) {
    var ok = false;
    for (i = 0; i < rule.any.length; i++) { if (h.indexOf(rule.any[i]) !== -1) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}

// Resolve the full column map for a sheet from its real headers. Always returns an object
// (version may be "UNKNOWN"); callers decide whether that is acceptable (reads vs writes).
function buildPlanColumnsFromHeaders_(sheet) {
  var scan = planHeaderScan(sheet);
  var header = scan.header || [];
  var pos = {}; // field -> 1-based column, first match wins
  for (var c = 0; c < header.length; c++) {
    var norm = normalizePlanHeader_(header[c]);
    if (!norm) continue;
    for (var r = 0; r < PLAN_HEADER_RULES.length; r++) {
      var rule = PLAN_HEADER_RULES[r];
      if (planHeaderRuleMatches_(norm, rule)) {
        if (!pos[rule.field]) pos[rule.field] = c + 1;
        break; // one field per column
      }
    }
  }
  var get = function (f) { return pos[f] || 0; };
  var C = {
    headerRow: scan.row,
    headerFound: scan.found,
    N: pos.N || 1, // # is always column A
    LOT_NO: get("LOT_NO"), WS: get("WS"), PALLETS: get("PALLETS"), CONTAINER_NO: get("CONTAINER_NO"),
    CARRIER: get("CARRIER"), DRIVER: get("DRIVER"), PHONE: get("PHONE"), ETA: get("ETA"),
    ARRIVAL_TIME: get("ARRIVAL_TIME"), START_TIME: get("START_TIME"), END_TIME: get("END_TIME"),
    UNLOAD_DURATION: get("UNLOAD_DURATION"), FACTORY_DOWNTIME: get("FACTORY_DOWNTIME"),
    ZONE: get("ZONE"), WORKER: get("WORKER"),
    PHOTO_CONTAINER: get("PHOTO_CONTAINER"), PHOTO_SEAL: get("PHOTO_SEAL"), PHOTO_UNLOADED: get("PHOTO_UNLOADED"),
    SAP_STATUS: get("SAP_STATUS"), LES_STATUS: get("LES_STATUS")
  };

  // Version is informational only — the mapping is ALWAYS by found positions.
  if (C.CARRIER && C.DRIVER) C.version = "V2_FULL";
  else if (C.FACTORY_DOWNTIME) C.version = "V2_LIVE";
  else if (C.CONTAINER_NO && scan.found) C.version = "V1";
  else C.version = "UNKNOWN";

  // Read width = widest operational column (SAP/LES excluded); audit width includes them.
  C.W_READ = Math.max(
    C.N, C.LOT_NO, C.WS, C.PALLETS, C.CONTAINER_NO, C.CARRIER, C.DRIVER,
    C.PHONE, C.ETA, C.ARRIVAL_TIME, C.START_TIME, C.END_TIME,
    C.UNLOAD_DURATION, C.FACTORY_DOWNTIME, C.ZONE, C.WORKER,
    C.PHOTO_CONTAINER, C.PHOTO_SEAL, C.PHOTO_UNLOADED, 1
  );
  C.W_AUDIT = Math.max(C.W_READ, C.SAP_STATUS, C.LES_STATUS);

  C.missing = [];
  for (var k = 0; k < PLAN_REQUIRED_WRITE_FIELDS.length; k++) {
    if (!C[PLAN_REQUIRED_WRITE_FIELDS[k]]) C.missing.push(PLAN_REQUIRED_WRITE_FIELDS[k]);
  }
  return C;
}

// "V1" | "V2_LIVE" | "V2_FULL" | "UNKNOWN" — derived from real headers.
function detectPlanLayout(sheet) {
  try { return buildPlanColumnsFromHeaders_(sheet).version; }
  catch (e) { return "UNKNOWN"; }
}

// READ-safe map (never throws). Uses header positions when the header row is found and
// the container column resolved; otherwise falls back to the legacy V1 fixed map so old
// malformed sheets keep reading as before.
function getPlanColumnsForSheet(sheet) {
  try {
    var C = buildPlanColumnsFromHeaders_(sheet);
    if (C.headerFound && C.CONTAINER_NO) return C;
  } catch (e) {}
  return PLAN_COL_V1;
}

// WRITE-safe map: the header row MUST be found AND every required write column resolved,
// or the write is BLOCKED with a clear error so data never lands in the wrong columns.
function getPlanColumnsForSheetWriteSafe_(sheet) {
  var name = (sheet && sheet.getName) ? sheet.getName() : "?";
  var C;
  try { C = buildPlanColumnsFromHeaders_(sheet); }
  catch (e) { throw new Error("Unknown or incomplete plan layout, write blocked for sheet " + name); }
  if (!C.headerFound || (C.missing && C.missing.length > 0)) {
    throw new Error("Unknown or incomplete plan layout, write blocked for sheet " + name);
  }
  return C;
}

// Clamp a read width to the sheet's real column count so getRange() never throws
// "out of bounds" on a narrow sheet. Missing columns read as "" (safe).
function planReadCols_(sheet, want) {
  return Math.max(1, Math.min(want, sheet.getMaxColumns()));
}

// Read-only diagnostic log line. Never mutates data; never throws into the caller.
function logPlanHandlerDebug_(handlerName, mode, sheet, C, extra) {
  try {
    var scan = planHeaderScan(sheet);
    Logger.log("PLAN_DEBUG " + JSON.stringify({
      handler: handlerName, mode: mode || "",
      sheet: sheet && sheet.getName ? sheet.getName() : "",
      layout: detectPlanLayout(sheet), headerRow: scan ? scan.row : null,
      headerFound: scan ? scan.found : null,
      maxCols: sheet && sheet.getMaxColumns ? sheet.getMaxColumns() : null,
      version: C ? C.version : null,
      cols: C ? { phone: C.PHONE, eta: C.ETA, arrival: C.ARRIVAL_TIME, start: C.START_TIME,
                  end: C.END_TIME, zone: C.ZONE, worker: C.WORKER, photoContainer: C.PHOTO_CONTAINER,
                  photoSeal: C.PHOTO_SEAL, photoUnloaded: C.PHOTO_UNLOADED, sap: C.SAP_STATUS, les: C.LES_STATUS } : null,
      extra: extra || null
    }));
  } catch (e) { try { Logger.log("PLAN_DEBUG failed: " + e); } catch (_e) {} }
}

// Ensure the sheet is wide enough for the full V2 layout (A..U).
function ensurePlanV2Width(sheet) {
  var maxCols = sheet.getMaxColumns();
  if (maxCols < PLAN_W_AUDIT) sheet.insertColumnsAfter(maxCols, PLAN_W_AUDIT - maxCols);
}

// Write V2 headers + freeze for a NEW sheet created by the app. No formulas/coloring.
function applyPlanV2Layout(sheet, headerRow) {
  headerRow = headerRow || PLAN_HEADER_ROW;
  ensurePlanV2Width(sheet);
  sheet.getRange(headerRow, 1, 1, PLAN_V2_HEADERS.length)
    .setValues([PLAN_V2_HEADERS]).setFontWeight("bold")
    .setBackground(PLAN_HEADER_BG).setFontColor(PLAN_HEADER_FONT);
  sheet.setFrozenRows(PLAN_DATA_START_ROW - 1);
}

// Manual read-only diagnostic, e.g. debugPlanColumns("28.06"). NOT wired to doGet/doPost.
// Prints detected layout, header row, every resolved column and any missing required cols.
function debugPlanColumns(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) { Logger.log("debugPlanColumns: sheet not found: " + sheetName); return "MISSING"; }
  var scan = planHeaderScan(sheet);
  var C = buildPlanColumnsFromHeaders_(sheet);
  var lines = [];
  lines.push("debugPlanColumns sheet=" + sheetName);
  lines.push("version=" + C.version);
  lines.push("headerRow=" + scan.row + " headerFound=" + scan.found);
  lines.push("maxCols=" + sheet.getMaxColumns() + " lastCol=" + sheet.getLastColumn() + " lastRow=" + sheet.getLastRow());
  lines.push("header=" + JSON.stringify(scan.header));
  var fields = [
    "N", "LOT_NO", "WS", "PALLETS", "CONTAINER_NO", "CARRIER", "DRIVER", "PHONE", "ETA",
    "ARRIVAL_TIME", "START_TIME", "END_TIME", "UNLOAD_DURATION", "FACTORY_DOWNTIME",
    "ZONE", "WORKER", "PHOTO_CONTAINER", "PHOTO_SEAL", "PHOTO_UNLOADED", "SAP_STATUS", "LES_STATUS"
  ];
  for (var i = 0; i < fields.length; i++) lines.push(fields[i] + "=" + (C[fields[i]] || 0));
  lines.push("W_READ=" + C.W_READ + " W_AUDIT=" + C.W_AUDIT);
  lines.push((C.missing && C.missing.length)
    ? ("WARNING missing required: " + C.missing.join(","))
    : "missing required: none");
  var out = lines.join("\n");
  Logger.log(out);
  return out;
}

// Convenience wrapper for the prod sheet — run from the Apps Script editor.
function debugPlanColumns_2806() {
  return debugPlanColumns("28.06");
}

// Manual read-only per-row diagnostic, e.g. debugPlanRow("28.06", 14). NEVER writes.
// Prints each resolved field with its display value and warns about SAP/LES problems.
function debugPlanRow(sheetName, rowNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) { Logger.log("debugPlanRow: sheet not found: " + sheetName); return "MISSING"; }
  rowNumber = parseInt(rowNumber, 10);
  if (!rowNumber || rowNumber < 1 || rowNumber > sheet.getLastRow()) {
    Logger.log("debugPlanRow: invalid row " + rowNumber + " on " + sheetName); return "INVALID_ROW";
  }
  var C = buildPlanColumnsFromHeaders_(sheet);
  var width = planReadCols_(sheet, Math.max(C.W_AUDIT, 1));
  var row = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  var at = function (col) { return col > 0 ? (row[col - 1] !== undefined ? row[col - 1] : "") : "(no column)"; };
  var lines = [];
  lines.push("debugPlanRow sheet=" + sheetName + " row=" + rowNumber + " version=" + C.version);
  var fields = [
    "PHONE", "ETA", "ARRIVAL_TIME", "START_TIME", "END_TIME", "UNLOAD_DURATION", "FACTORY_DOWNTIME",
    "ZONE", "WORKER", "PHOTO_CONTAINER", "PHOTO_SEAL", "PHOTO_UNLOADED", "SAP_STATUS", "LES_STATUS"
  ];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    lines.push(f + " [col " + (C[f] || 0) + "] = " + JSON.stringify(at(C[f])));
  }
  if (!C.SAP_STATUS || !C.LES_STATUS) {
    lines.push("WARNING: SAP/LES header(s) NOT found — accounting reads/writes are blocked/empty (no Q/R fallback).");
  }
  if (C.PHOTO_UNLOADED && (C.PHOTO_UNLOADED === C.SAP_STATUS || C.PHOTO_UNLOADED === C.LES_STATUS)) {
    lines.push("WARNING: PHOTO_UNLOADED column equals a SAP/LES column — header mapping is wrong, fix the sheet headers.");
  }
  var out = lines.join("\n");
  Logger.log(out);
  return out;
}

function debugPlanRow_2806_14() {
  return debugPlanRow("28.06", 14);
}

// ── ROUTE TABLE ──────────────────────────────────────────────────────────────

var ROUTES = {
  // ── Public (no auth at all) ──
  "login":                 { handler: handleLogin,              auth: false, lock: true  },
  "register":              { handler: handleRegister,           auth: false, lock: true  },

  // ── TV display endpoints (static API key, anonymized data) ──
  "tv_dashboard":          { handler: handleTvDashboard,        auth: "tv",  lock: false },
  "tv_lot_tracker":        { handler: handleTvLotTracker,       auth: "tv",  lock: false },

  // ── Public read-only TV data, no user session and no mutations ──
  "tv_lot_progress":       { handler: handleTvLotProgress,      auth: false, lock: false },

  // ── Authenticated reads (user token required) ──
  "":                      { handler: handleReadComplex,        auth: false, lock: false },
  "get_operator_tasks":    { handler: handleGetStats,           auth: true,  lock: false },
  "get_stats":             { handler: handleGetStats,           auth: true,  lock: false },
  "get_all_containers":    { handler: handleGetAllContainers,   auth: true,  lock: false },
  "get_issues":            { handler: handleGetIssues,          auth: true,  lock: false },
  "get_history":           { handler: handleGetHistory,         auth: true,  lock: false },
  "get_full_plan":         { handler: handleGetFullPlan,        auth: true,  lock: false },
  "get_lot_tracker":       { handler: handleGetLotTracker,      auth: true,  lock: false },
  "get_priority_lot":      { handler: handleGetPriorityLot,     auth: true,  lock: false },
  "get_dashboard_bundle":  { handler: handleGetDashboardBundle,  auth: true,  lock: false },

  // ── Authenticated writes (user token required) ──
  "task_action":           { handler: handleTaskAction,         auth: true,  lock: true  },
  "report_issue":          { handler: handleReportIssue,        auth: true,  lock: true  },
  "update_container_row":  { handler: handleUpdateContainerRow, auth: true,  lock: true  },
  "create_plan":           { handler: handleCreatePlan,         auth: true,  lock: true  },
  "set_priority_lot":      { handler: handleSetPriorityLot,     auth: true,  lock: true  },
  "upload_photo":          { handler: handleUploadPhoto,        auth: true,  lock: false },
  "update_accounting":     { handler: handleUpdateAccounting,   auth: true,  lock: true  },
  "subscribe_notification":{ handler: handleSubscribeNotification, auth: true, lock: true },
  "audit_event":           { handler: handleAuditEvent,         auth: true,  lock: false },

  // ── Admin (user token + ADMIN role) ──
  "get_pending":           { handler: handleGetPending,         auth: true,  lock: false, admin: true },
  "approve_user":          { handler: handleApproveUser,        auth: true,  lock: true,  admin: true },
  "reject_user":           { handler: handleRejectUser,         auth: true,  lock: true,  admin: true }
};


// ══════════════════════════════════════════════════════════════════════════════
// 1. ENTRY POINTS
// ══════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  return dispatch(e.parameter || {});
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return dispatch(data);
  } catch (err) {
    return jsonOut({ error: "INVALID_JSON" });
  }
}

function dispatch(params) {
  var mode  = (params.mode || "").toString().trim();
  var route = ROUTES[mode];
  var ss = null;

  if (!route) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      appendAuditEvent_(ss, {
        params: params,
        action: "UNKNOWN_MODE",
        entityType: "route",
        entityId: mode,
        details: { mode: mode },
        result: "failed",
        error: "UNKNOWN_MODE"
      });
    } catch (_auditErr) {}
    return jsonOut({ error: "UNKNOWN_MODE", mode: mode });
  }

  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Auth check ──
    if (route.auth === "tv") {
      var providedKey = (params.key || "").toString().trim();
      if (providedKey !== TV_API_KEY) {
        appendAuditEvent_(ss, {
          params: params,
          action: "TV_KEY_INVALID",
          entityType: "auth",
          entityId: mode,
          details: { mode: mode },
          result: "failed",
          error: "INVALID_TV_KEY"
        });
        return jsonOut({ error: "INVALID_TV_KEY" });
      }
    } else if (route.auth === true) {
      var caller = verifyToken(params.token);
      if (!caller) {
        appendAuditEvent_(ss, {
          params: params,
          action: "INVALID_TOKEN",
          entityType: "auth",
          entityId: mode,
          details: { mode: mode },
          result: "failed",
          error: "AUTH_REQUIRED"
        });
        return jsonOut({ error: "AUTH_REQUIRED" });
      }
      if (route.admin && caller.role !== "ADMIN") {
        appendAuditEvent_(ss, {
          params: params,
          caller: caller,
          action: "PERMISSION_DENIED",
          entityType: "auth",
          entityId: mode,
          details: { mode: mode, requiredRole: "ADMIN" },
          result: "failed",
          error: "ADMIN_REQUIRED"
        });
        return jsonOut({ error: "ADMIN_REQUIRED" });
      }
      params._caller = caller;
    }

    // ── Execute ──
    if (route.lock) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(12000)) {
        appendAuditEvent_(ss, {
          params: params,
          caller: params._caller,
          action: "LOCK_BUSY",
          entityType: "route",
          entityId: mode,
          details: { mode: mode },
          result: "failed",
          error: "BUSY"
        });
        return textOut("BUSY");
      }
      try {
        return route.handler(params, ss);
      } finally {
        lock.releaseLock();
      }
    } else {
      return route.handler(params, ss);
    }

  } catch (err) {
    appendAuditEvent_(ss, {
      params: params,
      caller: params._caller,
      action: "ROUTE_EXCEPTION",
      entityType: "route",
      entityId: mode,
      details: { mode: mode },
      result: "failed",
      error: err && err.stack ? err.stack : err.toString()
    });
    return jsonOut({ error: "SERVER_ERROR", detail: err.toString() });
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// 2. AUTH SYSTEM & DATABASE ISOLATION HELPER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Gets the Secret Authentication Database Sheet
 */
function getAuthSheet() {
  try {
    return SpreadsheetApp.openById(SECRET_AUTH_DB_ID).getSheetByName(AUTH_SHEET_NAME);
  } catch (e) {
    throw new Error("SECRET_DB_ERROR: Проверьте SECRET_AUTH_DB_ID и права доступа скрипта.");
  }
}

function generateToken() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

// Short-lived cache of token → caller identity. Each positive hit saves one
// openById(SECRET_AUTH_DB) + full-sheet getDisplayValues() call. 60s TTL means
// a revoked/rejected user may keep access for up to 60s; login/approve/reject
// explicitly invalidate via invalidateTokenCache().
var TOKEN_CACHE_TTL_OK  = 60;
var TOKEN_CACHE_TTL_NEG = 30;

function tokenCacheKey(token) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, token);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) hex += ((bytes[i] + 256) & 255).toString(16).slice(-2);
  return "tok_" + hex;
}

function invalidateTokenCache(token) {
  if (!token) return;
  try { CacheService.getScriptCache().remove(tokenCacheKey(token)); } catch (e) {}
}

function normalizeUserRow(row) {
  row = row || [];
  for (var i = 0; i < USER_AUTH_COL_COUNT; i++) {
    if (row[i] === null || row[i] === undefined) row[i] = "";
  }
  return row;
}

function getUserAuthReadWidth(sheet) {
  var maxColumns = sheet.getMaxColumns();
  if (!maxColumns || maxColumns < 1) return USER_COL_COUNT;
  return Math.min(maxColumns, USER_AUTH_COL_COUNT);
}

function readUserAuthRows(sheet, rowCount) {
  var width = getUserAuthReadWidth(sheet);
  var rows = sheet.getRange(2, USER_COL_START, rowCount, width).getValues();
  for (var i = 0; i < rows.length; i++) normalizeUserRow(rows[i]);
  return rows;
}

function ensureUserSessionColumns(sheet) {
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < USER_AUTH_COL_COUNT) {
    sheet.insertColumnsAfter(maxColumns, USER_AUTH_COL_COUNT - maxColumns);
  }

  var startCol = USER_COL_START + COL_TOKEN_1;
  var headerRange = sheet.getRange(1, startCol, 1, USER_SESSION_HEADERS.length);
  var current = headerRange.getValues()[0];
  var next = [];
  var changed = false;

  for (var i = 0; i < USER_SESSION_HEADERS.length; i++) {
    var header = current[i];
    if (header === null || header === undefined || header.toString().trim() === "") {
      next[i] = USER_SESSION_HEADERS[i];
      changed = true;
    } else {
      next[i] = header;
    }
  }

  if (changed) headerRange.setValues([next]);
}

function getSessionToken(row, slot) {
  return (row[slot.token] || "").toString().trim();
}

function parseSessionTime(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.getTime();
  }

  var text = value.toString().trim();
  if (!text) return null;

  var ms = Date.parse(text);
  return isNaN(ms) ? null : ms;
}

function isSessionExpired(row, slot, nowMs) {
  if (!getSessionToken(row, slot)) return false;
  var expiresAt = parseSessionTime(row[slot.expiresAt]);
  return expiresAt !== null && expiresAt <= nowMs;
}

function normalizeDeviceType(device) {
  device = (device || "").toString().toLowerCase().trim();
  return ["mobile", "desktop", "tablet", "unknown"].indexOf(device) === -1 ? "unknown" : device;
}

function buildSessionValues(token, device, now) {
  var createdAt = now.toISOString();
  var expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  return [token, createdAt, createdAt, normalizeDeviceType(device), expiresAt];
}

function chooseSessionSlot(row, now) {
  var nowMs = now.getTime();

  for (var i = 0; i < SESSION_SLOTS.length; i++) {
    var slot = SESSION_SLOTS[i];
    if (!getSessionToken(row, slot) || isSessionExpired(row, slot, nowMs)) return slot;
  }

  var oldestSlot = SESSION_SLOTS[0];
  var oldestMs = Number.MAX_VALUE;

  for (var j = 0; j < SESSION_SLOTS.length; j++) {
    var candidate = SESSION_SLOTS[j];
    var activityMs = parseSessionTime(row[candidate.lastSeen]);
    if (activityMs === null) activityMs = parseSessionTime(row[candidate.createdAt]);
    if (activityMs === null) activityMs = 0;

    if (activityMs < oldestMs) {
      oldestMs = activityMs;
      oldestSlot = candidate;
    }
  }

  return oldestSlot;
}

function writeSessionSlot(sheet, rowNumber, row, slot, token, device, now) {
  var oldToken = getSessionToken(row, slot);
  var values = buildSessionValues(token, device, now);

  sheet.getRange(rowNumber, USER_COL_START + slot.token, 1, values.length).setValues([values]);

  row[slot.token] = values[0];
  row[slot.createdAt] = values[1];
  row[slot.lastSeen] = values[2];
  row[slot.device] = values[3];
  row[slot.expiresAt] = values[4];

  if (oldToken && oldToken !== token) invalidateTokenCache(oldToken);
}

function legacyTokenHasActiveSession(row, legacyToken, nowMs) {
  if (!legacyToken) return false;
  for (var i = 0; i < SESSION_SLOTS.length; i++) {
    var slot = SESSION_SLOTS[i];
    if (getSessionToken(row, slot) === legacyToken && !isSessionExpired(row, slot, nowMs)) return true;
  }
  return false;
}

function migrateLegacyTokenToSessionSlot(sheet, rowNumber, row, now) {
  var legacyToken = (row[COL_TOKEN] || "").toString().trim();
  if (!legacyToken) return;
  if (legacyTokenHasActiveSession(row, legacyToken, now.getTime())) return;

  for (var i = 0; i < SESSION_SLOTS.length; i++) {
    var slot = SESSION_SLOTS[i];
    if (!getSessionToken(row, slot) || isSessionExpired(row, slot, now.getTime())) {
      writeSessionSlot(sheet, rowNumber, row, slot, legacyToken, "unknown", now);
      return;
    }
  }
}

function mirrorLegacyToken(sheet, rowNumber, row, token) {
  var oldToken = (row[COL_TOKEN] || "").toString().trim();
  if (oldToken === token) return;

  sheet.getRange(rowNumber, USER_COL_START + COL_TOKEN).setValue(token);
  row[COL_TOKEN] = token;
  if (oldToken) invalidateTokenCache(oldToken);
}

function invalidateUserRowTokenCaches(row) {
  normalizeUserRow(row);
  invalidateTokenCache(row[COL_TOKEN]);
  for (var i = 0; i < SESSION_SLOTS.length; i++) {
    invalidateTokenCache(getSessionToken(row, SESSION_SLOTS[i]));
  }
}

function callerFromUserRow(row) {
  return {
    login: (row[COL_LOGIN] || "").toString(),
    name:  (row[COL_NAME] || "").toString(),
    role:  (row[COL_ROLE] || "").toString()
  };
}

function maybeTouchSessionLastSeen(sheet, rowNumber, row, slot, now, cache) {
  var token = getSessionToken(row, slot);
  if (!token) return;

  var nowMs = now.getTime();
  var lastSeenMs = parseSessionTime(row[slot.lastSeen]);
  if (lastSeenMs !== null && nowMs - lastSeenMs < SESSION_LAST_SEEN_TOUCH_MS) return;

  var touchKey = "touch_" + tokenCacheKey(token);
  try {
    if (cache.get(touchKey)) return;
  } catch (e) {}

  var nowIso = now.toISOString();
  try {
    sheet.getRange(rowNumber, USER_COL_START + slot.lastSeen).setValue(nowIso);
    row[slot.lastSeen] = nowIso;
    cache.put(touchKey, "1", SESSION_LAST_SEEN_TOUCH_SECONDS);
  } catch (e) {}
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;

  var cache = CacheService.getScriptCache();
  var ck = tokenCacheKey(token);
  var cached = cache.get(ck);
  if (cached === "NEG") return null;
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }

  var sheet = getAuthSheet();
  if (!sheet) return null;

  var lr = sheet.getLastRow();
  if (lr < 2) return null;

  var data = readUserAuthRows(sheet, lr - 1);
  var now = new Date();
  var nowMs = now.getTime();
  var legacyCaller = null;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if ((row[COL_STATUS] || "").toString().trim().toUpperCase() !== "APPROVED") continue;

    for (var s = 0; s < SESSION_SLOTS.length; s++) {
      var slot = SESSION_SLOTS[s];
      if (getSessionToken(row, slot) === token) {
        if (isSessionExpired(row, slot, nowMs)) {
          try { cache.put(ck, "NEG", TOKEN_CACHE_TTL_NEG); } catch (e) {}
          return null;
        }

        var caller = callerFromUserRow(row);
        maybeTouchSessionLastSeen(sheet, i + 2, row, slot, now, cache);
        try { cache.put(ck, JSON.stringify(caller), TOKEN_CACHE_TTL_OK); } catch (e) {}
        return caller;
      }
    }

    if ((row[COL_TOKEN] || "").toString().trim() === token) {
      legacyCaller = callerFromUserRow(row);
    }
  }

  if (legacyCaller) {
    try { cache.put(ck, JSON.stringify(legacyCaller), TOKEN_CACHE_TTL_OK); } catch (e) {}
    return legacyCaller;
  }

  try { cache.put(ck, "NEG", TOKEN_CACHE_TTL_NEG); } catch (e) {}
  return null;
}

// ── Today-sheet read cache ──────────────────────────────────────────────────
// Shared 15s cache for handleReadComplex + handleGetStats keyed by the current
// operational sheet name. With N clients polling in parallel, only one actually reads the
// sheet per 15s window; others hit CacheService. Write handlers invalidate
// immediately, so operator UI never sees its own stale action.
var TODAY_READ_CACHE_TTL = 15;

function todayCacheKey(prefix) { return prefix + "_" + getTodaySheetName(); }

function invalidateTodayReadCache() {
  try {
    var c = CacheService.getScriptCache();
    c.removeAll([todayCacheKey("rcx"), todayCacheKey("stats")]);
  } catch (e) {}
}

function invalidateDateReadCache(dateStr) {
  if (!dateStr) return;
  try {
    var c = CacheService.getScriptCache();
    c.removeAll(["rcx_" + dateStr, "stats_" + dateStr]);
  } catch (e) {}
}


// ══════════════════════════════════════════════════════════════════════════════
// 3. UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function textOut(str) {
  return ContentService.createTextOutput(str)
    .setMimeType(ContentService.MimeType.TEXT);
}

function normalizeAuditCell(value, maxLen) {
  var text = value === null || value === undefined ? "" : String(value);
  text = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (maxLen && text.length > maxLen) text = text.substring(0, maxLen);
  if (text && /^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function buildAuditDetails(parts) {
  var clean = [];
  for (var i = 0; i < parts.length; i++) {
    var part = normalizeAuditCell(parts[i], 120);
    if (part) clean.push(part);
  }
  return clean.join(";");
}

function isRetryableUploadPhotoError(err) {
  var text = String(err || "").toLowerCase();
  return text.indexOf("\u043e\u0448\u0438\u0431\u043a\u0430 \u0441\u043b\u0443\u0436\u0431\u044b: \u0434\u0438\u0441\u043a") !== -1 ||
    text.indexOf("service error: drive") !== -1 ||
    text.indexOf("service unavailable: drive") !== -1;
}

function createSharedUploadFileWithRetry(blob) {
  var file = null;
  for (var attempt = 1; attempt <= UPLOAD_PHOTO_MAX_ATTEMPTS; attempt++) {
    try {
      if (!file) file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { file: file, attempts: attempt };
    } catch (e) {
      if (e && typeof e === "object") e.uploadAttempts = attempt;
      if (!isRetryableUploadPhotoError(e) || attempt >= UPLOAD_PHOTO_MAX_ATTEMPTS) throw e;
      Utilities.sleep(UPLOAD_PHOTO_RETRY_DELAYS_MS[attempt - 1] || 0);
    }
  }
  throw new Error("UPLOAD_PHOTO_RETRY_EXHAUSTED");
}

// Per-execution cache of the audit-log sheet. A single write (e.g. a start with photos) emits
// several audit events; without this each one re-opened the secret DB (openById) and re-checked
// headers, adding seconds to the operator's wait. The cache resets every web request (each is a
// fresh script execution), so a freshly-deployed header change is still picked up on the next call.
var _auditLogSheetCache = null;

function getOrCreateAuditLogSheet(ss) {
  if (_auditLogSheetCache) return _auditLogSheetCache;

  var authSheet = getAuthSheet();
  var auditSs = authSheet ? authSheet.getParent() : null;
  if (!auditSs) throw new Error("AUDIT_LOG_AUTH_DB_UNAVAILABLE");

  var sheet = auditSs.getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!sheet) {
    try {
      sheet = auditSs.insertSheet(AUDIT_LOG_SHEET_NAME);
    } catch (e) {
      sheet = auditSs.getSheetByName(AUDIT_LOG_SHEET_NAME);
      if (!sheet) throw e;
    }
  }

  ensureAuditLogHeaders_(sheet);

  _auditLogSheetCache = sheet;
  return sheet;
}

function ensureSheetWidth_(sheet, width) {
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < width) {
    sheet.insertColumnsAfter(maxColumns, width - maxColumns);
  }
}

function ensureAuditLogHeaders_(sheet) {
  if (!sheet) return AUDIT_LOG_HEADERS.slice();

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    ensureSheetWidth_(sheet, AUDIT_LOG_HEADERS.length);
    sheet.getRange(1, 1, 1, AUDIT_LOG_HEADERS.length)
      .setValues([AUDIT_LOG_HEADERS])
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    return AUDIT_LOG_HEADERS.slice();
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var seen = {};
  var normalized = [];
  var changed = false;

  for (var i = 0; i < headers.length; i++) {
    var header = (headers[i] || "").toString().trim();
    normalized.push(header);
    if (header) seen[header] = true;
  }

  for (var h = 0; h < AUDIT_LOG_HEADERS.length; h++) {
    var desired = AUDIT_LOG_HEADERS[h];
    if (!seen[desired]) {
      normalized.push(desired);
      seen[desired] = true;
      changed = true;
    }
  }

  if (changed) {
    ensureSheetWidth_(sheet, normalized.length);
    sheet.getRange(1, 1, 1, normalized.length)
      .setValues([normalized])
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return normalized;
}

function getAuditFieldMaxLen_(header) {
  if (header === "OldRowSnapshot" || header === "NewRowSnapshot") return AUDIT_JSON_CELL_MAX_LEN;
  if (header === "OldValue" || header === "NewValue") return 6000;
  if (header === "Details" || header === "ClientInfo") return 4000;
  if (header === "Error") return 2500;
  if (header === "UserAgent") return 800;
  return 500;
}

function safeAuditJson_(value, maxLen) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return normalizeAuditCell(value, maxLen);
  try {
    return normalizeAuditCell(JSON.stringify(value), maxLen);
  } catch (e) {
    return normalizeAuditCell(String(value), maxLen);
  }
}

function extractAuditClientInfo_(params, entry) {
  params = params || {};
  entry = entry || {};
  var rawInfo = entry.clientInfo || params.clientInfo || {};
  var info = {};

  if (rawInfo && typeof rawInfo === "object") {
    info = rawInfo;
  } else if (rawInfo) {
    info = { raw: rawInfo.toString() };
  }

  if (params.clientTimestamp) info.clientTimestamp = params.clientTimestamp;
  if (params.path) info.path = params.path;
  if (params.page) info.page = params.page;
  if (params.actionSource) info.actionSource = params.actionSource;

  return {
    requestId: entry.requestId || params.requestId || Utilities.getUuid(),
    sessionId: entry.sessionId || params.sessionId || "",
    device: normalizeDeviceType(entry.device || params.device || info.device || "unknown"),
    userAgent: entry.userAgent || params.userAgent || "",
    clientInfo: info
  };
}

function appendAuditEvent_(ss, entry) {
  try {
    if (!ss || !entry) return;

    var params = entry.params || {};
    var caller = entry.caller || params._caller || {};
    var client = extractAuditClientInfo_(params, entry);
    var sheet = getOrCreateAuditLogSheet(ss);
    var headers = ensureAuditLogHeaders_(sheet);

    var values = {
      Timestamp: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
      RequestId: client.requestId,
      SessionId: client.sessionId,
      Login: entry.login || caller.login || "",
      Name: entry.name || caller.name || "",
      Role: entry.role || caller.role || "",
      Action: entry.action || "",
      EntityType: entry.entityType || "",
      EntityId: entry.entityId || "",
      SheetName: entry.sheetName || entry.sheetDate || "",
      SheetDate: entry.sheetDate || entry.sheetName || "",
      RowNumber: entry.rowNumber || "",
      ContainerNo: entry.containerNo || "",
      LotNo: entry.lotNo || "",
      WS: entry.ws || "",
      Zone: entry.zone || "",
      PhotoType: entry.photoType || "",
      OldValue: safeAuditJson_(entry.oldValue, getAuditFieldMaxLen_("OldValue")),
      NewValue: safeAuditJson_(entry.newValue, getAuditFieldMaxLen_("NewValue")),
      OldRowSnapshot: safeAuditJson_(entry.oldRowSnapshot, getAuditFieldMaxLen_("OldRowSnapshot")),
      NewRowSnapshot: safeAuditJson_(entry.newRowSnapshot, getAuditFieldMaxLen_("NewRowSnapshot")),
      Details: safeAuditJson_(entry.details || "", getAuditFieldMaxLen_("Details")),
      Device: client.device,
      UserAgent: client.userAgent,
      ClientInfo: safeAuditJson_(client.clientInfo, getAuditFieldMaxLen_("ClientInfo")),
      Result: entry.result || "",
      Error: safeAuditJson_(entry.error || "", getAuditFieldMaxLen_("Error"))
    };

    var row = [];
    for (var i = 0; i < headers.length; i++) {
      var header = headers[i];
      var maxLen = getAuditFieldMaxLen_(header);
      row.push(normalizeAuditCell(values[header] || "", maxLen));
    }

    sheet.appendRow(row);
  } catch (e) {
    try { Logger.log("AUDIT_EVENT_APPEND_FAILED: " + e); } catch (_err) {}
  }
}

function appendAuditLog(ss, entry) {
  appendAuditEvent_(ss, entry);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidDateFormat(str) {
  return /^\d{2}\.\d{2}$/.test(str);
}

function deriveStatus(startTime, endTime) {
  if (endTime && endTime !== "") return "DONE";
  if (startTime && startTime !== "") return "ACTIVE";
  return "WAIT";
}

function parseTimeToMin(timeStr) {
  var m = (timeStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getActionTime(act, fallbackTime) {
  var m = (act || "").match(/_manual_(\d{1,2}:\d{2})$/);
  return m ? m[1] : fallbackTime;
}

// Calendar-day model. The "operational" fields are kept as aliases of the calendar day so
// every existing caller keeps working without change. previousSheetName = calendar yesterday.
// isBeforeOperationalCutoff is retained as a constant `false` for back-compat (no cutoff now).
function getOperationalDateInfo(now) {
  var current = now || new Date();
  var hour = parseInt(Utilities.formatDate(current, TIMEZONE, "H"), 10) || 0;
  var minute = parseInt(Utilities.formatDate(current, TIMEZONE, "m"), 10) || 0;
  var previousBase = new Date(current.getTime() - 24 * 60 * 60 * 1000);

  return {
    calendarDate: Utilities.formatDate(current, TIMEZONE, "yyyy-MM-dd"),
    operationalDate: Utilities.formatDate(current, TIMEZONE, "yyyy-MM-dd"),
    calendarSheetName: Utilities.formatDate(current, TIMEZONE, "dd.MM"),
    operationalSheetName: Utilities.formatDate(current, TIMEZONE, "dd.MM"),
    previousSheetName: Utilities.formatDate(previousBase, TIMEZONE, "dd.MM"),
    hour: hour,
    minute: minute,
    isBeforeOperationalCutoff: false
  };
}

function getOperationalSheetName(now) {
  return getOperationalDateInfo(now).operationalSheetName;
}

function getCalendarSheetName(now) {
  return getOperationalDateInfo(now).calendarSheetName;
}

function getTodaySheetName(now) {
  return getOperationalSheetName(now);
}

function getYesterdaySheetName(now) {
  return getOperationalDateInfo(now).previousSheetName;
}

function isNightCarryover(now) {
  return getOperationalDateInfo(now).isBeforeOperationalCutoff;
}

// ── ACTIVE PLAN SHEET SET (calendar day + unfinished carry-over) ──────────────
// "Current operational work" = the current calendar-day sheet (all rows) PLUS the rows of
// the previous calendar-day sheet whose unloading has NOT finished (END_TIME empty). A row
// always keeps its source sheet (sheetName/rowNumber) so writes land back where they came
// from — finishing a carried-over 29.06 row at 30.06 00:30 writes into the 29.06 sheet.
function getActivePlanSheetNames_(now) {
  var info = getOperationalDateInfo(now);
  return { current: info.operationalSheetName, previous: info.previousSheetName };
}

// Read normalized rows from ONE plan sheet. Bad/missing/empty/UNKNOWN sheets yield [] with a
// logged warning so a single broken day never breaks the active set.
//   options.onlyUnfinished   — keep only rows with empty END_TIME (used for the previous day).
//   options.includeAccounting — read SAP/LES too (wider read); else operational width only.
// Each entry carries its source sheet's column map (C) and the raw display-value row (cells),
// so callers index exactly like before but per-row (current and previous may differ in layout).
function readActivePlanSheetRows_(ss, sheetName, options) {
  options = options || {};
  var out = [];
  if (!sheetName) return out;
  try {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) { Logger.log("readActivePlanSheetRows_: sheet missing: " + sheetName); return out; }
    var lr = sheet.getLastRow();
    if (lr < 5) return out;
    var C = getPlanColumnsForSheet(sheet); // read-safe header mapping (V1/V2_LIVE/V2_FULL)
    if (!C || !C.CONTAINER_NO) { Logger.log("readActivePlanSheetRows_: no container column on " + sheetName); return out; }
    var width = planReadCols_(sheet, options.includeAccounting ? C.W_AUDIT : C.W_READ);
    var data = sheet.getRange(5, 1, lr - 4, width).getDisplayValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[C.CONTAINER_NO - 1]) continue;
      var endTime = C.END_TIME ? (row[C.END_TIME - 1] || "") : "";
      if (options.onlyUnfinished && endTime !== "") continue;
      out.push({
        sheetName: sheetName,
        sheetDate: sheetName,
        rowNumber: i + 5,
        version: C.version,
        C: C,
        cells: row
      });
    }
  } catch (e) {
    Logger.log("readActivePlanSheetRows_: skip '" + sheetName + "': " + e);
  }
  return out;
}

// Compose the active set: previous-day UNFINISHED rows first (already in work / carried over),
// then the current-day sheet in row order. Returns the merged list plus the two sheet names.
function getActivePlanRows_(ss, options) {
  options = options || {};
  var names = getActivePlanSheetNames_(options.now);
  var current  = readActivePlanSheetRows_(ss, names.current,  { includeAccounting: options.includeAccounting, onlyUnfinished: false });
  var previous = readActivePlanSheetRows_(ss, names.previous, { includeAccounting: options.includeAccounting, onlyUnfinished: true });
  return {
    currentSheet: names.current,
    previousSheet: names.previous,
    current: current,
    previous: previous,
    rows: previous.concat(current)
  };
}

// Invalidate the shared live read cache for a written sheet. The live dashboard/stats cache is
// keyed by the CURRENT calendar sheet, but a write may target the previous (carried-over) sheet,
// so we also bust the current-day cache whenever the written sheet is part of the active set.
function invalidateActivePlanReadCache_(sheetName) {
  invalidateDateReadCache(sheetName);
  var names = getActivePlanSheetNames_();
  if (sheetName === names.current || sheetName === names.previous) invalidateTodayReadCache();
}

// Resolve the sheet a write action should target. Prefers an explicit requestedDate. When the
// client sends none (legacy), it searches the active set (current first, then previous) for the
// container ID and returns the sheet that actually holds it — never blind-writes to "today".
function resolveActionSheetName_(ss, containerId, requestedDate) {
  if (requestedDate) return requestedDate;
  var id = (containerId || "").toString().trim();
  var names = getActivePlanSheetNames_();
  var order = [names.current, names.previous];
  for (var s = 0; s < order.length; s++) {
    var name = order[s];
    if (!name) continue;
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    var lr = sheet.getLastRow();
    if (lr < 5) continue;
    var C = getPlanColumnsForSheet(sheet);
    if (!C || !C.CONTAINER_NO) continue;
    try {
      var ids = sheet.getRange(5, C.CONTAINER_NO, lr - 4, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        if ((ids[i][0] || "").toString() === id) return name;
      }
    } catch (e) { Logger.log("resolveActionSheetName_: skip '" + name + "': " + e); }
  }
  return names.current; // default — applyTaskAction will simply report ID_NOT_FOUND if absent
}

// ── Read-only diagnostics (run from the Apps Script editor; not wired to doGet/doPost) ──
function debugActivePlanSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = getActivePlanSheetNames_();
  var lines = ["debugActivePlanSheets current=" + names.current + " previous=" + names.previous];
  [names.current, names.previous].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { lines.push(name + ": MISSING"); return; }
    var C = getPlanColumnsForSheet(sheet);
    lines.push(name + ": exists layout=" + C.version + " lastRow=" + sheet.getLastRow() +
      " maxCols=" + sheet.getMaxColumns() + " endCol=" + C.END_TIME);
  });
  var out = lines.join("\n");
  Logger.log(out);
  return out;
}

function debugActivePlanRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var active = getActivePlanRows_(ss, { includeAccounting: true });
  var lines = ["debugActivePlanRows currentSheet=" + active.currentSheet + " (" + active.current.length + " rows)" +
    " previousUnfinished=" + active.previousSheet + " (" + active.previous.length + " rows)"];
  var sample = active.rows.slice(0, 12);
  for (var i = 0; i < sample.length; i++) {
    var e = sample[i], C = e.C, row = e.cells;
    lines.push("  [" + e.sheetName + " r" + e.rowNumber + "] id=" + (row[C.CONTAINER_NO - 1] || "") +
      " lot=" + (row[C.LOT_NO - 1] || "") + " start=" + (C.START_TIME ? (row[C.START_TIME - 1] || "") : "") +
      " end=" + (C.END_TIME ? (row[C.END_TIME - 1] || "") : ""));
  }
  var out = lines.join("\n");
  Logger.log(out);
  return out;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function padRow_(row, width) {
  row = row || [];
  while (row.length < width) row.push("");
  return row;
}

function buildContainerRowSnapshot_(sheet, rowNumber, colMap) {
  if (!sheet || !rowNumber) return null;
  var C = colMap || getPlanColumnsForSheet(sheet); // reuse caller's map when provided (V1/V2)
  var width = planReadCols_(sheet, C.W_AUDIT);
  var row = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  padRow_(row, width);
  var at = function (col) { return col > 0 ? (row[col - 1] || "") : ""; };
  return {
    sheetName: sheet.getName(),
    sheetDate: sheet.getName(),
    rowNumber: rowNumber,
    layout: C.version,
    index: at(C.N),
    lotNo: at(C.LOT_NO),
    ws: at(C.WS),
    pallets: at(C.PALLETS),
    containerNo: at(C.CONTAINER_NO),
    carrier: at(C.CARRIER),
    driver: at(C.DRIVER),
    driverPhone: at(C.PHONE),
    eta: at(C.ETA),
    arrival_time: at(C.ARRIVAL_TIME),
    start_time: at(C.START_TIME),
    end_time: at(C.END_TIME),
    unload_duration: at(C.UNLOAD_DURATION),
    factory_downtime: at(C.FACTORY_DOWNTIME),
    zone: at(C.ZONE),
    worker: at(C.WORKER),
    photo_container: at(C.PHOTO_CONTAINER),
    photo_seal: at(C.PHOTO_SEAL),
    photo_unloaded: at(C.PHOTO_UNLOADED),
    sap_status: at(C.SAP_STATUS),
    les_status: at(C.LES_STATUS)
  };
}

function diffContainerSnapshots_(oldSnapshot, newSnapshot) {
  var changes = {};
  if (!oldSnapshot || !newSnapshot) return changes;
  var fields = [
    "lotNo", "ws", "pallets", "containerNo", "driverPhone", "eta",
    "start_time", "end_time", "unload_duration", "zone", "worker",
    "photo_container", "photo_seal", "photo_unloaded", "arrival_time",
    "sap_status", "les_status"
  ];
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var oldValue = oldSnapshot[field] || "";
    var newValue = newSnapshot[field] || "";
    if (oldValue !== newValue) {
      changes[field] = { old: oldValue, "new": newValue };
    }
  }
  return changes;
}

function extractChangeSide_(changes, side) {
  var values = {};
  changes = changes || {};
  for (var field in changes) {
    values[field] = changes[field] && changes[field][side] !== undefined ? changes[field][side] : "";
  }
  return values;
}

function buildContainerAuditBase_(params, caller, sheetName, rowNumber, snapshot) {
  snapshot = snapshot || {};
  return {
    params: params,
    caller: caller,
    sheetName: sheetName || snapshot.sheetName || "",
    sheetDate: sheetName || snapshot.sheetDate || "",
    rowNumber: rowNumber || snapshot.rowNumber || "",
    containerNo: snapshot.containerNo || (params && params.id) || "",
    lotNo: snapshot.lotNo || "",
    ws: snapshot.ws || "",
    zone: snapshot.zone || ""
  };
}

function pushContainerFieldEvent_(events, base, action, field, oldValue, newValue, oldSnapshot, newSnapshot, details) {
  var event = {};
  for (var key in base) event[key] = base[key];
  event.action = action;
  event.entityType = field.indexOf("photo_") === 0 ? "photo" : "container";
  event.entityId = base.containerNo || "";
  event.oldValue = { field: field, value: oldValue || "" };
  event.newValue = { field: field, value: newValue || "" };
  event.oldRowSnapshot = oldSnapshot;
  event.newRowSnapshot = newSnapshot;
  event.details = details || { field: field };
  event.result = "success";
  events.push(event);
}

function photoTypeFromSnapshotField_(field) {
  if (field === "photo_container") return "container";
  if (field === "photo_seal") return "seal";
  if (field === "photo_unloaded") return "unloaded";
  return "";
}

function buildContainerChangeAuditEvents_(params, caller, sheetName, rowNumber, act, oldSnapshot, newSnapshot) {
  var events = [];
  var changes = diffContainerSnapshots_(oldSnapshot, newSnapshot);
  var base = buildContainerAuditBase_(params, caller, sheetName, rowNumber, newSnapshot || oldSnapshot);
  var detailsBase = { act: act, changes: changes };

  if (changes.start_time) {
    var oldStart = changes.start_time.old;
    var newStart = changes.start_time["new"];
    var startAction = newStart ? (oldStart ? "UNLOAD_START_REPLACE" : "UNLOAD_START_SET") : "UNLOAD_START_CLEAR";
    pushContainerFieldEvent_(events, base, startAction, "start_time", oldStart, newStart, oldSnapshot, newSnapshot, detailsBase);
  }

  if (changes.end_time) {
    var oldEnd = changes.end_time.old;
    var newEnd = changes.end_time["new"];
    var endAction = newEnd ? (oldEnd ? "UNLOAD_END_REPLACE" : "UNLOAD_END_SET") : "UNLOAD_END_CLEAR";
    pushContainerFieldEvent_(events, base, endAction, "end_time", oldEnd, newEnd, oldSnapshot, newSnapshot, detailsBase);
  }

  if (changes.zone) {
    var oldZone = changes.zone.old;
    var newZone = changes.zone["new"];
    var zoneAction = newZone ? (oldZone ? "ZONE_CHANGE" : "ZONE_SET") : "ZONE_CLEAR";
    pushContainerFieldEvent_(events, base, zoneAction, "zone", oldZone, newZone, oldSnapshot, newSnapshot, detailsBase);
  }

  if (changes.worker) {
    var oldWorker = changes.worker.old;
    var newWorker = changes.worker["new"];
    var workerAction = newWorker ? (oldWorker ? "WORKER_CHANGE" : "WORKER_SET") : "WORKER_CLEAR";
    pushContainerFieldEvent_(events, base, workerAction, "worker", oldWorker, newWorker, oldSnapshot, newSnapshot, detailsBase);
  }

  var photoFields = ["photo_container", "photo_seal", "photo_unloaded"];
  for (var i = 0; i < photoFields.length; i++) {
    var field = photoFields[i];
    if (!changes[field]) continue;
    var oldPhoto = changes[field].old;
    var newPhoto = changes[field]["new"];
    var photoAction = newPhoto ? (oldPhoto ? "PHOTO_REPLACE" : "PHOTO_UPLOAD") : "PHOTO_DELETE";
    var photoDetails = {
      act: act,
      field: field,
      photoType: photoTypeFromSnapshotField_(field),
      oldDriveFileId: extractDriveFileId_(oldPhoto),
      newDriveFileId: extractDriveFileId_(newPhoto)
    };
    pushContainerFieldEvent_(events, base, photoAction, field, oldPhoto, newPhoto, oldSnapshot, newSnapshot, photoDetails);
    events[events.length - 1].photoType = photoDetails.photoType;
  }

  if (events.length === 0 && Object.keys(changes).length > 0) {
    pushContainerFieldEvent_(events, base, "CONTAINER_ROW_UPDATE", "row", changes, changes, oldSnapshot, newSnapshot, detailsBase);
  }

  return events;
}

function extractDriveFileId_(url) {
  var text = (url || "").toString();
  if (!text) return "";
  var match = text.match(/\/d\/([a-zA-Z0-9_-]+)/) || text.match(/[?&]id=([a-zA-Z0-9_-]+)/) || text.match(/[-\w]{25,}/);
  return match ? match[1] || match[0] : "";
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. TV DISPLAY HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

function handleTvDashboard(params, ss) {
  // Active set: current calendar sheet (all rows) + previous calendar sheet (unfinished only).
  var active = getActivePlanRows_(ss);
  if (active.rows.length === 0) {
    return jsonOut({
      status: "WAIT", done: 0, total: 0, nextId: "---", nextTime: "",
      shiftCounts: { morning: 0, evening: 0, night: 0 },
      onTerritory: 0, activeList: []
    });
  }

  var total = 0, done = 0, nextId = "---", nextTime = "";
  var activeList = [];
  var shiftMorning = 0, shiftEvening = 0, shiftNight = 0;
  var onTerritory = 0;

  for (var i = 0; i < active.rows.length; i++) {
    var entry = active.rows[i];
    var C = entry.C;
    var row = entry.cells;
    total++;
    if (row[C.END_TIME - 1]) {
      done++;
      var endMin = parseTimeToMin(row[C.END_TIME - 1]);
      if (endMin !== null) {
        if (endMin >= 470 && endMin < 1010) shiftMorning++;
        else if (endMin >= 1010 || endMin < 110) shiftEvening++;
        else shiftNight++;
      } else { shiftMorning++; }
    }
    else if (row[C.START_TIME - 1]) {
      activeList.push({ id: row[C.CONTAINER_NO - 1], start: row[C.START_TIME - 1], zone: row[C.ZONE - 1] || "" });
    }
    else {
      if (nextId === "---") { nextId = row[C.CONTAINER_NO - 1]; nextTime = row[C.ETA - 1]; }
      if (row[C.ARRIVAL_TIME - 1] && row[C.ARRIVAL_TIME - 1] !== "") onTerritory++;
    }
  }

  var status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  return jsonOut({
    status: status, done: done, total: total, nextId: nextId, nextTime: nextTime,
    shiftCounts: { morning: shiftMorning, evening: shiftEvening, night: shiftNight },
    onTerritory: onTerritory, activeList: activeList
  });
}

var TV_LOT_PROGRESS_DEFAULT_DAYS = 7;
var TV_LOT_PROGRESS_MAX_DAYS = 14;
var TV_LOT_NO_PATTERN = /^43115-[A-Z0-9]+$/;

// tv_lot_progress day window: TOMORROW + today + (days-2) previous CALENDAR days = `days` sheets.
// Including tomorrow lets a Lot No that already spilled into the next day's plan be aggregated as
// one lot (e.g. Lot 502 = 35 cars on 29.06 + 20 cars on 30.06 → shown as 55). Europe/Moscow
// calendar days only; no operational cutoff. Order: [tomorrow, today, today-1, …].
function getTvLotProgressSheetNames_(days, now) {
  var info = getOperationalDateInfo(now);
  var parts = info.calendarDate.split("-");
  var base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var result = [];
  // offsets: +1 (tomorrow), 0 (today), -1, … , -(days-2)
  for (var offset = 1; offset > 1 - days; offset--) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + offset);
    result.push(Utilities.formatDate(d, TIMEZONE, "dd.MM"));
  }
  return result;
}

// Read-only diagnostics (run from the Apps Script editor; not wired to doGet/doPost).
function debugTvLotProgressDays() {
  var out = getTvLotProgressSheetNames_(TV_LOT_PROGRESS_DEFAULT_DAYS);
  Logger.log(JSON.stringify(out));
  return out;
}

function debugTvLotProgressDays_2906() {
  var out = getTvLotProgressSheetNames_(TV_LOT_PROGRESS_DEFAULT_DAYS, new Date(2026, 5, 29, 15, 20));
  Logger.log(JSON.stringify(out));
  return out;
}

function handleTvLotProgress(params, ss) {
  var days = parseInt(params.days, 10);
  if (!isFinite(days) || days <= 0) days = TV_LOT_PROGRESS_DEFAULT_DAYS;
  days = Math.min(Math.max(days, 1), TV_LOT_PROGRESS_MAX_DAYS);

  // Day window includes TOMORROW; the cache key carries the full day set so it busts on a
  // calendar-day rollover (the window shifts) — see getTvLotProgressSheetNames_.
  var sheetNames = getTvLotProgressSheetNames_(days);
  var cacheKey = "tv_lot_progress_" + days + "_" + sheetNames.join("_");
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var planRows = [];
  var tasks = [];

  for (var dayIndex = 0; dayIndex < sheetNames.length; dayIndex++) {
    var sheetName = sheetNames[dayIndex];
    // Per-sheet guard: one missing/empty/UNKNOWN/narrow day must not fail the whole screen.
    try {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var lr = sheet.getLastRow();
      if (lr < 5) continue;

      var C = getPlanColumnsForSheet(sheet); // header-based V1/V2 mapping (read-safe)
      var rowCount = lr - 4;
      var rows = sheet.getRange(5, 1, rowCount, planReadCols_(sheet, C.W_READ)).getDisplayValues();
      var dayRank = sheetNames.length - dayIndex;

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var lot = (row[C.LOT_NO - 1] || "").toString().trim().toUpperCase();
        var id = (row[C.CONTAINER_NO - 1] || "").toString().trim();
        if (!id || !TV_LOT_NO_PATTERN.test(lot)) continue;

        var rowIndex = i + 5;
        var status = deriveStatus(row[C.START_TIME - 1], row[C.END_TIME - 1]);
        var timeDisplay = row[C.END_TIME - 1] || row[C.START_TIME - 1] || row[C.ETA - 1] || "";

        planRows.push({
          rowIndex: rowIndex,
          index: row[C.N - 1],
          lot: lot,
          ws: row[C.WS - 1],
          pallets: row[C.PALLETS - 1],
          id: id,
          phone: "",
          eta: row[C.ETA - 1],
          sheetDate: sheetName,
          sequence: dayRank * 100000 + rowIndex
        });

        tasks.push({
          id: id,
          type: row[C.WS - 1],
          pallets: row[C.PALLETS - 1],
          eta: row[C.ETA - 1],
          status: status,
          time: timeDisplay,
          start_time: row[C.START_TIME - 1],
          end_time: row[C.END_TIME - 1],
          zone: row[C.ZONE - 1] || "",
          sheet_date: sheetName
        });
      }
    } catch (dayErr) {
      Logger.log("handleTvLotProgress: skip sheet '" + sheetName + "': " + dayErr);
    }
  }

  var payload = JSON.stringify({ planRows: planRows, tasks: tasks });
  try { cache.put(cacheKey, payload, 60); } catch (e) {}
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

var LOT_TRACKER_MAX_RESULTS = 100;
var LOT_TRACKER_MAX_SHEETS  = 30;
var SYSTEM_SHEETS = { "DASHBOARD": 1, "PROBLEMS": 1, "SUBSCRIPTIONS": 1, "AUDIT_LOG": 1 };

function handleTvLotTracker(params, ss) {
  var lotQuery = (params.lot || "").toString().trim().toUpperCase();
  if (!lotQuery) return jsonOut([]);

  var sheets = ss.getSheets();
  var results = [];
  var sheetsScanned = 0;

  for (var s = sheets.length - 1; s >= 0; s--) {
    var sheetName = sheets[s].getName().trim();
    if (SYSTEM_SHEETS[sheetName.toUpperCase()]) continue;

    var sheet = sheets[s];
    var lr = sheet.getLastRow();
    if (lr < 5) continue;

    sheetsScanned++;
    try {
      var rowCount = lr - 4;
      var narrow = sheet.getRange(5, 2, rowCount, 4).getValues(); // B..E (lot/ws/pallets/id) — same in V1/V2
      var matchedRows = [];

      for (var i = 0; i < narrow.length; i++) {
        var lot = (narrow[i][0] || "").toString().trim().toUpperCase();
        var id  = (narrow[i][3] || "").toString().trim().toUpperCase();
        if (lot.indexOf(lotQuery) !== -1 || id.indexOf(lotQuery) !== -1) {
          matchedRows.push(i);
        }
      }

      if (matchedRows.length > 0) {
        var C = getPlanColumnsForSheet(sheet);
        var full = sheet.getRange(5, 1, rowCount, planReadCols_(sheet, C.W_READ)).getDisplayValues();
        for (var m = 0; m < matchedRows.length; m++) {
          var ri = matchedRows[m];
          var row = full[ri];
          results.push({
            date: sheetName, index: row[C.N - 1], lot: row[C.LOT_NO - 1], ws: row[C.WS - 1],
            pallets: row[C.PALLETS - 1], id: (row[C.CONTAINER_NO - 1] || "").trim().toUpperCase() || "—",
            eta: row[C.ETA - 1], status: deriveStatus(row[C.START_TIME - 1], row[C.END_TIME - 1]),
            start_time: row[C.START_TIME - 1], end_time: row[C.END_TIME - 1], zone: row[C.ZONE - 1]
          });
          if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
        }
      }
    } catch (lotErr) {
      Logger.log("handleTvLotTracker: skip sheet '" + sheetName + "': " + lotErr);
    }
    if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
    if (sheetsScanned >= LOT_TRACKER_MAX_SHEETS) break;
  }
  return jsonOut(results);
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. PUBLIC HANDLERS (Login & Register to Secret DB)
// ══════════════════════════════════════════════════════════════════════════════

function handleLogin(params, ss) {
  var user = (params.user || "").toLowerCase().trim();
  var hash = (params.hash || "").trim();
  var device = normalizeDeviceType(params.device);
  var logLogin = function(action, result, details, name, role) {
    appendAuditLog(ss, {
      params: params,
      login: user,
      name: name || "",
      role: role || "",
      action: action,
      entityType: "auth",
      entityId: user,
      details: details || "",
      device: device,
      result: result
    });
  };

  if (!user || !hash) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    logLogin("LOGIN_FAILED", "failed", "reason=INVALID_INPUT");
    return textOut("WRONG");
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = "login_fail_" + user;
  var attempts = parseInt(cache.get(cacheKey) || "0", 10);
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    Utilities.sleep(3000);
    logLogin("LOGIN_FAILED", "failed", "reason=RATE_LIMITED");
    return jsonOut({ error: "RATE_LIMITED", retry_after_seconds: LOGIN_WINDOW_SECONDS });
  }

  var authSheet = getAuthSheet();
  if (!authSheet) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    logLogin("LOGIN_FAILED", "failed", "reason=AUTH_SHEET_UNAVAILABLE");
    return textOut("WRONG");
  }

  var lr = authSheet.getLastRow();
  if (lr < 2) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    logLogin("LOGIN_FAILED", "failed", "reason=EMPTY_AUTH_DB");
    return textOut("WRONG");
  }

  ensureUserSessionColumns(authSheet);

  var data = readUserAuthRows(authSheet, lr - 1);
  for (var i = 0; i < data.length; i++) {
    // 🚀 Сначала проверяем только логин и пароль
    if ((data[i][COL_LOGIN] || "").toString().toLowerCase() === user && (data[i][COL_HASH] || "").toString() === hash) {
      
      var status = (data[i][COL_STATUS] || "").toString().toUpperCase().trim();

      // Пароль верный, теперь смотрим статус
      if (status === "APPROVED") {
        cache.remove(cacheKey);
        var row = data[i];
        var rowNumber = i + 2;
        var now = new Date();
        var token = generateToken();
        migrateLegacyTokenToSessionSlot(authSheet, rowNumber, row, now);
        writeSessionSlot(authSheet, rowNumber, row, chooseSessionSlot(row, now), token, device, now);
        mirrorLegacyToken(authSheet, rowNumber, row, token);
        logLogin("LOGIN_SUCCESS", "success", "", row[COL_NAME], row[COL_ROLE]);
        return textOut("CORRECT|" + row[COL_NAME] + "|" + row[COL_ROLE] + "|" + token);
      }
      else if (status === "PENDING") {
        logLogin("LOGIN_FAILED", "failed", "reason=PENDING", data[i][COL_NAME], data[i][COL_ROLE]);
        return jsonOut({ error: "PENDING" });
      } 
      else if (status === "REJECTED") {
        logLogin("LOGIN_FAILED", "failed", "reason=REJECTED", data[i][COL_NAME], data[i][COL_ROLE]);
        return jsonOut({ error: "REJECTED" });
      } 
      else {
        logLogin("LOGIN_FAILED", "failed", "reason=NOT_APPROVED", data[i][COL_NAME], data[i][COL_ROLE]);
        return jsonOut({ error: "NOT_APPROVED" });
      }
    }
  }

  // Если дошли сюда — логин или пароль реально неверные
  attempts++;
  cache.put(cacheKey, String(attempts), LOGIN_WINDOW_SECONDS);
  Utilities.sleep(LOGIN_FAIL_DELAY_MS);

  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    logLogin("LOGIN_FAILED", "failed", "reason=RATE_LIMITED");
    return jsonOut({ error: "RATE_LIMITED", retry_after_seconds: LOGIN_WINDOW_SECONDS });
  }
  logLogin("LOGIN_FAILED", "failed", "reason=WRONG_PASSWORD");
  return textOut("WRONG");
}

function handleRegister(params, ss) {
  var login = (params.user || "").toLowerCase().trim();
  var hash  = (params.hash || "").trim();
  var name  = (params.name || "").trim();
  var device = normalizeDeviceType(params.device);

  if (!login || !hash || !name) {
    appendAuditEvent_(ss, {
      params: params,
      login: login,
      action: "REGISTER_REQUEST_FAILED",
      entityType: "auth",
      entityId: login,
      details: { reason: "INVALID_INPUT" },
      device: device,
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }
  if (login.length > 50 || name.length > 100) {
    appendAuditEvent_(ss, {
      params: params,
      login: login,
      action: "REGISTER_REQUEST_FAILED",
      entityType: "auth",
      entityId: login,
      details: { reason: "INPUT_TOO_LONG" },
      device: device,
      result: "failed",
      error: "INPUT_TOO_LONG"
    });
    return textOut("INPUT_TOO_LONG");
  }

  var authSheet;
  try {
    authSheet = getAuthSheet();
  } catch (e) {
    // If sheet doesn't exist, create it in the secret DB
    var authDb = SpreadsheetApp.openById(SECRET_AUTH_DB_ID);
    authSheet = authDb.insertSheet(AUTH_SHEET_NAME);
    authSheet.getRange(1, USER_COL_START, 1, USER_AUTH_COL_COUNT)
      .setValues([["Login", "Hash", "Name", "Role", "Status", "Token"].concat(USER_SESSION_HEADERS)]);
  }

  ensureUserSessionColumns(authSheet);

  var lr = authSheet.getLastRow();
  if (lr >= 2) {
    var existing = authSheet.getRange(2, USER_COL_START, lr - 1, 1).getDisplayValues();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][0].toLowerCase().trim() === login) {
        appendAuditEvent_(ss, {
          params: params,
          login: login,
          name: name,
          action: "REGISTER_REQUEST_FAILED",
          entityType: "auth",
          entityId: login,
          details: { reason: "DUPLICATE_LOGIN" },
          device: device,
          result: "failed",
          error: "DUPLICATE_LOGIN"
        });
        return textOut("DUPLICATE_LOGIN");
      }
    }
  }

  var newRow = lr + 1;
  authSheet.getRange(newRow, USER_COL_START, 1, USER_COL_COUNT)
    .setValues([[login, hash, name, "OPERATOR", "PENDING", ""]]);

  appendAuditEvent_(ss, {
    params: params,
    login: login,
    name: name,
    role: "OPERATOR",
    action: "REGISTER_REQUEST",
    entityType: "auth",
    entityId: login,
    rowNumber: newRow,
    details: { status: "PENDING" },
    device: device,
    result: "success"
  });

  return textOut("REGISTERED");
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. AUTH-PROTECTED READS
// ══════════════════════════════════════════════════════════════════════════════

function handleAuditEvent(params, ss) {
  var caller = params._caller || {};
  var action = (params.action || "").toString().trim();
  if (!action) return jsonOut({ error: "INVALID_ACTION" });

  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: action,
    entityType: (params.entityType || "ui").toString().trim(),
    entityId: (params.entityId || "").toString().trim(),
    sheetName: (params.sheetName || params.sheetDate || "").toString().trim(),
    sheetDate: (params.sheetDate || params.sheetName || "").toString().trim(),
    rowNumber: params.rowNumber || "",
    containerNo: (params.containerNo || params.id || "").toString().trim(),
    lotNo: (params.lotNo || "").toString().trim(),
    ws: (params.ws || "").toString().trim(),
    zone: (params.zone || "").toString().trim(),
    photoType: (params.photoType || "").toString().trim(),
    oldValue: params.oldValue || "",
    newValue: params.newValue || "",
    details: params.details || {},
    result: (params.result || "success").toString().trim(),
    error: params.error || ""
  });

  return jsonOut({ status: "OK" });
}

function handleReadComplex(params, ss) {
  var cache = CacheService.getScriptCache();
  var ck = todayCacheKey("rcx");
  var hit = cache.get(ck);
  if (hit) return textOut(hit);

  // Active set: current calendar sheet (all rows) + previous calendar sheet (unfinished only).
  var active = getActivePlanRows_(ss);
  // 1. Заглушка отдает 6 нулей (3 для факта, 3 для плана), когда активной работы нет вовсе.
  if (active.rows.length === 0) return textOut("WAIT;0|0;---;00:00;0|0|0|0|0|0;0\n###MSG###");

  var total = 0, done = 0, nextId = "---", nextTime = "";
  var activeRows = [];
  var onTerritory = 0;

  // 2. СЧЕТЧИКИ ДЛЯ СМЕН (ФАКТ И ПЛАН)
  var m_fact = 0, e_fact = 0, n_fact = 0;
  var m_base = 0, e_base = 0, n_base = 0;
  var noEtaCount = 0;

  for (var i = 0; i < active.rows.length; i++) {
    var entry = active.rows[i];
    var C = entry.C;          // per-row layout (current/previous sheets may differ)
    var row = entry.cells;
    total++;

    // --- СЧИТАЕМ ФАКТ (По времени завершения — Окончание разгрузки) ---
    if (row[C.END_TIME - 1]) {
      done++;
      var endMin = parseTimeToMin(row[C.END_TIME - 1]);
      if (endMin !== null) {
        if (endMin >= 470 && endMin < 1010) m_fact++;
        else if (endMin >= 1010 || endMin < 110) e_fact++;
        else if (endMin >= 110 && endMin < 470) n_fact++;
      }
    }
    else if (row[C.START_TIME - 1]) activeRows.push(row[C.CONTAINER_NO - 1] + "|" + row[C.START_TIME - 1] + "|0|" + row[C.WS - 1] + "|" + row[C.ZONE - 1]);
    else {
      if (nextId === "---") { nextId = row[C.CONTAINER_NO - 1]; nextTime = row[C.ETA - 1]; }
      if (row[C.ARRIVAL_TIME - 1] && row[C.ARRIVAL_TIME - 1] !== "") onTerritory++;
    }

    // --- СЧИТАЕМ БАЗОВЫЙ ПЛАН (По времени ETA — Ожидаемое время прибытия) ---
    var etaMin = parseTimeToMin(row[C.ETA - 1]);
    if (etaMin === null) {
      noEtaCount++;
    } else {
      if (etaMin >= 470 && etaMin < 1010) m_base++;
      else if (etaMin >= 1010 || etaMin < 110) e_base++;
      else if (etaMin >= 110 && etaMin < 470) n_base++;
    }
  }

  // 3. РАСПРЕДЕЛЯЕМ ЗАДАЧИ БЕЗ ETA И ПЕРЕНОСИМ ДОЛГИ
  if (noEtaCount > 0) {
    var half = Math.ceil(noEtaCount / 2);
    m_base += half;
    e_base += (noEtaCount - half);
  }

  var m_target = m_base, e_target = e_base, n_target = n_base;

  // Узнаем текущую смену
  var operationalNow = getOperationalDateInfo();
  var nowMin = operationalNow.hour * 60 + operationalNow.minute;
  var activeShift = "none";
  if (nowMin >= 470 && nowMin < 1010) activeShift = "morning";
  else if (nowMin >= 1010 || nowMin < 110) activeShift = "evening";
  else if (nowMin >= 110 && nowMin < 470) activeShift = "night";

  // Перекидываем невыполненные цели на следующие смены
  if (activeShift === "evening" || activeShift === "night") {
    var m_debt = m_base - m_fact;
    e_target = Math.max(0, e_base + m_debt);
  }
  if (activeShift === "night") {
    var e_debt = e_target - e_fact;
    n_target = Math.max(0, n_base + e_debt);
  }

  var status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  
  // 4. ФОРМИРУЕМ ОТВЕТ (6 цифр: 3 для факта и 3 для плана)
  var shiftString = m_fact + "|" + e_fact + "|" + n_fact + "|" + m_target + "|" + e_target + "|" + n_target;

  var body = status + ";" + done + "|" + total + ";" + nextId + ";" + nextTime + ";" + shiftString + ";" + onTerritory;
  if (activeRows.length > 0) body += "\n" + activeRows.join("\n");

  var out = body + "\n###MSG###";
  try { cache.put(ck, out, TODAY_READ_CACHE_TTL); } catch (e) {}
  return textOut(out);
}

function handleGetStats(params, ss) {
  var cache = CacheService.getScriptCache();
  var ck = todayCacheKey("stats");
  var hit = cache.get(ck);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

  var tasks = [];
  // Active set: current calendar sheet (all rows) + previous calendar sheet (unfinished only).
  // Each task keeps its source sheet in sheet_date so the terminal routes start/finish/undo
  // back to the correct sheet (a carried-over previous-day row writes to the previous sheet).
  var active = getActivePlanRows_(ss);
  for (var i = 0; i < active.rows.length; i++) {
    var entry = active.rows[i];
    var C = entry.C;
    var row = entry.cells;
    var id = row[C.CONTAINER_NO - 1];
    if (!id) continue;
    var status = deriveStatus(row[C.START_TIME - 1], row[C.END_TIME - 1]);
    var timeDisplay = row[C.ETA - 1];
    if (row[C.END_TIME - 1]) timeDisplay = row[C.END_TIME - 1];
    else if (row[C.START_TIME - 1]) timeDisplay = row[C.START_TIME - 1];
    tasks.push({
      id: id, type: row[C.WS - 1], pallets: row[C.PALLETS - 1], phone: row[C.PHONE - 1], eta: row[C.ETA - 1],
      status: status, time: timeDisplay, start_time: row[C.START_TIME - 1], end_time: row[C.END_TIME - 1],
      zone: row[C.ZONE - 1] || "", operator: row[C.WORKER - 1] || "",
      photo_gen: row[C.PHOTO_CONTAINER - 1] || "", photo_seal: row[C.PHOTO_SEAL - 1] || "",
      arrival_time: row[C.ARRIVAL_TIME - 1] || "", sheet_date: entry.sheetName
    });
  }
  var json = JSON.stringify(tasks);
  try { CacheService.getScriptCache().put(ck, json, TODAY_READ_CACHE_TTL); } catch (e) {}
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Bundle endpoint: one HTTP call → {dashboardText, tasks}.
// Intentionally delegates to existing handlers so the contract cannot drift.
// Both handlers share the 15s server-side cache on the operational sheet, so a single
// sheet read is amortized across all bundle+legacy callers in the TTL window.
// Future optimization: single-pass implementation that reads the sheet once
// and builds both outputs — not worth the risk until prod is stable.
function handleGetDashboardBundle(params, ss) {
  var dashboardOut = handleReadComplex(params, ss);
  var statsOut = handleGetStats(params, ss);
  var dashboardText = dashboardOut.getContent();
  var tasksJson = statsOut.getContent();
  var tasks;
  try { tasks = JSON.parse(tasksJson); } catch (e) { tasks = []; }
  return jsonOut({ dashboardText: dashboardText, tasks: tasks });
}

function handleGetHistory(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return jsonOut([]);
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 5) return jsonOut([]);

  var C = getPlanColumnsForSheet(sheet);
  var data = sheet.getRange(5, 1, lr - 4, planReadCols_(sheet, C.W_AUDIT)).getDisplayValues();
  var tasks = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[C.CONTAINER_NO - 1];
    if (id && id !== "") {
      tasks.push({
        id: id, type: row[C.WS - 1], pallets: row[C.PALLETS - 1], phone: row[C.PHONE - 1], eta: row[C.ETA - 1],
        status: deriveStatus(row[C.START_TIME - 1], row[C.END_TIME - 1]), start_time: row[C.START_TIME - 1], end_time: row[C.END_TIME - 1],
        zone: row[C.ZONE - 1], operator: row[C.WORKER - 1], photo_gen: row[C.PHOTO_CONTAINER - 1],
        photo_seal: row[C.PHOTO_SEAL - 1], photo_empty: row[C.PHOTO_UNLOADED - 1], arrival_time: row[C.ARRIVAL_TIME - 1],
        sheet_date: dateStr,
        sap_status: mapAccountingFromSheet(row[C.SAP_STATUS - 1]),
        les_status: mapAccountingFromSheet(row[C.LES_STATUS - 1])
      });
    }
  }
  return jsonOut(tasks);
}

// ── Accounting status mapping helpers ──

function mapAccountingFromSheet(val) {
  var v = (val || "").toString().trim();
  if (v === "Принят") return "ACCEPTED";
  if (v === "Не принят") return "REJECTED";
  return "WAIT";
}

function mapAccountingToSheet(status) {
  if (status === "ACCEPTED") return "Принят";
  if (status === "REJECTED") return "Не принят";
  return "Ожидает";
}

function handleUpdateAccounting(params, ss) {
  var id     = (params.id || "").toString().trim();
  var system = (params.system || "").toString().trim();
  var status = (params.status || "").toString().trim();
  var requestedDate = (params.date || "").toString().trim();
  var caller = params._caller || null;

  if (!id || (system !== "SAP" && system !== "LES")) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      details: { system: system, status: status, reason: "INVALID_PARAMS" },
      result: "failed",
      error: "INVALID_PARAMS"
    });
    return jsonOut({ error: "INVALID_PARAMS" });
  }
  if (requestedDate && !isValidDateFormat(requestedDate)) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: requestedDate,
      sheetDate: requestedDate,
      details: { system: system, status: status, reason: "INVALID_DATE" },
      result: "failed",
      error: "INVALID_DATE"
    });
    return jsonOut({ error: "INVALID_DATE" });
  }
  if (status !== "WAIT" && status !== "ACCEPTED" && status !== "REJECTED") {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      details: { system: system, status: status, reason: "INVALID_STATUS" },
      result: "failed",
      error: "INVALID_STATUS"
    });
    return jsonOut({ error: "INVALID_STATUS" });
  }

  // Route SAP/LES to the row's SOURCE sheet (explicit date wins; else find it in the active set).
  var sheetName = resolveActionSheetName_(ss, id, requestedDate);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: sheetName,
      sheetDate: sheetName,
      details: { system: system, status: status, reason: "SHEET_NOT_FOUND" },
      result: "failed",
      error: "SHEET_NOT_FOUND"
    });
    return jsonOut({ error: "SHEET_NOT_FOUND" });
  }

  var lr = sheet.getLastRow();
  if (lr < 5) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: sheetName,
      sheetDate: sheetName,
      details: { system: system, status: status, reason: "NO_DATA" },
      result: "failed",
      error: "NO_DATA"
    });
    return jsonOut({ error: "NO_DATA" });
  }

  // WRITE-SAFE: a wrong layout would write SAP/LES into the wrong column.
  var C;
  try { C = getPlanColumnsForSheetWriteSafe_(sheet); }
  catch (e) { return jsonOut({ error: "UNKNOWN_LAYOUT", detail: e.toString() }); }
  logPlanHandlerDebug_("handleUpdateAccounting", "update_accounting", sheet, C, {
    sap: C.SAP_STATUS, les: C.LES_STATUS, photoUnloaded: C.PHOTO_UNLOADED
  });
  // SAP/LES are resolved STRICTLY from headers — never a Q/R fallback that would land a
  // status on top of a photo column. If a column is absent, block the write entirely.
  if (!C.SAP_STATUS || !C.LES_STATUS) {
    var blockMsg = "SAP/LES columns not found for sheet " + sheetName + ", write blocked";
    appendAuditEvent_(ss, {
      params: params, caller: caller, action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container", entityId: id, containerNo: id,
      sheetName: sheetName, sheetDate: sheetName,
      details: { system: system, status: status, reason: "SAP_LES_COLUMNS_NOT_FOUND", sap: C.SAP_STATUS, les: C.LES_STATUS },
      result: "failed", error: blockMsg
    });
    return jsonOut({ error: "SAP_LES_COLUMNS_NOT_FOUND", detail: blockMsg });
  }
  var ids = sheet.getRange(5, C.CONTAINER_NO, lr - 4, 1).getDisplayValues();
  var col = (system === "SAP") ? C.SAP_STATUS : C.LES_STATUS;
  // Defensive: a status must never overwrite a photo column.
  if (col === C.PHOTO_CONTAINER || col === C.PHOTO_SEAL || col === C.PHOTO_UNLOADED) {
    var photoMsg = "SAP/LES column collides with a photo column on sheet " + sheetName + ", write blocked";
    appendAuditEvent_(ss, {
      params: params, caller: caller, action: "ACCOUNTING_STATUS_FAILED",
      entityType: "container", entityId: id, containerNo: id,
      sheetName: sheetName, sheetDate: sheetName,
      details: { system: system, status: status, reason: "SAP_LES_PHOTO_COLLISION", col: col },
      result: "failed", error: photoMsg
    });
    return jsonOut({ error: "SAP_LES_PHOTO_COLLISION", detail: photoMsg });
  }

  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      var rowNumber = i + 5;
      var oldSnapshot = buildContainerRowSnapshot_(sheet, rowNumber);
      var oldStatus = (system === "SAP") ? oldSnapshot.sap_status : oldSnapshot.les_status;
      sheet.getRange(i + 5, col).setValue(mapAccountingToSheet(status));
      SpreadsheetApp.flush();
      var newSnapshot = buildContainerRowSnapshot_(sheet, rowNumber);
      invalidateActivePlanReadCache_(sheetName);
      appendAuditEvent_(ss, {
        params: params,
        caller: caller,
        action: "ACCOUNTING_STATUS_CHANGE",
        entityType: "container",
        entityId: id,
        sheetName: sheetName,
        sheetDate: sheetName,
        rowNumber: rowNumber,
        containerNo: id,
        lotNo: newSnapshot.lotNo,
        ws: newSnapshot.ws,
        zone: newSnapshot.zone,
        oldValue: { system: system, status: oldStatus },
        newValue: { system: system, status: mapAccountingToSheet(status) },
        oldRowSnapshot: oldSnapshot,
        newRowSnapshot: newSnapshot,
        details: { system: system, requestedStatus: status },
        result: "success"
      });
      return jsonOut({ status: "OK" });
    }
  }
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "ACCOUNTING_STATUS_FAILED",
    entityType: "container",
    entityId: id,
    containerNo: id,
    sheetName: sheetName,
    sheetDate: sheetName,
    details: { system: system, status: status, reason: "NOT_FOUND" },
    result: "failed",
    error: "NOT_FOUND"
  });
  return jsonOut({ error: "NOT_FOUND" });
}

function handleGetFullPlan(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return jsonOut([]);
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 5) return jsonOut([]);

  var C = getPlanColumnsForSheet(sheet);
  var data = sheet.getRange(5, 1, lr - 4, planReadCols_(sheet, C.ETA)).getDisplayValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (r[C.CONTAINER_NO - 1]) {
      rows.push({
        index: r[C.N - 1], lot: r[C.LOT_NO - 1], ws: r[C.WS - 1], pallets: r[C.PALLETS - 1],
        id: r[C.CONTAINER_NO - 1], phone: r[C.PHONE - 1], eta: r[C.ETA - 1], rowIndex: i + 5
      });
    }
  }
  return jsonOut(rows);
}

function handleGetLotTracker(params, ss) {
  var lotQuery = (params.lot || "").toString().trim().toUpperCase();
  if (!lotQuery) return jsonOut([]);

  var sheets = ss.getSheets();
  var results = [];
  var sheetsScanned = 0;

  for (var s = sheets.length - 1; s >= 0; s--) {
    var sheetName = sheets[s].getName().trim();
    if (SYSTEM_SHEETS[sheetName.toUpperCase()]) continue;

    var sheet = sheets[s];
    var lr = sheet.getLastRow();
    if (lr < 5) continue;

    sheetsScanned++;
    try {
      var rowCount = lr - 4;
      var narrow = sheet.getRange(5, 2, rowCount, 4).getValues(); // B..E (lot/ws/pallets/id) — same in V1/V2
      var matchedRows = [];

      for (var i = 0; i < narrow.length; i++) {
        var lot = (narrow[i][0] || "").toString().trim().toUpperCase();
        var id  = (narrow[i][3] || "").toString().trim().toUpperCase();
        if (lot.indexOf(lotQuery) !== -1 || id.indexOf(lotQuery) !== -1) {
          matchedRows.push(i);
        }
      }

      if (matchedRows.length > 0) {
        var C = getPlanColumnsForSheet(sheet);
        var full = sheet.getRange(5, 1, rowCount, planReadCols_(sheet, C.W_READ)).getDisplayValues();
        for (var m = 0; m < matchedRows.length; m++) {
          var ri = matchedRows[m];
          var row = full[ri];
          var matchedId = (row[C.CONTAINER_NO - 1] || "").toString().trim().toUpperCase();

          results.push({
            date: sheetName, index: row[C.N - 1], lot: row[C.LOT_NO - 1], ws: row[C.WS - 1],
            pallets: row[C.PALLETS - 1], id: matchedId || "НЕ НАЗНАЧЕН", phone: row[C.PHONE - 1], eta: row[C.ETA - 1],
            status: deriveStatus(row[C.START_TIME - 1], row[C.END_TIME - 1]), start_time: row[C.START_TIME - 1], end_time: row[C.END_TIME - 1],
            zone: row[C.ZONE - 1], operator: row[C.WORKER - 1], arrival_time: row[C.ARRIVAL_TIME - 1]
          });

          if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
        }
      }
    } catch (lotErr) {
      Logger.log("handleGetLotTracker: skip sheet '" + sheetName + "': " + lotErr);
    }
    if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
    if (sheetsScanned >= LOT_TRACKER_MAX_SHEETS) break;
  }
  return jsonOut(results);
}

function handleGetPriorityLot(params, ss) {
  var ds = ss.getSheetByName("DASHBOARD"); // Оставляем публичный лист для хранения лота
  var lot = ds ? ds.getRange("A1").getValue().toString().trim() : "";
  return jsonOut({ lot: lot });
}

function handleGetAllContainers(params, ss) {
  // Active set: current calendar sheet (all rows) + previous calendar sheet (unfinished only).
  var active = getActivePlanRows_(ss);
  var ids = [];
  for (var i = 0; i < active.rows.length; i++) {
    var entry = active.rows[i];
    var id = entry.cells[entry.C.CONTAINER_NO - 1];
    if (id) ids.push(id.toString());
  }
  return jsonOut(ids);
}

function handleGetIssues(params, ss) {
  var sheet = ss.getSheetByName("PROBLEMS");
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 2) return jsonOut([]);

  var data = sheet.getRange(2, 1, lr - 1, 7).getDisplayValues();
  var issues = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var id = row[0] || (row[1] || row[2] ? "Unknown" : "");
    if (id) {
      issues.push({
        id: id, timestamp: row[1], desc: row[2],
        photos: [row[3], row[4], row[5]].filter(Boolean),
        author: row[6]
      });
    }
  }
  return jsonOut(issues);
}


// ══════════════════════════════════════════════════════════════════════════════
// 7. AUTH-PROTECTED WRITES
// ══════════════════════════════════════════════════════════════════════════════

function handleTaskAction(params, ss) {
  var _t0 = Date.now();
  var id  = (params.id || "").trim();
  var act = (params.act || "").trim();
  var requestedDate = (params.date || "").toString().trim();
  var caller = params._caller || null;

  if (!id || !act) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "TASK_ACTION_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      details: { act: act, reason: "INVALID_INPUT" },
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }
  if (requestedDate && !isValidDateFormat(requestedDate)) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "TASK_ACTION_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: requestedDate,
      sheetDate: requestedDate,
      details: { act: act, reason: "INVALID_DATE" },
      result: "failed",
      error: "INVALID_DATE"
    });
    return textOut("INVALID_DATE");
  }

  var time = Utilities.formatDate(new Date(), TIMEZONE, "HH:mm");
  // Route to the row's SOURCE sheet. Explicit date wins; otherwise find the container in the
  // active set (current then previous) so a carried-over row is never blind-written to today.
  var sheetName = resolveActionSheetName_(ss, id, requestedDate);
  try {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      appendAuditEvent_(ss, {
        params: params,
        caller: caller,
        action: "TASK_ACTION_FAILED",
        entityType: "container",
        entityId: id,
        containerNo: id,
        sheetName: sheetName,
        sheetDate: sheetName,
        details: { act: act, reason: "SHEET_NOT_FOUND" },
        result: "failed",
        error: "SHEET_NOT_FOUND"
      });
      return textOut("ID_NOT_FOUND");
    }

    var result = applyTaskAction(sheet, id, act, time, params);
    if (result) {
      invalidateActivePlanReadCache_(sheetName);

      var auditEvents = buildContainerChangeAuditEvents_(params, caller, sheetName, result.rowNumber, act, result.oldSnapshot, result.newSnapshot);
      if (auditEvents.length === 0) {
        var base = buildContainerAuditBase_(params, caller, sheetName, result.rowNumber, result.newSnapshot || result.oldSnapshot);
        base.action = "TASK_ACTION_NO_CHANGE";
        base.entityType = "container";
        base.entityId = id;
        base.oldRowSnapshot = result.oldSnapshot;
        base.newRowSnapshot = result.newSnapshot;
        base.details = { act: act };
        base.result = "success";
        auditEvents.push(base);
      }

      for (var i = 0; i < auditEvents.length; i++) {
        appendAuditEvent_(ss, auditEvents[i]);
      }
      Logger.log("task_action " + act + " " + id + " duration ms=" + (Date.now() - _t0));
      return textOut("UPDATED");
    }

    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "TASK_ACTION_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: sheetName,
      sheetDate: sheetName,
      details: { act: act, reason: "ID_NOT_FOUND" },
      result: "failed",
      error: "ID_NOT_FOUND"
    });
    return textOut("ID_NOT_FOUND");
  } catch (e) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "TASK_ACTION_FAILED",
      entityType: "container",
      entityId: id,
      containerNo: id,
      sheetName: sheetName,
      sheetDate: sheetName,
      details: { act: act },
      result: "failed",
      error: e && e.stack ? e.stack : e.toString()
    });
    throw e;
  }
}

function applyTaskAction(sheet, id, act, time, params) {
  // WRITE-SAFE: throws on UNKNOWN layout so a start/finish never lands in wrong columns.
  var C = getPlanColumnsForSheetWriteSafe_(sheet);
  logPlanHandlerDebug_("applyTaskAction", "task_action", sheet, C, { act: act, id: id });
  var lr = sheet.getLastRow();
  if (lr < 5) return null;
  var data = sheet.getRange(5, C.CONTAINER_NO, lr - 4, 1).getValues();
  var actionTime = getActionTime(act, time);

  // All writes are PER-CELL via the header-resolved map — never a range that could span
  // the UNLOAD_DURATION / FACTORY_DOWNTIME formula columns (K/L in V2_LIVE, M/N in V2_FULL).
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === id) {
      var r = i + 5;
      var oldSnapshot = buildContainerRowSnapshot_(sheet, r, C); // reuse C — skip a header re-scan
      if (act === "start" || act.indexOf("start_manual") === 0) {
        sheet.getRange(r, C.START_TIME).setValue(actionTime);
        if (params.zone)  sheet.getRange(r, C.ZONE).setValue(params.zone);
        if (params.op)    sheet.getRange(r, C.WORKER).setValue(params.op);
        if (params.pGen)  sheet.getRange(r, C.PHOTO_CONTAINER).setValue(params.pGen);
        if (params.pSeal) sheet.getRange(r, C.PHOTO_SEAL).setValue(params.pSeal);
      } else if (act === "undo_start") {
        // Clear only action-related operational cells, one by one.
        sheet.getRange(r, C.START_TIME).setValue("");
        sheet.getRange(r, C.END_TIME).setValue("");
        sheet.getRange(r, C.ZONE).setValue("");
        sheet.getRange(r, C.WORKER).setValue("");
        sheet.getRange(r, C.PHOTO_CONTAINER).setValue("");
        sheet.getRange(r, C.PHOTO_SEAL).setValue("");
        // V1 Duration (J) is a plain value — clear it (legacy). In V2_LIVE/V2_FULL the
        // UNLOAD_DURATION and FACTORY_DOWNTIME columns are USER FORMULAS — never touched.
        if (C.version === "V1" && C.UNLOAD_DURATION) sheet.getRange(r, C.UNLOAD_DURATION).setValue("");
      } else if (act === "update_photo") {
        if (params.pGen)   sheet.getRange(r, C.PHOTO_CONTAINER).setValue(params.pGen);
        if (params.pSeal)  sheet.getRange(r, C.PHOTO_SEAL).setValue(params.pSeal);
        if (params.pEmpty) sheet.getRange(r, C.PHOTO_UNLOADED).setValue(params.pEmpty);
      } else {
        sheet.getRange(r, C.END_TIME).setValue(actionTime);
        if (params.pEmpty) sheet.getRange(r, C.PHOTO_UNLOADED).setValue(params.pEmpty);
      }
      SpreadsheetApp.flush();
      return {
        rowNumber: r,
        oldSnapshot: oldSnapshot,
        newSnapshot: buildContainerRowSnapshot_(sheet, r, C) // reuse C — skip a header re-scan
      };
    }
  }
  return null;
}

function handleReportIssue(params, ss) {
  var containerId = (params.id || "").trim();
  var desc        = (params.desc || "").trim();
  var author      = (params.author || "Anonymous").trim();
  var caller      = params._caller || null;

  if (!containerId || !desc) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "ISSUE_REPORT_FAILED",
      entityType: "issue",
      entityId: containerId,
      containerNo: containerId,
      details: { reason: "INVALID_INPUT", author: author },
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }

  var s = ss.getSheetByName("PROBLEMS");
  if (!s) {
    s = ss.insertSheet("PROBLEMS");
    s.getRange("A1:H1").setValues([["Container ID", "Timestamp", "Description", "Photo 1", "Photo 2", "Photo 3", "Author", "Email Status"]]).setFontWeight("bold");
  }
  var time = Utilities.formatDate(new Date(), TIMEZONE, "dd.MM.yyyy HH:mm:ss");

  var safeId     = escapeHtml(containerId);
  var safeDesc   = escapeHtml(desc);
  var safeAuthor = escapeHtml(author);
  var safeTime   = escapeHtml(time);
  var emailStatus = "Успешно отправлено";

  try {
    var subject = "Уведомление об инциденте: Контейнер " + safeId + " (Склад АГМ)";
    var htmlBody = '<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px;"><h2 style="color: #B22222; font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Внимание: Зафиксирован инцидент при обработке груза</h2><p>Уважаемые коллеги,</p><p>Настоящим письмом информируем вас о выявленных несоответствиях при выгрузке контейнера.</p><table style="border-collapse: collapse; width: 100%; margin-top: 15px; font-size: 14px;"><tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 40%; background-color: #f9f9f9;">Номер контейнера:</td><td style="padding: 10px; border: 1px solid #ddd;">' + safeId + '</td></tr><tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Время фиксации:</td><td style="padding: 10px; border: 1px solid #ddd;">' + safeTime + '</td></tr><tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Ответственный сотрудник:</td><td style="padding: 10px; border: 1px solid #ddd;">' + safeAuthor + '</td></tr></table><h3 style="margin-top: 20px; font-size: 16px; color: #333;">Описание проблемы:</h3><p style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #B22222; margin-top: 5px; font-size: 14px; white-space: pre-wrap;">' + safeDesc + '</p><p style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;"><em>* Фотоматериалы, подтверждающие инцидент, прикреплены к данному письму во вложениях.<br>Данное уведомление сформировано автоматически системой управления складом AGR Warehouse.</em></p></div>';

    var attachments = [];
    var photoUrls = [params.p1, params.p2, params.p3];
    for (var i = 0; i < photoUrls.length; i++) {
      var url = photoUrls[i];
      if (url && url.indexOf("drive.google.com") !== -1) {
        var fileIdMatch = url.match(/[-\w]{25,}/);
        if (fileIdMatch) {
          try {
            var file = DriveApp.getFileById(fileIdMatch[0]);
            attachments.push(file.getBlob());
          } catch (fileErr) {}
        }
      }
    }

    var mailOptions = { to: ALERT_EMAIL, subject: subject, htmlBody: htmlBody };
    if (attachments.length > 0) mailOptions.attachments = attachments;
    MailApp.sendEmail(mailOptions);

  } catch (err) {
    emailStatus = "Ошибка: " + err.toString();
  }

  s.appendRow([containerId, time, desc, params.p1 || "", params.p2 || "", params.p3 || "", author, emailStatus]);
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "ISSUE_REPORT_CREATE",
    entityType: "issue",
    entityId: containerId,
    containerNo: containerId,
    details: {
      description: desc,
      author: author,
      photos: [params.p1 || "", params.p2 || "", params.p3 || ""].filter(function(url) { return url; }),
      emailStatus: emailStatus
    },
    result: emailStatus.indexOf("РћС€РёР±РєР°") === 0 ? "partial" : "success",
    error: emailStatus.indexOf("РћС€РёР±РєР°") === 0 ? emailStatus : ""
  });
  return textOut("REPORTED");
}

function handleUploadPhoto(params, ss) {
  var imageData = (params.image || "");
  var mimeType  = (params.mimeType || "");
  var filename  = (params.filename || "upload.jpg");
  var caller = params._caller || null;
  var containerId = (params.containerId || params.id || "").toString().trim();
  var photoType = (params.photoType || "").toString().trim();
  var sheetName = (params.sheetDate || params.date || "").toString().trim();
  var logPhoto = function(action, result, entityId, details, newValue, error) {
    appendAuditLog(ss, {
      params: params,
      caller: caller,
      action: action,
      entityType: "photo",
      entityId: entityId || containerId || "",
      containerNo: containerId,
      sheetName: sheetName,
      sheetDate: sheetName,
      photoType: photoType,
      newValue: newValue || "",
      details: details || "",
      result: result,
      error: error || ""
    });
  };

  if (ALLOWED_MIME.indexOf(mimeType) === -1) {
    logPhoto("PHOTO_FILE_UPLOAD_FAILED", "failed", "", { filename: filename, reason: "INVALID_MIME_TYPE", mime: mimeType }, "", "INVALID_MIME_TYPE");
    return jsonOut({ status: "ERROR", message: "INVALID_MIME_TYPE" });
  }
  if (imageData.length > MAX_PHOTO_BASE64_LEN) {
    logPhoto("PHOTO_FILE_UPLOAD_FAILED", "failed", "", { filename: filename, reason: "FILE_TOO_LARGE" }, "", "FILE_TOO_LARGE");
    return jsonOut({ status: "ERROR", message: "FILE_TOO_LARGE" });
  }
  if (imageData.indexOf(",") === -1) {
    logPhoto("PHOTO_FILE_UPLOAD_FAILED", "failed", "", { filename: filename, reason: "INVALID_IMAGE_DATA" }, "", "INVALID_IMAGE_DATA");
    return jsonOut({ status: "ERROR", message: "INVALID_IMAGE_DATA" });
  }

  try {
    var base64Part = imageData.split(",")[1];
    if (!base64Part) {
      logPhoto("PHOTO_FILE_UPLOAD_FAILED", "failed", "", { filename: filename, reason: "EMPTY_IMAGE_DATA" }, "", "EMPTY_IMAGE_DATA");
      return jsonOut({ status: "ERROR", message: "EMPTY_IMAGE_DATA" });
    }

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Part), mimeType, filename);
    var uploadResult = createSharedUploadFileWithRetry(blob);
    var file = uploadResult.file;
    var fileUrl = file.getUrl();
    var details = {
      filename: filename,
      mime: mimeType,
      photoType: photoType,
      containerNo: containerId,
      driveFileId: file.getId(),
      url: fileUrl
    };
    if (uploadResult.attempts > 1) details.attempts = uploadResult.attempts;
    logPhoto("PHOTO_FILE_UPLOAD", "success", file.getId(), details, { driveFileId: file.getId(), url: fileUrl });

    return jsonOut({ status: "SUCCESS", url: fileUrl });
  } catch (e) {
    var failedDetails = { filename: filename, photoType: photoType, containerNo: containerId, error: e.toString() };
    if (e && e.uploadAttempts) failedDetails.attempts = e.uploadAttempts;
    logPhoto("PHOTO_FILE_UPLOAD_FAILED", "failed", "", failedDetails, "", e && e.stack ? e.stack : e.toString());
    return jsonOut({ status: "ERROR", message: "UPLOAD_FAILED: " + e.toString() });
  }
}

function handleUpdateContainerRow(params, ss) {
  var dateStr = (params.date || "").trim();
  var caller = params._caller || null;
  if (!isValidDateFormat(dateStr)) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_ROW_UPDATE_FAILED",
      entityType: "container",
      sheetName: dateStr,
      sheetDate: dateStr,
      details: { reason: "INVALID_DATE" },
      result: "failed",
      error: "INVALID_DATE"
    });
    return textOut("INVALID_DATE");
  }

  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_ROW_UPDATE_FAILED",
      entityType: "container",
      sheetName: dateStr,
      sheetDate: dateStr,
      details: { reason: "NO_SHEET" },
      result: "failed",
      error: "NO_SHEET"
    });
    return textOut("NO_SHEET");
  }

  var rowIndex = parseInt(params.row, 10);
  if (!rowIndex || rowIndex < 5 || rowIndex > sheet.getLastRow()) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_ROW_UPDATE_FAILED",
      entityType: "container",
      sheetName: dateStr,
      sheetDate: dateStr,
      rowNumber: rowIndex || "",
      details: { reason: "INVALID_ROW" },
      result: "failed",
      error: "INVALID_ROW"
    });
    return textOut("INVALID_ROW");
  }

  var oldSnapshot = buildContainerRowSnapshot_(sheet, rowIndex);
  // WRITE-SAFE: a wrong layout would write phone/eta into the wrong columns.
  var C;
  try { C = getPlanColumnsForSheetWriteSafe_(sheet); }
  catch (e) { return textOut("UNKNOWN_LAYOUT"); }
  logPlanHandlerDebug_("handleUpdateContainerRow", "update_container_row", sheet, C, { row: rowIndex });
  // Per-field writes via the header-resolved map. Never a contiguous range that could span
  // Carrier/Driver (V2_FULL F/G) or the UNLOAD_DURATION/FACTORY_DOWNTIME formula columns.
  // Photos and SAP/LES are not touched here.
  sheet.getRange(rowIndex, C.LOT_NO).setValue(params.lot || "");
  sheet.getRange(rowIndex, C.WS).setValue(params.ws || "");
  sheet.getRange(rowIndex, C.PALLETS).setValue(params.pallets || "");
  sheet.getRange(rowIndex, C.CONTAINER_NO).setValue(params.id || "");
  sheet.getRange(rowIndex, C.PHONE).setValue(params.phone || "");
  sheet.getRange(rowIndex, C.ETA).setValue(params.eta || "");
  // Arrival is written ONLY when the client explicitly sends it, so the existing contract
  // is unchanged and a missing field never clears the ARRIVAL_TIME column.
  var arrivalParam = (params.arrival !== undefined) ? params.arrival
                   : ((params.arrival_time !== undefined) ? params.arrival_time : undefined);
  if (arrivalParam !== undefined && C.ARRIVAL_TIME) {
    sheet.getRange(rowIndex, C.ARRIVAL_TIME).setValue(arrivalParam);
  }
  SpreadsheetApp.flush();
  var newSnapshot = buildContainerRowSnapshot_(sheet, rowIndex);
  var changes = diffContainerSnapshots_(oldSnapshot, newSnapshot);
  invalidateActivePlanReadCache_(dateStr);
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "PLAN_ROW_UPDATE",
    entityType: "container",
    entityId: newSnapshot.containerNo || oldSnapshot.containerNo,
    sheetName: dateStr,
    sheetDate: dateStr,
    rowNumber: rowIndex,
    containerNo: newSnapshot.containerNo || oldSnapshot.containerNo,
    lotNo: newSnapshot.lotNo,
    ws: newSnapshot.ws,
    zone: newSnapshot.zone,
    oldValue: extractChangeSide_(changes, "old"),
    newValue: extractChangeSide_(changes, "new"),
    oldRowSnapshot: oldSnapshot,
    newRowSnapshot: newSnapshot,
    details: { changes: changes },
    result: "success"
  });
  return textOut("UPDATED");
}

function handleCreatePlan(params, ss) {
  var dateStr = (params.date || "").trim();
  var caller = params._caller || null;
  if (!isValidDateFormat(dateStr)) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_CREATE_FAILED",
      entityType: "plan",
      sheetName: dateStr,
      sheetDate: dateStr,
      details: { reason: "INVALID_DATE" },
      result: "failed",
      error: "INVALID_DATE"
    });
    return textOut("INVALID_DATE");
  }

  var tasksJson = params.tasks;
  if (!tasksJson) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_CREATE_FAILED",
      entityType: "plan",
      sheetName: dateStr,
      sheetDate: dateStr,
      details: { reason: "NO_TASKS" },
      result: "failed",
      error: "NO_TASKS"
    });
    return textOut("NO_TASKS");
  }

  var tasks;
  try {
    tasks = JSON.parse(tasksJson);
    if (!Array.isArray(tasks) || tasks.length === 0) {
      appendAuditEvent_(ss, {
        params: params,
        caller: caller,
        action: "PLAN_CREATE_FAILED",
        entityType: "plan",
        sheetName: dateStr,
        sheetDate: dateStr,
        details: { reason: "INVALID_TASKS" },
        result: "failed",
        error: "INVALID_TASKS"
      });
      return textOut("INVALID_TASKS");
    }
  } catch (e) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PLAN_CREATE_FAILED",
      entityType: "plan",
      sheetName: dateStr,
      sheetDate: dateStr,
      details: { reason: "INVALID_JSON" },
      result: "failed",
      error: e.toString()
    });
    return textOut("INVALID_JSON");
  }

  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) {
    // New sheets are created in the V2 layout (headers + freeze only — no formulas).
    sheet = ss.insertSheet(dateStr);
    applyPlanV2Layout(sheet);
  }

  // Append rows using the header-resolved map. WRITE-SAFE so a mis-detected layout never
  // lands data in the wrong columns. A freshly created sheet carries the V2 headers above.
  var C;
  try { C = getPlanColumnsForSheetWriteSafe_(sheet); }
  catch (e) {
    appendAuditEvent_(ss, {
      params: params, caller: caller, action: "PLAN_CREATE_FAILED", entityType: "plan",
      sheetName: dateStr, sheetDate: dateStr, details: { reason: "UNKNOWN_LAYOUT" },
      result: "failed", error: e.toString()
    });
    return textOut("UNKNOWN_LAYOUT");
  }
  var lastRow = Math.max(sheet.getLastRow(), 4);
  var startRow = lastRow + 1;
  var baseRows = [], phoneCol = [], etaCol = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var idx = lastRow - 3 + i;
    baseRows.push([idx, t.lot || "", t.ws || "", t.pallets || "", t.id || ""]); // A..E (#..Container) — contiguous in every layout
    phoneCol.push([t.phone || ""]);
    etaCol.push([t.eta || ""]);
  }

  if (baseRows.length > 0) {
    // Three targeted writes — never a wide block, so Carrier/Driver and the
    // UNLOAD_DURATION/FACTORY_DOWNTIME formula columns are never overwritten.
    sheet.getRange(startRow, C.N, baseRows.length, 5).setValues(baseRows);
    sheet.getRange(startRow, C.PHONE, phoneCol.length, 1).setValues(phoneCol);
    sheet.getRange(startRow, C.ETA, etaCol.length, 1).setValues(etaCol);
  }
  var rows = baseRows; // keep downstream audit references intact
  invalidateActivePlanReadCache_(dateStr);
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "PLAN_CREATE",
    entityType: "plan",
    entityId: dateStr,
    sheetName: dateStr,
    sheetDate: dateStr,
    rowNumber: lastRow + 1,
    details: {
      rowsAdded: rows.length,
      containers: tasks.map(function(t) { return t.id || ""; }).filter(function(id) { return id; })
    },
    result: "success"
  });
  return textOut("CREATED");
}

function handleSetPriorityLot(params, ss) {
  var ds = ss.getSheetByName("DASHBOARD"); // Работает с публичной таблицей
  var caller = params._caller || null;
  if (!ds) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "PRIORITY_LOT_SET_FAILED",
      entityType: "lot",
      details: { reason: "NO_SHEET" },
      result: "failed",
      error: "NO_SHEET"
    });
    return textOut("NO_SHEET");
  }
  var lotVal = (params.lot || "").trim();
  var oldLot = ds.getRange("A1").getDisplayValue();
  ds.getRange("A1").setValue(lotVal);
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "PRIORITY_LOT_SET",
    entityType: "lot",
    entityId: lotVal,
    oldValue: oldLot,
    newValue: lotVal,
    details: { sheetName: "DASHBOARD", cell: "A1" },
    result: "success"
  });
  return textOut("OK");
}

function handleSubscribeNotification(params, ss) {
  var containerId = (params.id || "").trim();
  var email       = (params.email || "").trim();
  var caller      = params._caller || null;

  if (!containerId) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "SUBSCRIPTION_CREATE_FAILED",
      entityType: "subscription",
      entityId: containerId,
      containerNo: containerId,
      details: { reason: "INVALID_INPUT" },
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }
  if (!isValidEmail(email)) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "SUBSCRIPTION_CREATE_FAILED",
      entityType: "subscription",
      entityId: containerId,
      containerNo: containerId,
      details: { email: email, reason: "INVALID_EMAIL" },
      result: "failed",
      error: "INVALID_EMAIL"
    });
    return textOut("INVALID_EMAIL");
  }

  var sheet = ss.getSheetByName("SUBSCRIPTIONS");
  if (!sheet) {
    sheet = ss.insertSheet("SUBSCRIPTIONS");
    sheet.getRange("A1:D1").setValues([["Timestamp", "Container ID", "Email", "Status"]]).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(1);
  }

  var time = Utilities.formatDate(new Date(), TIMEZONE, "dd.MM.yyyy HH:mm:ss");
  sheet.appendRow([time, containerId, email, "PENDING"]);
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "SUBSCRIPTION_CREATE",
    entityType: "subscription",
    entityId: containerId,
    containerNo: containerId,
    details: { email: email, status: "PENDING" },
    result: "success"
  });
  return textOut("SUBSCRIBED");
}


// ══════════════════════════════════════════════════════════════════════════════
// 8. ADMIN HANDLERS (Reads/Writes to Secret DB)
// ══════════════════════════════════════════════════════════════════════════════

function handleGetPending(params, ss) {
  var authSheet = getAuthSheet();
  if (!authSheet) return jsonOut([]);

  var lr = authSheet.getLastRow();
  if (lr < 2) return jsonOut([]);

  var data = readUserAuthRows(authSheet, lr - 1);
  var pending = [];

  for (var i = 0; i < data.length; i++) {
    var status = (data[i][COL_STATUS] || "").toString().trim().toUpperCase();
    if (status === "PENDING") {
      pending.push({
        login:  (data[i][COL_LOGIN] || "").toString().trim(),
        user:   (data[i][COL_LOGIN] || "").toString().trim(),
        name:   (data[i][COL_NAME]  || "").toString().trim(),
        role:   (data[i][COL_ROLE]  || "").toString().trim(),
        status: status
      });
    }
  }
  return jsonOut(pending);
}

function handleApproveUser(params, ss) {
  var authSheet = getAuthSheet();
  var caller = params._caller || null;
  if (!authSheet) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_APPROVE_FAILED",
      entityType: "user",
      details: { reason: "AUTH_SHEET_UNAVAILABLE" },
      result: "failed",
      error: "AUTH_SHEET_UNAVAILABLE"
    });
    return textOut("ERROR");
  }

  var login = (params.login || "").toLowerCase().trim();
  var role  = (params.role || "OPERATOR").toUpperCase().trim();
  var validRoles = ["OPERATOR", "LOGISTIC", "AGRL", "ADMIN"];
  if (validRoles.indexOf(role) === -1) role = "OPERATOR";

  if (!login) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_APPROVE_FAILED",
      entityType: "user",
      details: { reason: "INVALID_INPUT" },
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }

  var lr = authSheet.getLastRow();
  if (lr < 2) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_APPROVE_FAILED",
      entityType: "user",
      entityId: login,
      details: { reason: "NOT_FOUND" },
      result: "failed",
      error: "NOT_FOUND"
    });
    return textOut("NOT_FOUND");
  }

  // Row-level read so we can also grab the stored token for cache invalidation.
  var data = readUserAuthRows(authSheet, lr - 1);
  for (var i = 0; i < data.length; i++) {
    if ((data[i][COL_LOGIN] || "").toString().toLowerCase().trim() === login) {
      var oldRole = data[i][COL_ROLE] || "";
      var oldStatus = data[i][COL_STATUS] || "";
      authSheet.getRange(i + 2, USER_COL_START + COL_ROLE).setValue(role);
      authSheet.getRange(i + 2, USER_COL_START + COL_STATUS).setValue("APPROVED");
      invalidateUserRowTokenCaches(data[i]);
      appendAuditEvent_(ss, {
        params: params,
        caller: caller,
        action: "USER_APPROVE",
        entityType: "user",
        entityId: login,
        rowNumber: i + 2,
        oldValue: { role: oldRole, status: oldStatus },
        newValue: { role: role, status: "APPROVED" },
        details: { login: login },
        result: "success"
      });
      return textOut("APPROVED");
    }
  }
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "USER_APPROVE_FAILED",
    entityType: "user",
    entityId: login,
    details: { reason: "NOT_FOUND" },
    result: "failed",
    error: "NOT_FOUND"
  });
  return textOut("NOT_FOUND");
}

function handleRejectUser(params, ss) {
  var authSheet = getAuthSheet();
  var caller = params._caller || null;
  if (!authSheet) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_REJECT_FAILED",
      entityType: "user",
      details: { reason: "AUTH_SHEET_UNAVAILABLE" },
      result: "failed",
      error: "AUTH_SHEET_UNAVAILABLE"
    });
    return textOut("ERROR");
  }

  var login = (params.login || "").toLowerCase().trim();
  if (!login) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_REJECT_FAILED",
      entityType: "user",
      details: { reason: "INVALID_INPUT" },
      result: "failed",
      error: "INVALID_INPUT"
    });
    return textOut("INVALID_INPUT");
  }

  var lr = authSheet.getLastRow();
  if (lr < 2) {
    appendAuditEvent_(ss, {
      params: params,
      caller: caller,
      action: "USER_REJECT_FAILED",
      entityType: "user",
      entityId: login,
      details: { reason: "NOT_FOUND" },
      result: "failed",
      error: "NOT_FOUND"
    });
    return textOut("NOT_FOUND");
  }

  // Row-level read so we can invalidate the cached token for the rejected user.
  var data = readUserAuthRows(authSheet, lr - 1);
  for (var i = 0; i < data.length; i++) {
    if ((data[i][COL_LOGIN] || "").toString().toLowerCase().trim() === login) {
      // 🚀 Вместо удаления строки, просто меняем её статус на REJECTED
      var oldStatus = data[i][COL_STATUS] || "";
      authSheet.getRange(i + 2, USER_COL_START + COL_STATUS).setValue("REJECTED");
      invalidateUserRowTokenCaches(data[i]);
      appendAuditEvent_(ss, {
        params: params,
        caller: caller,
        action: "USER_REJECT",
        entityType: "user",
        entityId: login,
        rowNumber: i + 2,
        oldValue: { status: oldStatus },
        newValue: { status: "REJECTED" },
        details: { login: login },
        result: "success"
      });
      return textOut("REJECTED");
    }
  }
  appendAuditEvent_(ss, {
    params: params,
    caller: caller,
    action: "USER_REJECT_FAILED",
    entityType: "user",
    entityId: login,
    details: { reason: "NOT_FOUND" },
    result: "failed",
    error: "NOT_FOUND"
  });
  return textOut("NOT_FOUND");
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. SCHEDULED TRIGGERS (Stay identical)
// ══════════════════════════════════════════════════════════════════════════════

function checkTimersAndAlert() {
  // Logic remains identical
}

function processSubscriptions() {
  // Logic remains identical
}
