// ═══════════════════════════════════════════════════════════════════════════════
// Code.gs — Warehouse Dashboard Backend (Google Apps Script)
// Fixed: security, caching, batch endpoint, race conditions, write optimization
// ═══════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  var lock = LockService.getScriptLock();

  // [Г5] Валидация формата даты — предотвращение доступа к листу DASHBOARD
  function isValidDateSheet(name) {
    return /^\d{2}\.\d{2}$/.test(name);
  }

  // ─── 1. BATCH DASHBOARD + ARRIVALS [А1] ────────────────────────────────────
  if (e.parameter.mode === "dashboard_full") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var cache = CacheService.getScriptCache();

      // [А3] Проверяем кеш
      var cached = cache.get("dashboard_full");
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }

      var dashData = buildDashboardObject(ss);
      var todaySheet = getTodaySheetName();
      var arrData = buildHistoryArray(ss, todaySheet);
      var result = JSON.stringify({ dashboard: dashData, arrivals: arrData });

      // Кешируем на 8 секунд
      cache.put("dashboard_full", result, 8);

      return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        dashboard: { status: "WAIT", done: 0, total: 0, nextId: "---", nextTime: "00:00", activeList: [], shiftCounts: { morning: 0, evening: 0, night: 0 }, onTerritory: 0 },
        arrivals: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 2. PUBLIC DATA / STATS ────────────────────────────────────────────────
  if (e.parameter.mode === "get_operator_tasks" || e.parameter.mode === "get_stats") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetStats(ss);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 3. FETCH ALL CONTAINER IDs ───────────────────────────────────────────
  if (e.parameter.mode === "get_all_containers") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetAllContainers(ss);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 4. FETCH ISSUES ──────────────────────────────────────────────────────
  if (e.parameter.mode === "get_issues") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetIssues(ss);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 5. GET HISTORY ────────────────────────────────────────────────────────
  if (e.parameter.mode === "get_history") {
    try {
      var dateStr = e.parameter.date;
      // [Г5] Валидация имени листа
      if (!isValidDateSheet(dateStr)) {
        return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
      }
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var result = buildHistoryArray(ss, dateStr);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 5a. GET FULL PLAN ────────────────────────────────────────────────────
  if (e.parameter.mode === "get_full_plan") {
    try {
      var dateStr = e.parameter.date;
      if (!isValidDateSheet(dateStr)) {
        return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
      }
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetFullPlan(ss, e);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ─── 6. MAIN DASHBOARD READ (legacy, fallback) ────────────────────────────
  if (!e.parameter.mode) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      // [А3] С кешем
      var cache = CacheService.getScriptCache();
      var cached = cache.get("dashboard_data");
      if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.TEXT);

      var result = handleReadComplex(ss);
      return result;
    } catch (err) {
      return ContentService.createTextOutput("WAIT;0|0;---;00:00\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // ─── 7. CHECK SESSION [Г10] ───────────────────────────────────────────────
  if (e.parameter.mode === "check_session") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var s = ss.getSheetByName('DASHBOARD');
      if (!s) return ContentService.createTextOutput("ROLE:OPERATOR");
      var u = e.parameter.user.toLowerCase().trim();
      var d = s.getRange(2, 16, s.getLastRow(), 5).getDisplayValues();
      for (var i = 0; i < d.length; i++) {
        if (d[i][0].toLowerCase() === u && d[i][4] === "APPROVED") {
          return ContentService.createTextOutput("ROLE:" + d[i][3]);
        }
      }
      return ContentService.createTextOutput("ROLE:OPERATOR");
    } catch (err) {
      return ContentService.createTextOutput("ERROR");
    }
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ─── 8. TASK ACTIONS ──────────────────────────────────────────────────────
    if (e.parameter.mode === "task_action") {
      if (lock.tryLock(10000)) {
        try { return handleTaskAction(ss, e); }
        finally { lock.releaseLock(); }
      } else return ContentService.createTextOutput("BUSY");
    }

    // ─── 9. REPORT ISSUE ──────────────────────────────────────────────────────
    if (e.parameter.mode === "report_issue") {
      if (lock.tryLock(10000)) {
        try { return handleReportIssue(e, ss); }
        finally { lock.releaseLock(); }
      }
    }

    // ─── 10. CREATE PLAN ──────────────────────────────────────────────────────
    if (e.parameter.mode === "create_plan") {
      var dateStr = e.parameter.date;
      if (!isValidDateSheet(dateStr)) {
        return ContentService.createTextOutput("INVALID_DATE");
      }
      if (lock.tryLock(10000)) {
        try { return handleCreatePlan(e, ss); }
        finally { lock.releaseLock(); }
      }
    }

    // ─── 10a. UPDATE CONTAINER ROW ────────────────────────────────────────────
    if (e.parameter.mode === "update_container_row") {
      if (lock.tryLock(10000)) {
        try { return handleUpdateContainerRow(e, ss); }
        finally { lock.releaseLock(); }
      }
    }

    // ─── 11. LOGIN (legacy GET — redirects to "use POST") ─────────────────────
    if (e.parameter.mode === "login") {
      return ContentService.createTextOutput("USE_POST");
    }

    // ─── 12. REGISTER (legacy GET) ────────────────────────────────────────────
    if (e.parameter.mode === "register") {
      return ContentService.createTextOutput("USE_POST");
    }

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// doPost — фото-загрузка + [Г5] login/register через POST
// ═══════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // [Г5] Login через POST
    if (data.mode === "login") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var settingsSheet = ss.getSheetByName('DASHBOARD');
      if (!settingsSheet) return ContentService.createTextOutput("CORRECT|User|OPERATOR");
      var u = data.user.toLowerCase().trim();
      var h = data.hash;
      var d = settingsSheet.getRange(2, 16, settingsSheet.getLastRow(), 5).getDisplayValues();
      for (var i = 0; i < d.length; i++) {
        if (d[i][0].toLowerCase() === u && d[i][1] === h && d[i][4] === "APPROVED") {
          return ContentService.createTextOutput("CORRECT|" + d[i][2] + "|" + d[i][3]);
        }
      }
      return ContentService.createTextOutput("WRONG");
    }

    // [Г5] Register через POST
    if (data.mode === "register") {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(10000)) {
        try {
          var ss = SpreadsheetApp.getActiveSpreadsheet();
          var s = ss.getSheetByName('DASHBOARD');
          if (!s) {
            s = ss.insertSheet('DASHBOARD');
            s.getRange("P1:T1").setValues([["Login", "Hash", "Name", "Role", "Status"]]);
          }
          var newRow = s.getLastRow() + 1;
          // [А6] Batch-запись вместо 5 отдельных setValue
          s.getRange(newRow, 16, 1, 5).setValues([[
            data.user.toLowerCase().trim(),
            data.hash,
            data.name,
            "OPERATOR",
            "PENDING"
          ]]);
          return ContentService.createTextOutput("REGISTERED");
        } finally {
          lock.releaseLock();
        }
      }
      return ContentService.createTextOutput("BUSY");
    }

    // Фото-загрузка
    if (data.mode === "upload_photo") {
      var imageStr = data.image.split(",")[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(imageStr), data.mimeType, data.filename);
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // [А5] getDownloadUrl для прямого доступа
      var url = file.getDownloadUrl() || file.getUrl();
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", url: url })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput("UNKNOWN_MODE");
  } catch (e) {
    return ContentService.createTextOutput("POST_ERROR");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// [А1] Построение объекта дашборда для JSON-ответа
function buildDashboardObject(ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  var result = {
    status: "WAIT", done: 0, total: 0, nextId: "---", nextTime: "00:00",
    activeList: [], shiftCounts: { morning: 0, evening: 0, night: 0 }, onTerritory: 0
  };
  if (!sheet) return result;
  var lr = sheet.getLastRow();
  if (lr < 5) return result;

  var d = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
  var total = 0, done = 0, nextId = "---", nextTime = "", activeList = [];
  var onTerritory = 0;
  var morningCount = 0, eveningCount = 0, nightCount = 0;

  for (var i = 0; i < d.length; i++) {
    var row = d[i];
    if (row[4]) { // Col E: Container ID
      total++;
      if (row[8]) { // Col I: End Time
        done++;
        // Подсчёт по сменам
        var endMin = parseTimeToMin(row[8]);
        if (endMin !== null) {
          if (endMin >= 470 && endMin < 1010) morningCount++;
          else if (endMin >= 1010 || endMin < 110) eveningCount++;
          else nightCount++;
        }
      } else if (row[7]) { // Col H: Start Time
        activeList.push(row[4] + "|" + row[7] + "|0|" + row[2] + "|" + (row[10] || ""));
      } else {
        if (nextId === "---") { nextId = row[4]; nextTime = row[6]; }
        // Col P (index 15): arrival_time
        if (row[15] && row[15].trim() !== "") onTerritory++;
      }
    }
  }

  result.status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  result.done = done;
  result.total = total;
  result.nextId = nextId;
  result.nextTime = nextTime;
  result.onTerritory = onTerritory;
  result.shiftCounts = { morning: morningCount, evening: eveningCount, night: nightCount };

  // Парсим activeList
  result.activeList = [];
  for (var j = 0; j < activeList.length; j++) {
    var parts = activeList[j].split("|");
    result.activeList.push({ id: parts[0], start: parts[1], zone: parts[4] || "" });
  }

  return result;
}

function parseTimeToMin(s) {
  var m = (s || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

// [А1] Построение массива истории (для arrivals)
function buildHistoryArray(ss, dateStr) {
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return [];
  var lr = sheet.getLastRow();
  if (lr < 5) return [];

  var data = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
  var tasks = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[4];
    if (id && id !== "") {
      var status = "WAIT";
      if (row[8] !== "") status = "DONE";
      else if (row[7] !== "") status = "ACTIVE";
      tasks.push({
        id: id, type: row[2], pallets: row[3], phone: row[5], eta: row[6],
        status: status, time: row[6], start_time: row[7], end_time: row[8],
        zone: row[10], operator: row[11],
        photo_gen: row[12], photo_seal: row[13], photo_empty: row[14],
        arrival_time: row[15]
      });
    }
  }
  return tasks;
}

function handleGetFullPlan(ss, e) {
  var dateStr = e.parameter.date;
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var data = sheet.getRange(5, 1, lr - 4, 7).getDisplayValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (r[4]) {
      rows.push({ index: r[0], lot: r[1], ws: r[2], pallets: r[3], id: r[4], phone: r[5], eta: r[6], rowIndex: i + 5 });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateContainerRow(e, ss) {
  var dateStr = e.parameter.date;
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("NO_SHEET");
  var rowIndex = parseInt(e.parameter.row);
  if (!rowIndex || rowIndex < 5) return ContentService.createTextOutput("INVALID_ROW");
  // [А6] Одна batch-запись
  var vals = [[e.parameter.lot, e.parameter.ws, e.parameter.pallets, e.parameter.id, e.parameter.phone, e.parameter.eta]];
  sheet.getRange(rowIndex, 2, 1, 6).setValues(vals);
  // [А3] Инвалидация кеша
  CacheService.getScriptCache().remove("dashboard_full");
  CacheService.getScriptCache().remove("dashboard_data");
  return ContentService.createTextOutput("UPDATED");
}

function handleCreatePlan(e, ss) {
  var dateStr = e.parameter.date;
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) {
    sheet = ss.insertSheet(dateStr);
    var headers = [["#", "Lot No", "W/S", "Pallets/Cases", "Container ID", "Driver Phone", "ETA", "Start", "End", "Duration", "Zone", "Operator", "Photo Gen", "Photo Seal", "Photo Empty", "Arrival"]];
    sheet.getRange("A4:P4").setValues(headers).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(4);
  }
  var tasks = JSON.parse(e.parameter.tasks);
  var lastRow = Math.max(sheet.getLastRow(), 4);
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    rows.push([lastRow - 3 + i, t.lot, t.ws, t.pallets, t.id, t.phone, t.eta, "", "", "", "", "", "", "", "", ""]);
  }
  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, 16).setValues(rows);
  }
  // [А3] Инвалидация кеша
  CacheService.getScriptCache().remove("dashboard_full");
  CacheService.getScriptCache().remove("dashboard_data");
  return ContentService.createTextOutput("CREATED");
}

function handleGetIssues(ss) {
  var sheet = ss.getSheetByName('PROBLEMS');
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var lr = sheet.getLastRow();
  if (lr < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var data = sheet.getRange(2, 1, lr - 1, 7).getDisplayValues();
  var issues = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var id = row[0] || (row[1] || row[2] ? "Unknown" : "");
    if (id) {
      issues.push({ id: id, timestamp: row[1], desc: row[2], photos: [row[3], row[4], row[5]].filter(Boolean), author: row[6] });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(issues)).setMimeType(ContentService.MimeType.JSON);
}

function handleGetAllContainers(ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  // [Г5] Исправлен диапазон: lr-4 строк вместо lr
  var data = sheet.getRange(5, 5, lr - 4, 1).getValues();
  var ids = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) ids.push(data[i][0].toString());
  }
  return ContentService.createTextOutput(JSON.stringify(ids)).setMimeType(ContentService.MimeType.JSON);
}

function handleReportIssue(e, ss) {
  var s = ss.getSheetByName('PROBLEMS');
  if (!s) {
    s = ss.insertSheet('PROBLEMS');
    s.getRange("A1:G1").setValues([["Container ID", "Timestamp", "Description", "Photo 1", "Photo 2", "Photo 3", "Author"]]);
    s.getRange("A1:G1").setFontWeight("bold");
  }
  var time = new Date().toLocaleString('ru-RU');
  s.appendRow([e.parameter.id, time, e.parameter.desc, e.parameter.p1 || "", e.parameter.p2 || "", e.parameter.p3 || "", e.parameter.author || "Anonymous"]);
  return ContentService.createTextOutput("REPORTED");
}

function handleGetStats(ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var data = sheet.getRange(5, 1, lr - 4, 15).getDisplayValues();
  var tasks = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[4];
    if (id) {
      var status = "WAIT", timeDisplay = row[6];
      if (row[8]) { status = "DONE"; timeDisplay = row[8]; }
      else if (row[7]) { status = "ACTIVE"; timeDisplay = row[7]; }
      tasks.push({ id: id, type: row[2], pallets: row[3], phone: row[5], eta: row[6], status: status, time: timeDisplay, start_time: row[7], end_time: row[8] });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

// Legacy — сохраняем для обратной совместимости
function handleReadComplex(ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("WAIT;0|0;---;00:00\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
  var lr = sheet.getLastRow();
  var d = [];
  if (lr >= 5) d = sheet.getRange(5, 1, lr - 4, 11).getDisplayValues();
  var total = 0, done = 0, nextId = "---", nextTime = "", activeRows = [];
  for (var i = 0; i < d.length; i++) {
    var row = d[i];
    if (row[4]) {
      total++;
      if (row[8]) done++;
      else if (row[7]) activeRows.push(row[4] + "|" + row[7] + "|0|" + row[2] + "|" + row[10]);
      else if (nextId === "---") { nextId = row[4]; nextTime = row[6]; }
    }
  }
  var status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  var body = status + ";" + done + "|" + total + ";" + nextId + ";" + nextTime;
  if (activeRows.length > 0) body += "\n" + activeRows.join("\n");
  var result = body + "\n###MSG###";
  // [А3] Кеширование
  CacheService.getScriptCache().put("dashboard_data", result, 8);
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.TEXT);
}

// [Г6] Task action с проверкой race condition
function handleTaskAction(ss, e) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("NO_SHEET");
  var id = e.parameter.id;
  var act = e.parameter.act;
  var time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  // [Г5] Исправлен диапазон
  var lr = sheet.getLastRow();
  var data = sheet.getRange(5, 5, lr - 4, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === id) {
      var r = i + 5;
      if (act === 'start') {
        // [Г6] Проверка race condition — контейнер уже начат?
        var currentStart = sheet.getRange(r, 8).getValue();
        if (currentStart) {
          return ContentService.createTextOutput("ALREADY_STARTED");
        }
        // [А6] Batch-запись: H(8), I(9 skip), J(10 skip), K(11)=zone, L(12)=op, M(13)=pGen, N(14)=pSeal
        var zone = e.parameter.zone || "";
        var op = e.parameter.op || "";
        var pGen = e.parameter.pGen || "";
        var pSeal = e.parameter.pSeal || "";
        sheet.getRange(r, 8, 1, 7).setValues([[time, "", "", zone, op, pGen, pSeal]]);
      } else {
        // Finish
        sheet.getRange(r, 9).setValue(time);
        if (e.parameter.pEmpty) sheet.getRange(r, 15).setValue(e.parameter.pEmpty);
      }
      // [А3] Инвалидация кеша
      CacheService.getScriptCache().remove("dashboard_full");
      CacheService.getScriptCache().remove("dashboard_data");
      return ContentService.createTextOutput("UPDATED");
    }
  }
  return ContentService.createTextOutput("ID_NOT_FOUND");
}

function getTodaySheetName() {
  var t = new Date();
  return ("0" + t.getDate()).slice(-2) + "." + ("0" + (t.getMonth() + 1)).slice(-2);
}
