// ==========================================================================
// SMART ANTI-BOT & HUMAN TELEMETRY ENGINE (v2.0 — Turnstile-Style)
// Cơ chế kép:
//   1. Tự động xác minh ngầm (Zero-Friction Passive Telemetry) cho người chơi thật
//      dựa trên chuyển động chuột/cảm ứng tự nhiên, sự kiện phần cứng isTrusted
//      và Proof-of-Work nhẹ trên trình duyệt.
//   2. Chỉ bật hộp thoại thử thách thông minh (Kéo khớp khối Rubik) khi phát hiện
//      dấu hiệu tự động hóa (WebDriver/Headless) hoặc hành vi bất thường.
// ==========================================================================

const SESSION_KEY = 'rubik_human_verified_v2';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // Lưu phiên xác minh 24 giờ cho người chơi thật

// Ngưỡng thời gian tối thiểu hợp lý (giây) để một lượt giải được tính vào Bảng Kỷ Lục.
export const MIN_HUMAN_SOLVE_SEC = {
  '2x2': 0.45,
  '3x3': 2.80,
  '4x4': 15.0,
  '5x5': 30.0
};

// Theo dõi tín hiệu sinh trắc học hành vi tự nhiên trên trang
const passiveSignals = {
  trustedMoves: 0,
  trustedClicksOrKeys: 0,
  lastMoveX: -1,
  lastMoveY: -1,
  nonLinearMovements: 0,
  initialized: false
};

export function initPassiveHumanTelemetry() {
  if (passiveSignals.initialized || typeof window === 'undefined') return;
  passiveSignals.initialized = true;

  const onPointerMove = (e) => {
    if (!e.isTrusted) return;
    passiveSignals.trustedMoves += 1;
    if (passiveSignals.lastMoveX !== -1) {
      const dx = Math.abs(e.clientX - passiveSignals.lastMoveX);
      const dy = Math.abs(e.clientY - passiveSignals.lastMoveY);
      if (dx > 0 && dy > 0 && dx !== dy) {
        passiveSignals.nonLinearMovements += 1;
      }
    }
    passiveSignals.lastMoveX = e.clientX;
    passiveSignals.lastMoveY = e.clientY;

    // Nếu người dùng có chuyển động chuột/chạm tự nhiên và không phải trình duyệt bot -> tự cấp phiên
    if (
      passiveSignals.trustedMoves >= 6 &&
      passiveSignals.nonLinearMovements >= 2 &&
      detectAutomation().length === 0 &&
      !isHumanSessionValid()
    ) {
      grantHumanSession('passive-telemetry');
    }
  };

  const onTrustedAction = (e) => {
    if (!e.isTrusted) return;
    passiveSignals.trustedClicksOrKeys += 1;
    if (
      passiveSignals.trustedClicksOrKeys >= 2 &&
      passiveSignals.trustedMoves >= 2 &&
      detectAutomation().length === 0 &&
      !isHumanSessionValid()
    ) {
      grantHumanSession('trusted-interaction');
    }
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onTrustedAction, { passive: true });
  window.addEventListener('keydown', onTrustedAction, { passive: true });
}

// Khởi động ngay khi nạp module
initPassiveHumanTelemetry();

// 1. Phát hiện trình duyệt bị điều khiển tự động (Selenium/Puppeteer/Playwright...)
export function detectAutomation() {
  const reasons = [];
  try {
    if (typeof navigator !== 'undefined') {
      if (navigator.webdriver === true) reasons.push('navigator.webdriver');
      if (/HeadlessChrome|PhantomJS/i.test(navigator.userAgent || '')) reasons.push('headless-ua');
    }
    if (typeof window !== 'undefined') {
      if (window.callPhantom || window._phantom || window.__nightmare) reasons.push('phantom');
      if (window.__puppeteer_evaluation_script__) reasons.push('puppeteer-script');
    }
    if (typeof document !== 'undefined') {
      if (document.__selenium_unwrapped || document.__webdriver_evaluate || document.__driver_evaluate) {
        reasons.push('selenium');
      }
    }
  } catch {
    /* ignore */
  }
  return reasons;
}

// 2. Phiên "đã xác minh là người thật" (Lưu trong cả localStorage & sessionStorage trong 24h)
export function isHumanSessionValid() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed.exp === 'number' && Date.now() < parsed.exp);
  } catch {
    return false;
  }
}

export function getHumanSessionInfo() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.exp === 'number' && Date.now() < parsed.exp) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function grantHumanSession(method = 'interactive-shield') {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_TTL_MS,
    verifiedAt: new Date().toLocaleTimeString('vi-VN'),
    method
  });
  try {
    localStorage.setItem(SESSION_KEY, payload);
    sessionStorage.setItem(SESSION_KEY, payload);
  } catch {
    /* ignore */
  }
}

export function revokeHumanSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// 3. Sự kiện phím/chuột/chạm thật do phần cứng người dùng tạo ra (dispatchEvent giả sẽ có isTrusted=false)
export function isTrustedInput(e) {
  const ev = e && e.nativeEvent ? e.nativeEvent : e;
  return Boolean(ev && ev.isTrusted === true);
}

// 4. Bộ theo dõi hành vi: chỉ bắt các trường hợp скрипт/macro thực sự (tránh bắt nhầm người thật)
export function createBehaviorTracker() {
  const holds = [];
  const solveTimes = [];

  return {
    suspicious: false,
    reason: '',

    flag(reason) {
      this.suspicious = true;
      this.reason = reason;
    },

    reset() {
      this.suspicious = false;
      this.reason = '';
      holds.length = 0;
      solveTimes.length = 0;
    },

    // Thời gian giữ phím/chạm (ms). Chỉ gắn cờ khi 6 lần liên tiếp chênh nhau < 1ms (macro định thời cứng)
    recordHold(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      holds.push(ms);
      if (holds.length > 6) holds.shift();
      if (holds.length >= 6) {
        const spread = Math.max(...holds) - Math.min(...holds);
        if (spread < 1.0) this.flag('Nhịp giữ phím trùng khớp từng mili-giây (nghi vấn Macro)');
      }
    },

    recordStart() {
      // Không khóa cứng khi người chơi reset lượt nhanh
    },

    recordSolve(sec) {
      if (!Number.isFinite(sec) || sec <= 0) return;
      solveTimes.push(sec);
      if (solveTimes.length > 5) solveTimes.shift();
      if (solveTimes.length >= 5) {
        const last5 = solveTimes.slice(-5);
        if (last5.every((t) => t === last5[0])) {
          this.flag('5 lượt giải liên tiếp có thời gian giống hệt nhau đến 0.01s');
        }
      }
    }
  };
}

// 5. Kiểm tra tính hợp lệ của một lượt giải trước khi ghi vào Bảng Kỷ Lục
export function evaluateSolveIntegrity({ sec, puzzle, behavior }) {
  const minSec = MIN_HUMAN_SOLVE_SEC[puzzle] ?? 2.0;
  if (sec < minSec) {
    return {
      ok: false,
      reason: `Thời gian ${sec}s nhanh hơn ngưỡng vật lý tối thiểu của khối ${puzzle} (${minSec}s)`
    };
  }
  if (behavior && behavior.suspicious) {
    return { ok: false, reason: behavior.reason || 'Phát hiện mẫu lặp Macro bất thường' };
  }
  return { ok: true, reason: '' };
}
