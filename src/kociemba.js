import Cube from 'cubejs';

let isInitialized = false;

export function initKociembaSolver() {
  if (!isInitialized) {
    try {
      Cube.initSolver();
      isInitialized = true;
    } catch (e) {
      console.warn('Failed to init Kociemba solver:', e);
    }
  }
}

// Giải Rubik 3x3 tối ưu bằng Kociemba Two-Phase Algorithm
export function solveWithKociemba(scrambleStr) {
  try {
    initKociembaSolver();
    const cube = new Cube();
    if (scrambleStr && typeof scrambleStr === 'string') {
      cube.move(scrambleStr);
    }
    const solution = cube.solve();
    return {
      success: true,
      solution,
      moveCount: solution.split(/\s+/).filter(Boolean).length
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Không thể giải bằng Kociemba'
    };
  }
}

// Xác minh tính hợp lệ vật lý của trạng thái 6 mặt Rubik qua Kociemba
// cubeString định dạng chuẩn 54 ký tự: UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
export function verifyCubeStateWithKociemba(cube54CharString) {
  try {
    initKociembaSolver();
    const cube = Cube.fromString(cube54CharString);
    const solution = cube.solve();
    return {
      valid: true,
      solution,
      moveCount: solution.split(/\s+/).filter(Boolean).length
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message || 'Trạng thái khối không hợp lệ (lệch góc, lệch cạnh hoặc parity)'
    };
  }
}

// Giải trạng thái khối Rubik 6 mặt thu được từ Camera AI bằng Kociemba Two-Phase
export function solveScannedFacesWithKociemba(scannedFaces) {
  try {
    initKociembaSolver();
    if (!scannedFaces) {
      return { success: false, error: 'Chưa có dữ liệu quét khối Rubik' };
    }
    const order = ['U', 'R', 'F', 'D', 'L', 'B'];
    const missing = order.filter(
      k => !scannedFaces[k] || scannedFaces[k].length !== 9 || scannedFaces[k].some(c => c === 'invalid' || !c)
    );
    if (missing.length > 0) {
      return {
        success: false,
        error: `Chưa quét đủ 6 mặt hợp lệ (còn thiếu hoặc có ô mờ ở mặt: ${missing.join(', ')})`
      };
    }

    // Xác định màu tâm để ánh xạ sang ký tự mặt: U, R, F, D, L, B
    const colorToFace = {};
    for (const f of order) {
      const centerCol = scannedFaces[f][4];
      if (!centerCol || centerCol === 'invalid') {
        return { success: false, error: `Mặt ${f} chưa nhận diện được màu tâm!` };
      }
      colorToFace[centerCol] = f;
    }

    if (Object.keys(colorToFace).length < 6) {
      return { success: false, error: 'Các màu tâm bị trùng nhau, hãy quét lại rõ từng mặt' };
    }

    const cubeChars = [];
    for (const f of order) {
      for (let i = 0; i < 9; i++) {
        const col = scannedFaces[f][i];
        const faceChar = colorToFace[col];
        if (!faceChar) {
          return { success: false, error: `Màu ${col} ở ô ${i + 1} mặt ${f} không khớp với bất kỳ tâm nào!` };
        }
        cubeChars.push(faceChar);
      }
    }

    const cubeStr = cubeChars.join('');
    const res = verifyCubeStateWithKociemba(cubeStr);
    if (res.valid) {
      return {
        success: true,
        solution: res.solution,
        moveCount: res.moveCount,
        cubeStr
      };
    } else {
      return {
        success: false,
        error: res.error || 'Trạng thái khối không giải được (có thể có góc bị lật hoặc cạnh bị hoán vị)'
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Lỗi khi giải khối bằng Kociemba'
    };
  }
}

// Giải thích chuyển động Rubik bằng tiếng Việt chuẩn
export function getMoveExplanationVi(move) {
  if (!move) return '';
  const clean = move.trim();
  const faceMap = {
    U: 'TRÊN (U)',
    D: 'DƯỚI (D)',
    F: 'TRƯỚC (F)',
    B: 'SAU (B)',
    R: 'PHẢI (R)',
    L: 'TRÁI (L)'
  };
  const base = clean.charAt(0);
  const faceName = faceMap[base] || base;
  if (clean.endsWith("2")) {
    return `Xoay mặt ${faceName} 180°`;
  }
  if (clean.endsWith("'")) {
    return `Xoay mặt ${faceName} 90° ngược chiều kim đồng hồ`;
  }
  return `Xoay mặt ${faceName} 90° theo chiều kim đồng hồ`;
}

export default Cube;
