/* byteworkspace — byte 제품군 홈 포털 + 통합 계정 설정(프로필) 페이지
   역할 분담
   - 신원 정보(표시 이름·소개·아바타·비밀번호)의 원본은 bytenode다. 여기서는 프록시만 한다.
     사용자의 통합계정 토큰을 그대로 실어 보내므로 이 서버는 비밀을 보관하지 않는다.
   - byteworkspace 고유 설정(테마 등)만 이 서버의 DB(Firestore)에 저장한다. */
const express = require('express');
const path = require('path');

const app = express();
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4600;

const ACCOUNT = 'https://bytenode-account.vercel.app';
const NODE = process.env.BYTENODE_URL || 'https://bytenode109.vercel.app';

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  /* 인라인 스크립트 금지(외부 js만 허용), 연결은 자기 자신과 계정 서버만 */
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    /* 아바타는 multipart라 브라우저가 bytenode로 직접 올린다 */
    `connect-src 'self' ${ACCOUNT} ${NODE}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});

/* ── byteworkspace 자체 DB(Firestore): 화면 설정 등 이 포털 고유 설정만 보관 ── */
let db = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    db = admin.firestore();
  }
} catch (e) { console.error('[firestore init]', e.message); }

/* ── 통합계정 토큰 검증: 항상 원본 서버에 물어본다 ── */
async function callNode(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(NODE + pathname, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000)
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: '응답을 해석할 수 없습니다.' }; }
  return { ok: r.ok, status: r.status, data };
}

async function requireUser(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const token = h.slice(7);
  try {
    const me = await callNode('/api/auth/me', { token });
    if (!me.ok) return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인하세요.' });
    req.token = token;
    req.me = me.data;
    next();
  } catch { res.status(502).json({ error: '계정 서버에 연결할 수 없습니다.' }); }
}

const relay = (res, r) => res.status(r.status).json(r.data);
const api = express.Router();

/* 프로필 조회: 통합계정 정보 + 이 포털의 설정을 합쳐서 준다 */
api.get('/profile', requireUser, async (req, res) => {
  let prefs = {};
  if (db) {
    try {
      const doc = await db.collection('wsPrefs').doc(req.me.id).get();
      if (doc.exists) prefs = doc.data();
    } catch (e) { console.error('[prefs read]', e.message); }
  }
  res.json({ user: req.me, prefs, prefsEnabled: !!db });
});

/* 표시 이름·소개 변경 (원본: bytenode) */
api.patch('/profile', requireUser, async (req, res) => {
  const { displayName, bio } = req.body || {};
  relay(res, await callNode('/api/auth/me', { method: 'PATCH', token: req.token, body: { displayName, bio } }));
});

/* 비밀번호 변경 — 성공하면 새 토큰이 내려온다(기존 세션 무효화) */
api.patch('/password', requireUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  relay(res, await callNode('/api/auth/password', { method: 'PATCH', token: req.token, body: { currentPassword, newPassword } }));
});

/* 다른 모든 기기에서 로그아웃 */
api.post('/logout-all', requireUser, async (req, res) => {
  relay(res, await callNode('/api/auth/logout-all', { method: 'POST', token: req.token }));
});

/* 이 포털 고유 설정(테마 등) 저장 */
api.patch('/prefs', requireUser, async (req, res) => {
  if (!db) return res.status(503).json({ error: '설정 저장소가 연결되지 않았습니다.' });
  const theme = String((req.body || {}).theme || '');
  if (!['dark', 'light', 'system'].includes(theme)) return res.status(400).json({ error: '지원하지 않는 테마입니다.' });
  try {
    await db.collection('wsPrefs').doc(req.me.id).set({ theme, updatedAt: Date.now() }, { merge: true });
    res.json({ ok: true, theme });
  } catch (e) { res.status(500).json({ error: '설정을 저장하지 못했습니다.' }); }
});

/* 회원 탈퇴 */
api.delete('/account', requireUser, async (req, res) => {
  const { username, password } = req.body || {};
  const r = await callNode('/api/auth/me', { method: 'DELETE', token: req.token, body: { username, password } });
  if (r.ok && db) { try { await db.collection('wsPrefs').doc(req.me.id).delete(); } catch {} }
  relay(res, r);
});

app.use('/api', api);
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'byteworkspace', prefs: !!db }));

app.use(express.static(PUB, { extensions: ['html'] }));
app.get('/account', (_req, res) => res.sendFile(path.join(PUB, 'account.html')));
app.get('*', (_req, res) => res.sendFile(path.join(PUB, 'index.html')));

if (require.main === module) app.listen(PORT, () => console.log(`\n✅ byteworkspace → http://localhost:${PORT}\n`));
module.exports = app;
