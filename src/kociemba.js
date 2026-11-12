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

export default Cube;
