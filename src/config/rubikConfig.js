// Cấu hình hệ thống Rubik AI Speedcube Arena (WCA Scrambles, Surface Profiles, Colors & HUD Themes)

export const ADMIN_EMAIL = 'khoa.tt2611758@sis.hust.edu.vn';

export const PUZZLE_CONFIGS = {
  '2x2': { id: '2x2', name: '2×2×2', label: '2×2 Pocket Cube', dim: 2, defaultMoves: 9 },
  '3x3': { id: '3x3', name: '3×3×3', label: '3×3 Rubik Cube', dim: 3, defaultMoves: 20 },
  '4x4': { id: '4x4', name: '4×4×4', label: "4×4 Rubik's Revenge", dim: 4, defaultMoves: 40 },
  '5x5': { id: '5x5', name: '5×5×5', label: "5×5 Professor's Cube", dim: 5, defaultMoves: 60 },
  '6x6': { id: '6x6', name: '6×6×6', label: '6×6 V-Cube WCA', dim: 6, defaultMoves: 80 },
  '7x7': { id: '7x7', name: '7×7×7', label: '7×7 Master Cube WCA', dim: 7, defaultMoves: 100 }
};

// Cấu hình Hồ sơ Bề mặt & Chất liệu theo Hệ màu HSV (Hue - Saturation - Value) cho MỌI LOẠI RUBIK
export const CUBE_SURFACE_PROFILES = {
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

export const GAME_MODES = [
  { id: 'free', name: '🎯 Tự do', desc: 'Bấm Space là chạy ngay, luyện tập không giới hạn' },
  { id: 'wca', name: '🏆 WCA 15s', desc: '15 giây quan sát (Inspection) chuẩn thi đấu quốc tế' },
  { id: 'target', name: '⚡ Mục tiêu Sub-X', desc: 'Thử thách phá vỡ mốc thời gian mục tiêu' },
  { id: 'ai', name: '🤖 Trọng tài AI', desc: 'Kiểm tra Rubik qua camera & tự động xác nhận giải xong' },
  { id: 'solo', name: '⚔️ Solo 1v1', desc: 'Đấu thời gian thực 1v1 qua mạng P2P WebRTC với bạn bè' }
];

export function generateScramble(puzzleType = '3x3') {
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
export const COLOR_DEFINITIONS = {
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
export const HUD_THEMES = {
  off: {
    id: 'off',
    icon: '🚫',
    name: '🚫 Tắt Theme (Mặc định WCA)',
    shortName: '🚫 Mặc định',
    color: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.20)',
    pageBg: 'linear-gradient(180deg, #070b14 0%, #0b1120 100%)',
    headerBg: '#0b1120',
    headerBorder: '1px solid #1e293b',
    cardBg: '#0f172a',
    cardBorder: '1px solid #1e293b',
    cardShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    innerCardBg: '#111c34',
    innerCardBorder: '1px solid #1e293b',
    primaryAccent: '#38bdf8',
    secondaryAccent: '#22c55e',
    textColor: '#f8fafc',
    subTextColor: '#94a3b8',
    timerGlow: '0 0 28px rgba(56, 189, 248, 0.25)',
    rayColor: 'rgba(148, 163, 184, 0.55)',
    rayLockedColor: 'rgba(34, 197, 94, 0.90)',
    bracketColor: '#38bdf8',
    badgeBg: 'rgba(15, 23, 42, 0.92)',
    badgeTextColor: '#e2e8f0',
    hasPetals: false
  },
  sakura: {
    id: 'sakura',
    icon: '🌸',
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
    icon: '🕸️',
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
    icon: '⚡',
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
    icon: '💎',
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
  },
  galaxy: {
    id: 'galaxy',
    icon: '🌌',
    name: '🌌 Dải Ngân Hà (Cosmos)',
    shortName: '🌌 Ngân Hà',
    color: '#818cf8',
    glowColor: 'rgba(129, 140, 248, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, #090624 60%, #030014 100%)',
    headerBg: '#0f0c2e',
    headerBorder: '1px solid rgba(129, 140, 248, 0.38)',
    cardBg: '#0c0926',
    cardBorder: '1px solid rgba(129, 140, 248, 0.32)',
    cardShadow: '0 8px 30px rgba(129, 140, 248, 0.18)',
    innerCardBg: '#171340',
    innerCardBorder: '1px solid rgba(129, 140, 248, 0.24)',
    primaryAccent: '#818cf8',
    secondaryAccent: '#e879f9',
    textColor: '#eef2ff',
    subTextColor: '#c7d2fe',
    timerGlow: '0 0 50px rgba(129, 140, 248, 0.60)',
    rayColor: 'rgba(129, 140, 248, 0.65)',
    rayLockedColor: 'rgba(232, 121, 249, 0.95)',
    bracketColor: '#a5b4fc',
    badgeBg: 'rgba(15, 12, 46, 0.92)',
    badgeTextColor: '#c7d2fe',
    hasPetals: false
  },
  inferno: {
    id: 'inferno',
    icon: '🔥',
    name: '🔥 Hỏa Ngục Phượng Hoàng',
    shortName: '🔥 Hỏa Ngục',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.58)',
    pageBg: 'radial-gradient(ellipse at 50% 100%, #3b0a0a 0%, #170404 60%, #090101 100%)',
    headerBg: '#1f0707',
    headerBorder: '1px solid rgba(249, 115, 22, 0.38)',
    cardBg: '#180505',
    cardBorder: '1px solid rgba(249, 115, 22, 0.32)',
    cardShadow: '0 8px 30px rgba(249, 115, 22, 0.18)',
    innerCardBg: '#2b0b08',
    innerCardBorder: '1px solid rgba(249, 115, 22, 0.25)',
    primaryAccent: '#f97316',
    secondaryAccent: '#facc15',
    textColor: '#fff7ed',
    subTextColor: '#fed7aa',
    timerGlow: '0 0 50px rgba(249, 115, 22, 0.60)',
    rayColor: 'rgba(249, 115, 22, 0.65)',
    rayLockedColor: 'rgba(250, 204, 21, 0.95)',
    bracketColor: '#fb923c',
    badgeBg: 'rgba(31, 7, 7, 0.92)',
    badgeTextColor: '#fdba74',
    hasPetals: false
  },
  matrix: {
    id: 'matrix',
    icon: '🟩',
    name: '🟩 Ma Trận Hacker (Matrix)',
    shortName: '🟩 Ma Trận',
    color: '#22c55e',
    glowColor: 'rgba(34, 197, 94, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #052e16 0%, #02140a 65%, #010804 100%)',
    headerBg: '#041d0f',
    headerBorder: '1px solid rgba(34, 197, 94, 0.38)',
    cardBg: '#03170b',
    cardBorder: '1px solid rgba(34, 197, 94, 0.32)',
    cardShadow: '0 8px 30px rgba(34, 197, 94, 0.16)',
    innerCardBg: '#062915',
    innerCardBorder: '1px solid rgba(34, 197, 94, 0.25)',
    primaryAccent: '#22c55e',
    secondaryAccent: '#86efac',
    textColor: '#f0fdf4',
    subTextColor: '#86efac',
    timerGlow: '0 0 50px rgba(34, 197, 94, 0.55)',
    rayColor: 'rgba(34, 197, 94, 0.65)',
    rayLockedColor: 'rgba(134, 239, 172, 0.95)',
    bracketColor: '#4ade80',
    badgeBg: 'rgba(3, 23, 11, 0.92)',
    badgeTextColor: '#4ade80',
    hasPetals: false
  },
  aurora: {
    id: 'aurora',
    icon: '🌈',
    name: '🌈 Cực Quang Bắc Cực',
    shortName: '🌈 Cực Quang',
    color: '#2dd4bf',
    glowColor: 'rgba(45, 212, 191, 0.55)',
    pageBg: 'radial-gradient(ellipse at 50% 0%, #0f3a3e 0%, #09152b 60%, #020617 100%)',
    headerBg: '#071b24',
    headerBorder: '1px solid rgba(45, 212, 191, 0.38)',
    cardBg: '#05161f',
    cardBorder: '1px solid rgba(45, 212, 191, 0.32)',
    cardShadow: '0 8px 30px rgba(45, 212, 191, 0.18)',
    innerCardBg: '#0b2633',
    innerCardBorder: '1px solid rgba(45, 212, 191, 0.24)',
    primaryAccent: '#2dd4bf',
    secondaryAccent: '#a78bfa',
    textColor: '#f0fdfa',
    subTextColor: '#99f6e4',
    timerGlow: '0 0 50px rgba(45, 212, 191, 0.58)',
    rayColor: 'rgba(45, 212, 191, 0.65)',
    rayLockedColor: 'rgba(167, 139, 250, 0.95)',
    bracketColor: '#5eead4',
    badgeBg: 'rgba(5, 22, 31, 0.92)',
    badgeTextColor: '#5eead4',
    hasPetals: false
  }
};
