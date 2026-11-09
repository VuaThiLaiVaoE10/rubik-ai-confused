import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Standard WCA Rubik Colors
const COLORS = {
  R: 0xb71234, // Red (Right)
  L: 0xff5800, // Orange (Left)
  U: 0xffffff, // White (Top)
  D: 0xffd500, // Yellow (Bottom)
  F: 0x009b48, // Green (Front)
  B: 0x0046ad, // Blue (Back)
  BLACK: 0x18181b // Inner / Plastic
};

export default function RubikCube() {
  const mountRef = useRef(null);
  const [isRotating, setIsRotating] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  
  // Ref to hold internal state for Three.js without triggering react re-renders
  const stateRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    cubies: [],
    queue: [],
    animating: false
  });

  useEffect(() => {
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate 900

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(5.5, 4.5, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // 2. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 3. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(10, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-10, -10, -10);
    scene.add(dirLight2);

    // 4. Create 3x3x3 Rubik Cubies
    const cubies = [];
    const size = 0.95;
    const gap = 1.0;
    const geom = new THREE.BoxGeometry(size, size, size);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Three.js Box Materials order: [+x, -x, +y, -y, +z, -z]
          // [Right, Left, Top, Bottom, Front, Back]
          const materials = [
            new THREE.MeshStandardMaterial({ color: x === 1 ? COLORS.R : COLORS.BLACK, roughness: 0.1, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: x === -1 ? COLORS.L : COLORS.BLACK, roughness: 0.1, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: y === 1 ? COLORS.U : COLORS.BLACK, roughness: 0.1, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: y === -1 ? COLORS.D : COLORS.BLACK, roughness: 0.1, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: z === 1 ? COLORS.F : COLORS.BLACK, roughness: 0.1, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: z === -1 ? COLORS.B : COLORS.BLACK, roughness: 0.1, metalness: 0.1 })
          ];

          const mesh = new THREE.Mesh(geom, materials);
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
      animating: false
    };

    // Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Execute a standard move: move = 'U' | "U'" | 'D' | "D'" | 'R' | "R'" | 'L' | "L'" | 'F' | "F'" | 'B' | "B'"
  const performMove = (move, updateHistory = true) => {
    const { scene, cubies, queue } = stateRef.current;
    if (!scene) return;

    if (stateRef.current.animating) {
      queue.push(move);
      return;
    }

    stateRef.current.animating = true;
    setIsRotating(true);
    if (updateHistory) {
      setMoveHistory(prev => [...prev.slice(-15), move]);
    }

    // Determine axis, layer condition, and rotation angle
    let axis = new THREE.Vector3(0, 1, 0); // default y
    let checkFn = () => false;
    let angle = -Math.PI / 2;

    const isPrime = move.endsWith("'");
    const baseMove = move.replace("'", "");

    switch (baseMove) {
      case 'U':
        axis.set(0, 1, 0);
        checkFn = (pos) => pos.y > 0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      case 'D':
        axis.set(0, 1, 0);
        checkFn = (pos) => pos.y < -0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      case 'R':
        axis.set(1, 0, 0);
        checkFn = (pos) => pos.x > 0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      case 'L':
        axis.set(1, 0, 0);
        checkFn = (pos) => pos.x < -0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      case 'F':
        axis.set(0, 0, 1);
        checkFn = (pos) => pos.z > 0.5;
        angle = isPrime ? Math.PI / 2 : -Math.PI / 2;
        break;
      case 'B':
        axis.set(0, 0, 1);
        checkFn = (pos) => pos.z < -0.5;
        angle = isPrime ? -Math.PI / 2 : Math.PI / 2;
        break;
      default:
        stateRef.current.animating = false;
        setIsRotating(false);
        return;
    }

    // Find all cubies in this slice
    const activeCubies = cubies.filter(c => checkFn(c.position));

    // Create a temporary pivot object
    const pivot = new THREE.Object3D();
    scene.add(pivot);

    activeCubies.forEach(c => {
      scene.remove(c);
      pivot.add(c);
    });

    const duration = 220; // ms
    const startTime = performance.now();

    const animateRotation = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      pivot.setRotationFromAxisAngle(axis, angle * eased);

      if (progress < 1) {
        requestAnimationFrame(animateRotation);
      } else {
        // Finalize rotation and re-attach to scene with updated transforms
        pivot.setRotationFromAxisAngle(axis, angle);
        pivot.updateMatrixWorld();

        activeCubies.forEach(c => {
          c.applyMatrix4(pivot.matrixWorld);
          // Snap position to integers to prevent floating-point drifts
          c.position.x = Math.round(c.position.x);
          c.position.y = Math.round(c.position.y);
          c.position.z = Math.round(c.position.z);
          pivot.remove(c);
          scene.add(c);
        });

        scene.remove(pivot);
        stateRef.current.animating = false;
        setIsRotating(false);

        // Process next queued move if any
        if (stateRef.current.queue.length > 0) {
          const next = stateRef.current.queue.shift();
          performMove(next, true);
        }
      }
    };

    requestAnimationFrame(animateRotation);
  };

  // Random Scramble (15 moves)
  const handleScramble = () => {
    const moves = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'"];
    for (let i = 0; i < 15; i++) {
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      performMove(randomMove, true);
    }
  };

  const movesList = [
    { label: 'U', isPrime: false }, { label: "U'", isPrime: true },
    { label: 'D', isPrime: false }, { label: "D'", isPrime: true },
    { label: 'L', isPrime: false }, { label: "L'", isPrime: true },
    { label: 'R', isPrime: false }, { label: "R'", isPrime: true },
    { label: 'F', isPrime: false }, { label: "F'", isPrime: true },
    { label: 'B', isPrime: false }, { label: "B'", isPrime: true }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', background: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e)' }}></span>
            Rubik AI Studio 3D
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Dùng chuột trái xoay góc nhìn | Chuột phải di chuyển | Cuộn chuột để zoom
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleScramble}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            🎲 Xáo Trộn (Scramble)
          </button>
        </div>
      </header>

      {/* 3D Canvas Mount */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} ref={mountRef}>
        {/* Floating move history */}
        {moveHistory.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '20px',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            fontSize: '0.85rem',
            color: '#cbd5e1'
          }}>
            <span style={{ color: '#64748b', marginRight: '6px' }}>Các bước vừa xoay:</span>
            <strong>{moveHistory.join(' ')}</strong>
          </div>
        )}
      </div>

      {/* Bottom Move Controls */}
      <footer style={{ padding: '16px 20px', background: '#0f172a', borderTop: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', maxWidth: '800px', margin: '0 auto' }}>
          {movesList.map(({ label }) => (
            <button
              key={label}
              onClick={() => performMove(label)}
              style={{
                minWidth: '50px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: label.includes("'") ? '#1e293b' : '#334155',
                color: '#f8fafc',
                fontSize: '1rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
