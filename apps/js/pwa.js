// オフライン対応：Service Worker を登録する（https で配信されているときだけ。file:// では何もしない）
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker の登録に失敗', err));
}
