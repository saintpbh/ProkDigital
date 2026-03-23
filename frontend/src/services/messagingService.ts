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
      
      // Ensure the Service Worker is ready and controlling the page
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active) {
          registration.active.postMessage({
            type: 'INIT_FIREBASE',
            firebaseConfig: app.options
          });
          console.log('[Push] Sent INIT_FIREBASE to active SW');
        }
      }

      return true;
    } else {
      console.log('No FCM Token available.');
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

export const onForegroundMessage = async () => {
  try {
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log('Received foreground message ', payload);
      // Optional: Add a custom UI toast here if needed
    });
  } catch (error) {
    console.error('Error in onForegroundMessage:', error);
  }
};
