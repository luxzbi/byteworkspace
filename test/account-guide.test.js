'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('메인 소개 페이지에 통합계정 전환 절차와 문의 주소를 표시한다', () => {
  assert.match(html, /id="integrated-account"/);
  assert.match(html, /기존 계정 확인/);
  assert.match(html, /관리자에게 문의/);
  assert.match(html, /통합계정으로 전환/);
  assert.match(html, /mailto:studioztec@gmail\.com/);
  assert.match(html, /비밀번호[^<]*작성하지 마세요/);
});

test('통합계정 안내는 소개 페이지형 카드와 모바일 레이아웃을 갖는다', () => {
  assert.match(css, /\.account-steps\{display:grid;grid-template-columns:repeat\(3,1fr\)/);
  assert.match(css, /\.account-contact\{/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.account-steps\{grid-template-columns:1fr/);
});
