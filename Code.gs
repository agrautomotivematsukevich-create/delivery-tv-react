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
  
  // 4aa. PROXY PHOTO (Base64)
  if (e.parameter.mode === "get_photo") {
    try {
      return handleGetPhoto(e);
    } catch (err) {
      return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
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
    
    // 8. CREATE PLAN (Logistics)
    if (e.parameter.mode === "create_plan") {
       if (lock.tryLock(10000)) {
         try { return handleCreatePlan(e, ss); }
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

    // 9. LOGIN
    if (e.parameter.mode === "login") {
       var settingsSheet = ss.getSheetByName('DASHBOARD'); 
       if(!settingsSheet) return ContentService.createTextOutput("CORRECT"); 
       return handleLogin(e, settingsSheet);
    }
    
    // 10. REGISTER
    if (e.parameter.mode === "register") {
       if (lock.tryLock(10000)) {
         try { return handleRegister(e, ss); }
         finally { lock.releaseLock(); }
       }
    }

  } catch (err) { 
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON); 
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.mode === "upload_photo") {
      var imageStr = data.image.split(",")[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(imageStr), data.mimeType, data.filename);
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      registerProxyFileId_(file.getId());
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", url: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.mode === "create_plan") {
      if (!lock.tryLock(10000)) return ContentService.createTextOutput("BUSY");
      try {
        var eventObj = { parameter: { date: data.date, tasks: JSON.stringify(data.tasks || []) } };
        return handleCreatePlan(eventObj, ss);
      } finally {
        lock.releaseLock();
      }
    }

    if (data.mode === "update_container_row") {
      if (!lock.tryLock(10000)) return ContentService.createTextOutput("BUSY");
      try {
        var updEvent = { parameter: {
          date: data.date,
          row: data.row,
          lot: data.lot,
          ws: data.ws,
          pallets: data.pallets,
          id: data.id,
          phone: data.phone,
          eta: data.eta
        } };
        return handleUpdateContainerRow(updEvent, ss);
      } finally {
        lock.releaseLock();
      }
    }

    return ContentService.createTextOutput("UNKNOWN_MODE");
  } catch (error) {
    return ContentService.createTextOutput("POST_ERROR");
  }
}

// === HELPER FUNCTIONS ===

function handleGetPhoto(e) {
  var fileId = e.parameter.id;
  if (!isValidDriveFileId_(fileId)) {
    return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
  }

  if (!isFileIdAllowedForProxy_(fileId)) {
    return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var b64 = Utilities.base64Encode(blob.getBytes());
    var payload = {
      data: b64,
      mime: blob.getContentType() || "image/jpeg"
    };
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
  }
}

function isValidDriveFileId_(fileId) {
  if (!fileId) return false;
  return /^[a-zA-Z0-9_-]{20,}$/.test(fileId);
}

function isFileIdAllowedForProxy_(fileId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return false;

  var registrySheet = ss.getSheetByName("PHOTO_UPLOADS");
  if (!registrySheet) return false;

  var lastRow = registrySheet.getLastRow();
  if (lastRow < 2) return false;

  var values = registrySheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === fileId) return true;
  }

  return false;
}

function registerProxyFileId_(fileId) {
  if (!isValidDriveFileId_(fileId)) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  var registrySheet = ss.getSheetByName("PHOTO_UPLOADS");
  if (!registrySheet) {
    registrySheet = ss.insertSheet("PHOTO_UPLOADS");
    registrySheet.getRange("A1:B1").setValues([["File ID", "Uploaded At"]]).setFontWeight("bold");
  }

  var lastRow = registrySheet.getLastRow();
  if (lastRow >= 2) {
    var ids = registrySheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === fileId) return;
    }
  }

  registrySheet.appendRow([fileId, new Date()]);
}

function handleGetHistory(ss, e) {
  var dateStr = e.parameter.date; // Expecting "DD.MM"
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var data = sheet.getRange(5, 1, lr - 4, 15).getDisplayValues();
  var tasks = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = row[4]; 
    if (id && id !== "") {
      var status = "WAIT";
      if (row[8] !== "") status = "DONE";
      else if (row[7] !== "") status = "ACTIVE";
      
      tasks.push({
        id: id, 
        type: row[2],
        pallets: row[3],
        phone: row[5],
        eta: row[6],
        status: status, 
        start_time: row[7], 
        end_time: row[8],
        zone: row[10],
        operator: row[11],
        photo_gen: row[12], 
        photo_seal: row[13], 
        photo_empty: row[14]
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

  // Read Cols A-G (Index 1-7)
  var data = sheet.getRange(5, 1, lr - 4, 7).getDisplayValues();
  var rows = [];

  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // A: Index (0), B: Lot (1), C: WS (2), D: Pallets (3), E: ID (4), F: Phone (5), G: ETA (6)
    if (r[4]) { // ID exists
      rows.push({
         index: r[0],
         lot: r[1],
         ws: r[2],
         pallets: r[3],
         id: r[4],
         phone: r[5],
         eta: r[6],
         rowIndex: i + 5 // Actual Sheet Row
      });
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

  // Params: lot, ws, pallets, id, phone, eta
  // Write to B(2):G(7)
  var vals = [[
    e.parameter.lot,
    e.parameter.ws,
    e.parameter.pallets,
    e.parameter.id,
    e.parameter.phone,
    e.parameter.eta
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
      idx,         
      t.lot,       
      t.ws,        
      t.pallets,   
      t.id,        
      t.phone,     
      t.eta,       
      "", "", "", "", "", "", "", "" 
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
    s.getRange("A1:G1").setValues([["Container ID", "Timestamp", "Description", "Photo 1", "Photo 2", "Photo 3", "Author"]]);
    s.getRange("A1:G1").setFontWeight("bold");
  }
  var time = new Date().toLocaleString('ru-RU');
  s.appendRow([e.parameter.id, time, e.parameter.desc, e.parameter.p1||"", e.parameter.p2||"", e.parameter.p3||"", e.parameter.author||"Anonymous"]);
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
      var status = "WAIT";
      var timeDisplay = row[6]; 
      if (row[8]) { status = "DONE"; timeDisplay = row[8]; } 
      else if (row[7]) { status = "ACTIVE"; timeDisplay = row[7]; } 
      tasks.push({
        id: id, 
        type: row[2], 
        pallets: row[3], 
        phone: row[5], 
        eta: row[6],
        status: status, 
        time: timeDisplay, 
        start_time: row[7], 
        end_time: row[8]
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

function handleReadComplex(ss){
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("WAIT;0|0;---;00:00\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
  var lr = sheet.getLastRow();
  var d = []; 
  if(lr >= 5) d = sheet.getRange(5,1,lr-4,11).getDisplayValues(); 
  var total = 0, done = 0, nextId = "---", nextTime = "", activeRows = []; 
  for(var i=0; i<d.length; i++){
    var row = d[i];
    if(row[4]){ 
      total++;
      if(row[8]) done++; 
      else if(row[7]) activeRows.push(row[4] + "|" + row[7] + "|0|" + row[2] + "|" + row[10]); 
      else if(nextId === "---") { nextId = row[4]; nextTime = row[6]; } 
    }
  }
  var status = (total>0 && done===total) ? "DONE" : "ACTIVE";
  var body = status + ";" + done + "|" + total + ";" + nextId + ";" + nextTime;
  if (activeRows.length > 0) body += "\n" + activeRows.join("\n");
  return ContentService.createTextOutput(body + "\n###MSG###").setMimeType(ContentService.MimeType.TEXT);
}

function handleTaskAction(ss, e) {
  var sheet = ss.getSheetByName(getTodaySheetName());
  if (!sheet) return ContentService.createTextOutput("NO_SHEET");
  var id = e.parameter.id;
  var act = e.parameter.act; 
  var time = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
  var data = sheet.getRange(5, 5, sheet.getLastRow(), 1).getValues(); 
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === id) {
      var r = i + 5;
      if (act === 'start') {
         sheet.getRange(r, 8).setValue(time); 
         if(e.parameter.zone) sheet.getRange(r, 11).setValue(e.parameter.zone); 
         if(e.parameter.op) sheet.getRange(r, 12).setValue(e.parameter.op); 
         if(e.parameter.pGen) sheet.getRange(r, 13).setValue(e.parameter.pGen);
         if(e.parameter.pSeal) sheet.getRange(r, 14).setValue(e.parameter.pSeal);
      } else { 
         sheet.getRange(r, 9).setValue(time); 
         if(e.parameter.pEmpty) sheet.getRange(r, 15).setValue(e.parameter.pEmpty);
      }
      return ContentService.createTextOutput("UPDATED");
    }
  }
  return ContentService.createTextOutput("ID_NOT_FOUND");
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

function getTodaySheetName(){
  var t=new Date();
  return ("0"+t.getDate()).slice(-2)+"."+("0"+(t.getMonth()+1)).slice(-2);
}
