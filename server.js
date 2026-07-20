/* byteworkspace — byte 제품군 홈 포털 (정적 서빙 + 보안 헤더) */
const express = require('express');
const path = require('path');

const app = express();
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4600;

const ACCOUNT = 'https://bytenode-account.vercel.app';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  /* 인라인 스크립트 금지(외부 app.js만 허용), 연결은 계정 서버만 */
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${ACCOUNT}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});

app.use(express.static(PUB, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(PUB, 'index.html')));

app.listen(PORT, () => console.log(`\n✅ byteworkspace 실행 중 → http://localhost:${PORT}\n`));
