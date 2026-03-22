// ============================================================
// エンゲージメントサーベイ - Google Apps Script
// 全てGETリクエストで処理（CORS問題を完全回避）
// ============================================================

const SHEET_RESPONSES = 'responses';
var _currentCallback = '';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter.action;
    _currentCallback = e.parameter.callback || '';

    // dataパラメータがある場合はJSON解析（書き込み系）
    var data = e.parameter;
    if (e.parameter.data) {
      try { data = JSON.parse(e.parameter.data); } catch(ex) {}
    }

    if (action === 'submit')       return handleSubmit(ss, data);
    if (action === 'load')         return handleLoad(ss, data);
    if (action === 'check')        return handleCheck(ss, data);
    if (action === 'saveSettings') return handleSaveSettings(ss, data);
    if (action === 'loadSettings') return handleLoadSettings(ss, data);

    return jsonResponse({ error: 'unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  // 後方互換: POSTが来てもdoGetと同じ処理
  return doGet(e);
}

// ===== 回答を保存 =====
function handleSubmit(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  var answers = data.answers;
  if (typeof answers === 'string') {
    try { answers = JSON.parse(answers); } catch(ex) {}
  }

  const row = [
    new Date().toISOString(),
    data.empId,
    data.month,
  ];

  for (var i = 1; i <= 33; i++) {
    row.push(answers['q' + i] || '');
  }
  row.push(answers['q34'] || '');
  row.push(answers['q35'] || '');
  row.push(answers['q36'] || '');

  sheet.appendRow(row);
  return jsonResponse({ ok: true });
}

// ===== 回答を取得 =====
function handleLoad(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  const allData = sheet.getDataRange().getValues();
  const header = allData[0];
  var rows = allData.slice(1);

  if (data.month) rows = rows.filter(function(r) { return r[2] === data.month; });
  if (data.empId) rows = rows.filter(function(r) { return r[1] === data.empId; });

  const result = rows.map(function(r) {
    const obj = {};
    header.forEach(function(h, i) { obj[h] = r[i]; });
    return obj;
  });

  return jsonResponse({ ok: true, data: result });
}

// ===== 回答済みチェック =====
function handleCheck(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  const rows = sheet.getDataRange().getValues().slice(1);
  const submitted = rows.some(function(r) { return r[1] === data.empId && r[2] === data.month; });

  return jsonResponse({ ok: true, submitted: submitted });
}

// ===== 設定保存 =====
function handleSaveSettings(ss, data) {
  var sheet = ss.getSheetByName('settings');
  if (!sheet) sheet = ss.insertSheet('settings');

  var all = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 0; i < all.length; i++) {
    if (all[i][0] === data.key) {
      sheet.getRange(i + 1, 2).setValue(data.value);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow([data.key, data.value]);

  return jsonResponse({ ok: true });
}

// ===== 設定読込 =====
function handleLoadSettings(ss, data) {
  var sheet = ss.getSheetByName('settings');
  if (!sheet) return jsonResponse({ ok: true, data: {} });

  var all = sheet.getDataRange().getValues();
  if (data && data.key) {
    for (var i = 0; i < all.length; i++) {
      if (all[i][0] === data.key) return jsonResponse({ ok: true, value: all[i][1] });
    }
    return jsonResponse({ ok: true, value: null });
  }

  var result = {};
  for (var i = 0; i < all.length; i++) {
    result[all[i][0]] = all[i][1];
  }
  return jsonResponse({ ok: true, data: result });
}

// ===== JSONレスポンス（JSONP対応） =====
function jsonResponse(obj) {
  if (_currentCallback) {
    return ContentService
      .createTextOutput(_currentCallback + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 初期セットアップ =====
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) sheet = ss.insertSheet(SHEET_RESPONSES);

  const headers = ['timestamp', 'empId', 'month'];
  for (let i = 1; i <= 33; i++) headers.push('q' + i);
  headers.push('freeComment', 'q35', 'q36');

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f0f0f0');
  SpreadsheetApp.getUi().alert('セットアップ完了！');
}
