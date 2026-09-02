/**
 * Unified Modern Web Haptic Engine (iOS Taptic Engine + Android Web Vibration)
 * Uses the iOS 17.4+ native switch control hack (web-haptics) to trigger Apple Taptic Engine
 * with multi-frequency audio transient clicks and standard Android navigator.vibrate().
 */
import { WebHaptics } from 'web-haptics';

let webHapticsInstance: WebHaptics | null = null;

function getWebHaptics(): WebHaptics | null {
  if (typeof window === 'undefined') return null;
  if (!webHapticsInstance) {
    try {
      webHapticsInstance = new WebHaptics();
    } catch (e) {
      console.warn('[Haptics] Failed to initialize WebHaptics:', e);
    }
  }
  return webHapticsInstance;
}

// Ensure DOM is initialized on first touch
if (typeof window !== 'undefined') {
  const initEvents = ['touchstart', 'pointerdown', 'click'];
  const handleFirstInteraction = () => {
    try {
      const instance = getWebHaptics();
      if (instance) {
        (instance as any).ensureDOM?.();
      }
    } catch (e) {}
    initEvents.forEach(evt => window.removeEventListener(evt, handleFirstInteraction));
  };
  initEvents.forEach(evt => window.addEventListener(evt, handleFirstInteraction, { passive: true }));
}

/**
 * Trigger cross-platform haptics
 */
function triggerHaptic(preset: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' | 'nudge' | 'buzz', androidFallback: number | number[]) {
  // Prevent browser intervention warning before user gesture
  if (typeof navigator !== 'undefined' && (navigator as any).userActivation && !(navigator as any).userActivation.hasBeenActive) {
    return;
  }

  try {
    const h = getWebHaptics();
    if (h) {
      h.trigger(preset);
      return;
    }
  } catch (e) {}

  // Fallback to standard vibration if web-haptics fails
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(androidFallback);
    } catch (e) {}
  }
}

export const haptic = {
  /**
   * Light, distinct tap for bottom tab switching / nav
   */
  tab: () => {
    triggerHaptic('light', [35]);
  },

  /**
   * Standard button click / action
   */
  button: () => {
    triggerHaptic('medium', [45]);
  },

  /**
   * Document click / View opening
   */
  viewDocument: () => {
    triggerHaptic('heavy', [60]);
  },

  /**
   * Modal open / Close
   */
  modal: () => {
    triggerHaptic('medium', [40]);
  },

  /**
   * Action success / Confirmation
   */
  success: () => {
    triggerHaptic('success', [40, 60, 50]);
  },

  /**
   * Warning / Dismiss
   */
  warning: () => {
    triggerHaptic('warning', [60, 40, 60]);
  },

  /**
   * Incoming Announcement alert
   */
  notification: () => {
    triggerHaptic('nudge', [200, 100, 250]);
  },

  /**
   * New Document Shared — Long, unmissable feedback
   */
  newDocument: () => {
    triggerHaptic('buzz', [300, 100, 300, 100, 600]);
  }
};
