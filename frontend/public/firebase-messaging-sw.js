importScripts("https://www.gstatic.com/firebasejs/10.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.10.0/firebase-messaging-compat.js");

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "INIT_FIREBASE") {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(event.data.firebaseConfig);
        const messaging = firebase.messaging();

        messaging.onBackgroundMessage((payload) => {
          console.log(
            "[firebase-messaging-sw.js] Received background message ",
            payload
          );
          
          const notificationTitle = payload.notification?.title || "디지털 총회 시스템";
          const notificationOptions = {
            body: payload.notification?.body || "새로운 알림이 도착했습니다.",
            icon: '/icon-192x192.png',
            data: payload.data
          };

          self.registration.showNotification(notificationTitle, notificationOptions);
        });
      }
    } catch (err) {
      console.error("Firebase initializing error in SW", err);
    }
  }
});
