// Notion API 共通ヘルパー
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function headers() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

// DB IDs（Vercel環境変数から取得）
function dbId(name) {
  const map = {
    employees: process.env.NOTION_DB_EMPLOYEES,
    surveys: process.env.NOTION_DB_SURVEYS,
    settings: process.env.NOTION_DB_SETTINGS,
    auth: process.env.NOTION_DB_AUTH,
  };
  return map[name];
}

// Notion DB クエリ
async function queryDB(database, filter, sorts, pageSize) {
  const body = {};
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  if (pageSize) body.page_size = pageSize;

  let results = [];
  let cursor;
  do {
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API}/databases/${dbId(database)}/query`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

// ページ作成
async function createPage(database, properties) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ parent: { database_id: dbId(database) }, properties }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// ページ更新（archive=trueでアーカイブ）
async function updatePage(pageId, properties, archive) {
  const body = { properties };
  if (archive) body.archived = true;
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// ページアーカイブ（削除相当）
async function archivePage(pageId) {
  return updatePage(pageId, {}, true);
}

// プロパティ値ヘルパー
const P = {
  title: (v) => ({ title: [{ text: { content: v || '' } }] }),
  rich: (v) => {
    const s = v || '';
    // Notion rich_text は1ブロック2000文字制限。分割して格納
    const chunks = [];
    for (let i = 0; i < s.length; i += 2000) {
      chunks.push({ text: { content: s.slice(i, i + 2000) } });
    }
    return { rich_text: chunks.length > 0 ? chunks : [{ text: { content: '' } }] };
  },
  num: (v) => ({ number: v ?? null }),
  checkbox: (v) => ({ checkbox: !!v }),
  select: (v) => ({ select: v ? { name: v } : null }),
  // プロパティ読み取り
  readTitle: (prop) => prop?.title?.[0]?.plain_text || '',
  readRich: (prop) => (prop?.rich_text || []).map(r => r.plain_text || '').join(''),
  readNum: (prop) => prop?.number ?? null,
  readCheckbox: (prop) => prop?.checkbox || false,
  readSelect: (prop) => prop?.select?.name || '',
};

// CORS ヘッダー（注意: 使用非推奨。lib/auth.js の setCors を使用すること）
function cors() {
  return {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function optionsResponse() {
  return new Response(null, { status: 204, headers: cors() });
}

module.exports = { queryDB, createPage, updatePage, archivePage, P, json, optionsResponse, cors, dbId, headers };
