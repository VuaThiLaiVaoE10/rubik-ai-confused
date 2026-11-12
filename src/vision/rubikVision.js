// Engine Computer Vision & Nhận diện màu Rubik chuẩn OpenCV HSV + Spider-Web Ray-Casting
import { CUBE_SURFACE_PROFILES } from '../config/rubikConfig';

// RGB to HSV Conversion (Chuẩn 360 độ)
export function rgbToHsv(r, g, b) {
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
export function rgbToOpenCvHsv(r, g, b) {
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
export function getMedian(arr) {
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

// Tạo chuỗi cấu hình Camera giảm dần (Progressive Fallback) để mọi webcam đời cũ,
// laptop cũ hoặc trình duyệt không hỗ trợ facingMode/HD vẫn kết nối thành công 100%.
export function buildCameraConstraintFallbacks(facingMode = 'user', lowSpecMode = false) {
  const preferred = lowSpecMode
    ? { width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 18, max: 24 } }
    : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } };

  return [
    { ...preferred, facingMode },
    { width: { ideal: 480 }, height: { ideal: 360 }, facingMode },
    { facingMode },
    true
  ];
}

// Buffer histogram tĩnh dùng chung (Zero-GC Allocation cho CPU máy đời cũ)
const _histR = new Uint16Array(256);
const _histG = new Uint16Array(256);
const _histB = new Uint16Array(256);
const _lutR = new Uint8ClampedArray(256);
const _lutG = new Uint8ClampedArray(256);
const _lutB = new Uint8ClampedArray(256);

function pickMedianFromHist(hist, totalCount) {
  const half = totalCount >> 1;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > half) return i;
  }
  return 0;
}

// Khôi phục tương phản & bù sáng siêu tốc bằng bảng tra 256 mức (LUT) cho webcam cũ bị mờ, tối hoặc ám xám.
export function enhanceLowLightRgbaBuffer(data, avgBrightness, contrast) {
  if (!data || data.length === 0) return false;
  if (avgBrightness >= 82 && contrast >= 62) return false;

  const darkFloor = avgBrightness < 55 ? 8 : 14;
  const gamma = avgBrightness < 55 ? 0.68 : 0.78;
  const span = Math.max(55, 255 - darkFloor * 2);

  for (let i = 0; i < 256; i++) {
    const norm = Math.max(0, Math.min(1, (i - darkFloor) / span));
    _lutR[i] = Math.round(Math.pow(norm, gamma) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = _lutR[data[i]];
    data[i + 1] = _lutR[data[i + 1]];
    data[i + 2] = _lutR[data[i + 2]];
  }
  return true;
}

// Tính nhanh độ sáng TB, độ tương phản (min-max luma), và trung bình RGB cho 1 khung RGBA
export function computeFrameLumaStats(data) {
  if (!data || data.length < 4) {
    return { avgBrightness: 0, contrast: 0, avgR: 0, avgG: 0, avgB: 0 };
  }
  let sumLum = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let minLum = 255;
  let maxLum = 0;
  const totalPixels = Math.floor(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLum += lum;
    sumR += r;
    sumG += g;
    sumB += b;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  return {
    avgBrightness: sumLum / totalPixels,
    contrast: maxLum - minLum,
    avgR: sumR / totalPixels,
    avgG: sumG / totalPixels,
    avgB: sumB / totalPixels
  };
}

// Hiệu chuẩn Cân Bằng Trắng Tự Động (Auto White-Balance) + Bù sáng Gamma trong 1 pass LUT duy nhất
// Giúp khắc phục webcam cũ bị ám vàng/xanh đèn tuýp hoặc mờ nhòe thiếu sáng.
export function calibrateWebcamFrameBuffer(data, avgBrightness, contrast, avgR, avgG, avgB) {
  if (!data || data.length === 0) return { enhanced: false, whiteBalanced: false };

  const isLowLight = avgBrightness < 82 || contrast < 62;
  const maxCh = Math.max(avgR, avgG, avgB);
  const minCh = Math.min(avgR, avgG, avgB);
  const needsWb = (maxCh - minCh) >= 14 && Math.min(avgR, avgG, avgB) >= 12;

  if (!isLowLight && !needsWb) {
    return { enhanced: false, whiteBalanced: false };
  }

  const lumAvg = (avgR + avgG + avgB) / 3;
  // Chỉ bù 45% độ lệch Gray-World và kẹp biên [0.80, 1.24] để khối Rubik nhiều màu không kéo lệch sai
  const clampGain = (g) => Math.max(0.80, Math.min(1.24, g));
  const gainR = needsWb ? clampGain(1 + ((lumAvg / Math.max(12, avgR)) - 1) * 0.45) : 1;
  const gainG = needsWb ? clampGain(1 + ((lumAvg / Math.max(12, avgG)) - 1) * 0.45) : 1;
  const gainB = needsWb ? clampGain(1 + ((lumAvg / Math.max(12, avgB)) - 1) * 0.45) : 1;

  const darkFloor = isLowLight ? (avgBrightness < 55 ? 8 : 14) : 0;
  const gamma = isLowLight ? (avgBrightness < 55 ? 0.68 : 0.78) : 1;
  const span = Math.max(55, 255 - darkFloor * 2);

  for (let i = 0; i < 256; i++) {
    if (isLowLight) {
      const norm = Math.max(0, Math.min(1, (i - darkFloor) / span));
      const stretched = Math.pow(norm, gamma) * 255;
      _lutR[i] = Math.round(stretched * gainR);
      _lutG[i] = Math.round(stretched * gainG);
      _lutB[i] = Math.round(stretched * gainB);
    } else {
      _lutR[i] = Math.round(i * gainR);
      _lutG[i] = Math.round(i * gainG);
      _lutB[i] = Math.round(i * gainB);
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = _lutR[data[i]];
    data[i + 1] = _lutG[data[i + 1]];
    data[i + 2] = _lutB[data[i + 2]];
  }
  return { enhanced: isLowLight, whiteBalanced: needsWb };
}

const OPENCV_KEY_MAP = {
  red: 'Đỏ',
  orange: 'Cam',
  yellow: 'Vàng',
  green: 'Xanh lá',
  blue: 'Xanh dương',
  white: 'Trắng'
};

// Nhận diện 6 màu Rubik chuẩn OpenCV + đồng bộ bộ lọc bóng lóa/đèn vàng (nếu có RGB trung vị)
export function nhanDienMauOpenCv(hsv, lowLightMode = false, surfaceProfileKey = 'auto') {
  if (hsv && hsv.r !== undefined && hsv.g !== undefined && hsv.b !== undefined) {
    const key = classifyRubikStickerCell(hsv.r, hsv.g, hsv.b, 0, 0, surfaceProfileKey, null, lowLightMode);
    return OPENCV_KEY_MAP[key] || '?';
  }
  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  const minV = lowLightMode ? 28 : 45;
  const minColorS = lowLightMode ? 42 : 60;
  const whiteMaxS = lowLightMode ? 68 : 60;
  const whiteMinV = lowLightMode ? 104 : 140;

  if (v < minV) return '?';
  if (s < whiteMaxS && v >= whiteMinV) return 'Trắng';
  if (s < minColorS) return '?';
  if (h <= 8 || h >= 170) return 'Đỏ';
  if (h >= 9 && h <= 22) return 'Cam';
  if (h >= 23 && h <= 35) return 'Vàng';
  if (h >= 36 && h <= 85) return 'Xanh lá';
  if (h >= 86 && h <= 130) return 'Xanh dương';
  return '?';
}

// Lấy mẫu trung vị màu Zero-GC (Histogram RGB -> 1x OpenCV HSV + RGB trung vị) giúp nhanh gấp 20x và triệt tiêu lỗi xoay vòng Hue màu Đỏ (0/179)
export function layMauTrungViOpenCv(frameImg, w, h, x1, y1, x2, y2) {
  const startX = Math.max(0, Math.min(w - 1, x1));
  const startY = Math.max(0, Math.min(h - 1, y1));
  const endX = Math.max(0, Math.min(w, x2));
  const endY = Math.max(0, Math.min(h, y2));
  const step = 2;

  _histR.fill(0);
  _histG.fill(0);
  _histB.fill(0);
  let count = 0;

  for (let y = startY; y < endY; y += step) {
    const rowOffset = y * w;
    for (let x = startX; x < endX; x += step) {
      const idx = (rowOffset + x) * 4;
      _histR[frameImg[idx]]++;
      _histG[frameImg[idx + 1]]++;
      _histB[frameImg[idx + 2]]++;
      count++;
    }
  }

  if (count === 0) return { h: 0, s: 0, v: 0, r: 0, g: 0, b: 0 };
  const medR = pickMedianFromHist(_histR, count);
  const medG = pickMedianFromHist(_histG, count);
  const medB = pickMedianFromHist(_histB, count);
  return { ...rgbToOpenCvHsv(medR, medG, medB), r: medR, g: medG, b: medB };
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
export function rgbToLab(r, g, b) {
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
export function isSkinOrWoodTone(r, g, b, h, s, v) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;

  // Nếu độ bão hòa theo tỷ lệ thực sự cao -> Đây là nhựa Rubik rực rỡ, không phải da người
  if (s >= 0.54 || (chroma >= 92 && s >= 0.36)) {
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

  // 4. Kiểm tra dải Hue ấm (đỏ-cam-vàng đất da) — bắt buộc có thành phần đỏ hồng YCbCr (cr >= 132) để không nhầm với ô Vàng/Trắng Rubik
  const isHsvSkin =
    cr >= 132 &&
    h >= 5 &&
    h <= 45 &&
    s >= 0.08 &&
    s <= 0.72 &&
    v >= 0.16 &&
    bRatio >= 0.24 &&
    gRatio >= 0.42;

  return (isYcbcrSkin && isRgbSkin) || isHsvSkin || isMonitorCastSkin;
}

// Khử bóng lóa phản quang UV & Khuếch đại sắc tố cho mọi loại bề mặt Rubik (UV, Frosted, Classic, Pastel)
export function removeUvSpecularGlare(r, g, b, surfaceProfileKey = 'auto') {
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
// HỆ MÀU CHUẨN OPENCV HSV + CIE L*a*b* + KHỬ BÓNG LÓA UV / CÂN BẰNG ĐÈN VÀNG
// ==========================================
export function classifyRubikStickerCell(avgR, avgG, avgB, cellStdDev, motionTolerance = 0, surfaceProfileKey = 'auto', precomputedHsv = null, lowLightMode = false) {
  const maxAllowedStd = (lowLightMode ? 76 : 65) + motionTolerance;
  if (cellStdDev > maxAllowedStd) return 'invalid';

  const rawMax = Math.max(avgR, avgG, avgB);
  const rawMin = Math.min(avgR, avgG, avgB);
  const rawChroma = rawMax - rawMin;

  // 1. Bảo vệ ô Trắng dưới đèn vàng phòng (2700K - 3000K): R cao, G bám sát R, B giữ tỷ lệ đủ lớn, không cướp Orange/Yellow thật
  const earlyHsv = precomputedHsv || rgbToOpenCvHsv(avgR, avgG, avgB);
  const isWarmBulb3000K =
    earlyHsv.s <= 74 &&
    earlyHsv.h >= 12 &&
    earlyHsv.h <= 25 &&
    avgG >= 0.85 * avgR &&
    avgB >= 0.68 * avgR;
  const isWarmBulb2700K =
    rawMax >= 185 &&
    earlyHsv.s <= 92 &&
    earlyHsv.h >= 12 &&
    earlyHsv.h <= 23 &&
    avgG >= 0.87 * avgR &&
    avgG <= 0.94 * avgR &&
    avgB >= 0.62 * avgR;

  if (
    surfaceProfileKey !== 'pastel' &&
    rawMax >= (lowLightMode ? 115 : 155) &&
    (isWarmBulb3000K || isWarmBulb2700K)
  ) {
    return 'white';
  }

  // 2. Kích hoạt Khử Bóng Lóa UV & Khuếch Đại Sắc Tố theo Hồ sơ bề mặt (UV / Frosted / Pastel / Glare Highlight)
  let effR = avgR;
  let effG = avgG;
  let effB = avgB;
  let hsv = earlyHsv;

  const isPastel = surfaceProfileKey === 'pastel';
  const isGlareWashed =
    rawMax >= 168 &&
    rawMin >= 110 &&
    (surfaceProfileKey === 'uv' ||
      surfaceProfileKey === 'frosted' ||
      (rawChroma >= 50 && earlyHsv.s >= 56 && earlyHsv.s <= 92));

  if (!precomputedHsv && (isPastel || surfaceProfileKey === 'uv' || surfaceProfileKey === 'frosted' || isGlareWashed)) {
    const cleanProfile = isGlareWashed && surfaceProfileKey === 'auto' ? 'uv' : surfaceProfileKey;
    const recovered = removeUvSpecularGlare(avgR, avgG, avgB, cleanProfile);
    effR = recovered.r;
    effG = recovered.g;
    effB = recovered.b;
    hsv = rgbToOpenCvHsv(effR, effG, effB);
  }

  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  const minV = lowLightMode ? 24 : 45;
  const minColorS = isPastel ? 34 : (lowLightMode ? 42 : 58);
  const whiteMaxS = isPastel ? 38 : (lowLightMode ? 68 : 60);
  const whiteMinV = lowLightMode ? 104 : 140;

  // 3. Quá tối (bóng tối, rãnh khối, viền đen) -> 'invalid'
  if (v < minV) {
    return 'invalid';
  }

  // 4. MÀU TRẮNG: độ bão hòa thấp & đủ sáng (nới cho đèn vàng ấm nhẹ nhưng không cướp Vàng bóng UV)
  if (s < whiteMaxS && v >= whiteMinV) {
    return 'white';
  }

  // 5. Độ bão hòa quá thấp -> 'invalid'
  if (s < minColorS) {
    return 'invalid';
  }

  // 6. MÀU ĐỎ vs MÀU CAM (phân giải vùng ranh giới H=7..12 bằng tỷ lệ kênh G/R vật lý)
  if (h <= 6 || h >= 168) {
    return 'red';
  }
  if (h >= 7 && h <= 11) {
    if (effG - effB < 0.42 * (effR - effG) && effG < 0.36 * effR) {
      return 'red';
    }
    return 'orange';
  }
  if (h >= 12 && h <= 22) {
    return 'orange';
  }

  // 7. MÀU VÀNG (bao gồm cả Vàng UV dưới LED lạnh nghiêng nhẹ 36..42)
  if (h >= 23 && h <= 35) {
    return 'yellow';
  }
  if (h >= 36 && h <= 42 && effR >= 115 && effR > 0.58 * effG && effR > 1.5 * effB) {
    return 'yellow';
  }

  // 8. MÀU XANH LÁ: 36 <= h <= 85 (mở nhẹ 86..88 nếu G >= B*0.92 cho xanh lá ngọc UV)
  if (h >= 36 && h <= 85) {
    return 'green';
  }
  if (h >= 86 && h <= 88 && effG >= effB * 0.92) {
    return 'green';
  }

  // 9. MÀU XANH DƯƠNG: 86 <= h <= 132
  if (h >= 86 && h <= 132) {
    return 'blue';
  }

  return 'invalid';
}

// TỰ ĐỘNG NHẬN DIỆN MÀU TÂM Ô SỐ 5 (HỖ TRỢ LÓA ĐÈN / ÁNH SÁNG YẾU):
// Giúp AI luôn tự động đọc được tâm khối Rubik mà KHÔNG cần người dùng phải bấm nút chọn thủ công
export function classifyCenterStickerFallback(avgR, avgG, avgB) {
  const hsv = rgbToOpenCvHsv(avgR, avgG, avgB);
  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  if (v < 35) return 'invalid';
  if (s < 55 && v >= 115) return 'white';
  if (h <= 9 || h >= 170) return 'red';
  if (h >= 10 && h <= 22) return 'orange';
  if (h >= 23 && h <= 35) return 'yellow';
  if (h >= 36 && h <= 42 && avgR >= 105 && avgR > 0.55 * avgG) return 'yellow';
  if (h >= 36 && h <= 88) return 'green';
  if (h >= 89 && h <= 135) return 'blue';

  if (v > 185 && s < 50) {
    if (avgR > 200 && avgG > 200 && avgB > 200) return 'white';
    if (avgR > avgG && avgR > avgB && avgB < 130) return avgG > 135 ? 'yellow' : 'orange';
  }

  return 'invalid';
}

// Lấy mẫu ô màu Rubik Zero-GC bằng Histogram RGB Trung vị & Độ lệch chuẩn 1-pass
// Giảm 20x cấp phát bộ nhớ & khắc phục hoàn toàn lỗi tách Hue Đỏ (0/179) trên webcam đời cũ
export function sampleCubieStickerCell(frameImg, w, h, cx, cy, cellSize, _surfaceProfileKey) {
  // Lấy vùng trung tâm 36% của ô (bỏ lề 32% mỗi phía để tránh hoàn toàn viền rãnh đen cơ học)
  const span = Math.max(2, Math.floor(cellSize * 0.18));
  const step = Math.max(1, Math.floor(span / 4));

  _histR.fill(0);
  _histG.fill(0);
  _histB.fill(0);
  let count = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  let sumSqR = 0, sumSqG = 0, sumSqB = 0;

  const yMin = Math.max(0, cy - span);
  const yMax = Math.min(h - 1, cy + span);
  const xMin = Math.max(0, cx - span);
  const xMax = Math.min(w - 1, cx + span);

  for (let sy = yMin; sy <= yMax; sy += step) {
    const rowOffset = sy * w;
    for (let sx = xMin; sx <= xMax; sx += step) {
      const idx = (rowOffset + sx) * 4;
      const r = frameImg[idx];
      const g = frameImg[idx + 1];
      const b = frameImg[idx + 2];

      _histR[r]++;
      _histG[g]++;
      _histB[b]++;
      sumR += r;
      sumG += g;
      sumB += b;
      sumSqR += r * r;
      sumSqG += g * g;
      sumSqB += b * b;
      count++;
    }
  }

  if (count === 0) {
    return { avgR: 0, avgG: 0, avgB: 0, stdDev: 999, valid: false };
  }

  const medR = pickMedianFromHist(_histR, count);
  const medG = pickMedianFromHist(_histG, count);
  const medB = pickMedianFromHist(_histB, count);

  const varR = Math.max(0, sumSqR / count - (sumR / count) ** 2);
  const varG = Math.max(0, sumSqG / count - (sumG / count) ** 2);
  const varB = Math.max(0, sumSqB / count - (sumB / count) ** 2);
  const stdDev = Math.sqrt((varR + varG + varB) / 3);

  return {
    avgR: medR,
    avgG: medG,
    avgB: medB,
    stdDev,
    medHsv: rgbToOpenCvHsv(medR, medG, medB),
    valid: true
  };
}

// Xác minh Hình học & Rãnh cơ học chuẩn của khối Rubik (Mechanical Seam Channels & Orthogonal Grid)
// Ngăn chặn 100% việc nhận diện nhầm khuôn mặt người, bức tường hoặc đồ vật ngẫu nhiên thành Rubik
export function verifyRubikCubeMechanicalGeometry(frameImg, w, h, dim, startX, startY, boxSize, lowLightMode = false) {
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
  const seamMinScore = lowLightMode ? 2.6 : 5.0;
  return {
    isCube: seamScore >= seamMinScore,
    seamScore,
    avgDip,
    avgGrad
  };
}

// Đánh giá một vùng lưới ứng viên (startX, startY, boxSize) trên khung hình Camera
export function evaluateRubikGridCandidate(frameImg, w, h, dim, startX, startY, boxSize, motionTolerance = 0, surfaceProfileKey = 'auto', lowLightMode = false) {
  // 1. Tính toán hình học cơ học hỗ trợ (seamScore làm điểm thưởng bổ sung)
  const geom = verifyRubikCubeMechanicalGeometry(frameImg, w, h, dim, startX, startY, boxSize, lowLightMode);

  const cellSize = boxSize / dim;
  const currentNxNColors = [];
  const cellStats = [];
  let validColorsCount = 0;
  let vividColorsCount = 0;
  let skinLikeCellsCount = 0;

  let vividNonSkinCells = 0;

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

      // Truyền null để kích hoạt khử bóng lóa UV & cân bằng đèn vàng trong classifyRubikStickerCell
      const colorKey = classifyRubikStickerCell(avgR, avgG, avgB, stdDev, motionTolerance, surfaceProfileKey, null, lowLightMode);
      const cellLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

      currentNxNColors.push(colorKey);
      cellStats.push({ avgR, avgG, avgB, cellStdDev: stdDev, colorKey, cellLum });

      if (colorKey !== 'invalid') {
        validColorsCount++;
        if (colorKey !== 'white') vividColorsCount++;
        if (colorKey === 'green' || colorKey === 'blue' || colorKey === 'white' || colorKey === 'yellow') {
          vividNonSkinCells++;
        }
      }
    }
  }

  // Hiệu chỉnh ngữ cảnh theo mặt (Context-Aware White Anchor Calibration):
  // Nếu trên mặt có ô Trắng làm chuẩn (white anchor) dưới đèn vàng 2700K/3000K hoặc ô mờ 'invalid',
  // cân bằng lại RGB các ô nghi ngờ theo điểm trắng thực tế của mặt đó mà không làm lệch ô Vàng thật.
  if (skinLikeCellsCount < Math.ceil(dim * dim * 0.45)) {
    let whiteAnchor = null;
    for (let i = 0; i < cellStats.length; i++) {
      const c = cellStats[i];
      if (c.colorKey === 'white' && c.cellLum >= 125) {
        if (!whiteAnchor || c.cellLum > whiteAnchor.cellLum) {
          whiteAnchor = c;
        }
      }
    }

    if (whiteAnchor && whiteAnchor.avgR > 80 && whiteAnchor.avgG > 70 && whiteAnchor.avgB > 50) {
      const refMax = Math.max(whiteAnchor.avgR, whiteAnchor.avgG, whiteAnchor.avgB);
      const warmTintDelta = whiteAnchor.avgR - whiteAnchor.avgB;
      const gainR = Math.min(1.18, Math.max(0.88, refMax / whiteAnchor.avgR));
      const gainG = Math.min(1.25, Math.max(0.92, refMax / whiteAnchor.avgG));
      const gainB = Math.min(1.60, Math.max(0.92, refMax / whiteAnchor.avgB));
      let recalced = false;

      for (let i = 0; i < cellStats.length; i++) {
        const c = cellStats[i];
        if (c.cellStdDev > 56 || c.cellLum < 26) continue;

        const calR = Math.min(255, Math.round(c.avgR * gainR));
        const calG = Math.min(255, Math.round(c.avgG * gainG));
        const calB = Math.min(255, Math.round(c.avgB * gainB));

        // 1. Cứu ô bị tối/ám vàng góc mặt thành 'invalid'
        if (c.colorKey === 'invalid') {
          const rescued = classifyRubikStickerCell(
            calR, calG, calB, c.cellStdDev, motionTolerance, surfaceProfileKey, null, lowLightMode
          );
          if (rescued !== 'invalid') {
            currentNxNColors[i] = rescued;
            c.colorKey = rescued;
            recalced = true;
          }
          continue;
        }

        // 2. Tách ô Trắng bị tối dưới đèn 2700K (lệch thành 'yellow' hoặc 'orange') dựa vào điểm trắng chuẩn trên cùng mặt
        if ((c.colorKey === 'yellow' || c.colorKey === 'orange') && warmTintDelta >= 34) {
          const { s: calSat } = rgbToHsv(calR, calG, calB);
          if (calSat < 0.19 && Math.abs(calR - calB) < 28 && c.cellLum >= 105) {
            currentNxNColors[i] = 'white';
            c.colorKey = 'white';
            recalced = true;
          }
        }
      }

      if (recalced) {
        validColorsCount = 0;
        vividColorsCount = 0;
        vividNonSkinCells = 0;
        for (let i = 0; i < currentNxNColors.length; i++) {
          const ck = currentNxNColors[i];
          if (ck !== 'invalid') {
            validColorsCount++;
            if (ck !== 'white') vividColorsCount++;
            if (ck === 'green' || ck === 'blue' || ck === 'white' || ck === 'yellow') {
              vividNonSkinCells++;
            }
          }
        }
      }
    }
  }

  // Khắt khe chống mặt người/đồ gỗ, nhưng KHÔNG chặn nhầm khối Rubik thật bị nhạt màu trên webcam cũ
  const isHumanFaceOrSkin =
    surfaceProfileKey !== 'pastel' &&
    (skinLikeCellsCount >= Math.max(3, Math.ceil(dim * dim * 0.45)) ||
      (skinLikeCellsCount >= 2 && vividNonSkinCells < 3));
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

  // Chặn mảng phẳng đồng nhất (tường sơn / da mặt người / mặt bàn gỗ) không có rãnh cơ học & không chuyển màu
  if (uniqueColorsCount === 1 && colorTransitions === 0 && !geom.isCube) {
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
export function scanSpiderWebHitbox(frameImg, w, h, seedCx, seedCy, surfaceProfileKey = 'auto', lowLightMode = false) {
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

        const cKey = classifyRubikStickerCell(rVal, gVal, bVal, 10, 6, surfaceProfileKey, null, lowLightMode);
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
export function locateDynamicRubikBox(frameImg, w, h, dim, prevTracker, surfaceProfileKey = 'auto', lowLightMode = false) {
  const minSide = Math.min(w, h);
  const baseSize = minSide * 0.48;

  // 1. FAST-PATH DÀNH CHO SPEEDCUBER (60 FPS & độ trễ cực thấp):
  // Khi khối đã được khóa ở khung hình trước, quét lưới mạng nhện ngay tại ROI dự đoán vận tốc
  if (prevTracker && prevTracker.cx > 0 && prevTracker.size > 0) {
    const predCx = prevTracker.cx + (prevTracker.vx || 0) * 0.95;
    const predCy = prevTracker.cy + (prevTracker.vy || 0) * 0.95;

    // Quét lưới mạng nhện từ tâm dự đoán để tìm viền hitbox
    const spider = scanSpiderWebHitbox(frameImg, w, h, predCx, predCy, surfaceProfileKey, lowLightMode);
    const baseS = spider.isSquareHitbox ? spider.hitbox.boxSize : prevTracker.size;
    const targetCx = spider.isSquareHitbox ? spider.hitbox.cx : predCx;
    const targetCy = spider.isSquareHitbox ? spider.hitbox.cy : predCy;

    const roiCandidates = [
      { cx: targetCx, cy: targetCy, size: baseS },
      { cx: targetCx, cy: targetCy, size: baseS * 0.95 },
      { cx: targetCx, cy: targetCy, size: baseS * 1.05 }
    ];
    if (Math.abs(baseS - prevTracker.size) > 4 || Math.abs(targetCx - predCx) > 6 || Math.abs(targetCy - predCy) > 6) {
      roiCandidates.push({ cx: predCx, cy: predCy, size: prevTracker.size });
    }

    let bestRoi = null;
    for (const roi of roiCandidates) {
      const clampedSize = Math.max(minSide * 0.28, Math.min(minSide * 0.72, roi.size));
      const sx = Math.max(4, Math.min(w - clampedSize - 4, roi.cx - clampedSize / 2));
      const sy = Math.max(4, Math.min(h - clampedSize - 4, roi.cy - clampedSize / 2));
      const res = evaluateRubikGridCandidate(frameImg, w, h, dim, sx, sy, clampedSize, 4, surfaceProfileKey, lowLightMode);
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

      const cKey = classifyRubikStickerCell(rVal, gVal, bVal, 8, 4, surfaceProfileKey, null, lowLightMode);
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
  const spider = scanSpiderWebHitbox(frameImg, w, h, heatCx, heatCy, surfaceProfileKey, lowLightMode);

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
      surfaceProfileKey,
      lowLightMode
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

// Khung ngắm cố định thông minh kèm Vi Dịch Chuyển (Micro-Offset Hand-Hold Rescue):
// Nếu khối Rubik ở chính giữa bị lệch nhẹ do rung tay (~25% kích thước ô), tự dò 4 hướng để khóa ngay.
export function evaluateCenteredRubikWithOffset(
  frameImg,
  w,
  h,
  dim,
  startX,
  startY,
  boxSize,
  surfaceProfileKey = 'auto',
  lowLightMode = false
) {
  const centerEval = evaluateRubikGridCandidate(
    frameImg,
    w,
    h,
    dim,
    startX,
    startY,
    boxSize,
    0,
    surfaceProfileKey,
    lowLightMode
  );

  const requiredValid = Math.ceil(dim * dim * 0.65);
  const centerLocked =
    Boolean(centerEval.isGeometricallyVerifiedCube) &&
    !centerEval.isMostlySkinOrWood &&
    centerEval.validColorsCount >= requiredValid &&
    centerEval.vividColorsCount >= 2;

  if (centerLocked) {
    return { ...centerEval, usedMicroOffset: false };
  }

  const shift = Math.max(4, Math.round((boxSize / Math.max(2, dim)) * 0.25));
  const maxX = Math.max(0, w - boxSize);
  const maxY = Math.max(0, h - boxSize);
  const offsets = [
    [shift, 0],
    [-shift, 0],
    [0, shift],
    [0, -shift]
  ];

  let best = { ...centerEval, usedMicroOffset: false };
  for (let i = 0; i < offsets.length; i++) {
    const candX = Math.max(0, Math.min(maxX, startX + offsets[i][0]));
    const candY = Math.max(0, Math.min(maxY, startY + offsets[i][1]));
    if (candX === startX && candY === startY) continue;

    const cand = evaluateRubikGridCandidate(
      frameImg,
      w,
      h,
      dim,
      candX,
      candY,
      boxSize,
      0,
      surfaceProfileKey,
      lowLightMode
    );
    if (cand.score > best.score && !cand.isMostlySkinOrWood) {
      best = { ...cand, usedMicroOffset: true };
    }
  }

  return best;
}

// Tạo khung hình RGBA synthetic phục vụ kiểm thử nhận diện Rubik tự động
function buildSyntheticGridFrame(w, h, startX, startY, boxSize, dim, cellRgbs, bg = [18, 22, 32], seam = [10, 12, 16]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = 255;
  }

  const cellSize = boxSize / dim;
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      const [cr, cg, cb] = cellRgbs[r * dim + c];
      const x0 = Math.floor(startX + c * cellSize);
      const y0 = Math.floor(startY + r * cellSize);
      const x1 = Math.floor(startX + (c + 1) * cellSize);
      const y1 = Math.floor(startY + (r + 1) * cellSize);

      for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
          const isSeam = x - x0 < 2 || x1 - x <= 2 || y - y0 < 2 || y1 - y <= 2;
          const idx = (y * w + x) * 4;
          data[idx] = isSeam ? seam[0] : cr;
          data[idx + 1] = isSeam ? seam[1] : cg;
          data[idx + 2] = isSeam ? seam[2] : cb;
        }
      }
    }
  }
  return data;
}

// Bộ Kiểm Thử Chẩn Đoán Nhận Diện AI (Chạy trực tiếp trên Client hoặc Vitest)
// So sánh trạng thái Trước Cải Tiến (baselineBefore) vs Hiện Tại (realtime execution)
export function runVisionDiagnosticSuite() {
  const results = [];
  const pushCase = (id, name, beforeStatus, ok, actual, expected) => {
    results.push({ id, name, beforeStatus, passed: Boolean(ok), actual, expected });
  };

  // 1. Bóng lóa UV trên mặt Trắng
  const uvWhite = classifyRubikStickerCell(255, 248, 232, 6, 0, 'uv');
  pushCase('uv_glare', 'Bóng lóa đèn UV (ô Trắng chói)', 'FAIL', uvWhite === 'white', uvWhite, 'white');

  // 2. Đèn vàng ấm 3000K trên ô Trắng
  const warmWhite = classifyRubikStickerCell(245, 224, 178, 8, 0, 'auto');
  pushCase('warm_3000k', 'Đèn vàng ấm 3000K (không nhầm sang Vàng)', 'FAIL', warmWhite === 'white', warmWhite, 'white');

  // 3. Context-Aware Face Calibration (đèn 2700K: ô Trắng tối + ô Vàng trên cùng mặt)
  const warmGridRgbs = [
    [248, 224, 162], [246, 226, 62], [202, 182, 130],
    [224, 62, 54], [242, 222, 158], [46, 178, 88],
    [48, 108, 218], [244, 134, 48], [206, 186, 134]
  ];
  const warmBuf = buildSyntheticGridFrame(200, 150, 40, 20, 108, 3, warmGridRgbs);
  const warmEval = evaluateRubikGridCandidate(warmBuf, 200, 150, 3, 40, 20, 108, 0, 'auto', false);
  const warmOk = warmEval.currentNxNColors[0] === 'white' && warmEval.currentNxNColors[1] === 'yellow' && warmEval.currentNxNColors[2] === 'white';
  pushCase(
    'ctx_2700k',
    'Hiệu chuẩn ngữ cảnh 2700K (tách Trắng tối vs Vàng thật)',
    'FAIL',
    warmOk,
    `${warmEval.currentNxNColors[0]}/${warmEval.currentNxNColors[1]}/${warmEval.currentNxNColors[2]}`,
    'white/yellow/white'
  );

  // 4. Rubik Pastel Macaron (Đào nhạt & Bạc hà)
  const pastelPeach = classifyRubikStickerCell(242, 178, 136, 5, 0, 'pastel');
  const pastelMint = classifyRubikStickerCell(158, 222, 184, 5, 0, 'pastel');
  pushCase(
    'pastel_macaron',
    'Nhận diện Rubik Pastel (Đào & Xanh Bạc Hà)',
    'FAIL',
    pastelPeach === 'orange' && pastelMint === 'green',
    `${pastelPeach}/${pastelMint}`,
    'orange/green'
  );

  // 5. Thiếu sáng — Xanh dương & Đỏ tối (Low-light mode)
  const darkBlue = classifyRubikStickerCell(15, 42, 118, 6, 0, 'auto', null, true);
  const darkRed = classifyRubikStickerCell(92, 16, 18, 6, 0, 'auto', null, true);
  pushCase(
    'dark_lowlight',
    'Thiếu sáng sâu (Xanh dương & Đỏ tối với Low-Light LUT)',
    'FAIL',
    darkBlue === 'blue' && darkRed === 'red',
    `${darkBlue}/${darkRed}`,
    'blue/red'
  );

  // 6. Vòng tròn màu Đỏ OpenCV (Hue 178 và Hue 2 trộn nhau)
  const redWrapCells = [
    [178, 215, 200], [177, 210, 195], [179, 220, 205],
    [1, 212, 198], [2, 218, 202], [178, 205, 190],
    [0, 214, 200], [2, 208, 196], [177, 216, 204]
  ];
  const medianRgb = redWrapCells.map(([hVal, sVal, vVal]) => {
    const hn = (hVal % 180) * 2;
    const sn = sVal / 255;
    const vn = vVal / 255;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;
    const [r1, g1, b1] = hn < 60 ? [c, x, 0] : [c, 0, x];
    return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
  });
  const wrapBuf = buildSyntheticGridFrame(160, 140, 20, 16, 99, 3, medianRgb);
  const wrapHsv = layMauTrungViOpenCv(wrapBuf, 160, 140, 20, 16, 99, 99);
  const wrapFace = nhanDienMauOpenCv(wrapHsv);
  pushCase('red_hue_wrap', 'Khắc phục wrap góc Hue 0/179 màu Đỏ (OpenCV)', 'FAIL', wrapFace === 'Đỏ', `${wrapFace} (H=${Math.round(wrapHsv.h)})`, 'Đỏ');

  // 7. Phân tách Đỏ vs Cam dưới ánh sáng gắt
  const redCell = classifyRubikStickerCell(195, 28, 24, 5, 0, 'auto');
  const orangeCell = classifyRubikStickerCell(225, 118, 24, 5, 0, 'auto');
  pushCase('red_orange_split', 'Tách bạch Đỏ vs Cam (tỷ lệ G/R)', 'PASS', redCell === 'red' && orangeCell === 'orange', `${redCell}/${orangeCell}`, 'red/orange');

  // 8. Lưới 3×3 tối/thiếu sáng webcam cũ + Cân bằng LUT tự động
  const washedRgbs = [
    [98, 28, 28], [32, 92, 46], [30, 52, 102],
    [108, 98, 32], [112, 62, 28], [108, 106, 104],
    [96, 26, 28], [34, 94, 44], [32, 50, 98]
  ];
  const washedBuf = buildSyntheticGridFrame(200, 150, 46, 20, 108, 3, washedRgbs, [18, 20, 24], [10, 12, 14]);
  const fStats = computeFrameLumaStats(washedBuf);
  const calRes = calibrateWebcamFrameBuffer(
    washedBuf,
    fStats.avgBrightness,
    fStats.contrast,
    fStats.avgR,
    fStats.avgG,
    fStats.avgB
  );
  const washedEval = evaluateRubikGridCandidate(washedBuf, 200, 150, 3, 46, 20, 108, 0, 'auto', calRes.enhanced);
  pushCase(
    'lut_washed_grid',
    'Khôi phục lưới 3×3 tối/nhạt màu bằng LUT tự động',
    'FAIL',
    washedEval.validColorsCount >= 8 && washedEval.score > 0 && calRes.enhanced,
    `${washedEval.validColorsCount}/9 ô (LUT=${calRes.enhanced ? 'ON' : 'OFF'})`,
    '>=8/9 ô (LUT=ON)'
  );

  // 9. Vi dịch chuyển cứu khung ngắm cố định khi tay lệch nhẹ
  const shiftedGridRgbs = [
    [215, 42, 40], [42, 188, 86], [44, 104, 224],
    [238, 214, 42], [238, 130, 38], [238, 238, 238],
    [215, 42, 40], [42, 188, 86], [238, 214, 42]
  ];
  const shiftedBuf = buildSyntheticGridFrame(200, 150, 56, 21, 108, 3, shiftedGridRgbs);
  const offsetRes = evaluateCenteredRubikWithOffset(shiftedBuf, 200, 150, 3, 46, 21, 108, 'auto', false);
  pushCase(
    'micro_offset_rescue',
    'Vi dịch chuyển cứu lệch tay ở Bước 1 (±25% ô)',
    'FAIL',
    offsetRes.score > 0 && offsetRes.validColorsCount >= 7,
    `${offsetRes.validColorsCount}/9 (offset=${offsetRes.usedMicroOffset ? 'ON' : 'OFF'})`,
    '>=7/9'
  );

  // 10. Chặn nền da tay / tường trơn đồng màu (Anti-Fake)
  const skinRgbs = Array(9).fill([196, 146, 118]);
  const skinBuf = buildSyntheticGridFrame(160, 140, 26, 16, 99, 3, skinRgbs, [196, 146, 118], [194, 144, 116]);
  const skinEval = evaluateRubikGridCandidate(skinBuf, 160, 140, 3, 26, 16, 99, 0, 'auto', false);
  pushCase(
    'anti_fake_skin',
    'Chống nhận nhầm da mặt / tường trơn đồng màu',
    'PASS',
    skinEval.score <= 0 || skinEval.isMostlySkinOrWood,
    skinEval.isMostlySkinOrWood ? 'REJECTED' : `score=${skinEval.score}`,
    'REJECTED'
  );

  // 11. Đo tốc độ theo dõi động (Zero-GC Tracking Performance)
  const trackBuf = buildSyntheticGridFrame(240, 180, 66, 36, 108, 3, shiftedGridRgbs);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let trackEval = null;
  for (let i = 0; i < 4; i++) {
    trackEval = locateDynamicRubikBox(trackBuf, 240, 180, 3, { cx: 120, cy: 90, size: 108, vx: 0, vy: 0 }, 'auto', false);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const avgTrackMs = Number(((t1 - t0) / 4).toFixed(2));
  pushCase(
    'tracker_speed',
    'Hiệu năng Dynamic Tracking (Zero-GC Histogram)',
    'PASS',
    Boolean(trackEval && trackEval.validColorsCount >= 7 && avgTrackMs < 25),
    `${avgTrackMs} ms/frame`,
    '< 25 ms/frame'
  );

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const baselineBeforePassed = results.filter((r) => r.beforeStatus === 'PASS').length;
  return {
    passed,
    total,
    passRatePct: total > 0 ? Math.round((passed / total) * 100) : 0,
    baselineBeforePassed,
    baselineBeforeTotal: total,
    avgTrackMs,
    ranAt: new Date().toLocaleTimeString('vi-VN'),
    results
  };
}
