const Cube = require('cubejs');
Cube.initSolver();

const cubeStr = process.argv[2];
if (!cubeStr) {
  console.log(JSON.stringify({ success: false, error: 'Thiếu cube string hoặc scramble' }));
  process.exit(0);
}

try {
  let cube;
  if (cubeStr.length === 54 && !cubeStr.includes(' ')) {
    cube = Cube.fromString(cubeStr);
  } else {
    cube = new Cube();
    cube.move(cubeStr);
  }
  const solution = cube.solve();
  console.log(JSON.stringify({
    success: true,
    solution,
    moveCount: solution.split(/\s+/).filter(Boolean).length
  }));
} catch (e) {
  console.log(JSON.stringify({
    success: false,
    error: e.message || 'Lỗi giải Kociemba'
  }));
}
