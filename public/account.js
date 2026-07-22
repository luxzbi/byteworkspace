/* 통합 계정 설정
   - 신원 정보는 이 서버를 거쳐 bytenode(원본)로 저장된다.
   - 테마는 byteworkspace 자체 DB에 저장되어 다른 기기에서도 유지된다.
   - 로그아웃하면 "왔던 페이지"로 되돌아간다(?from=). 등록된 byte 서비스만 허용. */
'use strict';
const ACCOUNT = 'https://bytenode-account.vercel.app';
const APP_ORIGINS = ['https://bytenode109.vercel.app','https://byteexam109.vercel.app','https://bytetext.vercel.app',
  'https://bytenode-account.vercel.app','https://byteslide.vercel.app','https://byteform-wheat.vercel.app',
  'https://bytewiki.vercel.app','https://byteworkspace.vercel.app'];
const $ = id => document.getElementById(id);
let TOKEN = '', ME = null, THEME = 'system';

/* ── SSO 복귀 ── */
(() => {
  const m = location.hash.match(/bn_token=([^&]+)/);
  if (m) {
    try { TOKEN = decodeURIComponent(m[1]); localStorage.setItem('bn_token', TOKEN); } catch (_) {}
    history.replaceState(null, '', location.pathname + location.search);
  }
})();
const getToken = () => TOKEN || localStorage.getItem('bn_token') || '';
function clearSession() { TOKEN = ''; ['bn_token','bn_me'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); }); }

/* 돌아갈 곳: ?from=<등록된 앱 주소>, 없으면 포털 홈 */
function returnTo() {
  const raw = new URLSearchParams(location.search).get('from');
  if (!raw) return location.origin + '/';
  try { const u = new URL(raw, location.origin); if (u.origin === location.origin || APP_ORIGINS.includes(u.origin)) return u.href; }
  catch (_) {}
  return location.origin + '/';
}

async function api(method, path, body) {
  const opt = { method, headers: { Authorization: 'Bearer ' + getToken() } };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || '요청이 실패했습니다.'); e.status = r.status; throw e; }
  return data;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function setMsg(id, text, kind) { const n = $(id); n.textContent = text; n.className = 'msg' + (kind ? ' ' + kind : ''); }

/* ── 테마 ── */
/* 테마 적용은 theme.js(공용)가 담당하고, 여기서는 선택 표시만 맞춘다 */
function applyTheme(t) {
  THEME = t;
  if (window.wsTheme) window.wsTheme.set(t);
  document.querySelectorAll('.theme').forEach(b => b.classList.toggle('on', b.dataset.theme === t));
}

/* ── 아바타 ── */
function paintAvatar(node, user) {
  node.textContent = '';
  if (user.avatar && /^(https?:|data:image\/)/.test(user.avatar)) {
    const img = document.createElement('img');
    img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = user.avatar;
    img.onerror = () => { img.remove(); node.textContent = (user.displayName || user.username || '?').slice(0, 1); };
    node.appendChild(img);
  } else node.textContent = (user.displayName || user.username || '?').slice(0, 1);
}

function paint() {
  $('topName').textContent = ME.displayName || ME.username;
  paintAvatar($('topAvatar'), ME);
  paintAvatar($('bigAvatar'), ME);
  $('fUsername').value = ME.username || '';
  $('fDisplay').value = ME.displayName || '';
  $('fBio').value = ME.bio || '';
}

/* ── 부팅 ── */
async function boot() {
  applyTheme(localStorage.getItem('ws_theme') || 'system');   /* 서버 응답 전 깜빡임 방지 */
  $('backLink').href = returnTo();
  if (!getToken()) return gate();
  try {
    const d = await api('GET', '/profile');
    ME = d.user;
    if (d.prefs && d.prefs.theme) { localStorage.setItem('ws_theme', d.prefs.theme); applyTheme(d.prefs.theme); }
    $('gate').hidden = true; $('shell').hidden = false;
    paint();
    loadMail();
    const back = returnTo();
    $('logoutHint').textContent = back.startsWith(location.origin)
      ? '이 기기에서 로그아웃합니다.' : '로그아웃 후 원래 보던 페이지로 돌아갑니다.';
  } catch (e) {
    if (e.status === 401) { clearSession(); gate('세션이 만료되었습니다. 다시 로그인하세요.'); }
    else gate(e.message);
  }
}
function gate(msg) {
  $('shell').hidden = true; $('gate').hidden = false;
  if (msg) $('gateMsg').textContent = msg;
}
function login() {
  location.href = ACCOUNT + '/login?redirect=' + encodeURIComponent(location.origin + '/account?from=' + encodeURIComponent(returnTo()));
}

/* ── 동작 ── */
$('gateLogin').addEventListener('click', login);

$('saveProfile').addEventListener('click', async () => {
  const displayName = $('fDisplay').value.trim(), bio = $('fBio').value.trim();
  if (!displayName) return setMsg('profileMsg', '표시 이름을 입력하세요.', 'err');
  $('saveProfile').disabled = true; setMsg('profileMsg', '저장 중…');
  try {
    await api('PATCH', '/profile', { displayName, bio });
    ME.displayName = displayName; ME.bio = bio; paint();
    setMsg('profileMsg', '저장했습니다.', 'ok');
  } catch (e) { setMsg('profileMsg', e.message, 'err'); }
  $('saveProfile').disabled = false;
});

/* 아바타는 multipart 업로드라 bytenode(원본)로 직접 보낸다 */
const NODE = 'https://bytenode109.vercel.app';
$('avatarBtn').addEventListener('click', () => $('avatarInput').click());
$('avatarInput').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return toast('2MB 이하 이미지만 올릴 수 있습니다.');
  const fd = new FormData();
  fd.append('avatar', file);
  $('avatarBtn').disabled = true;
  try {
    const r = await fetch(NODE + '/api/auth/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '업로드에 실패했습니다.');
    ME.avatar = d.url; paint(); toast('아바타를 변경했습니다.');
  } catch (err) { toast(err.message); }
  $('avatarBtn').disabled = false;
});

$('themes').addEventListener('click', async e => {
  const b = e.target.closest('.theme'); if (!b) return;
  const t = b.dataset.theme;
  applyTheme(t); localStorage.setItem('ws_theme', t);
  try { await api('PATCH', '/prefs', { theme: t }); setMsg('themeMsg', '설정을 저장했습니다.', 'ok'); }
  catch (err) { setMsg('themeMsg', '이 기기에만 적용됨: ' + err.message, 'err'); }
});

$('savePw').addEventListener('click', async () => {
  const cur = $('pwCur').value, nw = $('pwNew').value, nw2 = $('pwNew2').value;
  if (!cur || !nw) return setMsg('pwMsg', '현재·새 비밀번호를 입력하세요.', 'err');
  if (nw.length < 6) return setMsg('pwMsg', '새 비밀번호는 6자 이상이어야 합니다.', 'err');
  if (nw !== nw2) return setMsg('pwMsg', '새 비밀번호가 일치하지 않습니다.', 'err');
  $('savePw').disabled = true; setMsg('pwMsg', '변경 중…');
  try {
    const d = await api('PATCH', '/password', { currentPassword: cur, newPassword: nw });
    if (d.token) { TOKEN = d.token; localStorage.setItem('bn_token', d.token); }  /* 새 세션 토큰 유지 */
    $('pwCur').value = $('pwNew').value = $('pwNew2').value = '';
    setMsg('pwMsg', '비밀번호를 변경했습니다. 다른 기기는 로그아웃됩니다.', 'ok');
  } catch (e) { setMsg('pwMsg', e.message, 'err'); }
  $('savePw').disabled = false;
});

$('logoutAll').addEventListener('click', async () => {
  if (!confirm('이 기기를 제외한 모든 기기에서 로그아웃할까요?')) return;
  try {
    const d = await api('POST', '/logout-all');
    if (d.token) { TOKEN = d.token; localStorage.setItem('bn_token', d.token); }
    toast('다른 기기에서 로그아웃했습니다.');
  } catch (e) { toast(e.message); }
});

/* ── 관리자 메일함 ── */
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
async function loadMail() {
  const host = $('mailList');
  try {
    const d = await api('GET', '/mail');
    host.textContent = '';
    if (!d.items || !d.items.length) { host.append(el('div', 'empty', '받은 메일이 없습니다.')); $('mailUnread').hidden = true; return; }
    if (d.unread) { $('mailUnread').textContent = d.unread; $('mailUnread').hidden = false; } else $('mailUnread').hidden = true;
    d.items.forEach(m => {
      const box = el('div', 'mail' + (m.readAt ? '' : ' unread'));
      const head = el('div', 'mail-head');
      head.append(el('span', 'subj', m.subject || '(제목 없음)'),
                  el('span', 'when', new Date(m.createdAt).toLocaleString('ko-KR')));
      const body = el('div', 'mail-body', m.body || '');
      body.hidden = true;
      head.addEventListener('click', async () => {
        body.hidden = !body.hidden;
        if (!body.hidden && !m.readAt) {
          m.readAt = Date.now(); box.classList.remove('unread');
          try { await api('POST', '/mail/' + m.id + '/read'); loadMailBadge(); } catch (_) {}
        }
      });
      box.append(head, body); host.append(box);
    });
  } catch (e) { host.textContent = ''; host.append(el('div', 'empty', '메일을 불러오지 못했습니다.')); }
}
async function loadMailBadge() {
  try { const d = await api('GET', '/mail'); if (d.unread) { $('mailUnread').textContent = d.unread; $('mailUnread').hidden = false; } else $('mailUnread').hidden = true; }
  catch (_) {}
}

/* ── 사용자 신고 ── */
$('sendReport').addEventListener('click', async () => {
  const targetUsername = $('rTargetId').value.trim();
  const targetDisplayName = $('rTargetName').value.trim();
  const reason = $('rReason').value.trim();
  if (!targetUsername && !targetDisplayName) return setMsg('reportMsg', '아이디 또는 표시 이름 중 하나는 입력하세요.', 'err');
  if (reason.length < 5) return setMsg('reportMsg', '신고 사유를 5자 이상 적어 주세요.', 'err');
  $('sendReport').disabled = true; setMsg('reportMsg', '접수 중…');
  try {
    await api('POST', '/reports', { targetUsername, targetDisplayName, reason });
    $('rTargetId').value = $('rTargetName').value = $('rReason').value = '';
    setMsg('reportMsg', '신고를 접수했습니다. 관리자가 확인합니다.', 'ok');
  } catch (e) { setMsg('reportMsg', e.message, 'err'); }
  $('sendReport').disabled = false;
});

$('logoutBtn').addEventListener('click', () => {
  const back = returnTo();
  clearSession();
  location.href = back;              /* 왔던 페이지로 되돌아간다 */
});

$('deleteBtn').addEventListener('click', async () => {
  const username = prompt('탈퇴하려면 아이디를 입력하세요.');
  if (!username) return;
  const password = prompt('비밀번호를 입력하세요.');
  if (!password) return;
  if (!confirm('정말 탈퇴할까요? 계정과 모든 자료가 삭제되며 되돌릴 수 없습니다.')) return;
  try {
    await api('DELETE', '/account', { username, password });
    clearSession();
    alert('탈퇴가 완료되었습니다.');
    location.href = location.origin + '/';
  } catch (e) { toast(e.message); }
});

boot();
