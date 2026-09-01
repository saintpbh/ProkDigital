/**
 * Unified Haptic Feedback Utility
 * Supports navigator.vibrate (Android / Standard) + Web Audio API pulse fallback for iOS Safari.
 */

// Web Audio API context for iOS tactile feedback fallback
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a subtle synthesized audio click/haptic pulse for iOS Safari
 */
function playSyntheticPulse(frequency = 150, duration = 0.04, gainLevel = 0.08) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Ignore audio context autoplay restriction errors
  }
}

/**
 * Trigger vibration pattern with iOS audio fallback
 */
function vibrate(pattern: number | number[], audioFreq = 160, audioDur = 0.04) {
  if (typeof window === 'undefined') return;

  // 1. Android / standard navigator.vibrate
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // ignore
    }
  }

  // 2. iOS audio tactile pulse
  playSyntheticPulse(audioFreq, audioDur);
}

export const haptic = {
  /**
   * Light tap for tab switching
   */
  tab: () => {
    vibrate(12, 220, 0.02);
  },

  /**
   * Standard button click
   */
  button: () => {
    vibrate(15, 200, 0.03);
  },

  /**
   * Document click / View opening
   */
  viewDocument: () => {
    vibrate(35, 180, 0.05);
  },

  /**
   * Modal open / Close
   */
  modal: () => {
    vibrate(20, 240, 0.03);
  },

  /**
   * Action success / Confirmation
   */
  success: () => {
    vibrate([25, 40, 45], 300, 0.06);
  },

  /**
   * Warning / Dismiss
   */
  warning: () => {
    vibrate([50, 40, 50], 120, 0.08);
  },

  /**
   * Incoming Announcement / Notification alert (Medium-strong)
   */
  notification: () => {
    vibrate([150, 80, 180], 350, 0.12);
  },

  /**
   * New Document Shared — Long, prominent, unmissable feedback
   */
  newDocument: () => {
    vibrate([250, 100, 250, 100, 500], 400, 0.18);
  }
};
