// オフライン対応の Service Worker
//
// - 初回アクセス時に FILES を全部キャッシュする（以降は電波がなくても動く）
// - 表示はキャッシュから即座に返し、裏でネットワークから取り直してキャッシュを更新する
//   （更新内容は「次に開いたとき」に反映される）
// - ファイルを追加・削除したら FILES を直し、VERSION を上げる（tools/check.js が漏れを検出する）

const VERSION = 'nespe-v7';

const FILES = [
  './',
  './index.html',
  './drills.html',
  './packet-flow.html',
  './terms.html',
  './check.html',
  './compare.html',
  './ports.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/flow.css',
  './css/study.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/book.js',
  './js/check-app.js',
  './js/common.js',
  './js/compare-app.js',
  './js/drills.js',
  './js/flow-engine.js',
  './js/ports-app.js',
  './js/pwa.js',
  './js/study.js',
  './js/terms-app.js',
  './js/scenarios/arp-spoof.js',
  './js/scenarios/basic.js',
  './js/scenarios/bgp.js',
  './js/scenarios/dhcp.js',
  './js/scenarios/dns.js',
  './js/scenarios/dos.js',
  './js/scenarios/dot1x.js',
  './js/scenarios/fragment.js',
  './js/scenarios/gre.js',
  './js/scenarios/handshake.js',
  './js/scenarios/header-rewrite.js',
  './js/scenarios/ipsec.js',
  './js/scenarios/lb.js',
  './js/scenarios/mail.js',
  './js/scenarios/napt.js',
  './js/scenarios/openflow.js',
  './js/scenarios/ospf.js',
  './js/scenarios/proxy.js',
  './js/scenarios/sip.js',
  './js/scenarios/snmp.js',
  './js/scenarios/stateful-fw.js',
  './js/scenarios/stp.js',
  './js/scenarios/tcp.js',
  './js/scenarios/tls.js',
  './js/scenarios/traceroute.js',
  './js/scenarios/vlan.js',
  './js/scenarios/vrrp.js',
  './js/scenarios/vxlan.js',
  './js/scenarios/wan.js',
  // apps の外にある学習データ
  '../flashcards/compare.js',
  '../flashcards/ports.js',
  '../flashcards/terms.js',
  '../quizzes/check.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('オフラインのため表示できません', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
