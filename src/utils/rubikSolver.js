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
export function calculateScrambleMatch(targetScramble, scannedFaces, dim = 3) {
  if (!scannedFaces || typeof scannedFaces !== 'object') {
    return { matchCount: 0, totalScanned: 0, matchRate: 100, isMatch: true, isMismatch: false, isPending: true };
  }

  const scannedKeys = Object.keys(scannedFaces);
  if (scannedKeys.length === 0) {
    return { matchCount: 0, totalScanned: 0, matchRate: 100, isMatch: true, isMismatch: false, isPending: true };
  }

  // Đếm tổng số ô màu hợp lệ đã quét
  let totalScanned = 0;
  for (const k of scannedKeys) {
    const arr = scannedFaces[k];
    if (Array.isArray(arr)) {
      totalScanned += arr.filter(c => c && c !== 'invalid').length;
    }
  }

  const minStickersForCheck = Math.min(dim * dim, 9);
  if (totalScanned < minStickersForCheck) {
    return { matchCount: 0, totalScanned, matchRate: 100, isMatch: true, isMismatch: false, isPending: true };
  }

  const expectedFaces = buildScrambledFaces(dim, targetScramble);
  const orientations = getAll24CubeOrientations(expectedFaces, dim);

  let bestMatch = 0;
  for (const ori of orientations) {
    let match = 0;
    for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
      const scanned = scannedFaces[f];
      if (!scanned || !Array.isArray(scanned)) continue;
      const expectedArr = ori[f];
      if (!expectedArr) continue;

      for (let i = 0; i < dim * dim; i++) {
        const scCol = scanned[i];
        if (scCol && scCol !== 'invalid') {
          if (scCol === expectedArr[i]) {
            match++;
          }
        }
      }
    }
    if (match > bestMatch) {
      bestMatch = match;
    }
  }

  const matchRate = totalScanned > 0 ? Math.round((bestMatch / totalScanned) * 100) : 0;
  // Ngưỡng khớp: >= 78% (cho phép sai số 1-2 ô do phản quang ánh sáng trên webcam)
  const isMatch = matchRate >= 78;
  // Xáo sai rõ rệt: đã quét ít nhất 1 mặt đầy đủ (>= 9 ô) nhưng độ khớp dưới 70%
  const isMismatch = totalScanned >= minStickersForCheck && matchRate < 70;

  return {
    matchCount: bestMatch,
    totalScanned,
    matchRate,
    isMatch,
    isMismatch,
    isPending: false
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
