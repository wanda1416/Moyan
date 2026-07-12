"""
Chat 调试页面 - HTML 常量 + 路由注册
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from debug_store import chat_debug_store


def register_debug_routes(app: FastAPI):
    """注册调试页面相关路由"""

    @app.get("/debug/chat")
    async def debug_chat_page():
        """Chat 调试监控页面"""
        return HTMLResponse(content=DEBUG_HTML, media_type="text/html")

    @app.get("/api/debug/chat_log")
    async def debug_chat_log(since: int = -1):
        """获取 Chat 调试记录（增量拉取）"""
        if since < 0:
            records = chat_debug_store.get_all()
        else:
            records = chat_debug_store.get_since(since)
        return {"status": "ok", "records": records}

    @app.post("/api/debug/clear")
    async def debug_clear():
        """清空调试记录"""
        chat_debug_store.clear()
        return {"status": "ok"}


DEBUG_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Chat Debug Monitor</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #1e1e2e; --surface: #282840; --border: #3a3a5c;
  --text: #cdd6f4; --text-dim: #7f849c; --accent: #89b4fa;
  --green: #a6e3a1; --blue: #89b4fa; --gray: #585b70;
  --yellow: #f9e2af; --red: #f38ba8;
}
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.header h1 { font-size: 15px; font-weight: 600; color: var(--accent); }
.header .actions { display: flex; gap: 8px; align-items: center; }
.header .badge { font-size: 12px; color: var(--text-dim); }
.btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; }
.btn:hover { background: var(--border); }
.btn-danger { border-color: var(--red); color: var(--red); }
.btn-danger:hover { background: var(--red); color: var(--bg); }
.main { display: flex; flex: 1; overflow: hidden; }
.sidebar { width: 260px; min-width: 260px; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.sidebar-header { padding: 8px 12px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--border); }
.record-list { flex: 1; overflow-y: auto; }
.record-item { padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
.record-item:hover { background: var(--surface); }
.record-item.active { background: var(--surface); border-left: 3px solid var(--accent); }
.record-item .time { font-size: 12px; color: var(--text-dim); }
.record-item .meta { font-size: 12px; margin-top: 3px; display: flex; gap: 8px; align-items: center; }
.record-item .model-tag { color: var(--yellow); font-weight: 500; }
.record-item .msg-count { color: var(--text-dim); }
.record-item .duration { color: var(--green); }
.record-item .rag-badge { color: var(--accent); font-size: 10px; }
.detail { flex: 1; overflow-y: auto; padding: 16px; }
.detail-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); font-size: 14px; }
.detail-header { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.detail-header .tag { font-size: 12px; padding: 2px 8px; border-radius: 3px; background: var(--surface); border: 1px solid var(--border); }
.detail-header .tag.model { color: var(--yellow); border-color: var(--yellow); }
.detail-header .tag.duration { color: var(--green); border-color: var(--green); }
.detail-header .tag.time { color: var(--text-dim); }
.section-title { font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: var(--accent); }
.msg-block { margin-bottom: 8px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.msg-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; background: var(--surface); }
.msg-header:hover { background: var(--border); }
.msg-role { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 3px; }
.msg-role.system { background: var(--gray); color: var(--text); }
.msg-role.user { background: var(--blue); color: var(--bg); }
.msg-role.assistant { background: var(--green); color: var(--bg); }
.msg-preview { font-size: 12px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.msg-content { padding: 12px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; background: var(--bg); max-height: 400px; overflow-y: auto; display: none; }
.msg-block.expanded .msg-content { display: block; }
.rag-section { margin-top: 12px; }
.rag-item { padding: 8px 12px; margin-bottom: 6px; background: var(--surface); border-radius: 4px; border: 1px solid var(--border); }
.rag-item .rag-source { font-size: 12px; color: var(--yellow); font-weight: 500; }
.rag-item .rag-score { font-size: 11px; color: var(--green); margin-left: 8px; }
.rag-item .rag-text { font-size: 12px; color: var(--text-dim); margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 150px; overflow-y: auto; }
.reply-section { margin-top: 12px; position: relative; }
.reply-content { padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 500px; overflow-y: auto; }
.copy-btn { position: absolute; top: 8px; right: 8px; }
.auto-scroll-indicator { position: fixed; bottom: 16px; right: 16px; padding: 6px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; color: var(--text-dim); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.auto-scroll-indicator.show { opacity: 1; }
</style>
</head>
<body>
<div class="header">
  <h1>Chat Debug Monitor</h1>
  <div class="actions">
    <span class="badge" id="countBadge">0 records</span>
    <button class="btn btn-danger" onclick="clearRecords()">Clear</button>
  </div>
</div>
<div class="main">
  <div class="sidebar">
    <div class="sidebar-header">Request Log</div>
    <div class="record-list" id="recordList"></div>
  </div>
  <div class="detail" id="detail">
    <div class="detail-empty">Select a record to view details</div>
  </div>
</div>
<div class="auto-scroll-indicator" id="scrollIndicator">Auto-scroll: ON</div>

<script>
let allRecords = [];
let selectedId = null;
let autoScroll = true;
const SCROLL_THRESHOLD = 50;
const listEl = document.getElementById('recordList');
const detailEl = document.getElementById('detail');
const countBadge = document.getElementById('countBadge');
const scrollIndicator = document.getElementById('scrollIndicator');

function isAtBottom(el) {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function showScrollIndicator(on) {
  scrollIndicator.textContent = autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: PAUSED';
  scrollIndicator.classList.toggle('show', on);
  setTimeout(() => scrollIndicator.classList.remove('show'), 1500);
}

listEl.addEventListener('scroll', () => {
  autoScroll = isAtBottom(listEl);
  showScrollIndicator(true);
});

function renderRecordItem(r) {
  const div = document.createElement('div');
  div.className = 'record-item' + (r.id === selectedId ? ' active' : '');
  div.dataset.id = r.id;
  const time = r.timestamp.split(' ')[1] || r.timestamp;
  const msgCount = r.messages ? r.messages.length : 0;
  div.innerHTML = `
    <div class="time">#${r.id} ${time}</div>
    <div class="meta">
      <span class="model-tag">${r.model || r.provider}</span>
      <span class="msg-count">${msgCount} msgs</span>
      <span class="duration">${r.duration_ms}ms</span>
      ${r.rag && r.rag.hits > 0 ? '<span class="rag-badge">RAG:' + r.rag.hits + '</span>' : ''}
    </div>
  `;
  div.onclick = () => selectRecord(r.id);
  return div;
}

function appendRecords(records) {
  const wasAtBottom = isAtBottom(listEl);
  records.forEach(r => {
    allRecords.push(r);
    listEl.appendChild(renderRecordItem(r));
  });
  countBadge.textContent = allRecords.length + ' records';
  if (wasAtBottom && autoScroll) {
    scrollToBottom(listEl);
  }
}

function selectRecord(id) {
  selectedId = id;
  document.querySelectorAll('.record-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });
  const r = allRecords.find(x => x.id === id);
  if (!r) return;
  renderDetail(r);
}

function renderDetail(r) {
  let html = `<div class="detail-header">
    <span class="tag time">${r.timestamp}</span>
    <span class="tag model">${r.provider} / ${r.model}</span>
    <span class="tag duration">${r.duration_ms}ms</span>
  </div>`;

  // Messages
  html += `<div class="section-title">Messages (${r.messages.length})</div>`;
  r.messages.forEach((m, i) => {
    const role = m.role;
    const preview = (m.content || '').substring(0, 80).replace(/\n/g, ' ');
    const label = role === 'system' ? 'SYSTEM (RAG)' : role.toUpperCase();
    html += `<div class="msg-block" onclick="this.classList.toggle('expanded')">
      <div class="msg-header">
        <span class="msg-role ${role}">${label}</span>
        <span class="msg-preview">${escapeHtml(preview)}${m.content && m.content.length > 80 ? '...' : ''}</span>
      </div>
      <div class="msg-content">${escapeHtml(m.content || '(empty)')}</div>
    </div>`;
  });

  // RAG
  if (r.rag && r.rag.hits > 0) {
    html += `<div class="section-title">RAG Results (${r.rag.hits})</div><div class="rag-section">`;
    r.rag.results.forEach(item => {
      html += `<div class="rag-item">
        <span class="rag-source">${escapeHtml(item.source)}</span>
        ${item.heading ? '<span style="color:var(--text-dim);font-size:11px"> / ' + escapeHtml(item.heading) + '</span>' : ''}
        <span class="rag-score">score: ${item.score}</span>
        <div class="rag-text">${escapeHtml(item.text || '')}</div>
      </div>`;
    });
    html += '</div>';
  }

  // Reply
  html += `<div class="section-title">Raw Reply</div>
  <div class="reply-section">
    <button class="btn copy-btn" onclick="copyReply(this)">Copy</button>
    <div class="reply-content" id="replyContent">${escapeHtml(r.reply || '(empty)')}</div>
  </div>`;

  detailEl.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyReply(btn) {
  const text = document.getElementById('replyContent').textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

async function poll() {
  try {
    const lastId = allRecords.length > 0 ? allRecords[allRecords.length - 1].id : -1;
    const resp = await fetch(`/api/debug/chat_log?since=${lastId}`);
    const data = await resp.json();
    if (data.records && data.records.length > 0) {
      appendRecords(data.records);
      // Auto-select latest if nothing selected
      if (selectedId === null && data.records.length > 0) {
        selectRecord(data.records[data.records.length - 1].id);
      }
    }
  } catch(e) { console.error('Poll error:', e); }
}

async function clearRecords() {
  await fetch('/api/debug/clear', { method: 'POST' });
  allRecords = [];
  selectedId = null;
  listEl.innerHTML = '';
  detailEl.innerHTML = '<div class="detail-empty">Select a record to view details</div>';
  countBadge.textContent = '0 records';
}

// Initial load + polling
(async () => {
  const resp = await fetch('/api/debug/chat_log');
  const data = await resp.json();
  if (data.records && data.records.length > 0) {
    appendRecords(data.records);
    selectRecord(data.records[data.records.length - 1].id);
  }
})();
setInterval(poll, 2000);
</script>
</body>
</html>"""
