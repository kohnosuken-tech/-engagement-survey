// ============================================================
// エンゲージメントサーベイ - Google Apps Script
// このコードをApps Scriptエディタに貼り付けてください
// ============================================================

// スプレッドシートの設定
const SHEET_RESPONSES = 'responses';    // 回答データ
const SHEET_EMPLOYEES = 'employees';    // 社員マスタ（任意）

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'submit') {
      return handleSubmit(ss, data);
    }
    if (data.action === 'load') {
      return handleLoad(ss, data);
    }
    if (data.action === 'check') {
      return handleCheck(ss, data);
    }

    return jsonResponse({ error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter.action;

    if (action === 'load') {
      return handleLoad(ss, e.parameter);
    }
    if (action === 'check') {
      return handleCheck(ss, e.parameter);
    }

    return jsonResponse({ error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ===== 回答を保存 =====
function handleSubmit(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  const row = [
    new Date().toISOString(),       // timestamp
    data.empId,                      // empId
    data.month,                      // month (例: "2026-03")
  ];

  // q1〜q33 + q35〜q36 の回答を追加
  for (let i = 1; i <= 33; i++) {
    row.push(data.answers['q' + i] || '');
  }

  // 自由記述
  row.push(data.answers['q34'] || '');

  // 追加質問（承認カテゴリ拡張）
  row.push(data.answers['q35'] || '');
  row.push(data.answers['q36'] || '');

  sheet.appendRow(row);

  return jsonResponse({ ok: true, message: '回答を保存しました' });
}

// ===== 特定月の回答を取得 =====
function handleLoad(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  const allData = sheet.getDataRange().getValues();
  const header = allData[0];
  const rows = allData.slice(1);

  // 月指定がある場合はフィルタ
  let filtered = rows;
  if (data.month) {
    filtered = rows.filter(r => r[2] === data.month);
  }
  // 社員ID指定がある場合はフィルタ
  if (data.empId) {
    filtered = filtered.filter(r => r[1] === data.empId);
  }

  const result = filtered.map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });

  return jsonResponse({ ok: true, data: result });
}

// ===== 回答済みチェック =====
function handleCheck(ss, data) {
  const sheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!sheet) return jsonResponse({ error: 'responses シートが見つかりません' });

  const allData = sheet.getDataRange().getValues();
  const rows = allData.slice(1);

  const submitted = rows.some(r => r[1] === data.empId && r[2] === data.month);

  return jsonResponse({ ok: true, submitted: submitted });
}

// ===== JSON レスポンス =====
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 初期セットアップ（1回だけ実行） =====
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RESPONSES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESPONSES);
  }

  // ヘッダーを設定
  const headers = ['timestamp', 'empId', 'month'];
  for (let i = 1; i <= 33; i++) {
    headers.push('q' + i);
  }
  headers.push('freeComment');
  headers.push('q35');
  headers.push('q36');

  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight('bold');
  range.setBackground('#f0f0f0');

  // 列幅を調整
  sheet.setColumnWidth(1, 180);  // timestamp
  sheet.setColumnWidth(2, 100);  // empId
  sheet.setColumnWidth(3, 100);  // month
  sheet.autoResizeColumns(4, 33);

  SpreadsheetApp.getUi().alert('セットアップ完了！responses シートにヘッダーが設定されました。');
}
