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

  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message received:", payload);
    const title = payload.notification?.title || payload.data?.title || "한국기독교장로회 디지털 총회";
    const options = {
      body: payload.notification?.body || payload.data?.body || "새로운 총회 알림이 도착했습니다.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200],
      data: {
        url: payload.fcmOptions?.link || payload.data?.url || "https://digital.prok.or.kr/"
      }
    };
    self.registration.showNotification(title, options);
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

// Fallback native push event listener for raw WebPush payloads on iOS Safari PWA
self.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log("[SW] Native push payload:", payload);
      const title = payload.notification?.title || payload.data?.title || "한국기독교장로회 디지털 총회";
      const options = {
        body: payload.notification?.body || payload.data?.body || "새로운 총회 알림이 도착했습니다.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        data: {
          url: payload.fcmOptions?.link || payload.data?.url || "https://digital.prok.or.kr/"
        }
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      const options = {
        body: event.data.text() || "새로운 총회 알림이 도착했습니다.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "https://digital.prok.or.kr/" }
      };
      event.waitUntil(self.registration.showNotification("한국기독교장로회 디지털 총회", options));
    }
  }
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
