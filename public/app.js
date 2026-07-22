/* byteworkspace — 세션/SSO 연동 및 히어로 아트
   보안 메모:
   - 토큰은 URL 프래그먼트(#)로만 주고받음: 서버 로그·Referer에 남지 않음
   - 수신 즉시 history.replaceState로 주소창에서 제거
   - 토큰 검증은 항상 계정 서버(/api/me)로 확인, 화면 표시는 textContent만 사용 */
'use strict';

const ACCOUNT = 'https://bytenode-account.vercel.app';
const $ = id => document.getElementById(id);

/* ── SSO 복귀: #bn_token 수신 ── */
(() => {
  const m = location.hash.match(/bn_token=([^&]+)/);
  if (!m) return;
  let token = '';
  try { token = decodeURIComponent(m[1]); localStorage.setItem('bn_token', token); } catch (_) {}
  sessionStorage.removeItem('bn_token');
  if (token && new URLSearchParams(location.search).get('continue') === 'byteform') {
    location.replace('https://byteform-wheat.vercel.app/#bn_token=' + encodeURIComponent(token));
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
})();

const getToken = () => localStorage.getItem('bn_token') || sessionStorage.getItem('bn_token') || '';
function clearSession() {
  ['bn_token', 'bn_me'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
}

function ssoGo(page) {
  location.href = ACCOUNT + '/' + page + '?redirect=' + encodeURIComponent(location.origin + '/');
}

/* 계정에 저장해 둔 테마를 가져와 적용한다(다른 기기에서 바꿔도 따라온다) */
async function syncTheme() {
  try {
    const r = await fetch('/api/profile', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!r.ok) return;
    const d = await r.json();
    const t = d.prefs && d.prefs.theme;
    if (t && window.wsTheme && t !== window.wsTheme.get()) window.wsTheme.set(t);
  } catch (_) {}
}

/* ── 로그인 상태 UI ── */
let ME = null;
async function initSession() {
  const t = getToken();
  if (t) {
    try {
      const r = await fetch(ACCOUNT + '/api/me', { headers: { Authorization: 'Bearer ' + t } });
      if (r.ok) ME = await r.json();
      else if (r.status === 401 || r.status === 403) clearSession();
    } catch (_) { /* 네트워크 오류: 로그아웃 처리하지 않고 게스트 표시만 */ }
  }
  if (ME) {
    $('meArea').hidden = false;
    $('loginBtn').hidden = true;
    $('signupBtn').hidden = true;
    $('meName').textContent = ME.displayName || ME.username || '';
    const av = $('meAvatar');
    av.textContent = '';
    if (ME.avatar && /^https?:\/\//.test(ME.avatar)) {
      const img = document.createElement('img');
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = ME.avatar;
      img.onerror = () => { img.remove(); av.textContent = (ME.displayName || '?').slice(0, 1); };
      av.appendChild(img);
    } else {
      av.textContent = (ME.displayName || ME.username || '?').slice(0, 1);
    }
    $('heroSub').textContent = (ME.displayName || ME.username) + '님, 어떤 작업을 시작할까요?';
    syncTheme();   /* 계정에 저장된 테마를 이 기기에도 반영 */
  } else {
    $('meArea').hidden = true;
    $('loginBtn').hidden = false;
    $('signupBtn').hidden = false;
  }
}

$('loginBtn').addEventListener('click', () => ssoGo('login'));
$('signupBtn').addEventListener('click', () => ssoGo('welcome'));
$('logoutBtn').addEventListener('click', () => { clearSession(); ME = null; initSession(); });
/* 프로필(동그란 아바타·이름)을 누르면 계정 설정으로 이동, 돌아올 곳을 함께 넘긴다 */
(() => {
  const goAccount = () => { location.href = '/account?from=' + encodeURIComponent(location.href); };
  const area = $('meArea');
  if (!area) return;
  area.style.cursor = 'pointer';
  area.title = '계정 설정';
  ['meAvatar', 'meName'].forEach(id => { const n = $(id); if (n) n.addEventListener('click', goAccount); });
})();
$('heroStart').addEventListener('click', () => {
  document.getElementById('apps').scrollIntoView({ behavior: 'smooth' });
});

/* ── 앱 카드: 로그인 상태를 프래그먼트로 전달 ── */
const APP_ORIGINS = ['https://bytenode109.vercel.app', 'https://byteexam109.vercel.app', 'https://bytetext.vercel.app', 'https://bytenode-account.vercel.app', 'https://byteslide.vercel.app', 'https://byteform-wheat.vercel.app', 'https://bytewiki.vercel.app'];
document.querySelectorAll('.card[data-app]').forEach(card => {
  card.setAttribute('tabindex', '0');
  const open = () => {
    const url = card.dataset.app;
    let u;
    try { u = new URL(url); } catch { return; }
    if (!APP_ORIGINS.includes(u.origin)) return;   /* 등록된 앱 외 이동 금지 */
    const t = getToken();
    if (t && ME) u.hash = 'bn_token=' + encodeURIComponent(t);
    location.href = u.href;
  };
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
});

initSession();

/* ── 히어로 미디어아트: 흐르는 빛의 실 ── */
(() => {
  const cv = $('artCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, raf = null, lines = [];
  /* 배경·선 밝기를 테마 토큰에서 읽어 라이트 모드에서도 보이게 한다 */
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let ART = tok('--art') || '#0a0a0a', LUM = tok('--art-line-l') || '38%', ALPHA = tok('--art-alpha') || '.13';
  const readTokens = () => { ART = tok('--art') || ART; LUM = tok('--art-line-l') || LUM; ALPHA = tok('--art-alpha') || ALPHA; };
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
  /* 시스템 테마가 바뀌면 아트도 새 색으로 다시 그린다 */
  new MutationObserver(() => { readTokens(); resize(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const N = 70;

  function spawn(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : (Math.random() < .5 ? -10 : H + 10),
      life: 200 + Math.random() * 360,
      hue: 235 + Math.random() * 50,
      sat: 30 + Math.random() * 45,
      lum: parseFloat(LUM) + Math.random() * 22,
      w: .4 + Math.random() * 1.3,
      sp: .3 + Math.random() * .8
    };
  }
  function angle(x, y, t) {
    return Math.sin(x * .0016 + t * .00022) * 2.2
         + Math.cos(y * .0021 - t * .00017) * 1.9
         + Math.sin((x + y) * .0009 + t * .00013);
  }
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = ART; ctx.fillRect(0, 0, W, H);
    lines = Array.from({ length: N }, () => spawn(true));
    if (!raf) raf = requestAnimationFrame(tick);
  }
  const t0 = performance.now();
  function tick(now) {
    const t = now - t0;
    ctx.fillStyle = ART; ctx.globalAlpha = .04;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    /* 밝은 배경에서 'lighter'는 선이 하얗게 날아가므로 일반 합성으로 그린다 */
    ctx.globalCompositeOperation = isLight() ? 'source-over' : 'lighter';
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i];
      const a = angle(p.x, p.y, t);
      const nx = p.x + Math.cos(a) * p.sp;
      const ny = p.y + Math.sin(a) * p.sp;
      ctx.strokeStyle = 'hsla(' + p.hue + ',' + p.sat + '%,' + p.lum + '%,' + ALPHA + ')';
      ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      p.x = nx; p.y = ny; p.life--;
      if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) lines[i] = spawn(false);
    }
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener('resize', resize);
  resize();
})();
