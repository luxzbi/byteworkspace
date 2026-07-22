/* 저장된 테마를 페이지가 그려지기 전에 적용한다(깜빡임 방지).
   CSP가 인라인 스크립트를 막으므로 별도 파일로 두고 head에서 동기 로드한다.
   값: 'system' | 'dark' | 'light' — 계정 설정에서 바꾸면 서버에도 저장된다. */
(function () {
  var KEY = 'ws_theme';
  var t = localStorage.getItem(KEY) || 'system';
  var media = window.matchMedia('(prefers-color-scheme: light)');
  function apply() {
    document.documentElement.setAttribute('data-theme', t === 'system' ? (media.matches ? 'light' : 'dark') : t);
  }
  apply();
  media.addEventListener('change', function () { if (t === 'system') apply(); });
  window.wsTheme = {
    get: function () { return t; },
    set: function (v) { t = v; try { localStorage.setItem(KEY, v); } catch (_) {} apply(); },
    resolved: function () { return document.documentElement.getAttribute('data-theme'); }
  };
})();
