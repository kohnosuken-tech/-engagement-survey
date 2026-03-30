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
    if (action === 'sendMails')    return handleSendMails(ss);
    if (action === 'testMail')     return handleTestMail(ss, data);

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

// ===== メール一斉送信 =====
// GASトリガーまたはWebリクエストから呼ばれる
function handleSendMails(ss) {
  try {
    // 社員リスト（emailシート）を取得
    var empSheet = ss.getSheetByName('employees');
    if (!empSheet) return jsonResponse({ error: 'employeesシートが見つかりません' });

    // メール設定を取得
    var settingsSheet = ss.getSheetByName('settings');
    var mailConfig = null;
    if (settingsSheet) {
      var settingsData = settingsSheet.getDataRange().getValues();
      for (var i = 0; i < settingsData.length; i++) {
        if (settingsData[i][0] === 'es_mail_schedule') {
          try { mailConfig = JSON.parse(settingsData[i][1]); } catch(ex) {}
          break;
        }
      }
    }

    var subject = (mailConfig && mailConfig.subject) || '【ALBONA】今月のエンゲージメントサーベイのお願い';
    var bodyTemplate = (mailConfig && mailConfig.bodyTemplate) || '{name} さん\n\n今月のエンゲージメントサーベイの回答をお願いいたします。\n\n▼ 回答はこちら\nhttps://albona-survey.vercel.app\n\nログインID: {empId}\n\nご協力よろしくお願いいたします。';

    // 回答期間（deadline）を取得
    var deadline = '';
    if (settingsSheet) {
      var allSettings = settingsSheet.getDataRange().getValues();
      for (var i = 0; i < allSettings.length; i++) {
        if (allSettings[i][0] === 'es_survey_period') {
          try {
            var period = JSON.parse(allSettings[i][1]);
            if (period.end) deadline = period.end;
          } catch(ex) {}
          break;
        }
      }
    }

    // 社員データ取得
    var empData = empSheet.getDataRange().getValues();
    var empHeader = empData[0];
    var nameIdx = empHeader.indexOf('name');
    var empIdIdx = empHeader.indexOf('empId');
    var emailIdx = empHeader.indexOf('email');
    var deptIdx = empHeader.indexOf('dept');

    if (emailIdx === -1) return jsonResponse({ error: 'employeesシートにemail列がありません' });

    var sentCount = 0;
    var errors = [];

    // 今月の回答済み社員をチェック
    var now = new Date();
    var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var responseSheet = ss.getSheetByName(SHEET_RESPONSES);
    var submittedIds = {};
    if (responseSheet) {
      var responses = responseSheet.getDataRange().getValues().slice(1);
      for (var r = 0; r < responses.length; r++) {
        if (responses[r][2] === currentMonth) submittedIds[responses[r][1]] = true;
      }
    }

    for (var i = 1; i < empData.length; i++) {
      var email = empData[i][emailIdx];
      var empId = empData[i][empIdIdx];
      var name = empData[i][nameIdx] || '';
      var dept = deptIdx >= 0 ? (empData[i][deptIdx] || '') : '';

      if (!email || !empId) continue;
      if (submittedIds[empId]) continue; // 回答済みはスキップ

      var body = bodyTemplate
        .replace(/\{name\}/g, name)
        .replace(/\{empId\}/g, empId)
        .replace(/\{dept\}/g, dept)
        .replace(/\{deadline\}/g, deadline || '今月末');

      try {
        GmailApp.sendEmail(email, subject, body);
        sentCount++;
      } catch(ex) {
        errors.push(empId + ': ' + ex.message);
      }
    }

    return jsonResponse({ ok: true, sent: sentCount, errors: errors });
  } catch(e) {
    return jsonResponse({ error: e.message });
  }
}

// テスト送信（指定されたメールアドレスに送信）
function handleTestMail(ss, data) {
  try {
    var subject = data.subject || '【テスト】エンゲージメントサーベイ案内';
    var bodyTemplate = data.bodyTemplate || 'テスト送信です';
    var testTo = data.testTo || 'albonahr@al-bo.io';

    var body = bodyTemplate
      .replace(/\{name\}/g, 'テストユーザー')
      .replace(/\{empId\}/g, 'EMP000')
      .replace(/\{dept\}/g, 'テスト部')
      .replace(/\{deadline\}/g, '月末');

    GmailApp.sendEmail(testTo, '[テスト] ' + subject, body);
    return jsonResponse({ ok: true, sentTo: testTo });
  } catch(e) {
    return jsonResponse({ error: e.message });
  }
}

// 月次自動送信トリガー（GASメニューから実行して設定）
function sendMonthlySurveyEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  handleSendMails(ss);
}

// トリガーを設定する関数（GASエディタから一度だけ実行）
function setupMonthlyTrigger() {
  // 既存の同名トリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendMonthlySurveyEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 設定シートから日時を読む
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsSheet = ss.getSheetByName('settings');
  var day = 1, hour = 9;
  if (settingsSheet) {
    var allSettings = settingsSheet.getDataRange().getValues();
    for (var i = 0; i < allSettings.length; i++) {
      if (allSettings[i][0] === 'es_mail_schedule') {
        try {
          var config = JSON.parse(allSettings[i][1]);
          day = config.day || 1;
          hour = config.hour || 9;
        } catch(ex) {}
        break;
      }
    }
  }

  // 毎月指定日時のトリガーを作成
  ScriptApp.newTrigger('sendMonthlySurveyEmails')
    .timeBased()
    .onMonthDay(day)
    .atHour(hour)
    .create();

  SpreadsheetApp.getUi().alert('月次トリガーを設定しました: 毎月' + day + '日 ' + hour + ':00');
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

  // employeesシート（メール送信用の社員リスト）
  let empSheet = ss.getSheetByName('employees');
  if (!empSheet) {
    empSheet = ss.insertSheet('employees');
    empSheet.getRange(1, 1, 1, 4).setValues([['empId', 'name', 'dept', 'email']]).setFontWeight('bold').setBackground('#f0f0f0');
  }

  SpreadsheetApp.getUi().alert('セットアップ完了！\n\nemployeesシートにメール送信先の社員情報を登録してください。\n\n月次トリガー設定: setupMonthlyTrigger() を実行してください。');
}

// 社員リスト同期（Vercel APIから取得してスプレッドシートに反映）
function syncEmployeesFromAPI() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var apiBase = props.getProperty('VERCEL_API_BASE');
  var token = props.getProperty('API_TOKEN');

  if (!apiBase) {
    SpreadsheetApp.getUi().alert('スクリプトプロパティにVERCEL_API_BASEを設定してください');
    return;
  }

  var options = { headers: {} };
  if (token) options.headers['Authorization'] = 'Bearer ' + token;

  var response = UrlFetchApp.fetch(apiBase + '/api/employees', options);
  var data = JSON.parse(response.getContentText());
  if (!data.ok || !data.data) {
    SpreadsheetApp.getUi().alert('社員データの取得に失敗しました');
    return;
  }

  var empSheet = ss.getSheetByName('employees');
  if (!empSheet) {
    empSheet = ss.insertSheet('employees');
  }

  // ヘッダーとデータを書き込み
  var headers = ['empId', 'name', 'dept', 'email'];
  var rows = [headers];
  for (var i = 0; i < data.data.length; i++) {
    var emp = data.data[i];
    rows.push([emp.empId || '', emp.name || '', emp.dept || '', emp.email || '']);
  }

  empSheet.clear();
  empSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  empSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');

  SpreadsheetApp.getUi().alert(data.data.length + '名の社員データを同期しました');
}
