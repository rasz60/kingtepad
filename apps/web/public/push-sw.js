// 웹 푸시 수신 (workbox 가 만든 sw.js 에서 importScripts 로 불러온다)
// payload: { title, body, url, tag, badge }  — apps/api/src/notifier.ts 참고

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || '업무일지', {
        body: data.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: data.tag,
        data: { url: data.url || '/' },
      });
      // 앱 아이콘 숫자 = 읽지 않은 알림 수
      if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
        await (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = windows.find((w) => 'focus' in w);
      if (win) {
        await win.focus();
        if ('navigate' in win) await win.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
