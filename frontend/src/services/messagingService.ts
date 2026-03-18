// @ts-nocheck
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
// @ts-ignore
import { setDoc } from 'firebase/firestore';
import app, { db } from '../lib/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'YOUR_VAPID_KEY_HERE';

export const requestPushPermission = async (eventId: string, delegateId: string) => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.log('Firebase Messaging is not supported in this browser.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission not granted.');
      return false;
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    
    if (token) {
      console.log('FCM Token generated successfully.');
      // Save the token to Firestore
      await saveTokenToFirestore(eventId, delegateId, token);
      
      // Send the config to the Service Worker so it can initialize Firebase in the background
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
              type: 'INIT_FIREBASE',
              firebaseConfig: app.options
          });
      }

      return true;
    } else {
      console.log('No FCM Token available. Request permission to generate one.');
      return false;
    }
  } catch (error) {
    console.error('An error occurred while retrieving FCM token. ', error);
    return false;
  }
};

const saveTokenToFirestore = async (eventId: string, delegateId: string, token: string) => {
  try {
    const tokenRef = doc(db, 'events', eventId, 'delegateTokens', token);
    await setDoc(tokenRef, {
      delegateId,
      token,
      updatedAt: serverTimestamp(),
      platform: navigator.userAgent
    });
  } catch (error) {
    console.error('Error saving FCM token to Firestore:', error);
  }
};

export const onForegroundMessage = () => {
  isSupported().then(supported => {
    if (supported) {
      const messaging = getMessaging(app);
      onMessage(messaging, (payload) => {
        console.log('Received foreground message ', payload);
        // You can use a toast notification here if you want to show it in-app
        // alert(`새 알림: ${payload.notification?.title}\n${payload.notification?.body}`);
      });
    }
  });
};
