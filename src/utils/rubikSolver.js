import Cube from 'cubejs';

let isInitialized = false;

// Initialize Kociemba lookup tables
export function initSolver() {
  if (!isInitialized) {
    Cube.initSolver();
    isInitialized = true;
  }
}

// Generate standard WCA Scramble (20 moves)
export function generateScramble(length = 20) {
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];
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

// Solve Rubik using Kociemba two-phase algorithm
// Can take either a scramble string (e.g. "R U R' U'") or returns the solution array
export function solveScramble(scrambleString) {
  initSolver();
  const cube = new Cube();
  if (scrambleString && scrambleString.trim()) {
    cube.move(scrambleString.trim());
  }
  const solution = cube.solve();
  return solution ? solution.trim().split(/\s+/) : [];
}

// Solve from 54-character state string (U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9)
export function solveRubikState(cubeStateString) {
  initSolver();
  try {
    const cube = Cube.fromString(cubeStateString);
    const solution = cube.solve();
    return {
      success: true,
      moves: solution ? solution.trim().split(/\s+/) : []
    };
  } catch (err) {
    return {
      success: false,
      error: 'Khối Rubik không hợp lệ hoặc trạng thái quét bị sai màu!',
      moves: []
    };
  }
}
