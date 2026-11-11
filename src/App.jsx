import React, { useState, useEffect, useRef, useCallback } from 'react';
import Rubik3DView from './components/Rubik3DView';
import Solo1v1Arena from './components/Solo1v1Arena';
import HumanCheckModal from './components/HumanCheckModal';
import {
  detectAutomation,
  isHumanSessionValid,
  grantHumanSession,
  revokeHumanSession,
  isTrustedInput,
  createBehaviorTracker,
  evaluateSolveIntegrity
} from './utils/antiBot';
import {
  getCloudConfig,
  saveCloudConfig,
  isCloudConfigured,
  fetchCloudLeaderboard,
  submitVerifiedSolveToCloud,
  deleteCloudEntryAdmin,
  clearCloudBoardAdmin,
  testCloudConnection,
  SUPABASE_SCHEMA_SQL
} from './utils/cloudBackend';
import {
  sanitizeText,
  sanitizeEmail,
  checkRateLimit,
  hasMaliciousPayload,
  getSecurityStats
} from './utils/securityShield';

// ==========================================
// 1. WCA SCRAMBLE GENERATOR (2x2, 3x3, 4x4, 5x5)
// ==========================================
const ADMIN_EMAIL = 'khoa.tt2611758@sis.hust.edu.vn';

const PUZZLE_CONFIGS = {
  '2x2': { id: '2x2', name: '2×2×2', label: '2×2 Pocket Cube', dim: 2, defaultMoves: 9 },
  '3x3': { id: '3x3', name: '3×3×3', label: '3×3 Rubik Cube', dim: 3, defaultMoves: 20 },
  '4x4': { id: '4x4', name: '4×4×4', label: "4×4 Rubik's Revenge", dim: 4, defaultMoves: 40 },
  '5x5': { id: '5x5', name: '5×5×5', label: "5×5 Professor's Cube", dim: 5, defaultMoves: 60 }
};

const GAME_MODES = [
  { id: 'free', name: '🎯 Tự do', desc: 'Bấm Space là chạy ngay, luyện tập không giới hạn' },
  { id: 'wca', name: '🏆 WCA 15s', desc: '15 giây quan sát (Inspection) chuẩn thi đấu quốc tế' },
  { id: 'target', name: '⚡ Mục tiêu Sub-X', desc: 'Thử thách phá vỡ mốc thời gian mục tiêu' },
  { id: 'ai', name: '🤖 Trọng tài AI', desc: 'Kiểm tra Rubik qua camera & tự động xác nhận giải xong' },
  { id: 'solo', name: '⚔️ Solo 1v1', desc: 'Đấu thời gian thực 1v1 qua mạng P2P WebRTC với bạn bè' }
];

function generateScramble(puzzleType = '3x3') {
  const modifiers = ['', "'", '2'];

  if (puzzleType === '2x2') {
    const faces = ['U', 'R', 'F'];
    const scramble = [];
    let lastFace = -1;
    for (let i = 0; i < 9; i++) {
      let faceIndex;
      do {
        faceIndex = Math.floor(Math.random() * faces.length);
      } while (faceIndex === lastFace);
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${faces[faceIndex]}${mod}`);
      lastFace = faceIndex;
    }
    return scramble.join(' ');
  }

  if (puzzleType === '4x4') {
    const outerFaces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const wideFaces = ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
    const allMoves = [...outerFaces, ...wideFaces];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 40; i++) {
      let move;
      do {
        move = allMoves[Math.floor(Math.random() * allMoves.length)];
      } while (move === lastMove || (move[0] === lastMove[0] && move.length === lastMove.length));
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${move}${mod}`);
      lastMove = move;
    }
    return scramble.join(' ');
  }

  if (puzzleType === '5x5') {
    const moves = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 60; i++) {
      let move;
      do {
        move = moves[Math.floor(Math.random() * moves.length)];
      } while (move === lastMove || (move[0] === lastMove[0] && move.length === lastMove.length));
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${move}${mod}`);
      lastMove = move;
    }
    return scramble.join(' ');
  }

  // Standard 3x3x3 WCA Scramble
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const getAxis = (f) => Math.floor(f / 2);
  const scramble = [];
  let lastFace = -1;
  let secondLastFace = -1;

  for (let i = 0; i < 20; i++) {
    let faceIndex;
    do {
      faceIndex = Math.floor(Math.random() * faces.length);
    } while (
      faceIndex === lastFace ||
      (lastFace !== -1 &&
        secondLastFace !== -1 &&
        getAxis(faceIndex) === getAxis(lastFace) &&
        faceIndex === secondLastFace)
    );

    const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
    scramble.push(`${faces[faceIndex]}${modifier}`);
    secondLastFace = lastFace;
    lastFace = faceIndex;
  }

  return scramble.join(' ');
}

// Color mapping for Rubik stickers
const COLOR_DEFINITIONS = {
  white:  { code: 'U', name: 'Trắng', hex: '#f8fafc', bg: '#f8fafc', textColor: '#0f172a' },
  yellow: { code: 'D', name: 'Vàng', hex: '#eab308', bg: '#eab308', textColor: '#0f172a' },
  red:    { code: 'R', name: 'Đỏ', hex: '#ef4444', bg: '#ef4444', textColor: '#ffffff' },
  orange: { code: 'L', name: 'Cam', hex: '#f97316', bg: '#f97316', textColor: '#ffffff' },
  green:  { code: 'F', name: 'Xanh lá', hex: '#22c55e', bg: '#22c55e', textColor: '#ffffff' },
  blue:   { code: 'B', name: 'Xanh dương', hex: '#3b82f6', bg: '#3b82f6', textColor: '#ffffff' },
  invalid:{ code: '?', name: 'Không rõ', hex: '#334155', bg: '#334155', textColor: '#94a3b8' }
};

// RGB to HSV Conversion
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0, v = max;

  if (delta !== 0) {
    s = delta / max;
    switch (max) {
      case r: h = 60 * (((g - b) / delta) % 6); break;
      case g: h = 60 * (((b - r) / delta) + 2); break;
      case b: h = 60 * (((r - g) / delta) + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, v };
}

// Phân loại màu Sticker Rubik chuẩn WCA + Lọc chống nhận nhầm da người / tường / đồ vật thường
// Hỗ trợ motionTolerance (khi khối đang di chuyển trên tay) nhưng vẫn khóa chặt da người & tường
function classifyRubikStickerCell(avgR, avgG, avgB, cellStdDev, motionTolerance = 0) {
  const rawBrightness = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  const { h, s, v } = rgbToHsv(avgR, avgG, avgB);
  const maxAllowedStd = 25 + motionTolerance;

  // 1. Loại bỏ vùng tối hoặc vùng có bề mặt gồ ghề/nhiều chi tiết (mặt người, tóc, quần áo, đồ vật)
  if (rawBrightness < 42 || v < 0.24 || cellStdDev > maxAllowedStd) return 'invalid';

  // 2. Bộ lọc CHỐNG NHẬN NHẦM DA NGƯỜI, GỖ, TƯỜNG VÀNG NHẠT (Anti-Skin & Anti-Background Filter)
  const isSkinOrWarmAmbient =
    avgR > avgG &&
    avgG > avgB &&
    h >= 4 &&
    h < 42 &&
    (s < 0.64 || (avgR - avgG < 65 && avgG - avgB > 6 && v < 0.88));
  if (isSkinOrWarmAmbient) return 'invalid';

  // 3. Nhận diện màu Trắng (White Sticker): phải sáng rõ, phẳng và trung tính
  const rgbSpread = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
  if (
    s <= 0.14 &&
    v >= 0.72 &&
    rawBrightness >= 170 &&
    rgbSpread <= 28 &&
    cellStdDev <= 16 + motionTolerance * 0.5
  ) {
    return 'white';
  }

  // 4. Nhận diện 5 màu sắc rực chuẩn WCA (Đỏ, Cam, Vàng, Xanh lá, Xanh dương)
  if (
    (h >= 346 || h < 10) &&
    s >= 0.58 &&
    v >= 0.38 &&
    avgR > avgG * 1.68 &&
    avgR > avgB * 1.68
  ) {
    return 'red';
  }
  if (
    h >= 11 &&
    h < 35 &&
    s >= 0.63 &&
    v >= 0.58 &&
    avgR > avgB * 2.05 &&
    avgG > avgB * 1.22
  ) {
    return 'orange';
  }
  if (
    h >= 40 &&
    h < 72 &&
    s >= 0.48 &&
    v >= 0.58 &&
    avgR > avgB * 1.55 &&
    avgG > avgB * 1.55
  ) {
    return 'yellow';
  }
  if (
    h >= 82 &&
    h < 160 &&
    s >= 0.46 &&
    v >= 0.34 &&
    avgG > avgR * 1.20 &&
    avgG > avgB * 1.14
  ) {
    return 'green';
  }
  if (
    h >= 188 &&
    h < 255 &&
    s >= 0.48 &&
    v >= 0.34 &&
    avgB > avgR * 1.30 &&
    avgB > avgG * 1.10
  ) {
    return 'blue';
  }

  return 'invalid';
}

// Đánh giá một vùng lưới ứng viên (startX, startY, boxSize) trên khung hình Camera
function evaluateRubikGridCandidate(frameImg, w, h, dim, startX, startY, boxSize, motionTolerance = 0) {
  const cellSize = boxSize / dim;
  const sampleRadius = Math.max(2, Math.floor(cellSize * 0.16));
  const currentNxNColors = [];
  const cellStats = [];
  let validColorsCount = 0;
  let vividColorsCount = 0;
  let centerLumSum = 0;

  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const cx = Math.floor(startX + col * cellSize + cellSize / 2);
      const cy = Math.floor(startY + row * cellSize + cellSize / 2);

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const rSamples = [];
      const gSamples = [];
      const bSamples = [];

      for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) {
        for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const idx = (py * w + px) * 4;
            const r = frameImg[idx];
            const g = frameImg[idx + 1];
            const b = frameImg[idx + 2];
            rSum += r;
            gSum += g;
            bSum += b;
            rSamples.push(r);
            gSamples.push(g);
            bSamples.push(b);
            count++;
          }
        }
      }

      if (count > 0) {
        const avgR = rSum / count;
        const avgG = gSum / count;
        const avgB = bSum / count;

        let varSum = 0;
        for (let k = 0; k < count; k++) {
          const dr = rSamples[k] - avgR;
          const dg = gSamples[k] - avgG;
          const db = bSamples[k] - avgB;
          varSum += (dr * dr + dg * dg + db * db) / 3;
        }
        const cellStdDev = Math.sqrt(varSum / count);
        const colorKey = classifyRubikStickerCell(avgR, avgG, avgB, cellStdDev, motionTolerance);
        const cellLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
        centerLumSum += cellLum;

        currentNxNColors.push(colorKey);
        cellStats.push({ avgR, avgG, avgB, cellStdDev, colorKey, cellLum });
        if (colorKey !== 'invalid') {
          validColorsCount++;
          if (colorKey !== 'white') vividColorsCount++;
        }
      } else {
        currentNxNColors.push('invalid');
        cellStats.push({ avgR: 0, avgG: 0, avgB: 0, cellStdDev: 999, colorKey: 'invalid', cellLum: 0 });
      }
    }
  }

  let sharpAdjacentEdges = 0;
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      const idxA = r * dim + c;
      const cellA = cellStats[idxA];
      if (!cellA || cellA.colorKey === 'invalid') continue;

      const neighbors = [];
      if (c + 1 < dim) neighbors.push(r * dim + (c + 1));
      if (r + 1 < dim) neighbors.push((r + 1) * dim + c);

      for (const idxB of neighbors) {
        const cellB = cellStats[idxB];
        if (!cellB || cellB.colorKey === 'invalid') continue;
        if (cellA.colorKey !== cellB.colorKey) {
          const rgbDist = Math.hypot(
            cellA.avgR - cellB.avgR,
            cellA.avgG - cellB.avgG,
            cellA.avgB - cellB.avgB
          );
          if (rgbDist >= 62) sharpAdjacentEdges++;
        }
      }
    }
  }

  let seamDiffSum = 0;
  let seamSamples = 0;
  const avgCenterLum = centerLumSum / (dim * dim);
  for (let k = 1; k < dim; k++) {
    const seamX = Math.floor(startX + k * cellSize);
    const seamY = Math.floor(startY + k * cellSize);
    for (let t = 0.15; t <= 0.85; t += 0.35) {
      const py = Math.floor(startY + t * boxSize);
      const px = Math.floor(startX + t * boxSize);
      if (seamX >= 0 && seamX < w && py >= 0 && py < h) {
        const idx1 = (py * w + seamX) * 4;
        const lum1 = 0.299 * frameImg[idx1] + 0.587 * frameImg[idx1 + 1] + 0.114 * frameImg[idx1 + 2];
        seamDiffSum += Math.abs(avgCenterLum - lum1);
        seamSamples++;
      }
      if (px >= 0 && px < w && seamY >= 0 && seamY < h) {
        const idx2 = (seamY * w + px) * 4;
        const lum2 = 0.299 * frameImg[idx2] + 0.587 * frameImg[idx2 + 1] + 0.114 * frameImg[idx2 + 2];
        seamDiffSum += Math.abs(avgCenterLum - lum2);
        seamSamples++;
      }
    }
  }
  const gridSeamContrast = seamSamples > 0 ? seamDiffSum / seamSamples : 0;
  const validOnly = currentNxNColors.filter((c) => c !== 'invalid');
  const uniqueColorsCount = new Set(validOnly).size;

  // Điểm cấu trúc khối Rubik để chọn vùng bám đuổi tốt nhất khi khối di chuyển
  const score =
    validColorsCount * 4 +
    vividColorsCount * 3.5 +
    sharpAdjacentEdges * 6 +
    uniqueColorsCount * 5 +
    (gridSeamContrast >= 8 ? 6 : 0);

  return {
    startX,
    startY,
    boxSize,
    currentNxNColors,
    validColorsCount,
    vividColorsCount,
    uniqueColorsCount,
    sharpAdjacentEdges,
    gridSeamContrast,
    score
  };
}

// Bộ định vị & bám đuổi khối Rubik động (Dynamic Multi-Scale Object Tracker) trên toàn khung hình
function locateDynamicRubikBox(frameImg, w, h, dim, prevTracker) {
  const minSide = Math.min(w, h);
  const baseSize = minSide * 0.52;

  // 1. Quét nhanh Heatmap các điểm màu sticker Rubik rực rỡ trên toàn khung hình (15 x 11 điểm)
  let weightSum = 0;
  let wxSum = 0;
  let wySum = 0;
  let minHitX = w, maxHitX = 0, minHitY = h, maxHitY = 0;
  let vividHits = 0;

  const cols = 15;
  const rows = 11;
  for (let r = 1; r < rows - 1; r++) {
    const py = Math.floor((r / (rows - 1)) * h);
    for (let c = 1; c < cols - 1; c++) {
      const px = Math.floor((c / (cols - 1)) * w);
      const idx = (py * w + px) * 4;
      const idxR = (py * w + Math.min(w - 1, px + 3)) * 4;
      const idxD = (Math.min(h - 1, py + 3) * w + px) * 4;

      const avgR = (frameImg[idx] + frameImg[idxR] + frameImg[idxD]) / 3;
      const avgG = (frameImg[idx + 1] + frameImg[idxR + 1] + frameImg[idxD + 1]) / 3;
      const avgB = (frameImg[idx + 2] + frameImg[idxR + 2] + frameImg[idxD + 2]) / 3;
      const localDiff =
        (Math.abs(frameImg[idx] - frameImg[idxR]) +
          Math.abs(frameImg[idx + 1] - frameImg[idxR + 1]) +
          Math.abs(frameImg[idx + 2] - frameImg[idxR + 2])) /
        3;

      const cKey = classifyRubikStickerCell(avgR, avgG, avgB, localDiff, 4);
      if (cKey !== 'invalid' && cKey !== 'white') {
        const wt = 3.0;
        weightSum += wt;
        wxSum += px * wt;
        wySum += py * wt;
        vividHits++;
        if (px < minHitX) minHitX = px;
        if (px > maxHitX) maxHitX = px;
        if (py < minHitY) minHitY = py;
        if (py > maxHitY) maxHitY = py;
      }
    }
  }

  const candidates = [];
  const pushCandidate = (cx, cy, size, motionTol = 0) => {
    const clampedSize = Math.max(minSide * 0.36, Math.min(minSide * 0.68, size));
    const sx = Math.max(4, Math.min(w - clampedSize - 4, cx - clampedSize / 2));
    const sy = Math.max(4, Math.min(h - clampedSize - 4, cy - clampedSize / 2));
    candidates.push({ sx, sy, size: clampedSize, motionTol });
  };

  // Ứng viên 1: Vị trí trung tâm mặc định
  pushCandidate(w / 2, h / 2, baseSize, 0);

  // Ứng viên 2: Vị trí vừa khóa ở khung hình trước + dự đoán vận tốc di chuyển (Kalman/EMA Velocity)
  if (prevTracker && prevTracker.cx > 0) {
    const predCx = prevTracker.cx + (prevTracker.vx || 0) * 0.85;
    const predCy = prevTracker.cy + (prevTracker.vy || 0) * 0.85;
    pushCandidate(predCx, predCy, prevTracker.size || baseSize, 3);
    pushCandidate(prevTracker.cx, prevTracker.cy, prevTracker.size || baseSize, 2);
  }

  // Ứng viên 3: Tâm cụm màu Sticker (Heatmap Centroid) khi người chơi đưa khối Rubik sang trái/phải/trên/dưới/xa/gần
  if (vividHits >= 2 && weightSum > 0) {
    const heatCx = wxSum / weightSum;
    const heatCy = wySum / weightSum;
    const span = Math.max(maxHitX - minHitX, maxHitY - minHitY);
    const adaptiveSize = span > minSide * 0.18 ? span * 1.32 : baseSize;
    pushCandidate(heatCx, heatCy, adaptiveSize, 3);
    pushCandidate(heatCx, heatCy, baseSize, 3);
    pushCandidate(heatCx, heatCy, minSide * 0.42, 3);
  }

  // Ứng viên 4..9: Lưới tìm kiếm đa vị trí quanh khung hình để bắt nhanh khi vung tay di chuyển
  const shiftX = w * 0.15;
  const shiftY = h * 0.14;
  pushCandidate(w / 2 - shiftX, h / 2, baseSize * 0.92, 2);
  pushCandidate(w / 2 + shiftX, h / 2, baseSize * 0.92, 2);
  pushCandidate(w / 2, h / 2 - shiftY, baseSize * 0.92, 2);
  pushCandidate(w / 2, h / 2 + shiftY, baseSize * 0.92, 2);
  pushCandidate(w / 2, h / 2, minSide * 0.42, 2);

  let bestEval = null;
  for (const cand of candidates) {
    const res = evaluateRubikGridCandidate(
      frameImg,
      w,
      h,
      dim,
      cand.sx,
      cand.sy,
      cand.size,
      cand.motionTol
    );
    if (!bestEval || res.score > bestEval.score) {
      bestEval = res;
    }
  }

  return bestEval;
}

// Accurate WCA Average of N
function calculateAo(solvesList, count) {
  if (!solvesList || solvesList.length < count) return '--';
  const times = solvesList.slice(0, count).map(s => s.time);
  const min = Math.min(...times);
  const max = Math.max(...times);
  let removedMin = false;
  let removedMax = false;
  const trimmed = [];
  for (const t of times) {
    if (!removedMin && t === min) {
      removedMin = true;
      continue;
    }
    if (!removedMax && t === max) {
      removedMax = true;
      continue;
    }
    trimmed.push(t);
  }
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return (sum / trimmed.length).toFixed(2);
}

export default function App() {
  // ==========================================
  // 1. AUTHENTICATION & PRIVATE ADMIN ROLE
  // ==========================================
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      if (localStorage.getItem('rubik_auth_user_v4_clean') !== 'true') {
        localStorage.removeItem('rubik_auth_user');
        localStorage.setItem('rubik_auth_user_v4_clean', 'true');
        return { name: 'Khách', email: 'guest@cuber.vn' };
      }
      const saved = localStorage.getItem('rubik_auth_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { name: 'Khách', email: 'guest@cuber.vn' };
  });

  // Kiểm tra xem tài khoản hiện tại có phải là Gmail của Khoa không
  const isKhoaAdmin = currentUser.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [adminSettings, setAdminSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_admin_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      competitionTitle: 'Rubik Timer & AI Verification',
      subTitle: 'HUST Speedcubing • 2×2, 3×3, 4×4, 5×5',
      spaceHoldMs: 280
    };
  });

  // ==========================================
  // MOBILE RESPONSIVENESS & TOUCHPAD CONTROLS (TỐI ƯU ANDROID & iOS)
  // ==========================================
  const detectMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    if (window.innerWidth <= 920) return true;
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    return Boolean((isCoarse || isMobileUA) && window.innerWidth <= 1280);
  };

  const [isMobile, setIsMobile] = useState(detectMobileDevice);
  const [mobileTab, setMobileTab] = useState('timer'); // 'timer' | 'stats' | 'leaderboard' | '3d'
  const [cameraFacingMode, setCameraFacingMode] = useState('user'); // 'user' | 'environment'
  const touchHoldTimerRef = useRef(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(detectMobileDevice());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Web Audio sound synthesizer for responsive feedback
  const playAppSound = useCallback((type) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'ready') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'start') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'stop') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch {}
  }, []);

  // Cổng chống bot thông minh (Zero-Friction cho người chơi thật, chặn tự động với Bot/Macro/Spam)
  const requireHuman = useCallback(() => {
    const rate = checkRateLimit('timer_start_action', {
      maxHits: 18,
      windowMs: 15000,
      cooldownMs: 12000
    });
    if (!rate.allowed) {
      setLastNotice({ type: 'warning', text: `🛡️ ${rate.reason}` });
      return true;
    }

    // Nếu phát hiện trình duyệt tự động hoặc hành vi macro đáng ngờ -> bật hộp thoại xác minh
    const autoFlags = detectAutomation();
    if (autoFlags.length > 0 || behaviorRef.current.suspicious) {
      if (!isHumanSessionValid() || behaviorRef.current.suspicious) {
        setShowHumanCheck(true);
        return true;
      }
    }

    // Người chơi thật dùng phím/cảm ứng phần cứng (isTrusted) -> tự động cấp phiên 24h không làm gián đoạn
    if (!isHumanSessionValid()) {
      grantHumanSession('trusted-hardware');
    }
    return false;
  }, []);
  const requireHumanRef = useRef(requireHuman);
  useEffect(() => { requireHumanRef.current = requireHuman; }, [requireHuman]);

  const handleHumanVerified = () => {
    grantHumanSession();
    behaviorRef.current.reset();
    setShowHumanCheck(false);
  };

  // Mobile pointer/touch events for StackMat touch timer (hỗ trợ cuộn trang mượt trên Android/iOS)
  const handleTimerPointerDown = useCallback((e) => {
    if (
      e.target.tagName === 'BUTTON' ||
      e.target.closest('button') ||
      e.target.tagName === 'CANVAS' ||
      e.target.closest('.rubik-3d-interactive')
    ) {
      return;
    }
    if (!isTrustedInput(e)) return; // chặn sự kiện giả lập từ script

    pointerStartPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };

    const curState = timerStateRef.current;
    const curMode = gameModeRef.current;
    if (curMode === 'solo') return;

    if (curState === 'idle' && requireHumanRef.current()) return;
    holdStartTsRef.current = performance.now();

    if (curState === 'running') {
      stopTimerRef.current();
      playAppSound('stop');
      return;
    }

    if (curState === 'inspecting') {
      setTimerState('holding');
      touchHoldTimerRef.current = setTimeout(() => {
        setTimerState('ready');
        playAppSound('ready');
      }, adminSettingsRef.current?.spaceHoldMs || 280);
      return;
    }

    if (curState === 'idle') {
      if (curMode === 'wca') {
        startInspectionRef.current();
      } else {
        setTimerState('holding');
        touchHoldTimerRef.current = setTimeout(() => {
          setTimerState('ready');
          playAppSound('ready');
        }, adminSettingsRef.current?.spaceHoldMs || 280);
      }
    }
  }, [playAppSound]);

  // Nếu người dùng vuốt ngón tay để cuộn trang (> 12px) khi đang chạm, hủy trạng thái holding để cuộn mượt
  const handleTimerPointerMove = useCallback((e) => {
    if (timerStateRef.current !== 'holding') return;
    const dx = Math.abs((e.clientX || 0) - pointerStartPosRef.current.x);
    const dy = Math.abs((e.clientY || 0) - pointerStartPosRef.current.y);
    if (dx > 12 || dy > 12) {
      if (touchHoldTimerRef.current) {
        clearTimeout(touchHoldTimerRef.current);
        touchHoldTimerRef.current = null;
      }
      holdStartTsRef.current = 0;
      setTimerState(gameModeRef.current === 'wca' ? 'inspecting' : 'idle');
    }
  }, []);

  const handleTimerPointerUp = useCallback((e) => {
    if (
      e.target.tagName === 'BUTTON' ||
      e.target.closest('button') ||
      e.target.tagName === 'CANVAS' ||
      e.target.closest('.rubik-3d-interactive')
    ) {
      return;
    }
    if (!isTrustedInput(e)) return;
    if (holdStartTsRef.current) {
      behaviorRef.current.recordHold(performance.now() - holdStartTsRef.current);
      holdStartTsRef.current = 0;
    }
    if (touchHoldTimerRef.current) {
      clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }

    const curState = timerStateRef.current;
    if (curState === 'ready') {
      startTimerRef.current();
      playAppSound('start');
    } else if (curState === 'holding') {
      if (gameModeRef.current === 'wca') {
        setTimerState('inspecting');
      } else {
        setTimerState('idle');
      }
    }
  }, [playAppSound]);

  // Flip Camera between Front (user) and Back (environment)
  const flipCamera = async () => {
    const nextMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextMode);
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      try {
        setPreCheckStatus(prev => ({ ...prev, text: 'Đang chuyển camera...' }));
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: nextMode }
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPreCheckStatus(prev => ({ ...prev, text: 'Đã đổi camera thành công!' }));
      } catch (err) {
        console.error('Lỗi đổi camera:', err);
      }
    }
  };

  // Modal Login thông thường (hoàn toàn ẩn mục Admin)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [inputUserName, setInputUserName] = useState('');
  const [inputUserEmail, setInputUserEmail] = useState('');

  // Admin Control Panel Modal (Chỉ Khoa mới mở được khi CÓ CAM)
  const [showAdminPanelModal, setShowAdminPanelModal] = useState(false);
  const [editCompTitle, setEditCompTitle] = useState(adminSettings.competitionTitle);
  const [editCompSub, setEditCompSub] = useState(adminSettings.subTitle);
  const [editSpaceHoldMs, setEditSpaceHoldMs] = useState(adminSettings.spaceHoldMs);

  // Cấu hình Supabase Cloud Backend (Bảng Kỷ Lục Toàn Cầu + Anti-Cheat Server)
  const [cloudUrlInput, setCloudUrlInput] = useState(() => getCloudConfig().url);
  const [cloudKeyInput, setCloudKeyInput] = useState(() => getCloudConfig().anonKey);
  const [cloudStatus, setCloudStatus] = useState(() => isCloudConfigured() ? 'connected' : 'unconfigured');
  const [cloudTestNotice, setCloudTestNotice] = useState(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Thông báo nhận diện kỷ lục AI thời gian thực (Toast Banner)
  const [lastNotice, setLastNotice] = useState(null);

  // Tự động ẩn thông báo sau 6 giây
  useEffect(() => {
    if (lastNotice) {
      const timer = setTimeout(() => setLastNotice(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [lastNotice]);

  // Xóa sạch dữ liệu mẫu/cheat cũ nếu người dùng đã lưu trong trình duyệt
  useEffect(() => {
    const cleanFlag = localStorage.getItem('rubik_clean_anti_cheat_v4');
    if (!cleanFlag) {
      localStorage.removeItem('rubik_multi_leaderboards_v2');
      localStorage.removeItem('rubik_multi_leaderboards_v3');
      localStorage.removeItem('rubik_multi_leaderboards_v4');
      localStorage.removeItem('rubik_multi_leaderboards_v5');
      localStorage.removeItem('rubik_solves_hcc');
      localStorage.removeItem('rubik_auth_user'); // Trả về khách mặc định, không tự gán email Khoa
      localStorage.setItem('rubik_clean_anti_cheat_v4', 'true');
    }
  }, []);

  // Dashboard modal
  const [showDashboardModal, setShowDashboardModal] = useState(false);

  // ==========================================
  // 2. PUZZLE & GAME MODE STATE
  // ==========================================
  const [puzzleType, setPuzzleType] = useState(() => {
    return localStorage.getItem('rubik_puzzle_type') || '3x3';
  });

  const [gameMode, setGameMode] = useState(() => {
    return localStorage.getItem('rubik_game_mode') || 'free';
  });

  const [targetSeconds, setTargetSeconds] = useState(15);
  const [lastTargetResult, setLastTargetResult] = useState(null);

  const [inspectionSeconds, setInspectionSeconds] = useState(15);
  const [penaltyText, setPenaltyText] = useState('');

  const [timerState, setTimerState] = useState('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [scramble, setScramble] = useState(() => generateScramble(puzzleType));

  // History & Solves (Không lưu dữ liệu giả, bắt đầu hoàn toàn sạch)
  const [solves, setSolves] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_solves_hcc_clean');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const currentSolves = solves.filter(s => (s.puzzleType || '3x3') === puzzleType);

  // ==========================================
  // 3. MULTI-LEADERBOARD SYSTEM (CHỐNG GIAN LẬN - 100% TỰ ĐỘNG)
  // ==========================================
  const [leaderboards, setLeaderboards] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_multi_leaderboards_clean');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      'board_1': {
        id: 'board_1',
        title: 'Bảng Kỷ Lục AI Chính Thức',
        entries: []
      }
    };
  });

  const [activeBoardId, setActiveBoardId] = useState(() => {
    return localStorage.getItem('rubik_active_board_id') || 'board_1';
  });

  const [leaderboardFilter, setLeaderboardFilter] = useState('current');

  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardMode, setNewBoardMode] = useState('empty');

  const currentBoard = leaderboards[activeBoardId] || Object.values(leaderboards)[0];

  const saveLeaderboards = (newBoards, newActiveId = null) => {
    setLeaderboards(newBoards);
    localStorage.setItem('rubik_multi_leaderboards_clean', JSON.stringify(newBoards));
    if (newActiveId) {
      setActiveBoardId(newActiveId);
      localStorage.setItem('rubik_active_board_id', newActiveId);
    }
  };

  // Đồng bộ Bảng Kỷ Lục từ Supabase Cloud về máy
  const syncLeaderboardFromCloud = useCallback(async (targetBoardId) => {
    const bId = targetBoardId || activeBoardId;
    if (!isCloudConfigured()) {
      setCloudStatus('unconfigured');
      return;
    }
    setCloudStatus('syncing');
    const res = await fetchCloudLeaderboard(bId);
    if (!res.ok) {
      setCloudStatus('error');
      return;
    }
    setCloudStatus('connected');

    setLeaderboards(prevBoards => {
      const cur = prevBoards[bId] || { id: bId, title: 'Bảng Kỷ Lục AI Chính Thức', entries: [] };
      const mergedMap = new Map();

      // Ưu tiên dữ liệu स्थानीय + Cloud: giữ kỷ lục nhanh nhất (best thấp nhất) cho mỗi (name, puzzleType)
      for (const item of (cur.entries || [])) {
        const key = `${item.name.trim().toLowerCase()}__${item.puzzleType || '3x3'}`;
        mergedMap.set(key, item);
      }
      for (const cloudItem of (res.entries || [])) {
        const key = `${cloudItem.name.trim().toLowerCase()}__${cloudItem.puzzleType || '3x3'}`;
        const existing = mergedMap.get(key);
        if (!existing || cloudItem.best <= existing.best) {
          mergedMap.set(key, cloudItem);
        }
      }

      const mergedEntries = Array.from(mergedMap.values()).sort((a, b) => a.best - b.best);
      const updated = {
        ...prevBoards,
        [bId]: {
          ...cur,
          entries: mergedEntries
        }
      };
      localStorage.setItem('rubik_multi_leaderboards_clean', JSON.stringify(updated));
      return updated;
    });
  }, [activeBoardId]);

  useEffect(() => {
    if (isCloudConfigured()) {
      syncLeaderboardFromCloud(activeBoardId);
      const interval = setInterval(() => {
        syncLeaderboardFromCloud(activeBoardId);
      }, 25000);
      return () => clearInterval(interval);
    }
  }, [activeBoardId, syncLeaderboardFromCloud]);

  const handleTestAndSaveCloud = async () => {
    const saved = saveCloudConfig({ url: cloudUrlInput, anonKey: cloudKeyInput });
    if (!saved.url || !saved.anonKey) {
      setCloudStatus('unconfigured');
      setCloudTestNotice({ type: 'warning', text: 'Đã ngắt kết nối Cloud (chế độ Local).' });
      return;
    }
    setCloudTestNotice({ type: 'info', text: '⏳ Đang kiểm tra kết nối Supabase Cloud...' });
    const check = await testCloudConnection(saved.url, saved.anonKey);
    if (check.ok) {
      setCloudStatus('connected');
      setCloudTestNotice({ type: 'success', text: `✅ ${check.message}` });
      syncLeaderboardFromCloud(activeBoardId);
    } else {
      setCloudStatus('error');
      setCloudTestNotice({ type: 'error', text: `⚠️ ${check.reason}` });
    }
  };

  const handleCopySupabaseSql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      alert('Không thể copy tự động, bạn có thể mở file supabase/schema.sql trong dự án.');
    }
  };

  const handleSelectPuzzle = (type) => {
    setPuzzleType(type);
    localStorage.setItem('rubik_puzzle_type', type);
    setScramble(generateScramble(type));
    setTrackedMoves([]);
    setLastMoveDetected('');
  };

  const handleSelectGameMode = (mode) => {
    setGameMode(mode);
    localStorage.setItem('rubik_game_mode', mode);
    setTimerState('idle');
    setPenaltyText('');
    setLastTargetResult(null);
  };

  const handleCreateNewBoard = (e) => {
    e.preventDefault();
    if (hasMaliciousPayload(newBoardTitle)) {
      alert('🛡️ Tường lửa bảo mật đã chặn ký tự nghi vấn mã độc trong tên bảng!');
      return;
    }
    const title = sanitizeText(newBoardTitle, 40, `Bảng đấu #${Object.keys(leaderboards).length + 1}`);
    const newId = `board_${Date.now()}`;
    const newBoard = {
      id: newId,
      title: title,
      entries: newBoardMode === 'clone' && currentBoard 
        ? JSON.parse(JSON.stringify(currentBoard.entries)) 
        : []
    };
    const updated = { ...leaderboards, [newId]: newBoard };
    saveLeaderboards(updated, newId);
    setNewBoardTitle('');
    setShowNewBoardModal(false);
  };

  const handleDeleteCurrentBoard = () => {
    const boardKeys = Object.keys(leaderboards);
    if (boardKeys.length <= 1) {
      const reset = {
        'board_1': { id: 'board_1', title: 'Bảng Xếp Hạng Mới', entries: [] }
      };
      saveLeaderboards(reset, 'board_1');
      return;
    }
    if (window.confirm(`Bạn có chắc muốn xóa bảng "${currentBoard.title}"?`)) {
      const remaining = { ...leaderboards };
      delete remaining[activeBoardId];
      const nextKey = Object.keys(remaining)[0];
      saveLeaderboards(remaining, nextKey);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!currentBoard) return;
    const targetEntry = currentBoard.entries.find(e => e.id === entryId);
    const filtered = currentBoard.entries.filter(e => e.id !== entryId);
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: filtered }
    };
    saveLeaderboards(updated);

    if (targetEntry && isCloudConfigured()) {
      await deleteCloudEntryAdmin({
        boardId: activeBoardId,
        playerName: targetEntry.name,
        puzzleType: targetEntry.puzzleType || '3x3'
      });
    }
  };

  const handleToggleVerifyEntry = (entryId) => {
    if (!isKhoaAdmin || !currentBoard) return;
    const updatedEntries = currentBoard.entries.map(e => {
      if (e.id === entryId) {
        return { ...e, verified: !e.verified };
      }
      return e;
    });
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: updatedEntries }
    };
    saveLeaderboards(updated);
  };

  // Xóa sạch toàn bộ kỷ lục trong bảng hiện tại (Dành riêng cho Admin Khoa)
  const handleClearCurrentBoard = async () => {
    if (!isKhoaAdmin || !currentBoard) return;
    if (window.confirm(`Bạn có chắc muốn xóa sạch toàn bộ tên và kỷ lục trong bảng "${currentBoard.title}" không?`)) {
      const updated = {
        ...leaderboards,
        [activeBoardId]: { ...currentBoard, entries: [] }
      };
      saveLeaderboards(updated);
      if (isCloudConfigured()) {
        await clearCloudBoardAdmin(activeBoardId);
      }
      alert(`🧹 Đã xóa sạch toàn bộ dữ liệu trong "${currentBoard.title}"! Bảng đã trở về trạng thái trống.`);
    }
  };

  // Đăng nhập bình thường (hoàn toàn ẩn Admin, tích hợp lọc nguồn độc & chống brute-force)
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const rate = checkRateLimit('auth_login_attempt', {
      maxHits: 6,
      windowMs: 60000,
      cooldownMs: 20000
    });
    if (!rate.allowed) {
      alert(`🛡️ ${rate.reason}`);
      return;
    }
    if (hasMaliciousPayload(inputUserName) || hasMaliciousPayload(inputUserEmail)) {
      alert('🛡️ Tường lửa bảo mật: Phát hiện ký tự không hợp lệ hoặc mã độc trong thông tin đăng nhập!');
      return;
    }
    const name = sanitizeText(inputUserName, 36, 'Người chơi');
    const email = sanitizeEmail(inputUserEmail, `${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'}@cuber.vn`);
    const userObj = { name, email };
    setCurrentUser(userObj);
    localStorage.setItem('rubik_auth_user', JSON.stringify(userObj));
    setShowAuthModal(false);
    setInputUserName('');
    setInputUserEmail('');

    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      alert('👑 Xin chào Khoa! Hệ thống đã nhận diện tài khoản Quản Trị Viên của bạn.');
    }
  };

  const handleLogout = () => {
    const defaultUser = { name: 'Khách', email: 'guest@cuber.vn' };
    setCurrentUser(defaultUser);
    localStorage.setItem('rubik_auth_user', JSON.stringify(defaultUser));
  };

  const handleSaveAdminSettings = (e) => {
    e.preventDefault();
    const newSettings = {
      competitionTitle: sanitizeText(editCompTitle, 60, 'Rubik Timer & AI Verification'),
      subTitle: sanitizeText(editCompSub, 80, 'HUST Speedcubing'),
      spaceHoldMs: Number(editSpaceHoldMs) || 280
    };
    setAdminSettings(newSettings);
    localStorage.setItem('rubik_admin_settings', JSON.stringify(newSettings));
    setShowAdminPanelModal(false);
    alert('✅ Đã lưu cài đặt Quản trị thành công!');
  };

  // Camera & AI State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraHealth, setCameraHealth] = useState({
    isHealthy: false,
    reason: 'Camera chưa bật',
    brightness: 0,
    contrast: 0
  });

  const currentDim = PUZZLE_CONFIGS[puzzleType]?.dim || 3;
  const [detectedColors, setDetectedColors] = useState(() => Array(currentDim * currentDim).fill('invalid'));
  const [preCheckStatus, setPreCheckStatus] = useState({
    verified: false,
    text: 'Camera AI đang tắt (Chế độ thủ công chuẩn WCA)',
    isScrambled: false,
    centerFace: null
  });

  const [trackedMoves, setTrackedMoves] = useState([]);
  const [lastMoveDetected, setLastMoveDetected] = useState('');
  const [cubeVisualMode, setCubeVisualMode] = useState('3d'); // '3d' hoặc '2d'
  const [show3DPreviewModal, setShow3DPreviewModal] = useState(false);
  const [scannedFaces, setScannedFaces] = useState({});
  const [upper3DExpanded, setUpper3DExpanded] = useState(false);
  const [showUpper3DWhenCamOff, setShowUpper3DWhenCamOff] = useState(false);
  // Chế độ hiển thị 3D: mặc định 'always' để khi di chuyển khối trước Camera luôn phân tích trực tiếp lên mô hình 3D
  const [show3DMode, setShow3DMode] = useState(() => localStorage.getItem('rubik_3d_mode_v2') || 'always');
  const [linger3D, setLinger3D] = useState(false);
  const linger3DTimerRef = useRef(null);
  const handleChange3DMode = (mode) => {
    setShow3DMode(mode);
    localStorage.setItem('rubik_3d_mode_v2', mode);
  };

  // Trạng thái bám đuổi chuyển động (Dynamic Object Tracking Box) & Xác minh Mô hình 3D
  const [trackingBox, setTrackingBox] = useState({
    leftPct: 23,
    topPct: 23,
    widthPct: 54,
    heightPct: 54,
    cxPct: 50,
    cyPct: 50,
    isLocked: false,
    isMoving: false,
    speed: 0
  });
  const [model3DVerification, setModel3DVerification] = useState({
    verified: false,
    badgeText: '🔍 ĐANG QUÉT 3D',
    statusTitle: 'Chưa khóa khối Rubik trên Mô hình 3D',
    detailText: 'Di chuyển khối Rubik vào trước Camera để AI tự động bám theo & phân tích lên mô hình 3D.',
    facesCount: 0,
    validStickers: 0
  });
  const trackerStateRef = useRef({ cx: 0, cy: 0, size: 0, vx: 0, vy: 0 });
  const temporalBufferRef = useRef([]);
  const scannedFacesRef = useRef({});
  useEffect(() => {
    scannedFacesRef.current = scannedFaces;
  }, [scannedFaces]);

  // ANTI-BOT & ANTI-FAKE OBJECT (STRICT 3-STAGE RUBIK CUBE VERIFICATION)
  const [showHumanCheck, setShowHumanCheck] = useState(false);
  const behaviorRef = useRef(createBehaviorTracker());
  const startScrambledRef = useRef(false);
  const holdStartTsRef = useRef(0);
  const preCheckRef = useRef(null);
  const validCubeStreakRef = useRef(0);
  const solvedStreakRef = useRef(0);
  const lastCubeVerifiedAtRef = useRef(0);
  const initialCubeColorsRef = useRef(null);
  const lastValidCubeColorsRef = useRef(null);
  const cubeMovesSeenRef = useRef(0);
  const cubeStateChangedRef = useRef(false);

  // Refs
  const timerStateRef = useRef('idle');
  const timerIntervalRef = useRef(null);
  const inspectionIntervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const inspectionStartRef = useRef(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Callback ref đảm bảo video luôn nhận stream khi đổi chế độ hiển thị
  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);
  const animFrameRef = useRef(null);
  const prevColorsRef = useRef(null);
  const lastMoveTimeRef = useRef(0);
  const trackedMovesRef = useRef([]);
  const cameraActiveRef = useRef(false);
  const cameraHealthRef = useRef(false);
  const puzzleTypeRef = useRef(puzzleType);
  const gameModeRef = useRef(gameMode);
  const adminSettingsRef = useRef(adminSettings);
  const leaderboardsRef = useRef(leaderboards);
  const activeBoardIdRef = useRef(activeBoardId);
  const currentUserRef = useRef(currentUser);

  useEffect(() => { timerStateRef.current = timerState; }, [timerState]);
  useEffect(() => { preCheckRef.current = preCheckStatus; }, [preCheckStatus]);
  useEffect(() => { cameraActiveRef.current = cameraActive; }, [cameraActive]);
  useEffect(() => { trackedMovesRef.current = trackedMoves; }, [trackedMoves]);
  useEffect(() => {
    puzzleTypeRef.current = puzzleType;
    setDetectedColors(Array(currentDim * currentDim).fill('invalid'));
    setScannedFaces({});
  }, [puzzleType, currentDim]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { adminSettingsRef.current = adminSettings; }, [adminSettings]);
  useEffect(() => { leaderboardsRef.current = leaderboards; }, [leaderboards]);
  useEffect(() => { activeBoardIdRef.current = activeBoardId; }, [activeBoardId]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Inspection Timer Loop (WCA Mode)
  const startInspection = useCallback(() => {
    setTimerState('inspecting');
    setInspectionSeconds(15);
    setPenaltyText('');
    inspectionStartRef.current = performance.now();

    if (inspectionIntervalRef.current) clearInterval(inspectionIntervalRef.current);
    inspectionIntervalRef.current = setInterval(() => {
      const elapsedSec = (performance.now() - inspectionStartRef.current) / 1000;
      const remain = 15 - elapsedSec;

      if (remain <= -2) {
        setPenaltyText('DNF');
        setInspectionSeconds(0);
      } else if (remain <= 0) {
        setPenaltyText('+2');
        setInspectionSeconds(0);
      } else {
        setInspectionSeconds(Math.ceil(remain));
      }
    }, 100);
  }, []);

  // Stop Timer
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }

    const finalRawMs = performance.now() - startTimeRef.current;
    let finalSec = parseFloat((finalRawMs / 1000).toFixed(2));

    if (penaltyText === '+2') {
      finalSec = parseFloat((finalSec + 2.0).toFixed(2));
    }

    setTimeMs(finalSec * 1000);
    setTimerState('idle');

    if (gameModeRef.current === 'target') {
      if (finalSec <= targetSeconds) setLastTargetResult('win');
      else setLastTargetResult('loss');
    }

    const movesRecorded = trackedMovesRef.current;
    // BẮT BUỘC BẬT CAMERA HOẠT ĐỘNG VÀ ĐỦ TIÊU CHUẨN SÁNG/TƯƠNG PHẢN
    const isCameraVerified = Boolean(cameraActiveRef.current && cameraHealthRef.current);
    const currentP = puzzleTypeRef.current;

    // ANTI-BOT & ANTI-FAKE OBJECT: đánh giá 3 tầng tính hợp lệ của lượt giải trước khi cho vào Bảng Kỷ Lục
    const integrity = evaluateSolveIntegrity({
      sec: finalSec,
      puzzle: currentP,
      startedScrambled: startScrambledRef.current,
      cubeMovesSeen: cubeMovesSeenRef.current,
      cubeStateChanged: cubeStateChangedRef.current,
      automation: detectAutomation(),
      behavior: behaviorRef.current
    });
    behaviorRef.current.recordSolve(finalSec);
    if (behaviorRef.current.suspicious) revokeHumanSession(); // buộc xác minh lại ở lượt sau
    const isRecordEligible = Boolean(isCameraVerified && integrity.ok);

    // Giữ mô hình 3D thêm vài giây sau khi dừng để xem kết quả
    setLinger3D(true);
    if (linger3DTimerRef.current) clearTimeout(linger3DTimerRef.current);
    linger3DTimerRef.current = setTimeout(() => setLinger3D(false), 3000);

    const newSolve = {
      id: Date.now(),
      puzzleType: currentP,
      time: finalSec,
      penalty: penaltyText,
      date: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      moves: isRecordEligible
        ? (movesRecorded.length > 0 ? movesRecorded.join(' ') : `Camera AI (${cubeMovesSeenRef.current} nhịp xoay)`)
        : isCameraVerified
          ? 'Chưa đủ chuẩn Rubik AI (Luyện tập)'
          : 'Không dùng Cam (Chưa xác minh)',
      verified: isRecordEligible
    };

    setSolves(prev => {
      const updated = [newSolve, ...prev];
      localStorage.setItem('rubik_solves_hcc_clean', JSON.stringify(updated));
      return updated;
    });

    // =========================================================================
    // ANTI-CHEAT AUTOMATIC LEADERBOARD RECOGNITION (TỰ ĐỘNG NHẬN DIỆN KỶ LỤC)
    // =========================================================================
    if (isRecordEligible) {
      const cUser = currentUserRef.current;
      const playerName = cUser?.name?.trim() || 'Người chơi ẩn danh';
      const curBoards = leaderboardsRef.current;
      const bId = activeBoardIdRef.current;
      const curBoard = curBoards[bId] || Object.values(curBoards)[0];

      if (curBoard) {
        const boardEntries = [...(curBoard.entries || [])];
        const existingIdx = boardEntries.findIndex(
          e => e.name.toLowerCase() === playerName.toLowerCase() && (e.puzzleType || '3x3') === currentP
        );

        let wasUpdated = false;
        if (existingIdx !== -1) {
          const oldEntry = boardEntries[existingIdx];
          if (finalSec < oldEntry.best) {
            // Lập kỷ lục cá nhân mới (Personal Best)
            boardEntries[existingIdx] = {
              ...oldEntry,
              best: finalSec,
              avg: parseFloat(((oldEntry.best + finalSec) / 2).toFixed(2)),
              verified: true,
              date: new Date().toLocaleDateString('vi-VN')
            };
            wasUpdated = true;
            setLastNotice({
              type: 'success',
              text: `🎉 AI ĐÃ NHẬN DIỆN KỶ LỤC MỚI: ${playerName} vừa lập thành tích Best ${finalSec}s trên Bảng Kỷ Lục!`
            });
          } else {
            setLastNotice({
              type: 'success',
              text: `🟢 AI Camera xác thực thành công lượt giải: ${finalSec}s (Kỷ lục hiện tại: ${oldEntry.best}s)`
            });
          }
        } else {
          // Lần đầu ghi danh vào Bảng Kỷ Lục
          boardEntries.push({
            id: Date.now(),
            puzzleType: currentP,
            name: playerName,
            best: finalSec,
            avg: finalSec,
            verified: true,
            date: new Date().toLocaleDateString('vi-VN')
          });
          wasUpdated = true;
          setLastNotice({
            type: 'success',
            text: `🎉 AI ĐÃ XÁC THỰC KỶ LỤC: ${playerName} đã được tự động vinh danh với thành tích ${finalSec}s!`
          });
        }

        if (wasUpdated) {
          // Luôn tự động sắp xếp người có thời gian thấp nhất/nhanh nhất lên Top 1
          boardEntries.sort((a, b) => a.best - b.best);
          const updatedBoards = {
            ...curBoards,
            [bId]: {
              ...curBoard,
              entries: boardEntries
            }
          };
          saveLeaderboards(updatedBoards);

          // ĐỒNG BỘ LÊN CLOUD BACKEND (SUPABASE + ANTI-CHEAT PROOF HASH SHA-256)
          submitVerifiedSolveToCloud({
            boardId: bId,
            playerName,
            playerEmail: cUser?.email || 'guest@cuber.vn',
            puzzleType: currentP,
            bestTime: finalSec,
            avgTime: finalSec,
            scramble,
            cameraVerified: true,
            startedScrambled: startScrambledRef.current
          }).then((cloudRes) => {
            if (cloudRes?.ok) {
              setCloudStatus('connected');
            }
          });
        }
      }
    } else {
      // KHÔNG BẬT CAMERA HOẶC KHÔNG PHẢI KHỐI RUBIK THẬT -> TUYỆT ĐỐI KHÔNG ĐƯA VÀO BẢNG KỶ LỤC
      setLastNotice({
        type: 'warning',
        text: !isCameraVerified
          ? '⚠️ Lượt giải này chưa bật Camera AI nên KHÔNG được đưa vào Bảng Kỷ Lục!'
          : `🚫 TỪ CHỐI GHI KỶ LỤC: ${integrity.reason}!`
      });
    }

    // Reset toàn bộ trạng thái xác thực khối Rubik sau mỗi lượt giải để chống dùng lại kết quả cũ
    startScrambledRef.current = false;
    lastCubeVerifiedAtRef.current = 0;
    validCubeStreakRef.current = 0;
    solvedStreakRef.current = 0;
    cubeMovesSeenRef.current = 0;
    cubeStateChangedRef.current = false;
    initialCubeColorsRef.current = null;
    lastValidCubeColorsRef.current = null;
    if (cameraActiveRef.current) {
      setPreCheckStatus({
        verified: false,
        text: `🔍 Đưa khối Rubik đã xáo trộn vào khung lưới để xác nhận lượt tiếp theo...`,
        isScrambled: false,
        centerFace: null
      });
    }

    setTrackedMoves([]);
    setLastMoveDetected('');
    setScramble(generateScramble(currentP));
  }, [penaltyText, targetSeconds]);

  // Start Solve Timer
  const startTimer = useCallback(() => {
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }

    const now = performance.now();
    setTimeMs(0);
    setTrackedMoves([]);
    setLastMoveDetected('');
    setTimerState('running');
    startTimeRef.current = now;

    // ANTI-BOT & ANTI-FAKE OBJECT: chỉ công nhận đã check khối nếu vừa xác thực Rubik thật trong vòng 25 giây
    const isFreshPreCheck =
      Boolean(preCheckRef.current && preCheckRef.current.verified) &&
      lastCubeVerifiedAtRef.current > 0 &&
      now - lastCubeVerifiedAtRef.current <= 25000;

    startScrambledRef.current = isFreshPreCheck;
    cubeMovesSeenRef.current = 0;
    cubeStateChangedRef.current = false;
    solvedStreakRef.current = 0;
    behaviorRef.current.recordStart();

    if (cameraActiveRef.current && !isFreshPreCheck) {
      setLastNotice({
        type: 'warning',
        text: '⚠️ Chưa nhận diện khối Rubik thật đã xáo trộn trước Camera — Lượt này chỉ tính Luyện Tập (không ghi Bảng Kỷ Lục)!'
      });
    }

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeMs(performance.now() - startTimeRef.current);
    }, 10);
  }, []);

  const stopTimerRef = useRef(stopTimer);
  const startTimerRef = useRef(startTimer);
  const startInspectionRef = useRef(startInspection);
  useEffect(() => {
    stopTimerRef.current = stopTimer;
    startTimerRef.current = startTimer;
    startInspectionRef.current = startInspection;
  }, [stopTimer, startTimer, startInspection]);

  // WCA Keyboard Spacebar Controller
  useEffect(() => {
    let holdTimeout = null;

    const handleKeyDown = (e) => {
      if (!e.isTrusted) return; // chặn phím giả lập (dispatchEvent) từ bot
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

      const currentState = timerStateRef.current;
      const currentMode = gameModeRef.current;
      if (currentMode === 'solo') return;

      if (e.code === 'Space') {
        e.preventDefault();

        if (currentState === 'running') {
          stopTimerRef.current();
          return;
        }

        if (e.repeat) return;

        if (currentState === 'idle' && requireHumanRef.current()) return;
        holdStartTsRef.current = performance.now();

        if (currentMode === 'wca' && currentState === 'idle') {
          startInspectionRef.current();
          return;
        }

        if (currentState === 'idle' || currentState === 'inspecting') {
          setTimerState('holding');
          clearTimeout(holdTimeout);
          const holdMs = adminSettingsRef.current?.spaceHoldMs || 280;
          holdTimeout = setTimeout(() => {
            if (timerStateRef.current === 'holding') {
              setTimerState('ready');
            }
          }, holdMs);
        }
      } else {
        if (currentState === 'running') {
          stopTimerRef.current();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (!e.isTrusted) return;
      if (e.code === 'Space') {
        e.preventDefault();
        clearTimeout(holdTimeout);
        if (holdStartTsRef.current) {
          behaviorRef.current.recordHold(performance.now() - holdStartTsRef.current);
          holdStartTsRef.current = 0;
        }
        const currentState = timerStateRef.current;

        if (currentState === 'ready') {
          startTimerRef.current();
          playAppSound('start');
        } else if (currentState === 'holding') {
          if (gameModeRef.current === 'wca') {
            setTimerState('inspecting');
          } else {
            setTimerState('idle');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      clearTimeout(holdTimeout);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Camera Handler
  const toggleCamera = async () => {
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setCameraActive(false);
      cameraHealthRef.current = false;
      setCameraHealth({ isHealthy: false, reason: 'Camera đã tắt', brightness: 0, contrast: 0 });
      setPreCheckStatus({
        verified: false,
        text: 'Camera đã tắt — Chế độ tính giờ WCA thủ công',
        isScrambled: false,
        centerFace: null
      });
      setTrackedMoves([]);
      setLastMoveDetected('');
    } else {
      try {
        setPreCheckStatus(prev => ({ ...prev, text: 'Đang kết nối camera...' }));
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: cameraFacingMode }
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraActive(true);
      } catch (err) {
        setCameraActive(false);
        cameraHealthRef.current = false;
        setCameraHealth({ isHealthy: false, reason: 'Không thể mở camera: ' + err.message, brightness: 0, contrast: 0 });
        setPreCheckStatus({
          verified: false,
          text: 'Lỗi: Không tìm thấy camera hoặc bị lỗi phần cứng',
          isScrambled: false,
          centerFace: null
        });
      }
    }
  };

  useEffect(() => {
    if (!cameraActive) return;

    let isRunningLoop = true;

    const processFrame = () => {
      if (!isRunningLoop) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === 4 && video.videoWidth > 0) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(video, 0, 0, w, h);
        const frameImg = ctx.getImageData(0, 0, w, h).data;

        let totalBrightness = 0;
        const pixelStep = 16;
        let sampledCount = 0;
        let minVal = 255;
        let maxVal = 0;

        for (let i = 0; i < frameImg.length; i += pixelStep * 4) {
          const lum = 0.299 * frameImg[i] + 0.587 * frameImg[i + 1] + 0.114 * frameImg[i + 2];
          totalBrightness += lum;
          if (lum < minVal) minVal = lum;
          if (lum > maxVal) maxVal = lum;
          sampledCount++;
        }

        const avgBrightness = totalBrightness / sampledCount;
        const contrast = maxVal - minVal;

        let isHealthy = true;
        let healthReason = 'Hoạt động tốt';

        if (avgBrightness < 30) {
          isHealthy = false;
          healthReason = 'Camera bị hỏng / tối đen';
        } else if (contrast < 20) {
          isHealthy = false;
          healthReason = 'Camera bị mờ đơ / không tương phản';
        }

        cameraHealthRef.current = isHealthy;
        setCameraHealth({
          isHealthy,
          reason: healthReason,
          brightness: Math.round(avgBrightness),
          contrast: Math.round(contrast)
        });

        if (!isHealthy) {
          setPreCheckStatus({
            verified: false,
            text: `⚠️ ${healthReason}. Đã khóa AI để tránh sai lệch!`,
            isScrambled: false,
            centerFace: null
          });
          setDetectedColors(Array(currentDim * currentDim).fill('invalid'));
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const dim = currentDim;
        const bestRegion = locateDynamicRubikBox(frameImg, w, h, dim, trackerStateRef.current);
        const startX = bestRegion.startX;
        const startY = bestRegion.startY;
        const boxSize = bestRegion.boxSize;
        const foundCx = startX + boxSize / 2;
        const foundCy = startY + boxSize / 2;

        // Cập nhật bộ bám đuổi chuyển động (Kalman/EMA Smoothing) để khung lưới tự động chạy theo khối Rubik
        const prevTr = trackerStateRef.current;
        const hasCubeSignal = bestRegion.validColorsCount >= Math.ceil(dim * dim * 0.55) && bestRegion.vividColorsCount >= 2;
        let smoothCx = w / 2;
        let smoothCy = h / 2;
        let smoothSize = Math.min(w, h) * 0.52;
        let moveSpeed = 0;

        if (hasCubeSignal) {
          if (prevTr.cx > 0) {
            const rawVx = foundCx - prevTr.cx;
            const rawVy = foundCy - prevTr.cy;
            moveSpeed = Math.hypot(rawVx, rawVy);
            smoothCx = prevTr.cx + rawVx * 0.48;
            smoothCy = prevTr.cy + rawVy * 0.48;
            smoothSize = prevTr.size + (boxSize - prevTr.size) * 0.42;
            trackerStateRef.current = {
              cx: smoothCx,
              cy: smoothCy,
              size: smoothSize,
              vx: rawVx * 0.6,
              vy: rawVy * 0.6
            };
          } else {
            smoothCx = foundCx;
            smoothCy = foundCy;
            smoothSize = boxSize;
            trackerStateRef.current = { cx: smoothCx, cy: smoothCy, size: smoothSize, vx: 0, vy: 0 };
          }
        } else {
          // Đưa khung lưới từ từ về trung tâm khi không có khối Rubik trong khung hình
          smoothCx = prevTr.cx > 0 ? prevTr.cx + (w / 2 - prevTr.cx) * 0.25 : w / 2;
          smoothCy = prevTr.cy > 0 ? prevTr.cy + (h / 2 - prevTr.cy) * 0.25 : h / 2;
          smoothSize = Math.min(w, h) * 0.52;
          trackerStateRef.current = { cx: smoothCx, cy: smoothCy, size: smoothSize, vx: 0, vy: 0 };
        }

        const leftPct = Math.max(4, Math.min(92, ((smoothCx - smoothSize / 2) / w) * 100));
        const topPct = Math.max(4, Math.min(92, ((smoothCy - smoothSize / 2) / h) * 100));
        const widthPct = Math.max(25, Math.min(72, (smoothSize / w) * 100));
        const heightPct = Math.max(25, Math.min(72, (smoothSize / h) * 100));
        const cxPct = Math.round((smoothCx / w) * 100);
        const cyPct = Math.round((smoothCy / h) * 100);
        const isMovingNow = moveSpeed >= 4.5;

        setTrackingBox({
          leftPct: Number(leftPct.toFixed(1)),
          topPct: Number(topPct.toFixed(1)),
          widthPct: Number(widthPct.toFixed(1)),
          heightPct: Number(heightPct.toFixed(1)),
          cxPct,
          cyPct,
          isLocked: hasCubeSignal,
          isMoving: isMovingNow,
          speed: Math.round(moveSpeed)
        });

        // Bộ lọc Khử nhòe Chuyển động (3-Frame Temporal Stabilizer) giúp bắt nét màu lên Mô hình 3D ngay cả khi đang di chuyển khối
        let currentNxNColors = [...bestRegion.currentNxNColors];
        if (hasCubeSignal) {
          temporalBufferRef.current.push(currentNxNColors);
          if (temporalBufferRef.current.length > 3) temporalBufferRef.current.shift();

          if (temporalBufferRef.current.length >= 2) {
            currentNxNColors = currentNxNColors.map((col, idx) => {
              if (col !== 'invalid') return col;
              // Khôi phục ô bị nhòe do vung tay từ khung hình liền kề trước đó
              for (let b = temporalBufferRef.current.length - 2; b >= 0; b--) {
                const prevCol = temporalBufferRef.current[b][idx];
                if (prevCol && prevCol !== 'invalid') return prevCol;
              }
              return 'invalid';
            });
          }
        } else {
          temporalBufferRef.current = [];
        }

        const validColorsCount = currentNxNColors.filter((c) => c !== 'invalid').length;
        const vividColorsCount = currentNxNColors.filter((c) => c !== 'invalid' && c !== 'white').length;
        const sharpAdjacentEdges = bestRegion.sharpAdjacentEdges;
        const gridSeamContrast = bestRegion.gridSeamContrast;

        setDetectedColors(currentNxNColors);

        const now = performance.now();
        const minStickersRequired = Math.ceil(dim * dim * 0.75); // 3x3 cần >= 7/9 ô sticker hợp lệ
        const minVividRequired = Math.max(2, Math.floor(dim * dim * 0.44)); // 3x3 cần >= 4 ô màu rực (không phải trắng)

        if (validColorsCount < minStickersRequired) {
          validCubeStreakRef.current = 0;
          solvedStreakRef.current = 0;
          if (timerStateRef.current === 'idle' || timerStateRef.current === 'inspecting') {
            const remainValidMs = 25000 - (now - lastCubeVerifiedAtRef.current);
            if (lastCubeVerifiedAtRef.current > 0 && remainValidMs > 0) {
              setPreCheckStatus(prev => ({
                ...prev,
                verified: true,
                text: `🟢 ĐÃ KHÓA LÊN MÔ HÌNH 3D (${dim}×${dim}) — Sẵn sàng bấm giờ (còn ${Math.ceil(remainValidMs / 1000)}s)`
              }));
            } else {
              if (lastCubeVerifiedAtRef.current > 0) lastCubeVerifiedAtRef.current = 0;
              setPreCheckStatus({
                verified: false,
                text: `🔍 Đưa hoặc di chuyển khối Rubik ${dim}×${dim} trước camera để AI tự bám theo & phân tích lên 3D...`,
                isScrambled: false,
                centerFace: null
              });
              setModel3DVerification({
                verified: false,
                badgeText: '🔍 ĐỢI KHỐI RUBIK',
                statusTitle: 'Đang tìm khối Rubik trong vùng Camera...',
                detailText: 'Bạn có thể cầm di chuyển khối Rubik tự nhiên; khung lưới AI sẽ tự bám theo và chiếu lên Mô hình 3D.',
                facesCount: Object.keys(scannedFacesRef.current || {}).length,
                validStickers: validColorsCount
              });
            }
          }
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const centerIdx = dim % 2 === 1 ? Math.floor((dim * dim) / 2) : 0;
        const centerColor = currentNxNColors[centerIdx];
        const centerDef = COLOR_DEFINITIONS[centerColor];
        const centerName = centerDef ? centerDef.name : 'Không rõ';
        const validColorsOnly = currentNxNColors.filter(c => c !== 'invalid');
        const uniqueColorsCount = new Set(validColorsOnly).size;
        const isAllSameColor =
          validColorsCount === dim * dim &&
          uniqueColorsCount === 1 &&
          (centerColor !== 'white' || gridSeamContrast >= 9);

        // Điều kiện công nhận 1 mặt Rubik ĐÃ XÁO TRỘN THẬT (hỗ trợ cả khi đang di chuyển khối trên tay)
        const minUniqueForScramble = dim === 2 ? 2 : 3;
        const minSharpEdges = dim === 2 ? 2 : 3;
        const isGenuineScrambledCube =
          validColorsCount >= minStickersRequired &&
          vividColorsCount >= minVividRequired &&
          uniqueColorsCount >= minUniqueForScramble &&
          sharpAdjacentEdges >= minSharpEdges;

        // Ánh xạ màu mặt đang quét vào bộ nhớ 6 mặt của khối 3D ngay khi bắt được khối (kể cả khi đang di chuyển)
        const faceCodeMap = {
          white: 'U',
          yellow: 'D',
          red: 'R',
          orange: 'L',
          green: 'F',
          blue: 'B'
        };
        const mappedFace = faceCodeMap[centerColor] || 'F';
        let updatedFacesCount = Object.keys(scannedFacesRef.current || {}).length;
        if (isGenuineScrambledCube || isAllSameColor) {
          const nextFaces = {
            ...(scannedFacesRef.current || {}),
            [mappedFace]: [...currentNxNColors]
          };
          scannedFacesRef.current = nextFaces;
          updatedFacesCount = Object.keys(nextFaces).length;
          setScannedFaces(nextFaces);
        }

        // Phân tích & xác minh trực tiếp trên Mô hình 3D (3D Model Verification Analyzer)
        if (isGenuineScrambledCube) {
          setModel3DVerification({
            verified: true,
            badgeText: isMovingNow ? '🎯 BÁM 3D KHI DI CHUYỂN' : '✅ 3D XÁC MINH ĐÚNG',
            statusTitle: `✅ Mô hình 3D xác minh ĐÚNG khối ${dim}×${dim} (${uniqueColorsCount} màu WCA, Tâm ${centerName})`,
            detailText: `Khớp ${validColorsCount}/${dim * dim} ô sticker lên 3D • Đã lưu ${updatedFacesCount}/6 mặt • Tọa độ bám: (${cxPct}%, ${cyPct}%)${isMovingNow ? ' [Đang di chuyển]' : ''}`,
            facesCount: updatedFacesCount,
            validStickers: validColorsCount
          });
        } else if (isAllSameColor) {
          setModel3DVerification({
            verified: startScrambledRef.current && cubeStateChangedRef.current,
            badgeText: '🏆 MẶT 3D ĐỒNG MÀU',
            statusTitle: `🧊 Mô hình 3D nhận diện mặt ${centerName} đã đồng màu (${dim}×${dim})`,
            detailText: startScrambledRef.current
              ? `Đã đối chiếu khớp quá trình xoay (${cubeMovesSeenRef.current} nhịp) lên Mô hình 3D!`
              : `Khối trên Mô hình 3D đang ở trạng thái hoàn thành — Hãy xáo trộn khối để bắt đầu giải!`,
            facesCount: updatedFacesCount,
            validStickers: validColorsCount
          });
        }

        if (timerStateRef.current === 'idle' || timerStateRef.current === 'inspecting') {
          if (isGenuineScrambledCube) {
            validCubeStreakRef.current += 1;
            // Bắt nhạy ngay trong 2 khung hình liên tiếp kể cả khi người chơi đang di chuyển khối Rubik
            if (validCubeStreakRef.current >= 2) {
              lastCubeVerifiedAtRef.current = now;
              initialCubeColorsRef.current = [...currentNxNColors];
              lastValidCubeColorsRef.current = [...currentNxNColors];
              if (timerStateRef.current === 'inspecting') {
                startScrambledRef.current = true;
              }
              setPreCheckStatus({
                verified: true,
                text: `🟢 ĐÃ BẮT & XÁC MINH LÊN 3D (${uniqueColorsCount} màu, Tâm ${centerName})${isMovingNow ? ' [Đang bám chuyển động]' : ''}: Sẵn sàng bấm giờ!`,
                isScrambled: true,
                centerFace: centerName
              });
            } else {
              setPreCheckStatus({
                verified: false,
                text: `🎯 Đã bắt được khối tại (${cxPct}%, ${cyPct}%) — Đang đồng bộ lên Mô hình 3D...`,
                isScrambled: false,
                centerFace: centerName
              });
            }
          } else {
            validCubeStreakRef.current = 0;
            if (isAllSameColor) {
              setPreCheckStatus({
                verified: false,
                text: `⚠️ Khối ${dim}×${dim} đang ở trạng thái đồng màu — Hãy xáo trộn khối trước khi giải!`,
                isScrambled: false,
                centerFace: centerName
              });
            } else if (lastCubeVerifiedAtRef.current === 0 || now - lastCubeVerifiedAtRef.current > 25000) {
              setPreCheckStatus({
                verified: false,
                text: `🚫 Vật thể trước camera chưa khớp chuẩn khối Rubik ${dim}×${dim} đã xáo trộn (cần >= ${minUniqueForScramble} màu sticker rõ nét)`,
                isScrambled: false,
                centerFace: null
              });
            }
          }
        }

        // THEO DÕI BIẾN ĐỔI TRẠNG THÁI RUBIK THẬT TRONG LÚC ĐANG GIẢI (CHỐNG VẬT THỂ TĨNH / GIAN LẬN)
        if (timerStateRef.current === 'running') {
          const isValidRubikFrameDuringSolve =
            (validColorsCount >= Math.ceil(dim * dim * 0.67) &&
              vividColorsCount >= Math.max(2, Math.floor(dim * dim * 0.33)) &&
              sharpAdjacentEdges >= 2) ||
            isAllSameColor;

          if (isValidRubikFrameDuringSolve) {
            const initColors = initialCubeColorsRef.current;
            const prevValid = lastValidCubeColorsRef.current;

            let diffFromInitial = 0;
            if (Array.isArray(initColors) && initColors.length === currentNxNColors.length) {
              for (let i = 0; i < currentNxNColors.length; i++) {
                if (
                  currentNxNColors[i] !== 'invalid' &&
                  initColors[i] !== 'invalid' &&
                  currentNxNColors[i] !== initColors[i]
                ) {
                  diffFromInitial++;
                }
              }
            }

            let diffFromPrev = 0;
            if (Array.isArray(prevValid) && prevValid.length === currentNxNColors.length) {
              for (let i = 0; i < currentNxNColors.length; i++) {
                if (
                  currentNxNColors[i] !== 'invalid' &&
                  prevValid[i] !== 'invalid' &&
                  currentNxNColors[i] !== prevValid[i]
                ) {
                  diffFromPrev++;
                }
              }
            } else if (diffFromInitial >= 2) {
              diffFromPrev = diffFromInitial;
            }

            if (diffFromInitial >= 2 && diffFromPrev >= 2 && now - lastMoveTimeRef.current >= 140) {
              cubeMovesSeenRef.current += 1;
              cubeStateChangedRef.current = true;
              lastMoveTimeRef.current = now;
              lastValidCubeColorsRef.current = [...currentNxNColors];

              const moveSymbol = mappedFace || 'U';
              setLastMoveDetected(moveSymbol);
              setTrackedMoves(prev => (prev.length < 120 ? [...prev, moveSymbol] : prev));
            }
          }

          // Chỉ tự động dừng đồng hồ khi:
          // 1) Đã xác thực khối Rubik xáo trộn lúc đầu (startScrambledRef.current === true)
          // 2) Đã ghi nhận ít nhất 2 lần xoay biến đổi trạng thái khối Rubik trong lúc giải
          // 3) Mặt Rubik đồng màu chuẩn giữ ổn định >= 3 khung hình liên tiếp sau 2.8 giây
          if (
            isAllSameColor &&
            startScrambledRef.current &&
            cubeStateChangedRef.current &&
            cubeMovesSeenRef.current >= 2 &&
            now - startTimeRef.current > 2800
          ) {
            solvedStreakRef.current += 1;
            if (solvedStreakRef.current >= 3) {
              stopTimerRef.current();
            }
          } else {
            solvedStreakRef.current = 0;
          }
        }

        prevColorsRef.current = currentNxNColors;
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunningLoop = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraActive, currentDim]);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (ms) => {
    const totalSec = ms / 1000;
    return totalSec.toFixed(2);
  };

  const bestTime = currentSolves.length > 0 
    ? Math.min(...currentSolves.map(s => s.time)).toFixed(2) 
    : '--';
  const meanTime = currentSolves.length > 0 
    ? (currentSolves.reduce((acc, s) => acc + s.time, 0) / currentSolves.length).toFixed(2) 
    : '--';
  const ao5 = calculateAo(currentSolves, 5);
  const ao12 = calculateAo(currentSolves, 12);

  const deleteSolve = (id) => {
    setSolves(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('rubik_solves_hcc_clean', JSON.stringify(updated));
      return updated;
    });
  };

  const displayedEntries = (currentBoard?.entries || []).filter(e => {
    if (leaderboardFilter === 'all') return true;
    return (e.puzzleType || '3x3') === puzzleType;
  });

  // Handler mở Bảng Quản Trị Của Khoa (Chỉ cho phép khi CÓ CAMERA HOẠT ĐỘNG)
  const handleOpenKhoaAdminPanel = () => {
    if (!cameraActive || !cameraHealth.isHealthy) {
      alert('📷 YÊU CẦU BẢO MẬT:\n\nBạn phải BẬT CAMERA hoạt động bình thường thì mới có thể mở Bảng Quản Trị Admin của Khoa!\n\nHãy nhấn nút "Bật Cam" ở trên trước khi mở.');
      return;
    }
    setEditCompTitle(adminSettings.competitionTitle);
    setEditCompSub(adminSettings.subTitle);
    setEditSpaceHoldMs(adminSettings.spaceHoldMs);
    setShowAdminPanelModal(true);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      height: isMobile ? 'auto' : '100vh',
      backgroundColor: '#090f1d',
      color: '#e2e8f0',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflowY: isMobile ? 'visible' : 'hidden',
      overflowX: 'hidden',
      userSelect: 'none'
    }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ==========================================
          HEADER BAR: AUTH + DASHBOARD (HIỂN THỊ ĐẦY ĐỦ & CUỘN MƯỢT TRÊN ĐIỆN THOẠI)
      ========================================== */}
      <header style={{
        padding: isMobile ? '8px 10px' : '10px 24px',
        backgroundColor: '#0d1629',
        borderBottom: '1px solid #192642',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        width: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{
            width: isMobile ? '28px' : '34px',
            height: isMobile ? '28px' : '34px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isMobile ? '1rem' : '1.2rem',
            boxShadow: '0 2px 10px rgba(37, 99, 235, 0.4)'
          }}>
            ⏱️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '0.88rem' : '1.02rem', fontWeight: '700', color: '#f8fafc' }}>
              {isMobile ? 'Rubik AI Pro' : adminSettings.competitionTitle}
            </h1>
            {!isMobile && (
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
                {adminSettings.subTitle}
              </p>
            )}
          </div>
        </div>

        {/* Right header: Shield + Dashboard + Camera + Tài Khoản (Cho phép cuộn ngang & tự xuống dòng trên điện thoại) */}
        <div
          className="no-scrollbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '10px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            maxWidth: '100%',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y'
          }}
        >
          {!isMobile && (
            <button
              type="button"
              onClick={() => setShowHumanCheck(true)}
              title="Bấm để xem Khiên Bảo Vệ Smart Anti-Bot & Tường lửa WAF"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '0.72rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <span>🛡️</span>
              <span>WAF & Anti-Bot</span>
              {getSecurityStats().totalBlocked > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '0 5px',
                  fontSize: '0.66rem'
                }}>
                  Đã chặn {getSecurityStats().totalBlocked}
                </span>
              )}
            </button>
          )}

          {/* NÚT MỞ DASHBOARD */}
          <button
            onClick={() => setShowDashboardModal(true)}
            style={{
              padding: '6px 13px',
              borderRadius: '6px',
              border: '1px solid #38bdf844',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(37, 99, 235, 0.2))',
              color: '#38bdf8',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </button>

          {/* Camera Button */}
          <button
            onClick={toggleCamera}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: cameraActive 
                ? (cameraHealth.isHealthy ? '1px solid #22c55e' : '1px solid #ef4444') 
                : '1px solid #334155',
              background: cameraActive 
                ? (cameraHealth.isHealthy ? '#14532d55' : '#7f1d1d44') 
                : '#1e293b',
              color: cameraActive 
                ? (cameraHealth.isHealthy ? '#4ade80' : '#f87171') 
                : '#94a3b8',
              fontWeight: '600',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{cameraActive ? (cameraHealth.isHealthy ? '🟢' : '🔴') : '📷'}</span>
            <span>{cameraActive ? (cameraHealth.isHealthy ? 'Tắt Cam' : 'Lỗi Cam') : 'Bật Cam'}</span>
          </button>

          {/* NUT DOI CAMERA TRUOC/SAU (CHO MOBILE/TABLET) */}
          {cameraActive && (
            <button
              onClick={flipCamera}
              title="Đổi giữa Camera Trước và Camera Sau"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#38bdf8',
                fontWeight: '600',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🔄</span>
              <span>{cameraFacingMode === 'user' ? 'Cam Sau' : 'Cam Trước'}</span>
            </button>
          )}

          {/* CHỈ HIỂN THỊ QUẢN TRỊ KHI LÀ GMAIL KHOA: khoa.tt2611758@sis.hust.edu.vn */}
          {isKhoaAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleOpenKhoaAdminPanel}
                title={cameraActive && cameraHealth.isHealthy ? "Mở Bảng Điều Khiển Quản Trị của Khoa" : "Cần bật Camera để mở bảng Quản Trị"}
                style={{
                  background: (cameraActive && cameraHealth.isHealthy)
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                    : '#1e293b',
                  border: (cameraActive && cameraHealth.isHealthy)
                    ? 'none'
                    : '1px solid #334155',
                  color: (cameraActive && cameraHealth.isHealthy) ? '#ffffff' : '#64748b',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: (cameraActive && cameraHealth.isHealthy) ? '0 2px 8px rgba(245, 158, 11, 0.35)' : 'none'
                }}
              >
                <span>⚙️</span>
                <span>Quản Trị Của Khoa</span>
              </button>

              <div
                onClick={() => setShowAuthModal(true)}
                title="Bấm để quản lý tài khoản hoặc Đăng xuất"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#111c34',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #f59e0b',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>👑</span>
                <span style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: '700' }}>
                  {currentUser.name}
                </span>
              </div>
            </div>
          ) : (
            /* NGƯỜI DÙNG THÔNG THƯỜNG — HOÀN TOÀN KHÔNG THẤY MỤC ADMIN NÀO */
            <div
              onClick={() => setShowAuthModal(true)}
              title="Bấm để đăng nhập tài khoản của bạn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#111c34',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #1a2a4c',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '0.8rem' }}>👤</span>
              <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '600' }}>
                {currentUser.email === 'guest@cuber.vn' ? 'Đăng nhập' : currentUser.name}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ==========================================
          MAIN 3-COLUMN WORKSPACE (HỖ TRỢ CUỘN TỰ NHIÊN TRÊN ANDROID & iOS)
      ========================================== */}
      <div style={{
        flex: 1,
        display: isMobile ? 'flex' : 'grid',
        flexDirection: isMobile ? 'column' : undefined,
        gridTemplateColumns: isMobile ? undefined : (gameMode === 'solo' ? '280px 1fr' : '270px 1fr 380px'),
        padding: isMobile ? '8px 10px 88px 10px' : '12px 20px',
        gap: '12px',
        overflowY: isMobile ? 'visible' : 'hidden',
        overflowX: 'hidden'
      }}>
        {/* === CỘT TRÁI: THÀNH TÍCH & LỊCH SỬ === */}
        {(!isMobile || mobileTab === 'stats') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: isMobile ? 'visible' : 'hidden', width: isMobile ? '100%' : undefined }}>
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
                Thành tích ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{currentSolves.length} lượt</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Best Single</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#38bdf8' }}>{bestTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mean</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc' }}>{meanTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Current ao5</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Current ao12</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Lịch sử giải */}
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
                Lịch sử ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mới nhất</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {currentSolves.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem', marginTop: '24px' }}>
                  Chưa có lượt giải {puzzleType} nào
                </div>
              ) : (
                currentSolves.map((s, index) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#111c34',
                      border: '1px solid #192642',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>#{currentSolves.length - index}</span>
                      <div>
                        <strong style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                          {s.time}s
                        </strong>
                        {s.penalty && (
                          <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: '700', marginLeft: '4px' }}>
                            ({s.penalty})
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: s.verified ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: s.verified ? '#4ade80' : '#94a3b8'
                      }}>
                        {s.verified ? '✓ AI' : 'Thủ công'}
                      </span>
                      <button
                        onClick={() => deleteSolve(s.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        )}

        {/* === CỘT GIỮA: CHẾ ĐỘ CHƠI + PUZZLE TABS + SCRAMBLE + CAMERA + TIMER === */}
        {(!isMobile || mobileTab === 'timer' || gameMode === 'solo') && (
        <div style={{
          backgroundColor: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: isMobile ? '12px 14px' : '16px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          width: isMobile ? '100%' : undefined,
          minHeight: isMobile ? '450px' : undefined
        }}>
          {/* Top Bar: GAME MODES + PUZZLE SELECTOR */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              background: '#090f1d',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #16223b',
              gap: '4px',
              maxWidth: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x pan-y'
            }} className="no-scrollbar">
              {GAME_MODES.map((m) => {
                const isSelected = gameMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelectGameMode(m.id)}
                    title={m.desc}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                      color: isSelected ? '#ffffff' : '#64748b',
                      fontWeight: isSelected ? '700' : '600',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.15s'
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            {gameMode === 'target' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#94a3b8' }}>
                <span>Mục tiêu Sub:</span>
                {[10, 15, 20, 30].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setTargetSeconds(sec)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: targetSeconds === sec ? '1px solid #38bdf8' : '1px solid #1e293b',
                      background: targetSeconds === sec ? '#1e3a8a' : '#111c34',
                      color: targetSeconds === sec ? '#ffffff' : '#94a3b8',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      fontWeight: '700'
                    }}
                  >
                    Sub-{sec}s
                  </button>
                ))}
              </div>
            )}

            <div style={{
              display: 'inline-flex',
              background: '#090f1d',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #16223b',
              gap: '4px',
              maxWidth: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch'
            }} className="no-scrollbar">
              {Object.values(PUZZLE_CONFIGS).map((p) => {
                const isSelected = puzzleType === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPuzzle(p.id)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? '#1e293b' : 'transparent',
                      color: isSelected ? '#38bdf8' : '#64748b',
                      fontWeight: isSelected ? '800' : '600',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      borderBottom: isSelected ? '2px solid #38bdf8' : '2px solid transparent'
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            {/* THÔNG BÁO NHẬN DIỆN KỶ LỤC AI THỜI GIAN THỰC */}
            {lastNotice && (
              <div style={{
                margin: '2px 0 6px 0',
                padding: '8px 16px',
                borderRadius: '8px',
                background: lastNotice.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: lastNotice.type === 'success' ? '1px solid #22c55e' : '1px solid #ef4444',
                color: lastNotice.type === 'success' ? '#4ade80' : '#f87171',
                fontSize: '0.82rem',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: lastNotice.type === 'success' ? '0 0 16px rgba(34, 197, 94, 0.2)' : '0 0 16px rgba(239, 68, 68, 0.2)'
              }}>
                <span>{lastNotice.text}</span>
                <button
                  onClick={() => setLastNotice(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    padding: 0
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {gameMode !== 'solo' && (
            <div style={{ width: '100%', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>
                  SCRAMBLE {PUZZLE_CONFIGS[puzzleType]?.name}
                </span>
                <button
                  onClick={() => setScramble(generateScramble(puzzleType))}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  🔄 Đổi
                </button>
              </div>

              <div style={{
                fontSize: puzzleType === '5x5' ? '0.9rem' : (puzzleType === '4x4' ? '1.02rem' : '1.15rem'),
                fontWeight: '700',
                lineHeight: 1.4,
                color: '#cbd5e1',
                fontFamily: 'monospace',
                padding: '8px 12px',
                background: '#090f1d',
                borderRadius: '8px',
                border: '1px solid #16223b',
                maxHeight: '65px',
                overflowY: 'auto'
              }}>
                {scramble}
              </div>
            </div>
            )}
          </div>

          {gameMode === 'solo' ? (
            <Solo1v1Arena
              currentUser={currentUser}
              cameraActive={cameraActive}
              cameraHealth={cameraHealth}
              puzzleType={puzzleType}
              generateScramble={generateScramble}
              formatTime={formatTime}
              onExitSolo={() => handleSelectGameMode('free')}
            />
          ) : (
            <>
            {/* Center-Top: MÀN HÌNH HIỂN THỊ KHỐI 3D AI PHÍA TRÊN (UPPER 3D AI DISPLAY SCREEN) */}
          {(() => {
            const solvingNow = timerState === 'ready' || timerState === 'inspecting' || timerState === 'running' || linger3D;
            return (cameraActive || showUpper3DWhenCamOff) && (show3DMode === 'always' || solvingNow);
          })() ? (
            <div style={{
              width: '100%',
              maxWidth: upper3DExpanded ? '720px' : '640px',
              background: 'linear-gradient(180deg, #0b1326 0%, #070c18 100%)',
              borderRadius: '14px',
              border: cameraActive
                ? (cameraHealth.isHealthy ? (preCheckStatus.verified ? '1.5px solid #22c55e' : '1.5px solid #38bdf8') : '1.5px solid #ef4444')
                : '1px solid #1e293b',
              padding: isMobile ? '10px' : '12px 16px',
              boxShadow: preCheckStatus.verified
                ? '0 8px 28px rgba(34, 197, 94, 0.15)'
                : '0 8px 28px rgba(15, 23, 42, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              transition: 'all 0.2s ease'
            }}>
              {/* Thanh tiêu đề màn hình 3D phía trên */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '6px',
                borderBottom: '1px solid #16223b',
                paddingBottom: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    color: preCheckStatus.verified ? '#4ade80' : '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    {cameraActive
                      ? (preCheckStatus.verified ? `🟢 MÀN HÌNH 3D AI: ĐÃ NHẬN DIỆN ${currentDim}×${currentDim}` : `🔍 MÀN HÌNH 3D AI ĐANG QUÉT (${currentDim}×${currentDim})`)
                      : `🧊 MÀN HÌNH MÔ HÌNH 3D (${PUZZLE_CONFIGS[puzzleType]?.name})`}
                  </span>

                  {cameraActive && (
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      background: '#111c34',
                      border: '1px solid #1e293b',
                      color: '#cbd5e1',
                      fontWeight: '600'
                    }}>
                      Ô màu rõ: <strong style={{ color: '#38bdf8' }}>{detectedColors.filter(c => c !== 'invalid').length}/{currentDim * currentDim}</strong>
                      {preCheckStatus.centerFace ? ` • Tâm: ${preCheckStatus.centerFace}` : ''}
                    </span>
                  )}

                  {Object.keys(scannedFaces).length > 0 && (
                    <span style={{
                      fontSize: '0.66rem',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      color: '#4ade80',
                      fontWeight: '700'
                    }}>
                      Đã lưu {Object.keys(scannedFaces).length}/6 mặt
                    </span>
                  )}
                </div>

                {/* Các nút điều khiển kích thước & chế độ màn hình 3D phía trên */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <button
                    type="button"
                    onClick={() => handleChange3DMode(show3DMode === 'always' ? 'solving' : 'always')}
                    title="Chuyển giữa: luôn hiện 3D / chỉ hiện khi bắt đầu giải"
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid #334155',
                      background: show3DMode === 'solving' ? 'rgba(34, 197, 94, 0.2)' : '#111c34',
                      color: show3DMode === 'solving' ? '#4ade80' : '#cbd5e1',
                      fontSize: '0.66rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {show3DMode === 'solving' ? '⚡ Chỉ hiện khi giải' : '👁 Luôn hiện'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpper3DExpanded(v => !v)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid #334155',
                      background: upper3DExpanded ? '#2563eb' : '#111c34',
                      color: '#ffffff',
                      fontSize: '0.66rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {upper3DExpanded ? '🗕 Thu gọn' : '🔍 Phóng to 3D'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShow3DPreviewModal(true)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid #1e293b',
                      background: '#111c34',
                      color: '#38bdf8',
                      fontSize: '0.66rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    ⛶ Toàn màn hình
                  </button>

                  {!cameraActive && (
                    <button
                      type="button"
                      onClick={() => setShowUpper3DWhenCamOff(false)}
                      style={{
                        padding: '3px 7px',
                        borderRadius: '5px',
                        border: '1px solid #334155',
                        background: '#1e293b',
                        color: '#94a3b8',
                        fontSize: '0.66rem',
                        cursor: 'pointer'
                      }}
                    >
                      Ẩn
                    </button>
                  )}
                </div>
              </div>

              {/* Nội dung chính của Màn hình 3D phía trên: Khối 3D Lớn + Khung Cam có Lưới Ngắm AI + Ma trận 2D */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isMobile ? '10px' : '16px',
                flexWrap: 'wrap'
              }}>
                {/* 1. KHỐI RUBIK 3D TRUNG TÂM HIỂN THỊ RÕ NÉT */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Rubik3DView
                    dim={currentDim}
                    detectedColors={detectedColors}
                    scannedFaces={scannedFaces}
                    lastMove={lastMoveDetected}
                    trackingBox={trackingBox}
                    modelVerification={model3DVerification}
                    width={upper3DExpanded ? (isMobile ? 280 : 310) : (isMobile ? 195 : 225)}
                    height={upper3DExpanded ? (isMobile ? 205 : 220) : (isMobile ? 150 : 165)}
                  />
                </div>

                {/* 2. KHUNG CAMERA AI KÈM KHUNG LƯỚI TỰ ĐỘNG BÁM THEO CHUYỂN ĐỘNG RUBIK */}
                {cameraActive && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <div style={{
                      position: 'relative',
                      width: upper3DExpanded ? '175px' : (isMobile ? '135px' : '155px'),
                      height: upper3DExpanded ? '145px' : (isMobile ? '115px' : '130px'),
                      borderRadius: '10px',
                      overflow: 'hidden',
                      background: '#020617',
                      border: preCheckStatus.verified ? '2px solid #22c55e' : '1.5px solid #38bdf8',
                      flexShrink: 0
                    }}>
                      <video
                        ref={attachVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />

                      {/* Lưới ngắm AI động (Dynamic Tracking Grid) tự động chạy bám theo khối Rubik khi di chuyển */}
                      <div style={{
                        position: 'absolute',
                        top: `${trackingBox.topPct}%`,
                        left: `${trackingBox.leftPct}%`,
                        width: `${trackingBox.widthPct}%`,
                        height: `${trackingBox.heightPct}%`,
                        transition: 'top 0.07s linear, left 0.07s linear, width 0.07s linear, height 0.07s linear',
                        display: 'grid',
                        gridTemplateColumns: `repeat(${currentDim}, 1fr)`,
                        gridTemplateRows: `repeat(${currentDim}, 1fr)`,
                        border: preCheckStatus.verified
                          ? '2px solid #22c55e'
                          : trackingBox.isLocked
                            ? '2px solid #38bdf8'
                            : '1.5px dashed rgba(56, 189, 248, 0.85)',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 999px rgba(2, 6, 23, 0.32)'
                      }}>
                        {detectedColors.map((colorKey, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: '0.5px solid rgba(255,255,255,0.22)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: COLOR_DEFINITIONS[colorKey]?.bg || 'transparent',
                              border: colorKey !== 'invalid' ? '1px solid #000' : 'none'
                            }} />
                          </div>
                        ))}
                      </div>

                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        left: '6px',
                        background: 'rgba(2, 6, 23, 0.82)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.56rem',
                        color: trackingBox.isLocked ? '#4ade80' : '#38bdf8',
                        fontWeight: '700',
                        pointerEvents: 'none'
                      }}>
                        {trackingBox.isLocked
                          ? `🎯 Đang bám (${trackingBox.cxPct}%, ${trackingBox.cyPct}%)`
                          : '📷 Tự động bắt khi di chuyển'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. MA TRẬN MẶT 2D & PHÂN TÍCH XÁC MINH TRÊN MÔ HÌNH 3D */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '6px',
                  maxWidth: isMobile ? '100%' : '215px',
                  background: '#090f1d',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: model3DVerification.verified ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid #16223b'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Lưới 2D đối chiếu nhanh */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${currentDim}, ${currentDim >= 4 ? '12px' : '15px'})`,
                      gap: '2px',
                      background: '#020617',
                      padding: '4px',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                      flexShrink: 0
                    }}>
                      {detectedColors.map((colorKey, i) => (
                        <div
                          key={i}
                          style={{
                            width: currentDim >= 4 ? '12px' : '15px',
                            height: currentDim >= 4 ? '12px' : '15px',
                            borderRadius: '2px',
                            backgroundColor: COLOR_DEFINITIONS[colorKey]?.bg || '#1e293b'
                          }}
                        />
                      ))}
                    </div>

                    <div style={{ fontSize: '0.68rem', lineHeight: '1.35', color: preCheckStatus.verified ? '#4ade80' : '#e2e8f0' }}>
                      <div style={{ fontWeight: '800', marginBottom: '2px', color: model3DVerification.verified ? '#4ade80' : '#38bdf8' }}>
                        {cameraActive ? model3DVerification.statusTitle : '🧊 CHẾ ĐỘ XEM 3D'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.64rem' }}>
                        {cameraActive ? model3DVerification.detailText : 'Bật Cam để AI bám theo khối Rubik & phân tích lên mô hình 3D.'}
                      </div>
                    </div>
                  </div>

                  {Object.keys(scannedFaces).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setScannedFaces({})}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid #1e293b',
                        background: '#111c34',
                        color: '#94a3b8',
                        fontSize: '0.64rem',
                        cursor: 'pointer',
                        width: '100%'
                      }}
                    >
                      🔄 Xóa bộ nhớ 3D ({Object.keys(scannedFaces).length}/6 mặt đã phân tích)
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : cameraActive ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              width: '100%',
              maxWidth: '620px',
              background: '#090f1d',
              borderRadius: '12px',
              border: cameraHealth.isHealthy ? (preCheckStatus.verified ? '1.5px solid #22c55e' : '1px solid #192642') : '1.5px solid #ef4444',
              flexWrap: 'wrap'
            }}>
              <div style={{
                position: 'relative',
                width: '120px',
                height: '90px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#020617',
                border: preCheckStatus.verified ? '2px solid #22c55e' : '1.5px solid #38bdf8',
                flexShrink: 0
              }}>
                <video ref={attachVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute',
                  top: `${trackingBox.topPct}%`,
                  left: `${trackingBox.leftPct}%`,
                  width: `${trackingBox.widthPct}%`,
                  height: `${trackingBox.heightPct}%`,
                  transition: 'top 0.07s linear, left 0.07s linear, width 0.07s linear, height 0.07s linear',
                  display: 'grid',
                  gridTemplateColumns: `repeat(${currentDim}, 1fr)`,
                  gridTemplateRows: `repeat(${currentDim}, 1fr)`,
                  border: preCheckStatus.verified ? '2px solid #22c55e' : '1.5px dashed rgba(56, 189, 248, 0.85)',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 999px rgba(2, 6, 23, 0.3)'
                }}>
                  {detectedColors.map((colorKey, idx) => (
                    <div key={idx} style={{ border: '0.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: COLOR_DEFINITIONS[colorKey]?.bg || 'transparent'
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: '180px', fontSize: '0.74rem', lineHeight: 1.4, color: preCheckStatus.verified ? '#4ade80' : '#f59e0b' }}>
                <div style={{ fontWeight: '800', marginBottom: '2px', color: preCheckStatus.verified ? '#4ade80' : '#38bdf8' }}>
                  {preCheckStatus.verified ? `🟢 ĐÃ CHECK KHỐI ${currentDim}×${currentDim} — SẴN SÀNG` : `🔍 ĐẶT KHỐI ${currentDim}×${currentDim} VÀO KHUNG LƯỚI`}
                </div>
                <div>{preCheckStatus.text}</div>
                <div style={{ marginTop: '4px', color: '#94a3b8' }}>
                  🧊 Mô hình 3D sẽ tự xuất hiện khi bạn bắt đầu giải.
                </div>
                <button
                  type="button"
                  onClick={() => handleChange3DMode('always')}
                  style={{
                    marginTop: '5px',
                    padding: '3px 9px',
                    borderRadius: '5px',
                    border: '1px solid #1e293b',
                    background: '#111c34',
                    color: '#38bdf8',
                    fontSize: '0.66rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  👁 Luôn hiện 3D
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontSize: '0.74rem',
              maxWidth: '620px',
              width: '100%',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div>
                {gameMode === 'wca' && '🏆 Chế độ WCA: Bấm Space để bắt đầu 15s Inspection (quan sát)'}
                {gameMode === 'target' && `⚡ Mục tiêu: Cố gắng hoàn thành trong Sub-${targetSeconds}s!`}
                {gameMode === 'free' && '🎯 Chế độ Tự Do: Nhấn giữ Spacebar để sẵn sàng giải'}
                {gameMode === 'ai' && '🤖 Chế độ AI: Bật camera để AI hiển thị khối 3D phía trên & làm trọng tài'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setShowUpper3DWhenCamOff(true)}
                  title="Hiển thị màn hình khối 3D ngay phía trên đồng hồ"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0
                  }}
                >
                  <span>🧊 Bật Khối 3D Khi Giải</span>
                </button>
              </div>
            </div>
          )}

          {/* Center-Middle: GIANT TIMER & SPEEDCUBING TOUCHPAD */}
          <div
            onPointerDown={handleTimerPointerDown}
            onPointerMove={handleTimerPointerMove}
            onPointerUp={handleTimerPointerUp}
            onPointerCancel={handleTimerPointerUp}
            className={timerState === 'ready' || timerState === 'running' ? 'touch-timer-pad-active' : 'touch-timer-surface'}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              padding: isMobile ? '14px 8px' : '8px 0',
              margin: 'auto 0'
            }}
          >
            <div style={{
              fontSize: timerState === 'inspecting' ? 'clamp(4.2rem, 18vw, 8.5rem)' : 'clamp(3.8rem, 16vw, 8rem)',
              fontWeight: '900',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              letterSpacing: '-3px',
              lineHeight: 1,
              color: timerState === 'inspecting' 
                ? (inspectionSeconds <= 3 ? '#ef4444' : '#f59e0b')
                : (timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#ffffff')),
              textShadow: timerState === 'ready' ? '0 0 45px rgba(34, 197, 94, 0.5)' : 'none',
              transition: 'color 0.1s ease'
            }}>
              {timerState === 'inspecting' ? inspectionSeconds : formatTime(timeMs)}
            </div>

            <div style={{
              marginTop: '10px',
              fontSize: isMobile ? '0.86rem' : '0.95rem',
              textAlign: 'center',
              fontWeight: '700',
              color: timerState === 'inspecting'
                ? '#f59e0b'
                : (timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#64748b'))
            }}>
              {timerState === 'inspecting' && (isMobile ? '⏱️ ĐANG QUAN SÁT (15s) — CHẠM GIỮ ĐỂ SẴN SÀNG!' : '⏱️ ĐANG QUAN SÁT (15s WCA) — GIỮ SPACE ĐỂ SẴN SÀNG!')}
              {timerState === 'ready' && (isMobile ? '● SẴN SÀNG — THẢ TAY ĐỂ BẮT ĐẦU!' : '● SẴN SÀNG — THẢ PHÍM SPACE ĐỂ BẮT ĐẦU!')}
              {timerState === 'holding' && '○ Giữ yên thêm một chút... (Vuốt để cuộn trang)'}
              {timerState === 'running' && (isMobile ? '⚡ Đang tính giờ... Chạm bất kỳ đâu để DỪNG!' : 'Đang tính giờ... (Nhấn phím bất kỳ hoặc click để dừng)')}
              {timerState === 'idle' && (
                isMobile
                  ? `✋ Chạm giữ bàn phím cảm ứng bên dưới để giải ${PUZZLE_CONFIGS[puzzleType]?.name}`
                  : (gameMode === 'wca' 
                      ? 'Nhấn Space để bắt đầu 15s quan sát (Inspection)' 
                      : `Giữ phím SPACE để chuẩn bị giải ${PUZZLE_CONFIGS[puzzleType]?.name}`)
              )}
            </div>

            {/* BÀN ĐẶT TAY SPEEDCUBING DÀNH RIÊNG CHO ĐIỆN THOẠI ANDROID / iOS */}
            {isMobile && (
              <div
                style={{
                  marginTop: '14px',
                  width: '100%',
                  maxWidth: '340px',
                  padding: '16px 14px',
                  borderRadius: '14px',
                  background: timerState === 'ready'
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(22, 163, 74, 0.18))'
                    : timerState === 'holding'
                      ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.15))'
                      : timerState === 'running'
                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.15))'
                        : 'linear-gradient(180deg, #111c34 0%, #0b1324 100%)',
                  border: timerState === 'ready'
                    ? '2px solid #22c55e'
                    : timerState === 'holding'
                      ? '2px solid #f59e0b'
                      : timerState === 'running'
                        ? '2px solid #ef4444'
                        : '1.5px dashed #38bdf866',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  color: timerState === 'ready'
                    ? '#4ade80'
                    : timerState === 'holding'
                      ? '#fbbf24'
                      : timerState === 'running'
                        ? '#f87171'
                        : '#38bdf8',
                  fontWeight: '800',
                  fontSize: '0.86rem',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.4)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>
                  {timerState === 'running' ? '🛑' : timerState === 'ready' ? '🟢' : '🖐️'}
                </span>
                <span>
                  {timerState === 'running'
                    ? 'CHẠM ĐỂ DỪNG ĐỒNG HỒ'
                    : timerState === 'ready'
                      ? 'THẢ TAY RA ĐỂ CHẠY!'
                      : timerState === 'holding'
                        ? 'ĐANG GIỮ TAY...'
                        : 'ĐẶT & GIỮ TAY TẠI ĐÂY ĐỂ GIẢI'}
                </span>
              </div>
            )}

            
            {/* Quick summary stats bar on mobile */}
            {isMobile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginTop: '12px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: '#090f1d',
                border: '1px solid #16223b',
                fontSize: '0.75rem'
              }}>
                <div>PB: <strong style={{ color: '#fbbf24' }}>{bestTime}s</strong></div>
                <div style={{ color: '#334155' }}>•</div>
                <div>Ao5: <strong style={{ color: '#38bdf8' }}>{ao5}s</strong></div>
                <div style={{ color: '#334155' }}>•</div>
                <div>Số lần: <strong style={{ color: '#a78bfa' }}>{currentSolves.length}</strong></div>
              </div>
            )}

            {lastTargetResult && timerState === 'idle' && (
              <div style={{
                marginTop: '8px',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '700',
                background: lastTargetResult === 'win' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: lastTargetResult === 'win' ? '#4ade80' : '#ef4444'
              }}>
                {lastTargetResult === 'win' ? `🎉 CHIẾN THẮNG! Đạt mục tiêu Sub-${targetSeconds}s!` : `Chưa đạt Sub-${targetSeconds}s, cố lên!`}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.78rem', lineHeight: 1.5 }}>
            <div>📱 <strong>Mobile:</strong> Chạm giữ màn hình chờ xanh lá → Thả tay để giải → Chạm để dừng</div>
            <div>💻 <strong>Desktop:</strong> Giữ phím Space chờ xanh lá → Thả tay để giải → Bấm phím bất kỳ để dừng</div>
          </div>
            </>
          )}
        </div>
        )}

        {/* === CỘT PHẢI: BẢNG XẾP HẠNG === */}
        {gameMode !== 'solo' && (!isMobile || mobileTab === 'leaderboard') && (
        <div style={{
          backgroundColor: '#0d1629',
          width: isMobile ? '100%' : undefined,
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Header Bảng Xếp Hạng & Chọn Bảng */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <select
              value={activeBoardId}
              onChange={(e) => {
                setActiveBoardId(e.target.value);
                localStorage.setItem('rubik_active_board_id', e.target.value);
              }}
              style={{
                background: '#111c34',
                border: '1px solid #1a2a4c',
                color: '#f8fafc',
                fontSize: '0.9rem',
                fontWeight: '700',
                padding: '5px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '190px'
              }}
            >
              {Object.values(leaderboards).map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>

            <button
              onClick={() => setShowNewBoardModal(true)}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: '700',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ➕ Lập bảng mới
            </button>
          </div>

          {/* Trạng thái Chống Gian Lận (Anti-Cheat) & Bộ Lọc */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', margin: '4px 0 6px 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: cameraActive && cameraHealth.isHealthy ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: cameraActive && cameraHealth.isHealthy ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '5px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              color: cameraActive && cameraHealth.isHealthy ? '#4ade80' : '#f87171',
              fontWeight: '700'
            }}>
              <span>{cameraActive && cameraHealth.isHealthy ? '🟢 AI Cam: Tự động ghi nhận' : '🔴 Chưa Bật Cam: Không Lưu Kỷ Lục'}</span>
            </div>

            <div style={{ display: 'flex', background: '#111c34', borderRadius: '4px', border: '1px solid #1e293b', padding: '2px' }}>
              <button
                onClick={() => setLeaderboardFilter('current')}
                style={{
                  background: leaderboardFilter === 'current' ? '#2563eb' : 'transparent',
                  border: 'none',
                  color: leaderboardFilter === 'current' ? '#ffffff' : '#94a3b8',
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {puzzleType}
              </button>
              <button
                onClick={() => setLeaderboardFilter('all')}
                style={{
                  background: leaderboardFilter === 'all' ? '#2563eb' : 'transparent',
                  border: 'none',
                  color: leaderboardFilter === 'all' ? '#ffffff' : '#94a3b8',
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Tất cả
              </button>
            </div>
          </div>

          {/* Thanh trạng thái Cloud Backend Global Sync */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            marginBottom: '6px',
            borderRadius: '6px',
            background: '#090f1d',
            border: '1px solid #16223b',
            fontSize: '0.68rem'
          }}>
            <span style={{
              color: cloudStatus === 'connected' ? '#38bdf8' : (cloudStatus === 'error' ? '#f87171' : '#94a3b8'),
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <span>☁️</span>
              <span>
                {cloudStatus === 'connected'
                  ? 'Cloud Global: Đã đồng bộ Supabase (Anti-Cheat SHA-256)'
                  : cloudStatus === 'syncing'
                    ? 'Đang đồng bộ kỷ lục toàn cầu...'
                    : cloudStatus === 'error'
                      ? 'Cloud: Chưa tạo bảng SQL hoặc lỗi kết nối'
                      : 'Chế độ: Local + Anti-Bot (Gắn Cloud trong Quản trị)'}
              </span>
            </span>

            {isCloudConfigured() && (
              <button
                type="button"
                onClick={() => syncLeaderboardFromCloud(activeBoardId)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '0 4px'
                }}
              >
                🔄 Đồng bộ
              </button>
            )}
          </div>

          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: leaderboardFilter === 'all'
              ? (isKhoaAdmin ? '28px 40px 1fr 62px 62px 22px' : '28px 40px 1fr 64px 64px')
              : (isKhoaAdmin ? '28px 1fr 65px 65px 22px' : '28px 1fr 68px 68px'),
            padding: '6px 8px',
            fontSize: '0.72rem',
            color: '#64748b',
            borderBottom: '1px solid #192642',
            fontWeight: '600'
          }}>
            <span>#</span>
            {leaderboardFilter === 'all' && <span>Loại</span>}
            <span>Tài khoản</span>
            <span style={{ textAlign: 'right' }}>Best</span>
            <span style={{ textAlign: 'right' }}>Avg</span>
            {isKhoaAdmin && <span></span>}
          </div>

          {/* Table Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayedEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
                <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>📹🏆</div>
                <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '0.92rem', marginBottom: '6px' }}>
                  Bảng Kỷ Lục AI Hoàn Toàn Sạch
                </div>
                <p style={{ margin: '0 auto', fontSize: '0.76rem', color: '#64748b', maxWidth: '280px', lineHeight: '1.4' }}>
                  Không dùng tên mẫu, không cho phép thêm tay. Hãy <strong>Bật Camera AI</strong> và giải Rubik — hệ thống sẽ tự động nhận diện và vinh danh bạn lên Top 1!
                </p>
              </div>
            ) : (
              displayedEntries.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: leaderboardFilter === 'all'
                      ? (isKhoaAdmin ? '28px 40px 1fr 62px 62px 22px' : '28px 40px 1fr 64px 64px')
                      : (isKhoaAdmin ? '28px 1fr 65px 65px 22px' : '28px 1fr 68px 68px'),
                    padding: '8px 8px',
                    borderBottom: '1px solid #111c34',
                    fontSize: '0.8rem',
                    alignItems: 'center',
                    background: index === 0 ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{
                    fontWeight: '700',
                    color: index === 0 ? '#f59e0b' : '#38bdf8'
                  }}>
                    {index + 1}
                  </span>

                  {leaderboardFilter === 'all' && (
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.1)',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      width: 'fit-content'
                    }}>
                      {item.puzzleType || '3x3'}
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                    <span
                      title={item.name}
                      style={{
                        color: index === 0 ? '#f8fafc' : '#cbd5e1',
                        fontWeight: index === 0 ? '700' : '600',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.name}
                    </span>
                    {item.verified && (
                      <span
                        onClick={() => isKhoaAdmin && handleToggleVerifyEntry(item.id)}
                        title={isKhoaAdmin ? "Bấm để đổi trạng thái xác minh" : "Kỷ lục đã được AI xác minh"}
                        style={{
                          flexShrink: 0,
                          fontSize: '0.6rem',
                          color: '#4ade80',
                          background: 'rgba(34, 197, 94, 0.1)',
                          padding: '1px 3px',
                          borderRadius: '3px',
                          cursor: isKhoaAdmin ? 'pointer' : 'default'
                        }}
                      >
                        ✓ AI
                      </span>
                    )}
                  </div>

                  <span style={{
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    color: '#38bdf8'
                  }}>
                    {typeof item.best === 'number' ? `${item.best}s` : item.best}
                  </span>

                  <span style={{
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    color: '#94a3b8'
                  }}>
                    {typeof item.avg === 'number' ? `${item.avg}s` : item.avg}
                  </span>

                  {isKhoaAdmin && (
                    <button
                      onClick={() => handleDeleteEntry(item.id)}
                      title="Xóa kỷ lục này (Quyền Quản Trị)"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        )}
        {/* === TAB RIÊNG CHO MOBILE: KHỐI 3D & CAMERA AI === */}
        {isMobile && mobileTab === '3d' && gameMode !== 'solo' && (
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            width: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#38bdf8' }}>
                🧊 Khối Rubik 3D & Camera AI
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Khối: {PUZZLE_CONFIGS[puzzleType]?.name}
              </span>
            </div>

            {/* Khung 3D tương tác cho mobile */}
            <div style={{
              width: '100%',
              height: '240px',
              background: '#070b14',
              borderRadius: '12px',
              border: '1px solid #1e293b',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <Rubik3DView
                dim={currentDim}
                detectedColors={detectedColors}
                scannedFaces={scannedFaces}
                lastMove={lastMoveDetected}
                width={330}
                height={240}
              />
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                right: '8px',
                textAlign: 'center',
                fontSize: '0.72rem',
                color: '#64748b',
                background: 'rgba(15, 23, 42, 0.75)',
                padding: '4px 8px',
                borderRadius: '6px'
              }}>
                👆 Dùng 1 ngón tay xoay 360° • Dùng 2 ngón tay thu phóng
              </div>
            </div>

            {/* Điều khiển Camera trên mobile */}
            <div style={{
              width: '100%',
              background: '#111c34',
              borderRadius: '10px',
              padding: '12px',
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: cameraActive ? '#4ade80' : '#94a3b8' }}>
                  {cameraActive ? '🟢 Camera AI Đang Bật' : '🔴 Camera Đang Tắt'}
                </span>
                <button
                  onClick={toggleCamera}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: cameraActive ? '#ef4444' : '#22c55e',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  {cameraActive ? 'Tắt Cam' : 'Bật Cam'}
                </button>
              </div>

              {cameraActive && (
                <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
                  <button
                    onClick={flipCamera}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#38bdf8',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🔄</span>
                    <span>Đổi Sang {cameraFacingMode === 'user' ? 'Camera Sau' : 'Camera Trước'}</span>
                  </button>
                </div>
              )}

              {/* Camera Video preview */}
              {cameraActive && (
                <div style={{
                  width: '100%',
                  maxWidth: '280px',
                  height: '160px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: cameraHealth.isHealthy ? '2px solid #22c55e' : '2px solid #ef4444',
                  position: 'relative',
                  background: '#000'
                }}>
                  <video
                    ref={attachVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (FIXED) */}
      {isMobile && gameMode !== 'solo' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#0d1629',
          borderTop: '1px solid #1a2a4c',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '6px 8px env(safe-area-inset-bottom, 8px) 8px',
          zIndex: 9999,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.6)'
        }}>
          {[
            { id: 'timer', label: 'Đồng Hồ', icon: '⏱️' },
            { id: 'stats', label: `Lịch Sử (${solves.length})`, icon: '📊' },
            { id: 'leaderboard', label: 'Bảng Điểm', icon: '🏆' },
            { id: '3d', label: '3D & Cam', icon: '🧊' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              style={{
                flex: 1,
                padding: '6px 4px',
                border: 'none',
                borderRadius: '8px',
                background: mobileTab === tab.id ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                color: mobileTab === tab.id ? '#ffffff' : '#64748b',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                cursor: 'pointer',
                fontSize: '0.68rem',
                fontWeight: mobileTab === tab.id ? '700' : '500',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: isKhoaAdmin ? '1px solid #f59e0b' : 'none',
              borderRadius: '8px',
              background: currentUser.email !== 'guest@cuber.vn' ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
              color: isKhoaAdmin ? '#fbbf24' : (currentUser.email !== 'guest@cuber.vn' ? '#38bdf8' : '#94a3b8'),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              cursor: 'pointer',
              fontSize: '0.68rem',
              fontWeight: '700'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{isKhoaAdmin ? '👑' : '👤'}</span>
            <span>{currentUser.email === 'guest@cuber.vn' ? 'Đăng Nhập' : 'Tài Khoản'}</span>
          </button>
        </div>
      )}


      {/* ==========================================
          MODAL: DASHBOARD THỐNG KÊ
      ========================================== */}
      {showDashboardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '720px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowDashboardModal(false)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.3rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <span style={{ fontSize: '1.6rem' }}>📊</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                  Dashboard Thống Kê & Phân Tích Kỷ Lục
                </h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  Dữ liệu phân tích tiến độ luyện tập speedcubing của bạn
                </p>
              </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Best Single ({puzzleType})</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#38bdf8' }}>{bestTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Current ao5</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Current ao12</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Tổng Lượt Giải</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc' }}>
                  {solves.length} lượt
                </div>
              </div>
            </div>

            {/* SVG Line Chart */}
            <div style={{ background: '#111c34', padding: '16px', borderRadius: '12px', border: '1px solid #1a2a4c', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc' }}>
                  📈 Biểu Đồ Xu Hướng Thời Gian ({puzzleType})
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {currentSolves.length} lượt giải gần nhất
                </span>
              </div>

              {currentSolves.length < 2 ? (
                <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.8rem' }}>
                  Cần tối thiểu 2 lượt giải {puzzleType} để vẽ biểu đồ tiến độ.
                </div>
              ) : (
                <div style={{ width: '100%', height: '150px', position: 'relative' }}>
                  {(() => {
                    const rev = [...currentSolves].reverse();
                    const times = rev.map(s => s.time);
                    const minT = Math.min(...times);
                    const maxT = Math.max(...times);
                    const range = Math.max(maxT - minT, 1);
                    const chartW = 600;
                    const chartH = 120;

                    const points = times.map((t, idx) => {
                      const x = (idx / (times.length - 1)) * chartW;
                      const y = chartH - ((t - minT) / range) * (chartH - 20) - 10;
                      return `${x},${y}`;
                    }).join(' ');

                    return (
                      <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        <line x1="0" y1="10" x2={chartW} y2="10" stroke="#192642" strokeDasharray="4" />
                        <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#192642" strokeDasharray="4" />
                        <line x1="0" y1={chartH - 10} x2={chartW} y2={chartH - 10} stroke="#192642" strokeDasharray="4" />

                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points}
                        />

                        {times.map((t, idx) => {
                          const x = (idx / (times.length - 1)) * chartW;
                          const y = chartH - ((t - minT) / range) * (chartH - 20) - 10;
                          const isBest = t === minT;
                          return (
                            <circle
                              key={idx}
                              cx={x}
                              cy={y}
                              r={isBest ? 5 : 3.5}
                              fill={isBest ? '#facc15' : '#2563eb'}
                              stroke="#ffffff"
                              strokeWidth={isBest ? 2 : 1}
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Bảng so sánh 4 khối */}
            <div style={{ background: '#111c34', padding: '16px', borderRadius: '12px', border: '1px solid #1a2a4c' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '12px' }}>
                🏆 Tổng Kết Thành Tích Cả 4 Khối
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {Object.values(PUZZLE_CONFIGS).map(p => {
                  const pSolves = solves.filter(s => (s.puzzleType || '3x3') === p.id);
                  const pBest = pSolves.length > 0 ? Math.min(...pSolves.map(s => s.time)).toFixed(2) : '--';
                  const pAo5 = calculateAo(pSolves, 5);

                  return (
                    <div
                      key={p.id}
                      onClick={() => { handleSelectPuzzle(p.id); setShowDashboardModal(false); }}
                      style={{
                        background: puzzleType === p.id ? 'rgba(37, 99, 235, 0.15)' : '#090f1d',
                        border: puzzleType === p.id ? '1px solid #38bdf8' : '1px solid #192642',
                        borderRadius: '8px',
                        padding: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc' }}>{p.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{pSolves.length} lượt</div>
                      <div style={{ marginTop: '6px', fontSize: '1.1rem', fontWeight: '800', color: '#38bdf8' }}>
                        {pBest !== '--' ? `${pBest}s` : '--'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                        ao5: {pAo5 !== '--' ? `${pAo5}s` : '--'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ĐĂNG NHẬP TUYỂN THỦ (ẨN HOÀN TOÀN ADMIN)
      ========================================== */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '400px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '16px',
            padding: '26px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowAuthModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              Đăng Nhập Tài Khoản
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#64748b' }}>
              Nhập tên và email để lưu kỷ lục của bạn lên bảng xếp hạng.
            </p>

            {currentUser.email !== 'guest@cuber.vn' && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: isKhoaAdmin ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                border: isKhoaAdmin ? '1px solid #f59e0b' : '1px solid #38bdf8',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: isKhoaAdmin ? '#fbbf24' : '#38bdf8' }}>
                    {isKhoaAdmin ? '👑 Quản Trị Viên Khoa' : currentUser.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {currentUser.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleLogout();
                    setShowAuthModal(false);
                  }}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    color: '#ffffff',
                    padding: '5px 12px',
                    borderRadius: '5px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Tên hiển thị / Nickname:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: khoa.tt2611758"
                  value={inputUserName}
                  onChange={(e) => setInputUserName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    background: '#111c34',
                    border: '1px solid #1a2a4c',
                    color: '#f8fafc',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Email:
                </label>
                <input
                  type="email"
                  placeholder="Ví dụ: khoa.tt2611758@sis.hust.edu.vn"
                  value={inputUserEmail}
                  onChange={(e) => setInputUserEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    background: '#111c34',
                    border: '1px solid #1a2a4c',
                    color: '#f8fafc',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '7px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Xác Nhận Đăng Nhập
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: BẢNG QUẢN TRỊ ĐỘC QUYỀN CỦA KHOA (YÊU CẦU CÓ CAM)
      ========================================== */}
      {showAdminPanelModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '560px',
            backgroundColor: '#0d1629',
            border: '1px solid #f59e0b88',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.85)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowAdminPanelModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.6rem' }}>👑</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f59e0b' }}>
                  Bảng Quản Trị Độc Quyền Của Khoa
                </h2>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
                  Xác thực: {ADMIN_EMAIL} • Camera AI: 🟢 Đã xác thực
                </p>
              </div>
            </div>

            {/* HỆ THỐNG QUẢN TRỊ CHỐNG GIAN LẬN */}
            <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #38bdf844' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#38bdf8' }}>
                🛡️ 1. Quản Trị Hệ Thống Chống Gian Lận (Anti-Cheat)
              </h4>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.74rem', color: '#94a3b8', lineHeight: '1.4' }}>
                Cơ chế bảo mật: Bắt buộc 100% người chơi phải <strong>Bật Camera AI</strong> và giải trực tiếp. Hệ thống tự động nhận diện và cập nhật người giải nhanh nhất lên Top 1, tuyệt đối không dùng dữ liệu giả hay thêm tay.
              </p>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleClearCurrentBoard}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  🧹 Xóa Sạch Kỷ Lục Bảng "{currentBoard?.title}"
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveAdminSettings}>
              {/* TÙY CHỈNH TIÊU ĐỀ HỆ THỐNG */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#38bdf8' }}>
                  ⚙️ 2. Tùy chỉnh tiêu đề hiển thị
                </h4>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Tiêu đề chính:
                  </label>
                  <input
                    type="text"
                    value={editCompTitle}
                    onChange={(e) => setEditCompTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Tiêu đề phụ:
                  </label>
                  <input
                    type="text"
                    value={editCompSub}
                    onChange={(e) => setEditCompSub(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              {/* ĐỘ NHẠY PHÍM SPACEBAR */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#4ade80' }}>
                  ⏱️ 3. Thời gian giữ phím Spacebar để Ready (Xanh lá)
                </h4>

                <select
                  value={editSpaceHoldMs}
                  onChange={(e) => setEditSpaceHoldMs(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '5px',
                    background: '#090f1d',
                    border: '1px solid #192642',
                    color: '#f8fafc',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value={150}>150ms — Rất nhạy (Chạm nhanh là chạy)</option>
                  <option value={280}>280ms — Tiêu chuẩn cân bằng (Mặc định)</option>
                  <option value={350}>350ms — Chuẩn WCA quốc tế (csTimer)</option>
                  <option value={550}>550ms — Giữ chắc tay (Tránh bấm nhầm)</option>
                </select>
              </div>

              {/* KẾT NỐI CLOUD BACKEND SUPABASE + SERVER ANTI-CHEAT */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '18px', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#38bdf8' }}>
                    ☁️ 4. Kết Nối Cloud Backend (Supabase + Anti-Cheat Server)
                  </h4>
                  <button
                    type="button"
                    onClick={handleCopySupabaseSql}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '5px',
                      background: copiedSql ? '#16a34a' : '#1e293b',
                      border: '1px solid #38bdf8',
                      color: '#f8fafc',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {copiedSql ? '✅ Đã Copy SQL!' : '📋 Copy SQL Tạo Bảng + Trigger'}
                  </button>
                </div>

                <p style={{ margin: '0 0 10px 0', fontSize: '0.73rem', color: '#94a3b8', lineHeight: 1.4 }}>
                  Đồng bộ Bảng Xếp Hạng Toàn Cầu 24/7 (ngay cả khi bạn tắt máy) kèm PostgreSQL Trigger kiểm tra chữ ký SHA-256 & chặn gian lận từ phía Server.
                </p>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Supabase Project URL:
                  </label>
                  <input
                    type="text"
                    placeholder="https://xyzcompany.supabase.co"
                    value={cloudUrlInput}
                    onChange={(e) => setCloudUrlInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Supabase Anon Public Key:
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={cloudKeyInput}
                    onChange={(e) => setCloudKeyInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleTestAndSaveCloud}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔌 Kiểm tra & Lưu Kết Nối Cloud
                  </button>
                </div>

                {cloudTestNotice && (
                  <div style={{
                    marginTop: '8px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: '600',
                    background: cloudTestNotice.type === 'success'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : cloudTestNotice.type === 'error'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(56, 189, 248, 0.15)',
                    color: cloudTestNotice.type === 'success'
                      ? '#4ade80'
                      : cloudTestNotice.type === 'error'
                        ? '#f87171'
                        : '#38bdf8'
                  }}>
                    {cloudTestNotice.text}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdminPanelModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Lưu Tùy Chỉnh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: LẬP BẢNG MỚI
      ========================================== */}
      {showNewBoardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            width: '90%',
            maxWidth: '400px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              ➕ Lập Bảng Xếp Hạng Mới
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b' }}>
              Tạo một bảng đấu riêng cho bạn bè, câu lạc bộ hoặc giải thi đấu của bạn.
            </p>

            <form onSubmit={handleCreateNewBoard}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Tên bảng xếp hạng:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bảng Đấu Lớp CNTT, Cá Nhân 2026..."
                  value={newBoardTitle}
                  onChange={(e) => setNewBoardTitle(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#111c34',
                    border: '1px solid #1a2a4c',
                    color: '#f8fafc',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Nội dung bảng ban đầu:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boardMode"
                      checked={newBoardMode === 'empty'}
                      onChange={() => setNewBoardMode('empty')}
                    />
                    Bảng trống
                  </label>

                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boardMode"
                      checked={newBoardMode === 'clone'}
                      onChange={() => setNewBoardMode('clone')}
                    />
                    Sao chép từ bảng hiện tại
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewBoardModal(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Tạo Bảng Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <HumanCheckModal
        open={showHumanCheck}
        onVerified={handleHumanVerified}
        onCancel={() => setShowHumanCheck(false)}
      />

      {/* ==========================================
          MODAL: MÔ HÌNH 3D RUBIK INTERACTIVE
      ========================================== */}
      {show3DPreviewModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '440px',
            backgroundColor: '#0d1629',
            border: '1px solid #38bdf866',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🧊</span>
                <div>
                  <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1.05rem', color: '#f8fafc' }}>
                    Mô Hình 3D Khối {PUZZLE_CONFIGS[puzzleType]?.name}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Three.js WebGL • Hỗ trợ xoay 360 độ
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShow3DPreviewModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <Rubik3DView
              dim={currentDim}
              detectedColors={detectedColors}
              scannedFaces={scannedFaces}
              lastMove={lastMoveDetected}
              trackingBox={trackingBox}
              modelVerification={model3DVerification}
              width={340}
              height={260}
            />

            <div style={{
              marginTop: '14px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#111c34',
              border: '1px solid #1a2a4c',
              fontSize: '0.75rem',
              color: '#94a3b8',
              textAlign: 'center',
              width: '100%'
            }}>
              🖐️ Dùng chuột (hoặc vuốt trên điện thoại) để giữ và kéo xoay khối 3D theo mọi góc nhìn.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
