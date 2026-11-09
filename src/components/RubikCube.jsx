import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Standard WCA Rubik Colors
const COLORS = {
  R: 0xb71234, // Red (+X, Right)
  L: 0xff5800, // Orange (-X, Left)
  U: 0xffffff, // White (+Y, Top)
  D: 0xffd500, // Yellow (-Y, Bottom)
  F: 0x009b48, // Green (+Z, Front)
  B: 0x0046ad, // Blue (-Z, Back)
  BLACK: 0x18181b // Inner Plastic
};

const MOVES_CONFIG = [
  { label: 'U', isPrime: false, color: '#f8fafc' },
  { label: "U'", isPrime: true, color: '#94a3b8' },
  { label: 'D', isPrime: false, color: '#facc15' },
  { label: "D'", isPrime: true, color: '#ca8a04' },
  { label: 'L', isPrime: false, color: '#fb923c' },
  { label: "L'", isPrime: true, color: '#ea580c' },
  { label: 'R', isPrime: false, color: '#f87171' },
  { label: "R'", isPrime: true, color: '#dc2626' },
  { label: 'F', isPrime: false, color: '#4ade80' },
  { label: "F'", isPrime: true, color: '#16a34a' },
  { label: 'B', isPrime: false, color: '#60a5fa' },
  { label: "B'", isPrime: true, color: '#2563eb' }
];

const RubikCube = forwardRef(({ onMoveComplete }, ref) => {
  const mountRef = useRef(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [isBusy, setIsBusy] = useState(false);

  // Internal Three.js state reference
  const stateRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    cubies: [],
    queue: [],
    isAnimating: false,
    initialMaterials: []
  });

  // Expose imperative API for external modules (Solver, Scanner, AI)
  useImperativeHandle(ref, () => ({
    // Execute a single move (e.g. "R", "U'")
    executeMove: (move) => {
      enqueueMove(move);
    },
    // Execute a sequence of moves (e.g. ["R", "U", "R'", "U'"])
    executeAlgorithm: async (moves, speedMs = 180) => {
      for (const move of moves) {
        await new Promise((resolve) => {
          enqueueMove(move, true, speedMs, resolve);
        });
      }
    },
    // Scramble the cube
    scramble: () => {
      handleScramble();
    },
    // Reset move history
    clearHistory: () => {
      setMoveHistory([]);
    }
  }));

  // Enqueue a move into the animation pipeline
  const enqueueMove = (move, updateHistory = true, speedMs = 200, onDone = null) => {
    stateRef.current.queue.push({ move, updateHistory, speedMs, onDone });
    processQueue();
  };

  const processQueue = () => {
    if (stateRef.current.isAnimating || stateRef.current.queue.length === 0) return;

    const task = stateRef.current.queue.shift();
    executeSliceRotation(task);
  };

  const executeSliceRotation = ({ move, updateHistory, speedMs, onDone }) => {
    const { scene, cubies } = stateRef.current;
    if (!scene) return;

    stateRef.current.isAnimating = true;
    setIsBusy(true);

    if (updateHistory) {
      setMoveHistory(prev => [...prev.slice(-17), move]);
      if (onMoveComplete) onMoveComplete(move);
    }

    // Determine Axis, Filter, Angle
    let axis = new THREE.Vector3(0, 1, 0);
    let checkFn = () => false;
    let angle = -Math.PI / 2;

    const isPrime = move.endsWith("'");
    const base = move.replace("'", "");

    switch (base) {
      case 'U':
        axis.set(0, 1, 0);
        checkFn = (p) => p.y > 0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      case 'D':
        axis.set(0, 1, 0);
        checkFn = (p) => p.y < -0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      case 'R':
        axis.set(1, 0, 0);
        checkFn = (p) => p.x > 0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      case 'L':
        axis.set(1, 0, 0);
        checkFn = (p) => p.x < -0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      case 'F':
        axis.set(0, 0, 1);
        checkFn = (p) => p.z > 0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      case 'B':
        axis.set(0, 0, 1);
        checkFn = (p) => p.z < -0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      default:
        stateRef.current.isAnimating = false;
        setIsBusy(false);
        if (onDone) onDone();
        processQueue();
        return;
    }

    // Find all 9 cubies in the target slice
    const sliceCubies = cubies.filter(c => checkFn(c.position));

    // Create a temporary pivot at the origin
    const pivot = new THREE.Object3D();
    scene.add(pivot);

    sliceCubies.forEach(c => {
      scene.remove(c);
      pivot.add(c);
    });

    const startTime = performance.now();
    const duration = Math.max(speedMs, 60);

    const animateSlice = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic: f(t) = 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      pivot.setRotationFromAxisAngle(axis, angle * eased);

      if (progress < 1) {
        requestAnimationFrame(animateSlice);
      } else {
        // Finalize rotation precisely
        pivot.setRotationFromAxisAngle(axis, angle);
        pivot.updateMatrixWorld();

        // Snap cubies back to scene and round coordinates to eliminate floating-point drift
        sliceCubies.forEach(c => {
          c.applyMatrix4(pivot.matrixWorld);
          c.position.x = Math.round(c.position.x);
          c.position.y = Math.round(c.position.y);
          c.position.z = Math.round(c.position.z);
          pivot.remove(c);
          scene.add(c);
        });

        scene.remove(pivot);
        stateRef.current.isAnimating = false;
        setIsBusy(stateRef.current.queue.length > 0);

        if (onDone) onDone();
        processQueue();
      }
    };

    requestAnimationFrame(animateSlice);
  };

  // Scramble 20 moves
  const handleScramble = () => {
    const moves = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'"];
    for (let i = 0; i < 20; i++) {
      const randMove = moves[Math.floor(Math.random() * moves.length)];
      enqueueMove(randMove, true, 130);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120); // Deep Dark Slate

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(5.8, 4.6, 6.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 4;
    controls.maxDistance = 18;

    // 3. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(12, 16, 12);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.9);
    dirLight2.position.set(-12, -10, -12);
    scene.add(dirLight2);

    // 4. Build 3x3x3 Rubik Cube (27 cubies)
    const cubies = [];
    const size = 0.95;
    const gap = 1.0;
    const geometry = new THREE.BoxGeometry(size, size, size);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Materials: [+x (Right), -x (Left), +y (Top), -y (Bottom), +z (Front), -z (Back)]
          const materials = [
            new THREE.MeshStandardMaterial({
              color: x === 1 ? COLORS.R : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            }),
            new THREE.MeshStandardMaterial({
              color: x === -1 ? COLORS.L : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            }),
            new THREE.MeshStandardMaterial({
              color: y === 1 ? COLORS.U : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            }),
            new THREE.MeshStandardMaterial({
              color: y === -1 ? COLORS.D : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            }),
            new THREE.MeshStandardMaterial({
              color: z === 1 ? COLORS.F : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            }),
            new THREE.MeshStandardMaterial({
              color: z === -1 ? COLORS.B : COLORS.BLACK,
              roughness: 0.12,
              metalness: 0.08
            })
          ];

          const mesh = new THREE.Mesh(geometry, materials);
          mesh.position.set(x * gap, y * gap, z * gap);
          scene.add(mesh);
          cubies.push(mesh);
        }
      }
    }

    stateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      cubies,
      queue: [],
      isAnimating: false
    };

    // Render loop
    let animFrameId;
    const renderLoop = () => {
      animFrameId = requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();

    // Responsive Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameId);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: '#090d16',
      color: '#f8fafc',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      {/* Top Header Bar */}
      <div style={{
        padding: '14px 24px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6)',
            boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)'
          }}></div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
              Rubik AI 3D Interactive
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
              Chuột trái: Xoay góc nhìn • Chuột phải: Di chuyển • Con lăn: Thu phóng
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleScramble}
            disabled={isBusy}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            🎲 Xáo Trộn (Scramble)
          </button>
        </div>
      </div>

      {/* 3D Canvas Mount Point */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} ref={mountRef}>
        {/* Floating Recent Moves HUD */}
        {moveHistory.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '18px',
            left: '20px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(10px)',
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid #334155',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            maxWidth: '450px'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
              Lịch sử bước đi
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: '700', color: '#38bdf8', letterSpacing: '1px' }}>
              {moveHistory.join('  ')}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Cyberpunk Move Controls */}
      <div style={{
        padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        zIndex: 10
      }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', letterSpacing: '0.05em' }}>
          ĐIỀU KHIỂN CÁC MẶT XOAY (WCA NOTATION)
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '8px',
          maxWidth: '680px',
          width: '100%'
        }}>
          {MOVES_CONFIG.map(({ label, isPrime, color }) => (
            <button
              key={label}
              onClick={() => enqueueMove(label)}
              style={{
                padding: '10px 0',
                borderRadius: '8px',
                border: isPrime ? '1px solid #334155' : `1px solid ${color}44`,
                background: isPrime ? '#1e293b' : '#1e293b',
                color: color,
                fontSize: '1.1rem',
                fontWeight: '800',
                fontFamily: 'monospace',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                boxShadow: isPrime ? 'none' : `0 0 10px ${color}15`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.background = '#334155';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = '#1e293b';
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default RubikCube;
