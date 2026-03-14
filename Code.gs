function doGet(e) {
  var lock = LockService.getScriptLock();
  
  // 1. PUBLIC DATA / STATS
  if (e.parameter.mode === "get_operator_tasks" || e.parameter.mode === "get_stats") {
     try {
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       return handleGetStats(ss);
     } catch (err) {
       return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
     }
  }

  // 2. FETCH ALL CONTAINER IDs (For Issue Dropdown)
  if (e.parameter.mode === "get_all_containers") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetAllContainers(ss);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 3. FETCH ISSUES
  if (e.parameter.mode === "get_issues") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetIssues(ss);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // 4. GET HISTORY (Date Specific)
  if (e.parameter.mode === "get_history") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetHistory(ss, e);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // 4a. GET FULL PLAN (For Logistics Editor)
  if (e.parameter.mode === "get_full_plan") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetFullPlan(ss, e);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 4b. GET LOT TRACKER (For TV2 - search lot across ALL date sheets)
  if (e.parameter.mode === "get_lot_tracker") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleGetLotTracker(ss, e);
    } catch (err) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 4c. GET PRIORITY LOT (read from DASHBOARD sheet A1)
  if (e.parameter.mode === "get_priority_lot") {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var ds = ss.getSheetByName('DASHBOARD');
      var lot = ds ? ds.getRange("A1").getValue().toString().trim() : "";
      return ContentService.createTextOutput(JSON.stringify({ lot: lot })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ lot: "" })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 5. MAIN DASHBOARD READ
  if (!e.parameter.mode) {
     try {
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       return handleReadComplex(ss);
     } catch (err) {
       return ContentService.createTextOutput("WAIT;0|0;---;00:00\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
     }
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 6. TASK ACTIONS
    if (e.parameter.mode === "task_action") {
      if (lock.tryLock(10000)) {
        try { return handleTaskAction(ss, e); } 
        finally { lock.releaseLock(); }
      } else return ContentService.createTextOutput("BUSY");
    }

    // 7. REPORT ISSUE
    if (e.parameter.mode === "report_issue") {
       if (lock.tryLock(10000)) {
         try { return handleReportIssue(e, ss); }
         finally { lock.releaseLock(); }
       }
    }
    
    // 8a. UPDATE CONTAINER ROW (Logistics Editor)
    if (e.parameter.mode === "update_container_row") {
       if (lock.tryLock(10000)) {
         try { return handleUpdateContainerRow(e, ss); }
         finally { lock.releaseLock(); }
       }
    }

    // 8b. SET PRIORITY LOT (write to DASHBOARD A1)
    if (e.parameter.mode === "set_priority_lot") {
       if (lock.tryLock(10000)) {
         try {
           var ds = ss.getSheetByName('DASHBOARD');
           if (!ds) return ContentService.createTextOutput("NO_SHEET");
           var lotVal = (e.parameter.lot || "").trim();
           ds.getRange("A1").setValue(lotVal);
           try { syncPriorityLot(lotVal); } catch(e) {}
           return ContentService.createTextOutput("OK");
         } finally { lock.releaseLock(); }
       }
    }
    
    // 10. REGISTER
    if (e.parameter.mode === "register") {
       if (lock.tryLock(10000)) {
         try { return handleRegister(e, ss); }
         finally { lock.releaseLock(); }
       }
    }

    // === 11. ВОССТАНОВЛЕННАЯ АДМИН-ПАНЕЛЬ ===
    if (e.parameter.mode === "get_pending") {
      return handleGetPending(ss);
    }
    
    if (e.parameter.mode === "approve_user") {
       if (lock.tryLock(10000)) {
         try { return handleApproveUser(e, ss); }
         finally { lock.releaseLock(); }
       }
    }
    
    if (e.parameter.mode === "reject_user") {
       if (lock.tryLock(10000)) {
         try { return handleRejectUser(e, ss); }
         finally { lock.releaseLock(); }
       }
    }

    return ContentService.createTextOutput(JSON.stringify({error: "UNKNOWN_MODE: " + (e.parameter.mode || "none")})).setMimeType(ContentService.MimeType.JSON);

  } catch (err) { 
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON); 
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var simulatedEvent = { parameter: data };
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === LOGIN (POST) ===
    if (data.mode === "login") {
       var settingsSheet = ss.getSheetByName('DASHBOARD'); 
       if(!settingsSheet) return ContentService.createTextOutput("CORRECT"); 
       return handleLogin(simulatedEvent, settingsSheet);
    }

    // === CREATE PLAN (POST) ===
    if (data.mode === "create_plan") {
       var lock = LockService.getScriptLock();
       if (lock.tryLock(10000)) {
         try { return handleCreatePlan(simulatedEvent, ss); }
         finally { lock.releaseLock(); }
       } else return ContentService.createTextOutput("BUSY");
    }

    // === UPLOAD PHOTO (POST) ===
    if (data.mode === "upload_photo") {
      var imageStr = data.image.split(",")[1]; 
      var blob = Utilities.newBlob(Utilities.base64Decode(imageStr), data.mimeType, data.filename);
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", url: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("UNKNOWN_MODE");
  } catch (e) { return ContentService.createTextOutput("POST_ERROR: " + e.toString()); }
}

// === HELPER FUNCTIONS ===

function handleGetHistory(ss, e) {
  var dateStr = e.parameter.date; 
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

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
        status: status, start_time: row[7], end_time: row[8],
        zone: row[10], operator: row[11], photo_gen: row[12], 
        photo_seal: row[13], photo_empty: row[14], arrival_time: row[15] 
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
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
      rows.push({
         index: r[0], lot: r[1], ws: r[2], pallets: r[3],
         id: r[4], phone: r[5], eta: r[6], rowIndex: i + 5
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}

function handleGetLotTracker(ss, e) {
  var lotQuery = (e.parameter.lot || "").trim().toUpperCase();
  if (!lotQuery) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var sheets = ss.getSheets();
  var datePattern = /^\d{2}\.\d{2}$/;
  var results = [];

  for (var s = 0; s < sheets.length; s++) {
    var sheetName = sheets[s].getName();
    if (!datePattern.test(sheetName)) continue;

    var sheet = sheets[s];
    var lr = sheet.getLastRow();
    if (lr < 5) continue;

    var data = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var lot = (row[1] || "").trim().toUpperCase();
      var id  = row[4];
      if (!id || lot.indexOf(lotQuery) === -1) continue;

      var status = "WAIT";
      if (row[8] !== "") status = "DONE";
      else if (row[7] !== "") status = "ACTIVE";

      results.push({
        date: sheetName, index: row[0], lot: row[1], ws: row[2],
        pallets: row[3], id: id, phone: row[5], eta: row[6],
        status: status, start_time: row[7], end_time: row[8],
        zone: row[10], operator: row[11], arrival_time: row[15]
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(results)).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateContainerRow(e, ss) {
  var dateStr = e.parameter.date; 
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("NO_SHEET");
  
  var rowIndex = parseInt(e.parameter.row);
  if (!rowIndex || rowIndex < 5) return ContentService.createTextOutput("INVALID_ROW");

  var vals = [[
    e.parameter.lot, e.parameter.ws, e.parameter.pallets,
    e.parameter.id, e.parameter.phone, e.parameter.eta
  ]];
  
  sheet.getRange(rowIndex, 2, 1, 6).setValues(vals);
  return ContentService.createTextOutput("UPDATED");
}

function handleCreatePlan(e, ss) {
  var dateStr = e.parameter.date; 
  var sheet = ss.getSheetByName(dateStr);
  
  if (!sheet) {
    sheet = ss.insertSheet(dateStr);
    var headers = [["#", "Lot No", "W/S", "Pallets/Cases", "Container ID", "Driver Phone", "ETA", "Start", "End", "Duration", "Zone", "Operator", "Photo Gen", "Photo Seal", "Photo Empty"]];
    sheet.getRange("A4:O4").setValues(headers).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(4);
  }
  
  var tasks = JSON.parse(e.parameter.tasks); 
  var lastRow = Math.max(sheet.getLastRow(), 4);
  
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var idx = lastRow - 3 + i;
    rows.push([
      idx, t.lot, t.ws, t.pallets, t.id, t.phone, t.eta, "", "", "", "", "", "", "", "" 
    ]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, 15).setValues(rows);
  }
  
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
      issues.push({
        id: id, timestamp: row[1], desc: row[2],
        photos: [row[3], row[4], row[5]].filter(Boolean),
        author: row[6]
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(issues)).setMimeType(ContentService.MimeType.JSON);
}

function handleGetAllContainers(ss) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
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
    s.getRange("A1:H1").setValues([["Container ID", "Timestamp", "Description", "Photo 1", "Photo 2", "Photo 3", "Author", "Email Status"]]);
    s.getRange("A1:H1").setFontWeight("bold");
  }
  var time = Utilities.formatDate(new Date(), "Europe/Moscow", "dd.MM.yyyy HH:mm:ss");
  
  var emailStatus = "Успешно отправлено"; 
  
  try {
    var emails = "MHReceiving@agr.auto"; 
    var subject = "Уведомление об инциденте: Контейнер " + e.parameter.id + " (Склад АГМ)";
    
    var htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px;">
      <h2 style="color: #B22222; font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
        Внимание: Зафиксирован инцидент при обработке груза
      </h2>
      <p>Уважаемые коллеги,</p>
      <p>Настоящим письмом информируем вас о выявленных несоответствиях при выгрузке контейнера.</p>
      
      <table style="border-collapse: collapse; width: 100%; margin-top: 15px; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 40%; background-color: #f9f9f9;">Номер контейнера:</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${e.parameter.id}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Время фиксации:</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${time}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f9f9f9;">Ответственный сотрудник:</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${e.parameter.author || "Не указан"}</td>
        </tr>
      </table>

      <h3 style="margin-top: 20px; font-size: 16px; color: #333;">Описание проблемы:</h3>
      <p style="background-color: #f4f4f4; padding: 15px; border-left: 4px solid #B22222; margin-top: 5px; font-size: 14px; white-space: pre-wrap;">${e.parameter.desc}</p>

      <p style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
        <em>* Фотоматериалы, подтверждающие инцидент, прикреплены к данному письму во вложениях.<br>
        Данное уведомление сформировано автоматически системой управления складом AGR Warehouse. Пожалуйста, не отвечайте на этот адрес.</em>
      </p>
    </div>
    `;
    
    var attachments = [];
    var photoUrls = [e.parameter.p1, e.parameter.p2, e.parameter.p3];
    
    for (var i = 0; i < photoUrls.length; i++) {
      var url = photoUrls[i];
      if (url && url.indexOf("drive.google.com") !== -1) {
        var fileIdMatch = url.match(/[-\w]{25,}/);
        if (fileIdMatch) {
           var file = DriveApp.getFileById(fileIdMatch[0]);
           attachments.push(file.getBlob());
        }
      }
    }
    
    var mailOptions = {
      to: emails,
      subject: subject,
      htmlBody: htmlBody
    };
    
    if (attachments.length > 0) {
      mailOptions.attachments = attachments;
    }
    
    MailApp.sendEmail(mailOptions);
    
  } catch(err) {
    emailStatus = "Ошибка: " + err.toString();
  }

  s.appendRow([e.parameter.id, time, e.parameter.desc, e.parameter.p1||"", e.parameter.p2||"", e.parameter.p3||"", e.parameter.author||"Anonymous", emailStatus]);

  return ContentService.createTextOutput("REPORTED");
}

function handleRegister(e, ss) {
  var s = ss.getSheetByName('DASHBOARD');
  if (!s) {
    s = ss.insertSheet('DASHBOARD');
    s.getRange("P1:T1").setValues([["Login", "Hash", "Name", "Role", "Status"]]);
  }
  var newRow = s.getLastRow() + 1;
  s.getRange(newRow, 16).setValue(e.parameter.user.toLowerCase().trim());
  s.getRange(newRow, 17).setValue(e.parameter.hash);
  s.getRange(newRow, 18).setValue(e.parameter.name);
  s.getRange(newRow, 19).setValue("OPERATOR"); 
  s.getRange(newRow, 20).setValue("PENDING");
  return ContentService.createTextOutput("REGISTERED");
}

function handleGetStats(ss){
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
        var status = "WAIT";
        var timeDisplay = row[6]; 
        if (row[8]) { status = "DONE"; timeDisplay = row[8]; } 
        else if (row[7]) { status = "ACTIVE"; timeDisplay = row[7]; } 
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

  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

function handleReadComplex(ss){
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet && !isNightCarryover()) return ContentService.createTextOutput("WAIT;0|0;---;00:00;0|0|0;0\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
  
  var total = 0, done = 0, nextId = "---", nextTime = "", activeRows = []; 
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
          else if (row[7]) activeRows.push(row[4] + "|" + row[7] + "|0|" + row[2] + "|" + row[10]); 
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
            activeRows.push(yRow[4] + "|" + yRow[7] + "|0|" + yRow[2] + "|" + yRow[10]);
          } else {
            if (nextId === "---") { nextId = yRow[4]; nextTime = yRow[6]; }
            if (yRow[15] && yRow[15] !== "") onTerritory++;
          }
        }
      }
    }
  }

  var status = (total > 0 && done === total) ? "DONE" : "ACTIVE";
  var body = status + ";" + done + "|" + total + ";" + nextId + ";" + nextTime + ";" + shiftMorning + "|" + shiftEvening + "|" + shiftNight + ";" + onTerritory;
  if (activeRows.length > 0) body += "\n" + activeRows.join("\n");
  
  try { syncDashboard(status, done, total, nextId, nextTime, activeRows, shiftMorning, shiftEvening, shiftNight, onTerritory); } catch(e) {}
  
  return ContentService.createTextOutput(body + "\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
}

function parseTimeToMin(timeStr) {
  var m = (timeStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function handleTaskAction(ss, e) {
  var id = e.parameter.id;
  var act = e.parameter.act; 
  var time = Utilities.formatDate(new Date(), "Europe/Moscow", "HH:mm");
  
  var todayName = getTodaySheetName();
  var sheet = ss.getSheetByName(todayName);
  if (sheet) {
    var result = applyTaskAction(sheet, id, act, time, e, todayName, ss);
    if (result) return result;
  }
  
  if (isNightCarryover()) {
    var yName = getYesterdaySheetName();
    var ySheet = ss.getSheetByName(yName);
    if (ySheet) {
      var yResult = applyTaskAction(ySheet, id, act, time, e, yName, ss);
      if (yResult) return yResult;
    }
  }
  
  return ContentService.createTextOutput("ID_NOT_FOUND");
}

function applyTaskAction(sheet, id, act, time, e, sheetName, ss) {
  var lr = sheet.getLastRow();
  if (lr < 5) return null;
  var data = sheet.getRange(5, 5, lr - 4, 1).getValues(); 
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === id) {
      var r = i + 5;
      if (act === 'start') {
         sheet.getRange(r, 8).setValue(time); 
         if(e.parameter.zone) sheet.getRange(r, 11).setValue(e.parameter.zone); 
         if(e.parameter.op) sheet.getRange(r, 12).setValue(e.parameter.op); 
         if(e.parameter.pGen) sheet.getRange(r, 13).setValue(e.parameter.pGen);
         if(e.parameter.pSeal) sheet.getRange(r, 14).setValue(e.parameter.pSeal);
      } else if (act === 'undo_start') {
         sheet.getRange(r, 8).setValue("");
         sheet.getRange(r, 11).setValue("");
         sheet.getRange(r, 12).setValue("");
         sheet.getRange(r, 13).setValue("");
         sheet.getRange(r, 14).setValue("");
      } else if (act === 'update_photo') {
         if(e.parameter.pGen) sheet.getRange(r, 13).setValue(e.parameter.pGen);
         if(e.parameter.pSeal) sheet.getRange(r, 14).setValue(e.parameter.pSeal);
         if(e.parameter.pEmpty) sheet.getRange(r, 15).setValue(e.parameter.pEmpty);
      } else { 
         sheet.getRange(r, 9).setValue(time); 
         if(e.parameter.pEmpty) sheet.getRange(r, 15).setValue(e.parameter.pEmpty);
      }
      try { syncTasks(sheetName, ss); } catch(err) {}
      return ContentService.createTextOutput("UPDATED");
    }
  }
  return null; 
}

function handleLogin(e, s) {
  var u = e.parameter.user.toLowerCase().trim();
  var h = e.parameter.hash;
  var d = s.getRange(2, 16, s.getLastRow(), 5).getDisplayValues(); 
  for (var i = 0; i < d.length; i++) {
    if (d[i][0].toLowerCase() === u && d[i][1] === h && d[i][4] === "APPROVED") {
      return ContentService.createTextOutput("CORRECT|" + d[i][2] + "|" + d[i][3]); 
    }
  }
  return ContentService.createTextOutput("WRONG");
}

function getTodaySheetName() {
  return Utilities.formatDate(new Date(), "Europe/Moscow", "dd.MM");
}

function getYesterdaySheetName() {
  var d = new Date();
  var yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return Utilities.formatDate(yesterday, "Europe/Moscow", "dd.MM");
}

function isNightCarryover() {
  var timeString = Utilities.formatDate(new Date(), "Europe/Moscow", "HH:mm");
  var parts = timeString.split(":");
  var mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  return mins < 390; 
}

function checkTimersAndAlert() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return;
  
  var lr = sheet.getLastRow();
  if (lr < 5) return;
  
  var data = sheet.getRange(5, 1, lr - 4, 17).getValues(); 
  var emails = "MHReceiving@agr.auto"; 
  var nowMin = parseTimeToMin(Utilities.formatDate(new Date(), "Europe/Moscow", "HH:mm"));
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[4];
    var start = row[7];
    var end = row[8];
    var zone = row[10];
    var alertFlag = row[16]; 
    
    if (id && start && !end && alertFlag !== "ALERT_SENT") {
       var startMin = parseTimeToMin(start);
       if (startMin !== null) {
          var diff = nowMin - startMin;
          if (diff < -60) diff += 1440; 
          
          if (diff >= 60) {
             var subject = "⚠️ ДОЛГАЯ ВЫГРУЗКА: " + id;
             var body = "Контейнер " + id + " на зоне " + (zone || "Не указана") + " выгружается уже " + diff + " минут!\n" +
                        "Оператор: " + (row[11] || "Неизвестен") + "\n" +
                        "Время начала: " + start;
             
             MailApp.sendEmail(emails, subject, body);
             sheet.getRange(i + 5, 17).setValue("ALERT_SENT");
          }
       }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL FUNCTIONS (ИСПРАВЛЕННЫЕ)
// ══════════════════════════════════════════════════════════════════════════════

function handleGetPending(ss) {
  try {
    var sheet = ss.getSheetByName('DASHBOARD');
    if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    
    var lr = sheet.getLastRow();
    if (lr < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    
    // Читаем колонки P, Q, R, S, T
    var data = sheet.getRange(2, 16, lr - 1, 5).getDisplayValues();
    var pending = [];
    
    for (var i = 0; i < data.length; i++) {
      var status = (data[i][4] || "").toString().trim().toUpperCase();
      
      if (status === "PENDING") {
        pending.push({
          login:  (data[i][0] || "").toString().trim(),
          user:   (data[i][0] || "").toString().trim(), // Дублируем ключ, чтобы фронт 100% его съел
          name:   (data[i][2] || "").toString().trim(),
          role:   (data[i][3] || "").toString().trim(),
          status: status
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify(pending)).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({error: e.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApproveUser(e, ss) {
  var sheet = ss.getSheetByName('DASHBOARD');
  var login = (e.parameter.login || "").toLowerCase().trim();
  var role = e.parameter.role || "OPERATOR";
  
  var lr = sheet.getLastRow();
  if (lr < 2) return ContentService.createTextOutput("ERROR");
  
  var data = sheet.getRange(2, 16, lr - 1, 1).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toLowerCase().trim() === login) {
      sheet.getRange(i + 2, 19).setValue(role);
      sheet.getRange(i + 2, 20).setValue("APPROVED");
      return ContentService.createTextOutput("APPROVED");
    }
  }
  return ContentService.createTextOutput("NOT_FOUND");
}

function handleRejectUser(e, ss) {
  var sheet = ss.getSheetByName('DASHBOARD');
  var login = (e.parameter.login || "").toLowerCase().trim();
  
  var lr = sheet.getLastRow();
  if (lr < 2) return ContentService.createTextOutput("ERROR");
  
  var data = sheet.getRange(2, 16, lr - 1, 1).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toLowerCase().trim() === login) {
      sheet.deleteRow(i + 2);
      return ContentService.createTextOutput("REJECTED");
    }
  }
  return ContentService.createTextOutput("NOT_FOUND");
}

// ══════════════════════════════════════════════════════════════════════════════
// FIREBASE FIRESTORE SYNC
// ══════════════════════════════════════════════════════════════════════════════

var FIREBASE_PROJECT = "agm-warehouse";

function firestoreWrite(path, data) {
  try {
    var token = ScriptApp.getOAuthToken();
    var url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT +
              "/databases/(default)/documents/" + path;
    var payload = { fields: toFirestoreFields(data) };
    UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("Firestore sync error: " + e.toString());
  }
}

function toFirestoreFields(obj) {
  var fields = {};
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    fields[key] = toFirestoreValue(obj[key]);
  }
  return fields;
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    return { mapValue: { fields: toFirestoreFields(val) } };
  }
  return { stringValue: String(val) };
}

function syncDashboard(status, done, total, nextId, nextTime, activeList, shiftM, shiftE, shiftN, onTerr) {
  var active = [];
  for (var i = 0; i < activeList.length; i++) {
    var parts = activeList[i].split("|");
    active.push({ id: parts[0] || "", start: parts[1] || "", zone: parts[4] || "" });
  }
  firestoreWrite("dashboard/today", {
    status: status,
    done: done,
    total: total,
    nextId: nextId,
    nextTime: nextTime,
    activeList: active,
    shiftCounts: { morning: shiftM, evening: shiftE, night: shiftN },
    onTerritory: onTerr,
    updatedAt: Date.now()
  });
}

function syncTasks(dateStr, ss) {
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return;
  var lr = sheet.getLastRow();
  if (lr < 5) return;
  
  var data = sheet.getRange(5, 1, lr - 4, 16).getDisplayValues();
  var tasks = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[4]) continue;
    var status = "WAIT";
    if (row[8] !== "") status = "DONE";
    else if (row[7] !== "") status = "ACTIVE";
    tasks.push({
      id: row[4], type: row[2], pallets: row[3], phone: row[5],
      eta: row[6], status: status, start_time: row[7], end_time: row[8],
      zone: row[10], operator: row[11],
      photo_gen: row[12], photo_seal: row[13], photo_empty: row[14],
      arrival_time: row[15]
    });
  }
  firestoreWrite("tasks/" + dateStr, { tasks: tasks, updatedAt: Date.now() });
}

function syncPriorityLot(lot) {
  firestoreWrite("config/priority_lot", { lot: lot, updatedAt: Date.now() });
}

function testEmailSending() {
  Logger.log("Отправляем чистый тест...");
  MailApp.sendEmail("matsukevich12312@gmail.com", "Чистый тест системы AGR", "Если ты это читаешь, баг побежден!");
  Logger.log("Чистый тест завершен.");
}