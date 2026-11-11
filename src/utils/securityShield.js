// ============================================================================
// WEB APPLICATION FIREWALL (WAF), RATE LIMITER & ANTI-CRASH SHIELD
// Bảo vệ trang web khỏi:
//   1. Nguồn độc / XSS / Prototype Pollution / Malformed JSON
//   2. Bot spam / Flood request làm treo trình duyệt hoặc nghẽn Cloud API
//   3. Gói tin WebRTC P2P độc hại hoặc quá tải từ đối thủ trong chế độ Solo 1v1
// ============================================================================

const DANGEROUS_PATTERNS = [
  /<script\b/i,
  /<\/script>/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /\bon(error|load|click|mouseover|focus|blur)\s*=/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /\beval\s*\(/i,
  /document\.cookie/i,
  /__proto__/i,
  /constructor\s*\[/i
];

// Bộ đếm thống kê các mối đe dọa đã chặn trong phiên
const securityMetrics = {
  blockedBotRequests: 0,
  blockedMaliciousPayloads: 0,
  blockedP2PFloods: 0,
  lastBlockedReason: null,
  lastBlockedAt: null
};

// Lưu trữ cửa sổ trượt (Sliding Window) cho Rate Limiter
const rateBuckets = new Map();
const circuitBreakers = new Map();

export function recordBlockedThreat(category, reason) {
  if (category === 'bot') securityMetrics.blockedBotRequests += 1;
  else if (category === 'payload') securityMetrics.blockedMaliciousPayloads += 1;
  else if (category === 'p2p') securityMetrics.blockedP2PFloods += 1;

  securityMetrics.lastBlockedReason = reason;
  securityMetrics.lastBlockedAt = new Date().toLocaleTimeString('vi-VN');
}

export function getSecurityStats() {
  return {
    ...securityMetrics,
    totalBlocked:
      securityMetrics.blockedBotRequests +
      securityMetrics.blockedMaliciousPayloads +
      securityMetrics.blockedP2PFloods
  };
}

/**
 * Kiểm tra xem chuỗi đầu vào có chứa mã độc (XSS, Script Injection, Prototype Pollution) không
 */
export function hasMaliciousPayload(raw) {
  if (typeof raw !== 'string') return false;
  if (raw.length > 5000) return true;
  for (const regex of DANGEROUS_PATTERNS) {
    if (regex.test(raw)) return true;
  }
  return false;
}

/**
 * Làm sạch chuỗi văn bản (tên người chơi, tên bảng đấu, thông điệp P2P...)
 * Loại bỏ hoàn toàn thẻ HTML, ký tự điều khiển và giới hạn độ dài an toàn.
 */
export function sanitizeText(input, maxLen = 45, fallback = '') {
  if (typeof input !== 'string') return fallback;

  if (hasMaliciousPayload(input)) {
    recordBlockedThreat('payload', 'Phát hiện và loại bỏ chuỗi nghi vấn XSS/Injection');
  }

  const cleaned = input
    // Xóa null byte và ký tự điều khiển ẩn
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, '')
    // Loại bỏ thẻ HTML và dấu ngoặc nhọn nguy hiểm
    .replace(/[<>`]/g, '')
    // Chặn chuỗi javascript: hoặc on*=
    .replace(/javascript:/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .trim();

  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen);
}

/**
 * Làm sạch địa chỉ Email
 */
export function sanitizeEmail(input, fallback = 'guest@cuber.vn') {
  const clean = sanitizeText(input, 80, fallback).toLowerCase();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  return emailRegex.test(clean) ? clean : fallback;
}

/**
 * Bộ giới hạn tần suất (Sliding Window Rate Limiter + Circuit Breaker)
 * Chặn bot hoặc script gọi hàm liên tục làm treo web / sập API.
 */
export function checkRateLimit(actionKey, { maxHits = 10, windowMs = 10000, cooldownMs = 15000 } = {}) {
  const now = performance.now();

  // Kiểm tra xem Circuit Breaker có đang khóa tạm thời hành động này không
  const lockedUntil = circuitBreakers.get(actionKey) || 0;
  if (now < lockedUntil) {
    const remainSec = Math.ceil((lockedUntil - now) / 1000);
    return {
      allowed: false,
      retryAfterSec: remainSec,
      reason: `Tường lửa chống quá tải: Vui lòng đợi ${remainSec}s trước khi thao tác tiếp.`
    };
  }

  const history = rateBuckets.get(actionKey) || [];
  const recent = history.filter(ts => now - ts < windowMs);

  if (recent.length >= maxHits) {
    circuitBreakers.set(actionKey, now + cooldownMs);
    rateBuckets.set(actionKey, []);
    recordBlockedThreat('bot', `Chặn tần suất bất thường (${actionKey})`);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(cooldownMs / 1000),
      reason: `Phát hiện thao tác quá nhanh (nghi vấn spam/bot). Tạm khóa ${Math.ceil(cooldownMs / 1000)}s để bảo vệ hệ thống.`
    };
  }

  recent.push(now);
  rateBuckets.set(actionKey, recent);
  return { allowed: true, retryAfterSec: 0, reason: null };
}

/**
 * Đọc JSON an toàn chống Prototype Pollution & chống sập ứng dụng khi localStorage bị hỏng
 */
export function safeJsonParse(rawString, fallbackValue = null) {
  if (!rawString || typeof rawString !== 'string') return fallbackValue;
  if (rawString.length > 500_000) {
    recordBlockedThreat('payload', 'Chặn dữ liệu JSON quá lớn trong bộ nhớ');
    return fallbackValue;
  }
  try {
    return JSON.parse(rawString, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        recordBlockedThreat('payload', 'Chặn tấn công Prototype Pollution');
        return undefined;
      }
      return value;
    });
  } catch {
    return fallbackValue;
  }
}

const ALLOWED_P2P_TYPES = new Set([
  'HANDSHAKE',
  'HANDSHAKE_ACK',
  'CAMERA_UPDATE',
  'NEW_ROUND',
  'TIMER_STATE',
  'TIMER_TICK',
  'SOLVE_DONE',
  'REACTION'
]);

const ALLOWED_TIMER_STATES = new Set(['idle', 'holding', 'ready', 'running', 'done']);

/**
 * Tường lửa kiểm duyệt gói tin WebRTC P2P (Solo 1v1)
 * Chặn đối thủ gửi gói tin độc hại, quá kích thước hoặc flood gói tin làm đơ trình duyệt.
 */
export function validateP2PPacket(data) {
  // 1. Kiểm tra tần suất gói tin P2P (tối đa 40 gói / 2 giây)
  const rate = checkRateLimit('webrtc_p2p_incoming', {
    maxHits: 40,
    windowMs: 2000,
    cooldownMs: 5000
  });
  if (!rate.allowed) {
    recordBlockedThreat('p2p', 'Chặn đợt flood gói tin WebRTC P2P');
    return { valid: false, reason: rate.reason };
  }

  // 2. Kiểm tra cấu trúc cơ bản
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    recordBlockedThreat('p2p', 'Gói tin P2P sai định dạng object');
    return { valid: false, reason: 'Invalid packet format' };
  }

  if (!ALLOWED_P2P_TYPES.has(data.type)) {
    recordBlockedThreat('p2p', `Loại gói tin P2P lạ bị từ chối: ${String(data.type).slice(0, 20)}`);
    return { valid: false, reason: 'Disallowed packet type' };
  }

  // 3. Giới hạn kích thước gói tin (< 2KB)
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > 2048) {
      recordBlockedThreat('p2p', 'Chặn gói tin P2P vượt quá 2KB');
      return { valid: false, reason: 'Packet too large' };
    }
  } catch {
    return { valid: false, reason: 'Unserializable packet' };
  }

  // 4. Làm sạch các trường dữ liệu bên trong gói tin P2P
  const sanitized = {
    type: data.type
  };

  if (data.name !== undefined) {
    sanitized.name = sanitizeText(String(data.name), 32, 'Đối thủ');
  }
  if (data.cameraActive !== undefined) {
    sanitized.cameraActive = Boolean(data.cameraActive);
  }
  if (data.isHealthy !== undefined) {
    sanitized.isHealthy = Boolean(data.isHealthy);
  }
  if (data.scramble !== undefined) {
    sanitized.scramble = sanitizeText(String(data.scramble), 260, 'R U R\' U\'');
  }
  if (data.roundNumber !== undefined) {
    const rn = Number(data.roundNumber);
    sanitized.roundNumber = Number.isFinite(rn) && rn >= 1 && rn <= 999 ? Math.floor(rn) : 1;
  }
  if (data.state !== undefined) {
    sanitized.state = ALLOWED_TIMER_STATES.has(data.state) ? data.state : 'idle';
  }
  if (data.timeMs !== undefined) {
    const t = Number(data.timeMs);
    sanitized.timeMs = Number.isFinite(t) && t >= 0 && t <= 3600000 ? t : 0;
  }
  if (data.emoji !== undefined) {
    sanitized.emoji = sanitizeText(String(data.emoji), 8, '👍');
  }
  if (data.sender !== undefined) {
    sanitized.sender = sanitizeText(String(data.sender), 32, 'Đối thủ');
  }
  if (data.text !== undefined) {
    sanitized.text = sanitizeText(String(data.text), 60, '');
  }

  return { valid: true, packet: sanitized };
}
