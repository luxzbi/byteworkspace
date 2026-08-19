'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DAY_MS, mailExpiresAt, extendedMailExpiry } = require('../mail-retention');

test('읽지 않은 메일은 자동 만료되지 않는다', () => {
  assert.equal(mailExpiresAt({ readAt: null }), 0);
});

test('처음 읽은 시각부터 정확히 14일간 보관한다', () => {
  const readAt = Date.UTC(2026, 7, 19, 7, 0, 0);
  assert.equal(mailExpiresAt({ readAt }), readAt + 14 * DAY_MS);
});

test('7일 연장은 현재 만료일을 기준으로 누적된다', () => {
  const readAt = Date.UTC(2026, 7, 19, 7, 0, 0);
  const firstExpiry = mailExpiresAt({ readAt });
  assert.equal(extendedMailExpiry({ readAt, expiresAt: firstExpiry }), firstExpiry + 7 * DAY_MS);
});
