// Singleton Web Audio synthesizer (zero AudioContext limit leak across repeated solves)

let sharedAudioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function isSoundMuted() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('rubik_sound_muted') === 'true';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rubik_sound_muted', String(Boolean(muted)));
    }
  } catch {}
  return Boolean(muted);
}

export function playSoundEffect(type) {
  if (isSoundMuted()) return false;
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'ready') {
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'start') {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'stop') {
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(987.77, now + 0.07);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(175, now + 0.08);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'win') {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.09);
      osc.frequency.setValueAtTime(783.99, now + 0.18);
      osc.frequency.setValueAtTime(1046.5, now + 0.27);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === 'tick') {
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.045);
    } else {
      osc.disconnect();
      gain.disconnect();
      return false;
    }

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
    return true;
  } catch {
    return false;
  }
}
