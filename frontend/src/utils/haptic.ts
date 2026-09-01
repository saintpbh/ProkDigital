/**
 * High-Impact Dual Haptic Engine
 * 1. Android: High-torque motor vibration (30ms - 500ms multi-pulse)
 * 2. iOS: Physical speaker tactile impulse (Sub-bass + mechanical transient click)
 */

let audioCtx: AudioContext | null = null;

function unlockAudioContext() {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  } catch (e) {
    // ignore
  }
}

// Auto-unlock on first user touch anywhere
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'click'];
  const handleFirstTouch = () => {
    unlockAudioContext();
    unlockEvents.forEach(evt => window.removeEventListener(evt, handleFirstTouch));
  };
  unlockEvents.forEach(evt => window.addEventListener(evt, handleFirstTouch, { passive: true }));
}

/**
 * Synthesize a crisp mechanical tactile impulse for iOS
 */
function playTactileImpulse(type: 'light' | 'medium' | 'heavy' | 'double' | 'long') {
  try {
    unlockAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    if (type === 'light') {
      // Crisp mechanical tab click (450Hz transient + 75Hz sub body)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.035);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'medium') {
      // Solid button press
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'heavy') {
      // Document view / Modal open
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'double') {
      // Notification alert
      [0, 0.1].forEach((delay) => {
        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now + delay);
        osc.frequency.exponentialRampToValueAtTime(80, now + delay + 0.06);
        gain.gain.setValueAtTime(0.5, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx!.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.06);
      });
    } else if (type === 'long') {
      // New Document Shared (Long prominent feedback)
      [0, 0.12, 0.26].forEach((delay) => {
        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now + delay);
        osc.frequency.exponentialRampToValueAtTime(60, now + delay + 0.1);
        gain.gain.setValueAtTime(0.6, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx!.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.1);
      });
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Trigger vibration pattern with iOS audio fallback
 */
function vibrate(androidPattern: number | number[], iosType: 'light' | 'medium' | 'heavy' | 'double' | 'long') {
  if (typeof window === 'undefined') return;

  // 1. Android physical vibration (ensured min 30ms duration for motor spin-up)
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(androidPattern);
    } catch (e) {
      // ignore
    }
  }

  // 2. iOS Speaker tactile mechanical impulse
  playTactileImpulse(iosType);
}

export const haptic = {
  /**
   * Light, distinct tap for bottom tab switching
   */
  tab: () => {
    vibrate([35], 'light');
  },

  /**
   * Standard button click
   */
  button: () => {
    vibrate([45], 'medium');
  },

  /**
   * Document click / View opening
   */
  viewDocument: () => {
    vibrate([60], 'heavy');
  },

  /**
   * Modal open / Close
   */
  modal: () => {
    vibrate([40], 'medium');
  },

  /**
   * Action success / Confirmation
   */
  success: () => {
    vibrate([40, 50, 60], 'double');
  },

  /**
   * Warning / Dismiss
   */
  warning: () => {
    vibrate([80, 50, 80], 'double');
  },

  /**
   * Incoming Announcement alert
   */
  notification: () => {
    vibrate([200, 100, 250], 'double');
  },

  /**
   * New Document Shared — Long, unmissable feedback
   */
  newDocument: () => {
    vibrate([300, 100, 300, 100, 600], 'long');
  }
};
