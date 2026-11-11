import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const COLOR_MAP = {
  white:   0xf8fafc,
  yellow:  0xfacc15,
  red:     0xef4444,
  orange:  0xf97316,
  green:   0x22c55e,
  blue:    0x3b82f6,
  invalid: 0x334155
};

const DEFAULT_FACES = {
  R: 0xef4444, // Right (+X) - Red
  L: 0xf97316, // Left (-X)  - Orange
  U: 0xf8fafc, // Top (+Y)   - White
  D: 0xfacc15, // Bottom (-Y)- Yellow
  F: 0x22c55e, // Front (+Z) - Green (Active AI Scan Face)
  B: 0x3b82f6, // Back (-Z)  - Blue
  CORE: 0x090d16 // Deep black plastic core for high sticker contrast
};

export default function Rubik3DView({
  dim = 3,
  detectedColors = [],
  scannedFaces = null,
  lastMove = '',
  trackingBox = null,
  modelVerification = null,
  width = 240,
  height = 185,
  autoSpin360 = false,
  showControls = true
}) {
  const mountRef = useRef(null);
  const faceMaterialsRef = useRef({
    F: [],
    R: [],
    L: [],
    U: [],
    D: [],
    B: []
  });
  const frontFrameMatRef = useRef(null);
  const trackingBoxRef = useRef(trackingBox);
  const lastValidFrontRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const cubeGroupRef = useRef(null);
  const controlsRef = useRef(null);
  const [spinMode, setSpinMode] = useState(autoSpin360);
  const spinModeRef = useRef(autoSpin360);

  useEffect(() => {
    spinModeRef.current = spinMode;
  }, [spinMode]);

  useEffect(() => {
    trackingBoxRef.current = trackingBox;
  }, [trackingBox]);

  // Reset camera to optimal front-top-right 3D angle for watching AI recognition
  const handleResetView = (e) => {
    if (e) e.stopPropagation();
    if (cameraRef.current && controlsRef.current && cubeGroupRef.current) {
      cameraRef.current.position.set(dim * 1.45, dim * 1.15, dim * 2.55);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      cubeGroupRef.current.rotation.set(0, 0, 0);
      setSpinMode(false);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    // Closer, clearer isometric angle prioritizing the Front (+Z) AI-scanned face
    camera.position.set(dim * 1.45, dim * 1.15, dim * 2.55);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = 'none';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. OrbitControls (Hỗ trợ cảm ứng 1 ngón xoay 360° & 2 ngón zoom trên Android/iOS)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.rotateSpeed = 0.95;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minDistance = dim * 1.6;
    controls.maxDistance = dim * 4.5;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };
    controlsRef.current = controls;

    // 3. High-Contrast Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.55);
    scene.add(ambientLight);

    const frontKeyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    frontKeyLight.position.set(6, 10, 14);
    scene.add(frontKeyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-10, -8, -10);
    scene.add(rimLight);

    // 4. Cube Group
    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);
    cubeGroupRef.current = cubeGroup;

    // 5. Build N×N×N Cubies with Black Core + Raised Colored Stickers
    const cubieSize = 0.92;
    const stickerSize = 0.82;
    const stickerDepth = 0.025;
    const gap = 1.0;
    const offset = (dim - 1) / 2;

    const coreGeom = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);
    const coreMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_FACES.CORE,
      roughness: 0.5,
      metalness: 0.1
    });

    const stickerGeom = new THREE.PlaneGeometry(stickerSize, stickerSize);

    const matsByFace = {
      F: Array(dim * dim).fill(null),
      R: Array(dim * dim).fill(null),
      L: Array(dim * dim).fill(null),
      U: Array(dim * dim).fill(null),
      D: Array(dim * dim).fill(null),
      B: Array(dim * dim).fill(null)
    };

    const halfCubie = cubieSize / 2 + stickerDepth;

    for (let x = 0; x < dim; x++) {
      for (let y = 0; y < dim; y++) {
        for (let z = 0; z < dim; z++) {
          const isRight  = x === dim - 1;
          const isLeft   = x === 0;
          const isTop    = y === dim - 1;
          const isBottom = y === 0;
          const isFront  = z === dim - 1;
          const isBack   = z === 0;

          if (!isRight && !isLeft && !isTop && !isBottom && !isFront && !isBack) {
            continue;
          }

          const cubieHolder = new THREE.Group();
          cubieHolder.position.set((x - offset) * gap, (y - offset) * gap, (z - offset) * gap);

          // Black plastic cubie body
          const coreMesh = new THREE.Mesh(coreGeom, coreMat);
          cubieHolder.add(coreMesh);

          const rowFromTop = (dim - 1) - y;

          // Front Face (+Z) -> Direct AI Camera Recognition Face
          if (isFront) {
            const flatIdx = rowFromTop * dim + x;
            const detected = detectedColors[flatIdx];
            const initHex = (detected && COLOR_MAP[detected]) ? COLOR_MAP[detected] : DEFAULT_FACES.F;
            const mat = new THREE.MeshStandardMaterial({
              color: initHex,
              roughness: 0.18,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(0, 0, halfCubie);
            cubieHolder.add(sMesh);
            matsByFace.F[flatIdx] = mat;
          }

          // Right Face (+X)
          if (isRight) {
            const flatIdx = rowFromTop * dim + ((dim - 1) - z);
            const mat = new THREE.MeshStandardMaterial({
              color: DEFAULT_FACES.R,
              roughness: 0.22,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(halfCubie, 0, 0);
            sMesh.rotation.y = Math.PI / 2;
            cubieHolder.add(sMesh);
            matsByFace.R[flatIdx] = mat;
          }

          // Left Face (-X)
          if (isLeft) {
            const flatIdx = rowFromTop * dim + z;
            const mat = new THREE.MeshStandardMaterial({
              color: DEFAULT_FACES.L,
              roughness: 0.22,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(-halfCubie, 0, 0);
            sMesh.rotation.y = -Math.PI / 2;
            cubieHolder.add(sMesh);
            matsByFace.L[flatIdx] = mat;
          }

          // Top Face (+Y)
          if (isTop) {
            const flatIdx = z * dim + x;
            const mat = new THREE.MeshStandardMaterial({
              color: DEFAULT_FACES.U,
              roughness: 0.22,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(0, halfCubie, 0);
            sMesh.rotation.x = -Math.PI / 2;
            cubieHolder.add(sMesh);
            matsByFace.U[flatIdx] = mat;
          }

          // Bottom Face (-Y)
          if (isBottom) {
            const flatIdx = ((dim - 1) - z) * dim + x;
            const mat = new THREE.MeshStandardMaterial({
              color: DEFAULT_FACES.D,
              roughness: 0.22,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(0, -halfCubie, 0);
            sMesh.rotation.x = Math.PI / 2;
            cubieHolder.add(sMesh);
            matsByFace.D[flatIdx] = mat;
          }

          // Back Face (-Z)
          if (isBack) {
            const flatIdx = rowFromTop * dim + ((dim - 1) - x);
            const mat = new THREE.MeshStandardMaterial({
              color: DEFAULT_FACES.B,
              roughness: 0.22,
              metalness: 0.04
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(0, 0, -halfCubie);
            sMesh.rotation.y = Math.PI;
            cubieHolder.add(sMesh);
            matsByFace.B[flatIdx] = mat;
          }

          cubeGroup.add(cubieHolder);
        }
      }
    }

    // Subtle glowing frame around the Front (+Z) AI-scanned face so user knows which side mirrors the camera
    const frameSize = dim * gap + 0.06;
    const edgesGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(frameSize, frameSize));
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    frontFrameMatRef.current = edgesMat;
    const frontFrame = new THREE.LineSegments(edgesGeom, edgesMat);
    frontFrame.position.set(0, 0, (dim * gap) / 2 + 0.04);
    cubeGroup.add(frontFrame);

    faceMaterialsRef.current = matsByFace;

    // 6. Animation Loop: Real-time 3D Motion Tracking & Gentle Oscillation
    let animId;
    let isDragging = false;
    let clock = 0;

    controls.addEventListener('start', () => { isDragging = true; });
    controls.addEventListener('end', () => { isDragging = false; });

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.02;

      if (!isDragging && cubeGroupRef.current) {
        if (spinModeRef.current) {
          cubeGroupRef.current.rotation.y += 0.008;
        } else {
          const tb = trackingBoxRef.current;
          if (tb && tb.isLocked) {
            // Bám theo góc nghiêng/di chuyển thực tế của khối Rubik trong khung hình camera
            const offsetX = ((tb.cxPct ?? 50) - 50) / 50; // -1 .. +1
            const offsetY = ((tb.cyPct ?? 50) - 50) / 50; // -1 .. +1
            const targetRotY = -offsetX * 0.48 + Math.sin(clock * 1.1) * 0.05;
            const targetRotX = offsetY * 0.35 + Math.cos(clock * 0.9) * 0.04;
            cubeGroupRef.current.rotation.y += (targetRotY - cubeGroupRef.current.rotation.y) * 0.18;
            cubeGroupRef.current.rotation.x += (targetRotX - cubeGroupRef.current.rotation.x) * 0.18;
          } else {
            // Gentle breathing motion keeping the AI-scanned Front face clearly oriented toward the viewer
            const targetRotY = Math.sin(clock * 0.8) * 0.12;
            const targetRotX = Math.cos(clock * 0.6) * 0.05;
            cubeGroupRef.current.rotation.y += (targetRotY - cubeGroupRef.current.rotation.y) * 0.1;
            cubeGroupRef.current.rotation.x += (targetRotX - cubeGroupRef.current.rotation.x) * 0.1;
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      coreGeom.dispose();
      stickerGeom.dispose();
      edgesGeom.dispose();
      if (container) container.innerHTML = '';
    };
  }, [dim, width, height]);

  // Real-time update of Front (+Z) stickers and stored 6-face colors (với cơ chế giữ màu khi khối đang di chuyển nhanh)
  useEffect(() => {
    const mats = faceMaterialsRef.current;
    if (!mats || !mats.F) return;

    const validCount = detectedColors.filter((c) => c && c !== 'invalid').length;
    const minKeep = Math.ceil(dim * dim * 0.55);

    if (validCount >= minKeep) {
      const merged = detectedColors.map((c, idx) => {
        if (c && c !== 'invalid') return c;
        return lastValidFrontRef.current?.[idx] || 'invalid';
      });
      lastValidFrontRef.current = merged;
      merged.forEach((colorKey, idx) => {
        const mat = mats.F[idx];
        if (mat) {
          mat.color.setHex(COLOR_MAP[colorKey] || DEFAULT_FACES.F);
        }
      });
    } else if (lastValidFrontRef.current && scannedFaces && Object.keys(scannedFaces).length > 0) {
      // Giữ nguyên mặt vừa bắt được trên mô hình 3D khi tay người chơi đang di chuyển nhanh giữa 2 vị trí
      lastValidFrontRef.current.forEach((colorKey, idx) => {
        const mat = mats.F[idx];
        if (mat) {
          mat.color.setHex(COLOR_MAP[colorKey] || DEFAULT_FACES.F);
        }
      });
    } else {
      detectedColors.forEach((colorKey, idx) => {
        const mat = mats.F[idx];
        if (mat) {
          mat.color.setHex(COLOR_MAP[colorKey] || DEFAULT_FACES.F);
        }
      });
    }

    if (frontFrameMatRef.current) {
      if (modelVerification?.verified) {
        frontFrameMatRef.current.color.setHex(0x22c55e);
        frontFrameMatRef.current.opacity = 0.95;
      } else if (trackingBox?.isLocked) {
        frontFrameMatRef.current.color.setHex(0x38bdf8);
        frontFrameMatRef.current.opacity = 0.85;
      } else {
        frontFrameMatRef.current.color.setHex(0x64748b);
        frontFrameMatRef.current.opacity = 0.45;
      }
    }

    if (scannedFaces) {
      if (Object.keys(scannedFaces).length === 0) {
        lastValidFrontRef.current = null;
      }
      ['R', 'L', 'U', 'D', 'B'].forEach((faceCode) => {
        const faceArr = scannedFaces[faceCode];
        if (Array.isArray(faceArr) && mats[faceCode]) {
          faceArr.forEach((colorKey, idx) => {
            const mat = mats[faceCode][idx];
            if (mat && COLOR_MAP[colorKey]) {
              mat.color.setHex(COLOR_MAP[colorKey]);
            }
          });
        }
      });
    }
  }, [detectedColors, scannedFaces, dim, modelVerification, trackingBox]);

  return (
    <div
      className="rubik-3d-interactive"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 45%, #111c34 0%, #050811 100%)',
        border: modelVerification?.verified
          ? '1.5px solid #22c55e'
          : trackingBox?.isLocked
            ? '1.5px solid #38bdf8'
            : '1px solid #1e293b',
        boxShadow: modelVerification?.verified
          ? 'inset 0 0 24px rgba(34, 197, 94, 0.16)'
          : 'inset 0 0 24px rgba(56, 189, 248, 0.08)',
        touchAction: 'none'
      }}
    >
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />

      {/* Top-Left Live Badge */}
      <div
        style={{
          position: 'absolute',
          top: '6px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          pointerEvents: 'none'
        }}
      >
        <span
          style={{
            background: 'rgba(9, 15, 29, 0.82)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '2px 6px',
            borderRadius: '6px',
            fontSize: '0.62rem',
            fontWeight: '700',
            color: '#38bdf8'
          }}
        >
          🧊 3D {dim}×{dim}
        </span>

        {modelVerification && (
          <span
            style={{
              background: modelVerification.verified
                ? 'rgba(20, 83, 45, 0.88)'
                : trackingBox?.isLocked
                  ? 'rgba(30, 58, 138, 0.88)'
                  : 'rgba(15, 23, 42, 0.82)',
              border: modelVerification.verified
                ? '1px solid #22c55e'
                : trackingBox?.isLocked
                  ? '1px solid #38bdf8'
                  : '1px solid #334155',
              padding: '2px 6px',
              borderRadius: '6px',
              fontSize: '0.6rem',
              fontWeight: '800',
              color: modelVerification.verified
                ? '#4ade80'
                : trackingBox?.isLocked
                  ? '#7dd3fc'
                  : '#94a3b8'
            }}
          >
            {modelVerification.badgeText}
          </span>
        )}
      </div>

      {/* Bottom Interactive Controls */}
      {showControls && (
        <div
          style={{
            position: 'absolute',
            bottom: '5px',
            left: '6px',
            right: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'auto'
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              onClick={handleResetView}
              title="Đặt lại góc nhìn trực diện mặt AI đang quét"
              style={{
                padding: '2px 7px',
                borderRadius: '5px',
                border: '1px solid #334155',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#e2e8f0',
                fontSize: '0.62rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              🎯 Góc AI
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSpinMode((s) => !s);
              }}
              title="Bật/tắt tự động xoay 360 độ"
              style={{
                padding: '2px 7px',
                borderRadius: '5px',
                border: spinMode ? '1px solid #38bdf8' : '1px solid #334155',
                background: spinMode ? 'rgba(37, 99, 235, 0.85)' : 'rgba(15, 23, 42, 0.85)',
                color: '#ffffff',
                fontSize: '0.62rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {spinMode ? '⏸ Dừng xoay' : '🔄 Xoay 360°'}
            </button>
          </div>

          <span
            style={{
              fontSize: '0.6rem',
              color: '#94a3b8',
              background: 'rgba(2, 6, 23, 0.7)',
              padding: '2px 5px',
              borderRadius: '4px',
              pointerEvents: 'none'
            }}
          >
            Kéo để xoay
          </span>
        </div>
      )}
    </div>
  );
}
