/* 본사 서비스 워커: 홈 화면 앱으로 설치되게 하고, 앱 화면을 빨리 띄운다.
   게임 파일은 늘 서버에서 새로 받고(그래야 업데이트가 바로 반영된다), 서버에 닿지 않을 때만 저장해 둔 것을 쓴다.
   로그인·관리자·실시간 연결은 절대 저장하지 않는다. */
var CACHE = 'bonsa-v1';
var SHELL = ['/', '/game.js', '/world.js', '/manifest.webmanifest', '/icons/icon-192.png'];
var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // 3D 엔진: 버전이 고정된 주소라 한 번 받으면 저장해 두고 쓴다
  if (url.href === THREE_URL) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|admin|ws)/.test(url.pathname)) return;
  // 그 밖의 게임 파일: 서버 먼저, 안 되면 저장본
  var key = url.pathname === '/' ? '/' : url.pathname;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && (SHELL.indexOf(key) >= 0 || /^\/(fonts|icons)\//.test(key))) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (hit) { return hit || Response.error(); });
  }));
});
