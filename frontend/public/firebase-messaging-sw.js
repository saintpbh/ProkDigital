importScripts("https://www.gstatic.com/firebasejs/10.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.10.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyAyPme_h0qc8OFSLVt-4HhSCHYxvgnw8ZU",
  authDomain: "prok-digitalga.firebaseapp.com",
  projectId: "prok-digitalga",
  storageBucket: "prok-digitalga.firebasestorage.app",
  messagingSenderId: "389715506054",
  appId: "1:389715506054:web:83b63111a90896d478b207"
};

try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const messaging = firebase.messaging();

  // Background message handler: Only display notification if FCM SDK has not automatically displayed one
  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message received:", payload);
    
    // When FCM sends a payload with top-level 'notification', Firebase SDK automatically renders it.
    // We only manually call showNotification if 'notification' is absent (data-only push):
    if (!payload.notification) {
      const title = payload.data?.title || "한국기독교장로회 디지털 총회";
      const options = {
        body: payload.data?.body || "새로운 총회 알림이 도착했습니다.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: payload.data?.tag || "prok-notice",
        renotify: true,
        vibrate: [200, 100, 200],
        data: {
          url: payload.data?.url || "https://digital.prok.or.kr/"
        }
      };
      self.registration.showNotification(title, options);
    }
  });
} catch (err) {
  console.error("[SW] Firebase init error:", err);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "https://digital.prok.or.kr/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
