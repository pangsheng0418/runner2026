/**
 * RunFlow 路跑活動線上報名系統 — Google Apps Script Webhook 雙向同步範本
 *
 * 使用步驟：
 * 1. 開啟目標 Google 試算表 -> 上方選單「擴充功能」->「Apps Script」
 * 2. 將本檔案程式碼完整貼入 Code.gs 並儲存
 * 3. 點擊右上角「部署」->「新增部署作業」-> 類型選「網頁應用程式」
 *    - 執行身分：我（你的 Google 帳號）
 *    - 誰可以存取：所有人
 * 4. 複製部署產生的「網頁應用程式網址」（https://script.google.com/macros/s/.../exec）
 * 5. 貼至 RunFlow 後台「Google 試算表設定」-> 選擇「GAS Webhook 模式」即可！
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var action = payload.action || 'ping';
    var tabName = payload.tabName || '報名資料';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrCreateSheet_(ss, tabName);

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        sheetTitle: ss.getName(),
        tabName: sheet.getName(),
      });
    }

    if (action === 'sync_headers') {
      var headers = syncHeaders_(sheet, payload.headers || []);
      return jsonResponse_({ ok: true, headers: headers });
    }

    if (action === 'append_row') {
      var expectedHeaders = payload.headers || [];
      var rowMap = payload.rowMap || {};
      var currentHeaders = ensureHeadersForAppend_(sheet, expectedHeaders);
      var rowValues = currentHeaders.map(function (h) {
        return rowMap[h] !== undefined && rowMap[h] !== null ? rowMap[h] : '';
      });
      sheet.appendRow(rowValues);
      var lastRow = sheet.getLastRow();
      return jsonResponse_({ ok: true, rowNumber: lastRow });
    }

    if (action === 'pull_rows') {
      var values = sheet.getDataRange().getValues();
      if (values.length === 0) {
        return jsonResponse_({ ok: true, headers: [], rows: [] });
      }
      var colHeaders = values[0].map(function (v) { return String(v).trim(); });
      var rows = [];
      for (var r = 1; r < values.length; r++) {
        var obj = {};
        for (var c = 0; c < colHeaders.length; c++) {
          var cellVal = values[r][c];
          if (cellVal instanceof Date) {
            obj[colHeaders[c]] = Utilities.formatDate(cellVal, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
          } else {
            obj[colHeaders[c]] = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
          }
        }
        rows.push({ rowNumber: r + 1, data: obj });
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
          for (var i = 1; i < allValues.length; i++) {
            if (String(allValues[i][regIdx]).trim() === regCode) {
              sheet.getRange(i + 1, statusIdx + 1).setValue(paymentStatus);
              return jsonResponse_({ ok: true, updatedRow: i + 1 });
            }
          }
        }
      }
      return jsonResponse_({ ok: true, updatedRow: null });
    }

    return jsonResponse_({ ok: false, error: '不支援的 action：' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
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

function ensureHeadersForAppend_(sheet, expectedHeaders) {
  return syncHeaders_(sheet, expectedHeaders);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
