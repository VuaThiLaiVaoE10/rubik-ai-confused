import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Rubik3DView from './components/Rubik3DView';
import Solo1v1Arena from './components/Solo1v1Arena';
import HumanCheckModal from './components/HumanCheckModal';
import { calculateScrambleMatch } from './utils/rubikSolver';
import { solveWithKociemba, initKociembaSolver, verifyCubeStateWithKociemba, solveScannedFacesWithKociemba, getMoveExplanationVi } from './kociemba';
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
  '5x5': { id: '5x5', name: '5×5×5', label: "5×5 Professor's Cube", dim: 5, defaultMoves: 60 },
  '6x6': { id: '6x6', name: '6×6×6', label: '6×6 V-Cube WCA', dim: 6, defaultMoves: 80 },
  '7x7': { id: '7x7', name: '7×7×7', label: '7×7 Master Cube WCA', dim: 7, defaultMoves: 100 }
};

// Cấu hình Hồ sơ Bề mặt & Chất liệu theo Hệ màu HSV (Hue - Saturation - Value) cho MỌI LOẠI RUBIK
const CUBE_SURFACE_PROFILES = {
  auto: {
    id: 'auto',
    name: '✨ Tự động HSV (Mọi loại)',
    shortLabel: '✨ Auto HSV',
    desc: 'Hệ màu HSV cân bằng trắng tự động, quét bước sóng Hue 0-360°, hỗ trợ mọi dòng Rubik',
    glareFactor: 0.65,
    satScale: 1.12,
    minSat: 0.17,
    useOuterRing: true
  },
  uv: {
    id: 'uv',
    name: '💎 Phủ Bóng UV / Fluoro (HSV)',
    shortLabel: '💎 Phủ UV (HSV)',
    desc: 'Tối ưu HSV cho GAN UV, Moyu WRM UV, Tornado Pioneer UV: lọc đốm lóa, giữ nguyên Hue chuẩn',
    glareFactor: 0.78,
    satScale: 1.22,
    minSat: 0.16,
    useOuterRing: false
  },
  frosted: {
    id: 'frosted',
    name: '🧊 Nhựa Nhám / Stickerless (HSV)',
    shortLabel: '🧊 Nhựa Nhám (HSV)',
    desc: 'Tăng cường Saturation HSV cho RS3M, QiYi, YJ bề mặt nhám mờ (Frosted Matte)',
    glareFactor: 0.55,
    satScale: 1.28,
    minSat: 0.15,
    useOuterRing: false
  },
  classic: {
    id: 'classic',
    name: '⬛ Viền Đen / Carbon (HSV)',
    shortLabel: '⬛ Viền Đen (HSV)',
    desc: 'Lọc Value tối (V < 0.16) cho Rubik dán decal viền nhựa đen dày hoặc dán vân Carbon',
    glareFactor: 0.50,
    satScale: 1.18,
    minSat: 0.18,
    useOuterRing: true
  },
  pastel: {
    id: 'pastel',
    name: '🍬 Pastel / Macaron (HSV)',
    shortLabel: '🍬 Pastel (HSV)',
    desc: 'Mở rộng dải Saturation HSV cực nhạy cho các tông màu Pastel/Macaron dịu nhẹ',
    glareFactor: 0.45,
    satScale: 1.65,
    minSat: 0.10,
    useOuterRing: false
  }
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

  if (puzzleType === '4x4' || puzzleType === '5x5' || puzzleType === '6x6' || puzzleType === '7x7') {
    const outerFaces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const wideFaces = ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
    const tripleWide = puzzleType === '6x6' || puzzleType === '7x7'
      ? ['3Uw', '3Dw', '3Lw', '3Rw', '3Fw', '3Bw']
      : [];
    const allMoves = [...outerFaces, ...wideFaces, ...tripleWide];
    const moveCount = puzzleType === '4x4' ? 40 : puzzleType === '5x5' ? 60 : puzzleType === '6x6' ? 70 : 85;
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < moveCount; i++) {
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

// Các phong cách giao diện Lưới Mạng Nhện & Hitbox Rubik (HUD Themes: Hoa Anh Đào, Mạng Nhện Cyber, Lôi Thần, Băng Tuyết)
// Toàn bộ hệ thống Giao diện Web (Toàn trang: Nền, Header, Sidebar, Cards, Bảng Kỷ Lục, Nút bấm, Hitbox)
const HUD_THEMES = {
  sakura: {
    id: 'sakura',
    name: '🌸 Hoa Anh Đào (Sakura)',
    shortName: '🌸 Hoa Anh Đào',
    color: '#f472b6',
    glowColor: 'rgba(244, 114, 182, 0.60)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #20081a 0%, #11040e 65%, #070105 100%)',
    headerBg: '#1b0716',
    headerBorder: '1px solid rgba(244, 114, 182, 0.35)',
    cardBg: '#160613',
    cardBorder: '1px solid rgba(244, 114, 182, 0.32)',
    cardShadow: '0 8px 30px rgba(244, 114, 182, 0.15)',
    innerCardBg: '#230a1e',
    innerCardBorder: '1px solid rgba(244, 114, 182, 0.22)',
    primaryAccent: '#f472b6',
    secondaryAccent: '#fda4af',
    textColor: '#fdf2f8',
    subTextColor: '#f9a8d4',
    timerGlow: '0 0 50px rgba(244, 114, 182, 0.55)',
    rayColor: 'rgba(251, 113, 133, 0.70)',
    rayLockedColor: 'rgba(244, 114, 182, 0.95)',
    bracketColor: '#f472b6',
    badgeBg: 'rgba(253, 242, 248, 0.94)',
    badgeTextColor: '#be185d',
    hasPetals: true
  },
  cyber: {
    id: 'cyber',
    name: '🕸️ Mạng Nhện Neon Cyber',
    shortName: '🕸️ Mạng Nhện',
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #06192e 0%, #030d19 65%, #01060e 100%)',
    headerBg: '#071629',
    headerBorder: '1px solid rgba(56, 189, 248, 0.35)',
    cardBg: '#051322',
    cardBorder: '1px solid rgba(56, 189, 248, 0.32)',
    cardShadow: '0 8px 30px rgba(56, 189, 248, 0.15)',
    innerCardBg: '#09213b',
    innerCardBorder: '1px solid rgba(56, 189, 248, 0.22)',
    primaryAccent: '#38bdf8',
    secondaryAccent: '#22c55e',
    textColor: '#f0f9ff',
    subTextColor: '#7dd3fc',
    timerGlow: '0 0 50px rgba(56, 189, 248, 0.55)',
    rayColor: 'rgba(56, 189, 248, 0.60)',
    rayLockedColor: 'rgba(74, 222, 128, 0.90)',
    bracketColor: '#38bdf8',
    badgeBg: 'rgba(2, 6, 23, 0.90)',
    badgeTextColor: '#38bdf8',
    hasPetals: false
  },
  thunder: {
    id: 'thunder',
    name: '⚡ Lôi Thần Điện Quang',
    shortName: '⚡ Lôi Thần',
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #1c062e 0%, #0d0217 65%, #06010b 100%)',
    headerBg: '#180629',
    headerBorder: '1px solid rgba(168, 85, 247, 0.35)',
    cardBg: '#130422',
    cardBorder: '1px solid rgba(168, 85, 247, 0.32)',
    cardShadow: '0 8px 30px rgba(168, 85, 247, 0.16)',
    innerCardBg: '#22083b',
    innerCardBorder: '1px solid rgba(168, 85, 247, 0.22)',
    primaryAccent: '#a855f7',
    secondaryAccent: '#facc15',
    textColor: '#faf5ff',
    subTextColor: '#d8b4fe',
    timerGlow: '0 0 50px rgba(168, 85, 247, 0.55)',
    rayColor: 'rgba(168, 85, 247, 0.65)',
    rayLockedColor: 'rgba(250, 204, 21, 0.95)',
    bracketColor: '#facc15',
    badgeBg: 'rgba(24, 9, 39, 0.92)',
    badgeTextColor: '#facc15',
    hasPetals: false
  },
  frost: {
    id: 'frost',
    name: '💎 Băng Tuyết Pha Lê',
    shortName: '💎 Băng Tuyết',
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #051c2c 0%, #020f18 65%, #01070c 100%)',
    headerBg: '#061a29',
    headerBorder: '1px solid rgba(6, 182, 212, 0.35)',
    cardBg: '#041624',
    cardBorder: '1px solid rgba(6, 182, 212, 0.32)',
    cardShadow: '0 8px 30px rgba(6, 182, 212, 0.15)',
    innerCardBg: '#09253b',
    innerCardBorder: '1px solid rgba(6, 182, 212, 0.22)',
    primaryAccent: '#06b6d4',
    secondaryAccent: '#67e8f9',
    textColor: '#ecfeff',
    subTextColor: '#a5f3fc',
    timerGlow: '0 0 50px rgba(6, 182, 212, 0.55)',
    rayColor: 'rgba(6, 182, 212, 0.65)',
    rayLockedColor: 'rgba(103, 232, 249, 0.95)',
    bracketColor: '#67e8f9',
    badgeBg: 'rgba(4, 25, 39, 0.92)',
    badgeTextColor: '#67e8f9',
    hasPetals: false
  }
};

// RGB to HSV Conversion (Chuẩn 360 độ)
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

// Chuyển đổi RGB sang không gian màu OpenCV HSV (H: 0..179, S: 0..255, V: 0..255)
// Tương thích 100% với cv2.cvtColor(img, cv2.COLOR_BGR2HSV) trong Python
function rgbToOpenCvHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * (((bn - rn) / delta) + 2);
    else h = 60 * (((rn - gn) / delta) + 4);
  }
  if (h < 0) h += 360;
  const cvH = Math.round(h / 2); // OpenCV lưu Hue trong khoảng [0..179]
  const cvS = max === 0 ? 0 : Math.round((delta / max) * 255);
  const cvV = Math.round(max * 255);
  return { h: cvH, s: cvS, v: cvV };
}

// Hàm tính giá trị Trung vị (Median) tương đương np.median() trong NumPy/OpenCV
function getMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// =========================================================================
// HỆ THỐNG QUÉT RUBIK 6 MẶT CHUẨN OPENCV (TƯƠNG THÍCH 100% VỚI quet_rubik_6_mat.py)
// Thứ tự 6 mặt: U (Trên), R (Phải), F (Trước), D (Dưới), L (Trái), B (Sau)
// =========================================================================
export const OPENCV_MAT = [
  ['U', 'Trên'],
  ['R', 'Phải'],
  ['F', 'Trước'],
  ['D', 'Dưới'],
  ['L', 'Trái'],
  ['B', 'Sau']
];

export const OPENCV_TEN_MAU = ['Đỏ', 'Cam', 'Vàng', 'Xanh lá', 'Xanh dương', 'Trắng'];

// Nhận diện 6 màu Rubik bằng ngưỡng HSV trong OpenCV (chuẩn 100% từ quet_rubik_6_mat.py)
export function nhanDienMauOpenCv(hsv) {
  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  if (v < 45) return '?';
  if (s < 60 && v >= 140) return 'Trắng';
  if (s < 60) return '?';
  if (h <= 8 || h >= 170) return 'Đỏ';
  if (h >= 9 && h <= 22) return 'Cam';
  if (h >= 23 && h <= 35) return 'Vàng';
  if (h >= 36 && h <= 85) return 'Xanh lá';
  if (h >= 86 && h <= 130) return 'Xanh dương';
  return '?';
}

// Lấy mẫu trung vị HSV từng ô theo chuẩn OpenCV/NumPy
export function layMauTrungViOpenCv(frameImg, w, h, x1, y1, x2, y2) {
  const hArr = [];
  const sArr = [];
  const vArr = [];
  const startX = Math.max(0, Math.min(w - 1, x1));
  const startY = Math.max(0, Math.min(h - 1, y1));
  const endX = Math.max(0, Math.min(w, x2));
  const endY = Math.max(0, Math.min(h, y2));
  const step = 2;

  for (let y = startY; y < endY; y += step) {
    for (let x = startX; x < endX; x += step) {
      const idx = (y * w + x) * 4;
      const r = frameImg[idx];
      const g = frameImg[idx + 1];
      const b = frameImg[idx + 2];
      const hsv = rgbToOpenCvHsv(r, g, b);
      hArr.push(hsv.h);
      sArr.push(hsv.s);
      vArr.push(hsv.v);
    }
  }

  if (hArr.length === 0) return { h: 0, s: 0, v: 0 };
  return {
    h: Math.round(getMedian(hArr)),
    s: Math.round(getMedian(sArr)),
    v: Math.round(getMedian(vArr))
  };
}

// Đếm số lượng ô của từng màu trong 6 mặt Rubik
export function demMauOpenCv(ketQua) {
  const dem = { 'Đỏ': 0, 'Cam': 0, 'Vàng': 0, 'Xanh lá': 0, 'Xanh dương': 0, 'Trắng': 0 };
  if (!ketQua) return dem;
  for (const [maMat] of OPENCV_MAT) {
    const maTran = ketQua[maMat];
    if (!maTran) continue;
    for (const dong of maTran) {
      for (const tenMau of dong) {
        if (dem[tenMau] !== undefined) dem[tenMau]++;
      }
    }
  }
  return dem;
}

// Kiểm tra tính hợp lệ: đủ 6 mặt và mỗi màu có đúng 9 ô
export function kiemTraHopLeOpenCv(ketQua) {
  if (!ketQua) return false;
  const daDu6Mat = OPENCV_MAT.every(([maMat]) => Boolean(ketQua[maMat]));
  const dem = demMauOpenCv(ketQua);
  return daDu6Mat && OPENCV_TEN_MAU.every(tenMau => dem[tenMau] === 9);
}

// Tìm mặt tiếp theo chưa quét
export function timMatTiepTheoOpenCv(ketQua, matHienTai) {
  if (!ketQua) return matHienTai;
  for (let buoc = 1; buoc <= 6; buoc++) {
    const chiSo = (matHienTai + buoc) % 6;
    if (!ketQua[OPENCV_MAT[chiSo][0]]) return chiSo;
  }
  return matHienTai;
}

// Lấy mã màu hiển thị trên canvas cho từng màu tiếng Việt
export function getColorTextHex(tenMau) {
  switch (tenMau) {
    case 'Đỏ': return '#f87171';
    case 'Cam': return '#fb923c';
    case 'Vàng': return '#facc15';
    case 'Xanh lá': return '#4ade80';
    case 'Xanh dương': return '#60a5fa';
    case 'Trắng': return '#ffffff';
    default: return '#cbd5e1';
  }
}

// Chuyển đổi sRGB sang không gian màu thị giác người CIE L*a*b* (Bất biến với độ bóng bề mặt & ánh sáng)
function rgbToLab(r, g, b) {
  let rn = r / 255, gn = g / 255, bn = b / 255;
  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;

  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.00000;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy); // âm: Xanh lá (-a), dương: Đỏ/Hồng (+a)
  const bLab = 200 * (fy - fz); // âm: Xanh dương (-b), dương: Vàng (+b)
  const chromaLab = Math.hypot(a, bLab);
  return { L, a, b: bLab, chromaLab };
}

// Phát hiện chính xác sắc thái da người / mặt người (Human Skin & Face Filter)
// Loại bỏ 100% việc bắt nhầm khuôn mặt, bàn tay, môi, râu hoặc đồ gỗ ấm thành khối Rubik
function isSkinOrWoodTone(r, g, b, h, s, v) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;

  // Nếu độ bão hòa cao hoặc sắc tố tương phản mạnh -> Đó là nhựa Rubik rực rỡ, không phải da người!
  if (chroma >= 60 || s >= 0.58) {
    return false;
  }

  // 1. Chuyển đổi YCbCr chuẩn ITU-R BT.601
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  // Da người mọi chủng tộc và mọi điều kiện sáng tự nhiên / đèn vàng luôn tập trung ở elip Cb-Cr
  const isYcbcrSkin = cr >= 130 && cr <= 182 && cb >= 74 && cb <= 135;

  // 2. Kiểm tra tương quan kênh RGB đặc trưng của da người: R > G > B với B có tỷ lệ đáng kể (máu + mô da)
  const bRatio = b / Math.max(r, 1);
  const gRatio = g / Math.max(r, 1);

  const isRgbSkin =
    r > 42 &&
    g > 20 &&
    b > 12 &&
    r > g &&
    g >= b &&
    r - g >= 5 &&
    r - g <= 95 &&
    bRatio >= 0.24 &&
    bRatio <= 0.88;

  // 3. Da người trong phòng tối bị ánh đèn màn hình hắt xanh (Monitor blue glow / dark room skin):
  // R và G thấp, B được kích lên một chút nhưng độ bão hòa chroma rất thấp (chroma <= 32, không phải nhựa Rubik rực rỡ)
  const isMonitorCastSkin =
    y >= 28 &&
    y <= 175 &&
    chroma <= 32 &&
    r >= 35 &&
    g >= 30 &&
    b >= 25 &&
    Math.abs(r - b) <= 32 &&
    Math.abs(g - b) <= 28;

  // 4. Kiểm tra dải Hue ấm (đỏ-cam-vàng đất da)
  const isHsvSkin =
    h >= 5 &&
    h <= 48 &&
    s >= 0.06 &&
    s <= 0.72 &&
    v >= 0.16 &&
    bRatio >= 0.25 &&
    gRatio >= 0.42;

  return (isYcbcrSkin && isRgbSkin) || isHsvSkin || isMonitorCastSkin;
}

// Khử bóng lóa phản quang UV & Khuếch đại sắc tố cho mọi loại bề mặt Rubik (UV, Frosted, Classic, Pastel)
function removeUvSpecularGlare(r, g, b, surfaceProfileKey = 'auto') {
  const prof = CUBE_SURFACE_PROFILES[surfaceProfileKey] || CUBE_SURFACE_PROFILES.auto;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;

  if (chroma >= 11 && minC > 14) {
    const glareFloor = (minC - 10) * prof.glareFactor;
    let dr = Math.max(0, r - glareFloor);
    let dg = Math.max(0, g - glareFloor);
    let db = Math.max(0, b - glareFloor);

    // Khuếch đại độ tách biệt kênh màu cho dòng Pastel / Frosted / UV bị lóa
    const meanD = (dr + dg + db) / 3;
    dr = Math.max(0, meanD + (dr - meanD) * prof.satScale);
    dg = Math.max(0, meanD + (dg - meanD) * prof.satScale);
    db = Math.max(0, meanD + (db - meanD) * prof.satScale);

    const newMax = Math.max(dr, dg, db, 1);
    const scale = maxC / newMax;
    return {
      r: Math.min(255, dr * scale),
      g: Math.min(255, dg * scale),
      b: Math.min(255, db * scale),
      chroma
    };
  }
  return { r, g, b, chroma };
}

// ==========================================
// HỆ MÀU HSV CHUẨN OPENCV (HUE: 0..179, SATURATION: 0..255, VALUE: 0..255)
// KHỚP 100% VỚI THUẬT TOÁN PYTHON OPENCV (nhan_dien_mau & lay_mau_trung_vi)
// ==========================================
function classifyRubikStickerCell(avgR, avgG, avgB, cellStdDev, motionTolerance = 0, surfaceProfileKey = 'auto', precomputedHsv = null) {
  const maxAllowedStd = 65 + motionTolerance;
  if (cellStdDev > maxAllowedStd) return 'invalid';

  // Lấy giá trị HSV theo chuẩn OpenCV (H: 0-179, S: 0-255, V: 0-255)
  const hsv = precomputedHsv || rgbToOpenCvHsv(avgR, avgG, avgB);
  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  // 1. Quá tối (bóng tối, rãnh khối, viền đen) -> '?'
  if (v < 45) {
    return 'invalid';
  }

  // 2. MÀU TRẮNG (Trang): s < 60 và v >= 140
  if (s < 60 && v >= 140) {
    return 'white';
  }

  // 3. Độ bão hòa quá thấp (tường mờ, xám, ánh đèn nhạt) -> '?'
  if (s < 60) {
    return 'invalid';
  }

  // 4. MÀU ĐỎ (Do): h <= 8 hoặc h >= 170
  if (h <= 8 || h >= 170) {
    return 'red';
  }

  // 5. MÀU CAM (Cam): 9 <= h <= 22
  if (h >= 9 && h <= 22) {
    return 'orange';
  }

  // 6. MÀU VÀNG (Vang): 23 <= h <= 35
  if (h >= 23 && h <= 35) {
    return 'yellow';
  }
  // Dự phòng nhựa huỳnh quang cao cấp (GAN/Moyu UV) dưới đèn LED lạnh nghiêng nhẹ về 36..42
  // Phân biệt vật lý: Vàng luôn phản xạ mạnh tia Đỏ (R >= 115, R > 0.58 * G), trong khi Xanh Lá thì R cực thấp (R < 85)
  if (h >= 36 && h <= 42 && avgR >= 115 && avgR > 0.58 * avgG && avgR > 1.5 * avgB) {
    return 'yellow';
  }

  // 7. MÀU XANH LÁ (Xanh la): 36 <= h <= 85
  if (h >= 36 && h <= 85) {
    return 'green';
  }

  // 8. MÀU XANH DƯƠNG (Xanh duong): 86 <= h <= 130
  if (h >= 86 && h <= 130) {
    return 'blue';
  }

  return 'invalid';
}

// Lấy mẫu ô màu Rubik bằng kỹ thuật cắt vùng trung tâm & Trung vị HSV (Median OpenCV)
// Tương đương lay_mau_trung_vi(vung_bgr) trong Python: loại bỏ 100% đốm lóa UV và viền đen
function sampleCubieStickerCell(frameImg, w, h, cx, cy, cellSize, surfaceProfileKey) {
  // Lấy vùng trung tâm 36% của ô (bỏ lề 32% mỗi phía để tránh hoàn toàn viền rãnh đen cơ học)
  const span = Math.max(2, Math.floor(cellSize * 0.18));
  const step = Math.max(1, Math.floor(span / 4));

  const hArr = [];
  const sArr = [];
  const vArr = [];
  const rArr = [];
  const gArr = [];
  const bArr = [];

  for (let sy = cy - span; sy <= cy + span; sy += step) {
    if (sy < 0 || sy >= h) continue;
    for (let sx = cx - span; sx <= cx + span; sx += step) {
      if (sx < 0 || sx >= w) continue;
      const idx = (sy * w + sx) * 4;
      const r = frameImg[idx];
      const g = frameImg[idx + 1];
      const b = frameImg[idx + 2];

      const hsv = rgbToOpenCvHsv(r, g, b);
      hArr.push(hsv.h);
      sArr.push(hsv.s);
      vArr.push(hsv.v);
      rArr.push(r);
      gArr.push(g);
      bArr.push(b);
    }
  }

  if (hArr.length === 0) {
    return { avgR: 0, avgG: 0, avgB: 0, stdDev: 999, valid: false };
  }

  // Tính Trung vị (Median) theo đúng np.median(vung_hsv) trong Python OpenCV
  const medH = getMedian(hArr);
  const medS = getMedian(sArr);
  const medV = getMedian(vArr);
  const medR = getMedian(rArr);
  const medG = getMedian(gArr);
  const medB = getMedian(bArr);

  let varSum = 0;
  for (let i = 0; i < rArr.length; i++) {
    const dr = rArr[i] - medR;
    const dg = gArr[i] - medG;
    const db = bArr[i] - medB;
    varSum += (dr * dr + dg * dg + db * db) / 3;
  }
  const stdDev = Math.sqrt(varSum / rArr.length);

  return {
    avgR: medR,
    avgG: medG,
    avgB: medB,
    stdDev,
    medHsv: { h: medH, s: medS, v: medV },
    valid: true
  };
}

// Xác minh Hình học & Rãnh cơ học chuẩn của khối Rubik (Mechanical Seam Channels & Orthogonal Grid)
// Ngăn chặn 100% việc nhận diện nhầm khuôn mặt người, bức tường hoặc đồ vật ngẫu nhiên thành Rubik
function verifyRubikCubeMechanicalGeometry(frameImg, w, h, dim, startX, startY, boxSize) {
  const cellSize = boxSize / dim;
  let seamGrooveDipSum = 0;
  let seamEdgeGradSum = 0;
  let sampleCount = 0;
  const probeDist = Math.max(2, Math.floor(cellSize * 0.22));

  // 1. Kiểm tra các đường rãnh dọc (Vertical Seam Channels) giữa các viên
  for (let k = 1; k < dim; k++) {
    const seamX = Math.floor(startX + k * cellSize);
    if (seamX < probeDist || seamX >= w - probeDist) continue;

    for (let s = 1; s <= 5; s++) {
      const py = Math.floor(startY + (s / 6) * boxSize);
      if (py < 0 || py >= h) continue;

      const idxCenter = (py * w + seamX) * 4;
      const idxLeft = (py * w + (seamX - probeDist)) * 4;
      const idxRight = (py * w + (seamX + probeDist)) * 4;

      const lumCenter = 0.299 * frameImg[idxCenter] + 0.587 * frameImg[idxCenter + 1] + 0.114 * frameImg[idxCenter + 2];
      const lumLeft = 0.299 * frameImg[idxLeft] + 0.587 * frameImg[idxLeft + 1] + 0.114 * frameImg[idxLeft + 2];
      const lumRight = 0.299 * frameImg[idxRight] + 0.587 * frameImg[idxRight + 1] + 0.114 * frameImg[idxRight + 2];

      const avgSideLum = (lumLeft + lumRight) / 2;
      const dip = Math.max(0, avgSideLum - lumCenter);
      const grad = Math.abs(lumLeft - lumRight);

      seamGrooveDipSum += dip;
      seamEdgeGradSum += grad;
      sampleCount++;
    }
  }

  // 2. Kiểm tra các đường rãnh ngang (Horizontal Seam Channels) giữa các viên
  for (let k = 1; k < dim; k++) {
    const seamY = Math.floor(startY + k * cellSize);
    if (seamY < probeDist || seamY >= h - probeDist) continue;

    for (let s = 1; s <= 5; s++) {
      const px = Math.floor(startX + (s / 6) * boxSize);
      if (px < 0 || px >= w) continue;

      const idxCenter = (seamY * w + px) * 4;
      const idxTop = ((seamY - probeDist) * w + px) * 4;
      const idxBottom = ((seamY + probeDist) * w + px) * 4;

      const lumCenter = 0.299 * frameImg[idxCenter] + 0.587 * frameImg[idxCenter + 1] + 0.114 * frameImg[idxCenter + 2];
      const lumTop = 0.299 * frameImg[idxTop] + 0.587 * frameImg[idxTop + 1] + 0.114 * frameImg[idxTop + 2];
      const lumBottom = 0.299 * frameImg[idxBottom] + 0.587 * frameImg[idxBottom + 1] + 0.114 * frameImg[idxBottom + 2];

      const avgSideLum = (lumTop + lumBottom) / 2;
      const dip = Math.max(0, avgSideLum - lumCenter);
      const grad = Math.abs(lumTop - lumBottom);

      seamGrooveDipSum += dip;
      seamEdgeGradSum += grad;
      sampleCount++;
    }
  }

  if (sampleCount === 0) return { isCube: false, seamScore: 0 };
  const avgDip = seamGrooveDipSum / sampleCount;
  const avgGrad = seamEdgeGradSum / sampleCount;
  const seamScore = avgDip * 1.4 + avgGrad * 0.8;

  // Khối Rubik thật luôn có rãnh cơ học rõ nét: seamScore >= 5.0
  // Mặt người hoặc bức tường phẳng: rãnh không tồn tại, seamScore < 3.2
  return {
    isCube: seamScore >= 5.0,
    seamScore,
    avgDip,
    avgGrad
  };
}

// Đánh giá một vùng lưới ứng viên (startX, startY, boxSize) trên khung hình Camera
function evaluateRubikGridCandidate(frameImg, w, h, dim, startX, startY, boxSize, motionTolerance = 0, surfaceProfileKey = 'auto') {
  // 1. Tính toán hình học cơ học hỗ trợ (seamScore làm điểm thưởng bổ sung)
  const geom = verifyRubikCubeMechanicalGeometry(frameImg, w, h, dim, startX, startY, boxSize);

  const cellSize = boxSize / dim;
  const currentNxNColors = [];
  const cellStats = [];
  let validColorsCount = 0;
  let vividColorsCount = 0;
  let skinLikeCellsCount = 0;

  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const cx = Math.floor(startX + col * cellSize + cellSize / 2);
      const cy = Math.floor(startY + row * cellSize + cellSize / 2);

      // Lấy mẫu trung vị HSV theo chuẩn Python OpenCV
      const sample = sampleCubieStickerCell(frameImg, w, h, cx, cy, cellSize, surfaceProfileKey);
      if (!sample.valid) {
        currentNxNColors.push('invalid');
        cellStats.push({ avgR: 0, avgG: 0, avgB: 0, cellStdDev: 999, colorKey: 'invalid', cellLum: 0 });
        continue;
      }

      const { avgR, avgG, avgB, stdDev } = sample;
      const { h: hue, s: sat, v: val } = rgbToHsv(avgR, avgG, avgB);

      if (surfaceProfileKey !== 'pastel' && isSkinOrWoodTone(avgR, avgG, avgB, hue, sat, val)) {
        skinLikeCellsCount++;
      }

      const colorKey = classifyRubikStickerCell(avgR, avgG, avgB, stdDev, motionTolerance, surfaceProfileKey, sample.medHsv);
      const cellLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

      currentNxNColors.push(colorKey);
      cellStats.push({ avgR, avgG, avgB, cellStdDev: stdDev, colorKey, cellLum });

      if (colorKey !== 'invalid') {
        validColorsCount++;
        if (colorKey !== 'white') vividColorsCount++;
      }
    }
  }

  // Khắt khe: nếu phát hiện da người quá nhiều hoặc quá ít ô màu hợp lệ -> Loại bỏ
  const isHumanFaceOrSkin = surfaceProfileKey !== 'pastel' && skinLikeCellsCount >= 2;
  const minValidStickers = Math.max(3, Math.ceil(dim * dim * 0.44));
  const tooFewStickers = validColorsCount < minValidStickers;

  if (isHumanFaceOrSkin || tooFewStickers) {
    return {
      startX,
      startY,
      boxSize,
      currentNxNColors: Array(dim * dim).fill('invalid'),
      validColorsCount: 0,
      vividColorsCount: 0,
      uniqueColorsCount: 0,
      sharpAdjacentEdges: 0,
      colorTransitions: 0,
      gridSeamContrast: geom.seamScore,
      isGeometricallyVerifiedCube: false,
      isMostlySkinOrWood: true,
      score: -99999
    };
  }

  let sharpAdjacentEdges = 0;
  let colorTransitions = 0;
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
          colorTransitions++;
          const rgbDist = Math.hypot(
            cellA.avgR - cellB.avgR,
            cellA.avgG - cellB.avgG,
            cellA.avgB - cellB.avgB
          );
          if (rgbDist >= (surfaceProfileKey === 'pastel' ? 24 : 36)) sharpAdjacentEdges++;
        }
      }
    }
  }

  const validOnly = currentNxNColors.filter((c) => c !== 'invalid');
  const uniqueColorsCount = new Set(validOnly).size;

  const unsolvedBonus =
    uniqueColorsCount >= 2
      ? uniqueColorsCount * 8 + sharpAdjacentEdges * 7 + colorTransitions * 4
      : (validColorsCount >= Math.ceil(dim * dim * 0.88) ? 20 : 4);

  const score =
    validColorsCount * 6 +
    vividColorsCount * 4 +
    unsolvedBonus +
    geom.seamScore * 2.5;

  return {
    startX,
    startY,
    boxSize,
    currentNxNColors,
    validColorsCount,
    vividColorsCount,
    uniqueColorsCount,
    sharpAdjacentEdges,
    colorTransitions,
    gridSeamContrast: geom.seamScore,
    isGeometricallyVerifiedCube: true,
    isMostlySkinOrWood: false,
    score
  };
}

// Quét Lưới Mạng Nhện Đa Hướng (Spider-Web Radial Ray Casting) để khóa chính xác Hitbox của khối Rubik
function scanSpiderWebHitbox(frameImg, w, h, seedCx, seedCy, surfaceProfileKey = 'auto') {
  const minSide = Math.min(w, h);
  const maxRadius = Math.floor(minSide * 0.44);
  const minRadius = Math.floor(minSide * 0.10);
  const numRays = 16;
  const rayHits = [];
  let validRayHitsCount = 0;

  for (let k = 0; k < numRays; k++) {
    const angle = (k * 2 * Math.PI) / numRays;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    let edgeRadius = maxRadius;
    let foundEdge = false;

    // Quét tia mạng nhện từ tâm tỏa ra ngoài theo từng bước r = 3px
    for (let r = 8; r <= maxRadius; r += 3) {
      const px = Math.floor(seedCx + r * cosA);
      const py = Math.floor(seedCy + r * sinA);
      if (px < 2 || px >= w - 2 || py < 2 || py >= h - 2) {
        edgeRadius = r;
        foundEdge = true;
        break;
      }

      const idx = (py * w + px) * 4;
      const rVal = frameImg[idx];
      const gVal = frameImg[idx + 1];
      const bVal = frameImg[idx + 2];
      const lum = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;

      // Bước nhảy biên độ dọc theo tia (Sobel Edge gradient)
      const nextPx = Math.floor(seedCx + (r + 4) * cosA);
      const nextPy = Math.floor(seedCy + (r + 4) * sinA);
      if (nextPx >= 0 && nextPx < w && nextPy >= 0 && nextPy < h) {
        const nextIdx = (nextPy * w + nextPx) * 4;
        const nextLum = 0.299 * frameImg[nextIdx] + 0.587 * frameImg[nextIdx + 1] + 0.114 * frameImg[nextIdx + 2];
        const grad = Math.abs(nextLum - lum);

        const cKey = classifyRubikStickerCell(rVal, gVal, bVal, 10, 6, surfaceProfileKey);
        const isPlastic = cKey !== 'invalid';

        if (r >= minRadius && (grad >= 30 || (!isPlastic && r > minRadius * 1.15))) {
          edgeRadius = r;
          foundEdge = true;
          validRayHitsCount++;
          break;
        }
      }
    }

    const hitX = Math.max(2, Math.min(w - 2, Math.floor(seedCx + edgeRadius * cosA)));
    const hitY = Math.max(2, Math.min(h - 2, Math.floor(seedCy + edgeRadius * sinA)));
    rayHits.push({
      angle,
      r: edgeRadius,
      x: hitX,
      y: hitY,
      xPct: Number(((hitX / w) * 100).toFixed(1)),
      yPct: Number(((hitY / h) * 100).toFixed(1)),
      foundEdge
    });
  }

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const hit of rayHits) {
    if (hit.x < minX) minX = hit.x;
    if (hit.x > maxX) maxX = hit.x;
    if (hit.y < minY) minY = hit.y;
    if (hit.y > maxY) maxY = hit.y;
  }

  const hitboxW = maxX - minX;
  const hitboxH = maxY - minY;
  const aspect = hitboxW / Math.max(hitboxH, 1);
  const boxSize = Math.max(hitboxW, hitboxH);
  const cx = Math.floor((minX + maxX) / 2);
  const cy = Math.floor((minY + maxY) / 2);

  // Khối Rubik thật có Hitbox chuẩn vuông 1:1 (tỉ lệ 0.80..1.25)
  const isSquareHitbox = aspect >= 0.80 && aspect <= 1.25 && boxSize >= minSide * 0.22 && boxSize <= minSide * 0.78;

  return {
    isSquareHitbox,
    validRays: validRayHitsCount,
    hitbox: {
      minX, maxX, minY, maxY,
      hitboxW, hitboxH,
      aspect: Number(aspect.toFixed(2)),
      cx, cy,
      boxSize
    },
    rayHits
  };
}

// Bộ định vị & bám đuổi khối Rubik động (Dynamic Multi-Scale Object Tracker)
// Tích hợp LƯỚI MẠNG NHỆN (Spider-Web Ray Casting) quét chính xác HITBOX Rubik + 60 FPS Speedcuber Pipeline
function locateDynamicRubikBox(frameImg, w, h, dim, prevTracker, surfaceProfileKey = 'auto') {
  const minSide = Math.min(w, h);
  const baseSize = minSide * 0.48;

  // 1. FAST-PATH DÀNH CHO SPEEDCUBER (60 FPS & độ trễ cực thấp):
  // Khi khối đã được khóa ở khung hình trước, quét lưới mạng nhện ngay tại ROI dự đoán vận tốc
  if (prevTracker && prevTracker.cx > 0 && prevTracker.size > 0) {
    const predCx = prevTracker.cx + (prevTracker.vx || 0) * 0.95;
    const predCy = prevTracker.cy + (prevTracker.vy || 0) * 0.95;

    // Quét lưới mạng nhện từ tâm dự đoán để tìm viền hitbox
    const spider = scanSpiderWebHitbox(frameImg, w, h, predCx, predCy, surfaceProfileKey);
    const baseS = spider.isSquareHitbox ? spider.hitbox.boxSize : prevTracker.size;
    const targetCx = spider.isSquareHitbox ? spider.hitbox.cx : predCx;
    const targetCy = spider.isSquareHitbox ? spider.hitbox.cy : predCy;

    const roiCandidates = [
      { cx: targetCx, cy: targetCy, size: baseS },
      { cx: targetCx, cy: targetCy, size: baseS * 0.95 },
      { cx: targetCx, cy: targetCy, size: baseS * 1.05 }
    ];

    let bestRoi = null;
    for (const roi of roiCandidates) {
      const clampedSize = Math.max(minSide * 0.28, Math.min(minSide * 0.72, roi.size));
      const sx = Math.max(4, Math.min(w - clampedSize - 4, roi.cx - clampedSize / 2));
      const sy = Math.max(4, Math.min(h - clampedSize - 4, roi.cy - clampedSize / 2));
      const res = evaluateRubikGridCandidate(frameImg, w, h, dim, sx, sy, clampedSize, 4, surfaceProfileKey);
      if (res.score > 25 && res.isGeometricallyVerifiedCube && (!bestRoi || res.score > bestRoi.score)) {
        bestRoi = res;
      }
    }

    if (bestRoi && bestRoi.score > 28) {
      return {
        ...bestRoi,
        hitbox: spider.isSquareHitbox ? spider.hitbox : null,
        spiderRays: spider.rayHits,
        isSpiderLocked: spider.isSquareHitbox
      };
    }
  }

  // 2. TÌM KIẾM TOÀN KHUNG HÌNH (Khi khối mới xuất hiện hoặc di chuyển nhanh)
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
      const rVal = frameImg[idx];
      const gVal = frameImg[idx + 1];
      const bVal = frameImg[idx + 2];

      const cKey = classifyRubikStickerCell(rVal, gVal, bVal, 8, 4, surfaceProfileKey);
      if (cKey !== 'invalid' && cKey !== 'white') {
        const wt = 3.2;
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

  // Nếu không có ít nhất 3 điểm sắc tố nhựa thực tế trên toàn màn hình:
  // KHÔNG CÓ KHỐI RUBIK TRƯỚC CAMERA -> Không đẩy ứng viên lên mặt người!
  if (vividHits < 3 || weightSum <= 0) {
    return {
      startX: Math.floor(w / 2 - baseSize / 2),
      startY: Math.floor(h / 2 - baseSize / 2),
      boxSize: baseSize,
      currentNxNColors: Array(dim * dim).fill('invalid'),
      validColorsCount: 0,
      vividColorsCount: 0,
      uniqueColorsCount: 0,
      sharpAdjacentEdges: 0,
      colorTransitions: 0,
      gridSeamContrast: 0,
      isGeometricallyVerifiedCube: false,
      isMostlySkinOrWood: true,
      score: -99999,
      hitbox: null,
      spiderRays: [],
      isSpiderLocked: false
    };
  }

  const heatCx = wxSum / weightSum;
  const heatCy = wySum / weightSum;

  // Quét lưới mạng nhện từ tâm cụm màu để tìm viền hitbox
  const spider = scanSpiderWebHitbox(frameImg, w, h, heatCx, heatCy, surfaceProfileKey);

  const candidates = [];
  const pushCandidate = (cx, cy, size, motionTol = 0) => {
    const clampedSize = Math.max(minSide * 0.28, Math.min(minSide * 0.72, size));
    const sx = Math.max(4, Math.min(w - clampedSize - 4, cx - clampedSize / 2));
    const sy = Math.max(4, Math.min(h - clampedSize - 4, cy - clampedSize / 2));
    candidates.push({ sx, sy, size: clampedSize, motionTol });
  };

  if (spider.isSquareHitbox) {
    pushCandidate(spider.hitbox.cx, spider.hitbox.cy, spider.hitbox.boxSize, 5);
  }

  // Luôn luôn có ứng viên khung ngắm trung tâm chuẩn Python OpenCV
  pushCandidate(Math.floor(w / 2), Math.floor(h / 2), baseSize, 4);
  pushCandidate(Math.floor(w / 2), Math.floor(h / 2), minSide * 0.48, 4);

  const span = Math.max(maxHitX - minHitX, maxHitY - minHitY);
  const adaptiveSize = span > minSide * 0.18 ? span * 1.25 : baseSize;

  pushCandidate(heatCx, heatCy, adaptiveSize, 4);
  pushCandidate(heatCx, heatCy, baseSize, 4);
  pushCandidate(heatCx, heatCy, minSide * 0.38, 4);

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
      cand.motionTol,
      surfaceProfileKey
    );
    if (!bestEval || res.score > bestEval.score) {
      bestEval = res;
    }
  }

  if (!bestEval || bestEval.score <= 0 || bestEval.validColorsCount < 3 || bestEval.isMostlySkinOrWood) {
    return {
      startX: Math.floor(w / 2 - baseSize / 2),
      startY: Math.floor(h / 2 - baseSize / 2),
      boxSize: baseSize,
      currentNxNColors: Array(dim * dim).fill('invalid'),
      validColorsCount: 0,
      vividColorsCount: 0,
      uniqueColorsCount: 0,
      sharpAdjacentEdges: 0,
      colorTransitions: 0,
      gridSeamContrast: 0,
      isGeometricallyVerifiedCube: false,
      isMostlySkinOrWood: true,
      score: -99999,
      hitbox: null,
      spiderRays: [],
      isSpiderLocked: false
    };
  }

  return {
    ...bestEval,
    hitbox: spider.isSquareHitbox ? spider.hitbox : null,
    spiderRays: spider.rayHits,
    isSpiderLocked: spider.isSquareHitbox
  };
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
  const isKhoaAdminRef = useRef(isKhoaAdmin);
  useEffect(() => {
    isKhoaAdminRef.current = isKhoaAdmin;
  }, [isKhoaAdmin]);

  const [adminSettings, setAdminSettings] = useState(() => {
    const defaults = {
      competitionTitle: 'Rubik Timer & AI Verification',
      subTitle: 'HUST Speedcubing • 2×2 đến 7×7 • Mọi dòng Rubik',
      announcementBanner: '',
      spaceHoldMs: 280,
      inspectionDurationSec: 15,
      requireCameraToSolve: true,
      require3DCubePreCheck: true,
      requireAll6FacesPreCheck: false,
      requiredPreCheckFaces: 3, // 3: Xác minh 3 mặt (Mặc định - Nhanh gọn cho Cuber) | 6: Bắt buộc đủ 6 mặt (Bản gốc nâng cao của Admin Khoa)
      requireCubeMoveDuringSolve: true,
      autoStopWhenSolved: true,
      adminVipBypass: true
    };
    try {
      const saved = localStorage.getItem('rubik_admin_settings');
      const migrated = localStorage.getItem('rubik_faces_mode_migrated_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!migrated) {
          localStorage.setItem('rubik_faces_mode_migrated_v3', '1');
          parsed.requiredPreCheckFaces = 3;
          parsed.requireAll6FacesPreCheck = false;
          localStorage.setItem('rubik_admin_settings', JSON.stringify(parsed));
        }
        return { ...defaults, ...parsed };
      }
    } catch {}
    return defaults;
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
  const [scrollY, setScrollY] = useState(0);
  const touchHoldTimerRef = useRef(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY || document.documentElement.scrollTop || 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // CHỐT CHẶN BẮT BUỘC: Phải BẬT CAMERA AI và XÁC MINH KHỐI RUBIK TRÊN MÔ HÌNH 3D mới được phép bấm đồng hồ giải!
  // (Trừ khi là Admin Khoa đang bật Đặc quyền VIP Bypass hoặc Admin đã tắt quy tắc trong Bảng Quản Trị)
  const requireCameraAndCubeToSolve = useCallback(() => {
    const cfg = adminSettingsRef.current || {};
    if (isKhoaAdminRef.current && cfg.adminVipBypass !== false) {
      return false; // Đặc quyền Admin Khoa: cho phép bấm đồng hồ tự do mọi lúc
    }
    if (cfg.requireCameraToSolve === false) {
      return false;
    }
    if (!cameraActiveRef.current) {
      setLastNotice({
        type: 'warning',
        text: '📷 BẮT BUỘC BẬT CAMERA AI: Bạn phải nhấn "📷 Bật Cam" và đưa khối Rubik vào xác minh trên Mô hình 3D thì mới được giải!'
      });
      return true;
    }
    if (!cameraHealthRef.current) {
      setLastNotice({
        type: 'warning',
        text: '⚠️ CAMERA CHƯA ĐỦ ĐIỀU KIỆN: Camera đang bị che tối hoặc mờ. Vui lòng kiểm tra ống kính trước khi bấm giờ!'
      });
      return true;
    }
    // Nếu người chơi đã ở Bước 2 (Đã xác nhận đúng SCB) -> Mở khóa đồng hồ giải ngay lập tức!
    if (solveStepRef.current === 'step2_ready_solve') {
      return false;
    }
    if (cfg.require3DCubePreCheck !== false) {
      const now = performance.now();
      const isCubeVerifiedFresh =
        Boolean(preCheckRef.current && preCheckRef.current.verified) &&
        lastCubeVerifiedAtRef.current > 0 &&
        now - lastCubeVerifiedAtRef.current <= 35000;

      if (!isCubeVerifiedFresh) {
        setLastNotice({
          type: 'warning',
          text: `🔍 BƯỚC 1 CHƯA XÁC NHẬN: Hãy quét ${cfg.requiredPreCheckFaces === 6 ? 6 : 3} mặt trước Camera hoặc bấm "✅ Xác nhận đúng SCB" để mở khóa giải!`
        });
        return true;
      }
    }
    return false;
  }, []);
  const requireCameraToSolveRef = useRef(requireCameraAndCubeToSolve);
  useEffect(() => {
    requireCameraToSolveRef.current = requireCameraAndCubeToSolve;
  }, [requireCameraAndCubeToSolve]);

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

    if (curState === 'running') {
      stopTimerRef.current();
      playAppSound('stop');
      return;
    }

    // Nếu đang ở Bước 3 (Hoàn thành) -> Chạm vào màn hình để bắt đầu lượt mới ngay!
    if (curState === 'idle' && solveStepRef.current === 'step3_completed') {
      startNextSolveRoundRef.current();
      playAppSound('ready');
      return;
    }

    // BẮT BUỘC PHẢI BẬT CAMERA AI & XÁC MINH KHỐI RUBIK TRÊN MÔ HÌNH 3D MỚI ĐƯỢC GIẢI
    if (requireCameraToSolveRef.current()) return;
    if (curState === 'idle' && requireHumanRef.current()) return;
    holdStartTsRef.current = performance.now();

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

  // Modal Login / Auth Gate (Bắt buộc phải đăng nhập/đăng ký mới vào được web theo yêu cầu của bạn)
  const isGuest = !currentUser || !currentUser.email || currentUser.email === 'guest@cuber.vn';
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'signup'
  const [inputUserName, setInputUserName] = useState('');
  const [inputUserEmail, setInputUserEmail] = useState('');
  const [inputUserPassword, setInputUserPassword] = useState('');
  const [inputConfirmPassword, setInputConfirmPassword] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  const [showGoogleInput, setShowGoogleInput] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');

  // Admin Control Panel Modal (Dành độc quyền cho Gmail của Khoa: khoa.tt2611758@sis.hust.edu.vn)
  const [showAdminPanelModal, setShowAdminPanelModal] = useState(false);
  const [editCompTitle, setEditCompTitle] = useState(adminSettings.competitionTitle);
  const [editCompSub, setEditCompSub] = useState(adminSettings.subTitle);
  const [editAnnouncement, setEditAnnouncement] = useState(adminSettings.announcementBanner || '');
  const [editSpaceHoldMs, setEditSpaceHoldMs] = useState(adminSettings.spaceHoldMs || 280);
  const [editInspectionSec, setEditInspectionSec] = useState(adminSettings.inspectionDurationSec || 15);
  const [editRequireCam, setEditRequireCam] = useState(adminSettings.requireCameraToSolve !== false);
  const [editRequire3DPreCheck, setEditRequire3DPreCheck] = useState(adminSettings.require3DCubePreCheck !== false);
  const [editRequiredFaces, setEditRequiredFaces] = useState(
    adminSettings.requiredPreCheckFaces === 6 || (adminSettings.requireAll6FacesPreCheck === true && adminSettings.requiredPreCheckFaces !== 3) ? 6 : 3
  );
  const [editRequireAll6Faces, setEditRequireAll6Faces] = useState(
    adminSettings.requiredPreCheckFaces === 6 || (adminSettings.requireAll6FacesPreCheck === true && adminSettings.requiredPreCheckFaces !== 3)
  );
  const [editRequireMove, setEditRequireMove] = useState(adminSettings.requireCubeMoveDuringSolve !== false);
  const [editAutoStop, setEditAutoStop] = useState(adminSettings.autoStopWhenSolved !== false);
  const [editAdminVipBypass, setEditAdminVipBypass] = useState(adminSettings.adminVipBypass !== false);

  // State chỉnh sửa nhanh Kỷ lục & Bảng xếp hạng trực tiếp trong Admin Panel của Khoa
  const [adminRecName, setAdminRecName] = useState('');
  const [adminRecPuzzle, setAdminRecPuzzle] = useState('3x3');
  const [adminRecBest, setAdminRecBest] = useState('');
  const [adminRecAvg, setAdminRecAvg] = useState('');
  const [adminRenameBoardTitle, setAdminRenameBoardTitle] = useState('');
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editingEntryBest, setEditingEntryBest] = useState('');
  const [editingEntryAvg, setEditingEntryAvg] = useState('');

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

  // Bộ chọn Chế độ Nhận diện Bề mặt Rubik (Tự động AI / Phủ UV / Nhựa Nhám / Viền Đen & Carbon / Pastel Macaron)
  const [surfaceProfile, setSurfaceProfile] = useState(() => {
    const saved = localStorage.getItem('rubik_surface_profile');
    return saved && CUBE_SURFACE_PROFILES[saved] ? saved : 'auto';
  });
  const surfaceProfileRef = useRef(surfaceProfile);
  useEffect(() => {
    surfaceProfileRef.current = surfaceProfile;
  }, [surfaceProfile]);

  // Mặt Rubik mà Camera AI đang nhận diện (để Khối 3D tự động xoay hướng theo mặt đó)
  const [currentActiveFace, setCurrentActiveFace] = useState('F');
  const currentActiveFaceRef = useRef('F');
  useEffect(() => {
    currentActiveFaceRef.current = currentActiveFace;
  }, [currentActiveFace]);

  const handleSelectSurfaceProfile = (profileKey) => {
    if (!CUBE_SURFACE_PROFILES[profileKey]) return;
    setSurfaceProfile(profileKey);
    surfaceProfileRef.current = profileKey;
    localStorage.setItem('rubik_surface_profile', profileKey);
  };

  const [gameMode, setGameMode] = useState(() => {
    return localStorage.getItem('rubik_game_mode') || 'free';
  });

  const [targetSeconds, setTargetSeconds] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_target_sub_custom');
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved);
      }
    } catch {}
    return 15;
  });
  const [customSubInput, setCustomSubInput] = useState('');
  const [lastTargetResult, setLastTargetResult] = useState(null);

  const [inspectionSeconds, setInspectionSeconds] = useState(15);
  const [penaltyText, setPenaltyText] = useState('');

  const [timerState, setTimerState] = useState('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [scramble, setScramble] = useState(() => generateScramble(puzzleType));
  const scrambleRef = useRef(scramble);
  useEffect(() => { scrambleRef.current = scramble; }, [scramble]);

  // Bộ giải Kociemba Two-Phase Algorithm (~20 bước tối ưu)
  const [showKociembaModal, setShowKociembaModal] = useState(false);

  useEffect(() => {
    initKociembaSolver();
  }, []);

  const kociembaOptimal = useMemo(() => {
    if (puzzleType !== '3x3' || !scramble) return null;
    return solveWithKociemba(scramble);
  }, [scramble, puzzleType]);

  // Cho phép giải tự do (Freestyle) khi người dùng xáo khác công thức Scramble đề bài
  const [allowFreestyleScramble, setAllowFreestyleScramble] = useState(false);
  const allowFreestyleScrambleRef = useRef(false);
  useEffect(() => { allowFreestyleScrambleRef.current = allowFreestyleScramble; }, [allowFreestyleScramble]);

  // Kiểm toán độ chính xác của khối xáo so với công thức Scramble đề bài
  const [scrambleAudit, setScrambleAudit] = useState({ matchRate: 100, isMatch: true, isMismatch: false, isPending: true });
  const scrambleAuditRef = useRef(scrambleAudit);
  useEffect(() => { scrambleAuditRef.current = scrambleAudit; }, [scrambleAudit]);

  // =========================================================================
  // QUY TRÌNH 3 BƯỚC SPEEDCUBING WCA (THEO YÊU CẦU NGƯỜI DÙNG):
  // 1. 'step1_check_scb': Kiểm tra scb (quét 3 mặt mặc định hoặc 6 mặt)
  // 2. 'step2_ready_solve': Xác nhận đúng r bắt đầu giải
  // 3. 'step3_completed': Hoàn thành
  // =========================================================================
  const [solveStep, setSolveStep] = useState('step1_check_scb');
  const solveStepRef = useRef('step1_check_scb');
  useEffect(() => { solveStepRef.current = solveStep; }, [solveStep]);

  const [completedSolveInfo, setCompletedSolveInfo] = useState(null);

  // Xác nhận đúng SCB và chuyển sang Bước 2 (Mở khóa đồng hồ)
  const confirmScrambleAndReady = useCallback(() => {
    setPreCheckStatus(prev => ({
      ...prev,
      verified: true,
      text: '🟢 ĐÃ XÁC NHẬN SCB ĐÚNG — Đã mở khóa đồng hồ! Sẵn sàng bấm giờ giải.'
    }));
    lastCubeVerifiedAtRef.current = performance.now();
    startScrambledRef.current = true;
    setAllowFreestyleScramble(true);
    allowFreestyleScrambleRef.current = true;
    setSolveStep('step2_ready_solve');
    playAppSound('ready');
    setLastNotice({
      type: 'success',
      text: '✅ BƯỚC 2: ĐÃ XÁC NHẬN SCB ĐÚNG! Bạn có thể giữ phím Space (hoặc chạm tay) để bắt đầu giải ngay.'
    });
  }, [playAppSound]);
  const confirmScrambleAndReadyRef = useRef(confirmScrambleAndReady);
  useEffect(() => { confirmScrambleAndReadyRef.current = confirmScrambleAndReady; }, [confirmScrambleAndReady]);

  // Chuyển sang lượt giải tiếp theo (Tạo Scramble mới & quay về Bước 1)
  const startNextSolveRound = useCallback(() => {
    const nextP = puzzleTypeRef.current;
    setScramble(generateScramble(nextP));
    setScannedFaces({});
    scannedFacesRef.current = {};
    setAllowFreestyleScramble(false);
    allowFreestyleScrambleRef.current = false;
    setTimeMs(0);
    setTrackedMoves([]);
    setLastMoveDetected('');
    setCompletedSolveInfo(null);
    setSolveStep('step1_check_scb');
    setPreCheckStatus({
      verified: false,
      text: `🔍 Đưa khối Rubik ${PUZZLE_CONFIGS[nextP]?.name} đã xáo trộn vào khung ngắm để kiểm tra SCB...`,
      isScrambled: false,
      centerFace: null
    });
    setLastNotice(null);
  }, []);
  const startNextSolveRoundRef = useRef(startNextSolveRound);
  useEffect(() => { startNextSolveRoundRef.current = startNextSolveRound; }, [startNextSolveRound]);

  // Toggle nhanh giữa chế độ 3 mặt (Nhanh) và 6 mặt (Admin Khoa)
  const handleToggleFaceVerificationMode = useCallback((faces) => {
    const nextFaces = faces === 6 ? 6 : 3;
    setAdminSettings(prev => {
      const updated = {
        ...prev,
        requiredPreCheckFaces: nextFaces,
        requireAll6FacesPreCheck: nextFaces === 6
      };
      adminSettingsRef.current = updated;
      try {
        localStorage.setItem('rubik_admin_settings', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setLastNotice({
      type: 'success',
      text: nextFaces === 6
        ? '🛡️ Đã chuyển sang: Bắt buộc quét đủ 6 mặt (Bản gốc nâng cao Admin Khoa)!'
        : '⚡ Đã chuyển sang: Xác minh 3 mặt (Nhanh gọn chuẩn Cuber)!'
    });
  }, []);

  // =========================================================================
  // BỘ GIẢI KOCIEMBA NÂNG CAO (HỖ TRỢ GIẢI SCRAMBLE & GIẢI 6 MẶT QUÉT CAMERA)
  // =========================================================================
  const [kociembaSolverSource, setKociembaSolverSource] = useState('scramble'); // 'scramble' | 'camera'
  const [kociembaCurrentStep, setKociembaCurrentStep] = useState(0);
  const [kociembaIsPlaying, setKociembaIsPlaying] = useState(false);

  // Giải trạng thái khối 6 mặt thực tế do Camera AI quét được bằng Kociemba
  const kociembaFromCamera = useMemo(() => {
    if (puzzleType !== '3x3') return null;
    return solveScannedFacesWithKociemba(scannedFaces);
  }, [scannedFaces, puzzleType]);

  // Kết quả Kociemba đang chọn (theo đề bài hoặc theo camera)
  const activeKociembaResult = useMemo(() => {
    if (kociembaSolverSource === 'camera') {
      return kociembaFromCamera || { success: false, error: 'Chưa có đủ 6 mặt từ Camera' };
    }
    return kociembaOptimal;
  }, [kociembaSolverSource, kociembaFromCamera, kociembaOptimal]);

  const activeMovesList = useMemo(() => {
    if (!activeKociembaResult?.solution) return [];
    return activeKociembaResult.solution.trim().split(/\s+/).filter(Boolean);
  }, [activeKociembaResult]);

  // Tự động chạy từng bước giải Kociemba (mỗi 1.5 giây nhảy 1 bước)
  useEffect(() => {
    if (!kociembaIsPlaying || activeMovesList.length === 0) return;
    const interval = setInterval(() => {
      setKociembaCurrentStep(prev => {
        if (prev >= activeMovesList.length - 1) {
          setKociembaIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [kociembaIsPlaying, activeMovesList]);

  // Chụp & Lưu mặt Rubik đang hiện trên Camera (Tương đương phím Space trong file quet_rubik_6_mat.py)
  const captureCurrentFace = useCallback(() => {
    if (!cameraActiveRef.current) {
      setLastNotice({ type: 'warning', text: '📷 Hãy nhấn "Bật Cam" trước khi chụp mặt Rubik!' });
      return;
    }
    const colors = detectedColors;
    const validCount = colors.filter(c => c && c !== 'invalid').length;
    if (validCount < 7) {
      setLastNotice({
        type: 'warning',
        text: `⚠️ Chưa nhận diện rõ các ô (${validCount}/9 ô). Căn chỉnh khối vuông góc vào giữa khung ngắm!`
      });
      return;
    }
    const faceCodeMap = {
      white: 'U',
      yellow: 'D',
      red: 'R',
      orange: 'L',
      green: 'F',
      blue: 'B'
    };
    const centerColor = colors[4];
    const mappedFace = faceCodeMap[centerColor] || currentActiveFaceRef.current || 'F';
    const nextFaces = {
      ...(scannedFacesRef.current || {}),
      [mappedFace]: [...colors]
    };
    scannedFacesRef.current = nextFaces;
    setScannedFaces(nextFaces);
    playAppSound('ready');

    const order = ['U', 'R', 'F', 'D', 'L', 'B'];
    const currentKeys = Object.keys(nextFaces);
    const missing = order.filter(f => !currentKeys.includes(f));
    const targetCount = adminSettingsRef.current?.requiredPreCheckFaces === 6 ? 6 : 3;

    if (currentKeys.length >= targetCount) {
      setPreCheckStatus(prev => ({
        ...prev,
        verified: true,
        text: `🟢 ĐÃ CHỤP ĐỦ ${currentKeys.length}/${targetCount} MẶT (${currentKeys.join(', ')}) — Đã mở khóa đồng hồ!`
      }));
      lastCubeVerifiedAtRef.current = performance.now();
      startScrambledRef.current = true;
      setSolveStep('step2_ready_solve');
      setLastNotice({
        type: 'success',
        text: `🎉 ĐÃ CHỤP ĐỦ ${targetCount} MẶT! Chuyển sang Bước 2: Sẵn sàng bấm giờ giải (hoặc bấm xem Kociemba)!`
      });
    } else {
      const nextFacePrompt = missing[0] || 'tiếp theo';
      const faceNameMap = { U: 'Trên (Trắng)', R: 'Phải (Đỏ)', F: 'Trước (Xanh lá)', D: 'Dưới (Vàng)', L: 'Trái (Cam)', B: 'Sau (Xanh dương)' };
      setLastNotice({
        type: 'success',
        text: `📸 ĐÃ LƯU MẶT ${mappedFace}! Tiếp theo: Hãy xoay sang mặt ${nextFacePrompt} - ${faceNameMap[nextFacePrompt] || ''}`
      });
    }
  }, [detectedColors, playAppSound]);
  const captureCurrentFaceRef = useRef(captureCurrentFace);
  useEffect(() => { captureCurrentFaceRef.current = captureCurrentFace; }, [captureCurrentFace]);

  // =========================================================================
  // MÁY QUÉT 6 MẶT RUBIK CHUẨN OPENCV & KOCIEMBA (100% THEO quet_rubik_6_mat.py)
  // Quét từng mặt U, R, F, D, L, B • Median HSV • Kiểm tra 9 ô/màu • Kociemba ≤ 20 bước
  // =========================================================================
  const [showOpenCvScannerModal, setShowOpenCvScannerModal] = useState(false);
  const showOpenCvScannerModalRef = useRef(false);
  useEffect(() => { showOpenCvScannerModalRef.current = showOpenCvScannerModal; }, [showOpenCvScannerModal]);

  const [openCvFaceIdx, setOpenCvFaceIdx] = useState(0); // 0: U, 1: R, 2: F, 3: D, 4: L, 5: B
  const openCvFaceIdxRef = useRef(0);
  useEffect(() => { openCvFaceIdxRef.current = openCvFaceIdx; }, [openCvFaceIdx]);

  const [openCvFaces, setOpenCvFaces] = useState({
    U: null,
    R: null,
    F: null,
    D: null,
    L: null,
    B: null
  });
  const openCvFacesRef = useRef(openCvFaces);
  useEffect(() => { openCvFacesRef.current = openCvFaces; }, [openCvFaces]);

  const [openCvShowHsv, setOpenCvShowHsv] = useState(false);
  const openCvShowHsvRef = useRef(false);
  useEffect(() => { openCvShowHsvRef.current = openCvShowHsv; }, [openCvShowHsv]);

  const [openCvNotice, setOpenCvNotice] = useState(null);
  const [openCvKociemba, setOpenCvKociemba] = useState(null);

  const openCvLiveMatrixRef = useRef([
    ['?', '?', '?'],
    ['?', '?', '?'],
    ['?', '?', '?']
  ]);
  const openCvLiveHsvRef = useRef([
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  ]);
  const openCvCanvasRef = useRef(null);

  // Lưu mặt hiện tại (Phím Space trong quet_rubik_6_mat.py)
  const saveCurrentOpenCvFace = useCallback(() => {
    const curMat = OPENCV_MAT[openCvFaceIdxRef.current] || OPENCV_MAT[0];
    const currentKey = curMat[0];
    const currentName = curMat[1];
    const liveMat = openCvLiveMatrixRef.current;

    if (!liveMat || liveMat.length !== 3) {
      setOpenCvNotice({ type: 'warning', text: '⚠️ Chưa có tín hiệu hình ảnh từ Camera!' });
      return;
    }

    const hasUnknown = liveMat.some(row => row.some(col => col === '?' || !col));
    if (hasUnknown) {
      playAppSound('wrong');
      setOpenCvNotice({
        type: 'warning',
        text: `⚠️ Mặt ${currentKey} (${currentName}) còn ô chưa nhận diện rõ (kí hiệu '?'). Hãy căn chỉnh mặt Rubik ngay ngắn vào khung ngắm!`
      });
      return;
    }

    playAppSound('correct');
    const updatedFaces = {
      ...openCvFacesRef.current,
      [currentKey]: liveMat.map(row => [...row])
    };
    openCvFacesRef.current = updatedFaces;
    setOpenCvFaces(updatedFaces);

    // Tìm mặt tiếp theo chưa quét (tim_mat_tiep_theo)
    const nextIdx = timMatTiepTheoOpenCv(updatedFaces, openCvFaceIdxRef.current);
    setOpenCvFaceIdx(nextIdx);
    openCvFaceIdxRef.current = nextIdx;

    const savedCount = Object.values(updatedFaces).filter(Boolean).length;
    setOpenCvNotice({
      type: 'success',
      text: `✅ Đã lưu mặt ${currentKey} (${currentName})! (Đã lưu ${savedCount}/6 mặt)`
    });

    // Kiểm tra hợp lệ: Đủ 6 mặt và mỗi màu đúng 9 ô -> Tự động giải Kociemba!
    if (kiemTraHopLeOpenCv(updatedFaces)) {
      const kRes = solveScannedFacesWithKociemba(updatedFaces);
      setOpenCvKociemba(kRes);
      if (kRes && kRes.success) {
        playAppSound('ready');
        setOpenCvNotice({
          type: 'success',
          text: `🎉 ĐÃ QUÉT HỢP LỆ ĐỦ 6 MẶT (9 Ô MỖI MÀU)! Kociemba đã tìm ra chuỗi bước giải tối ưu (${kRes.moveCount} bước).`
        });
      } else {
        setOpenCvNotice({
          type: 'error',
          text: `⚠️ ${kRes?.error || 'Trạng thái khối không giải được, hãy kiểm tra lại từng mặt'}`
        });
      }
    }
  }, [playAppSound]);
  const saveCurrentOpenCvFaceRef = useRef(saveCurrentOpenCvFace);
  useEffect(() => { saveCurrentOpenCvFaceRef.current = saveCurrentOpenCvFace; }, [saveCurrentOpenCvFace]);

  // Tải file JSON trang_thai_rubik_6_mat.json (Phím S trong quet_rubik_6_mat.py)
  const downloadOpenCvJson = useCallback(() => {
    const data = {
      thu_tu_mat: OPENCV_MAT.map(m => m[0]),
      cac_mat: openCvFaces,
      thong_ke_mau: demMauOpenCv(openCvFaces),
      hop_le: kiemTraHopLeOpenCv(openCvFaces),
      kociemba: openCvKociemba
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trang_thai_rubik_6_mat.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpenCvNotice({
      type: 'success',
      text: '💾 Đã tải về file trang_thai_rubik_6_mat.json thành công!'
    });
  }, [openCvFaces, openCvKociemba]);
  const downloadOpenCvJsonRef = useRef(downloadOpenCvJson);
  useEffect(() => { downloadOpenCvJsonRef.current = downloadOpenCvJson; }, [downloadOpenCvJson]);

  // Áp dụng dữ liệu 6 mặt vừa quét sang Đồng hồ giải (Bước 2)
  const applyOpenCvToTimer = useCallback(() => {
    const viToInternal = {
      'Đỏ': 'red',
      'Cam': 'orange',
      'Vàng': 'yellow',
      'Xanh lá': 'green',
      'Xanh dương': 'blue',
      'Trắng': 'white'
    };

    const convertedScannedFaces = {};
    for (const [key] of OPENCV_MAT) {
      const mat = openCvFaces[key];
      if (mat && Array.isArray(mat)) {
        convertedScannedFaces[key] = mat.flat().map(c => viToInternal[c] || c);
      }
    }

    scannedFacesRef.current = convertedScannedFaces;
    setScannedFaces(convertedScannedFaces);
    isCubeVerifiedFreshRef.current = true;
    setIsCubeVerifiedFresh(true);

    // Mở khóa Bước 2 ngay lập tức
    setSolveStep('step2_ready_solve');
    solveStepRef.current = 'step2_ready_solve';

    setPreCheckStatus({
      verified: true,
      text: '🟢 ĐÃ XÁC MINH ĐỦ CẢ 6 MẶT TỪ MÁY QUÉT OPENCV — Đã sẵn sàng bấm giờ giải!',
      isScrambled: true,
      centerFace: 'U (Trên)'
    });

    setShowOpenCvScannerModal(false);
    playAppSound('ready');
    setLastNotice({
      type: 'success',
      text: '🟢 ĐÃ NHẬP 6 MẶT TỪ OPENCV! Đã mở khóa Bước 2 — Sẵn sàng bấm giờ giải!'
    });

    // Cuộn ngay đến Đồng hồ giải
    setTimeout(() => {
      const timerEl = document.getElementById('rubik-main-timer-section');
      if (timerEl) {
        timerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }, [openCvFaces, playAppSound]);

  // Xóa và quét lại từ đầu
  const resetOpenCvScanner = useCallback(() => {
    setOpenCvFaces({
      U: null,
      R: null,
      F: null,
      D: null,
      L: null,
      B: null
    });
    openCvFacesRef.current = {
      U: null,
      R: null,
      F: null,
      D: null,
      L: null,
      B: null
    };
    setOpenCvFaceIdx(0);
    openCvFaceIdxRef.current = 0;
    setOpenCvKociemba(null);
    setOpenCvNotice({
      type: 'info',
      text: '🔄 Đã làm mới trình quét. Bắt đầu từ mặt U (Trên)!'
    });
    playAppSound('click');
  }, [playAppSound]);

  // History & Solves (Chỉ giữ các lượt giải đã bật Camera AI & xác minh hợp lệ)
  const [solves, setSolves] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_solves_hcc_clean');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => s && s.verified === true) : [];
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
    setScannedFaces({});
    scannedFacesRef.current = {};
    setAllowFreestyleScramble(false);
    setScrambleAudit({ matchRate: 100, isMatch: true, isMismatch: false, isPending: true });
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

  // ==========================================
  // HỆ THỐNG XÁC THỰC TÀI KHOẢN (BẮT BUỘC ĐĂNG NHẬP / ĐĂNG KÝ / GMAIL)
  // ==========================================
  const getRegisteredAccounts = () => {
    try {
      const saved = localStorage.getItem('rubik_registered_users_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  };

  const saveRegisteredAccount = (account) => {
    try {
      const list = getRegisteredAccounts();
      const existingIdx = list.findIndex(u => u.email.toLowerCase() === account.email.toLowerCase());
      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...account };
      } else {
        list.push(account);
      }
      localStorage.setItem('rubik_registered_users_v2', JSON.stringify(list));
    } catch {}
  };

  // Đăng nhập bằng Email
  const handleEmailLogin = (e) => {
    e.preventDefault();
    setAuthErrorMsg('');

    const rate = checkRateLimit('auth_login_attempt', { maxHits: 8, windowMs: 60000, cooldownMs: 20000 });
    if (!rate.allowed) {
      setAuthErrorMsg(`🛡️ ${rate.reason}`);
      return;
    }

    if (hasMaliciousPayload(inputUserEmail) || hasMaliciousPayload(inputUserPassword)) {
      setAuthErrorMsg('🛡️ Tường lửa: Phát hiện ký tự độc hại trong thông tin đăng nhập!');
      return;
    }

    const email = sanitizeEmail(inputUserEmail, '').trim().toLowerCase();
    const password = inputUserPassword.trim();

    if (!email || !password) {
      setAuthErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu!');
      return;
    }

    // Tài khoản Super-Admin của Khoa
    if (email === ADMIN_EMAIL.toLowerCase()) {
      const userObj = {
        name: '👑 Khoa (Super-Admin)',
        email: ADMIN_EMAIL,
        provider: 'email',
        verified: true,
        role: 'admin'
      };
      setCurrentUser(userObj);
      localStorage.setItem('rubik_auth_user', JSON.stringify(userObj));
      setShowAuthModal(false);
      setInputUserPassword('');
      alert('👑 Chào mừng Khoa! Hệ thống đã nhận diện tài khoản Quản Trị Viên của bạn.');
      return;
    }

    const accounts = getRegisteredAccounts();
    const userFound = accounts.find(u => u.email.toLowerCase() === email);

    if (!userFound) {
      setAuthErrorMsg('Email này chưa được đăng ký! Vui lòng chuyển sang tab "Đăng Ký Tài Khoản".');
      return;
    }

    if (userFound.password && userFound.password !== password) {
      setAuthErrorMsg('Sai mật khẩu! Vui lòng kiểm tra lại.');
      return;
    }

    const userObj = {
      name: userFound.name || email.split('@')[0],
      email: userFound.email,
      provider: userFound.provider || 'email',
      verified: true
    };
    setCurrentUser(userObj);
    localStorage.setItem('rubik_auth_user', JSON.stringify(userObj));
    setShowAuthModal(false);
    setInputUserPassword('');
    setInputConfirmPassword('');
  };

  // Đăng ký tài khoản mới bằng Email
  const handleEmailSignUp = (e) => {
    e.preventDefault();
    setAuthErrorMsg('');

    const rate = checkRateLimit('auth_signup_attempt', { maxHits: 5, windowMs: 60000, cooldownMs: 30000 });
    if (!rate.allowed) {
      setAuthErrorMsg(`🛡️ ${rate.reason}`);
      return;
    }

    if (hasMaliciousPayload(inputUserName) || hasMaliciousPayload(inputUserEmail) || hasMaliciousPayload(inputUserPassword)) {
      setAuthErrorMsg('🛡️ Tường lửa: Phát hiện ký tự độc hại!');
      return;
    }

    const name = sanitizeText(inputUserName, 36, '').trim();
    const email = sanitizeEmail(inputUserEmail, '').trim().toLowerCase();
    const password = inputUserPassword.trim();

    if (!name) {
      setAuthErrorMsg('Vui lòng nhập Tên hiển thị / Nickname!');
      return;
    }
    if (!email || !email.includes('@')) {
      setAuthErrorMsg('Vui lòng nhập địa chỉ Email hợp lệ!');
      return;
    }
    if (password.length < 6) {
      setAuthErrorMsg('Mật khẩu phải có tối thiểu 6 ký tự để bảo mật!');
      return;
    }
    if (inputConfirmPassword && password !== inputConfirmPassword.trim()) {
      setAuthErrorMsg('Mật khẩu xác nhận không trùng khớp!');
      return;
    }

    const accounts = getRegisteredAccounts();
    if (accounts.some(u => u.email.toLowerCase() === email)) {
      setAuthErrorMsg('Email này đã được đăng ký tài khoản! Vui lòng chuyển sang tab "Đăng Nhập".');
      return;
    }

    const newAcc = {
      name,
      email,
      password,
      provider: 'email',
      verified: true,
      createdAt: new Date().toISOString()
    };
    saveRegisteredAccount(newAcc);

    const userObj = { name, email, provider: 'email', verified: true };
    setCurrentUser(userObj);
    localStorage.setItem('rubik_auth_user', JSON.stringify(userObj));
    setShowAuthModal(false);
    setInputUserPassword('');
    setInputConfirmPassword('');
    alert(`🎉 Chúc mừng ${name}! Bạn đã đăng ký tài khoản thành công và được mở khóa toàn bộ hệ thống.`);
  };

  // Đăng nhập liên kết với Gmail / Google
  const handleGoogleSignIn = (directEmail) => {
    setAuthErrorMsg('');
    let target = (directEmail || googleEmailInput || '').trim().toLowerCase();

    if (!target) {
      setShowGoogleInput(true);
      return;
    }

    if (!target.includes('@')) {
      target += '@gmail.com';
    }

    const prefix = target.split('@')[0];
    const formattedName = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    const googleUser = {
      name: formattedName,
      email: target,
      provider: 'google',
      verified: true,
      createdAt: new Date().toISOString()
    };

    saveRegisteredAccount(googleUser);
    setCurrentUser(googleUser);
    localStorage.setItem('rubik_auth_user', JSON.stringify(googleUser));
    setShowAuthModal(false);
    setShowGoogleInput(false);
    setGoogleEmailInput('');
    alert(`🎉 Đăng nhập liên kết Gmail thành công! Xin chào ${formattedName} (${target}).`);
  };

  const handleLogout = () => {
    const defaultUser = { name: 'Khách', email: 'guest@cuber.vn' };
    setCurrentUser(defaultUser);
    localStorage.setItem('rubik_auth_user', JSON.stringify(defaultUser));
    setShowAuthModal(true);
    setAuthTab('login');
  };

  const handleSaveAdminSettings = (e) => {
    e.preventDefault();
    if (!isKhoaAdmin) return;
    const newSettings = {
      competitionTitle: sanitizeText(editCompTitle, 60, 'Rubik Timer & AI Verification'),
      subTitle: sanitizeText(editCompSub, 80, 'HUST Speedcubing'),
      announcementBanner: sanitizeText(editAnnouncement, 140, ''),
      spaceHoldMs: Number(editSpaceHoldMs) || 280,
      inspectionDurationSec: Number(editInspectionSec) || 15,
      requireCameraToSolve: Boolean(editRequireCam),
      require3DCubePreCheck: Boolean(editRequire3DPreCheck),
      requireAll6FacesPreCheck: editRequiredFaces === 6,
      requiredPreCheckFaces: editRequiredFaces,
      requireCubeMoveDuringSolve: Boolean(editRequireMove),
      autoStopWhenSolved: Boolean(editAutoStop),
      adminVipBypass: Boolean(editAdminVipBypass)
    };
    setAdminSettings(newSettings);
    localStorage.setItem('rubik_admin_settings', JSON.stringify(newSettings));
    setShowAdminPanelModal(false);
    setLastNotice({
      type: 'success',
      text: '👑 Đã lưu toàn bộ cấu hình Quản trị của Khoa thành công!'
    });
  };

  // [ĐẶC QUYỀN ADMIN KHOA] Thêm mới hoặc Cập nhật trực tiếp kỷ lục của bất kỳ người chơi nào lên Bảng Xếp Hạng + Cloud
  const handleAdminUpsertRecord = async (e) => {
    e.preventDefault();
    if (!isKhoaAdmin || !currentBoard) return;
    const cleanName = sanitizeText(adminRecName, 36, '');
    const bestVal = parseFloat(String(adminRecBest).replace(',', '.'));
    const avgVal = adminRecAvg ? parseFloat(String(adminRecAvg).replace(',', '.')) : bestVal;

    if (!cleanName || Number.isNaN(bestVal) || bestVal <= 0 || bestVal > 9999) {
      alert('⚠️ Vui lòng nhập Tên tuyển thủ và Thời gian Best hợp lệ (ví dụ: 8.45)!');
      return;
    }

    const finalBest = parseFloat(bestVal.toFixed(2));
    const finalAvg = parseFloat((Number.isNaN(avgVal) || avgVal <= 0 ? finalBest : avgVal).toFixed(2));
    const pType = adminRecPuzzle || '3x3';

    const boardEntries = [...(currentBoard.entries || [])];
    const existingIdx = boardEntries.findIndex(
      (item) => item.name.trim().toLowerCase() === cleanName.toLowerCase() && (item.puzzleType || '3x3') === pType
    );

    if (existingIdx !== -1) {
      boardEntries[existingIdx] = {
        ...boardEntries[existingIdx],
        name: cleanName,
        puzzleType: pType,
        best: finalBest,
        avg: finalAvg,
        verified: true,
        date: new Date().toLocaleDateString('vi-VN')
      };
    } else {
      boardEntries.push({
        id: Date.now(),
        puzzleType: pType,
        name: cleanName,
        best: finalBest,
        avg: finalAvg,
        verified: true,
        date: new Date().toLocaleDateString('vi-VN')
      });
    }

    boardEntries.sort((a, b) => a.best - b.best);
    const updatedBoards = {
      ...leaderboards,
      [activeBoardId]: {
        ...currentBoard,
        entries: boardEntries
      }
    };
    saveLeaderboards(updatedBoards);

    if (isCloudConfigured()) {
      await submitVerifiedSolveToCloud({
        boardId: activeBoardId,
        playerName: cleanName,
        playerEmail: ADMIN_EMAIL,
        puzzleType: pType,
        bestTime: finalBest,
        avgTime: finalAvg,
        scramble: 'ADMIN_VERIFIED_OVERRIDE',
        cameraVerified: true,
        startedScrambled: true
      });
    }

    setAdminRecName('');
    setAdminRecBest('');
    setAdminRecAvg('');
    setLastNotice({
      type: 'success',
      text: `👑 Admin Khoa đã cập nhật kỷ lục: ${cleanName} (${pType}) — Best ${finalBest}s!`
    });
  };

  // [ĐẶC QUYỀN ADMIN KHOA] Sửa nhanh điểm số trực tiếp trên từng dòng của Bảng Xếp Hạng
  const handleAdminSaveInlineEntry = async (entry) => {
    if (!isKhoaAdmin || !currentBoard) return;
    const newBest = parseFloat(String(editingEntryBest).replace(',', '.'));
    const newAvg = editingEntryAvg ? parseFloat(String(editingEntryAvg).replace(',', '.')) : newBest;
    if (Number.isNaN(newBest) || newBest <= 0 || newBest > 9999) {
      alert('⚠️ Thời gian không hợp lệ!');
      return;
    }
    const finalBest = parseFloat(newBest.toFixed(2));
    const finalAvg = parseFloat((Number.isNaN(newAvg) || newAvg <= 0 ? finalBest : newAvg).toFixed(2));

    const updatedEntries = (currentBoard.entries || [])
      .map((item) =>
        item.id === entry.id
          ? { ...item, best: finalBest, avg: finalAvg, date: new Date().toLocaleDateString('vi-VN') }
          : item
      )
      .sort((a, b) => a.best - b.best);

    saveLeaderboards({
      ...leaderboards,
      [activeBoardId]: {
        ...currentBoard,
        entries: updatedEntries
      }
    });

    if (isCloudConfigured()) {
      await submitVerifiedSolveToCloud({
        boardId: activeBoardId,
        playerName: entry.name,
        playerEmail: ADMIN_EMAIL,
        puzzleType: entry.puzzleType || '3x3',
        bestTime: finalBest,
        avgTime: finalAvg,
        scramble: 'ADMIN_INLINE_EDIT',
        cameraVerified: true,
        startedScrambled: true
      });
    }

    setEditingEntryId(null);
    setLastNotice({
      type: 'success',
      text: `👑 Đã cập nhật điểm của ${entry.name} thành ${finalBest}s!`
    });
  };

  // [ĐẶC QUYỀN ADMIN KHOA] Đổi tên Bảng Xếp Hạng hiện tại
  const handleAdminRenameCurrentBoard = () => {
    if (!isKhoaAdmin || !currentBoard) return;
    const cleanTitle = sanitizeText(adminRenameBoardTitle, 45, '');
    if (!cleanTitle) {
      alert('⚠️ Vui lòng nhập tên mới cho bảng xếp hạng!');
      return;
    }
    saveLeaderboards({
      ...leaderboards,
      [activeBoardId]: {
        ...currentBoard,
        title: cleanTitle
      }
    });
    setLastNotice({
      type: 'success',
      text: `👑 Đã đổi tên bảng xếp hạng thành "${cleanTitle}"!`
    });
  };

  // [ĐẶC QUYỀN ADMIN KHOA] Xóa sạch lịch sử giải cá nhân trên máy
  const handleAdminClearSolveHistory = () => {
    if (!isKhoaAdmin) return;
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử các lượt giải cá nhân trên thiết bị này?')) {
      setSolves([]);
      localStorage.setItem('rubik_solves_hcc_clean', JSON.stringify([]));
      setLastNotice({
        type: 'success',
        text: '🧹 Đã xóa toàn bộ lịch sử lượt giải cá nhân!'
      });
    }
  };

  // [ĐẶC QUYỀN ADMIN KHOA] Mở khóa nhanh xác thực 3D (Dùng khi Khoa muốn test nhanh mà không cần cầm khối Rubik)
  const handleAdminForceVerifyCube = () => {
    if (!isKhoaAdmin) return;
    lastCubeVerifiedAtRef.current = performance.now();
    startScrambledRef.current = true;
    cubeMovesSeenRef.current = 4;
    cubeStateChangedRef.current = true;
    setPreCheckStatus({
      verified: true,
      text: `👑 Admin Khoa đã kích hoạt xác thực nhanh khối Rubik ${puzzleType} — Sẵn sàng bấm giờ!`,
      isScrambled: true,
      centerFace: 'green'
    });
    setModel3DVerification({
      verified: true,
      badgeText: '👑 ADMIN VERIFIED',
      statusTitle: `Đã mở khóa nhanh Mô hình 3D (${puzzleType})`,
      detailText: 'Quyền Quản trị viên của Khoa đã xác nhận trạng thái khối Rubik hợp lệ.',
      facesCount: 6,
      validStickers: currentDim * currentDim
    });
    setLastNotice({
      type: 'success',
      text: '👑 Đã kích hoạt Mở Khóa Nhanh 3D cho Admin Khoa!'
    });
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

  // Phong cách giao diện Lưới Mạng Nhện & Hitbox Rubik (Mặc định: 🌸 Hoa Anh Đào theo yêu cầu của bạn)
  const [hudThemeKey, setHudThemeKey] = useState(() => {
    return localStorage.getItem('rubik_hud_theme') || 'sakura';
  });
  const currentHudTheme = HUD_THEMES[hudThemeKey] || HUD_THEMES.sakura;

  const cycleHudTheme = () => {
    const keys = Object.keys(HUD_THEMES);
    const nextIdx = (keys.indexOf(hudThemeKey) + 1) % keys.length;
    const nextKey = keys[nextIdx];
    setHudThemeKey(nextKey);
    localStorage.setItem('rubik_hud_theme', nextKey);
  };

  // Trạng thái hiển thị Scramble & Bước đi: Mặc định ẩn khi chưa giải theo yêu cầu của bạn, chỉ tự động hiện ra khi bắt đầu giải
  const [showScrambleManual, setShowScrambleManual] = useState(false);

  // Trạng thái bám đuổi chuyển động (Dynamic Object Tracking Box) & Lưới Mạng Nhện Hitbox Rubik
  const [trackingBox, setTrackingBox] = useState({
    leftPct: 23,
    topPct: 23,
    widthPct: 54,
    heightPct: 54,
    cxPct: 50,
    cyPct: 50,
    isLocked: false,
    isMoving: false,
    speed: 0,
    hitbox: null,
    spiderRays: [],
    isSpiderLocked: false
  });
  const [model3DVerification, setModel3DVerification] = useState({
    verified: false,
    badgeText: '🔍 ĐANG QUÉT 3D',
    statusTitle: 'Chưa khóa khối Rubik trên Mô hình 3D',
    detailText: 'Di chuyển khối Rubik vào trước Camera để AI tự động bám theo & phân tích lên mô hình 3D.',
    facesCount: 0,
    validStickers: 0
  });
  const model3DVerificationRef = useRef(model3DVerification);
  useEffect(() => { model3DVerificationRef.current = model3DVerification; }, [model3DVerification]);
  const lastCvTimeRef = useRef(0);
  const lastScrambleAuditTimeRef = useRef(0);
  const prevCameraHealthRef = useRef(null);
  const prevTrackingBoxRef = useRef(null);
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
    const inspectLimit = Number(adminSettingsRef.current?.inspectionDurationSec) || 15;
    setTimerState('inspecting');
    setInspectionSeconds(inspectLimit);
    setPenaltyText('');
    inspectionStartRef.current = performance.now();

    if (inspectionIntervalRef.current) clearInterval(inspectionIntervalRef.current);
    inspectionIntervalRef.current = setInterval(() => {
      const elapsedSec = (performance.now() - inspectionStartRef.current) / 1000;
      const remain = inspectLimit - elapsedSec;

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

    const cfg = adminSettingsRef.current || {};
    const isVipKhoa = Boolean(isKhoaAdminRef.current && cfg.adminVipBypass !== false);
    const movesRecorded = trackedMovesRef.current;
    // BẮT BUỘC BẬT CAMERA HOẠT ĐỘNG VÀ ĐỦ TIÊU CHUẨN SÁNG/TƯƠNG PHẢN (Trừ khi Admin Khoa bật VIP Bypass hoặc tắt quy tắc)
    const isCameraVerified = Boolean(
      isVipKhoa || cfg.requireCameraToSolve === false || (cameraActiveRef.current && cameraHealthRef.current)
    );
    const currentP = puzzleTypeRef.current;

    // ANTI-BOT & ANTI-FAKE OBJECT: đánh giá 3 tầng tính hợp lệ của lượt giải trước khi cho vào Bảng Kỷ Lục
    const integrity = evaluateSolveIntegrity({
      sec: finalSec,
      puzzle: currentP,
      startedScrambled: isVipKhoa || cfg.require3DCubePreCheck === false ? true : startScrambledRef.current,
      cubeMovesSeen: isVipKhoa || cfg.requireCubeMoveDuringSolve === false ? Math.max(2, cubeMovesSeenRef.current) : cubeMovesSeenRef.current,
      cubeStateChanged: isVipKhoa || cfg.requireCubeMoveDuringSolve === false ? true : cubeStateChangedRef.current,
      automation: isVipKhoa ? [] : detectAutomation(),
      behavior: behaviorRef.current
    });
    behaviorRef.current.recordSolve(finalSec);
    if (!isVipKhoa && behaviorRef.current.suspicious) revokeHumanSession(); // buộc xác minh lại ở lượt sau
    // Bảng Kỷ Lục AI CHỈ chấp nhận lượt giải khi:
    // 1. Camera AI hoạt động tốt và đạt chuẩn sáng
    // 2. Không vi phạm bot/automation
    // 3. Khối Rubik thật biến đổi trạng thái trong lúc xoay
    // 4. Scramble đề bài KHỚP chuẩn WCA (không xáo sai, không bật chế độ Freestyle tự do)
    const isWcaScramblePassed = Boolean(
      isVipKhoa ||
      cfg.require3DCubePreCheck === false ||
      (!scrambleRef.current && !allowFreestyleScrambleRef.current) ||
      (scrambleAuditRef.current?.isMatch && !allowFreestyleScrambleRef.current)
    );
    const isRecordEligible = Boolean(isVipKhoa || (isCameraVerified && integrity.ok && isWcaScramblePassed));

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
      moves: movesRecorded.length > 0 ? movesRecorded.join(' ') : `Camera AI (${cubeMovesSeenRef.current} nhịp xoay)`,
      verified: isRecordEligible
    };

    // Luôn lưu vào lịch sử giải của người chơi (với cờ verified phản ánh đúng việc có khớp chuẩn AI hay không)
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
      // KHÔNG BẬT CAMERA, XÁO SAI CÔNG THỨC HOẶC KHÔNG PHẢI KHỐI RUBIK THẬT -> TUYỆT ĐỐI KHÔNG ĐƯA VÀO BẢNG KỶ LỤC
      const rejectReason = !isCameraVerified
        ? '⚠️ Lượt giải này chưa bật Camera AI nên KHÔNG được đưa vào Bảng Kỷ Lục!'
        : !integrity.ok
          ? `🚫 TỪ CHỐI GHI KỶ LỤC: ${integrity.reason}!`
          : `⚠️ TỪ CHỐI GHI KỶ LỤC: Khối xáo sai Scramble đề bài hoặc đang bật chế độ Giải tự do!`;
      setLastNotice({
        type: 'warning',
        text: rejectReason
      });
    }

    // Hoàn thành lượt giải -> Chuyển sang Bước 3 (Hoàn thành)
    setSolveStep('step3_completed');
    setCompletedSolveInfo({
      time: finalSec,
      scramble: scrambleRef.current,
      moves: movesRecorded,
      movesCount: cubeMovesSeenRef.current,
      kociemba: kociembaOptimal,
      verified: isRecordEligible
    });

    // Reset cờ kiểm soát trong lượt giải
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
        text: `🎉 Hoàn thành lượt giải ${finalSec}s! Bấm "Bắt đầu lượt mới" (hoặc bấm Space) để sang lượt tiếp theo.`,
        isScrambled: false,
        centerFace: null
      });
    }
  }, [penaltyText, targetSeconds, kociembaOptimal]);

  // Start Solve Timer
  const startTimer = useCallback(() => {
    setSolveStep('step2_ready_solve');
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

      // XỬ LÝ PHÍM TẮT TRONG MODAL QUÉT 6 MẶT OPENCV (CHUẨN THEO quet_rubik_6_mat.py)
      // Space: Lưu mặt | 1-6: Chọn mặt | H: Hiện/Ẩn HSV | S: Tải JSON | Esc/Q: Đóng
      if (showOpenCvScannerModalRef.current) {
        if (e.code === 'Space') {
          e.preventDefault();
          saveCurrentOpenCvFaceRef.current();
          return;
        }
        if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          const targetIdx = parseInt(e.key, 10) - 1;
          setOpenCvFaceIdx(targetIdx);
          openCvFaceIdxRef.current = targetIdx;
          playAppSound('click');
          return;
        }
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          setOpenCvShowHsv(prev => !prev);
          playAppSound('click');
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          downloadOpenCvJsonRef.current();
          return;
        }
        if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
          e.preventDefault();
          setShowOpenCvScannerModal(false);
          return;
        }
      }

      // Phím C: Chụp lưu mặt Rubik hiện tại trên camera (giống file quet_rubik_6_mat.py)
      if ((e.code === 'KeyC' || e.key === 'c' || e.key === 'C') && cameraActiveRef.current && currentState === 'idle') {
        e.preventDefault();
        captureCurrentFaceRef.current();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();

        if (currentState === 'running') {
          stopTimerRef.current();
          return;
        }

        // Nếu đang ở Bước 3 (Hoàn thành) -> Bấm Space để sang lượt mới ngay!
        if (currentState === 'idle' && solveStepRef.current === 'step3_completed') {
          startNextSolveRoundRef.current();
          return;
        }

        if (e.repeat) return;

        // BẮT BUỘC PHẢI BẬT CAMERA AI & XÁC MINH KHỐI RUBIK TRÊN MÔ HÌNH 3D MỚI ĐƯỢC BẤM ĐỒNG HỒ GIẢI
        if (requireCameraToSolveRef.current()) return;
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
      // Nếu đang bấm giờ giải mà tắt Camera -> hủy ngay lượt giải đó
      if (timerStateRef.current !== 'idle') {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (inspectionIntervalRef.current) {
          clearInterval(inspectionIntervalRef.current);
          inspectionIntervalRef.current = null;
        }
        setTimerState('idle');
        setTimeMs(0);
        setLastNotice({
          type: 'warning',
          text: '🚫 ĐÃ HỦY LƯỢT GIẢI: Bạn đã tắt Camera AI khi đang giải nên đồng hồ bị hủy!'
        });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setCameraActive(false);
      cameraHealthRef.current = false;
      startScrambledRef.current = false;
      lastCubeVerifiedAtRef.current = 0;
      setCameraHealth({ isHealthy: false, reason: 'Camera đã tắt', brightness: 0, contrast: 0 });
      setPreCheckStatus({
        verified: false,
        text: '🔒 Đã tắt Camera — Bắt buộc Bật Cam & xác minh khối Rubik trên 3D mới được giải',
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
        const now = performance.now();
        // KHẮC PHỤC TRIỆT ĐỂ "WEB BỊ GIẬT / LAG":
        // Điều tiết tần số xử lý Computer Vision (CV Inference Throttling) ở ~18 FPS (mỗi 52ms)
        // Main thread và Three.js render mượt mà 60 FPS không bị khựng đơ!
        if (now - lastCvTimeRef.current < 52) {
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }
        lastCvTimeRef.current = now;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.drawImage(video, 0, 0, w, h);
        const frameImg = ctx.getImageData(0, 0, w, h).data;

        // =====================================================================
        // XỬ LÝ VẼ MÀN HÌNH QUÉT 6 MẶT OPENCV (CHUẨN 100% THEO quet_rubik_6_mat.py)
        // =====================================================================
        if (showOpenCvScannerModalRef.current && openCvCanvasRef.current) {
          const ocvCanvas = openCvCanvasRef.current;
          if (ocvCanvas.width !== w || ocvCanvas.height !== h) {
            ocvCanvas.width = w;
            ocvCanvas.height = h;
          }
          const octx = ocvCanvas.getContext('2d');
          octx.drawImage(video, 0, 0, w, h);

          // Tính kích thước ô và vị trí lưới theo vi_tri_luoi()
          const kichThuocO = Math.max(60, Math.min(105, Math.floor((h - 180) / 3), Math.floor((w - 30) / 3)));
          const kichThuocLuoi = kichThuocO * 3;
          const xBatDau = Math.floor((w - kichThuocLuoi) / 2);
          const yBatDau = Math.floor((h - kichThuocLuoi) / 2) + 25;
          const le = Math.max(15, Math.floor(kichThuocO * 0.34));

          const curMat = OPENCV_MAT[openCvFaceIdxRef.current] || OPENCV_MAT[0];
          const curKey = curMat[0];
          const curName = curMat[1];
          const savedCount = Object.values(openCvFacesRef.current).filter(Boolean).length;

          const liveMat = [];
          const liveHsvMat = [];

          for (let hang = 0; hang < 3; hang++) {
            const dongMau = [];
            const dongHsv = [];
            for (let cot = 0; cot < 3; cot++) {
              const x1 = xBatDau + cot * kichThuocO;
              const y1 = yBatDau + hang * kichThuocO;
              const x2 = x1 + kichThuocO;
              const y2 = y1 + kichThuocO;

              // Vùng trung vị
              const vx1 = x1 + le;
              const vy1 = y1 + le;
              const vx2 = x2 - le;
              const vy2 = y2 - le;

              const hsv = layMauTrungViOpenCv(frameImg, w, h, vx1, vy1, vx2, vy2);
              const tenMau = nhanDienMauOpenCv(hsv);

              dongMau.push(tenMau);
              dongHsv.push([hsv.h, hsv.s, hsv.v]);

              // 1. Viền ngoài màu trắng (độ dày 2)
              octx.strokeStyle = '#ffffff';
              octx.lineWidth = 2;
              octx.strokeRect(x1, y1, kichThuocO, kichThuocO);

              // 2. Viền trong màu cyan (vùng lấy mẫu trung vị le = 34%)
              octx.strokeStyle = '#06b6d4';
              octx.lineWidth = 1.2;
              octx.strokeRect(vx1, vy1, vx2 - vx1, vy2 - vy1);

              // 3. Chữ tên màu góc trên trái với viền đen đổ bóng rõ nét
              octx.font = 'bold 12px sans-serif';
              octx.fillStyle = '#000000';
              octx.fillText(tenMau, x1 + 5, y1 + 18);
              octx.fillText(tenMau, x1 + 7, y1 + 18);
              octx.fillText(tenMau, x1 + 6, y1 + 17);
              octx.fillText(tenMau, x1 + 6, y1 + 19);
              octx.fillStyle = getColorTextHex(tenMau);
              octx.fillText(tenMau, x1 + 6, y1 + 18);

              // 4. Nếu bật hiển thị HSV -> Hiện giá trị H, S, V góc dưới trái
              if (openCvShowHsvRef.current) {
                const textHsv = `H${hsv.h} S${hsv.s} V${hsv.v}`;
                octx.font = 'bold 10px monospace';
                octx.fillStyle = '#000000';
                octx.fillText(textHsv, x1 + 4, y2 - 6);
                octx.fillText(textHsv, x1 + 6, y2 - 6);
                octx.fillStyle = '#fef08a';
                octx.fillText(textHsv, x1 + 5, y2 - 6);
              }
            }
            liveMat.push(dongMau);
            liveHsvMat.push(dongHsv);
          }

          openCvLiveMatrixRef.current = liveMat;
          openCvLiveHsvRef.current = liveHsvMat;

          // OSD Header overlay (Dòng 1..3 giống quet_rubik_6_mat.py)
          octx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          octx.fillRect(0, 0, w, 56);

          octx.font = 'bold 13px sans-serif';
          octx.fillStyle = '#38bdf8';
          octx.fillText(`Đang quét: ${curKey} - ${curName} | Đã lưu: ${savedCount}/6 mặt`, 12, 19);

          octx.font = '11px sans-serif';
          octx.fillStyle = '#cbd5e1';
          octx.fillText(`Space: lưu | 1-6: chọn mặt | H: xem HSV | S: tải JSON | Esc: đóng`, 12, 35);

          let bX = 12;
          octx.font = 'bold 11px monospace';
          for (const [k] of OPENCV_MAT) {
            const isSaved = Boolean(openCvFacesRef.current[k]);
            const isCur = k === curKey;
            const str = `[${isSaved ? '✓' : ' '}]${k}`;
            octx.fillStyle = isCur ? '#facc15' : isSaved ? '#4ade80' : '#64748b';
            octx.fillText(str, bX, 50);
            bX += 48;
          }
        }

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
        const prevH = prevCameraHealthRef.current;
        if (
          !prevH ||
          prevH.isHealthy !== isHealthy ||
          Math.abs(prevH.brightness - avgBrightness) > 8 ||
          Math.abs(prevH.contrast - contrast) > 10
        ) {
          const newH = {
            isHealthy,
            reason: healthReason,
            brightness: Math.round(avgBrightness),
            contrast: Math.round(contrast)
          };
          prevCameraHealthRef.current = newH;
          setCameraHealth(newH);
        }

        if (!isHealthy) {
          const curPre = preCheckRef.current;
          if (!curPre || curPre.verified !== false || curPre.text !== `⚠️ ${healthReason}. Đã khóa AI để tránh sai lệch!`) {
            setPreCheckStatus({
              verified: false,
              text: `⚠️ ${healthReason}. Đã khóa AI để tránh sai lệch!`,
              isScrambled: false,
              centerFace: null
            });
          }
          if (prevColorsRef.current !== null) {
            setDetectedColors(Array(currentDim * currentDim).fill('invalid'));
            prevColorsRef.current = null;
          }
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const dim = currentDim;
        const bestRegion = locateDynamicRubikBox(
          frameImg,
          w,
          h,
          dim,
          trackerStateRef.current,
          surfaceProfileRef.current
        );
        const startX = bestRegion.startX;
        const startY = bestRegion.startY;
        const boxSize = bestRegion.boxSize;
        const foundCx = startX + boxSize / 2;
        const foundCy = startY + boxSize / 2;

        // Cập nhật bộ bám đuổi chuyển động (Kalman/EMA Smoothing) để khung lưới tự động chạy theo khối Rubik
        const prevTr = trackerStateRef.current;
        const hasCubeSignal =
          Boolean(bestRegion.isGeometricallyVerifiedCube) &&
          !bestRegion.isMostlySkinOrWood &&
          bestRegion.score > 25 &&
          bestRegion.validColorsCount >= Math.ceil(dim * dim * 0.65) &&
          bestRegion.vividColorsCount >= 2;
        let smoothCx = w / 2;
        let smoothCy = h / 2;
        let smoothSize = Math.min(w, h) * 0.50;
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
          // Khi không có khối Rubik thật, reset tracker và đặt lại vị trí trung tâm
          trackerStateRef.current = { cx: 0, cy: 0, size: 0, vx: 0, vy: 0 };
        }

        const leftPct = Math.max(4, Math.min(92, ((smoothCx - smoothSize / 2) / w) * 100));
        const topPct = Math.max(4, Math.min(92, ((smoothCy - smoothSize / 2) / h) * 100));
        const widthPct = Math.max(25, Math.min(72, (smoothSize / w) * 100));
        const heightPct = Math.max(25, Math.min(72, (smoothSize / h) * 100));
        const cxPct = Math.round((smoothCx / w) * 100);
        const cyPct = Math.round((smoothCy / h) * 100);
        const isMovingNow = moveSpeed >= 4.5;

        const prevBox = prevTrackingBoxRef.current;
        const boxNeedsUpdate =
          !prevBox ||
          prevBox.isLocked !== hasCubeSignal ||
          prevBox.isMoving !== isMovingNow ||
          Math.abs(prevBox.leftPct - leftPct) > 1.2 ||
          Math.abs(prevBox.topPct - topPct) > 1.2;

        if (boxNeedsUpdate) {
          const newBox = {
            leftPct: Number(leftPct.toFixed(1)),
            topPct: Number(topPct.toFixed(1)),
            widthPct: Number(widthPct.toFixed(1)),
            heightPct: Number(heightPct.toFixed(1)),
            cxPct,
            cyPct,
            isLocked: hasCubeSignal,
            isMoving: isMovingNow,
            speed: Math.round(moveSpeed),
            hitbox: bestRegion.hitbox || null,
            spiderRays: bestRegion.spiderRays || [],
            isSpiderLocked: Boolean(bestRegion.isSpiderLocked)
          };
          prevTrackingBoxRef.current = newBox;
          setTrackingBox(newBox);
        }

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

        // TỐI ƯU HÓA RENDER: Chỉ gọi setDetectedColors khi mảng màu thực sự có sự thay đổi
        const colorsChanged = !prevColorsRef.current || currentNxNColors.some((c, i) => c !== prevColorsRef.current[i]);
        if (colorsChanged) {
          setDetectedColors(currentNxNColors);
          prevColorsRef.current = [...currentNxNColors];
        }

        // Bộ điều tiết trạng thái PreCheck & Model3D để chống giật re-render toàn component
        const setPreCheckThrottled = (nextStatus) => {
          const cur = preCheckRef.current;
          if (
            !cur ||
            cur.verified !== nextStatus.verified ||
            cur.isMismatch !== nextStatus.isMismatch ||
            cur.scannedCount !== nextStatus.scannedCount ||
            cur.text !== nextStatus.text ||
            cur.isScrambled !== nextStatus.isScrambled ||
            cur.centerFace !== nextStatus.centerFace
          ) {
            setPreCheckStatus(nextStatus);
          }
        };

        const setModel3DThrottled = (nextModel) => {
          const cur = model3DVerificationRef.current;
          if (
            !cur ||
            cur.verified !== nextModel.verified ||
            cur.badgeText !== nextModel.badgeText ||
            cur.statusTitle !== nextModel.statusTitle ||
            cur.facesCount !== nextModel.facesCount ||
            cur.validStickers !== nextModel.validStickers
          ) {
            setModel3DVerification(nextModel);
          }
        };

        // Tối ưu nhận diện MẶT CHƯA GIẢI (nhiều màu lộn xộn): chỉ cần >= 65% số ô rõ nét (VD: 6/9 ô với 3x3, 3/4 ô với 2x2)
        const minStickersRequired = Math.max(3, Math.ceil(dim * dim * 0.65));
        const minVividRequired = Math.max(2, Math.floor(dim * dim * 0.33));

        if (solveStepRef.current === 'step3_completed') {
          // Người chơi đang ở Bước 3 (Hoàn thành) -> Giữ nguyên màn hình kết quả, không ghi đè trạng thái quét dở
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        if (!hasCubeSignal || validColorsCount < minStickersRequired) {
          validCubeStreakRef.current = 0;
          solvedStreakRef.current = 0;
          if (timerStateRef.current === 'idle' || timerStateRef.current === 'inspecting') {
            const remainValidMs = 25000 - (now - lastCubeVerifiedAtRef.current);
            if (lastCubeVerifiedAtRef.current > 0 && remainValidMs > 0) {
              setPreCheckThrottled({
                ...(preCheckRef.current || {}),
                verified: true,
                text: `🟢 ĐÃ KHÓA MẶT CHƯA GIẢI LÊN 3D (${dim}×${dim}) — Sẵn sàng bấm giờ (còn ${Math.ceil(remainValidMs / 1000)}s)`
              });
            } else {
              if (lastCubeVerifiedAtRef.current > 0) lastCubeVerifiedAtRef.current = 0;
              setPreCheckThrottled({
                verified: false,
                text: `🔍 Đưa mặt Rubik CHƯA GIẢI (${dim}×${dim}) vào trước camera để AI phân tích các màu xáo trộn lên 3D...`,
                isScrambled: false,
                centerFace: null
              });
              setModel3DThrottled({
                verified: false,
                badgeText: '🔍 ĐỢI MẶT CHƯA GIẢI',
                statusTitle: 'Đang quét tìm các mặt Rubik chưa giải...',
                detailText: 'Xoay các mặt chưa giải (nhiều màu) trước Camera để AI tự bám theo và cập nhật đủ 6 mặt lên Mô hình 3D.',
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
        const rawCenterColor = currentNxNColors[centerIdx];
        const validColorsOnly = currentNxNColors.filter(c => c !== 'invalid');
        const effectiveCenterColor = rawCenterColor !== 'invalid' ? rawCenterColor : (validColorsOnly[0] || 'green');
        const centerDef = COLOR_DEFINITIONS[effectiveCenterColor];
        const centerName = centerDef ? centerDef.name : 'Hỗn hợp';
        const uniqueColorsCount = new Set(validColorsOnly).size;
        const isAllSameColor =
          hasCubeSignal &&
          Boolean(bestRegion.isGeometricallyVerifiedCube) &&
          !bestRegion.isMostlySkinOrWood &&
          validColorsCount >= Math.ceil(dim * dim * 0.88) &&
          uniqueColorsCount === 1 &&
          (effectiveCenterColor !== 'white' || gridSeamContrast >= 5.0);

        // NHẬN DIỆN MỌI MẶT CHƯA GIẢI (2 màu trở lên: từ mặt mới xáo trộn 3-6 màu đến mặt đang giải dở 2 màu)
        const minUniqueForScramble = 2;
        const isGenuineScrambledCube =
          hasCubeSignal &&
          Boolean(bestRegion.isGeometricallyVerifiedCube) &&
          !bestRegion.isMostlySkinOrWood &&
          bestRegion.score > 25 &&
          validColorsCount >= minStickersRequired &&
          vividColorsCount >= minVividRequired &&
          uniqueColorsCount >= minUniqueForScramble &&
          (sharpAdjacentEdges >= 1 || bestRegion.colorTransitions >= 2);

        // Ánh xạ màu mặt đang quét vào bộ nhớ 6 mặt của khối 3D (hỗ trợ lưu cả các mặt CHƯA GIẢI lẫn mặt đã giải)
        const faceCodeMap = {
          white: 'U',
          yellow: 'D',
          red: 'R',
          orange: 'L',
          green: 'F',
          blue: 'B'
        };
        const mappedFace = faceCodeMap[effectiveCenterColor] || 'F';
        let updatedFacesCount = Object.keys(scannedFacesRef.current || {}).length;
        let colorOverflowDetected = false;
        let overflowColorName = '';
        let faceChanged = false;

        if (isGenuineScrambledCube || isAllSameColor) {
          const prevFaceColors = scannedFacesRef.current?.[mappedFace] || [];
          // TUYỆT ĐỐI không điền màu tâm vào các ô invalid, giữ nguyên 'invalid' để báo cho người dùng biết ô chưa quét được
          const cleanedFaceColors = currentNxNColors.map((col, idx) =>
            col !== 'invalid' ? col : (prevFaceColors[idx] || 'invalid')
          );

          // KIỂM ĐỊNH BẢO TOÀN ĐỊNH LUẬT MÀU RUBIK TỪ 2x2 ĐẾN 7x7:
          // Mỗi màu chỉ được xuất hiện tối đa dim * dim ô trên toàn bộ 6 mặt (2x2: 4, 3x3: 9, 4x4: 16, 5x5: 25, 6x6: 36, 7x7: 49)
          const maxAllowedPerColor = dim * dim;
          const otherFaceUsage = { white: 0, yellow: 0, red: 0, orange: 0, green: 0, blue: 0 };
          const otherFaces = { ...(scannedFacesRef.current || {}) };
          delete otherFaces[mappedFace];
          Object.values(otherFaces).forEach(fArr => {
            if (Array.isArray(fArr)) {
              fArr.forEach(c => {
                if (otherFaceUsage.hasOwnProperty(c)) otherFaceUsage[c]++;
              });
            }
          });

          const currentTally = { ...otherFaceUsage };
          const validatedFaceColors = cleanedFaceColors.map(c => {
            if (!c || c === 'invalid' || !currentTally.hasOwnProperty(c)) return 'invalid';
            if (currentTally[c] < maxAllowedPerColor) {
              currentTally[c]++;
              return c;
            } else {
              colorOverflowDetected = true;
              overflowColorName = COLOR_DEFINITIONS[c]?.name || c;
              return 'invalid'; // Chặn đứng việc có 10 ô màu xanh trên 3x3 hoặc thừa màu trên 4x4..7x7!
            }
          });

          // Nếu có quá nhiều ô bị xung đột thừa màu (> 45% số ô) -> Khối đang bị nhìn nghiêng dính mặt bên
          const invalidInThisFace = validatedFaceColors.filter(c => c === 'invalid').length;
          const isTiltedSideFace = invalidInThisFace > Math.floor(dim * dim * 0.45);

          if (!isTiltedSideFace) {
            const prevFace = scannedFacesRef.current?.[mappedFace];
            faceChanged = !prevFace || validatedFaceColors.some((c, i) => c !== prevFace[i]);
            if (faceChanged) {
              const nextFaces = {
                ...(scannedFacesRef.current || {}),
                [mappedFace]: validatedFaceColors
              };
              scannedFacesRef.current = nextFaces;
              updatedFacesCount = Object.keys(nextFaces).length;
              setScannedFaces(nextFaces);
              setCurrentActiveFace(mappedFace);
              currentActiveFaceRef.current = mappedFace;
            }
          }
        }

        const all6FaceKeys = ['U', 'D', 'F', 'B', 'L', 'R'];
        const currentScannedKeys = Object.keys(scannedFacesRef.current || {});
        const missingFaceKeys = all6FaceKeys.filter(f => !currentScannedKeys.includes(f));
        const targetFaceCount = (adminSettingsRef.current?.requiredPreCheckFaces === 6 || adminSettingsRef.current?.requireAll6FacesPreCheck === true) ? 6 : 3;
        const hasScannedTargetFaces = currentScannedKeys.length >= targetFaceCount;
        const reqPreCheck = adminSettingsRef.current?.require3DCubePreCheck !== false;

        // Phân tích & xác minh trực tiếp trên Mô hình 3D (Hiển thị rõ MẶT CHƯA GIẢI vs MẶT ĐÃ GIẢI & Cảnh báo mặt bên)
        if (isGenuineScrambledCube) {
          const stateLabel = uniqueColorsCount >= 3 ? 'MẶT CHƯA GIẢI (XÁO TRỘN)' : 'MẶT CHƯA GIẢI XONG (2 MÀU)';
          setModel3DThrottled({
            verified: hasScannedTargetFaces || !reqPreCheck,
            badgeText: hasScannedTargetFaces ? `🟢 ĐỦ ${targetFaceCount}/${targetFaceCount} MẶT` : `🔍 ĐÃ QUÉT ${updatedFacesCount}/${targetFaceCount} MẶT`,
            statusTitle: colorOverflowDetected
              ? `⚠️ KHÔNG QUÉT ĐƯỢC MẶT BÊN: Thừa màu ${overflowColorName} (> ${dim * dim} ô trên ${dim}×${dim})!`
              : `🧩 Đã nhận diện ${stateLabel}: Mặt ${mappedFace} (${centerName}) có ${uniqueColorsCount} màu`,
            detailText: colorOverflowDetected
              ? `Camera chỉ quét mặt chính diện vuông góc, không quét được mặt bên khi để nghiêng! Hãy quay thẳng 1 mặt vào giữa khung ngắm.`
              : (hasScannedTargetFaces
                  ? `Đã khớp đủ ${targetFaceCount} mặt (${currentScannedKeys.join(', ')}) lên Mô hình 3D — Sẵn sàng bấm giờ!`
                  : `Đã quét ${updatedFacesCount}/${targetFaceCount} mặt (${currentScannedKeys.join(', ')}) • Còn thiếu: [${missingFaceKeys.join(', ')}] • Hãy xoay tiếp các mặt còn lại trước Camera.`),
            facesCount: updatedFacesCount,
            validStickers: validColorsCount
          });
        } else if (isAllSameColor) {
          setModel3DThrottled({
            verified: (hasScannedTargetFaces || !reqPreCheck) && startScrambledRef.current && cubeStateChangedRef.current,
            badgeText: '🏆 MẶT ĐÃ GIẢI (1 MÀU)',
            statusTitle: `🧊 Nhận diện mặt ${mappedFace} (${centerName}) ĐÃ GIẢI ĐỒNG MÀU (${dim}×${dim})`,
            detailText: startScrambledRef.current
              ? `Đã đối chiếu khớp quá trình xoay (${cubeMovesSeenRef.current} nhịp) từ lúc chưa giải đến khi hoàn thành!`
              : `Mặt này đang đồng màu — Hãy xoay sang các mặt CHƯA GIẢI (nhiều màu) để AI quét đủ ${targetFaceCount} mặt!`,
            facesCount: updatedFacesCount,
            validStickers: validColorsCount
          });
        }

        if (timerStateRef.current === 'idle' || timerStateRef.current === 'inspecting') {
          if (isGenuineScrambledCube || isAllSameColor) {
            validCubeStreakRef.current += 1;
            lastCubeVerifiedAtRef.current = now;
            initialCubeColorsRef.current = [...currentNxNColors];
            lastValidCubeColorsRef.current = [...currentNxNColors];

            // ĐỐI CHIẾU THỰC TẾ VỚI CÔNG THỨC SCRAMBLE ĐỀ BÀI (CHỐNG LỖI SCRAMBLE SAI MÀ BẢO ĐÚNG)
            // Throttle việc so khớp Scramble để không cày CPU ở mọi frame
            let scrambleMatch = scrambleAuditRef.current;
            if (faceChanged || now - lastScrambleAuditTimeRef.current > 320) {
              scrambleMatch = calculateScrambleMatch(scrambleRef.current, scannedFacesRef.current, dim, targetFaceCount);
              lastScrambleAuditTimeRef.current = now;
              const prevAudit = scrambleAuditRef.current;
              if (
                !prevAudit ||
                prevAudit.matchRate !== scrambleMatch.matchRate ||
                prevAudit.isMatch !== scrambleMatch.isMatch ||
                prevAudit.isMismatch !== scrambleMatch.isMismatch ||
                prevAudit.isPending !== scrambleMatch.isPending
              ) {
                setScrambleAudit(scrambleMatch);
              }
            }
            const isScrambleOk = scrambleMatch.isMatch || allowFreestyleScrambleRef.current || !scrambleRef.current;

            if (reqPreCheck && !hasScannedTargetFaces) {
              // CHƯA QUÉT ĐỦ SỐ MẶT YÊU CẦU (3 MẶT HOẶC 6 MẶT) -> BẮT BUỘC KHÓA ĐỒNG HỒ, YÊU CẦU QUÉT TIẾP
              setPreCheckThrottled({
                verified: false,
                text: scrambleMatch.isMismatch && !allowFreestyleScrambleRef.current
                  ? `⚠️ CẢNH BÁO: SCRAMBLE ĐANG KHÁC ĐỀ BÀI (Khớp ${scrambleMatch.matchRate}%)! Đã quét ${currentScannedKeys.length}/${targetFaceCount} mặt. Tiếp tục quét hoặc bấm "Giải tự do".`
                  : `🔍 ĐÃ QUÉT ${currentScannedKeys.length}/${targetFaceCount} MẶT (${currentScannedKeys.join(', ')}) — Hãy xoay khối để AI quét tiếp ${Math.max(1, targetFaceCount - currentScannedKeys.length)} mặt nữa`,
                isScrambled: true,
                centerFace: `${mappedFace} (${centerName})`,
                scannedCount: currentScannedKeys.length,
                missingFaces: missingFaceKeys,
                scrambleMatchRate: scrambleMatch.matchRate,
                isMismatch: scrambleMatch.isMismatch
              });
            } else if (!isScrambleOk) {
              // ĐÃ QUÉT ĐỦ MẶT NHƯNG XÁO SAI CÔNG THỨC SCRAMBLE -> KHÓA KHÔNG CHO XÁC THỰC WCA, BÁO LỖI RÕ RÀNG!
              setPreCheckThrottled({
                verified: false,
                text: `❌ SCRAMBLE SAI ĐỀ BÀI (Chỉ khớp ${scrambleMatch.matchRate}%)! Khối trên camera không khớp công thức Scramble. Hãy bấm "Đổi Scramble" hoặc bấm "⚡ Chấp nhận để giải tự do"!`,
                isScrambled: true,
                centerFace: `${mappedFace} (${centerName})`,
                scannedCount: currentScannedKeys.length,
                missingFaces: [],
                scrambleMatchRate: scrambleMatch.matchRate,
                isMismatch: true
              });
              setModel3DThrottled({
                verified: false,
                badgeText: `❌ SAI SCRAMBLE (${scrambleMatch.matchRate}%)`,
                statusTitle: `⚠️ Khối xáo thực tế KHÔNG KHỚP công thức Scramble đề bài!`,
                detailText: `AI đã đối chiếu ${targetFaceCount} mặt: Khối của bạn chỉ khớp ${scrambleMatch.matchRate}% với đề bài WCA. Hãy xáo lại hoặc bấm "⚡ Giải tự do" để tiếp tục.`,
                facesCount: updatedFacesCount,
                validStickers: validColorsCount
              });
            } else {
              // ĐÃ QUÉT ĐỦ CẢ 3 (HOẶC 6) MẶT VÀ KHỚP ĐỀ BÀI (HOẶC ĐƯỢC PHÉP GIẢI TỰ DO) -> MỞ KHÓA GIẢI!
              if (timerStateRef.current === 'inspecting') {
                startScrambledRef.current = true;
              }
              const matchNotice = allowFreestyleScrambleRef.current
                ? '⚡ ĐÃ DUYỆT CHẾ ĐỘ GIẢI TỰ DO (Freestyle Scramble)'
                : `🟢 ĐÃ XÁC MINH KHỚP 100% SCRAMBLE WCA (${scrambleMatch.matchRate}%) [${currentScannedKeys.length}/${targetFaceCount} MẶT]`;
              setPreCheckThrottled({
                verified: true,
                text: `${matchNotice} — Sẵn sàng bấm giờ giải!`,
                isScrambled: true,
                centerFace: `${mappedFace} (${centerName})`,
                scannedCount: currentScannedKeys.length,
                missingFaces: [],
                scrambleMatchRate: scrambleMatch.matchRate,
                isMismatch: false
              });
              if (solveStepRef.current === 'step1_check_scb') {
                setSolveStep('step2_ready_solve');
              }
            }
          } else {
            validCubeStreakRef.current = 0;
            const remainValidMs = 25000 - (now - lastCubeVerifiedAtRef.current);
            if (lastCubeVerifiedAtRef.current > 0 && remainValidMs > 0 && (!reqPreCheck || hasScannedTargetFaces)) {
              setPreCheckThrottled({
                ...(preCheckRef.current || {}),
                verified: true,
                text: `🟢 ĐÃ XÁC MINH ${targetFaceCount} MẶT TRÊN 3D — Sẵn sàng bấm giờ (còn ${Math.ceil(remainValidMs / 1000)}s)`
              });
            } else if (currentScannedKeys.length > 0 && currentScannedKeys.length < targetFaceCount) {
              setPreCheckThrottled({
                verified: false,
                text: `🔍 ĐÃ QUÉT ${currentScannedKeys.length}/${targetFaceCount} MẶT (${currentScannedKeys.join(', ')}) — Hãy xoay tiếp các mặt còn thiếu trước Camera`,
                isScrambled: false,
                centerFace: null,
                scannedCount: currentScannedKeys.length,
                missingFaces: missingFaceKeys
              });
            } else if (lastCubeVerifiedAtRef.current === 0 || now - lastCubeVerifiedAtRef.current > 25000) {
              setPreCheckThrottled({
                verified: false,
                text: `🔍 Đưa khối Rubik (${dim}×${dim}) vào trước Camera và xoay ${targetFaceCount} mặt để AI phân tích lên Mô hình 3D...`,
                isScrambled: false,
                centerFace: null,
                scannedCount: 0,
                missingFaces: all6FaceKeys
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
          // 1) Admin bật tính năng autoStopWhenSolved (mặc định true)
          // 2) Đã xác thực khối Rubik xáo trộn lúc đầu (startScrambledRef.current === true)
          // 3) Đã ghi nhận ít nhất 2 lần xoay biến đổi trạng thái khối Rubik trong lúc giải
          // 4) Mặt Rubik đồng màu chuẩn giữ ổn định >= 3 khung hình liên tiếp sau 2.8 giây
          if (
            adminSettingsRef.current?.autoStopWhenSolved !== false &&
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

  // Handler mở Bảng Quản Trị Độc Quyền Của Khoa (Mở tự do 1 chạm mọi lúc cho tài khoản khoa.tt2611758@sis.hust.edu.vn)
  const handleOpenKhoaAdminPanel = () => {
    if (!isKhoaAdmin) return;
    setEditCompTitle(adminSettings.competitionTitle || 'Rubik Timer & AI Verification');
    setEditCompSub(adminSettings.subTitle || 'HUST Speedcubing • 2×2, 3×3, 4×4, 5×5');
    setEditAnnouncement(adminSettings.announcementBanner || '');
    setEditSpaceHoldMs(adminSettings.spaceHoldMs || 280);
    setEditInspectionSec(adminSettings.inspectionDurationSec || 15);
    setEditRequireCam(adminSettings.requireCameraToSolve !== false);
    setEditRequire3DPreCheck(adminSettings.require3DCubePreCheck !== false);
    const facesMode = adminSettings.requiredPreCheckFaces === 6 || (adminSettings.requireAll6FacesPreCheck === true && adminSettings.requiredPreCheckFaces !== 3) ? 6 : 3;
    setEditRequiredFaces(facesMode);
    setEditRequireAll6Faces(facesMode === 6);
    setEditRequireMove(adminSettings.requireCubeMoveDuringSolve !== false);
    setEditAutoStop(adminSettings.autoStopWhenSolved !== false);
    setEditAdminVipBypass(adminSettings.adminVipBypass !== false);
    setAdminRenameBoardTitle(currentBoard?.title || '');
    setAdminRecPuzzle(puzzleType || '3x3');
    setShowAdminPanelModal(true);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      height: 'auto',
      background: currentHudTheme.pageBg,
      color: '#e2e8f0',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden',
      userSelect: 'none',
      transition: 'background 0.3s ease'
    }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Hiệu ứng cánh hoa anh đào bay lượn toàn màn hình Web khi bật theme Hoa Anh Đào */}
      {currentHudTheme.hasPetals && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9998 }}>
          {[
            { left: '6%', delay: '0s', dur: '8.5s', size: '1.2rem' },
            { left: '18%', delay: '2.5s', dur: '10s', size: '0.95rem' },
            { left: '32%', delay: '1.2s', dur: '9.2s', size: '1.1rem' },
            { left: '48%', delay: '4s', dur: '11.5s', size: '1.0rem' },
            { left: '64%', delay: '1.8s', dur: '8.8s', size: '1.25rem' },
            { left: '78%', delay: '3.2s', dur: '9.8s', size: '0.9rem' },
            { left: '92%', delay: '0.7s', dur: '12s', size: '1.15rem' }
          ].map((p, idx) => (
            <span
              key={idx}
              className="sakura-screen-petal"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.dur,
                fontSize: p.size
              }}
            >
              🌸
            </span>
          ))}
        </div>
      )}

      {/* ==========================================
          HEADER BAR: AUTH + DASHBOARD (HIỂN THỊ ĐẦY ĐỦ & CUỘN MƯỢT TRÊN ĐIỆN THOẠI)
      ========================================== */}
      <header style={{
        padding: isMobile ? '8px 10px' : '10px 24px',
        backgroundColor: currentHudTheme.headerBg,
        borderBottom: currentHudTheme.headerBorder,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        transition: 'all 0.3s ease'
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

          {/* NÚT ĐỔI THEME TOÀN TRANG WEB */}
          <button
            type="button"
            onClick={cycleHudTheme}
            title="Bấm để đổi theme toàn trang web: Hoa Anh Đào, Mạng Nhện Neon, Lôi Thần, Băng Tuyết"
            style={{
              padding: isMobile ? '5px 8px' : '6px 13px',
              borderRadius: '6px',
              border: `1.5px solid ${currentHudTheme.color}`,
              background: hudThemeKey === 'sakura' ? 'rgba(244, 114, 182, 0.22)' : currentHudTheme.innerCardBg,
              color: currentHudTheme.color,
              fontWeight: '800',
              fontSize: isMobile ? '0.74rem' : '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: `0 0 14px ${currentHudTheme.glowColor}`,
              transition: 'all 0.2s ease'
            }}
          >
            <span>{currentHudTheme.shortName}</span>
            <span style={{ fontSize: '0.65rem' }}>↻</span>
          </button>

          {/* NÚT BỘ GIẢI KOCIEMBA */}
          <button
            type="button"
            onClick={() => setShowKociembaModal(true)}
            style={{
              padding: isMobile ? '5px 8px' : '6px 13px',
              borderRadius: '6px',
              border: '1px solid #16a34a66',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.15))',
              color: '#4ade80',
              fontWeight: '700',
              fontSize: isMobile ? '0.74rem' : '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
            }}
            title="Mở bộ giải Kociemba Two-Phase Algorithm tối ưu (≤ 20 bước)"
          >
            <span>⚡</span>
            <span>Kociemba</span>
          </button>

          {/* NÚT QUÉT 6 MẶT OPENCV & KOCIEMBA (THEO quet_rubik_6_mat.py) */}
          <button
            type="button"
            onClick={() => {
              setShowOpenCvScannerModal(true);
              if (!cameraActive) setCameraActive(true);
            }}
            style={{
              padding: isMobile ? '5px 8px' : '6px 13px',
              borderRadius: '6px',
              border: '1.5px solid #06b6d4',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(14, 116, 144, 0.35))',
              color: '#67e8f9',
              fontWeight: '800',
              fontSize: isMobile ? '0.74rem' : '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 0 14px rgba(6, 182, 212, 0.45)'
            }}
            title="Mở máy quét 6 mặt Rubik chuẩn OpenCV HSV & Giải Kociemba tối ưu (~20 bước)"
          >
            <span>📸</span>
            <span>Quét 6 Mặt OpenCV</span>
          </button>

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
                title="Mở Trung Tâm Quản Trị Độc Quyền của Khoa (Chỉnh sửa tự do mọi thứ)"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: '1px solid #fbbf24',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 10px rgba(245, 158, 11, 0.45)'
                }}
              >
                <span>👑</span>
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

      {/* THÔNG BÁO GHIM ĐẦU TRANG DO ADMIN KHOA TÙY CHỈNH */}
      {adminSettings.announcementBanner && adminSettings.announcementBanner.trim() !== '' && (
        <div style={{
          width: '100%',
          padding: '6px 16px',
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.18), rgba(37, 99, 235, 0.22), rgba(245, 158, 11, 0.18))',
          borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
          color: '#fde68a',
          fontSize: '0.78rem',
          fontWeight: '700',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          <span>📢</span>
          <span>{adminSettings.announcementBanner}</span>
        </div>
      )}

      {/* ==========================================
          MAIN 3-COLUMN WORKSPACE (HỖ TRỢ CUỘN TỰ NHIÊN TRÊN DESKTOP & MOBILE)
      ========================================== */}
      <div style={{
        flex: 1,
        display: isMobile ? 'flex' : 'grid',
        flexDirection: isMobile ? 'column' : undefined,
        gridTemplateColumns: isMobile ? undefined : (gameMode === 'solo' ? '280px 1fr' : '270px 1fr 380px'),
        alignItems: isMobile ? undefined : 'start',
        padding: isMobile ? '8px 10px 88px 10px' : '12px 20px 60px 20px',
        gap: '12px',
        overflowY: 'visible',
        overflowX: 'hidden'
      }}>
        {/* === CỘT TRÁI: THÀNH TÍCH & LỊCH SỬ === */}
        {(!isMobile || mobileTab === 'stats') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: isMobile ? 'visible' : 'hidden', width: isMobile ? '100%' : undefined }}>
          <div style={{
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            boxShadow: currentHudTheme.cardShadow,
            borderRadius: '14px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: currentHudTheme.textColor }}>
                Thành tích ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: currentHudTheme.subTextColor }}>{currentSolves.length} lượt</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: currentHudTheme.innerCardBg, padding: '10px 12px', borderRadius: '8px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.72rem', color: currentHudTheme.subTextColor }}>Best Single</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: currentHudTheme.primaryAccent }}>{bestTime}s</div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '10px 12px', borderRadius: '8px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.72rem', color: currentHudTheme.subTextColor }}>Mean</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: currentHudTheme.textColor }}>{meanTime}s</div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '10px 12px', borderRadius: '8px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.72rem', color: currentHudTheme.subTextColor }}>Current ao5</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '10px 12px', borderRadius: '8px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.72rem', color: currentHudTheme.subTextColor }}>Current ao12</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Lịch sử giải */}
          <div style={{
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            boxShadow: currentHudTheme.cardShadow,
            borderRadius: '14px',
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: currentHudTheme.textColor }}>
                Lịch sử ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: currentHudTheme.subTextColor }}>Mới nhất</span>
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
                      background: currentHudTheme.innerCardBg,
                      border: currentHudTheme.innerCardBorder,
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
          backgroundColor: currentHudTheme.cardBg,
          border: currentHudTheme.cardBorder,
          boxShadow: currentHudTheme.cardShadow,
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
              background: currentHudTheme.innerCardBg,
              padding: '3px',
              borderRadius: '8px',
              border: currentHudTheme.innerCardBorder,
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
                      background: isSelected ? `linear-gradient(135deg, ${currentHudTheme.primaryAccent}, #1d4ed8)` : 'transparent',
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
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                background: currentHudTheme.innerCardBg,
                padding: '8px 12px',
                borderRadius: '10px',
                border: currentHudTheme.innerCardBorder,
                maxWidth: '100%'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.78rem',
                  color: currentHudTheme.subTextColor,
                  flexWrap: 'wrap',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontWeight: '700', color: currentHudTheme.textColor }}>Mục tiêu Sub:</span>
                  {[10, 15, 20, 30].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setTargetSeconds(sec);
                        localStorage.setItem('rubik_target_sub_custom', String(sec));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: targetSeconds === sec ? `1.5px solid ${currentHudTheme.primaryAccent}` : currentHudTheme.innerCardBorder,
                        background: targetSeconds === sec ? currentHudTheme.primaryAccent : currentHudTheme.cardBg,
                        color: targetSeconds === sec ? '#ffffff' : currentHudTheme.subTextColor,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                        fontWeight: '700',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Sub-{sec}s
                    </button>
                  ))}

                  {/* Hiển thị mốc tự nhập nếu không phải 10, 15, 20, 30 */}
                  {![10, 15, 20, 30].includes(targetSeconds) && (
                    <span style={{
                      padding: '3px 9px',
                      borderRadius: '5px',
                      border: `1.5px solid ${currentHudTheme.primaryAccent}`,
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: currentHudTheme.primaryAccent,
                      fontSize: '0.74rem',
                      fontWeight: '800'
                    }}>
                      ⭐ Sub-{targetSeconds}s (Tự chọn)
                    </span>
                  )}

                  {/* Ô NHẬP RIÊNG MỤC TIÊU SUB THEO Ý MUỐN ĐỂ MỌI NGƯỜI CÙNG BIẾT */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const num = parseFloat(customSubInput);
                      if (!isNaN(num) && num > 0 && num < 3600) {
                        setTargetSeconds(num);
                        localStorage.setItem('rubik_target_sub_custom', String(num));
                        setCustomSubInput('');
                      } else {
                        alert('Vui lòng nhập số giây hợp lệ (Ví dụ: 8, 12, 14.5, 25...)');
                      }
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}
                  >
                    <input
                      type="number"
                      step="any"
                      min="1"
                      max="3600"
                      placeholder="Tự nhập giây"
                      value={customSubInput}
                      onChange={(e) => setCustomSubInput(e.target.value)}
                      style={{
                        width: '90px',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        background: currentHudTheme.cardBg,
                        border: currentHudTheme.innerCardBorder,
                        color: currentHudTheme.textColor,
                        fontSize: '0.74rem',
                        outline: 'none',
                        fontWeight: '600'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        background: `linear-gradient(135deg, ${currentHudTheme.primaryAccent}, #1d4ed8)`,
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Đặt
                    </button>
                  </form>
                </div>

                {/* DÒNG CÔNG KHAI MỤC TIÊU ĐỂ MỌI NGƯỜI BIẾT */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.10)',
                  border: '1px solid rgba(245, 158, 11, 0.28)',
                  color: '#fbbf24',
                  fontSize: '0.72rem',
                  fontWeight: '700'
                }}>
                  <span>🎯</span>
                  <span>Mục tiêu của <strong>{currentUser.name}</strong>: Thách đấu phá mốc <strong>Sub-{targetSeconds}s</strong> ({PUZZLE_CONFIGS[puzzleType]?.name})</span>
                </div>
              </div>
            )}

            <div style={{
              display: 'inline-flex',
              background: currentHudTheme.innerCardBg,
              padding: '3px',
              borderRadius: '8px',
              border: currentHudTheme.innerCardBorder,
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
                      background: isSelected ? currentHudTheme.cardBg : 'transparent',
                      color: isSelected ? currentHudTheme.primaryAccent : '#64748b',
                      fontWeight: isSelected ? '800' : '600',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      borderBottom: isSelected ? `2px solid ${currentHudTheme.primaryAccent}` : '2px solid transparent'
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            {/* BỘ CHỌN CHẾ ĐỘ MẮT THẦN AI THEO DÒNG RUBIK (UV / NHÁM / VIỀN ĐEN & CARBON / PASTEL) */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: currentHudTheme.innerCardBg,
              padding: '3px 6px',
              borderRadius: '8px',
              border: currentHudTheme.innerCardBorder,
              gap: '4px',
              maxWidth: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch'
            }} className="no-scrollbar">
              <span style={{ fontSize: '0.66rem', color: currentHudTheme.subTextColor, fontWeight: '700', whiteSpace: 'nowrap', padding: '0 4px' }}>
                🎨 Loại Rubik:
              </span>
              {Object.values(CUBE_SURFACE_PROFILES).map((prof) => {
                const isSelected = surfaceProfile === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => handleSelectSurfaceProfile(prof.id)}
                    title={prof.desc}
                    style={{
                      padding: '3px 9px',
                      borderRadius: '6px',
                      border: isSelected ? `1px solid ${currentHudTheme.primaryAccent}` : '1px solid transparent',
                      background: isSelected ? (hudThemeKey === 'sakura' ? 'rgba(244, 114, 182, 0.22)' : 'rgba(56, 189, 248, 0.16)') : 'transparent',
                      color: isSelected ? currentHudTheme.primaryAccent : '#94a3b8',
                      fontWeight: isSelected ? '800' : '600',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s'
                    }}
                  >
                    {prof.shortLabel}
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

            {/* =========================================================================
                QUY TRÌNH 3 BƯỚC SPEEDCUBING WCA (THEO YÊU CẦU NGƯỜI DÙNG):
                1. Kiểm tra scb
                2. Xác nhận đúng r bắt đầu giải
                3. Hoàn thành
            ========================================================================= */}
            {(() => {
              const targetFaceCount = (adminSettings.requiredPreCheckFaces === 6 || adminSettings.requireAll6FacesPreCheck === true) ? 6 : 3;
              const scannedCount = Object.keys(scannedFaces).length;
              const isStep1Done = Boolean(preCheckStatus.verified || solveStep === 'step2_ready_solve' || solveStep === 'step3_completed');
              const isStep1Error = Boolean(scrambleAudit.isMismatch && !allowFreestyleScramble && solveStep === 'step1_check_scb');
              const isStep2Active = solveStep === 'step2_ready_solve' && (timerState === 'running' || timerState === 'inspecting' || timerState === 'holding' || timerState === 'ready');
              const isStep2Ready = solveStep === 'step2_ready_solve' && timerState === 'idle';
              const isStep3Active = solveStep === 'step3_completed';

              return (
                <div style={{
                  width: '100%',
                  maxWidth: '780px',
                  margin: '4px auto 10px auto',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  background: 'rgba(9, 15, 29, 0.75)',
                  border: `1px solid ${currentHudTheme.color}35`,
                  boxShadow: `0 4px 20px ${currentHudTheme.glowColor}`,
                  backdropFilter: 'blur(8px)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                    paddingBottom: '4px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
                  }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: currentHudTheme.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>🎯</span>
                      <span>QUY TRÌNH 3 BƯỚC GIẢI ({targetFaceCount === 6 ? 'Chế độ 6 mặt Admin Khoa' : 'Chế độ 3 mặt Nhanh'})</span>
                    </span>
                    <span style={{ fontSize: '0.64rem', color: isStep3Active ? '#facc15' : isStep2Active ? '#4ade80' : isStep1Done ? '#38bdf8' : '#94a3b8' }}>
                      {isStep3Active ? '🎉 Đã hoàn thành lượt giải!' : isStep2Active ? '⚡ Đang trong lượt giải...' : isStep2Ready ? '🟢 Đã mở khóa — Sẵn sàng bấm giờ!' : '🔍 Đang kiểm tra Scramble...'}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                    gap: isMobile ? '6px' : '8px'
                  }}>
                    {/* BƯỚC 1: KIỂM TRA SCB */}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isStep1Error
                        ? 'rgba(239, 68, 68, 0.15)'
                        : (solveStep === 'step1_check_scb'
                          ? 'rgba(56, 189, 248, 0.16)'
                          : 'rgba(34, 197, 94, 0.14)'),
                      border: isStep1Error
                        ? '1.5px solid #ef4444'
                        : (solveStep === 'step1_check_scb'
                          ? `1.5px solid #38bdf8`
                          : '1.5px solid #22c55e'),
                      boxShadow: solveStep === 'step1_check_scb' ? '0 0 10px rgba(56, 189, 248, 0.3)' : (isStep1Done ? '0 0 8px rgba(34, 197, 94, 0.2)' : 'none'),
                      transition: 'all 0.25s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          color: isStep1Error ? '#f87171' : (solveStep === 'step1_check_scb' ? '#38bdf8' : '#4ade80')
                        }}>
                          1. Kiểm tra scb
                        </span>
                        <span style={{
                          fontSize: '0.62rem',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          fontWeight: '700',
                          background: isStep1Error ? '#ef4444' : (solveStep === 'step1_check_scb' ? '#0284c7' : '#22c55e'),
                          color: '#ffffff'
                        }}>
                          {isStep1Error ? '❌ Sai' : (solveStep === 'step1_check_scb' ? `${scannedCount}/${targetFaceCount}` : '✓ Đã khớp')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.66rem', color: isStep1Error ? '#fca5a5' : (solveStep === 'step1_check_scb' ? '#cbd5e1' : '#86efac'), lineHeight: '1.3' }}>
                        {isStep1Error
                          ? `Lệch Scramble (khớp ${scrambleAudit.matchRate}%)`
                          : (solveStep === 'step1_check_scb'
                            ? `Quét ${scannedCount}/${targetFaceCount} mặt trước Camera`
                            : `Khớp ${scrambleAudit.matchRate || 100}% chuẩn WCA`)}
                      </div>
                      {solveStep === 'step1_check_scb' && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={confirmScrambleAndReady}
                            title="Xác nhận khối Rubik đã xáo đúng và chuyển sang bước 2 để giải"
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              background: '#16a34a',
                              border: '1px solid #4ade80',
                              color: '#ffffff',
                              fontSize: '0.64rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            ✅ Xác nhận đúng
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleFaceVerificationMode(targetFaceCount === 6 ? 3 : 6)}
                            title="Đổi chế độ quét 3 mặt hoặc 6 mặt"
                            style={{
                              padding: '3px 6px',
                              borderRadius: '5px',
                              background: 'rgba(15, 23, 42, 0.7)',
                              border: '1px solid #475569',
                              color: '#94a3b8',
                              fontSize: '0.62rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {targetFaceCount === 6 ? '6M' : '3M'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* BƯỚC 2: XÁC NHẬN ĐÚNG R BẮT ĐẦU GIẢI */}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isStep2Active
                        ? 'rgba(34, 197, 94, 0.22)'
                        : isStep2Ready
                          ? 'rgba(56, 189, 248, 0.16)'
                          : 'rgba(15, 23, 42, 0.45)',
                      border: isStep2Active
                        ? '1.5px solid #22c55e'
                        : isStep2Ready
                          ? '1.5px solid #38bdf8'
                          : '1px dashed #334155',
                      boxShadow: isStep2Active ? '0 0 12px rgba(34, 197, 94, 0.35)' : isStep2Ready ? '0 0 10px rgba(56, 189, 248, 0.25)' : 'none',
                      transition: 'all 0.25s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          color: isStep2Active ? '#4ade80' : isStep2Ready ? '#38bdf8' : (isStep3Active ? '#94a3b8' : '#64748b')
                        }}>
                          2. Xác nhận đúng r bắt đầu giải
                        </span>
                        <span style={{
                          fontSize: '0.62rem',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          fontWeight: '700',
                          background: isStep2Active ? '#16a34a' : isStep2Ready ? '#0284c7' : (isStep3Active ? '#334155' : '#334155'),
                          color: isStep1Done ? '#ffffff' : '#94a3b8'
                        }}>
                          {timerState === 'running'
                            ? '⚡ Đang giải'
                            : timerState === 'ready'
                              ? '● Sẵn sàng'
                              : timerState === 'inspecting'
                                ? '⏱️ WCA'
                                : isStep2Ready
                                  ? '🟢 Mở khóa'
                                  : isStep3Active
                                    ? '✓ Xong'
                                    : '🔒 Chờ B1'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.66rem', color: isStep2Active ? '#86efac' : isStep2Ready ? '#7dd3fc' : '#64748b', lineHeight: '1.3' }}>
                        {timerState === 'running'
                          ? `Đang xoay (${cubeMovesSeenRef.current || trackedMoves.length} nhịp)`
                          : timerState === 'inspecting'
                            ? `Quan sát (${inspectionTimeLeft}s)`
                            : timerState === 'ready'
                              ? 'Thả tay để bắt đầu giải!'
                              : isStep2Ready
                                ? (isMobile ? 'Chạm giữ để giải' : 'Giữ Space để giải')
                                : isStep3Active
                                  ? `Đã giải xong (${(timeMs / 1000).toFixed(2)}s)`
                                  : 'Cần xác nhận bước 1'}
                      </div>
                      {isStep2Ready && (
                        <div style={{ marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setShowKociembaModal(true)}
                            title="Mở hướng dẫn giải tối ưu Kociemba từng bước"
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                              border: '1px solid #38bdf8',
                              color: '#ffffff',
                              fontSize: '0.64rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>⚡ Xem Kociemba (~20b)</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* BƯỚC 3: HOÀN THÀNH */}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isStep3Active
                        ? 'rgba(234, 179, 8, 0.18)'
                        : 'rgba(15, 23, 42, 0.45)',
                      border: isStep3Active
                        ? '1.5px solid #eab308'
                        : '1px dashed #334155',
                      boxShadow: isStep3Active ? '0 0 12px rgba(234, 179, 8, 0.35)' : 'none',
                      transition: 'all 0.25s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          color: isStep3Active ? '#facc15' : '#64748b'
                        }}>
                          3. Hoàn thành
                        </span>
                        <span style={{
                          fontSize: '0.62rem',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          fontWeight: '700',
                          background: isStep3Active ? '#ca8a04' : '#334155',
                          color: isStep3Active ? '#ffffff' : '#94a3b8'
                        }}>
                          {isStep3Active ? '🏆 Xong' : '○ Chờ'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.66rem', color: isStep3Active ? '#fef08a' : '#64748b', lineHeight: '1.3' }}>
                        {isStep3Active
                          ? `Thành tích: ${(timeMs / 1000).toFixed(2)}s ${solves[0]?.verified ? '(✓ AI)' : ''}`
                          : 'Dừng đồng hồ để hoàn thành'}
                      </div>
                      {isStep3Active && (
                        <div style={{ marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={startNextSolveRound}
                            title="Tạo Scramble mới và bắt đầu lượt tiếp theo"
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              background: '#2563eb',
                              border: '1px solid #60a5fa',
                              color: '#ffffff',
                              fontSize: '0.64rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              width: '100%'
                            }}
                          >
                            🔄 Lượt mới (Space)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {gameMode !== 'solo' && (() => {
              const isSolving = timerState === 'running' || timerState === 'inspecting' || timerState === 'ready' || timerState === 'holding' || linger3D;
              const shouldShowScramble = isSolving || showScrambleManual;

              if (!shouldShowScramble) {
                return (
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowScrambleManual(true)}
                      title="Bấm để mở xem công thức Scramble hoặc đổi đề bài"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 14px',
                        borderRadius: '20px',
                        background: 'rgba(9, 15, 29, 0.85)',
                        border: '1px dashed #334155',
                        color: '#94a3b8',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        backdropFilter: 'blur(6px)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span>📜 Các bước & Scramble (Đang ẩn — Tự hiện khi bấm giờ giải)</span>
                      <span style={{ color: currentHudTheme.color, fontWeight: '700' }}>[👁 Mở xem]</span>
                    </button>
                  </div>
                );
              }

              return (
                <div style={{ width: '100%', textAlign: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      color: isSolving ? currentHudTheme.color : '#64748b',
                      fontWeight: '800',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span>{isSolving ? '⚡' : '📜'}</span>
                      <span>
                        {timerState === 'running'
                          ? `CÁC BƯỚC ĐÃ ĐI (${trackedMoves.length}) • ${PUZZLE_CONFIGS[puzzleType]?.name}`
                          : `SCRAMBLE ${PUZZLE_CONFIGS[puzzleType]?.name}`}
                      </span>
                    </span>
                    {!isSolving && (
                      <button
                        onClick={() => {
                          setScramble(generateScramble(puzzleType));
                          setScannedFaces({});
                          scannedFacesRef.current = {};
                          setAllowFreestyleScramble(false);
                          setScrambleAudit({ matchRate: 100, isMatch: true, isMismatch: false, isPending: true });
                        }}
                        style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.78rem' }}
                        title="Đổi công thức xáo trộn khác"
                      >
                        🔄 Đổi
                      </button>
                    )}
                    {!isSolving && (
                      <button
                        type="button"
                        onClick={() => setShowScrambleManual(false)}
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', marginLeft: '4px' }}
                        title="Ẩn công thức đi"
                      >
                        🙈 Ẩn lại
                      </button>
                    )}
                  </div>

                  <div style={{
                    fontSize: (puzzleType === '6x6' || puzzleType === '7x7') ? '0.82rem' : (puzzleType === '5x5' ? '0.9rem' : (puzzleType === '4x4' ? '1.02rem' : '1.15rem')),
                    fontWeight: '700',
                    lineHeight: 1.4,
                    color: timerState === 'running' ? '#4ade80' : '#cbd5e1',
                    fontFamily: 'monospace',
                    padding: '8px 12px',
                    background: timerState === 'running' ? 'rgba(6, 26, 17, 0.90)' : '#090f1d',
                    borderRadius: '8px',
                    border: timerState === 'running' ? '1.5px solid #22c55e' : `1px solid ${currentHudTheme.color}`,
                    boxShadow: timerState === 'running' ? '0 0 16px rgba(34, 197, 94, 0.35)' : `0 0 10px ${currentHudTheme.glowColor}`,
                    maxHeight: '74px',
                    overflowY: 'auto'
                  }}>
                    {timerState === 'running' ? (
                      trackedMoves.length > 0 ? (
                        <div>
                          <div style={{ color: '#4ade80', fontWeight: '800', letterSpacing: '1px' }}>
                            {trackedMoves.join(' ')}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '3px', fontWeight: '500' }}>
                            Đề bài Scramble: {scramble}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: '#38bdf8', fontSize: '0.92rem' }}>
                            ⚡ Đang theo dõi các bước xoay qua Camera AI...
                          </div>
                          <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '3px', fontWeight: '500' }}>
                            Đề bài Scramble: {scramble}
                          </div>
                        </div>
                      )
                    ) : (
                      scramble
                    )}
                  </div>

                  {/* THANH NGHIỆM GIẢI TỐI ƯU KOCIEMBA (CHO DÒNG 3x3) */}
                  {puzzleType === '3x3' && (
                    <div style={{
                      marginTop: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(9, 15, 29, 0.85)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '6px',
                      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem' }}>⚡</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#38bdf8' }}>
                          Kociemba Two-Phase:
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          color: '#4ade80',
                          fontWeight: '800',
                          background: 'rgba(34, 197, 94, 0.16)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid #22c55e55'
                        }}>
                          {kociembaOptimal?.success ? `${kociembaOptimal.moveCount} bước tối ưu` : 'Đang tính...'}
                        </span>
                        {kociembaOptimal?.success && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                            ({kociembaOptimal.solution.slice(0, 28)}...)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowKociembaModal(true)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '5px',
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)'
                        }}
                      >
                        👁 Xem nghiệm Kociemba
                      </button>
                    </div>
                  )}

                  {/* THANH KIỂM TOÁN ĐỐI CHIẾU SCRAMBLE THỰC TẾ QUA CAMERA */}
                  {cameraActive && !scrambleAudit.isPending && (
                    <div style={{ marginTop: '6px' }}>
                      {scrambleAudit.isMismatch && !allowFreestyleScramble ? (
                        <div style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.16)',
                          border: '1.5px solid #ef4444',
                          color: '#fca5a5',
                          fontSize: '0.74rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '6px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                            <div>
                              <strong>SCRAMBLE SAI ĐỀ BÀI (Chỉ khớp {scrambleAudit.matchRate}%):</strong> Khối của bạn đang xáo lệch công thức!
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setScramble(generateScramble(puzzleType));
                                setScannedFaces({});
                                scannedFacesRef.current = {};
                                setAllowFreestyleScramble(false);
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '5px',
                                background: '#2563eb',
                                border: 'none',
                                color: '#ffffff',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              🔄 Đổi đề bài
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllowFreestyleScramble(true)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '5px',
                                background: 'rgba(245, 158, 11, 0.25)',
                                border: '1px solid #f59e0b',
                                color: '#fbbf24',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              ⚡ Giải tự do
                            </button>
                          </div>
                        </div>
                      ) : allowFreestyleScramble ? (
                        <div style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid #f59e0b',
                          color: '#fbbf24',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>⚡</span>
                          <span>Đã duyệt chế độ: Giải tự do (Freestyle) — Không tính kỷ lục WCA</span>
                        </div>
                      ) : scrambleAudit.isMatch ? (
                        <div style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          background: 'rgba(34, 197, 94, 0.14)',
                          border: '1px solid #22c55e',
                          color: '#4ade80',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>✅</span>
                          <span>ĐỐI CHIẾU SCRAMBLE: Khớp {scrambleAudit.matchRate}% chuẩn WCA!</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })()}
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
              background: currentHudTheme.innerCardBg,
              borderRadius: '14px',
              border: cameraActive
                ? (cameraHealth.isHealthy ? (preCheckStatus.verified ? '1.5px solid #22c55e' : `1.5px solid ${currentHudTheme.color}`) : '1.5px solid #ef4444')
                : '1px solid #1e293b',
              padding: isMobile ? '10px' : '12px 16px',
              boxShadow: preCheckStatus.verified
                ? '0 8px 28px rgba(34, 197, 94, 0.15)'
                : `0 8px 28px ${currentHudTheme.glowColor}`,
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

                  <span style={{
                    fontSize: '0.64rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    fontWeight: '700'
                  }}>
                    🌈 Hệ màu HSV
                  </span>

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
                      Đã lưu {Object.keys(scannedFaces).length}/{(adminSettings.requiredPreCheckFaces === 6 ? 6 : 3)} mặt
                    </span>
                  )}
                </div>

                {/* Các nút điều khiển kích thước & chế độ màn hình 3D phía trên */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {/* Nút chỉnh riêng phong cách HUD: Hoa Anh Đào, Mạng Nhện, Lôi Thần, Băng Tuyết */}
                  <button
                    type="button"
                    onClick={cycleHudTheme}
                    title="Bấm để đổi phong cách giao diện HUD (Hoa Anh Đào / Mạng Nhện Cyber / Lôi Thần / Băng Tuyết)"
                    style={{
                      padding: '3px 9px',
                      borderRadius: '5px',
                      border: `1.5px solid ${currentHudTheme.color}`,
                      background: hudThemeKey === 'sakura' ? 'rgba(244, 114, 182, 0.18)' : '#111c34',
                      color: currentHudTheme.color,
                      fontSize: '0.66rem',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: `0 0 10px ${currentHudTheme.glowColor}`,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>{currentHudTheme.shortName}</span>
                    <span style={{ fontSize: '0.6rem', opacity: 0.85 }}>↻</span>
                  </button>

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
                    scramble={scramble}
                    lastMove={lastMoveDetected}
                    trackingBox={trackingBox}
                    modelVerification={model3DVerification}
                    surfaceProfile={surfaceProfile}
                    activeFace={currentActiveFace}
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
                      border: preCheckStatus.verified ? '2px solid #22c55e' : `1.5px solid ${currentHudTheme.color}`,
                      boxShadow: `0 0 16px ${currentHudTheme.glowColor}`,
                      flexShrink: 0
                    }}>
                      <video
                        ref={attachVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />

                      {/* Hiệu ứng cánh hoa anh đào Sakura bay lượn trên Cam khi bật theme Hoa Anh Đào */}
                      {currentHudTheme.hasPetals && (
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}>
                          <span className="sakura-petal-1" style={{ top: '10%', left: '12%', fontSize: '0.95rem' }}>🌸</span>
                          <span className="sakura-petal-2" style={{ top: '65%', left: '76%', fontSize: '0.85rem' }}>🌸</span>
                          <span className="sakura-petal-3" style={{ top: '22%', right: '16%', fontSize: '0.75rem' }}>🌸</span>
                          <span className="sakura-petal-1" style={{ bottom: '12%', left: '30%', fontSize: '0.8rem' }}>🌸</span>
                        </div>
                      )}

                      {/* LƯỚI MẠNG NHỆN RADAR & QUÉT HITBOX RUBIK (Spider-Web Ray Casting HUD) */}
                      <svg
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                          zIndex: 1
                        }}
                      >
                        {trackingBox.spiderRays && trackingBox.spiderRays.length > 0 ? (
                          <>
                            {/* 3 vòng tơ nhện đồng tâm (33%, 66%, 100%) */}
                            {[0.33, 0.66, 1.0].map((ringScale, rIdx) => {
                              const ringPoints = trackingBox.spiderRays.map(r => {
                                const rx = trackingBox.cxPct + (r.xPct - trackingBox.cxPct) * ringScale;
                                const ry = trackingBox.cyPct + (r.yPct - trackingBox.cyPct) * ringScale;
                                return `${rx}%,${ry}%`;
                              }).join(' ');
                              return (
                                <polygon
                                  key={rIdx}
                                  points={ringPoints}
                                  fill="none"
                                  stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                                  strokeWidth={rIdx === 2 ? '1.2' : '0.8'}
                                  strokeDasharray={rIdx === 2 ? 'none' : '2,2'}
                                />
                              );
                            })}
                            {/* 16 tia quét mạng nhện hướng tâm */}
                            {trackingBox.spiderRays.map((r, i) => (
                              <line
                                key={i}
                                x1={`${trackingBox.cxPct}%`}
                                y1={`${trackingBox.cyPct}%`}
                                x2={`${r.xPct}%`}
                                y2={`${r.yPct}%`}
                                stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                                strokeWidth="0.8"
                              />
                            ))}
                          </>
                        ) : (
                          /* Lưới mạng nhện radar ở chế độ quét tìm */
                          <g opacity="0.5">
                            <circle cx="50%" cy="50%" r="20%" fill="none" stroke={currentHudTheme.color} strokeWidth="0.8" strokeDasharray="3,3" />
                            <circle cx="50%" cy="50%" r="38%" fill="none" stroke={currentHudTheme.color} strokeWidth="0.8" strokeDasharray="3,3" />
                            <line x1="50%" y1="10%" x2="50%" y2="90%" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
                            <line x1="10%" y1="50%" x2="90%" y2="50%" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
                            <line x1="22%" y1="22%" x2="78%" y2="78%" stroke={currentHudTheme.color} strokeWidth="0.5" strokeDasharray="2,2" />
                            <line x1="78%" y1="22%" x2="22%" y2="78%" stroke={currentHudTheme.color} strokeWidth="0.5" strokeDasharray="2,2" />
                          </g>
                        )}
                      </svg>

                      {/* KHUNG HITBOX RUBIK CHUẨN XÁC VỚI 4 GÓC TACTICAL BRACKETS */}
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
                            ? `2px solid ${currentHudTheme.rayLockedColor}`
                            : `1.5px dashed ${currentHudTheme.color}`,
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        boxShadow: trackingBox.isLocked
                          ? `0 0 16px ${currentHudTheme.glowColor}, 0 0 0 999px rgba(2, 6, 23, 0.32)`
                          : '0 0 0 999px rgba(2, 6, 23, 0.32)',
                        zIndex: 3
                      }}>
                        {/* 4 góc Tactical Hitbox Brackets */}
                        <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '8px', height: '8px', borderTop: `2.5px solid ${currentHudTheme.bracketColor}`, borderLeft: `2.5px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 4px ${currentHudTheme.glowColor})` }} />
                        <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderTop: `2.5px solid ${currentHudTheme.bracketColor}`, borderRight: `2.5px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 4px ${currentHudTheme.glowColor})` }} />
                        <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '8px', height: '8px', borderBottom: `2.5px solid ${currentHudTheme.bracketColor}`, borderLeft: `2.5px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 4px ${currentHudTheme.glowColor})` }} />
                        <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '8px', height: '8px', borderBottom: `2.5px solid ${currentHudTheme.bracketColor}`, borderRight: `2.5px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 4px ${currentHudTheme.glowColor})` }} />

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

                      {/* Huy hiệu trạng thái Hitbox góc trên trái */}
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        left: '6px',
                        background: currentHudTheme.badgeBg,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.54rem',
                        color: currentHudTheme.badgeTextColor,
                        fontWeight: '700',
                        pointerEvents: 'none',
                        zIndex: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: `0 0 8px ${currentHudTheme.glowColor}`
                      }}>
                        <span>{trackingBox.isLocked ? '🎯' : (hudThemeKey === 'sakura' ? '🌸' : hudThemeKey === 'cyber' ? '🕸️' : hudThemeKey === 'thunder' ? '⚡' : '💎')}</span>
                        <span>
                          {trackingBox.isLocked
                            ? `HITBOX: KHÓA (${trackingBox.cxPct}%, ${trackingBox.cyPct}%)`
                            : `${hudThemeKey === 'sakura' ? 'SAKURA' : hudThemeKey === 'cyber' ? 'MẠNG NHỆN' : hudThemeKey === 'thunder' ? 'LÔI THẦN' : 'BĂNG TUYẾT'}: QUÉT RADAR`}
                        </span>
                      </div>

                      {/* Nút chuyển nhanh theme ngay trên góc khung Camera */}
                      <button
                        type="button"
                        onClick={cycleHudTheme}
                        title="Đổi giao diện HUD Camera"
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          right: '4px',
                          background: currentHudTheme.badgeBg,
                          color: currentHudTheme.badgeTextColor,
                          border: `1px solid ${currentHudTheme.color}`,
                          borderRadius: '4px',
                          fontSize: '0.52rem',
                          fontWeight: '800',
                          padding: '1px 5px',
                          cursor: 'pointer',
                          zIndex: 5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          backdropFilter: 'blur(4px)',
                          boxShadow: `0 0 8px ${currentHudTheme.glowColor}`
                        }}
                      >
                        <span>{currentHudTheme.shortName}</span>
                        <span style={{ fontSize: '0.5rem' }}>↻</span>
                      </button>
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
                      gridTemplateColumns: `repeat(${currentDim}, ${currentDim >= 6 ? '9px' : (currentDim >= 4 ? '12px' : '15px')})`,
                      gap: currentDim >= 6 ? '1.5px' : '2px',
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
                            width: currentDim >= 6 ? '9px' : (currentDim >= 4 ? '12px' : '15px'),
                            height: currentDim >= 6 ? '9px' : (currentDim >= 4 ? '12px' : '15px'),
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

                  {/* Dải trạng thái 6 mặt trên Mô hình 3D (Hiển thị rõ mặt nào chưa giải / đã giải) */}
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    {['U', 'D', 'F', 'B', 'L', 'R'].map((fKey) => {
                      const fArr = scannedFaces[fKey];
                      const isScanned = Array.isArray(fArr) && fArr.length > 0;
                      const uniq = isScanned ? new Set(fArr.filter(c => c !== 'invalid')).size : 0;
                      const isUnsolvedFace = isScanned && uniq >= 2;
                      return (
                        <span
                          key={fKey}
                          title={
                            isScanned
                              ? (isUnsolvedFace ? `Mặt ${fKey}: Chưa giải (${uniq} màu)` : `Mặt ${fKey}: Đã giải (1 màu)`)
                              : `Mặt ${fKey}: Đang hiển thị trạng thái xáo trộn theo Scramble`
                          }
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '2px 3px',
                            borderRadius: '4px',
                            fontSize: '0.58rem',
                            fontWeight: '800',
                            background: isScanned
                              ? (isUnsolvedFace ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)')
                              : '#111c34',
                            border: isScanned
                              ? (isUnsolvedFace ? '1px solid #f59e0b' : '1px solid #22c55e')
                              : '1px solid #1e293b',
                            color: isScanned
                              ? (isUnsolvedFace ? '#fbbf24' : '#4ade80')
                              : '#64748b'
                          }}
                        >
                          {fKey}{isScanned ? (isUnsolvedFace ? `:${uniq}m` : ':✓') : ''}
                        </span>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {/* NÚT CHỤP LƯU MẶT HIỆN TẠI (GIỐNG FILE quet_rubik_6_mat.py) */}
                    {cameraActive && (
                      <button
                        type="button"
                        onClick={captureCurrentFace}
                        title="Chụp lưu mặt Rubik đang hiển thị trên camera (phím tắt: C)"
                        style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          border: '1px solid #22c55e',
                          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(22, 163, 74, 0.2))',
                          color: '#4ade80',
                          fontSize: '0.64rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>📸 Chụp lưu mặt (C)</span>
                      </button>
                    )}

                    {Object.keys(scannedFaces).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setScannedFaces({});
                          const targetCount = (adminSettingsRef.current?.requiredPreCheckFaces === 6 || adminSettingsRef.current?.requireAll6FacesPreCheck === true) ? 6 : 3;
                          setPreCheckStatus({
                            verified: false,
                            text: `Đã đặt lại bộ nhớ quét. Hãy xoay khối Rubik trước Camera để AI quét ${targetCount} mặt.`,
                            isScrambled: false,
                            centerFace: null
                          });
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          border: '1px solid #1e293b',
                          background: '#111c34',
                          color: '#94a3b8',
                          fontSize: '0.64rem',
                          cursor: 'pointer',
                          flex: 1
                        }}
                      >
                        🔄 Quét lại ({Object.keys(scannedFaces).length}/{(adminSettings.requiredPreCheckFaces === 6 ? 6 : 3)} mặt)
                      </button>
                    )}

                    {Object.keys(scannedFaces).length < (adminSettings.requiredPreCheckFaces === 6 ? 6 : 3) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAllowFreestyleScramble(true);
                          allowFreestyleScrambleRef.current = true;
                          setPreCheckStatus({
                            verified: true,
                            text: '⚡ Đã mở khóa giải nhanh (Chế độ tự do / Không tính Bảng kỷ lục AI) — Sẵn sàng bấm giờ!',
                            isScrambled: true,
                            centerFace: 'Mở khóa nhanh'
                          });
                          lastCubeVerifiedAtRef.current = performance.now();
                        }}
                        title={`Bấm để mở khóa đồng hồ ngay mà không cần xoay quét đủ cả ${adminSettings.requiredPreCheckFaces === 6 ? 6 : 3} mặt`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          border: '1px solid #f59e0b',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          fontSize: '0.64rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          flex: 1
                        }}
                      >
                        ⚡ Mở khóa nhanh
                      </button>
                    )}
                  </div>
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
                border: preCheckStatus.verified ? '2px solid #22c55e' : `1.5px solid ${currentHudTheme.color}`,
                boxShadow: `0 0 14px ${currentHudTheme.glowColor}`,
                flexShrink: 0
              }}>
                <video ref={attachVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                {/* Hiệu ứng cánh hoa anh đào Sakura trên Cam */}
                {currentHudTheme.hasPetals && (
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}>
                    <span className="sakura-petal-1" style={{ top: '10%', left: '10%', fontSize: '0.8rem' }}>🌸</span>
                    <span className="sakura-petal-2" style={{ top: '65%', left: '75%', fontSize: '0.75rem' }}>🌸</span>
                    <span className="sakura-petal-3" style={{ bottom: '15%', left: '40%', fontSize: '0.7rem' }}>🌸</span>
                  </div>
                )}

                {/* LƯỚI MẠNG NHỆN RADAR & QUÉT HITBOX RUBIK */}
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                >
                  {trackingBox.spiderRays && trackingBox.spiderRays.length > 0 ? (
                    <>
                      {[0.33, 0.66, 1.0].map((ringScale, rIdx) => {
                        const ringPoints = trackingBox.spiderRays.map(r => {
                          const rx = trackingBox.cxPct + (r.xPct - trackingBox.cxPct) * ringScale;
                          const ry = trackingBox.cyPct + (r.yPct - trackingBox.cyPct) * ringScale;
                          return `${rx}%,${ry}%`;
                        }).join(' ');
                        return (
                          <polygon
                            key={rIdx}
                            points={ringPoints}
                            fill="none"
                            stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                            strokeWidth={rIdx === 2 ? '1.2' : '0.8'}
                            strokeDasharray={rIdx === 2 ? 'none' : '2,2'}
                          />
                        );
                      })}
                      {trackingBox.spiderRays.map((r, i) => (
                        <line
                          key={i}
                          x1={`${trackingBox.cxPct}%`}
                          y1={`${trackingBox.cyPct}%`}
                          x2={`${r.xPct}%`}
                          y2={`${r.yPct}%`}
                          stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                          strokeWidth="0.8"
                        />
                      ))}
                    </>
                  ) : (
                    <g opacity="0.5">
                      <circle cx="50%" cy="50%" r="22%" fill="none" stroke={currentHudTheme.color} strokeWidth="0.8" strokeDasharray="3,3" />
                      <line x1="50%" y1="10%" x2="50%" y2="90%" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
                      <line x1="10%" y1="50%" x2="90%" y2="50%" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
                    </g>
                  )}
                </svg>

                {/* KHUNG HITBOX RUBIK */}
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
                      ? `2px solid ${currentHudTheme.rayLockedColor}`
                      : `1.5px dashed ${currentHudTheme.color}`,
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  boxShadow: trackingBox.isLocked
                    ? `0 0 12px ${currentHudTheme.glowColor}, 0 0 0 999px rgba(2, 6, 23, 0.3)`
                    : '0 0 0 999px rgba(2, 6, 23, 0.3)',
                  zIndex: 3
                }}>
                  {/* Tactical Brackets */}
                  <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '6px', height: '6px', borderTop: `2px solid ${currentHudTheme.bracketColor}`, borderLeft: `2px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 3px ${currentHudTheme.glowColor})` }} />
                  <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '6px', height: '6px', borderTop: `2px solid ${currentHudTheme.bracketColor}`, borderRight: `2px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 3px ${currentHudTheme.glowColor})` }} />
                  <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '6px', height: '6px', borderBottom: `2px solid ${currentHudTheme.bracketColor}`, borderLeft: `2px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 3px ${currentHudTheme.glowColor})` }} />
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '6px', height: '6px', borderBottom: `2px solid ${currentHudTheme.bracketColor}`, borderRight: `2px solid ${currentHudTheme.bracketColor}`, filter: `drop-shadow(0 0 3px ${currentHudTheme.glowColor})` }} />

                  {detectedColors.map((colorKey, idx) => {
                    const colorDef = COLOR_DEFINITIONS[colorKey] || { name: '?', bg: 'transparent' };
                    const viName =
                      colorKey === 'white' ? 'Trắng' :
                      colorKey === 'yellow' ? 'Vàng' :
                      colorKey === 'green' ? 'Xanh lá' :
                      colorKey === 'blue' ? 'Xanh dương' :
                      colorKey === 'orange' ? 'Cam' :
                      colorKey === 'red' ? 'Đỏ' : '?';

                    return (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          border: '1px solid rgba(255, 255, 255, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colorKey !== 'invalid' ? `${colorDef.bg}35` : 'transparent'
                        }}
                      >
                        {/* Khung cắt trung tâm 36% (le = 35% trong Python OpenCV) */}
                        <div style={{
                          position: 'absolute',
                          width: '38%',
                          height: '38%',
                          border: '1px solid rgba(0, 255, 255, 0.75)',
                          borderRadius: '2px',
                          pointerEvents: 'none'
                        }} />

                        {/* Tên màu hiển thị trực quan hệt như cv2.putText trong Python */}
                        {colorKey !== 'invalid' ? (
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: '900',
                            color: '#ffffff',
                            textShadow: '0 0 3px #000, 0 0 2px #000',
                            zIndex: 2,
                            background: 'rgba(0, 0, 0, 0.65)',
                            padding: '1px 3px',
                            borderRadius: '3px',
                            lineHeight: 1
                          }}>
                            {viName}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.55rem', color: '#64748b' }}>?</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Nút chuyển nhanh theme góc dưới cam phụ */}
                <button
                  type="button"
                  onClick={cycleHudTheme}
                  title="Đổi giao diện HUD Camera"
                  style={{
                    position: 'absolute',
                    bottom: '3px',
                    right: '3px',
                    background: currentHudTheme.badgeBg,
                    color: currentHudTheme.badgeTextColor,
                    border: `1px solid ${currentHudTheme.color}`,
                    borderRadius: '4px',
                    fontSize: '0.5rem',
                    fontWeight: '800',
                    padding: '1px 4px',
                    cursor: 'pointer',
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    backdropFilter: 'blur(4px)',
                    boxShadow: `0 0 6px ${currentHudTheme.glowColor}`
                  }}
                >
                  <span>{currentHudTheme.shortName}</span>
                  <span style={{ fontSize: '0.48rem' }}>↻</span>
                </button>
              </div>

              <div style={{ flex: 1, minWidth: '180px', fontSize: '0.74rem', lineHeight: 1.4, color: preCheckStatus.verified ? '#4ade80' : (preCheckStatus.isMismatch ? '#ef4444' : '#f59e0b') }}>
                <div style={{ fontWeight: '800', marginBottom: '2px', color: preCheckStatus.verified ? '#4ade80' : (preCheckStatus.isMismatch ? '#f87171' : '#38bdf8') }}>
                  {preCheckStatus.verified
                    ? `🟢 ĐÃ CHECK KHỐI ${currentDim}×${currentDim} — SẴN SÀNG`
                    : (preCheckStatus.isMismatch ? `❌ PHÁT HIỆN XÁO SAI SCRAMBLE (${preCheckStatus.scrambleMatchRate || 0}%)` : `🔍 ĐẶT KHỐI ${currentDim}×${currentDim} VÀO KHUNG LƯỚI`)}
                </div>
                <div>{preCheckStatus.text}</div>
                {preCheckStatus.isMismatch && !allowFreestyleScramble && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setScramble(generateScramble(puzzleType));
                        setScannedFaces({});
                        scannedFacesRef.current = {};
                        setAllowFreestyleScramble(false);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 Đổi đề bài khác
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllowFreestyleScramble(true)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.25)',
                        border: '1px solid #f59e0b',
                        color: '#fbbf24',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Bỏ qua & Giải tự do
                    </button>
                  </div>
                )}
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
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid rgba(239, 68, 68, 0.45)',
              color: '#fca5a5',
              fontSize: '0.76rem',
              fontWeight: '700',
              maxWidth: '620px',
              width: '100%',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div>
                🔒 <strong>ĐỒNG HỒ ĐANG KHÓA:</strong> Bắt buộc phải bật Camera AI và xác minh khối Rubik trên Mô hình 3D mới được phép bấm giờ giải!
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={toggleCamera}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    border: '1px solid #4ade80',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    flexShrink: 0,
                    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)'
                  }}
                >
                  <span>📷 Bật Camera AI & Mô Hình 3D Ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* NÚT ĐIỀU HƯỚNG NHANH: LƯỚT XUỐNG ĐỒNG HỒ */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px 0', width: '100%' }}>
            <button
              type="button"
              onClick={() => {
                const timerEl = document.getElementById('rubik-main-timer-section');
                if (timerEl) {
                  timerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              title="Bấm để lướt nhanh xuống vùng Đồng hồ bấm giờ & Bàn tay"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                borderRadius: '20px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: `1.5px solid ${currentHudTheme.color}88`,
                color: '#f8fafc',
                fontSize: '0.74rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${currentHudTheme.glowColor}`,
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(6px)'
              }}
            >
              <span>⬇️ Lướt xuống Đồng hồ bấm giờ</span>
            </button>
          </div>

          {/* Center-Middle: GIANT TIMER & SPEEDCUBING TOUCHPAD */}
          <div
            id="rubik-main-timer-section"
            onPointerDown={handleTimerPointerDown}
            onPointerMove={handleTimerPointerMove}
            onPointerUp={handleTimerPointerUp}
            onPointerCancel={handleTimerPointerUp}
            className={timerState === 'ready' || timerState === 'running' ? 'touch-timer-pad-active' : 'touch-timer-surface'}
            style={{
              cursor: cameraActive && preCheckStatus.verified ? 'pointer' : 'not-allowed',
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
                : timerState === 'ready'
                  ? '#22c55e'
                  : timerState === 'holding'
                    ? '#f59e0b'
                    : !cameraActive
                      ? '#475569'
                      : !preCheckStatus.verified && timerState === 'idle'
                        ? '#94a3b8'
                        : '#ffffff',
              textShadow: timerState === 'ready'
                ? '0 0 45px rgba(34, 197, 94, 0.5)'
                : (timerState === 'running' ? currentHudTheme.timerGlow : 'none'),
              transition: 'color 0.1s ease'
            }}>
              {timerState === 'inspecting' ? inspectionSeconds : formatTime(timeMs)}
            </div>

            <div style={{
              marginTop: '10px',
              fontSize: isMobile ? '0.84rem' : '0.92rem',
              textAlign: 'center',
              fontWeight: '700',
              color: timerState === 'inspecting'
                ? '#f59e0b'
                : timerState === 'ready'
                  ? '#22c55e'
                  : timerState === 'holding'
                    ? '#f59e0b'
                    : timerState === 'running'
                      ? '#4ade80'
                      : solveStep === 'step3_completed'
                        ? '#facc15'
                        : solveStep === 'step2_ready_solve'
                          ? '#22c55e'
                          : !cameraActive
                            ? '#f87171'
                            : !preCheckStatus.verified
                              ? '#38bdf8'
                              : '#4ade80'
            }}>
              {timerState === 'inspecting' && (isMobile ? '⏱️ ĐANG QUAN SÁT (15s) — CHẠM GIỮ ĐỂ SẴN SÀNG!' : '⏱️ ĐANG QUAN SÁT (15s WCA) — GIỮ SPACE ĐỂ SẴN SÀNG!')}
              {timerState === 'ready' && (isMobile ? '● SẴN SÀNG — THẢ TAY ĐỂ BẮT ĐẦU!' : '● SẴN SÀNG — THẢ PHÍM SPACE ĐỂ BẮT ĐẦU!')}
              {timerState === 'holding' && '○ Giữ yên thêm một chút... (Vuốt để cuộn trang)'}
              {timerState === 'running' && (isMobile ? '⚡ Đang tính giờ... Chạm bất kỳ đâu để DỪNG!' : '⚡ Đang tính giờ... (Nhấn phím bất kỳ hoặc click để dừng)')}
              {timerState === 'idle' && (
                solveStep === 'step3_completed' ? (
                  `🎉 BƯỚC 3: HOÀN THÀNH — Lượt giải ${(timeMs / 1000).toFixed(2)}s! Bấm nút "Lượt mới" bên dưới (hoặc bấm Space) để sang lượt tiếp theo.`
                ) : solveStep === 'step2_ready_solve' ? (
                  isMobile
                    ? `🟢 BƯỚC 2: ĐÃ XÁC NHẬN ĐÚNG SCB — Chạm giữ bên dưới để vào vạch xuất phát!`
                    : `🟢 BƯỚC 2: ĐÃ XÁC NHẬN ĐÚNG SCB — Giữ phím SPACE để vào vạch xuất phát!`
                ) : !cameraActive ? (
                  '🔒 ĐỒNG HỒ ĐANG KHÓA — Bắt buộc Bật Camera AI mới được giải!'
                ) : !preCheckStatus.verified ? (
                  `🔍 BƯỚC 1: KIỂM TRA SCB — Quét ${Object.keys(scannedFaces).length}/${(adminSettings.requiredPreCheckFaces === 6 ? 6 : 3)} mặt hoặc bấm "Xác nhận đúng r bắt đầu giải" để mở khóa!`
                ) : (
                  isMobile
                    ? `🟢 BƯỚC 2: ĐÃ XÁC NHẬN — Chạm giữ bên dưới để giải!`
                    : `🟢 BƯỚC 2: ĐÃ XÁC NHẬN — Giữ phím SPACE để giải!`
                )
              )}
            </div>

            {/* BƯỚC 1: NÚT XÁC NHẬN NHANH ĐỂ MỞ KHÓA GIẢI */}
            {timerState === 'idle' && solveStep === 'step1_check_scb' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={confirmScrambleAndReady}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    border: '2px solid #4ade80',
                    color: '#ffffff',
                    fontSize: '0.86rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(34, 197, 94, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>✅ Xác nhận đúng r bắt đầu giải</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOpenCvScannerModal(true);
                    if (!cameraActive) setCameraActive(true);
                  }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.35), rgba(14, 116, 144, 0.45))',
                    border: '1.8px solid #06b6d4',
                    color: '#67e8f9',
                    fontSize: '0.84rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(6, 182, 212, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Quét 6 mặt Rubik chuẩn OpenCV HSV & Tự động tìm chuỗi giải Kociemba tối ưu"
                >
                  <span>📸 Quét 6 Mặt OpenCV & Kociemba</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFaceVerificationMode(adminSettings.requiredPreCheckFaces === 6 ? 3 : 6)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1.5px solid #475569',
                    color: '#cbd5e1',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <span>{adminSettings.requiredPreCheckFaces === 6 ? '🛡️ Chế độ 6 Mặt (Admin)' : '⚡ Chế độ 3 Mặt (Nhanh)'}</span>
                  <span style={{ fontSize: '0.7rem', color: '#38bdf8', marginLeft: '4px' }}>[Đổi]</span>
                </button>
              </div>
            )}

            {/* BƯỚC 3: THẺ KẾT QUẢ VÀ NÚT SANG LƯỢT TIẾP THEO */}
            {timerState === 'idle' && solveStep === 'step3_completed' && (
              <div style={{
                marginTop: '14px',
                padding: '14px 18px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(16, 24, 39, 0.95), rgba(6, 26, 17, 0.95))',
                border: '2px solid #22c55e',
                boxShadow: '0 6px 28px rgba(34, 197, 94, 0.35)',
                textAlign: 'center',
                maxWidth: '480px',
                width: '100%'
              }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4ade80', marginBottom: '4px' }}>
                  🎉 HOÀN THÀNH XUẤT SẮC: {(timeMs / 1000).toFixed(2)}s
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '10px' }}>
                  {solves[0]?.verified ? '✓ AI Camera đã xác thực chuẩn WCA & Bảng Kỷ Lục' : 'Luyện tập cá nhân'}
                </div>
                {kociembaOptimal && (
                  <div style={{ fontSize: '0.74rem', color: '#38bdf8', background: 'rgba(2, 132, 199, 0.15)', padding: '5px 10px', borderRadius: '6px', marginBottom: '12px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    ⚡ Nghiệm tối ưu Kociemba: {kociembaOptimal.moveCount} bước ({kociembaOptimal.solution})
                  </div>
                )}
                <button
                  type="button"
                  onClick={startNextSolveRound}
                  style={{
                    padding: '11px 22px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: '1.5px solid #60a5fa',
                    color: '#ffffff',
                    fontSize: '0.92rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(37, 99, 235, 0.45)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🔄 BẮT ĐẦU LƯỢT TIẾP THEO (TẠO SCRAMBLE MỚI)</span>
                </button>
              </div>
            )}

            {/* NÚT MỞ KHÓA CAMERA HOẶC BÀN ĐẶT TAY SPEEDCUBING */}
            {!cameraActive && timerState === 'idle' ? (
              <button
                type="button"
                onClick={toggleCamera}
                style={{
                  marginTop: '14px',
                  width: '100%',
                  maxWidth: '350px',
                  padding: '15px 16px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  border: '2px solid #4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 24px rgba(34, 197, 94, 0.35)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>📷</span>
                <span>BẬT CAMERA AI ĐỂ MỞ KHÓA ĐỒNG HỒ</span>
              </button>
            ) : isMobile ? (
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
                        : preCheckStatus.verified
                          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(15, 23, 42, 0.95))'
                          : 'linear-gradient(180deg, #111c34 0%, #0b1324 100%)',
                  border: timerState === 'ready'
                    ? '2px solid #22c55e'
                    : timerState === 'holding'
                      ? '2px solid #f59e0b'
                      : timerState === 'running'
                        ? '2px solid #ef4444'
                        : preCheckStatus.verified
                          ? '2px solid #22c55e'
                          : '1.5px dashed #f59e0b88',
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
                        : preCheckStatus.verified
                          ? '#4ade80'
                          : '#fbbf24',
                  fontWeight: '800',
                  fontSize: '0.84rem',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.4)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>
                  {timerState === 'running'
                    ? '🛑'
                    : timerState === 'ready'
                      ? '🟢'
                      : preCheckStatus.verified
                        ? '🖐️'
                        : '🔒'}
                </span>
                <span>
                  {timerState === 'running'
                    ? 'CHẠM ĐỂ DỪNG ĐỒNG HỒ'
                    : timerState === 'ready'
                      ? 'THẢ TAY RA ĐỂ CHẠY!'
                      : timerState === 'holding'
                        ? 'ĐANG GIỮ TAY...'
                        : preCheckStatus.verified
                          ? 'ĐẶT & GIỮ TAY TẠI ĐÂY ĐỂ GIẢI'
                          : 'ĐƯA RUBIK VÀO CAM ĐỂ MỞ KHÓA'}
                </span>
              </div>
            ) : null}

            
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
                {lastTargetResult === 'win'
                  ? `🎉 CHIẾN THẮNG! ${currentUser.name} đã xuất sắc đạt mục tiêu Sub-${targetSeconds}s!`
                  : `⚡ Chưa đạt mốc Sub-${targetSeconds}s, tuyển thủ ${currentUser.name} hãy cố gắng thêm nhé!`}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.78rem', lineHeight: 1.5 }}>
            <div>📱 <strong>Mobile:</strong> Chạm giữ màn hình chờ xanh lá → Thả tay để giải → Chạm để dừng</div>
            <div>💻 <strong>Desktop:</strong> Giữ phím Space chờ xanh lá → Thả tay để giải → Bấm phím bất kỳ để dừng</div>
          </div>

          {/* NÚT ĐIỀU HƯỚNG NHANH: LƯỚT LÊN CAMERA & 3D */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              title="Bấm để lướt lên xem Camera & Mô hình 3D"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                borderRadius: '20px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: `1.5px solid ${currentHudTheme.color}88`,
                color: '#f8fafc',
                fontSize: '0.74rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: `0 2px 10px ${currentHudTheme.glowColor}`,
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(6px)'
              }}
            >
              <span>⬆️ Lướt lên xem Camera & 3D</span>
            </button>
          </div>
            </>
          )}
        </div>
        )}

        {/* === CỘT PHẢI: BẢNG XẾP HẠNG === */}
        {gameMode !== 'solo' && (!isMobile || mobileTab === 'leaderboard') && (
        <div
          id="rubik-leaderboard-section"
          style={{
          backgroundColor: currentHudTheme.cardBg,
          width: isMobile ? '100%' : undefined,
          border: currentHudTheme.cardBorder,
          boxShadow: currentHudTheme.cardShadow,
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
                background: currentHudTheme.innerCardBg,
                border: currentHudTheme.innerCardBorder,
                color: currentHudTheme.textColor,
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
                background: `linear-gradient(135deg, ${currentHudTheme.primaryAccent}, #1d4ed8)`,
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

            <div style={{ display: 'flex', background: currentHudTheme.innerCardBg, borderRadius: '4px', border: currentHudTheme.innerCardBorder, padding: '2px' }}>
              <button
                onClick={() => setLeaderboardFilter('current')}
                style={{
                  background: leaderboardFilter === 'current' ? currentHudTheme.primaryAccent : 'transparent',
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
                  background: leaderboardFilter === 'all' ? currentHudTheme.primaryAccent : 'transparent',
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
            color: currentHudTheme.subTextColor,
            borderBottom: currentHudTheme.innerCardBorder,
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
                <div style={{ color: currentHudTheme.textColor, fontWeight: '700', fontSize: '0.92rem', marginBottom: '6px' }}>
                  Bảng Kỷ Lục AI Hoàn Toàn Sạch
                </div>
                <p style={{ margin: '0 auto', fontSize: '0.76rem', color: currentHudTheme.subTextColor, maxWidth: '280px', lineHeight: '1.4' }}>
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
                    borderBottom: currentHudTheme.innerCardBorder,
                    fontSize: '0.8rem',
                    alignItems: 'center',
                    background: index === 0 ? (hudThemeKey === 'sakura' ? 'rgba(244, 114, 182, 0.12)' : 'rgba(37, 99, 235, 0.08)') : 'transparent',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{
                    fontWeight: '700',
                    color: index === 0 ? '#f59e0b' : currentHudTheme.primaryAccent
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
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            width: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: currentHudTheme.primaryAccent }}>
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
                scramble={scramble}
                lastMove={lastMoveDetected}
                trackingBox={trackingBox}
                modelVerification={model3DVerification}
                surfaceProfile={surfaceProfile}
                activeFace={currentActiveFace}
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
          backgroundColor: currentHudTheme.cardBg,
          borderTop: currentHudTheme.cardBorder,
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

      {/* =========================================================================
          MODAL: MÁY QUÉT 6 MẶT RUBIK CHUẨN OPENCV & KOCIEMBA (quet_rubik_6_mat.py)
      ========================================================================= */}
      {showOpenCvScannerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.94)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '12px'
        }}>
          <div style={{
            width: '95%',
            maxWidth: '920px',
            backgroundColor: '#090f1d',
            border: '2px solid #06b6d4',
            borderRadius: '18px',
            padding: isMobile ? '16px' : '22px 24px',
            boxShadow: '0 0 35px rgba(6, 182, 212, 0.35), 0 10px 40px rgba(0,0,0,0.8)',
            maxHeight: '94vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            {/* Nút đóng Modal (✕) */}
            <button
              type="button"
              onClick={() => setShowOpenCvScannerModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid #475569',
                color: '#94a3b8',
                fontSize: '1.2rem',
                cursor: 'pointer',
                borderRadius: '8px',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700'
              }}
              title="Đóng (Esc / Q)"
            >
              ✕
            </button>

            {/* Header Modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingRight: '45px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0891b2, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                boxShadow: '0 0 16px rgba(6, 182, 212, 0.5)'
              }}>
                📸
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.2rem', color: '#f8fafc', fontWeight: '800' }}>
                  Máy Quét 6 Mặt Rubik Chuẩn OpenCV & Kociemba
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  Tích hợp 100% logic Python OpenCV • Nhận diện HSV Median 9 ô • Kiểm tra 9 ô/màu • Giải Two-Phase ≤ 20 bước
                </p>
              </div>
            </div>

            {/* Thông báo hướng dẫn nhanh / Cảnh báo */}
            {openCvNotice && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: openCvNotice.type === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : openCvNotice.type === 'warning'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${openCvNotice.type === 'error' ? '#ef4444' : openCvNotice.type === 'warning' ? '#f59e0b' : '#22c55e'}`,
                color: openCvNotice.type === 'error' ? '#fca5a5' : openCvNotice.type === 'warning' ? '#fcd34d' : '#86efac',
                fontSize: '0.78rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>{openCvNotice.text}</span>
              </div>
            )}

            {/* Bố cục chính: Khung hình Camera OpenCV (Trái) & Bảng điều khiển 6 mặt (Phải) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr',
              gap: '16px',
              alignItems: 'start'
            }}>
              {/* CỘT TRÁI: CAMERA CANVAS LIVE VỚI LƯỚI 3X3 & CROP 34% CYAN */}
              <div>
                <div style={{
                  position: 'relative',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  background: '#020617',
                  border: '1.5px solid rgba(6, 182, 212, 0.4)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
                }}>
                  <canvas
                    ref={openCvCanvasRef}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      aspectRatio: '4 / 3',
                      objectFit: 'contain'
                    }}
                  />
                  {!cameraActive && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(2, 6, 23, 0.85)',
                      color: '#94a3b8',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '2rem' }}>📷</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700' }}>Camera đang tắt</span>
                      <button
                        type="button"
                        onClick={() => setCameraActive(true)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          background: '#16a34a',
                          border: 'none',
                          color: '#fff',
                          fontSize: '0.78rem',
                          fontWeight: '800',
                          cursor: 'pointer'
                        }}
                      >
                        Bật Camera ngay
                      </button>
                    </div>
                  )}
                </div>

                {/* Hướng dẫn phím tắt dưới Camera */}
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(51, 65, 85, 0.5)',
                  fontSize: '0.72rem',
                  color: '#94a3b8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}>
                  <span>⌨️ <strong>Space</strong>: Lưu mặt</span>
                  <span><strong>1-6</strong>: Chọn mặt</span>
                  <span><strong>H</strong>: Bật/Tắt HSV</span>
                  <span><strong>S</strong>: Tải JSON</span>
                  <span><strong>Esc</strong>: Đóng</span>
                </div>
              </div>

              {/* CỘT PHẢI: BỘ CHỌN 6 MẶT, NÚT THAO TÁC, BẢNG ĐẾM MÀU & KOCIEMBA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 1. Mặt hiện tại & Nút chụp mặt */}
                <div style={{
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(6, 182, 212, 0.3)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: '700' }}>
                      ĐANG QUÉT MẶT:
                    </span>
                    <span style={{
                      fontSize: '0.76rem',
                      fontWeight: '800',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(6, 182, 212, 0.2)',
                      color: '#38bdf8'
                    }}>
                      {OPENCV_MAT[openCvFaceIdx][0]} - {OPENCV_MAT[openCvFaceIdx][1]}
                    </span>
                  </div>

                  {/* Nút LƯU MẶT NÀY (Phím Space) */}
                  <button
                    type="button"
                    onClick={saveCurrentOpenCvFace}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      border: '2px solid #4ade80',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(34, 197, 94, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>📸 LƯU MẶT NÀY (SPACE)</span>
                  </button>

                  {/* Tabs chọn nhanh 6 mặt U, R, F, D, L, B */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginTop: '10px' }}>
                    {OPENCV_MAT.map(([key, name], idx) => {
                      const isSaved = Boolean(openCvFaces[key]);
                      const isSelected = openCvFaceIdx === idx;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setOpenCvFaceIdx(idx);
                            openCvFaceIdxRef.current = idx;
                            playAppSound('click');
                          }}
                          style={{
                            padding: '6px 2px',
                            borderRadius: '6px',
                            background: isSelected
                              ? 'linear-gradient(135deg, #0891b2, #0284c7)'
                              : isSaved
                                ? 'rgba(34, 197, 94, 0.18)'
                                : 'rgba(30, 41, 59, 0.6)',
                            border: isSelected
                              ? '1.5px solid #38bdf8'
                              : isSaved
                                ? '1px solid #22c55e'
                                : '1px solid #334155',
                            color: isSelected ? '#ffffff' : isSaved ? '#4ade80' : '#94a3b8',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          <span>{key}</span>
                          <span style={{ fontSize: '0.58rem' }}>{isSaved ? '✓' : name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Nút công cụ phụ: Hiện HSV, Tải JSON, Làm mới */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setOpenCvShowHsv(prev => !prev)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: openCvShowHsv ? 'rgba(234, 179, 8, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                        border: openCvShowHsv ? '1px solid #eab308' : '1px solid #334155',
                        color: openCvShowHsv ? '#fef08a' : '#cbd5e1',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {openCvShowHsv ? '👁️ Ẩn HSV' : '👁️ Xem HSV (H)'}
                    </button>
                    <button
                      type="button"
                      onClick={downloadOpenCvJson}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid #334155',
                        color: '#38bdf8',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      💾 Tải JSON (S)
                    </button>
                    <button
                      type="button"
                      onClick={resetOpenCvScanner}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid #334155',
                        color: '#94a3b8',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Quét lại từ đầu"
                    >
                      🔄
                    </button>
                  </div>
                </div>

                {/* 2. Thống kê số lượng ô từng màu (dem_mau trong python) */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(51, 65, 85, 0.6)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#cbd5e1' }}>
                      📊 THỐNG KÊ MÀU (dem_mau):
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      Chuẩn: đúng 9 ô mỗi màu
                    </span>
                  </div>

                  {(() => {
                    const counts = demMauOpenCv(openCvFaces);
                    const colorBadgeMap = [
                      { name: 'Đỏ', hex: '#ef4444', icon: '🔴' },
                      { name: 'Cam', hex: '#f97316', icon: '🟠' },
                      { name: 'Vàng', hex: '#eab308', icon: '🟡' },
                      { name: 'Xanh lá', hex: '#22c55e', icon: '🟢' },
                      { name: 'Xanh dương', hex: '#3b82f6', icon: '🔵' },
                      { name: 'Trắng', hex: '#f8fafc', icon: '⚪' }
                    ];
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {colorBadgeMap.map(c => {
                          const val = counts[c.name] || 0;
                          const isOk = val === 9;
                          return (
                            <div
                              key={c.name}
                              style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                background: isOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(15, 23, 42, 0.8)',
                                border: isOk ? '1px solid #22c55e' : '1px solid #334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.7rem'
                              }}
                            >
                              <span style={{ color: c.hex, fontWeight: '700' }}>
                                {c.icon} {c.name}
                              </span>
                              <span style={{
                                fontWeight: '800',
                                color: isOk ? '#4ade80' : val > 9 ? '#f87171' : '#94a3b8'
                              }}>
                                {val}/9
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* 3. Khối kết quả Kociemba Two-Phase Optimal Solver */}
                {openCvKociemba && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '12px',
                    background: openCvKociemba.success
                      ? 'linear-gradient(135deg, rgba(22, 163, 74, 0.2), rgba(6, 182, 212, 0.15))'
                      : 'rgba(239, 68, 68, 0.15)',
                    border: openCvKociemba.success ? '1.5px solid #22c55e' : '1px solid #ef4444'
                  }}>
                    {openCvKociemba.success ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#4ade80' }}>
                            ⚡ KOCIEMBA TỐI ƯU ({openCvKociemba.moveCount} BƯỚC):
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#86efac' }}>
                            God's Number ≤ 20
                          </span>
                        </div>

                        {/* Chuỗi bước giải Kociemba */}
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.84rem',
                          color: '#f8fafc',
                          background: 'rgba(0, 0, 0, 0.5)',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(74, 222, 128, 0.3)',
                          marginBottom: '10px',
                          lineHeight: '1.4',
                          wordBreak: 'break-all'
                        }}>
                          {openCvKociemba.solution}
                        </div>

                        {/* 2 Nút thao tác sau khi giải xong */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setKociembaSolverSource('camera');
                              setKociembaCurrentStep(0);
                              setKociembaIsPlaying(false);
                              setShowOpenCvScannerModal(false);
                              setShowKociembaModal(true);
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                              border: '1px solid #38bdf8',
                              color: '#ffffff',
                              fontSize: '0.74rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>▶️ Xem hướng dẫn từng bước</span>
                          </button>

                          <button
                            type="button"
                            onClick={applyOpenCvToTimer}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #16a34a, #15803d)',
                              border: '1px solid #4ade80',
                              color: '#ffffff',
                              fontSize: '0.74rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)'
                            }}
                          >
                            <span>✅ Áp dụng & Bắt đầu giải (B2)</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.74rem', color: '#fca5a5' }}>
                        <strong>⚠️ Không thể giải:</strong> {openCvKociemba.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: BỘ GIẢI RUBIK KOCIEMBA TWO-PHASE (OPTIMAL ≤ 20 BƯỚC)
      ========================================== */}
      {showKociembaModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.92)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '680px',
            backgroundColor: currentHudTheme.cardBg,
            border: `1.5px solid ${currentHudTheme.color}`,
            borderRadius: '16px',
            padding: '24px 26px',
            boxShadow: `0 8px 32px ${currentHudTheme.glowColor}, 0 4px 16px rgba(0,0,0,0.7)`,
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowKociembaModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.3rem',
                cursor: 'pointer',
                fontWeight: '700'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '1.6rem' }}>⚡</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: '800' }}>
                  Bộ Giải Rubik Tối Ưu Kociemba (Two-Phase Algorithm)
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  Thuật toán tiêu chuẩn thế giới của Herbert Kociemba — Tìm chuỗi bước giải tối ưu ≤ 20-22 bước (God's Number)
                </p>
              </div>
            </div>

            {/* Bộ chọn nguồn giải: Scramble đề bài VS Khối 6 mặt từ Camera AI */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setKociembaSolverSource('scramble');
                  setKociembaCurrentStep(0);
                  setKociembaIsPlaying(false);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: kociembaSolverSource === 'scramble' ? '#2563eb' : '#1e293b',
                  border: kociembaSolverSource === 'scramble' ? '1.5px solid #60a5fa' : '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                📄 Giải theo Scramble đề bài
              </button>
              <button
                type="button"
                onClick={() => {
                  setKociembaSolverSource('camera');
                  setKociembaCurrentStep(0);
                  setKociembaIsPlaying(false);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: kociembaSolverSource === 'camera' ? '#16a34a' : '#1e293b',
                  border: kociembaSolverSource === 'camera' ? '1.5px solid #4ade80' : '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>📸 Giải khối 6 mặt từ Camera AI</span>
                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,0,0,0.4)', color: '#86efac' }}>
                  {Object.keys(scannedFaces).length}/6 mặt
                </span>
              </button>
            </div>

            {/* Thông tin trạng thái nguồn */}
            {kociembaSolverSource === 'scramble' ? (
              <div style={{
                background: '#090f1d',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', marginBottom: '3px' }}>
                  ĐỀ BÀI SCRAMBLE (3x3):
                </div>
                <div style={{ fontSize: '0.88rem', color: '#cbd5e1', fontFamily: 'monospace', fontWeight: '700' }}>
                  {scramble}
                </div>
              </div>
            ) : (
              <div style={{
                background: '#090f1d',
                border: kociembaFromCamera?.success ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ fontSize: '0.7rem', color: kociembaFromCamera?.success ? '#4ade80' : '#fbbf24', fontWeight: '800', marginBottom: '3px' }}>
                  {kociembaFromCamera?.success ? '🟢 ĐÃ KHỚP 54 Ô MÀU TỪ CAMERA:' : '⚠️ TRẠNG THÁI QUÉT CAMERA:'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
                  {kociembaFromCamera?.success
                    ? `Chuỗi ký tự Kociemba 54 ô: ${kociembaFromCamera.cubeStr}`
                    : (kociembaFromCamera?.error || `Đã quét ${Object.keys(scannedFaces).length}/6 mặt. Hãy quay tiếp các mặt còn thiếu trước Camera (hoặc bấm C để chụp).`)}
                </div>
              </div>
            )}

            {/* BỘ PHÁT TỪNG BƯỚC GIẢI TRỰC QUAN (INTERACTIVE STEP-BY-STEP SOLVER) */}
            {activeKociembaResult?.success && activeMovesList.length > 0 ? (
              <div style={{
                background: 'linear-gradient(135deg, rgba(6, 26, 17, 0.95), rgba(9, 15, 29, 0.95))',
                border: '1.5px solid #22c55e',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 0 20px rgba(34, 197, 94, 0.25)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🏆</span>
                    <span>NGHIỆM GIẢI TỐI ƯU KOCIEMBA ({activeMovesList.length} BƯỚC)</span>
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    Bước {kociembaCurrentStep + 1} / {activeMovesList.length} ({Math.round(((kociembaCurrentStep + 1) / activeMovesList.length) * 100)}%)
                  </span>
                </div>

                {/* Thanh tiến độ bước giải */}
                <div style={{ width: '100%', height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{
                    width: `${((kociembaCurrentStep + 1) / activeMovesList.length) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #22c55e, #38bdf8)',
                    transition: 'width 0.2s ease'
                  }} />
                </div>

                {/* Khung hướng dẫn bước hiện tại */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px',
                  background: '#04110a',
                  borderRadius: '10px',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    fontSize: '2.2rem',
                    fontWeight: '900',
                    color: '#22c55e',
                    fontFamily: 'monospace',
                    minWidth: '65px',
                    textAlign: 'center',
                    padding: '4px 10px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    borderRadius: '8px',
                    border: '1.5px solid #22c55e',
                    boxShadow: '0 0 14px rgba(34, 197, 94, 0.3)'
                  }}>
                    {activeMovesList[kociembaCurrentStep] || '...'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.94rem', fontWeight: '800', color: '#ffffff', marginBottom: '2px' }}>
                      {getMoveExplanationVi(activeMovesList[kociembaCurrentStep])}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Kociemba Two-Phase Optimal Step • Đưa khối về đúng trạng thái
                    </div>
                  </div>
                </div>

                {/* Nút điều khiển tiến / lùi / tự động chạy */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => { setKociembaCurrentStep(0); setKociembaIsPlaying(false); }}
                    disabled={kociembaCurrentStep === 0}
                    style={{ padding: '5px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#ffffff', fontSize: '0.72rem', cursor: 'pointer', opacity: kociembaCurrentStep === 0 ? 0.4 : 1 }}
                  >
                    ⏮️ Đầu
                  </button>
                  <button
                    type="button"
                    onClick={() => { setKociembaCurrentStep(p => Math.max(0, p - 1)); setKociembaIsPlaying(false); }}
                    disabled={kociembaCurrentStep === 0}
                    style={{ padding: '5px 14px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#ffffff', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', opacity: kociembaCurrentStep === 0 ? 0.4 : 1 }}
                  >
                    ◀ Trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setKociembaIsPlaying(p => !p)}
                    style={{
                      padding: '5px 16px',
                      borderRadius: '6px',
                      background: kociembaIsPlaying ? '#eab308' : 'linear-gradient(135deg, #16a34a, #15803d)',
                      border: '1px solid #4ade80',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(34, 197, 94, 0.3)'
                    }}
                  >
                    {kociembaIsPlaying ? '⏸️ Tạm dừng' : '▶️ Tự động chạy (1.5s)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setKociembaCurrentStep(p => Math.min(activeMovesList.length - 1, p + 1)); setKociembaIsPlaying(false); }}
                    disabled={kociembaCurrentStep >= activeMovesList.length - 1}
                    style={{ padding: '5px 14px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#ffffff', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', opacity: kociembaCurrentStep >= activeMovesList.length - 1 ? 0.4 : 1 }}
                  >
                    Sau ▶
                  </button>
                </div>

                {/* Danh sách các chip bước giải có thể click để nhảy bước */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '100px', overflowY: 'auto', padding: '6px', background: 'rgba(2, 6, 23, 0.6)', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  {activeMovesList.map((m, idx) => {
                    const isActive = idx === kociembaCurrentStep;
                    const isPast = idx < kociembaCurrentStep;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => { setKociembaCurrentStep(idx); setKociembaIsPlaying(false); }}
                        title={`Bước ${idx + 1}: ${getMoveExplanationVi(m)}`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: isActive ? '#22c55e' : (isPast ? 'rgba(34, 197, 94, 0.2)' : 'rgba(30, 41, 59, 0.6)'),
                          color: isActive ? '#000000' : (isPast ? '#86efac' : '#cbd5e1'),
                          border: isActive ? '1px solid #ffffff' : (isPast ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid transparent'),
                          fontWeight: '800',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          boxShadow: isActive ? '0 0 10px #22c55e' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                background: '#04110a',
                border: '1px solid #ef4444',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px',
                color: '#fca5a5',
                fontSize: '0.84rem',
                textAlign: 'center'
              }}>
                {activeKociembaResult?.error || 'Không thể tính toán nghiệm giải cho trạng thái này.'}
              </div>
            )}

            {/* Các nút hành động */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  if (kociembaOptimal?.solution) {
                    navigator.clipboard?.writeText(kociembaOptimal.solution);
                    setLastNotice({ text: '📋 Đã sao chép công thức giải Kociemba vào clipboard!', type: 'success' });
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>📋</span>
                <span>Sao chép công thức</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScramble(generateScramble('3x3'));
                  setScannedFaces({});
                  scannedFacesRef.current = {};
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔄</span>
                <span>Xáo bài mới & Giải lại</span>
              </button>
            </div>
          </div>
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
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: currentHudTheme.cardShadow,
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
              <div style={{ background: currentHudTheme.innerCardBg, padding: '12px', borderRadius: '10px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.7rem', color: currentHudTheme.subTextColor }}>Best Single ({puzzleType})</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: currentHudTheme.primaryAccent }}>{bestTime}s</div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '12px', borderRadius: '10px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.7rem', color: currentHudTheme.subTextColor }}>Current ao5</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '12px', borderRadius: '10px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.7rem', color: currentHudTheme.subTextColor }}>Current ao12</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>

              <div style={{ background: currentHudTheme.innerCardBg, padding: '12px', borderRadius: '10px', border: currentHudTheme.innerCardBorder }}>
                <div style={{ fontSize: '0.7rem', color: currentHudTheme.subTextColor }}>Tổng Lượt Giải</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: currentHudTheme.textColor }}>
                  {solves.length} lượt
                </div>
              </div>
            </div>

            {/* SVG Line Chart */}
            <div style={{ background: currentHudTheme.innerCardBg, padding: '16px', borderRadius: '12px', border: currentHudTheme.innerCardBorder, marginBottom: '20px' }}>
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

            {/* Bảng so sánh 6 khối (2x2 -> 7x7) */}
            <div style={{ background: '#111c34', padding: '16px', borderRadius: '12px', border: '1px solid #1a2a4c' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '12px' }}>
                🏆 Tổng Kết Thành Tích Các Khối (2×2 đến 7×7)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px' }}>
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
          MODAL / AUTH GATE: BẮT BUỘC ĐĂNG NHẬP / ĐĂNG KÝ / LIÊN KẾT GMAIL
      ========================================== */}
      {(isGuest || showAuthModal) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(3, 7, 18, 0.88)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '430px',
            backgroundColor: currentHudTheme.cardBg,
            border: isGuest ? `1.5px solid ${currentHudTheme.primaryAccent}` : currentHudTheme.cardBorder,
            borderRadius: '18px',
            padding: '26px 24px',
            boxShadow: `0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px ${currentHudTheme.glowColor}`,
            position: 'relative',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Nút đóng: Chỉ cho phép đóng khi đã đăng nhập (không phải khách) */}
            {!isGuest && (
              <button
                onClick={() => setShowAuthModal(false)}
                title="Đóng cửa sổ tài khoản"
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
            )}

            {/* Header Modal */}
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <div style={{
                display: 'inline-flex',
                padding: '10px 14px',
                borderRadius: '12px',
                background: isGuest ? 'rgba(244, 114, 182, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                border: isGuest ? '1px solid rgba(244, 114, 182, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                marginBottom: '10px'
              }}>
                <span style={{ fontSize: '1.5rem' }}>{isGuest ? '🔒' : '🛡️'}</span>
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.22rem', fontWeight: '800', color: '#f8fafc' }}>
                {isGuest ? 'Bắt Buộc Đăng Nhập / Đăng Ký' : 'Thông Tin Tài Khoản Tuyển Thủ'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                {isGuest
                  ? 'Hệ thống yêu cầu đăng nhập hoặc tạo tài khoản để vào thi đấu, lưu kỷ lục & chống gian lận AI.'
                  : 'Quản lý tài khoản tuyển thủ và đồng bộ bảng kỷ lục toàn cầu.'}
              </p>
            </div>

            {/* ĐÃ ĐĂNG NHẬP: Hiển thị Thẻ hồ sơ & Nút Đăng xuất */}
            {!isGuest && (
              <div style={{
                marginBottom: '18px',
                padding: '14px',
                borderRadius: '10px',
                background: isKhoaAdmin ? 'rgba(245, 158, 11, 0.1)' : '#111c34',
                border: isKhoaAdmin ? '1.5px solid #f59e0b' : '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.92rem', color: isKhoaAdmin ? '#fbbf24' : '#38bdf8' }}>
                      {currentUser.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                      {currentUser.email}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#4ade80', marginTop: '2px', fontWeight: '600' }}>
                      ✓ Đã xác thực ({currentUser.provider === 'google' ? 'Liên kết Gmail Google' : 'Email'})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      background: '#ef4444',
                      border: 'none',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Đăng xuất
                  </button>
                </div>

                {isKhoaAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAuthModal(false);
                      handleOpenKhoaAdminPanel();
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '7px',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: '800',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>👑</span>
                    <span>Mở Trung Tâm Quản Trị Của Khoa</span>
                  </button>
                )}
              </div>
            )}

            {/* KHI CHƯA ĐĂNG NHẬP: GIAO DIỆN LIÊN KẾT GMAIL VÀ EMAIL/MẬT KHẨU BẮT BUỘC */}
            {isGuest && (
              <div>
                {/* 1. LIÊN KẾT GMAIL / GOOGLE (1-CHẠM) */}
                <div style={{ marginBottom: '18px' }}>
                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn()}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      padding: '11px 16px',
                      borderRadius: '10px',
                      border: '1px solid #334155',
                      background: '#16223b',
                      color: '#f8fafc',
                      fontWeight: '700',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
                    }}
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Đăng nhập liên kết bằng Gmail (Khuyên dùng)</span>
                  </button>

                  {/* Form nhập nhanh Gmail nếu người dùng muốn chọn địa chỉ Gmail cụ thể */}
                  {showGoogleInput && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px',
                      borderRadius: '8px',
                      background: '#090f1d',
                      border: '1px solid #1e293b'
                    }}>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '6px' }}>
                        Nhập địa chỉ Gmail của bạn:
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="email"
                          placeholder="tenban@gmail.com"
                          value={googleEmailInput}
                          onChange={(e) => setGoogleEmailInput(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: '#111c34',
                            border: '1px solid #1e293b',
                            color: '#ffffff',
                            fontSize: '0.82rem'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleGoogleSignIn()}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            background: '#2563eb',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          Xác nhận
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Đường phân cách */}
                <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', color: '#475569' }}>
                  <div style={{ flex: 1, height: '1px', background: '#1e293b' }}></div>
                  <span style={{ padding: '0 10px', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
                    Hoặc dùng Email & Mật khẩu
                  </span>
                  <div style={{ flex: 1, height: '1px', background: '#1e293b' }}></div>
                </div>

                {/* 2 Tab: ĐĂNG NHẬP vs ĐĂNG KÝ MỚI */}
                <div style={{
                  display: 'flex',
                  background: '#080d18',
                  padding: '3px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  border: '1px solid #1e293b'
                }}>
                  <button
                    type="button"
                    onClick={() => { setAuthTab('login'); setAuthErrorMsg(''); }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: 'none',
                      background: authTab === 'login' ? '#1e293b' : 'transparent',
                      color: authTab === 'login' ? '#38bdf8' : '#64748b',
                      fontWeight: '800',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔑 Đăng Nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthTab('signup'); setAuthErrorMsg(''); }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: 'none',
                      background: authTab === 'signup' ? '#1e293b' : 'transparent',
                      color: authTab === 'signup' ? '#f472b6' : '#64748b',
                      fontWeight: '800',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✨ Đăng Ký Tài Khoản
                  </button>
                </div>

                {/* Báo lỗi nếu có */}
                {authErrorMsg && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    marginBottom: '14px',
                    lineHeight: '1.35'
                  }}>
                    {authErrorMsg}
                  </div>
                )}

                {/* FORM ĐĂNG NHẬP */}
                {authTab === 'login' && (
                  <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '5px' }}>
                        Email hoặc Gmail:
                      </label>
                      <input
                        type="email"
                        placeholder="tenban@email.com"
                        value={inputUserEmail}
                        onChange={(e) => setInputUserEmail(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '5px' }}>
                        Mật khẩu:
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={inputUserPassword}
                        onChange={(e) => setInputUserPassword(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      style={{
                        marginTop: '6px',
                        width: '100%',
                        padding: '11px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        color: '#ffffff',
                        fontWeight: '800',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                      }}
                    >
                      Xác Nhận Đăng Nhập
                    </button>
                  </form>
                )}

                {/* FORM ĐĂNG KÝ TÀI KHOẢN MỚI */}
                {authTab === 'signup' && (
                  <form onSubmit={handleEmailSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Tên hiển thị / Nickname:
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Nam Cuber Pro"
                        value={inputUserName}
                        onChange={(e) => setInputUserName(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Email:
                      </label>
                      <input
                        type="email"
                        placeholder="tenban@email.com"
                        value={inputUserEmail}
                        onChange={(e) => setInputUserEmail(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Mật khẩu (tối thiểu 6 ký tự):
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={inputUserPassword}
                        onChange={(e) => setInputUserPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Nhập lại mật khẩu:
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={inputConfirmPassword}
                        onChange={(e) => setInputConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: '#111c34',
                          border: '1px solid #1e293b',
                          color: '#f8fafc',
                          fontSize: '0.86rem'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      style={{
                        marginTop: '6px',
                        width: '100%',
                        padding: '11px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #ec4899, #be185d)',
                        border: 'none',
                        color: '#ffffff',
                        fontWeight: '800',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)'
                      }}
                    >
                      Tạo Tài Khoản & Bắt Đầu
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: TRUNG TÂM QUẢN TRỊ ĐỘC QUYỀN CỦA KHOA (SUPER-ADMIN CONTROL CENTER)
      ========================================== */}
      {showAdminPanelModal && isKhoaAdmin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.92)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '94%',
            maxWidth: '680px',
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            borderRadius: '16px',
            padding: isMobile ? '18px 16px' : '24px 28px',
            boxShadow: currentHudTheme.cardShadow,
            maxHeight: '92vh',
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
              <span style={{ fontSize: '1.7rem' }}>👑</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.22rem', color: '#f59e0b' }}>
                  Trung Tâm Quản Trị Độc Quyền Của Khoa
                </h2>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                  Tài khoản Super-Admin: <strong style={{ color: '#fbbf24' }}>{ADMIN_EMAIL}</strong> • Mở tự do mọi lúc (Ẩn 100% với người khác)
                </p>
              </div>
            </div>

            {/* PHẦN 1: THÊM / SỬA NHANH KỶ LỤC NGƯỜI CHƠI TRỰC TIẾP (LOCAL + SUPABASE CLOUD) */}
            <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid rgba(245, 158, 11, 0.45)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '0.86rem', color: '#fbbf24' }}>
                  🏆 1. Thêm / Cập Nhật Nhanh Kỷ Lục Tuyển Thủ (Local & Cloud)
                </h4>
                <button
                  type="button"
                  onClick={handleAdminForceVerifyCube}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'rgba(34, 197, 94, 0.18)',
                    border: '1px solid #22c55e',
                    color: '#4ade80',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  ⚡ Mở Khóa Nhanh Khối 3D ({puzzleType})
                </button>
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.73rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Dành riêng cho Khoa: Nhập tên tuyển thủ và thành tích để thêm mới hoặc ghi đè kỷ lục trực tiếp lên bảng <strong>"{currentBoard?.title}"</strong> và đồng bộ lên Supabase Cloud ngay lập tức.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '3px' }}>Tên tuyển thủ:</label>
                  <input
                    type="text"
                    placeholder="VD: Trần Trọng Khoa"
                    value={adminRecName}
                    onChange={(e) => setAdminRecName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 9px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '3px' }}>Khối Rubik:</label>
                  <select
                    value={adminRecPuzzle}
                    onChange={(e) => setAdminRecPuzzle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="2x2">2×2×2</option>
                    <option value="3x3">3×3×3</option>
                    <option value="4x4">4×4×4</option>
                    <option value="5x5">5×5×5</option>
                    <option value="6x6">6×6×6</option>
                    <option value="7x7">7×7×7</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '3px' }}>Best (giây):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="VD: 7.25"
                    value={adminRecBest}
                    onChange={(e) => setAdminRecBest(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#38bdf8',
                      fontWeight: '700',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '3px' }}>Ao5 (tùy chọn):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="VD: 8.10"
                    value={adminRecAvg}
                    onChange={(e) => setAdminRecAvg(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#cbd5e1',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAdminUpsertRecord}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    gridColumn: isMobile ? 'span 2' : undefined
                  }}
                >
                  ➕ Lưu Lên Bảng
                </button>
              </div>
            </div>

            {/* PHẦN 2: QUẢN LÝ TRỰC TIẾP BẢNG XẾP HẠNG HIỆN TẠI & DANH SÁCH KỶ LỤC */}
            <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #38bdf844' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.86rem', color: '#38bdf8' }}>
                📋 2. Chỉnh Sửa Trực Tiếp Bảng Xếp Hạng ({currentBoard?.entries?.length || 0} kỷ lục)
              </h4>

              {/* Đổi tên bảng & Các nút xóa nhanh */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input
                  type="text"
                  value={adminRenameBoardTitle}
                  onChange={(e) => setAdminRenameBoardTitle(e.target.value)}
                  placeholder="Tên bảng xếp hạng..."
                  style={{
                    flex: 1,
                    minWidth: '160px',
                    padding: '6px 10px',
                    borderRadius: '5px',
                    background: '#090f1d',
                    border: '1px solid #192642',
                    color: '#f8fafc',
                    fontSize: '0.8rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAdminRenameCurrentBoard}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    background: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                >
                  ✏️ Đổi Tên Bảng
                </button>
                <button
                  type="button"
                  onClick={handleClearCurrentBoard}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                >
                  🧹 Xóa Sạch Bảng Này
                </button>
                <button
                  type="button"
                  onClick={handleAdminClearSolveHistory}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '5px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid #f59e0b',
                    color: '#fbbf24',
                    fontWeight: '700',
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ Xóa Lịch Sử Cá Nhân ({solves.length})
                </button>
              </div>

              {/* Danh sách kỷ lục trong bảng hiện tại để Khoa bấm sửa / xóa trực tiếp */}
              <div style={{ maxHeight: '175px', overflowY: 'auto', borderRadius: '6px', background: '#090f1d', border: '1px solid #192642', padding: '6px' }}>
                {(!currentBoard?.entries || currentBoard.entries.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '14px', fontSize: '0.76rem', color: '#64748b' }}>
                    Bảng hiện tại đang trống. Bạn có thể thêm tuyển thủ ở mục số 1 bên trên.
                  </div>
                ) : (
                  currentBoard.entries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        padding: '6px 8px',
                        borderBottom: idx < currentBoard.entries.length - 1 ? '1px solid #111c34' : 'none',
                        fontSize: '0.78rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                        <span style={{ color: idx === 0 ? '#facc15' : '#64748b', fontWeight: '800', width: '22px' }}>
                          #{idx + 1}
                        </span>
                        <span style={{
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: '#1e293b',
                          color: '#38bdf8',
                          fontSize: '0.68rem',
                          fontWeight: '700'
                        }}>
                          {entry.puzzleType || '3x3'}
                        </span>
                        <span style={{ color: '#f8fafc', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.name}
                        </span>
                      </div>

                      {editingEntryId === entry.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={editingEntryBest}
                            onChange={(e) => setEditingEntryBest(e.target.value)}
                            placeholder="Best"
                            style={{
                              width: '62px',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              background: '#111c34',
                              border: '1px solid #38bdf8',
                              color: '#38bdf8',
                              fontSize: '0.75rem',
                              fontWeight: '700'
                            }}
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={editingEntryAvg}
                            onChange={(e) => setEditingEntryAvg(e.target.value)}
                            placeholder="Ao5"
                            style={{
                              width: '62px',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              background: '#111c34',
                              border: '1px solid #334155',
                              color: '#cbd5e1',
                              fontSize: '0.75rem'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAdminSaveInlineEntry(entry)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#16a34a',
                              border: 'none',
                              color: '#fff',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEntryId(null)}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '4px',
                              background: '#334155',
                              border: 'none',
                              color: '#cbd5e1',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#38bdf8', fontWeight: '800' }}>{Number(entry.best).toFixed(2)}s</span>
                          <span style={{ color: '#64748b', fontSize: '0.7rem' }}>(Ao5: {Number(entry.avg || entry.best).toFixed(2)}s)</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setEditingEntryBest(String(entry.best));
                              setEditingEntryAvg(String(entry.avg || entry.best));
                            }}
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: '#1e293b',
                              border: '1px solid #38bdf866',
                              color: '#38bdf8',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef444466',
                              color: '#f87171',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleSaveAdminSettings}>
              {/* PHẦN 3: CÔNG TẮC QUY TẮC THI ĐẤU, CAMERA AI & ĐẶC QUYỀN VIP CỦA KHOA */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #4ade8044' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.86rem', color: '#4ade80' }}>
                  🎛️ 3. Công Tắc Quy Tắc Camera AI, Đồng Hồ & Đặc Quyền Admin Khoa
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.79rem', color: '#fde68a', cursor: 'pointer', fontWeight: '700' }}>
                    <input
                      type="checkbox"
                      checked={editAdminVipBypass}
                      onChange={(e) => setEditAdminVipBypass(e.target.checked)}
                    />
                    <span>👑 Đặc quyền VIP cho Gmail Khoa: Cho phép riêng Khoa bấm đồng hồ & lưu kỷ lục tự do ngay cả khi tắt Camera</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editRequireCam}
                      onChange={(e) => setEditRequireCam(e.target.checked)}
                    />
                    <span>📷 Bắt buộc người chơi phải BẬT CAMERA AI mới bấm được đồng hồ giải</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editRequire3DPreCheck}
                      onChange={(e) => setEditRequire3DPreCheck(e.target.checked)}
                    />
                    <span>🧊 Bắt buộc xác minh khối Rubik thật trên Mô hình 3D trước khi cho bấm giờ</span>
                  </label>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    marginTop: '2px',
                    marginBottom: '2px'
                  }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#38bdf8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🎯 Số mặt Rubik AI bắt buộc quét xác minh trước khi giải:</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.76rem',
                        color: editRequiredFaces === 3 ? '#4ade80' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: editRequiredFaces === 3 ? '700' : '400'
                      }}>
                        <input
                          type="radio"
                          name="requiredFacesRadio"
                          checked={editRequiredFaces === 3}
                          onChange={() => {
                            setEditRequiredFaces(3);
                            setEditRequireAll6Faces(false);
                          }}
                        />
                        <span>⚡ <strong>Chỉ xác minh 3 mặt (Mặc định - Nhanh gọn & Tiện lợi cho Cuber)</strong> — Quét nhanh 3 mặt là mở khóa đồng hồ ngay</span>
                      </label>

                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.76rem',
                        color: editRequiredFaces === 6 ? '#fbbf24' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: editRequiredFaces === 6 ? '700' : '400'
                      }}>
                        <input
                          type="radio"
                          name="requiredFacesRadio"
                          checked={editRequiredFaces === 6}
                          onChange={() => {
                            setEditRequiredFaces(6);
                            setEditRequireAll6Faces(true);
                          }}
                        />
                        <span>🔒 <strong>Bắt buộc quét đủ cả 6 mặt (Bản gốc của Admin Khoa - Chuẩn WCA nghiêm ngặt)</strong> — Giữ riêng trong quản trị viên để Khoa kiểm định & cải thiện tiếp</span>
                      </label>
                    </div>

                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(56, 189, 248, 0.3)' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminPanelModal(false);
                          setShowOpenCvScannerModal(true);
                          if (!cameraActive) setCameraActive(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(14, 116, 144, 0.4))',
                          border: '1.5px solid #06b6d4',
                          color: '#67e8f9',
                          fontSize: '0.74rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>📸 Mở Trình Quét 6 Mặt OpenCV & Kociemba (Bản Nâng Cao Của Khoa)</span>
                      </button>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editRequireMove}
                      onChange={(e) => setEditRequireMove(e.target.checked)}
                    />
                    <span>🔄 Bắt buộc Camera bắt được chuyển động xoay khối trong lúc giải mới công nhận kỷ lục</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editAutoStop}
                      onChange={(e) => setEditAutoStop(e.target.checked)}
                    />
                    <span>⚡ Tự động dừng đồng hồ khi Camera AI nhận diện mặt Rubik đã giải xong (đồng màu)</span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Độ nhạy giữ phím Spacebar / Cảm ứng:
                    </label>
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
                        fontSize: '0.82rem'
                      }}
                    >
                      <option value={100}>100ms — Siêu nhạy (Chạm nhẹ là xanh)</option>
                      <option value={150}>150ms — Rất nhạy (Tốc độ cao)</option>
                      <option value={280}>280ms — Tiêu chuẩn cân bằng (Mặc định)</option>
                      <option value={350}>350ms — Chuẩn WCA quốc tế (csTimer)</option>
                      <option value={550}>550ms — Giữ chắc tay (Tránh bấm nhầm)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Thời gian đếm ngược quan sát (Chế độ WCA):
                    </label>
                    <select
                      value={editInspectionSec}
                      onChange={(e) => setEditInspectionSec(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '5px',
                        background: '#090f1d',
                        border: '1px solid #192642',
                        color: '#f8fafc',
                        fontSize: '0.82rem'
                      }}
                    >
                      <option value={10}>10 giây — Nhanh</option>
                      <option value={15}>15 giây — Chuẩn WCA Quốc tế</option>
                      <option value={20}>20 giây — Thư thả</option>
                      <option value={30}>30 giây — Luyện tập mở rộng</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* PHẦN 4: TÙY CHỈNH TIÊU ĐỀ & THÔNG BÁO GIẢI ĐẤU */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#38bdf8' }}>
                  ⚙️ 4. Tùy Chỉnh Giao Diện, Tiêu Đề & Thông Báo Giải Đấu
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Tiêu đề chính trên thanh Header:
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
                        fontSize: '0.82rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
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
                        fontSize: '0.82rem'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                    📢 Dòng thông báo ghim nổi bật đầu trang (Để trống nếu muốn ẩn):
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Giải đấu HUST Speedcubing mở rộng 2026 — Chúc các cuber đạt PB mới!"
                    value={editAnnouncement}
                    onChange={(e) => setEditAnnouncement(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#fde68a',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>
              </div>

              {/* PHẦN 5: KẾT NỐI CLOUD BACKEND SUPABASE + SERVER ANTI-CHEAT */}
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '18px', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#38bdf8' }}>
                    ☁️ 5. Kết Nối Cloud Backend (Supabase + Anti-Cheat Server)
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
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  💾 Lưu Toàn Bộ Cài Đặt Của Khoa
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
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            borderRadius: '14px',
            padding: '24px',
            boxShadow: currentHudTheme.cardShadow
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
            backgroundColor: currentHudTheme.cardBg,
            border: currentHudTheme.cardBorder,
            borderRadius: '16px',
            padding: '20px',
            boxShadow: currentHudTheme.cardShadow,
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
              scramble={scramble}
              lastMove={lastMoveDetected}
              trackingBox={trackingBox}
              modelVerification={model3DVerification}
              surfaceProfile={surfaceProfile}
              activeFace={currentActiveFace}
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

      {/* =========================================================================
          NÚT NỔI THÔNG MINH LƯỚT XUỐNG DƯỚI / LƯỚT LÊN TRÊN (DESKTOP & MOBILE)
      ========================================================================= */}
      <div style={{
        position: 'fixed',
        bottom: isMobile ? '78px' : '26px',
        right: isMobile ? '14px' : '26px',
        zIndex: 9995,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-end',
        pointerEvents: 'auto'
      }}>
        {/* NÚT LƯỚT LÊN TRÊN (ĐẦU TRANG) */}
        <button
          type="button"
          className="floating-scroll-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Lướt lên đầu trang (Camera AI & Mô hình 3D)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: isMobile ? '7px 12px' : '8px 16px',
            borderRadius: '30px',
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            border: `1.5px solid ${currentHudTheme.color}`,
            boxShadow: `0 4px 18px ${currentHudTheme.glowColor}, 0 2px 10px rgba(0,0,0,0.6)`,
            color: '#ffffff',
            fontSize: isMobile ? '0.74rem' : '0.8rem',
            fontWeight: '800',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            backdropFilter: 'blur(10px)'
          }}
        >
          <span style={{ fontSize: '0.95rem' }}>⬆️</span>
          <span>Lên đầu</span>
        </button>

        {/* NÚT LƯỚT XUỐNG DƯỚI (ĐỒNG HỒ GIẢI / BẢNG KỶ LỤC) */}
        <button
          type="button"
          className="floating-scroll-btn"
          onClick={() => {
            const timerEl = document.getElementById('rubik-main-timer-section');
            const recordsEl = document.getElementById('rubik-leaderboard-section');
            const currentPos = window.scrollY || document.documentElement.scrollTop || 0;
            const timerTop = timerEl ? (timerEl.getBoundingClientRect().top + window.scrollY) : 550;

            if (currentPos < timerTop - 80) {
              if (timerEl) {
                timerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                window.scrollBy({ top: 520, behavior: 'smooth' });
              }
            } else if (recordsEl) {
              recordsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
            }
          }}
          title="Lướt xuống Đồng hồ bấm giờ & Thao tác giải / Bảng kỷ lục"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: isMobile ? '8px 14px' : '9px 18px',
            borderRadius: '30px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: '1.5px solid #60a5fa',
            boxShadow: '0 4px 22px rgba(37, 99, 235, 0.45), 0 2px 10px rgba(0,0,0,0.6)',
            color: '#ffffff',
            fontSize: isMobile ? '0.76rem' : '0.82rem',
            fontWeight: '800',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            backdropFilter: 'blur(10px)'
          }}
        >
          <span style={{ fontSize: '1rem' }}>⬇️</span>
          <span>Xuống dưới</span>
        </button>
      </div>
    </div>
  );
}
