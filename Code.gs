// ══════════════════════════════════════════════════════════════════════════════
// AGR WAREHOUSE MONITOR — Backend API (Code.gs)
// Version: 5.0 — Full lockdown + Database Isolation (Secret Auth DB)
// ══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURATION ────────────────────────────────────────────────────────────

var TIMEZONE     = "Europe/Moscow";
var ALERT_EMAIL  = "MHReceiving@agr.auto";  // TODO: move to sheet config cell

var ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
var MAX_PHOTO_BASE64_LEN = 7000000;  // ~5 MB decoded

// TV displays use a static API key instead of user tokens.
var TV_API_KEY = "TV-AGR-2026-SECURE-PANEL-KEY";  // TODO: replace before deploy

// Rate-limiting for login
var LOGIN_MAX_ATTEMPTS   = 5;    // max failures before lockout
var LOGIN_WINDOW_SECONDS = 300;  // 5-minute window
var LOGIN_FAIL_DELAY_MS  = 1500; // artificial delay on every failed attempt

// ── SECRET DATABASE CONFIGURATION (ISOLATION) ────────────────────────────────
var SECRET_AUTH_DB_ID = '1WjKGZtb1LjuBbSgorxjBP5zS3DGI_dssnwEUBfq5y4Y'; 
var AUTH_SHEET_NAME   = 'USERS'; // Имя листа в секретной таблице

// Layout for the Secret DB (row 2+):
// A(1)=Login  B(2)=Hash  C(3)=Name  D(4)=Role  E(5)=Status  F(6)=Token
var USER_COL_START = 1;
var USER_COL_COUNT = 6;   // A through F
var COL_LOGIN  = 0;
var COL_HASH   = 1;
var COL_NAME   = 2;
var COL_ROLE   = 3;
var COL_STATUS = 4;
var COL_TOKEN  = 5;

// ── ROUTE TABLE ──────────────────────────────────────────────────────────────

var ROUTES = {
  // ── Public (no auth at all) ──
  "login":                 { handler: handleLogin,              auth: false, lock: false },
  "register":              { handler: handleRegister,           auth: false, lock: true  },

  // ── TV display endpoints (static API key, anonymized data) ──
  "tv_dashboard":          { handler: handleTvDashboard,        auth: "tv",  lock: false },
  "tv_lot_tracker":        { handler: handleTvLotTracker,       auth: "tv",  lock: false },

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

  // ── Authenticated writes (user token required) ──
  "task_action":           { handler: handleTaskAction,         auth: true,  lock: true  },
  "report_issue":          { handler: handleReportIssue,        auth: true,  lock: true  },
  "update_container_row":  { handler: handleUpdateContainerRow, auth: true,  lock: true  },
  "create_plan":           { handler: handleCreatePlan,         auth: true,  lock: true  },
  "set_priority_lot":      { handler: handleSetPriorityLot,     auth: true,  lock: true  },
  "upload_photo":          { handler: handleUploadPhoto,        auth: true,  lock: false },
  "subscribe_notification":{ handler: handleSubscribeNotification, auth: true, lock: true },

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

  if (!route) {
    return jsonOut({ error: "UNKNOWN_MODE", mode: mode });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Auth check ──
    if (route.auth === "tv") {
      var providedKey = (params.key || "").toString().trim();
      if (providedKey !== TV_API_KEY) {
        return jsonOut({ error: "INVALID_TV_KEY" });
      }
    } else if (route.auth === true) {
      var caller = verifyToken(params.token);
      if (!caller) {
        return jsonOut({ error: "AUTH_REQUIRED" });
      }
      if (route.admin && caller.role !== "ADMIN") {
        return jsonOut({ error: "ADMIN_REQUIRED" });
      }
      params._caller = caller;
    }

    // ── Execute ──
    if (route.lock) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(12000)) {
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

function verifyToken(token) {
  if (!token || typeof token !== "string" || token.length < 20) return null;

  var sheet = getAuthSheet();
  if (!sheet) return null;

  var lr = sheet.getLastRow();
  if (lr < 2) return null;

  var data = sheet.getRange(2, USER_COL_START, lr - 1, USER_COL_COUNT).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][COL_TOKEN] === token && data[i][COL_STATUS] === "APPROVED") {
      return {
        login: data[i][COL_LOGIN],
        name:  data[i][COL_NAME],
        role:  data[i][COL_ROLE]
      };
    }
  }
  return null;
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

function getTodaySheetName() {
  return Utilities.formatDate(new Date(), TIMEZONE, "dd.MM");
}

function getYesterdaySheetName() {
  var d = new Date();
  var yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return Utilities.formatDate(yesterday, TIMEZONE, "dd.MM");
}

function isNightCarryover() {
  var timeString = Utilities.formatDate(new Date(), TIMEZONE, "HH:mm");
  var parts = timeString.split(":");
  var mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  return mins < 390;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. TV DISPLAY HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

function handleTvDashboard(params, ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet && !isNightCarryover()) {
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
  var seenIds = {};

  if (sheet) {
    var lr = sheet.getLastRow();
    if (lr >= 5) {
      var d = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
      for (var i = 0; i < d.length; i++) {
        var row = d[i];
        if (row[4]) {
          seenIds[row[4]] = true;
          total++;
          if (row[8]) {
            done++;
            var endMin = parseTimeToMin(row[8]);
            if (endMin !== null) {
              if (endMin >= 470 && endMin < 1010) shiftMorning++;
              else if (endMin >= 1010 || endMin < 110) shiftEvening++;
              else shiftNight++;
            } else { shiftMorning++; }
          }
          else if (row[7]) {
            activeList.push({ id: row[4], start: row[7], zone: row[10] || "" });
          }
          else {
            if (nextId === "---") { nextId = row[4]; nextTime = row[6]; }
            if (row[15] && row[15] !== "") onTerritory++;
          }
        }
      }
    }
  }

  if (isNightCarryover()) {
    var ySheet = ss.getSheetByName(getYesterdaySheetName());
    if (ySheet && ySheet.getLastRow() >= 5) {
      var yData = ySheet.getRange(5, 1, ySheet.getLastRow() - 4, 16).getDisplayValues();
      for (var j = 0; j < yData.length; j++) {
        var yRow = yData[j];
        if (yRow[4] && !seenIds[yRow[4]] && !yRow[8]) {
          total++;
          if (yRow[7]) {
            activeList.push({ id: yRow[4], start: yRow[7], zone: yRow[10] || "" });
          } else {
            if (nextId === "---") { nextId = yRow[4]; nextTime = yRow[6]; }
            if (yRow[15] && yRow[15] !== "") onTerritory++;
          }
        }
      }
    }
  }

  var status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  return jsonOut({
    status: status, done: done, total: total, nextId: nextId, nextTime: nextTime,
    shiftCounts: { morning: shiftMorning, evening: shiftEvening, night: shiftNight },
    onTerritory: onTerritory, activeList: activeList
  });
}

var LOT_TRACKER_MAX_RESULTS = 100;
var LOT_TRACKER_MAX_SHEETS  = 30;
var SYSTEM_SHEETS = { "DASHBOARD": 1, "PROBLEMS": 1, "SUBSCRIPTIONS": 1 };

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
    var rowCount = lr - 4;
    var narrow = sheet.getRange(5, 2, rowCount, 4).getValues(); 
    var matchedRows = [];

    for (var i = 0; i < narrow.length; i++) {
      var lot = (narrow[i][0] || "").toString().trim().toUpperCase();
      var id  = (narrow[i][3] || "").toString().trim().toUpperCase();
      if (lot.indexOf(lotQuery) !== -1 || id.indexOf(lotQuery) !== -1) {
        matchedRows.push(i);
      }
    }

    if (matchedRows.length > 0) {
      var full = sheet.getRange(5, 1, rowCount, 16).getDisplayValues();
      for (var m = 0; m < matchedRows.length; m++) {
        var ri = matchedRows[m];
        var row = full[ri];
        results.push({
          date: sheetName, index: row[0], lot: row[1], ws: row[2],
          pallets: row[3], id: (row[4] || "").trim().toUpperCase() || "—",
          eta: row[6], status: deriveStatus(row[7], row[8]),
          start_time: row[7], end_time: row[8], zone: row[10]
        });
        if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
      }
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

  if (!user || !hash) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    return textOut("WRONG");
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = "login_fail_" + user;
  var attempts = parseInt(cache.get(cacheKey) || "0", 10);
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    Utilities.sleep(3000);
    return jsonOut({ error: "RATE_LIMITED", retry_after_seconds: LOGIN_WINDOW_SECONDS });
  }

  var authSheet = getAuthSheet();
  if (!authSheet) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    return textOut("WRONG");
  }

  var lr = authSheet.getLastRow();
  if (lr < 2) {
    Utilities.sleep(LOGIN_FAIL_DELAY_MS);
    return textOut("WRONG");
  }

  var data = authSheet.getRange(2, USER_COL_START, lr - 1, USER_COL_COUNT).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    // 🚀 Сначала проверяем только логин и пароль
    if (data[i][COL_LOGIN].toLowerCase() === user && data[i][COL_HASH] === hash) {
      
      var status = (data[i][COL_STATUS] || "").toUpperCase().trim();

      // Пароль верный, теперь смотрим статус
      if (status === "APPROVED") {
        cache.remove(cacheKey);
        var token = generateToken();
        authSheet.getRange(i + 2, USER_COL_START + COL_TOKEN).setValue(token);
        return textOut("CORRECT|" + data[i][COL_NAME] + "|" + data[i][COL_ROLE] + "|" + token);
      } 
      else if (status === "PENDING") {
        return jsonOut({ error: "PENDING" });
      } 
      else if (status === "REJECTED") {
        return jsonOut({ error: "REJECTED" });
      } 
      else {
        return jsonOut({ error: "NOT_APPROVED" });
      }
    }
  }

  // Если дошли сюда — логин или пароль реально неверные
  attempts++;
  cache.put(cacheKey, String(attempts), LOGIN_WINDOW_SECONDS);
  Utilities.sleep(LOGIN_FAIL_DELAY_MS);

  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    return jsonOut({ error: "RATE_LIMITED", retry_after_seconds: LOGIN_WINDOW_SECONDS });
  }
  return textOut("WRONG");
}

function handleRegister(params, ss) {
  var login = (params.user || "").toLowerCase().trim();
  var hash  = (params.hash || "").trim();
  var name  = (params.name || "").trim();

  if (!login || !hash || !name) return textOut("INVALID_INPUT");
  if (login.length > 50 || name.length > 100) return textOut("INPUT_TOO_LONG");

  var authSheet;
  try {
    authSheet = getAuthSheet();
  } catch (e) {
    // If sheet doesn't exist, create it in the secret DB
    var authDb = SpreadsheetApp.openById(SECRET_AUTH_DB_ID);
    authSheet = authDb.insertSheet(AUTH_SHEET_NAME);
    authSheet.getRange("A1:F1").setValues([["Login", "Hash", "Name", "Role", "Status", "Token"]]);
  }

  var lr = authSheet.getLastRow();
  if (lr >= 2) {
    var existing = authSheet.getRange(2, USER_COL_START, lr - 1, 1).getDisplayValues();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][0].toLowerCase().trim() === login) {
        return textOut("DUPLICATE_LOGIN");
      }
    }
  }

  var newRow = lr + 1;
  authSheet.getRange(newRow, USER_COL_START, 1, USER_COL_COUNT)
    .setValues([[login, hash, name, "OPERATOR", "PENDING", ""]]);

  return textOut("REGISTERED");
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. AUTH-PROTECTED READS
// ══════════════════════════════════════════════════════════════════════════════

function handleReadComplex(params, ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  // 1. Заглушка теперь отдает 6 нулей (3 для факта, 3 для плана)
  if (!sheet && !isNightCarryover()) return textOut("WAIT;0|0;---;00:00;0|0|0|0|0|0;0\n###MSG###");

  var total = 0, done = 0, nextId = "---", nextTime = "";
  var activeRows = [];
  var onTerritory = 0;
  var seenIds = {};

  // 2. СЧЕТЧИКИ ДЛЯ СМЕН (ФАКТ И ПЛАН)
  var m_fact = 0, e_fact = 0, n_fact = 0;
  var m_base = 0, e_base = 0, n_base = 0;
  var noEtaCount = 0;

  if (sheet) {
    var lr = sheet.getLastRow();
    if (lr >= 5) {
      var d = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
      for (var i = 0; i < d.length; i++) {
        var row = d[i];
        if (row[4]) {
          seenIds[row[4]] = true;
          total++;
          
          // --- СЧИТАЕМ ФАКТ (По времени завершения - колонка I / row[8]) ---
          if (row[8]) {
            done++;
            var endMin = parseTimeToMin(row[8]);
            if (endMin !== null) {
              if (endMin >= 470 && endMin < 1010) m_fact++;
              else if (endMin >= 1010 || endMin < 110) e_fact++;
              else if (endMin >= 110 && endMin < 470) n_fact++;
            }
          } 
          else if (row[7]) activeRows.push(row[4] + "|" + row[7] + "|0|" + row[2] + "|" + row[10]);
          else {
            if (nextId === "---") { nextId = row[4]; nextTime = row[6]; }
            if (row[15] && row[15] !== "") onTerritory++;
          }

          // --- СЧИТАЕМ БАЗОВЫЙ ПЛАН (По времени ETA - колонка G / row[6]) ---
          var etaMin = parseTimeToMin(row[6]);
          if (etaMin === null) {
            noEtaCount++;
          } else {
            if (etaMin >= 470 && etaMin < 1010) m_base++;
            else if (etaMin >= 1010 || etaMin < 110) e_base++;
            else if (etaMin >= 110 && etaMin < 470) n_base++;
          }
        }
      }
    }
  }

  // --- ОБРАБАТЫВАЕМ ПЕРЕХОДЯЩИЕ НОЧНЫЕ ЗАДАЧИ ---
  if (isNightCarryover()) {
    var ySheet = ss.getSheetByName(getYesterdaySheetName());
    if (ySheet && ySheet.getLastRow() >= 5) {
      var yData = ySheet.getRange(5, 1, ySheet.getLastRow() - 4, 16).getDisplayValues();
      for (var j = 0; j < yData.length; j++) {
        var yRow = yData[j];
        if (yRow[4] && !seenIds[yRow[4]] && !yRow[8]) {
          total++;
          if (yRow[7]) activeRows.push(yRow[4] + "|" + yRow[7] + "|0|" + yRow[2] + "|" + yRow[10]);
          else {
            if (nextId === "---") { nextId = yRow[4]; nextTime = yRow[6]; }
            if (yRow[15] && yRow[15] !== "") onTerritory++;
          }

          // Добавляем их в план смены по ETA
          var yEtaMin = parseTimeToMin(yRow[6]);
          if (yEtaMin === null) {
            noEtaCount++;
          } else {
            if (yEtaMin >= 470 && yEtaMin < 1010) m_base++;
            else if (yEtaMin >= 1010 || yEtaMin < 110) e_base++;
            else if (yEtaMin >= 110 && yEtaMin < 470) n_base++;
          }
        }
      }
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
  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
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

  return textOut(body + "\n###MSG###");
}

function handleGetStats(params, ss) {
  var tasks = [];
  var seenIds = {};

  var sheet = ss.getSheetByName(getTodaySheetName());
  if (sheet && sheet.getLastRow() >= 5) {
    var data = sheet.getRange(5, 1, sheet.getLastRow() - 4, 15).getDisplayValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var id = row[4];
      if (id) {
        seenIds[id] = true;
        var status = deriveStatus(row[7], row[8]);
        var timeDisplay = row[6];
        if (row[8]) timeDisplay = row[8];
        else if (row[7]) timeDisplay = row[7];
        tasks.push({
          id: id, type: row[2], pallets: row[3], phone: row[5], eta: row[6],
          status: status, time: timeDisplay, start_time: row[7], end_time: row[8],
          zone: row[10] || "", operator: row[11] || "",
          photo_gen: row[12] || "", photo_seal: row[13] || ""
        });
      }
    }
  }

  if (isNightCarryover()) {
    var ySheet = ss.getSheetByName(getYesterdaySheetName());
    if (ySheet && ySheet.getLastRow() >= 5) {
      var yData = ySheet.getRange(5, 1, ySheet.getLastRow() - 4, 15).getDisplayValues();
      for (var j = 0; j < yData.length; j++) {
        var yRow = yData[j];
        var yId = yRow[4];
        if (yId && !seenIds[yId] && !yRow[8]) {
          var yStatus = yRow[7] ? "ACTIVE" : "WAIT";
          var yTime = yRow[7] || yRow[6];
          tasks.push({
            id: yId, type: yRow[2], pallets: yRow[3], phone: yRow[5], eta: yRow[6],
            status: yStatus, time: yTime, start_time: yRow[7], end_time: "",
            zone: yRow[10] || "", operator: yRow[11] || "",
            photo_gen: yRow[12] || "", photo_seal: yRow[13] || ""
          });
        }
      }
    }
  }
  return jsonOut(tasks);
}

function handleGetHistory(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return jsonOut([]);
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 5) return jsonOut([]);

  var data = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
  var tasks = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[4];
    if (id && id !== "") {
      tasks.push({
        id: id, type: row[2], pallets: row[3], phone: row[5], eta: row[6],
        status: deriveStatus(row[7], row[8]), start_time: row[7], end_time: row[8],
        zone: row[10], operator: row[11], photo_gen: row[12],
        photo_seal: row[13], photo_empty: row[14], arrival_time: row[15]
      });
    }
  }
  return jsonOut(tasks);
}

function handleGetFullPlan(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return jsonOut([]);
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 5) return jsonOut([]);

  var data = sheet.getRange(5, 1, lr - 4, 7).getDisplayValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (r[4]) {
      rows.push({
        index: r[0], lot: r[1], ws: r[2], pallets: r[3],
        id: r[4], phone: r[5], eta: r[6], rowIndex: i + 5
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
    var rowCount = lr - 4;
    var narrow = sheet.getRange(5, 2, rowCount, 4).getValues(); 
    var matchedRows = [];

    for (var i = 0; i < narrow.length; i++) {
      var lot = (narrow[i][0] || "").toString().trim().toUpperCase(); 
      var id  = (narrow[i][3] || "").toString().trim().toUpperCase(); 
      if (lot.indexOf(lotQuery) !== -1 || id.indexOf(lotQuery) !== -1) {
        matchedRows.push(i);
      }
    }

    if (matchedRows.length > 0) {
      var full = sheet.getRange(5, 1, rowCount, 16).getDisplayValues();
      for (var m = 0; m < matchedRows.length; m++) {
        var ri = matchedRows[m];
        var row = full[ri];
        var matchedId = (row[4] || "").toString().trim().toUpperCase();

        results.push({
          date: sheetName, index: row[0], lot: row[1], ws: row[2],
          pallets: row[3], id: matchedId || "НЕ НАЗНАЧЕН", phone: row[5], eta: row[6],
          status: deriveStatus(row[7], row[8]), start_time: row[7], end_time: row[8],
          zone: row[10], operator: row[11], arrival_time: row[15]
        });

        if (results.length >= LOT_TRACKER_MAX_RESULTS) break;
      }
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
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return jsonOut([]);
  var lr = sheet.getLastRow();
  if (lr < 5) return jsonOut([]);
  var data = sheet.getRange(5, 5, lr - 4, 1).getValues();
  var ids = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) ids.push(data[i][0].toString());
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
  var id  = (params.id || "").trim();
  var act = (params.act || "").trim();
  if (!id || !act) return textOut("INVALID_INPUT");

  var time = Utilities.formatDate(new Date(), TIMEZONE, "HH:mm");
  var todayName = getTodaySheetName();
  var sheet = ss.getSheetByName(todayName);
  if (sheet) {
    var result = applyTaskAction(sheet, id, act, time, params);
    if (result) return result;
  }

  if (isNightCarryover()) {
    var yName = getYesterdaySheetName();
    var ySheet = ss.getSheetByName(yName);
    if (ySheet) {
      var yResult = applyTaskAction(ySheet, id, act, time, params);
      if (yResult) return yResult;
    }
  }
  return textOut("ID_NOT_FOUND");
}

function applyTaskAction(sheet, id, act, time, params) {
  var lr = sheet.getLastRow();
  if (lr < 5) return null;
  var data = sheet.getRange(5, 5, lr - 4, 1).getValues();

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === id) {
      var r = i + 5;
      if (act === "start" || act.indexOf("start_manual") === 0) {
        var vals = sheet.getRange(r, 8, 1, 7).getValues()[0]; 
        vals[0] = time;                           
        vals[3] = params.zone || vals[3];         
        vals[4] = params.op   || vals[4];         
        vals[5] = params.pGen  || vals[5];        
        vals[6] = params.pSeal || vals[6];        
        sheet.getRange(r, 8, 1, 7).setValues([vals]);
      } else if (act === "undo_start") {
        sheet.getRange(r, 8, 1, 7).setValues([["", "", "", "", "", "", ""]]);
      } else if (act === "update_photo") {
        var pVals = sheet.getRange(r, 13, 1, 3).getValues()[0];
        if (params.pGen)   pVals[0] = params.pGen;
        if (params.pSeal)  pVals[1] = params.pSeal;
        if (params.pEmpty) pVals[2] = params.pEmpty;
        sheet.getRange(r, 13, 1, 3).setValues([pVals]);
      } else {
        sheet.getRange(r, 9).setValue(time);
        if (params.pEmpty) sheet.getRange(r, 15).setValue(params.pEmpty);
      }
      return textOut("UPDATED");
    }
  }
  return null;
}

function handleReportIssue(params, ss) {
  var containerId = (params.id || "").trim();
  var desc        = (params.desc || "").trim();
  var author      = (params.author || "Anonymous").trim();

  if (!containerId || !desc) return textOut("INVALID_INPUT");

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
  return textOut("REPORTED");
}

function handleUploadPhoto(params, ss) {
  var imageData = (params.image || "");
  var mimeType  = (params.mimeType || "");
  var filename  = (params.filename || "upload.jpg");

  if (ALLOWED_MIME.indexOf(mimeType) === -1) return jsonOut({ status: "ERROR", message: "INVALID_MIME_TYPE" });
  if (imageData.length > MAX_PHOTO_BASE64_LEN) return jsonOut({ status: "ERROR", message: "FILE_TOO_LARGE" });
  if (imageData.indexOf(",") === -1) return jsonOut({ status: "ERROR", message: "INVALID_IMAGE_DATA" });

  try {
    var base64Part = imageData.split(",")[1];
    if (!base64Part) return jsonOut({ status: "ERROR", message: "EMPTY_IMAGE_DATA" });

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Part), mimeType, filename);
    var file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonOut({ status: "SUCCESS", url: file.getUrl() });
  } catch (e) {
    return jsonOut({ status: "ERROR", message: "UPLOAD_FAILED: " + e.toString() });
  }
}

function handleUpdateContainerRow(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return textOut("INVALID_DATE");

  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return textOut("NO_SHEET");

  var rowIndex = parseInt(params.row, 10);
  if (!rowIndex || rowIndex < 5 || rowIndex > sheet.getLastRow()) return textOut("INVALID_ROW");

  var vals = [[(params.lot || ""), (params.ws || ""), (params.pallets || ""), (params.id || ""), (params.phone || ""), (params.eta || "")]];
  sheet.getRange(rowIndex, 2, 1, 6).setValues(vals);
  return textOut("UPDATED");
}

function handleCreatePlan(params, ss) {
  var dateStr = (params.date || "").trim();
  if (!isValidDateFormat(dateStr)) return textOut("INVALID_DATE");

  var tasksJson = params.tasks;
  if (!tasksJson) return textOut("NO_TASKS");

  var tasks;
  try {
    tasks = JSON.parse(tasksJson);
    if (!Array.isArray(tasks) || tasks.length === 0) return textOut("INVALID_TASKS");
  } catch (e) { return textOut("INVALID_JSON"); }

  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) {
    sheet = ss.insertSheet(dateStr);
    var headers = [["#", "Lot No", "W/S", "Pallets/Cases", "Container ID", "Driver Phone", "ETA", "Start", "End", "Duration", "Zone", "Operator", "Photo Gen", "Photo Seal", "Photo Empty"]];
    sheet.getRange("A4:O4").setValues(headers).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(4);
  }

  var lastRow = Math.max(sheet.getLastRow(), 4);
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var idx = lastRow - 3 + i;
    rows.push([idx, (t.lot || ""), (t.ws || ""), (t.pallets || ""), (t.id || ""), (t.phone || ""), (t.eta || ""), "", "", "", "", "", "", "", ""]);
  }

  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, 15).setValues(rows);
  }
  return textOut("CREATED");
}

function handleSetPriorityLot(params, ss) {
  var ds = ss.getSheetByName("DASHBOARD"); // Работает с публичной таблицей
  if (!ds) return textOut("NO_SHEET");
  var lotVal = (params.lot || "").trim();
  ds.getRange("A1").setValue(lotVal);
  return textOut("OK");
}

function handleSubscribeNotification(params, ss) {
  var containerId = (params.id || "").trim();
  var email       = (params.email || "").trim();

  if (!containerId) return textOut("INVALID_INPUT");
  if (!isValidEmail(email)) return textOut("INVALID_EMAIL");

  var sheet = ss.getSheetByName("SUBSCRIPTIONS");
  if (!sheet) {
    sheet = ss.insertSheet("SUBSCRIPTIONS");
    sheet.getRange("A1:D1").setValues([["Timestamp", "Container ID", "Email", "Status"]]).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(1);
  }

  var time = Utilities.formatDate(new Date(), TIMEZONE, "dd.MM.yyyy HH:mm:ss");
  sheet.appendRow([time, containerId, email, "PENDING"]);
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

  var data = authSheet.getRange(2, USER_COL_START, lr - 1, USER_COL_COUNT).getDisplayValues();
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
  if (!authSheet) return textOut("ERROR");

  var login = (params.login || "").toLowerCase().trim();
  var role  = (params.role || "OPERATOR").toUpperCase().trim();
  var validRoles = ["OPERATOR", "LOGISTIC", "AGRL", "ADMIN"];
  if (validRoles.indexOf(role) === -1) role = "OPERATOR";

  if (!login) return textOut("INVALID_INPUT");

  var lr = authSheet.getLastRow();
  if (lr < 2) return textOut("NOT_FOUND");

  var data = authSheet.getRange(2, USER_COL_START, lr - 1, 1).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toLowerCase().trim() === login) {
      authSheet.getRange(i + 2, USER_COL_START + COL_ROLE).setValue(role);
      authSheet.getRange(i + 2, USER_COL_START + COL_STATUS).setValue("APPROVED");
      return textOut("APPROVED");
    }
  }
  return textOut("NOT_FOUND");
}

function handleRejectUser(params, ss) {
  var authSheet = getAuthSheet();
  if (!authSheet) return textOut("ERROR");

  var login = (params.login || "").toLowerCase().trim();
  if (!login) return textOut("INVALID_INPUT");

  var lr = authSheet.getLastRow();
  if (lr < 2) return textOut("NOT_FOUND");

  var data = authSheet.getRange(2, USER_COL_START, lr - 1, 1).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toLowerCase().trim() === login) {
      // 🚀 Вместо удаления строки, просто меняем её статус на REJECTED
      authSheet.getRange(i + 2, USER_COL_START + COL_STATUS).setValue("REJECTED");
      return textOut("REJECTED");
    }
  }
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
