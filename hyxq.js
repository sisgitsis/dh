// ==UserScript==
// @name         幻宇星球 VIP 解锁 V5（链接/跳转全代理版）
// @namespace    huanyu-vip-unlock
// @version      5.0
// @description  把 hyxq 域名的链接、表单、跳转、fetch/XHR/WebSocket 全部改写到解锁 Worker，等效 Surge URL Rewrite / Loon / QX
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      huanyu-proxy.daoyufan.workers.dev
// @connect      *
// ==/UserScript==

/* ========== 沙箱部分：GM 转发（给 fetch/XHR 用，无视 CORS） ========== */
(function sandboxBridge() {
  'use strict';
  function bufToB64(buf) {
    const u8 = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  window.addEventListener('__hy_req', function (e) {
    let d; try { d = JSON.parse(e.detail); } catch (err) { return; }
    function reply(status, headers, buf, err) {
      window.dispatchEvent(new CustomEvent('__hy_resp_' + d.id, {
        detail: JSON.stringify({ status: status, headers: headers || '', bodyB64: buf ? bufToB64(buf) : null, err: err || null })
      }));
    }
    try {
      const opt = {
        url: d.url, method: d.method || 'GET', headers: d.headers || {},
        responseType: 'arraybuffer', timeout: 30000,
        onload: function (r) { reply(r.status, r.responseHeaders, r.response); },
        onerror: function (err) { reply(0, '', null, String(err && err.error || 'error')); },
        ontimeout: function () { reply(0, '', null, 'timeout'); }
      };
      if (d.bodyB64) opt.data = b64ToBuf(d.bodyB64);
      else if (d.bodyText != null) opt.data = d.bodyText;
      GM_xmlhttpRequest(opt);
    } catch (err) { reply(0, '', null, String(err)); }
  });
})();

/* ========== 页面部分 ========== */
(function inject() {
  const code = `
(function () {
  'use strict';
  var WORKER = 'https://huanyu-proxy.daoyufan.workers.dev';
  var HOST_RE = /^(huanyuxingqiu\\.\\w+|daoyu\\.\\w+|\\w*hyxq\\w*\\.\\w+)$/i;
  var STATIC_RE = /\\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|mp[34]|zip|rar)(\\?|$)/i;

  var hitCount = 0, seq = 0;

  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;background:#000c;color:#0f6;font:12px/1.5 monospace;padding:5px 9px;border-radius:6px';
  function paint() { el.textContent = '幻宇V5 已改写 ' + hitCount; }
  paint();
  (document.documentElement || document).appendChild(el);

  // 命中规则 → Worker 地址；否则 null
  function toWorker(url) {
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!HOST_RE.test(u.hostname)) return null;
      if (STATIC_RE.test(u.pathname + u.search)) return null;
      return WORKER + u.pathname + u.search;
    } catch (e) { return null; }
  }

  /* ---- 1. 链接点击：捕获阶段改 href，浏览器自己走 Worker 加载 ---- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var t = toWorker(a.getAttribute('href'));
    if (t) { hitCount++; paint(); a.href = t; a.removeAttribute('target'); }
  }, true);

  /* ---- 2. 已有/新增 <a> 预改写（MutationObserver） ---- */
  function fixLinks(root) {
    (root.querySelectorAll ? root.querySelectorAll('a[href]') : []).forEach(function (a) {
      var t = toWorker(a.getAttribute('href'));
      if (t && a.href !== t) { hitCount++; a.href = t; }
    });
    paint();
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) fixLinks(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  fixLinks(document.documentElement);

  /* ---- 3. 表单提交 ---- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var t = toWorker(f.getAttribute('action') || location.href);
    if (t) { hitCount++; paint(); f.action = t; }
  }, true);

  /* ---- 4. window.open ---- */
  var _open = window.open;
  window.open = function (url) {
    var t = url && toWorker(url);
    if (t) { hitCount++; paint(); url = t; }
    return _open.apply(this, [url].concat([].slice.call(arguments, 1)));
  };

  /* ---- 5. location.assign / replace ---- */
  try {
    ['assign', 'replace'].forEach(function (m) {
      var fn = Location.prototype[m];
      Location.prototype[m] = function (url) {
        var t = toWorker(url);
        if (t) { hitCount++; paint(); url = t; }
        return fn.call(this, url);
      };
    });
  } catch (e) {}

  /* ---- 6. WebSocket ---- */
  try {
    var _WS = window.WebSocket;
    window.WebSocket = function (url, proto) {
      var t = toWorker(url);
      if (t) { hitCount++; paint(); url = t.replace(/^http/, 'ws'); }
      return proto ? new _WS(url, proto) : new _WS(url);
    };
    window.WebSocket.prototype = _WS.prototype;
    ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function (k) { window.WebSocket[k] = _WS[k]; });
  } catch (e) {}

  /* ---- 7. fetch / XHR（走 GM 桥，无视 CORS） ---- */
  function b64ToBuf(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function bufToB64(buf) {
    var u8 = new Uint8Array(buf), s = '';
    for (var i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function gmFetch(url, origin, method, headers, body) {
    hitCount++; paint();
    return new Promise(function (resolve, reject) {
      var id = ++seq, ev = '__hy_resp_' + id;
      var timer = setTimeout(function () { cleanup(); reject(new Error('hy timeout')); }, 35000);
      function cleanup() { window.removeEventListener(ev, onResp); clearTimeout(timer); }
      function onResp(e) {
        cleanup();
        try {
          var d = JSON.parse(e.detail);
          if (d.err) return reject(new Error('hy gm: ' + d.err));
          var buf = d.bodyB64 ? b64ToBuf(d.bodyB64) : new ArrayBuffer(0);
          var hs = {};
          String(d.headers || '').split(/\\r?\\n/).forEach(function (line) {
            var i = line.indexOf(':');
            if (i > 0) {
              var k = line.slice(0, i).trim().toLowerCase();
              if (!/^(content-encoding|content-length|transfer-encoding)$/.test(k))
                hs[k] = line.slice(i + 1).trim();
            }
          });
          resolve(new Response(buf, { status: d.status || 200, headers: hs }));
        } catch (err) { reject(err); }
      }
      window.addEventListener(ev, onResp);
      var h2 = Object.assign({}, headers || {});
      h2['Referer'] = origin + '/';
      h2['Origin'] = origin;
      var msg = { id: id, url: url, method: method || 'GET', headers: h2 };
      function send() { window.dispatchEvent(new CustomEvent('__hy_req', { detail: JSON.stringify(msg) })); }
      if (body != null) {
        if (typeof body === 'string') { msg.bodyText = body; send(); }
        else if (body instanceof ArrayBuffer) { msg.bodyB64 = bufToB64(body); send(); }
        else if (ArrayBuffer.isView(body)) { msg.bodyB64 = bufToB64(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)); send(); }
        else if (body instanceof Blob) { body.arrayBuffer().then(function (ab) { msg.bodyB64 = bufToB64(ab); send(); }); }
        else send();
      } else send();
    });
  }

  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : input && input.url;
    var r = url && toWorker(url);
    if (!r) return _fetch.call(this, input, init);
    var origin = new URL(url, location.href).origin;
    var method = init.method || (typeof input !== 'string' && input.method) || 'GET';
    var headers = {};
    var src = init.headers || (typeof input !== 'string' && input.headers);
    if (src) new Headers(src).forEach(function (v, k) { headers[k] = v; });
    var bodyP = init.body !== undefined ? Promise.resolve(init.body)
      : (typeof input !== 'string' && input.method !== 'GET' ? input.clone().arrayBuffer() : Promise.resolve(undefined));
    return bodyP.then(function (body) { return gmFetch(r, origin, method, headers, body); });
  };

  var _xopen = XMLHttpRequest.prototype.open;
  var _xsetH = XMLHttpRequest.prototype.setRequestHeader;
  var _xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    var t = toWorker(url);
    this.__hy = t ? { target: t, origin: new URL(url, location.href).origin } : null;
    this.__hyM = method; this.__hyH = {};
    if (!this.__hy) return _xopen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (!this.__hy) return _xsetH.apply(this, arguments);
    this.__hyH[k] = v;
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__hy) return _xsend.apply(this, arguments);
    var xhr = this;
    gmFetch(xhr.__hy.target, xhr.__hy.origin, xhr.__hyM, xhr.__hyH, body).then(function (resp) {
      return resp.arrayBuffer().then(function (buf) {
        var hdrs = {}; resp.headers.forEach(function (v, k) { hdrs[k] = v; });
        var isText = xhr.responseType === '' || xhr.responseType === 'text';
        var txt = isText ? new TextDecoder().decode(buf) : undefined;
        var defs = {
          status: resp.status, statusText: '', responseURL: xhr.__hy.target, readyState: 4,
          response: isText ? txt : buf, responseText: txt,
          getAllResponseHeaders: function () { return Object.keys(hdrs).map(function (k) { return k + ': ' + hdrs[k]; }).join('\\r\\n'); },
          getResponseHeader: function (k) { return hdrs[String(k).toLowerCase()] || null; }
        };
        Object.keys(defs).forEach(function (k) {
          try { Object.defineProperty(xhr, k, { get: function () { return defs[k]; } }); } catch (e) {}
        });
        ['readystatechange', 'load', 'loadend'].forEach(function (t) {
          xhr.dispatchEvent(new Event(t));
          var fn = xhr['on' + t]; if (fn) try { fn.call(xhr, new Event(t)); } catch (e) {}
        });
      });
    }).catch(function () {
      xhr.dispatchEvent(new Event('error'));
      var fn = xhr.onerror; if (fn) try { fn.call(xhr, new Event('error')); } catch (e) {}
    });
  };

  /* ---- 8. video/audio src ---- */
  try {
    var d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (d && d.set) Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get: d.get,
      set: function (v) { var t = toWorker(v); if (t) { hitCount++; paint(); v = t; } d.set.call(this, v); }
    });
  } catch (e) {}
})();
`;
  const s = document.createElement('script');
  s.textContent = code;
  (document.documentElement || document).appendChild(s);
  s.remove();
})();