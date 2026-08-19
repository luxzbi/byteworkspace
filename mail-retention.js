'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAIL_RETENTION_MS = 14 * DAY_MS;
const MAIL_EXTENSION_MS = 7 * DAY_MS;

function mailExpiresAt(mail) {
  const stored = Number(mail && mail.expiresAt) || 0;
  if (stored) return stored;
  const readAt = Number(mail && mail.readAt) || 0;
  return readAt ? readAt + MAIL_RETENTION_MS : 0;
}

function extendedMailExpiry(mail) {
  const current = mailExpiresAt(mail);
  return current ? current + MAIL_EXTENSION_MS : 0;
}

module.exports = { DAY_MS, MAIL_RETENTION_MS, MAIL_EXTENSION_MS, mailExpiresAt, extendedMailExpiry };
