// Web Worker chạy thuật toán Kociemba Two-Phase dưới nền (tránh block UI / Timer 60 FPS)
import {
  initKociembaSolver,
  solveWithKociemba,
  solveScannedFacesWithKociemba,
  verifyCubeStateWithKociemba
} from '../kociemba.js';

self.onmessage = (event) => {
  const { id, action, payload } = event.data || {};
  try {
    let result;
    if (action === 'init') {
      initKociembaSolver();
      result = { ok: true };
    } else if (action === 'solveScramble') {
      result = solveWithKociemba(payload);
    } else if (action === 'solveScanned') {
      result = solveScannedFacesWithKociemba(payload);
    } else if (action === 'verifyState') {
      result = verifyCubeStateWithKociemba(payload);
    } else {
      result = { success: false, error: `Unknown worker action: ${action}` };
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || 'Worker error' });
  }
};
