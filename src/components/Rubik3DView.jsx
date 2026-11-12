import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const PASTEL_COLOR_MAP = {
  white:   0xffffff,
  yellow:  0xfef08a,
  red:     0xfda4af,
  orange:  0xfdba74,
  green:   0x86efac,
  blue:    0x93c5fd,
  invalid: 0x475569
};

const DEFAULT_FACE_KEYS = {
  U: 'white',
  D: 'yellow',
  F: 'green',
  B: 'blue',
  R: 'red',
  L: 'orange'
};

const CORE_HEX = 0x090d16;

// Góc Euler chuẩn để xoay hướng từng mặt Rubik (U, D, F, B, L, R) trực diện ra trước camera
const FACE_EULER_ANGLES = {
  F: { x: 0, y: 0, z: 0 },
  R: { x: 0, y: -Math.PI / 2, z: 0 },
  B: { x: 0, y: Math.PI, z: 0 },
  L: { x: 0, y: Math.PI / 2, z: 0 },
  U: { x: Math.PI / 2, y: 0, z: 0 },
  D: { x: -Math.PI / 2, y: 0, z: 0 }
};

// Xoay ma trận mặt N×N theo chiều kim đồng hồ (clockwise) hoặc ngược chiều (ccw)
function rotateFaceMatrix(arr, dim, clockwise = true) {
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

// Tạo trạng thái 6 mặt ĐÃ XÁO TRỘN (Chưa giải) dựa trên chuỗi Scramble thực tế
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

export default function Rubik3DView({
  dim = 3,
  detectedColors = [],
  scannedFaces = null,
  scramble = '',
  lastMove = '',
  trackingBox = null,
  modelVerification = null,
  surfaceProfile = 'auto',
  activeFace = 'F',
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
  const activeFaceRef = useRef(activeFace);
  const lastValidFrontRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const cubeGroupRef = useRef(null);
  const controlsRef = useRef(null);
  const [spinMode, setSpinMode] = useState(autoSpin360);
  const spinModeRef = useRef(autoSpin360);

  // Tính toán trạng thái 6 mặt đã xáo trộn (chưa giải) làm nền mặc định cho Mô hình 3D
  const scrambledBaseline = useMemo(() => buildScrambledFaces(dim, scramble), [dim, scramble]);
  const scrambledBaselineRef = useRef(scrambledBaseline);
  useEffect(() => {
    scrambledBaselineRef.current = scrambledBaseline;
  }, [scrambledBaseline]);

  useEffect(() => {
    spinModeRef.current = spinMode;
  }, [spinMode]);

  useEffect(() => {
    trackingBoxRef.current = trackingBox;
  }, [trackingBox]);

  useEffect(() => {
    activeFaceRef.current = activeFace;
  }, [activeFace]);

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

    // 5. Build N×N×N Cubies with Surface-Aware Material (UV Gloss / Frosted Matte / Black-Border Carbon / Pastel)
    const isClassicBorder = surfaceProfile === 'classic';
    const isUvGloss = surfaceProfile === 'uv';
    const isFrosted = surfaceProfile === 'frosted';
    const isPastel = surfaceProfile === 'pastel';
    const activePalette = isPastel ? PASTEL_COLOR_MAP : COLOR_MAP;

    const cubieSize = 0.92;
    const stickerSize = isClassicBorder ? 0.72 : 0.84;
    const stickerDepth = 0.025;
    const stickerRoughness = isUvGloss ? 0.05 : isFrosted ? 0.45 : isPastel ? 0.35 : 0.16;
    const stickerMetalness = isUvGloss ? 0.12 : 0.04;
    const gap = 1.0;
    const offset = (dim - 1) / 2;

    const coreGeom = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);
    const coreMat = new THREE.MeshStandardMaterial({
      color: isClassicBorder ? 0x05070c : CORE_HEX,
      roughness: isClassicBorder ? 0.28 : 0.5,
      metalness: isClassicBorder ? 0.22 : 0.1
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
    const baseFaces = scrambledBaselineRef.current;

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

          const coreMesh = new THREE.Mesh(coreGeom, coreMat);
          cubieHolder.add(coreMesh);

          const rowFromTop = (dim - 1) - y;

          // Front Face (+Z) -> Direct AI Camera Recognition Face
          if (isFront) {
            const flatIdx = rowFromTop * dim + x;
            const detected = detectedColors[flatIdx];
            const fallbackKey = baseFaces?.F?.[flatIdx] || DEFAULT_FACE_KEYS.F;
            const initHex = (detected && detected !== 'invalid' && activePalette[detected])
              ? activePalette[detected]
              : activePalette[fallbackKey];
            const mat = new THREE.MeshStandardMaterial({
              color: initHex,
              roughness: stickerRoughness,
              metalness: stickerMetalness
            });
            const sMesh = new THREE.Mesh(stickerGeom, mat);
            sMesh.position.set(0, 0, halfCubie);
            cubieHolder.add(sMesh);
            matsByFace.F[flatIdx] = mat;
          }

          // Right Face (+X)
          if (isRight) {
            const flatIdx = rowFromTop * dim + ((dim - 1) - z);
            const fallbackKey = baseFaces?.R?.[flatIdx] || DEFAULT_FACE_KEYS.R;
            const mat = new THREE.MeshStandardMaterial({
              color: activePalette[fallbackKey],
              roughness: stickerRoughness,
              metalness: stickerMetalness
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
            const fallbackKey = baseFaces?.L?.[flatIdx] || DEFAULT_FACE_KEYS.L;
            const mat = new THREE.MeshStandardMaterial({
              color: activePalette[fallbackKey],
              roughness: stickerRoughness,
              metalness: stickerMetalness
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
            const fallbackKey = baseFaces?.U?.[flatIdx] || DEFAULT_FACE_KEYS.U;
            const mat = new THREE.MeshStandardMaterial({
              color: activePalette[fallbackKey],
              roughness: stickerRoughness,
              metalness: stickerMetalness
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
            const fallbackKey = baseFaces?.D?.[flatIdx] || DEFAULT_FACE_KEYS.D;
            const mat = new THREE.MeshStandardMaterial({
              color: activePalette[fallbackKey],
              roughness: stickerRoughness,
              metalness: stickerMetalness
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
            const fallbackKey = baseFaces?.B?.[flatIdx] || DEFAULT_FACE_KEYS.B;
            const mat = new THREE.MeshStandardMaterial({
              color: activePalette[fallbackKey],
              roughness: stickerRoughness,
              metalness: stickerMetalness
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

    // Glowing frame around the Front (+Z) AI-scanned face
    const frameSize = dim * gap + 0.06;
    const edgesGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(frameSize, frameSize));
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
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
          const curFace = activeFaceRef.current || 'F';
          const baseEuler = FACE_EULER_ANGLES[curFace] || FACE_EULER_ANGLES.F;
          const tb = trackingBoxRef.current;
          let offsetX = 0;
          let offsetY = 0;
          if (tb && tb.isLocked) {
            offsetX = ((tb.cxPct ?? 50) - 50) / 50;
            offsetY = ((tb.cyPct ?? 50) - 50) / 50;
          }

          // Xoay khối 3D tự động hướng mặt đang quét ra phía trước mắt + nghiêng bám đuổi theo vị trí tay di chuyển
          const targetRotY = baseEuler.y - offsetX * 0.42 + Math.sin(clock * 0.9) * 0.03;
          const targetRotX = baseEuler.x + offsetY * 0.32 + Math.cos(clock * 0.8) * 0.025;
          const targetRotZ = baseEuler.z;

          // Chuẩn hóa góc quay Y theo đường ngắn nhất (ngăn giật vòng 360 độ khi xoay giữa các mặt)
          let diffY = targetRotY - cubeGroupRef.current.rotation.y;
          while (diffY > Math.PI) diffY -= 2 * Math.PI;
          while (diffY < -Math.PI) diffY += 2 * Math.PI;

          cubeGroupRef.current.rotation.y += diffY * 0.14;
          cubeGroupRef.current.rotation.x += (targetRotX - cubeGroupRef.current.rotation.x) * 0.14;
          cubeGroupRef.current.rotation.z += (targetRotZ - cubeGroupRef.current.rotation.z) * 0.14;
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
  }, [dim, width, height, surfaceProfile]);

  // Real-time update of all 6 faces (cập nhật trực tiếp lên đúng mặt AI đang quét & xoay theo hướng)
  useEffect(() => {
    const mats = faceMaterialsRef.current;
    if (!mats || !mats.F) return;

    const activePalette = surfaceProfile === 'pastel' ? PASTEL_COLOR_MAP : COLOR_MAP;
    const baseFaces = scrambledBaselineRef.current;
    const validCount = detectedColors.filter((c) => c && c !== 'invalid').length;
    const curActiveFace = activeFace || 'F';

    ['U', 'D', 'F', 'B', 'L', 'R'].forEach((faceCode) => {
      const faceMats = mats[faceCode];
      if (!faceMats) return;

      if (faceCode === curActiveFace && validCount >= 2) {
        // Mặt AI đang nhận diện trực tiếp: cập nhật các ô màu thời gian thực
        detectedColors.forEach((colorKey, idx) => {
          const mat = faceMats[idx];
          if (!mat) return;
          const finalColor = (colorKey && colorKey !== 'invalid')
            ? colorKey
            : (scannedFaces?.[faceCode]?.[idx] || baseFaces?.[faceCode]?.[idx] || DEFAULT_FACE_KEYS[faceCode]);
          mat.color.setHex(activePalette[finalColor] || activePalette.invalid);
        });
      } else {
        // Các mặt khác: hiển thị màu đã lưu từ trước trong scannedFaces hoặc xáo trộn từ Scramble
        const scannedArr = scannedFaces?.[faceCode];
        const fallbackArr = baseFaces?.[faceCode] || [];
        faceMats.forEach((mat, idx) => {
          if (!mat) return;
          const scannedColor = scannedArr?.[idx];
          const colorKey = (scannedColor && scannedColor !== 'invalid')
            ? scannedColor
            : (fallbackArr[idx] || DEFAULT_FACE_KEYS[faceCode]);
          mat.color.setHex(activePalette[colorKey] || activePalette.invalid);
        });
      }
    });

    if (frontFrameMatRef.current) {
      if (modelVerification?.verified) {
        frontFrameMatRef.current.color.setHex(0x22c55e);
        frontFrameMatRef.current.opacity = 0.95;
      } else if (trackingBox?.isLocked) {
        frontFrameMatRef.current.color.setHex(0x38bdf8);
        frontFrameMatRef.current.opacity = 0.85;
      } else {
        frontFrameMatRef.current.color.setHex(0xf59e0b);
        frontFrameMatRef.current.opacity = 0.55;
      }
    }
  }, [detectedColors, scannedFaces, scramble, scrambledBaseline, dim, modelVerification, trackingBox, surfaceProfile, activeFace]);

  const scannedKeys = scannedFaces ? Object.keys(scannedFaces) : [];

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
            background: 'rgba(9, 15, 29, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            padding: '2px 6px',
            borderRadius: '6px',
            fontSize: '0.6rem',
            fontWeight: '700',
            color: '#38bdf8'
          }}
        >
          🧊 3D {dim}×{dim} ({scannedKeys.length}/6 mặt)
        </span>

        {modelVerification && (
          <span
            style={{
              background: modelVerification.verified
                ? 'rgba(20, 83, 45, 0.9)'
                : trackingBox?.isLocked
                  ? 'rgba(30, 58, 138, 0.9)'
                  : 'rgba(15, 23, 42, 0.85)',
              border: modelVerification.verified
                ? '1px solid #22c55e'
                : trackingBox?.isLocked
                  ? '1px solid #38bdf8'
                  : '1px solid #334155',
              padding: '2px 6px',
              borderRadius: '6px',
              fontSize: '0.58rem',
              fontWeight: '800',
              color: modelVerification.verified
                ? '#4ade80'
                : trackingBox?.isLocked
                  ? '#7dd3fc'
                  : '#cbd5e1'
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
              title="Bật/tắt tự động xoay 360 độ để xem cả 6 mặt chưa giải"
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
              fontSize: '0.58rem',
              color: '#94a3b8',
              background: 'rgba(2, 6, 23, 0.75)',
              padding: '2px 5px',
              borderRadius: '4px',
              pointerEvents: 'none'
            }}
          >
            6 mặt xáo trộn
          </span>
        </div>
      )}
    </div>
  );
}
