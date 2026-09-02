/**
 * App Force Update & Cache Clearing Utility
 * Clears Service Worker caches, CacheStorage, and hard-reloads the PWA.
 * Eliminates the need to uninstall/reinstall the PWA on iOS and Android.
 */

export const APP_VERSION = 'v2.6.0 (iOS 캔버스 메모리 가상화 & 초고속 스크롤)';

export async function forceUpdateApp(): Promise<void> {
  try {
    // 1. Unregister all Service Workers to drop stale worker caches
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        try {
          await registration.update();
          await registration.unregister();
        } catch (err) {
          console.warn('[AppUpdate] SW unregister error:', err);
        }
      }
    }

    // 2. Clear all browser CacheStorage
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(key => caches.delete(key)));
    }

    // 3. Clear sessionStorage and obsolete localStorage caches, preserving auth & pdf progress
    try {
      sessionStorage.clear();
      // Retain essential tokens: eventToken, voterId, pwa_start_path, prok_pdf_pos_
      const savedToken = localStorage.getItem('eventToken');
      const savedVoterId = localStorage.getItem('voterId');
      const savedPwaPath = localStorage.getItem('pwa_start_path');
      
      // Clean other potential stale cached keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !['eventToken', 'voterId', 'pwa_start_path'].includes(k) && !k.startsWith('prok_pdf_pos_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      if (savedToken) localStorage.setItem('eventToken', savedToken);
      if (savedVoterId) localStorage.setItem('voterId', savedVoterId);
      if (savedPwaPath) localStorage.setItem('pwa_start_path', savedPwaPath);
    } catch (e) {
      console.warn('[AppUpdate] Storage reset error:', e);
    }

    // 4. Force hard navigation bypassing cache
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('_v', Date.now().toString());
    window.location.replace(currentUrl.toString());
  } catch (error) {
    console.error('[AppUpdate] Force update failed:', error);
    // Fallback hard reload
    window.location.reload();
  }
}
