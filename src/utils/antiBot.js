// ==========================================================================
// ANTI-BOT TOOLKIT (client-side)
// Nhiều lớp phòng thủ nhẹ, chạy hoàn toàn trên trình duyệt, không cần server.
// Lưu ý: đây là lớp "rào chắn" chống bot/script phổ thông. Muốn chống tuyệt đối
// cần thêm xác thực ở server (ví dụ Cloudflare Turnstile + kiểm tra phía backend).
// ==========================================================================

const SESSION_KEY = 'rubik_human_session_v1';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 phút

// Ngưỡng thời gian tối thiểu hợp lý (giây) để một lượt giải được tính vào Bảng Kỷ Lục.
export const MIN_HUMAN_SOLVE_SEC = {
  '2x2': 0.5,
  '3x3': 2.0,
  '4x4': 10,
  '5x5': 20
};

// 1. Phát hiện trình duyệt bị điều khiển tự động (Selenium/Puppeteer/Playwright...)
export function detectAutomation() {
  const reasons = [];
  try {
    if (typeof navigator !== 'undefined') {
      if (navigator.webdriver) reasons.push('navigator.webdriver');
      if (/HeadlessChrome|PhantomJS|Electron/i.test(navigator.userAgent || '')) reasons.push('headless-ua');
      if (navigator.languages && navigator.languages.length === 0) reasons.push('no-languages');
    }
    if (typeof window !== 'undefined') {
      if (window.callPhantom || window._phantom || window.__nightmare) reasons.push('phantom');
      if (window.__playwright || window.__pw_manual || window.__puppeteer_evaluation_script__) reasons.push('automation-global');
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

// 2. Phiên "đã xác minh là người" (có hạn dùng)
export function isHumanSessionValid() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { exp } = JSON.parse(raw);
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

export function grantHumanSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  } catch {
    /* ignore */
  }
}

export function revokeHumanSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// 3. Sự kiện phím/chuột/chạm thật do người dùng tạo ra (dispatchEvent giả sẽ có isTrusted=false)
export function isTrustedInput(e) {
  const ev = e && e.nativeEvent ? e.nativeEvent : e;
  return Boolean(ev && ev.isTrusted === true);
}

// 4. Bộ theo dõi hành vi: nhịp giữ phím, tốc độ bắt đầu, kết quả lặp lại bất thường
export function createBehaviorTracker() {
  const holds = [];
  const solveTimes = [];
  let lastStartAt = 0;

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

    // Thời gian giữ phím/chạm (ms). Con người luôn dao động; bot thường đều tăm tắp.
    recordHold(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      holds.push(ms);
      if (holds.length > 6) holds.shift();
      if (holds.length >= 5) {
        const spread = Math.max(...holds) - Math.min(...holds);
        if (spread < 4) this.flag('nhịp giữ phím đều bất thường (giống bot)');
      }
    },

    // Hai lượt bắt đầu quá sát nhau (< 1.2s) là không thực tế với người thật
    recordStart() {
      const now = performance.now();
      if (lastStartAt && now - lastStartAt < 1200) {
        this.flag('bắt đầu lượt giải quá dồn dập');
      }
      lastStartAt = now;
    },

    recordSolve(sec) {
      solveTimes.push(sec);
      if (solveTimes.length > 5) solveTimes.shift();
      if (solveTimes.length >= 4) {
        const last4 = solveTimes.slice(-4);
        if (last4.every((t) => t === last4[0])) {
          this.flag('4 lượt liên tiếp có thời gian giống hệt nhau');
        }
      }
    }
  };
}

// 5. Kiểm tra tính hợp lệ của một lượt giải trước khi ghi vào Bảng Kỷ Lục
export function evaluateSolveIntegrity({ sec, puzzle, startedScrambled, automation, behavior }) {
  if (automation && automation.length > 0) {
    return { ok: false, reason: `phát hiện trình duyệt tự động: ${automation[0]}` };
  }
  if (!startedScrambled) {
    return { ok: false, reason: 'camera không thấy khối được xáo trộn lúc bắt đầu' };
  }
  const minSec = MIN_HUMAN_SOLVE_SEC[puzzle] ?? 1;
  if (sec < minSec) {
    return { ok: false, reason: `thời gian ${sec}s thấp hơn mức tối thiểu hợp lý (${minSec}s)` };
  }
  if (behavior && behavior.suspicious) {
    return { ok: false, reason: behavior.reason || 'hành vi đáng ngờ' };
  }
  return { ok: true, reason: '' };
}
