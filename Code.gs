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

    // 11. ADMIN: GET USERS
    if (e.parameter.mode === "get_users") {
       try { return handleGetUsers(ss); }
       catch (err) { return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON); }
    }

    // 12. ADMIN: UPDATE USER
    if (e.parameter.mode === "update_user") {
       if (lock.tryLock(10000)) {
         try { return handleUpdateUser(e, ss); }
         finally { lock.releaseLock(); }
       }
    }
    
    // 12a. ADMIN: UPDATE USER NAME
    if (e.parameter.mode === "update_user_name") {
       if (lock.tryLock(10000)) {
         try { return handleUpdateUserName(e, ss); }
         finally { lock.releaseLock(); }
       }
    }

    // 13. ADMIN: DELETE USER
    if (e.parameter.mode === "delete_user") {
       if (lock.tryLock(10000)) {
         try { return handleDeleteUser(e, ss); }
         finally { lock.releaseLock(); }
       }
    }
    
    // 14. MESSENGER: GET MESSAGES
    if (e.parameter.mode === "get_messages") {
      try { return handleGetMessages(ss); }
      catch (err) { return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON); }
    }

    // 15. MESSENGER: SEND MESSAGE
    if (e.parameter.mode === "send_message") {
       if (lock.tryLock(10000)) {
         try { return handleSendMessage(e, ss); }
         finally { lock.releaseLock(); }
       }
    }
    
    // 16. MESSENGER: CLEAR MESSAGES
    if (e.parameter.mode === "clear_messages") {
       if (lock.tryLock(10000)) {
         try { return handleClearMessages(ss); }
         finally { lock.releaseLock(); }
       }
    }

  } catch (err) { 
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON); 
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.mode === "upload_photo") {
      var imageStr = data.image.split(",")[1]; 
      var blob = Utilities.newBlob(Utilities.base64Decode(imageStr), data.mimeType, data.filename);
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", url: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("UNKNOWN_MODE");
  } catch (e) { return ContentService.createTextOutput("POST_ERROR"); }
}

// === HELPER FUNCTIONS ===

function handleGetUsers(ss) {
  var s = ss.getSheetByName('DASHBOARD');
  if (!s) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  
  var lr = s.getLastRow();
  if (lr < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  
  // Read Cols P:T (16:20) starting from row 2
  // Safe read
  var data = s.getRange(2, 16, lr - 1, 5).getDisplayValues();
  var users = [];
  
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // Login(0), Hash(1), Name(2), Role(3), Status(4)
    if (r[0]) {
      users.push({
        user: r[0],
        name: r[2],
        role: r[3],
        status: r[4],
        rowIndex: i + 2
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(users)).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateUser(e, ss) {
  var s = ss.getSheetByName('DASHBOARD');
  if (!s) return ContentService.createTextOutput("NO_SHEET");
  
  var rowIndex = parseInt(e.parameter.row);
  if (!rowIndex || rowIndex < 2) return ContentService.createTextOutput("INVALID_ROW");
  
  s.getRange(rowIndex, 19).setValue(e.parameter.role);
  s.getRange(rowIndex, 20).setValue(e.parameter.status);
  
  return ContentService.createTextOutput("UPDATED");
}

function handleUpdateUserName(e, ss) {
  var s = ss.getSheetByName('DASHBOARD');
  if (!s) return ContentService.createTextOutput("NO_SHEET");
  
  var rowIndex = parseInt(e.parameter.row);
  if (!rowIndex || rowIndex < 2) return ContentService.createTextOutput("INVALID_ROW");
  
  s.getRange(rowIndex, 18).setValue(e.parameter.name);
  return ContentService.createTextOutput("UPDATED");
}

function handleDeleteUser(e, ss) {
  var s = ss.getSheetByName('DASHBOARD');
  if (!s) return ContentService.createTextOutput("NO_SHEET");
  
  var rowIndex = parseInt(e.parameter.row);
  if (!rowIndex || rowIndex < 2) return ContentService.createTextOutput("INVALID_ROW");
  
  s.deleteRow(rowIndex);
  return ContentService.createTextOutput("DELETED");
}

function handleGetMessages(ss) {
  var s = ss.getSheetByName('MESSAGES');
  if (!s) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  
  var lr = s.getLastRow();
  var start = Math.max(1, lr - 49); 
  var numRows = lr - start + 1;
  if (numRows <= 0) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  
  var data = s.getRange(start, 1, numRows, 3).getDisplayValues();
  var msgs = [];
  
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    msgs.push({
      timestamp: r[0],
      user: r[1],
      text: r[2],
      id: (start + i).toString()
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify(msgs)).setMimeType(ContentService.MimeType.JSON);
}

function handleSendMessage(e, ss) {
  var s = ss.getSheetByName('MESSAGES');
  if (!s) {
    s = ss.insertSheet('MESSAGES');
    s.getRange("A1:C1").setValues([["Timestamp", "User", "Message"]]);
    s.getRange("A1:C1").setFontWeight("bold");
  }
  var time = new Date().toLocaleString('ru-RU');
  s.appendRow([time, e.parameter.user, e.parameter.text]);
  return ContentService.createTextOutput("SENT");
}

function handleClearMessages(ss) {
  var s = ss.getSheetByName('MESSAGES');
  if (s) {
    var lr = s.getLastRow();
    if (lr > 1) {
       s.getRange(2, 1, lr - 1, 3).clearContent();
    }
  }
  return ContentService.createTextOutput("CLEARED");
}

function handleGetHistory(ss, e) {
  var dateStr = e.parameter.date; 
  var sheet = ss.getSheetByName(dateStr);
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  // Safety: Limit columns to actual sheet size to prevent crashes on old sheets
  var maxCols = Math.min(16, sheet.getMaxColumns());
  var data = sheet.getRange(5, 1, lr - 4, maxCols).getDisplayValues();
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
        duration: row[9],
        zone: row[10] || "",
        operator: row[11] || "",
        photo_gen: row[12] || "", 
        photo_seal: row[13] || "", 
        photo_empty: row[14] || "",
        photo_inspect: row[15] || ""
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
         index: r[0],
         lot: r[1],
         ws: r[2],
         pallets: r[3],
         id: r[4],
         phone: r[5],
         eta: r[6],
         rowIndex: i + 5 
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
    var headers = [["#", "Lot No", "W/S", "Pallets/Cases", "Container ID", "Driver Phone", "ETA", "Start", "End", "Duration", "Zone", "Operator", "Photo Gen", "Photo Seal", "Photo Empty", "Photo Inspect"]];
    sheet.getRange("A4:P4").setValues(headers).setFontWeight("bold").setBackground("#EEE");
    sheet.setFrozenRows(4);
  }
  
  var tasks = JSON.parse(e.parameter.tasks); 
  var lastRow = Math.max(sheet.getLastRow(), 4);
  
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var idx = lastRow - 3 + i;

    rows.push([
      idx, t.lot, t.ws, t.pallets, t.id, t.phone, t.eta, "", "", "", "", "", "", "", "", "" 
    ]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, 16).setValues(rows);
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
    s.getRange("A1:C1").setValues([["Container ID", "Timestamp", "Description", "Photo 1", "Photo 2", "Photo 3", "Author"]]);
    s.getRange("A1:C1").setFontWeight("bold");
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

  // FIXED: Safety check for columns to prevent crash on old sheets
  var maxCols = Math.min(16, sheet.getMaxColumns());
  var data = sheet.getRange(5, 1, lr - 4, maxCols).getDisplayValues();
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
        end_time: row[8],
        duration: row[9] || ""
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
  // FIXED: Ensure range height is positive
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
  
  var lr = sheet.getLastRow();
  if (lr < 5) return ContentService.createTextOutput("ID_NOT_FOUND");
  
  // FIXED: Correct range calculation
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
      } else { 
         sheet.getRange(r, 9).setValue(time); 
         var startTime = sheet.getRange(r, 8).getDisplayValue(); 
         if (startTime) {
           var dur = calculateDuration(startTime, time);
           sheet.getRange(r, 10).setValue(dur);
         }
         if(e.parameter.pEmpty) sheet.getRange(r, 15).setValue(e.parameter.pEmpty);
         if(e.parameter.pInspect) sheet.getRange(r, 16).setValue(e.parameter.pInspect);
      }
      return ContentService.createTextOutput("UPDATED");
    }
  }
  return ContentService.createTextOutput("ID_NOT_FOUND");
}

function handleLogin(e, s) {
  var u = e.parameter.user.toLowerCase().trim();
  var h = e.parameter.hash;
  
  var lr = s.getLastRow();
  if (lr < 2) return ContentService.createTextOutput("WRONG");
  
  // FIXED: Correct range calculation
  var d = s.getRange(2, 16, lr - 1, 5).getDisplayValues(); 
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

function calculateDuration(start, end) {
  try {
    var s = start.split(":");
    var e = end.split(":");
    if (s.length < 2 || e.length < 2) return "";
    var sMin = parseInt(s[0], 10) * 60 + parseInt(s[1], 10);
    var eMin = parseInt(e[0], 10) * 60 + parseInt(e[1], 10);
    if (eMin < sMin) eMin += 24 * 60; // Handle midnight crossing
    var diff = eMin - sMin;
    var h = Math.floor(diff / 60);
    var m = diff % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
  } catch(e) { return ""; }
}