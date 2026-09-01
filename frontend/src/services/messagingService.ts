// @ts-nocheck
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';
import app, { db } from '../lib/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export const requestPushPermission = async (eventId: string, delegateId: string) => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.log('[Push] Firebase Messaging is not supported in this browser.');
      return false;
    }

    if (!('Notification' in window)) {
      console.log('[Push] Notification API not in window.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Notification permission not granted:', permission);
      return false;
    }

    // Ensure Service Worker is registered with scope '/'
    let swReg;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    }

    const messaging = getMessaging(app);
    const tokenOptions: any = {};
    if (swReg) {
      tokenOptions.serviceWorkerRegistration = swReg;
    }
    if (VAPID_KEY) {
      tokenOptions.vapidKey = VAPID_KEY;
    }

    const token = await getToken(messaging, tokenOptions);
    
    if (token) {
      console.log('[Push] FCM Token generated successfully:', token.substring(0, 15) + '...');
      // Save the token to Firestore
      await saveTokenToFirestore(eventId, delegateId, token);
      return true;
    } else {
      console.log('[Push] No FCM Token available.');
      return false;
    }
  } catch (error) {
    console.error('[Push] Error retrieving FCM token:', error);
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
    console.error('[Push] Error saving FCM token to Firestore:', error);
  }
};

export const onForegroundMessage = async () => {
  try {
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      console.log('[Push] Foreground message received:', payload);
    });
  } catch (error) {
    console.error('[Push] Error in onForegroundMessage:', error);
  }
};
