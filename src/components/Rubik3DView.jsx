import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const COLOR_MAP = {
  white:  0xffffff,
  yellow: 0xfacc15,
  red:    0xef4444,
  orange: 0xf97316,
  green:  0x22c55e,
  blue:   0x3b82f6,
  invalid:0x1e293b
};

const DEFAULT_FACES = {
  R: 0xef4444, // Right (+X)
  L: 0xf97316, // Left (-X)
  U: 0xffffff, // Top (+Y)
  D: 0xfacc15, // Bottom (-Y)
  F: 0x22c55e, // Front (+Z)
  B: 0x3b82f6, // Back (-Z)
  BLACK: 0x0f172a // Inner plastic
};

export default function Rubik3DView({ 
  dim = 3, 
  detectedColors = [], 
  lastMove = '',
  width = 160, 
  height = 120 
}) {
  const mountRef = useRef(null);
  const frontMaterialsRef = useRef([]);
  const sceneRef = useRef(null);
  const cubeGroupRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    // Position camera slightly angled from front-right-top
    camera.position.set(dim * 2.1, dim * 1.6, dim * 2.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false; // keep view stable in compact UI
    controls.minDistance = dim * 1.8;
    controls.maxDistance = dim * 5.5;
    controlsRef.current = controls;

    // 3. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight1.position.set(10, 15, 12);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.8);
    dirLight2.position.set(-10, -10, -10);
    scene.add(dirLight2);

    // 4. Cube Group
    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);
    cubeGroupRef.current = cubeGroup;

    // 5. Build N×N×N Cubies
    const cubieSize = 0.94;
    const gap = 1.0;
    const offset = (dim - 1) / 2;
    const geom = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);

    const frontMats = Array(dim * dim).fill(null);

    for (let x = 0; x < dim; x++) {
      for (let y = 0; y < dim; y++) {
        for (let z = 0; z < dim; z++) {
          // Check if this cubie is on an exterior surface
          const isRight  = x === dim - 1;
          const isLeft   = x === 0;
          const isTop    = y === dim - 1;
          const isBottom = y === 0;
          const isFront  = z === dim - 1;
          const isBack   = z === 0;

          // If inside and has no exterior face, skip rendering inner cubie
          if (!isRight && !isLeft && !isTop && !isBottom && !isFront && !isBack) {
            continue;
          }

          // Materials: [+X, -X, +Y, -Y, +Z, -Z]
          // Material 4 (+Z) is Front
          let frontMat;
          if (isFront) {
            const row = (dim - 1) - y;
            const col = x;
            const flatIdx = row * dim + col;
            const detected = detectedColors[flatIdx];
            const initialColor = (detected && COLOR_MAP[detected]) ? COLOR_MAP[detected] : DEFAULT_FACES.F;
            frontMat = new THREE.MeshStandardMaterial({
              color: initialColor,
              roughness: 0.15,
              metalness: 0.05
            });
            frontMats[flatIdx] = frontMat;
          } else {
            frontMat = new THREE.MeshStandardMaterial({ color: DEFAULT_FACES.BLACK, roughness: 0.4 });
          }

          const mats = [
            new THREE.MeshStandardMaterial({ color: isRight ? DEFAULT_FACES.R : DEFAULT_FACES.BLACK, roughness: 0.15, metalness: 0.05 }),
            new THREE.MeshStandardMaterial({ color: isLeft ? DEFAULT_FACES.L : DEFAULT_FACES.BLACK, roughness: 0.15, metalness: 0.05 }),
            new THREE.MeshStandardMaterial({ color: isTop ? DEFAULT_FACES.U : DEFAULT_FACES.BLACK, roughness: 0.15, metalness: 0.05 }),
            new THREE.MeshStandardMaterial({ color: isBottom ? DEFAULT_FACES.D : DEFAULT_FACES.BLACK, roughness: 0.15, metalness: 0.05 }),
            frontMat,
            new THREE.MeshStandardMaterial({ color: isBack ? DEFAULT_FACES.B : DEFAULT_FACES.BLACK, roughness: 0.15, metalness: 0.05 })
          ];

          const cubie = new THREE.Mesh(geom, mats);
          cubie.position.set((x - offset) * gap, (y - offset) * gap, (z - offset) * gap);
          cubeGroup.add(cubie);
        }
      }
    }

    frontMaterialsRef.current = frontMats;

    // 6. Animation loop with gentle idle rotation
    let animId;
    let isDragging = false;

    controls.addEventListener('start', () => { isDragging = true; });
    controls.addEventListener('end', () => { isDragging = false; });

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging && cubeGroupRef.current) {
        // Slow subtle breathing rotation so the user sees it's 3D
        cubeGroupRef.current.rotation.y += 0.003;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      geom.dispose();
      if (container) container.innerHTML = '';
    };
  }, [dim, width, height]);

  // Update front sticker materials in real-time when detectedColors changes
  useEffect(() => {
    if (!frontMaterialsRef.current) return;
    detectedColors.forEach((colorKey, idx) => {
      const mat = frontMaterialsRef.current[idx];
      if (mat) {
        const hex = COLOR_MAP[colorKey] || DEFAULT_FACES.F;
        mat.color.setHex(hex);
      }
    });
  }, [detectedColors]);

  return (
    <div style={{ position: 'relative', width, height, borderRadius: '8px', overflow: 'hidden', background: '#020617' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />
      <div style={{
        position: 'absolute',
        bottom: '2px',
        right: '4px',
        fontSize: '0.62rem',
        color: '#64748b',
        pointerEvents: 'none',
        background: 'rgba(2, 6, 23, 0.65)',
        padding: '1px 4px',
        borderRadius: '3px'
      }}>
        3D • Kéo xoay
      </div>
    </div>
  );
}
