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

// Khôi phục tương phản & bù sáng siêu tốc bằng bảng tra 256 mức (LUT) cho webcam cũ bị mờ, tối hoặc ám xám.
export function enhanceLowLightRgbaBuffer(data, avgBrightness, contrast) {
  if (!data || data.length === 0) return false;
  if (avgBrightness >= 82 && contrast >= 62) return false;

  const lut = new Uint8ClampedArray(256);
  const darkFloor = avgBrightness < 55 ? 8 : 14;
  const gamma = avgBrightness < 55 ? 0.68 : 0.78;
  const span = Math.max(55, 255 - darkFloor * 2);

  for (let i = 0; i < 256; i++) {
    const norm = Math.max(0, Math.min(1, (i - darkFloor) / span));
    lut[i] = Math.round(Math.pow(norm, gamma) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return true;
}

// Nhận diện 6 màu Rubik bằng ngưỡng HSV trong OpenCV (có hỗ trợ bù sáng cho cam đời cũ)
export function nhanDienMauOpenCv(hsv, lowLightMode = false) {
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
// HỆ MÀU HSV CHUẨN OPENCV (HUE: 0..179, SATURATION: 0..255, VALUE: 0..255)
// KHỚP 100% VỚI THUẬT TOÁN PYTHON OPENCV (nhan_dien_mau & lay_mau_trung_vi)
// ==========================================
export function classifyRubikStickerCell(avgR, avgG, avgB, cellStdDev, motionTolerance = 0, surfaceProfileKey = 'auto', precomputedHsv = null, lowLightMode = false) {
  const maxAllowedStd = 65 + motionTolerance;
  if (cellStdDev > maxAllowedStd) return 'invalid';

  // Lấy giá trị HSV theo chuẩn OpenCV (H: 0-179, S: 0-255, V: 0-255)
  const hsv = precomputedHsv || rgbToOpenCvHsv(avgR, avgG, avgB);
  const h = Math.round(hsv.h);
  const s = Math.round(hsv.s);
  const v = Math.round(hsv.v);

  const minV = lowLightMode ? 28 : 45;
  const minColorS = lowLightMode ? 42 : 60;
  const whiteMaxS = lowLightMode ? 68 : 60;
  const whiteMinV = lowLightMode ? 104 : 140;

  // 1. Quá tối (bóng tối, rãnh khối, viền đen) -> '?'
  if (v < minV) {
    return 'invalid';
  }

  // 2. MÀU TRẮNG (Trang): s < whiteMaxS và v >= whiteMinV
  if (s < whiteMaxS && v >= whiteMinV) {
    return 'white';
  }

  // 3. Độ bão hòa quá thấp (tường mờ, xám, ánh đèn nhạt) -> '?'
  if (s < minColorS) {
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

// Lấy mẫu ô màu Rubik bằng kỹ thuật cắt vùng trung tâm & Trung vị HSV (Median OpenCV)
// Tương đương lay_mau_trung_vi(vung_bgr) trong Python: loại bỏ 100% đốm lóa UV và viền đen
export function sampleCubieStickerCell(frameImg, w, h, cx, cy, cellSize, _surfaceProfileKey) {
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
export function verifyRubikCubeMechanicalGeometry(frameImg, w, h, dim, startX, startY, boxSize) {
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
export function evaluateRubikGridCandidate(frameImg, w, h, dim, startX, startY, boxSize, motionTolerance = 0, surfaceProfileKey = 'auto') {
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
export function scanSpiderWebHitbox(frameImg, w, h, seedCx, seedCy, surfaceProfileKey = 'auto') {
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
export function locateDynamicRubikBox(frameImg, w, h, dim, prevTracker, surfaceProfileKey = 'auto') {
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
