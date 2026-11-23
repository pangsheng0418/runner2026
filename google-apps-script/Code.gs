/**
 * TUR 路跑活動線上報名平台 — 統一單一 Google 試算表資料庫 (GAS Web App)
 *
 * 比照晶片計時系統資料庫模式：全平台只需部署「同一份」Google 試算表！
 * 系統會自動在這份試算表建立：
 *   1. _DB_Admins        （承辦人帳號資料，互相獨立隔離）
 *   2. _DB_Events        （所有活動設定、報名狀態與起訖日期）
 *   3. _DB_Registrations （所有活動完整報名資料）
 *   4. 各活動專屬分頁     （自動以活動名稱建立，方便承辦人直接檢視表格式名單）
 *
 * 部署步驟（只需做一次）：
 * 1. 開啟一份專用的 Google 試算表 -> 上方選單「擴充功能」->「Apps Script」
 * 2. 將本檔案完整程式碼貼入 Code.gs 並儲存
 * 3. 點擊右上角「部署」->「新增部署作業」-> 類型選「網頁應用程式」
 *    - 執行身分：我（你的 Google 帳號）
 *    - 誰可以存取：所有人
 * 4. 複製產生的「網頁應用程式網址」（https://script.google.com/macros/s/.../exec）
 * 5. 將該網址貼到伺服器 / Vercel 環境變數 GOOGLE_MASTER_GAS_URL，全平台即自動指向同一資料庫！
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = payload.action || 'ping';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==================== 統一資料庫核心動作 ====================
    if (action === 'db_pull_all') {
      var tables = payload.tables || {};
      var result = { ok: true };
      Object.keys(tables).forEach(function (key) {
        var cfg = tables[key];
        var sh = getOrCreateSheet_(ss, cfg.tabName);
        ensureExactHeaderRow_(sh, cfg.headers || []);
        result[key] = readSheetAsObjects_(sh, cfg.headers || []);
      });
      return jsonResponse_(result);
    }

    if (action === 'db_replace_all') {
      var replaceTables = payload.tables || {};
      Object.keys(replaceTables).forEach(function (key) {
        var cfg = replaceTables[key];
        replaceTableData_(ss, cfg.tabName, cfg.headers || [], cfg.rows || []);
      });
      return jsonResponse_({ ok: true });
    }

    if (action === 'db_replace_table') {
      replaceTableData_(ss, payload.tabName, payload.headers || [], payload.rows || []);
      return jsonResponse_({ ok: true });
    }

    if (action === 'db_upsert_row') {
      var upsertSheet = getOrCreateSheet_(ss, payload.tabName);
      var headers = payload.headers || [];
      ensureExactHeaderRow_(upsertSheet, headers);
      var keyField = payload.keyField || 'id';
      var keyValue = String(payload.keyValue || '');
      var rowValues = payload.rowValues || [];
      var keyIdx = headers.indexOf(keyField);
      if (keyIdx === -1) {
        return jsonResponse_({ ok: false, error: '找不到主鍵欄位：' + keyField });
      }
      var lastRow = upsertSheet.getLastRow();
      var foundRow = -1;
      if (lastRow >= 2) {
        var keyColValues = upsertSheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < keyColValues.length; i++) {
          if (String(keyColValues[i][0]) === keyValue) {
            foundRow = i + 2;
            break;
          }
        }
      }
      if (foundRow !== -1) {
        upsertSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        upsertSheet.appendRow(rowValues);
      }
      return jsonResponse_({ ok: true });
    }

    if (action === 'db_delete_rows') {
      var delSheet = ss.getSheetByName(payload.tabName);
      if (!delSheet) return jsonResponse_({ ok: true, deleted: 0 });
      var allData = delSheet.getDataRange().getValues();
      if (allData.length < 2) return jsonResponse_({ ok: true, deleted: 0 });
      var delHeaders = allData[0].map(function (v) { return String(v).trim(); });
      var delKeyIdx = delHeaders.indexOf(payload.keyField || 'id');
      if (delKeyIdx === -1) return jsonResponse_({ ok: true, deleted: 0 });
      var targetVal = String(payload.keyValue || '');
      var deleted = 0;
      for (var r = allData.length - 1; r >= 1; r--) {
        if (String(allData[r][delKeyIdx]) === targetVal) {
          delSheet.deleteRow(r + 1);
          deleted++;
        }
      }
      return jsonResponse_({ ok: true, deleted: deleted });
    }

    // ==================== 活動專屬可視化分頁動作 ====================
    var tabName = payload.tabName || '報名資料';
    var sheet = getOrCreateSheet_(ss, tabName);

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        sheetTitle: ss.getName(),
        tabName: sheet.getName(),
      });
    }

    if (action === 'sync_headers') {
      var syncedHeaders = syncHeaders_(sheet, payload.headers || []);
      return jsonResponse_({ ok: true, headers: syncedHeaders });
    }

    if (action === 'append_row') {
      var expectedHeaders = payload.headers || [];
      var rowMap = payload.rowMap || {};
      var currentHeaders = syncHeaders_(sheet, expectedHeaders);
      var rowOut = currentHeaders.map(function (h) {
        return rowMap[h] !== undefined && rowMap[h] !== null ? rowMap[h] : '';
      });
      sheet.appendRow(rowOut);
      return jsonResponse_({ ok: true, rowNumber: sheet.getLastRow() });
    }

    if (action === 'pull_rows') {
      var values = sheet.getDataRange().getValues();
      if (values.length === 0) {
        return jsonResponse_({ ok: true, headers: [], rows: [] });
      }
      var colHeaders = values[0].map(function (v) { return String(v).trim(); });
      var rows = [];
      for (var rr = 1; rr < values.length; rr++) {
        var obj = {};
        for (var cc = 0; cc < colHeaders.length; cc++) {
          var cellVal = values[rr][cc];
          if (cellVal instanceof Date) {
            obj[colHeaders[cc]] = Utilities.formatDate(cellVal, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
          } else {
            obj[colHeaders[cc]] = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
          }
        }
        rows.push({ rowNumber: rr + 1, data: obj });
      }
      return jsonResponse_({ ok: true, headers: colHeaders, rows: rows });
    }

    if (action === 'update_payment_status') {
      var regCode = String(payload.regCode || '').trim();
      var paymentStatus = String(payload.paymentStatus || '').trim();
      var allValues = sheet.getDataRange().getValues();
      if (allValues.length >= 2) {
        var hRow = allValues[0].map(function (v) { return String(v).trim(); });
        var regIdx = hRow.indexOf('報名序號');
        var statusIdx = hRow.indexOf('繳費狀態');
        if (regIdx !== -1 && statusIdx !== -1) {
          for (var idx = 1; idx < allValues.length; idx++) {
            if (String(allValues[idx][regIdx]).trim() === regCode) {
              sheet.getRange(idx + 1, statusIdx + 1).setValue(paymentStatus);
              return jsonResponse_({ ok: true, updatedRow: idx + 1 });
            }
          }
        }
      }
      return jsonResponse_({ ok: true, updatedRow: null });
    }

    if (action === 'update_bib') {
      var bRegCode = String(payload.regCode || '').trim();
      var bibNumber = String(payload.bibNumber || '').trim();
      var categoryCode = String(payload.categoryCode || '').trim();
      var bValues = sheet.getDataRange().getValues();
      if (bValues.length >= 2) {
        var bhRow = bValues[0].map(function (v) { return String(v).trim(); });
        var bRegIdx = bhRow.indexOf('報名序號');
        var bibIdx = bhRow.indexOf('參賽編號');
        var catIdx = bhRow.indexOf('分組代碼');
        if (bRegIdx !== -1) {
          for (var bi = 1; bi < bValues.length; bi++) {
            if (String(bValues[bi][bRegIdx]).trim() === bRegCode) {
              if (bibIdx !== -1) sheet.getRange(bi + 1, bibIdx + 1).setValue(bibNumber);
              if (catIdx !== -1 && categoryCode) sheet.getRange(bi + 1, catIdx + 1).setValue(categoryCode);
              return jsonResponse_({ ok: true, updatedRow: bi + 1 });
            }
          }
        }
      }
      return jsonResponse_({ ok: true, updatedRow: null });
    }

    if (action === 'update_row') {
      var uRegCode = String(payload.regCode || '').trim();
      var uHeaders = syncHeaders_(sheet, payload.headers || []);
      var uRowMap = payload.rowMap || {};
      var uValues = sheet.getDataRange().getValues();
      var uRegIdx = uHeaders.indexOf('報名序號');
      var uRowOut = uHeaders.map(function (h) {
        return uRowMap[h] !== undefined && uRowMap[h] !== null ? uRowMap[h] : '';
      });
      if (uRegIdx !== -1 && uValues.length >= 2) {
        for (var ui = 1; ui < uValues.length; ui++) {
          if (String(uValues[ui][uRegIdx]).trim() === uRegCode) {
            sheet.getRange(ui + 1, 1, 1, uRowOut.length).setValues([uRowOut]);
            return jsonResponse_({ ok: true, updatedRow: ui + 1 });
          }
        }
      }
      sheet.appendRow(uRowOut);
      return jsonResponse_({ ok: true, updatedRow: sheet.getLastRow() });
    }

    // ==================== 免費內建 Gmail 寄送選手報名確認信 ====================
    if (action === 'send_email') {
      var toEmail = String(payload.to || '').trim();
      var subject = String(payload.subject || '').trim();
      var htmlBody = String(payload.html || '');
      var textBody = String(payload.text || '');
      if (!toEmail || !subject) {
        return jsonResponse_({ ok: false, error: '缺少收件者 Email 或信件主旨' });
      }
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: textBody || '請使用支援 HTML 的電子郵件客戶端檢視此信件。',
        htmlBody: htmlBody || undefined,
        name: payload.senderName || 'TUR 活動報名平台',
      });
      return jsonResponse_({ ok: true, sent: true });
    }

    return jsonResponse_({ ok: false, error: '不支援的 action：' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getOrCreateSheet_(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureExactHeaderRow_(sheet, headers) {
  if (!headers || headers.length === 0) return;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function readSheetAsObjects_(sheet, expectedHeaders) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (v) { return String(v).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var hasAny = false;
    for (var c = 0; c < headers.length; c++) {
      var val = values[r][c];
      var str = val instanceof Date
        ? Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss')
        : (val !== undefined && val !== null ? String(val) : '');
      if (str !== '') hasAny = true;
      obj[headers[c]] = str;
    }
    if (!hasAny) continue;
    for (var k = 0; k < expectedHeaders.length; k++) {
      if (obj[expectedHeaders[k]] === undefined) obj[expectedHeaders[k]] = '';
    }
    out.push(obj);
  }
  return out;
}

function replaceTableData_(ss, tabName, headers, rows) {
  var sh = getOrCreateSheet_(ss, tabName);
  sh.clearContents();
  var matrix = [headers].concat(rows || []);
  if (matrix.length > 0 && headers.length > 0) {
    sh.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
    sh.setFrozenRows(1);
  }
}

function syncHeaders_(sheet, expectedHeaders) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var currentHeaders = lastRow >= 1 && lastCol >= 1
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); }).filter(Boolean)
    : [];

  var finalHeaders;
  if (lastRow <= 1 || currentHeaders.length === 0) {
    finalHeaders = expectedHeaders;
  } else {
    finalHeaders = currentHeaders.slice();
    expectedHeaders.forEach(function (h) {
      if (finalHeaders.indexOf(h) === -1) {
        finalHeaders.push(h);
      }
    });
  }

  if (finalHeaders.length > 0) {
    var range = sheet.getRange(1, 1, 1, finalHeaders.length);
    range.setValues([finalHeaders]);
    range.setBackground('#0F172A');
    range.setFontColor('#FFFFFF');
    range.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return finalHeaders;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
