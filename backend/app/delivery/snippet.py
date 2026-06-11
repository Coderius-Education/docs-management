"""Analytics-snippet: ~1 kB vanilla JS, geïnjecteerd in elke HTML-response.

Meet pageviews, exposure (route raakt experimentpagina), zichtbare tijd
(heartbeat) en scroll-diepte. Geen persoonsgegevens: alleen een random anon-id
in localStorage.
"""

SNIPPET_TAG = b'<script defer src="/_cdx/t.js"></script>'

SNIPPET_JS = r"""
(function () {
  'use strict';
  var KEY = 'cdx_anon';
  var anon;
  try {
    anon = localStorage.getItem(KEY);
    if (!anon) {
      anon = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, anon);
    }
  } catch (e) { anon = 'na'; }

  var expMatch = document.cookie.match(/cdx_exp_(\d+)=([AB])/);
  var exp = expMatch ? parseInt(expMatch[1], 10) : null;
  var variant = expMatch ? expMatch[2] : null;
  var buf = [];
  var visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  var visibleMs = 0;
  var maxScroll = 0;

  function send(immediate) {
    if (!buf.length) return;
    var payload = JSON.stringify({ anon: anon, events: buf.splice(0, buf.length) });
    if (immediate && navigator.sendBeacon) {
      navigator.sendBeacon('/_cdx/events', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/_cdx/events', { method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    }
  }

  function track(type, value) {
    buf.push({ type: type, path: location.pathname, value: value == null ? null : value,
      exp: exp, variant: variant, ts: Date.now() });
  }

  function flushVisible() {
    if (visibleSince) { visibleMs += Date.now() - visibleSince; visibleSince = null; }
  }

  track('pageview');
  send();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { visibleSince = Date.now(); }
    else { flushVisible(); }
  });

  document.addEventListener('scroll', function () {
    var h = document.documentElement;
    var depth = (h.scrollTop + h.clientHeight) / h.scrollHeight;
    if (depth > maxScroll) maxScroll = depth;
  }, { passive: true });

  setInterval(function () {
    if (document.visibilityState === 'visible') {
      flushVisible();
      visibleSince = Date.now();
      if (visibleMs > 0) { track('heartbeat', Math.round(visibleMs / 1000)); visibleMs = 0; send(); }
    }
  }, 15000);

  // SPA-navigatie (Docusaurus gebruikt history.pushState)
  var push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    track('pageview');
    send();
  };

  addEventListener('pagehide', function () {
    flushVisible();
    if (visibleMs > 0) track('heartbeat', Math.round(visibleMs / 1000));
    track('scroll', Math.round(maxScroll * 100));
    send(true);
  });
})();
""".encode()


def inject_snippet(html: bytes) -> bytes:
    """Voegt het snippet toe vóór </head>; laat HTML zonder head ongemoeid."""
    idx = html.find(b"</head>")
    if idx == -1:
        return html
    return html[:idx] + SNIPPET_TAG + html[idx:]
