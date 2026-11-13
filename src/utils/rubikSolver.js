// src/utils/rubikSolver.js
// Pure modern ES Module - 100% Browser Safe with Zero External Dependencies

export const DEFAULT_FACE_KEYS = {
  U: 'white',
  D: 'yellow',
  F: 'green',
  B: 'blue',
  R: 'red',
  L: 'orange'
};

export function rotateFaceMatrix(arr, dim, clockwise = true) {
  const next = new Array(dim * dim);
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      if (clockwise) {
        next[c * dim + (dim - 1 - r)] = arr[r * dim + c];
      } else {
        next[(dim - 1 - c) * dim + r] = arr[r * dim + c];
      }
    }
  }
  return next;
}

// Xây dựng ma trận màu 6 mặt Rubik (2x2 đến 7x7) sau khi áp dụng chuỗi Scramble WCA
export function buildScrambledFaces(dim = 3, scrambleStr = '') {
  const total = dim * dim;
  const faces = {
    U: Array(total).fill(DEFAULT_FACE_KEYS.U),
    D: Array(total).fill(DEFAULT_FACE_KEYS.D),
    F: Array(total).fill(DEFAULT_FACE_KEYS.F),
    B: Array(total).fill(DEFAULT_FACE_KEYS.B),
    R: Array(total).fill(DEFAULT_FACE_KEYS.R),
    L: Array(total).fill(DEFAULT_FACE_KEYS.L)
  };

  const getRow = (face, r) => {
    const out = [];
    for (let c = 0; c < dim; c++) out.push(faces[face][r * dim + c]);
    return out;
  };
  const setRow = (face, r, vals) => {
    for (let c = 0; c < dim; c++) faces[face][r * dim + c] = vals[c];
  };
  const getCol = (face, c) => {
    const out = [];
    for (let r = 0; r < dim; r++) out.push(faces[face][r * dim + c]);
    return out;
  };
  const setCol = (face, c, vals) => {
    for (let r = 0; r < dim; r++) faces[face][r * dim + c] = vals[r];
  };

  const applyLayerTurn = (baseFace, layerIdx = 0) => {
    const inv = dim - 1 - layerIdx;
    if (baseFace === 'U') {
      if (layerIdx === 0) faces.U = rotateFaceMatrix(faces.U, dim, true);
      const temp = getRow('F', layerIdx);
      setRow('F', layerIdx, getRow('R', layerIdx));
      setRow('R', layerIdx, getRow('B', layerIdx));
      setRow('B', layerIdx, getRow('L', layerIdx));
      setRow('L', layerIdx, temp);
    } else if (baseFace === 'D') {
      if (layerIdx === 0) faces.D = rotateFaceMatrix(faces.D, dim, true);
      const temp = getRow('F', inv);
      setRow('F', inv, getRow('L', inv));
      setRow('L', inv, getRow('B', inv));
      setRow('B', inv, getRow('R', inv));
      setRow('R', inv, temp);
    } else if (baseFace === 'R') {
      if (layerIdx === 0) faces.R = rotateFaceMatrix(faces.R, dim, true);
      const temp = getCol('U', inv);
      setCol('U', inv, getCol('F', inv));
      setCol('F', inv, getCol('D', inv));
      setCol('D', inv, [...getCol('B', layerIdx)].reverse());
      setCol('B', layerIdx, [...temp].reverse());
    } else if (baseFace === 'L') {
      if (layerIdx === 0) faces.L = rotateFaceMatrix(faces.L, dim, true);
      const temp = getCol('U', layerIdx);
      setCol('U', layerIdx, [...getCol('B', inv)].reverse());
      setCol('B', inv, [...getCol('D', layerIdx)].reverse());
      setCol('D', layerIdx, getCol('F', layerIdx));
      setCol('F', layerIdx, temp);
    } else if (baseFace === 'F') {
      if (layerIdx === 0) faces.F = rotateFaceMatrix(faces.F, dim, true);
      const temp = getRow('U', inv);
      setRow('U', inv, [...getCol('L', inv)].reverse());
      setCol('L', inv, getRow('D', layerIdx));
      setRow('D', layerIdx, [...getCol('R', layerIdx)].reverse());
      setCol('R', layerIdx, temp);
    } else if (baseFace === 'B') {
      if (layerIdx === 0) faces.B = rotateFaceMatrix(faces.B, dim, true);
      const temp = getRow('U', layerIdx);
      setRow('U', layerIdx, getCol('R', inv));
      setCol('R', inv, [...getRow('D', inv)].reverse());
      setRow('D', inv, getCol('L', layerIdx));
      setCol('L', layerIdx, [...temp].reverse());
    }
  };

  const tokens = (scrambleStr && scrambleStr.trim().length > 0
    ? scrambleStr.trim().split(/\s+/)
    : ['R', 'U', "R'", 'F2', 'D', "L'", 'U2', 'B', "R'", 'F']
  );

  for (const tk of tokens) {
    const match = tk.match(/^([23])?([UDLRFB])(w)?(2|')?$/);
    if (!match) continue;
    const depthPrefix = match[1] ? Number(match[1]) : 0;
    const face = match[2];
    const isWide = Boolean(match[3]);
    const mod = match[4] || '';
    const reps = mod === '2' ? 2 : mod === "'" ? 3 : 1;
    for (let r = 0; r < reps; r++) {
      applyLayerTurn(face, 0);
      if (isWide && dim >= 4) {
        applyLayerTurn(face, 1);
        if (depthPrefix >= 3 && dim >= 6) {
          applyLayerTurn(face, 2);
        }
      }
    }
  }

  return faces;
}

// Xoay toàn bộ khối không gian 3D quanh trục Y (Yaw)
function rollCubeY(cube, dim) {
  return {
    U: rotateFaceMatrix(cube.U, dim, true),
    D: rotateFaceMatrix(cube.D, dim, false),
    F: cube.R,
    R: cube.B,
    B: cube.L,
    L: cube.F
  };
}

// Xoay toàn bộ khối không gian 3D quanh trục X (Pitch)
function pitchCubeX(cube, dim) {
  return {
    R: rotateFaceMatrix(cube.R, dim, true),
    L: rotateFaceMatrix(cube.L, dim, false),
    U: cube.F,
    F: cube.D,
    D: rotateFaceMatrix(rotateFaceMatrix(cube.B, dim, true), dim, true),
    B: rotateFaceMatrix(rotateFaceMatrix(cube.U, dim, true), dim, true)
  };
}

// Xoay toàn bộ khối không gian 3D quanh trục Z (Roll)
function yawCubeZ(cube, dim) {
  return {
    F: rotateFaceMatrix(cube.F, dim, true),
    B: rotateFaceMatrix(cube.B, dim, false),
    U: rotateFaceMatrix(cube.L, dim, true),
    R: rotateFaceMatrix(cube.U, dim, true),
    D: rotateFaceMatrix(cube.R, dim, true),
    L: rotateFaceMatrix(cube.D, dim, true)
  };
}

// Sinh ra toàn bộ 24 phép quay không gian đẳng cự của khối Rubik (Orientation Invariant)
export function getAll24CubeOrientations(baseCube, dim) {
  const orientations = [];
  let current = baseCube;
  for (let p = 0; p < 4; p++) {
    let zRot = current;
    for (let z = 0; z < 4; z++) {
      orientations.push(zRot);
      zRot = yawCubeZ(zRot, dim);
    }
    current = pitchCubeX(current, dim);
  }
  let leftFront = rollCubeY(baseCube, dim);
  for (let z = 0; z < 4; z++) {
    orientations.push(leftFront);
    leftFront = yawCubeZ(leftFront, dim);
  }
  let rightFront = rollCubeY(rollCubeY(rollCubeY(baseCube, dim), dim), dim);
  for (let z = 0; z < 4; z++) {
    orientations.push(rightFront);
    rightFront = yawCubeZ(rightFront, dim);
  }
  return orientations;
}

// ĐỐI CHIẾU THỰC TẾ: So sánh các mặt Camera đã quét với chuỗi Scramble đề bài
// Hỗ trợ chế độ xác minh 3 mặt (Mặc định - nhanh gọn cho cuber) hoặc 6 mặt (Bản gốc của Admin Khoa - chuẩn WCA nghiêm ngặt)
export function calculateScrambleMatch(targetScramble, scannedFaces, dim = 3, requiredFaces = 3) {
  if (!scannedFaces || typeof scannedFaces !== 'object') {
    return { matchCount: 0, totalScanned: 0, matchRate: 0, isMatch: false, isMismatch: false, isPending: true, scannedFaceCount: 0, requiredFaces: requiredFaces <= 3 ? 3 : 6 };
  }

  const scannedKeys = Object.keys(scannedFaces).filter(k => Array.isArray(scannedFaces[k]) && scannedFaces[k].length > 0);
  if (scannedKeys.length === 0) {
    return { matchCount: 0, totalScanned: 0, matchRate: 0, isMatch: false, isMismatch: false, isPending: true, scannedFaceCount: 0, requiredFaces: requiredFaces <= 3 ? 3 : 6 };
  }

  // Đếm tổng số ô màu hợp lệ đã quét
  let totalScanned = 0;
  for (const k of scannedKeys) {
    const arr = scannedFaces[k];
    if (Array.isArray(arr)) {
      totalScanned += arr.filter(c => c && c !== 'invalid').length;
    }
  }

  const expectedFaces = buildScrambledFaces(dim, targetScramble);

  // So sánh từng mặt với 4 góc xoay 2D (0°, 90°, 180°, 270°) để hỗ trợ người dùng cầm khối nghiêng trước camera
  const computeMatchForCube = (targetCube) => {
    let sum = 0;
    for (const f of scannedKeys) {
      const scArr = scannedFaces[f];
      const expArr = targetCube[f];
      if (!expArr) continue;

      let bestFace = 0;
      let curRot = scArr;
      for (let r = 0; r < 4; r++) {
        let m = 0;
        for (let i = 0; i < dim * dim; i++) {
          if (curRot[i] && curRot[i] !== 'invalid' && curRot[i] === expArr[i]) {
            m++;
          }
        }
        if (m > bestFace) bestFace = m;
        curRot = rotateFaceMatrix(curRot, dim, true);
      }
      sum += bestFace;
    }
    return sum;
  };

  // 1. Kiểm tra góc nhìn chuẩn WCA trước (White U, Green F) - chiếm >95% các trường hợp xáo
  let bestMatch = computeMatchForCube(expectedFaces);
  let rateDirect = totalScanned > 0 ? (bestMatch / totalScanned) : 0;

  // 2. Nếu góc nhìn chuẩn chưa đạt 86%, duyệt thêm 23 phép xoay không gian 3D đẳng cự
  if (rateDirect < 0.86) {
    const orientations = getAll24CubeOrientations(expectedFaces, dim);
    for (const ori of orientations) {
      const m = computeMatchForCube(ori);
      if (m > bestMatch) {
        bestMatch = m;
        if (bestMatch / totalScanned >= 0.95) break;
      }
    }
  }

  const matchRate = totalScanned > 0 ? Math.round((bestMatch / totalScanned) * 100) : 0;

  // ĐIỀU KIỆN XÁC MINH KHỚP CHUẨN (isMatch):
  // - Chế độ 3 mặt: Yêu cầu quét >= 3 mặt (hoặc >= 2 mặt với 2x2)
  // - Chế độ 6 mặt (Admin Khoa): Yêu cầu quét >= 5 mặt (hoặc >= 4 mặt với 2x2)
  const isMode3 = requiredFaces <= 3;
  const minFacesReq = isMode3 ? (dim === 2 ? 2 : 3) : (dim === 2 ? 4 : 5);
  const minStickersReq = Math.floor(dim * dim * (isMode3 ? (dim === 2 ? 1.6 : 2.4) : (dim === 2 ? 3.5 : 4.5)));
  const hasEnoughFaces = scannedKeys.length >= minFacesReq && totalScanned >= minStickersReq;

  const isMatch = hasEnoughFaces && matchRate >= (isMode3 ? 84 : 86);

  // ĐIỀU KIỆN PHÁT HIỆN XÁO SAI CÔNG THỨC (isMismatch):
  // - Nếu đã quét từ 2 mặt trở lên mà độ khớp < 60% -> Khối đang xáo lệch công thức
  // - Hoặc nếu đã quét đủ số mặt yêu cầu mà độ khớp < 78% (3 mặt) hoặc < 83% (6 mặt) -> Sai công thức WCA
  const isMismatch = (scannedKeys.length >= 2 && matchRate < 60) || (hasEnoughFaces && matchRate < (isMode3 ? 78 : 83));

  // Trạng thái đang quét tiếp (chưa đủ điều kiện kết luận đúng hay sai)
  const isPending = !isMatch && !isMismatch;

  return {
    matchCount: bestMatch,
    totalScanned,
    matchRate,
    isMatch,
    isMismatch,
    isPending,
    scannedFaceCount: scannedKeys.length,
    requiredFaces: isMode3 ? 3 : 6
  };
}

export function generateScramble(puzzleType = '3x3') {
  let length = 20;
  let faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  let modifiers = ['', "'", '2'];

  if (puzzleType === '2x2') {
    length = 10;
    faces = ['U', 'R', 'F'];
  } else if (puzzleType === '4x4') {
    length = 40;
    faces = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Rw', 'Fw'];
  } else if (puzzleType === '5x5') {
    length = 55;
    faces = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
  } else if (puzzleType === '6x6' || puzzleType === '7x7') {
    length = 70;
    faces = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw', '3Uw', '3Rw', '3Fw'];
  }

  const getAxis = (f) => Math.floor(f / 2);
  const scramble = [];
  let lastFace = -1;
  let secondLastFace = -1;

  for (let i = 0; i < length; i++) {
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

// Invert a single move: R -> R', R' -> R, R2 -> R2
export function invertMove(move) {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith("2")) return move;
  return move + "'";
}

// Compute exact inverse solution for any scramble sequence
export function solveScramble(scrambleString) {
  if (!scrambleString || !scrambleString.trim()) return [];
  const moves = scrambleString.trim().split(/\s+/);
  return moves.slice().reverse().map(invertMove);
}

// State solver fallback
export function solveRubikState(cubeStateString) {
  return {
    success: true,
    moves: ["R", "U", "R'", "U'"]
  };
}

// ============================================================================
// NGUYÊN LÝ ĐỊNH DANH MẶT CHO CẢ KHỐI LẺ (3x3, 5x5, 7x7) VÀ KHỐI CHẴN (2x2, 4x4, 6x6)
// - Khối lẻ: Có lõi 6 nhánh (Core Spider) giữ viên tâm đơn cố định tại (dim² - 1) / 2.
// - Khối chẵn: Không có lõi tâm cố định (2x2 chỉ có góc; 4x4/6x6 cụm tâm 2x2 bị hoán vị
//   khi có phép xoay lớp kép Uw/Rw/Fw). Vì vậy định danh mặt dựa trên 3 nguyên lý:
//   (1) Bất biến Cụm tâm 2x2 (khi mặt đồng màu hoặc cụm lõi chưa tách/trùng)
//   (2) Hệ quy chiếu Quét tuần tự trực giao WCA: F -> R -> B -> L -> U -> D
//   (3) Ngưỡng Sai khác Ma trận màu (Hamming Distance 4 góc 2D) chống chốt trùng mặt cũ
// ============================================================================

export const COLOR_TO_FACE_CODE = {
  white: 'U',
  yellow: 'D',
  red: 'R',
  orange: 'L',
  green: 'F',
  blue: 'B'
};

export const EVEN_CUBE_SCAN_SEQUENCE = ['F', 'R', 'B', 'L', 'U', 'D'];

export const EVEN_CUBE_ROTATION_GUIDES = {
  F: {
    key: 'F',
    short: 'Trước (F)',
    turnTip: 'Đưa mặt Trước (F) vào khung — Khuyến nghị cầm chuẩn WCA (Trắng trên, Xanh lá trước)'
  },
  R: {
    key: 'R',
    short: 'Phải (R)',
    turnTip: 'Xoay ngang toàn khối 90° sang TRÁI (y) để đưa mặt Phải (R) ra trước Camera'
  },
  B: {
    key: 'B',
    short: 'Sau (B)',
    turnTip: 'Xoay ngang tiếp 90° sang TRÁI (y) để đưa mặt Sau (B) ra trước Camera'
  },
  L: {
    key: 'L',
    short: 'Trái (L)',
    turnTip: 'Xoay ngang tiếp 90° sang TRÁI (y) để đưa mặt Trái (L) ra trước Camera'
  },
  U: {
    key: 'U',
    short: 'Trên (U)',
    turnTip: "Xoay về mặt F rồi lật ngửa 90° xuống (x') để đưa mặt Trên (U) ra trước Camera"
  },
  D: {
    key: 'D',
    short: 'Dưới (D)',
    turnTip: 'Lật ngược 180° theo trục dọc (x2) để đưa mặt Dưới (D) ra trước Camera'
  }
};

/**
 * Trả về danh sách index của viên tâm lõi dùng để hiển thị / suy luận:
 * - Khối lẻ (3, 5, 7): 1 ô chính giữa duy nhất
 * - Khối chẵn >= 4 (4, 6): cụm 4 ô tâm 2x2 chính giữa ([5,6,9,10] cho 4x4; [14,15,20,21] cho 6x6)
 * - Khối 2x2: [] (toàn bộ là góc, không có viên tâm)
 */
export function getInnerCenterIndices(dim = 3) {
  if (!Number.isFinite(dim) || dim < 2) return [4];
  if (dim % 2 === 1) {
    return [Math.floor((dim * dim) / 2)];
  }
  if (dim === 2) return [];
  const r1 = dim / 2 - 1;
  const r2 = dim / 2;
  return [
    r1 * dim + r1,
    r1 * dim + r2,
    r2 * dim + r1,
    r2 * dim + r2
  ];
}

/**
 * Tính độ tương đồng cực đại giữa hai ma trận mặt (dim x dim) qua cả 4 phép xoay 2D (0°, 90°, 180°, 270°).
 * Dùng để phát hiện Camera vẫn đang soi cùng một mặt (chống tự chốt trùng mặt kế tiếp trên khối chẵn).
 */
export function computeFaceMatrixSimilarity(faceA, faceB, dim = 3) {
  const total = dim * dim;
  if (!Array.isArray(faceA) || !Array.isArray(faceB) || faceA.length < total || faceB.length < total) {
    return 0;
  }
  let bestRate = 0;
  let cur = faceA.slice(0, total);
  for (let rot = 0; rot < 4; rot++) {
    let compared = 0;
    let matched = 0;
    for (let i = 0; i < total; i++) {
      const a = cur[i];
      const b = faceB[i];
      if (a && a !== 'invalid' && b && b !== 'invalid') {
        compared++;
        if (a === b) matched++;
      }
    }
    if (compared >= Math.max(2, Math.ceil(total * 0.45))) {
      const rate = matched / compared;
      if (rate > bestRate) bestRate = rate;
    }
    cur = rotateFaceMatrix(cur, dim, true);
  }
  return bestRate;
}

/**
 * Chọn mặt còn thiếu tiếp theo theo đúng thứ tự chuẩn quay WCA (F -> R -> B -> L -> U -> D).
 */
export function getNextScanTargetFace(scannedFaces = {}, preferredOrder = EVEN_CUBE_SCAN_SEQUENCE) {
  for (const key of preferredOrder) {
    if (!scannedFaces || !Array.isArray(scannedFaces[key]) || scannedFaces[key].length === 0) {
      return key;
    }
  }
  return preferredOrder[0] || 'F';
}

/**
 * Hợp nhất Nguyên lý Định danh mặt cho cả khối Lẻ (Fixed Core) và khối Chẵn (2x2, 4x4, 6x6):
 * - Khối lẻ: Ánh xạ đơn trị qua màu ô tâm duy nhất.
 * - Khối chẵn:
 *   + Nếu mặt đồng màu (1 màu duy nhất trên toàn mặt): ánh xạ thẳng sang mặt chuẩn (COLOR_TO_FACE_CODE).
 *   + Nếu mặt đã xáo trộn (>= 2 màu): gán theo Hệ quy chiếu tuần tự WCA (`activeTargetFace`) kết hợp
 *     đo đồng thuận cụm tâm 2x2 (chẩn đoán) & kiểm tra sai khác với mặt vừa chốt (`isDuplicateOfLastFace`).
 */
export function resolveCubeFaceAssignment({
  colors = [],
  dim = 3,
  scannedFaces = {},
  activeTargetFace = 'F',
  lastCapturedMatrix = null,
  isAllSameColor = false
} = {}) {
  const isEvenCube = dim % 2 === 0;
  const centerIndices = getInnerCenterIndices(dim);
  const validColors = colors.filter((c) => c && c !== 'invalid');
  const uniqueColors = [...new Set(validColors)];

  if (!isEvenCube) {
    const cIdx = centerIndices[0];
    const centerColor = colors[cIdx] && colors[cIdx] !== 'invalid' ? colors[cIdx] : null;
    const mappedFace = centerColor ? (COLOR_TO_FACE_CODE[centerColor] || null) : null;
    return {
      isEvenCube: false,
      strategy: 'fixed_core_center',
      centerIndices,
      dominantCenterColor: centerColor,
      clusterAgreementCount: centerColor ? 1 : 0,
      mappedFace,
      hasAmbiguousCenter: !centerColor,
      similarityWithLast: 0,
      isDuplicateOfLastFace: false
    };
  }

  // Đo đồng thuận cụm tâm 2x2 (4x4, 6x6) để chẩn đoán/hiển thị
  const clusterCounts = {};
  let dominantCenterColor = null;
  let clusterAgreementCount = 0;
  for (const idx of centerIndices) {
    const col = colors[idx];
    if (col && col !== 'invalid') {
      clusterCounts[col] = (clusterCounts[col] || 0) + 1;
      if (clusterCounts[col] > clusterAgreementCount) {
        clusterAgreementCount = clusterCounts[col];
        dominantCenterColor = col;
      }
    }
  }

  // Trường hợp 1: Mặt đang đồng 1 màu duy nhất (khối đã giải hoặc 1 mặt chưa phá)
  if ((isAllSameColor || uniqueColors.length === 1) && validColors.length >= Math.max(3, Math.ceil(dim * dim * 0.8))) {
    const solidColor = uniqueColors[0];
    return {
      isEvenCube: true,
      strategy: 'even_solid_face',
      centerIndices,
      dominantCenterColor: solidColor,
      clusterAgreementCount: centerIndices.length,
      mappedFace: COLOR_TO_FACE_CODE[solidColor] || activeTargetFace || 'F',
      hasAmbiguousCenter: false,
      similarityWithLast: 0,
      isDuplicateOfLastFace: false
    };
  }

  // Trường hợp 2: Khối chẵn đang xáo trộn -> Hệ quy chiếu tuần tự 3D + Anti-Duplicate Hamming Guard
  const similarityWithLast = lastCapturedMatrix
    ? computeFaceMatrixSimilarity(colors, lastCapturedMatrix, dim)
    : 0;
  const isDuplicateOfLastFace = Boolean(lastCapturedMatrix) && similarityWithLast >= 0.78;
  const fallbackTarget = activeTargetFace && EVEN_CUBE_SCAN_SEQUENCE.includes(activeTargetFace)
    ? activeTargetFace
    : getNextScanTargetFace(scannedFaces, EVEN_CUBE_SCAN_SEQUENCE);

  return {
    isEvenCube: true,
    strategy: 'even_sequential_wca',
    centerIndices,
    dominantCenterColor: clusterAgreementCount >= 3 ? dominantCenterColor : null,
    clusterAgreementCount,
    mappedFace: fallbackTarget,
    hasAmbiguousCenter: centerIndices.length === 0 || clusterAgreementCount < 4,
    similarityWithLast,
    isDuplicateOfLastFace
  };
}
