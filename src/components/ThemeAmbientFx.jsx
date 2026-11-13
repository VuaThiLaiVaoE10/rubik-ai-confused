import React, { useEffect, useRef } from 'react';

/**
 * Vẽ 1 cánh hoa anh đào cong chuẩn (Bezier petal với khía chữ V ở đầu cánh)
 */
function drawSakuraPetal(ctx, size, colorA, colorB, pitch) {
  const scaleY = Math.max(0.22, Math.abs(Math.cos(pitch)));
  ctx.scale(1, scaleY);
  const grad = ctx.createLinearGradient(0, -size, 0, size);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(0, size * 0.85);
  ctx.bezierCurveTo(-size * 0.95, size * 0.35, -size * 0.85, -size * 0.65, -size * 0.22, -size * 0.9);
  ctx.lineTo(0, -size * 0.65); // khía chữ V đặc trưng của cánh hoa anh đào
  ctx.lineTo(size * 0.22, -size * 0.9);
  ctx.bezierCurveTo(size * 0.85, -size * 0.65, size * 0.95, size * 0.35, 0, size * 0.85);
  ctx.closePath();
  ctx.fill();
}

/**
 * Vẽ tinh thể tuyết lục giác sắc nét (6-fold Dendrite Crystal)
 */
function drawCrystalSnowflake(ctx, radius, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, radius * 0.14);
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cos * radius, sin * radius);
    // Nhánh phụ chữ V ở 60% chiều dài nhánh
    const bx = cos * radius * 0.58;
    const by = sin * radius * 0.58;
    const bLen = radius * 0.32;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(ang + 0.65) * bLen, by + Math.sin(ang + 0.65) * bLen);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(ang - 0.65) * bLen, by + Math.sin(ang - 0.65) * bLen);
    ctx.stroke();
  }
}

/**
 * Vẽ chú nhện Cyber cơ khí 8 chân khớp động ngay trên Canvas
 */
function drawCyberMechSpider(ctx, x, y, time, scale = 1, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // Sợi tơ nối lên đỉnh màn hình
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(0, -240);
  ctx.stroke();

  // 8 chân cơ khí co duỗi nhịp nhàng
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  for (let side of [-1, 1]) {
    for (let leg = 0; leg < 4; leg++) {
      const phase = time * 4 + leg * 0.9 + (side > 0 ? 0 : Math.PI);
      const wave = Math.sin(phase) * 3.5;
      const baseAngle = (-0.7 + leg * 0.48) * side;
      const jx = Math.sin(baseAngle) * 14 * side + side * 6;
      const jy = -8 + leg * 5 + wave * 0.4;
      const ex = jx + side * 11;
      const ey = jy + (leg - 1.5) * 6 + wave;
      ctx.beginPath();
      ctx.moveTo(side * 4, -2 + leg * 2);
      ctx.lineTo(jx, jy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Khớp neon xanh lá ở đầu chân
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Thân & lõi phản ứng Cyber
  ctx.fillStyle = '#071629';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, -3, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Lõi năng lượng & cặp mắt phát sáng
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(0, -3, 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(-2.2, 10.5, 1.3, 0, Math.PI * 2);
  ctx.arc(2.2, 10.5, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Tạo đường sét Fractal đệ quy thành mảng điểm (vẽ mượt + phân nhánh nhanh ở 60 FPS)
 */
function buildLightningPath(x1, y1, x2, y2, displace, out = []) {
  if (displace < 6) {
    out.push([x1, y1, x2, y2]);
    return out;
  }
  const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displace;
  const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displace * 0.35;
  buildLightningPath(x1, y1, midX, midY, displace * 0.54, out);
  buildLightningPath(midX, midY, x2, y2, displace * 0.54, out);
  return out;
}

/**
 * Vẽ ngôi sao 4 cánh lấp lánh sắc nét (Dải Ngân Hà)
 */
function drawStarGlint(ctx, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 1.45);
  ctx.quadraticCurveTo(radius * 0.22, -radius * 0.22, radius * 1.45, 0);
  ctx.quadraticCurveTo(radius * 0.22, radius * 0.22, 0, radius * 1.45);
  ctx.quadraticCurveTo(-radius * 0.22, radius * 0.22, -radius * 1.45, 0);
  ctx.quadraticCurveTo(-radius * 0.22, -radius * 0.22, 0, -radius * 1.45);
  ctx.closePath();
  ctx.fill();
}

/**
 * Vẽ ngọn lửa giọt nước uốn lượn (Hỏa Ngục Phượng Hoàng)
 */
function drawFlameTongue(ctx, size, tilt, colorOuter, colorInner) {
  ctx.save();
  ctx.rotate(tilt);
  ctx.fillStyle = colorOuter;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.6);
  ctx.bezierCurveTo(size * 0.9, -size * 0.4, size * 0.85, size * 0.9, 0, size * 1.1);
  ctx.bezierCurveTo(-size * 0.85, size * 0.9, -size * 0.9, -size * 0.4, 0, -size * 1.6);
  ctx.fill();

  ctx.fillStyle = colorInner;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85);
  ctx.bezierCurveTo(size * 0.42, -size * 0.1, size * 0.42, size * 0.55, 0, size * 0.72);
  ctx.bezierCurveTo(-size * 0.42, size * 0.55, -size * 0.42, -size * 0.1, 0, -size * 0.85);
  ctx.fill();
  ctx.restore();
}

/**
 * Vẽ lăng kính pha lê lục giác 3D phản chiếu ánh sáng (Băng Giá Pha Lê)
 */
function drawIcePrism(ctx, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const r = i % 2 === 0 ? size : size * 0.72;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(-size, -size, size, size);
  grad.addColorStop(0, 'rgba(224, 242, 254, 0.55)');
  grad.addColorStop(0.5, 'rgba(125, 211, 252, 0.25)');
  grad.addColorStop(1, 'rgba(56, 189, 248, 0.12)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Đường chéo giác cắt kim cương bên trong
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.72);
  ctx.lineTo(size * 0.5, size * 0.5);
  ctx.moveTo(-size * 0.75, 0);
  ctx.lineTo(size * 0.75, 0);
  ctx.stroke();
}

/**
 * Vẽ mảnh pha lê băng sắc nhọn bay vỡ (click vỡ băng)
 */
function drawIceShard(ctx, size, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.4);
  ctx.lineTo(size * 0.55, 0);
  ctx.lineTo(0, size * 1.0);
  ctx.lineTo(-size * 0.45, size * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * Vẽ vân rạn tinh thể băng thanh mảnh ở 4 góc màn hình (không che header)
 */
function drawCornerFrost(ctx, w, h, time) {
  const pulse = 0.2 + 0.08 * Math.sin(time * 1.4);
  const corners = [
    { x: 0, y: 0, sx: 1, sy: 1 },
    { x: w, y: 0, sx: -1, sy: 1 },
    { x: 0, y: h, sx: 1, sy: -1 },
    { x: w, y: h, sx: -1, sy: -1 }
  ];
  ctx.save();
  ctx.strokeStyle = `rgba(186, 230, 253, ${pulse})`;
  ctx.lineCap = 'round';
  for (const c of corners) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.sx, c.sy);
    const rays = [
      { ang: 0.24, len: 88 },
      { ang: 0.62, len: 112 },
      { ang: 1.05, len: 82 }
    ];
    for (const r of rays) {
      const ex = Math.cos(r.ang) * r.len;
      const ey = Math.sin(r.ang) * r.len;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      for (const frac of [0.4, 0.72]) {
        const bx = ex * frac;
        const by = ey * frac;
        const sub = r.len * 0.24 * (1.2 - frac);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(r.ang + 0.52) * sub, by + Math.sin(r.ang + 0.52) * sub);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(r.ang - 0.52) * sub, by + Math.sin(r.ang - 0.52) * sub);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function strokeSegments(ctx, segments, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < segments.length; i++) {
    const [x1, y1, x2, y2] = segments[i];
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

const ThemeAmbientFx = React.memo(function ThemeAmbientFx({ isFxEnabled, hudThemeKey }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isFxEnabled || hudThemeKey === 'off') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
    const mem = typeof navigator !== 'undefined' ? (navigator.deviceMemory || 8) : 8;
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLowSpecFx = cores <= 4 || mem <= 4 || prefersReducedMotion;

    let animId = 0;
    let lastRenderTs = 0;
    const maxDpr = isLowSpecFx ? 1 : 1.5;
    let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const MAX_PARTICLES = isLowSpecFx ? 48 : 96;
    const MAX_BOLTS = isLowSpecFx ? 2 : 4;
    const MAX_METEORS = isLowSpecFx ? 3 : 5;
    const MAX_SHOCKWAVES = isLowSpecFx ? 2 : 4;
    const MAX_CRACKS = isLowSpecFx ? 24 : 48;
    const CLICK_COOLDOWN_MS = 180;
    const MOVE_COOLDOWN_MS = 28;
    let lastClickBurstTs = 0;
    let lastMoveSpawnTs = 0;

    const pushParticle = (item) => {
      if (particles.length >= MAX_PARTICLES) {
        particles.shift();
      }
      particles.push(item);
    };

    const pointer = {
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
      lastX: -9999,
      lastY: -9999,
      active: false,
      down: false
    };

    const particles = [];
    const trailPoints = [];
    const bolts = [];
    const shockwaves = [];
    const dataPackets = [];

    // Khởi tạo đối tượng nền theo từng Theme
    const ambient = [];
    if (hudThemeKey === 'sakura') {
      for (let i = 0; i < 28; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: 0.4 + Math.random() * 0.8,
          vy: 0.65 + Math.random() * 1.15,
          size: 5 + Math.random() * 7.5,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.04,
          pitch: Math.random() * Math.PI * 2,
          pitchSpeed: 0.02 + Math.random() * 0.035,
          swayPhase: Math.random() * Math.PI * 2,
          cA: i % 3 === 0 ? '#fff1f2' : '#fbcfe8',
          cB: i % 2 === 0 ? '#f472b6' : '#fb7185',
          alpha: 0.45 + Math.random() * 0.45
        });
      }
    } else if (hudThemeKey === 'cyber') {
      const nodeCount = Math.min(42, Math.max(24, Math.floor((width * height) / 36000)));
      for (let i = 0; i < nodeCount; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          ox: 0,
          oy: 0,
          vx: (Math.random() - 0.5) * 0.75,
          vy: (Math.random() - 0.5) * 0.75,
          r: 1.8 + Math.random() * 2.2,
          pulse: Math.random() * Math.PI * 2
        });
      }
      for (let i = 0; i < 12; i++) {
        dataPackets.push({
          a: Math.floor(Math.random() * nodeCount),
          b: Math.floor(Math.random() * nodeCount),
          t: Math.random(),
          speed: 0.015 + Math.random() * 0.02
        });
      }
    } else if (hudThemeKey === 'frost') {
      // Lăng kính kim cương lơ lửng chậm rãi trong không trung (không rơi dọc như hoa đào)
      for (let i = 0; i < 18; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          size: 7 + Math.random() * 11,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.015,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.36 + Math.random() * 0.38
        });
      }
    } else if (hudThemeKey === 'galaxy') {
      const palette = ['#c084fc', '#818cf8', '#38bdf8', '#f472b6', '#ffffff'];
      for (let i = 0; i < 46; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 2.2 + Math.random() * 4.4,
          rot: Math.random() * Math.PI,
          phase: Math.random() * Math.PI * 2,
          twinkle: 1.5 + Math.random() * 2.5,
          color: palette[i % palette.length],
          depth: 0.4 + Math.random() * 0.9
        });
      }
    } else if (hudThemeKey === 'inferno') {
      const outer = ['#ef4444', '#f97316', '#ea580c'];
      for (let i = 0; i < 30; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.65,
          vy: -(1.2 + Math.random() * 2.4),
          size: 4 + Math.random() * 6.5,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.48 + Math.random() * 0.42,
          cOuter: outer[i % outer.length],
          cInner: i % 2 === 0 ? '#fef08a' : '#fdba74'
        });
      }
    } else if (hudThemeKey === 'matrix') {
      const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノHEX9';
      const cols = Math.max(36, Math.ceil(width / 24));
      for (let i = 0; i < cols; i++) {
        ambient.push({
          colIndex: i,
          y: Math.random() * height,
          speed: 2.4 + Math.random() * 3.8,
          len: 8 + Math.floor(Math.random() * 12),
          glyphSeed: Math.floor(Math.random() * chars.length),
          chars
        });
      }
    } else if (hudThemeKey === 'aurora') {
      // Các cột tia cực quang dựng đứng uốn lượn toàn màn hình (không dùng hạt tròn)
      const curtainColors = ['#34d399', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6'];
      for (let i = 0; i < 16; i++) {
        ambient.push({
          xRatio: (i + 0.5) / 16,
          width: 48 + Math.random() * 65,
          heightRatio: 0.52 + Math.random() * 0.34,
          phase: i * 0.55,
          speed: 0.6 + Math.random() * 0.8,
          color: curtainColors[i % curtainColors.length]
        });
      }
    }

    const meteors = [];
    const auroraFlashes = [];
    const matrixScans = [];
    const iceCracks = [];

    const spawnStormBolt = (targetX, targetY, isBig = false) => {
      const startX = targetX + (Math.random() - 0.5) * (isBig ? 180 : 240);
      const mainSegs = buildLightningPath(startX, -10, targetX, targetY, isBig ? 95 : 70);
      const branches = [];
      const branchCount = isBig ? 4 : 2;
      for (let b = 0; b < branchCount; b++) {
        if (mainSegs.length > 4) {
          const pick = mainSegs[Math.floor(Math.random() * (mainSegs.length - 2))];
          const bx2 = pick[0] + (Math.random() - 0.5) * 160;
          const by2 = pick[1] + 70 + Math.random() * 140;
          branches.push(buildLightningPath(pick[0], pick[1], bx2, by2, 42));
        }
      }
      if (bolts.length >= MAX_BOLTS) bolts.shift();
      bolts.push({
        mainSegs,
        branches,
        alpha: 1,
        decay: isBig ? 0.042 : 0.06,
        flashAlpha: isBig ? 0.22 : 0.1
      });
      if (shockwaves.length >= MAX_SHOCKWAVES) shockwaves.shift();
      shockwaves.push({
        x: targetX,
        y: targetY,
        r: 4,
        maxR: isBig ? 140 : 75,
        alpha: 1,
        color: '#facc15',
        color2: '#c084fc'
      });
      const sparkCount = isBig ? 14 : 8;
      for (let i = 0; i < sparkCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * (isBig ? 7 : 4.5);
        pushParticle({
          x: targetX,
          y: targetY,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.2,
          size: 1.5 + Math.random() * 2.5,
          alpha: 1,
          gravity: 0.16,
          color: i % 2 === 0 ? '#fef08a' : '#c084fc',
          kind: 'spark'
        });
      }
    };

    const onPointerMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      pointer.vx = pointer.active ? x - pointer.x : 0;
      pointer.vy = pointer.active ? y - pointer.y : 0;
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;

      trailPoints.push({ x, y, life: 1 });
      if (trailPoints.length > 22) trailPoints.shift();

      const nowTs = performance.now();
      const dist = Math.hypot(x - pointer.lastX, y - pointer.lastY);
      if (dist >= 22 && nowTs - lastMoveSpawnTs >= MOVE_COOLDOWN_MS) {
        lastMoveSpawnTs = nowTs;
        pointer.lastX = x;
        pointer.lastY = y;
        if (particles.length < MAX_PARTICLES - 12) {
          if (hudThemeKey === 'sakura') {
            pushParticle({
              x,
              y,
              vx: pointer.vx * 0.15 + (Math.random() - 0.5) * 1.4,
              vy: pointer.vy * 0.15 + 0.5 + Math.random(),
              size: 5 + Math.random() * 5,
              rot: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.1,
              pitch: Math.random() * Math.PI,
              pitchSpeed: 0.06,
              alpha: 0.95,
              cA: '#fff1f2',
              cB: '#f472b6',
              kind: 'petal'
            });
          } else if (hudThemeKey === 'frost') {
            const ang = Math.atan2(pointer.vy, pointer.vx) + (Math.random() - 0.5) * 1.4;
            const len = 14 + Math.random() * 24;
            if (iceCracks.length >= MAX_CRACKS) iceCracks.shift();
            iceCracks.push({
              x1: x,
              y1: y,
              x2: x + Math.cos(ang) * len,
              y2: y + Math.sin(ang) * len,
              alpha: 0.85
            });
          } else if (hudThemeKey === 'thunder') {
            pushParticle({
              x,
              y,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              size: 1.5 + Math.random() * 2,
              alpha: 1,
              gravity: 0.08,
              color: Math.random() > 0.4 ? '#facc15' : '#c084fc',
              kind: 'spark'
            });
          } else if (hudThemeKey === 'galaxy') {
            const c = Math.random() > 0.5 ? '#c084fc' : '#38bdf8';
            pushParticle({
              x: x + (Math.random() - 0.5) * 10,
              y: y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 1.4,
              vy: (Math.random() - 0.5) * 1.4,
              size: 3 + Math.random() * 4.5,
              rot: Math.random() * Math.PI,
              rotSpeed: (Math.random() - 0.5) * 0.08,
              alpha: 0.95,
              color: c,
              kind: 'star'
            });
          } else if (hudThemeKey === 'inferno') {
            pushParticle({
              x: x + (Math.random() - 0.5) * 12,
              y: y + (Math.random() - 0.5) * 6,
              vx: (Math.random() - 0.5) * 1.4,
              vy: -1.8 - Math.random() * 2.2,
              size: 4 + Math.random() * 4.5,
              tilt: (Math.random() - 0.5) * 0.35,
              alpha: 1,
              cOuter: Math.random() > 0.4 ? '#f97316' : '#ef4444',
              cInner: '#fef08a',
              kind: 'flame'
            });
          } else if (hudThemeKey === 'matrix') {
            const codeChars = '01ABCDEFアイウネシ';
            pushParticle({
              x: x + (Math.random() - 0.5) * 14,
              y: y + (Math.random() - 0.5) * 8,
              vx: (Math.random() - 0.5) * 0.9,
              vy: 1.6 + Math.random() * 2.4,
              size: 13,
              char: codeChars[Math.floor(Math.random() * codeChars.length)],
              alpha: 0.95,
              color: Math.random() > 0.3 ? '#4ade80' : '#ffffff',
              kind: 'glyph'
            });
          }
          // Aurora sử dụng dải lụa quang phổ (trailPoints) trong render thay vì hạt tròn
        }
      }
    };

    const onPointerDown = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      pointer.down = true;

      // Chống spam click liên tục gây lag/giật Web
      const nowTs = performance.now();
      if (nowTs - lastClickBurstTs < CLICK_COOLDOWN_MS) {
        return;
      }
      lastClickBurstTs = nowTs;

      if (hudThemeKey === 'sakura') {
        for (let i = 0; i < 16; i++) {
          const ang = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.25;
          const spd = 2.2 + Math.random() * 4.8;
          pushParticle({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 0.9,
            size: 5.5 + Math.random() * 6,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.14,
            pitch: Math.random() * Math.PI,
            pitchSpeed: 0.08,
            alpha: 1,
            cA: '#fff1f2',
            cB: i % 2 === 0 ? '#f472b6' : '#fb7185',
            kind: 'petal'
          });
        }
      } else if (hudThemeKey === 'cyber') {
        if (shockwaves.length >= MAX_SHOCKWAVES) shockwaves.shift();
        shockwaves.push({ x, y, r: 8, maxR: 185, alpha: 1, color: '#38bdf8', color2: '#22c55e' });
        for (const n of ambient) {
          const dx = n.x - x;
          const dy = n.y - y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < 220) {
            const impulse = (220 - d) / 26;
            n.vx = Math.max(-14, Math.min(14, n.vx + (dx / d) * impulse));
            n.vy = Math.max(-14, Math.min(14, n.vy + (dy / d) * impulse));
          }
        }
      } else if (hudThemeKey === 'thunder') {
        spawnStormBolt(x, y, true);
      } else if (hudThemeKey === 'frost') {
        // Vỡ mảnh băng pha lê 3D + rạn kính phân nhánh (không dùng sóng tròn hay bông tuyết)
        for (let branch = 0; branch < 6; branch++) {
          const ang = (Math.PI * 2 * branch) / 6 + (Math.random() - 0.5) * 0.45;
          const len1 = 26 + Math.random() * 28;
          const mx = x + Math.cos(ang) * len1;
          const my = y + Math.sin(ang) * len1;
          if (iceCracks.length >= MAX_CRACKS) iceCracks.shift();
          iceCracks.push({ x1: x, y1: y, x2: mx, y2: my, alpha: 1 });
          const ang2 = ang + (Math.random() > 0.5 ? 0.5 : -0.5);
          const len2 = 16 + Math.random() * 20;
          if (iceCracks.length >= MAX_CRACKS) iceCracks.shift();
          iceCracks.push({ x1: mx, y1: my, x2: mx + Math.cos(ang2) * len2, y2: my + Math.sin(ang2) * len2, alpha: 0.92 });
        }
        for (let i = 0; i < 14; i++) {
          const ang = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.25;
          const spd = 2.6 + Math.random() * 4.8;
          pushParticle({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 5 + Math.random() * 6.5,
            rot: ang,
            rotSpeed: (Math.random() - 0.5) * 0.16,
            alpha: 1,
            color: i % 2 === 0 ? 'rgba(186, 230, 253, 0.85)' : 'rgba(255, 255, 255, 0.78)',
            kind: 'iceShard'
          });
        }
      } else if (hudThemeKey === 'galaxy') {
        if (meteors.length >= MAX_METEORS) meteors.shift();
        meteors.push({ x: Math.max(0, x - 260), y: Math.max(0, y - 160), vx: 13.5, vy: 8.5, len: 135, alpha: 1, color: '#e9d5ff' });
        if (meteors.length >= MAX_METEORS) meteors.shift();
        meteors.push({ x: Math.min(width, x + 260), y: Math.max(0, y - 140), vx: -12.5, vy: 8, len: 115, alpha: 1, color: '#38bdf8' });
        for (let i = 0; i < 14; i++) {
          const ang = (Math.PI * 2 * i) / 14;
          const spd = 2.2 + Math.random() * 4.2;
          pushParticle({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3.8 + Math.random() * 5.2,
            rot: ang,
            rotSpeed: 0.12,
            alpha: 1,
            color: i % 3 === 0 ? '#f472b6' : (i % 2 === 0 ? '#a78bfa' : '#38bdf8'),
            kind: 'star'
          });
        }
      } else if (hudThemeKey === 'inferno') {
        for (let i = 0; i < 16; i++) {
          const spread = (Math.random() - 0.5) * 6.5;
          pushParticle({
            x: x + (Math.random() - 0.5) * 26,
            y,
            vx: spread,
            vy: -(2.8 + Math.random() * 5.4),
            size: 5.5 + Math.random() * 7.5,
            tilt: spread * 0.08,
            alpha: 1,
            cOuter: i % 2 === 0 ? '#f97316' : '#ef4444',
            cInner: '#fef08a',
            kind: 'flame'
          });
        }
      } else if (hudThemeKey === 'matrix') {
        if (matrixScans.length >= 3) matrixScans.shift();
        matrixScans.push({ x, y, life: 1 });
        for (const d of ambient) {
          const colX = d.colIndex * 24 + 12;
          if (Math.abs(colX - x) < 110) {
            d.y = y;
            d.speed = 6.8;
          }
        }
        const burstChars = '01X9Fアイウカキ';
        for (let i = 0; i < 14; i++) {
          const ang = (Math.PI * 2 * i) / 14;
          const spd = 2.2 + Math.random() * 3.8;
          pushParticle({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 14,
            char: burstChars[i % burstChars.length],
            alpha: 1,
            color: i % 2 === 0 ? '#4ade80' : '#ffffff',
            kind: 'glyph'
          });
        }
      } else if (hudThemeKey === 'aurora') {
        if (auroraFlashes.length >= 3) auroraFlashes.shift();
        auroraFlashes.push({ x, spread: 12, maxSpread: 260, alpha: 0.95 });
      }
    };

    const onPointerUp = () => {
      pointer.down = false;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    let startTs = performance.now();
    let nextAutoBoltTs = startTs + 1600;

    let isDisposed = false;
    const render = (now) => {
      if (isDisposed || document.hidden) {
        animId = null;
        return;
      }
      if (isLowSpecFx && now - lastRenderTs < 32) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastRenderTs = now;
      const time = (now - startTs) * 0.001;
      ctx.clearRect(0, 0, width, height);

      // ---------------------------------------------------------
      // THEME 1: SAKURA (Cánh hoa 3D lật gió + dải lụa con trỏ)
      // ---------------------------------------------------------
      if (hudThemeKey === 'sakura') {
        // Dải lụa gió hồng theo đường chuột
        if (trailPoints.length >= 2) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i < trailPoints.length; i++) {
            const p0 = trailPoints[i - 1];
            const p1 = trailPoints[i];
            ctx.strokeStyle = `rgba(244, 114, 182, ${p1.life * 0.35})`;
            ctx.lineWidth = p1.life * 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
          ctx.restore();
        }

        for (const p of ambient) {
          const windX = Math.sin(time * 0.7 + p.swayPhase) * 0.45;
          p.x += p.vx + windX;
          p.y += p.vy;
          p.rot += p.rotSpeed;
          p.pitch += p.pitchSpeed;

          // Tương tác lốc gió quanh con trỏ
          if (pointer.active) {
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 140) {
              const force = ((140 - d) / 140) * 0.85;
              // Đẩy xoay xoáy (tangential + radial)
              p.vx += (dx / d) * force * 0.55 - (dy / d) * force * 0.45;
              p.vy += (dy / d) * force * 0.45 + (dx / d) * force * 0.35;
              p.rotSpeed += 0.015;
            }
          }

          p.vx = p.vx * 0.98 + 0.012;
          p.vy = p.vy * 0.98 + 0.022;
          p.rotSpeed *= 0.99;

          if (p.x > width + 25) p.x = -25;
          if (p.x < -25) p.x = width + 25;
          if (p.y > height + 25) {
            p.y = -25;
            p.x = Math.random() * width;
          }

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawSakuraPetal(ctx, p.size, p.cA, p.cB, p.pitch);
          ctx.restore();
        }
      }

      // ---------------------------------------------------------
      // THEME 2: CYBER SPIDER (Mạng nhện đàn hồi + Nhện cơ khí)
      // ---------------------------------------------------------
      if (hudThemeKey === 'cyber') {
        const linkDist = 145;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < ambient.length; i++) {
          const n = ambient[i];
          n.pulse += 0.04;

          if (pointer.active) {
            const dx = n.x - pointer.x;
            const dy = n.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < 175) {
              const ratio = 1 - d / 175;
              ctx.strokeStyle = `rgba(56, 189, 248, ${ratio * 0.8})`;
              ctx.lineWidth = 0.8 + ratio * 1.4;
              ctx.beginPath();
              ctx.moveTo(pointer.x, pointer.y);
              ctx.lineTo(n.x, n.y);
              ctx.stroke();

              // Kéo nhẹ nút mạng hướng về con trỏ như tơ nhện dính
              if (d > 35) {
                n.vx -= (dx / d) * ratio * 0.04;
                n.vy -= (dy / d) * ratio * 0.04;
              }
            }
          }

          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.992;
          n.vy *= 0.992;
          if (Math.hypot(n.vx, n.vy) < 0.28) {
            n.vx += (Math.random() - 0.5) * 0.06;
            n.vy += (Math.random() - 0.5) * 0.06;
          }
          if (n.x < 0) { n.x = 0; n.vx *= -1; }
          if (n.x > width) { n.x = width; n.vx *= -1; }
          if (n.y < 0) { n.y = 0; n.vy *= -1; }
          if (n.y > height) { n.y = height; n.vy *= -1; }

          for (let j = i + 1; j < ambient.length; j++) {
            const m = ambient[j];
            const dist = Math.hypot(n.x - m.x, n.y - m.y);
            if (dist < linkDist) {
              const alpha = (1 - dist / linkDist) * 0.42;
              ctx.strokeStyle = (i + j) % 3 === 0 ? `rgba(34, 197, 94, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(m.x, m.y);
              ctx.stroke();
            }
          }

          // Vẽ nút mạng phát sáng
          const glowR = n.r + Math.sin(n.pulse) * 0.6;
          ctx.fillStyle = i % 3 === 0 ? '#22c55e' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(n.x, n.y, Math.max(1, glowR), 0, Math.PI * 2);
          ctx.fill();
        }

        // Gói tín hiệu năng lượng chạy dọc các sợi tơ
        for (const pkt of dataPackets) {
          const a = ambient[pkt.a];
          const b = ambient[pkt.b];
          if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < linkDist * 1.35) {
            pkt.t += pkt.speed;
            if (pkt.t >= 1) {
              pkt.t = 0;
              pkt.a = pkt.b;
              pkt.b = Math.floor(Math.random() * ambient.length);
            }
            const px = a.x + (b.x - a.x) * pkt.t;
            const py = a.y + (b.y - a.y) * pkt.t;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            pkt.a = Math.floor(Math.random() * ambient.length);
            pkt.b = Math.floor(Math.random() * ambient.length);
          }
        }

        // Con trỏ Cyber Orb
        if (pointer.active) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 12 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // 2 chú nhện cơ khí đu tơ & bò chân linh hoạt
        const spider1Y = 95 + Math.sin(time * 0.65) * 48;
        const spider1Ang = Math.sin(time * 0.9) * 0.14;
        drawCyberMechSpider(ctx, width * 0.87, spider1Y, time, 1.05, spider1Ang);

        const spider2Y = 62 + Math.cos(time * 0.5) * 36;
        const spider2Ang = Math.cos(time * 0.8) * 0.12;
        drawCyberMechSpider(ctx, width * 0.11, spider2Y, time + 2, 0.8, spider2Ang);
      }

      // ---------------------------------------------------------
      // THEME 3: THUNDER (Sét Plasma tự động + Tesla Orb theo chuột)
      // ---------------------------------------------------------
      if (hudThemeKey === 'thunder') {
        if (now >= nextAutoBoltTs) {
          nextAutoBoltTs = now + 1800 + Math.random() * 2600;
          const rx = width * (0.12 + Math.random() * 0.76);
          const ry = height * (0.35 + Math.random() * 0.5);
          spawnStormBolt(rx, ry, Math.random() > 0.65);
        }

        // Quả cầu từ trường + hồ quang nhảy múa theo chuột
        if (pointer.active) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const grad = ctx.createRadialGradient(pointer.x, pointer.y, 2, pointer.x, pointer.y, 44);
          grad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
          grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.22)');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 44, 0, Math.PI * 2);
          ctx.fill();

          // 3 tia hồ quang lách tách quanh con trỏ
          if (Math.random() > 0.25) {
            for (let a = 0; a < 2; a++) {
              const ang = Math.random() * Math.PI * 2;
              const len = 28 + Math.random() * 34;
              const segs = buildLightningPath(
                pointer.x,
                pointer.y,
                pointer.x + Math.cos(ang) * len,
                pointer.y + Math.sin(ang) * len,
                16
              );
              strokeSegments(ctx, segs, a === 0 ? 'rgba(250, 204, 21, 0.85)' : 'rgba(192, 132, 252, 0.85)', 1.2);
            }
          }
          ctx.restore();
        }
      }

      // ---------------------------------------------------------
      // THEME 4: FROST (Lăng kính pha lê 3D + Vân rạn 4 góc + Vết nứt theo chuột)
      // ---------------------------------------------------------
      if (hudThemeKey === 'frost') {
        drawCornerFrost(ctx, width, height, time);

        // Lăng kính lục giác pha lê lơ lửng bắt sáng, dạt nhẹ khi trỏ chuột đi qua
        for (const f of ambient) {
          f.x += f.vx;
          f.y += f.vy;
          f.rot += f.rotSpeed;

          if (pointer.active) {
            const dx = f.x - pointer.x;
            const dy = f.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 140) {
              const force = ((140 - d) / 140) * 0.45;
              f.vx += (dx / d) * force;
              f.vy += (dy / d) * force;
              f.rotSpeed += 0.004;
            }
          }

          f.vx *= 0.985;
          f.vy *= 0.985;
          if (Math.hypot(f.vx, f.vy) < 0.14) {
            f.vx += (Math.random() - 0.5) * 0.04;
            f.vy += (Math.random() - 0.5) * 0.04;
          }
          f.rotSpeed *= 0.99;

          if (f.x > width + 25) f.x = -25;
          if (f.x < -25) f.x = width + 25;
          if (f.y > height + 25) f.y = -25;
          if (f.y < -25) f.y = height + 25;

          const shimmer = 0.72 + 0.28 * Math.sin(time * 2 + f.phase);
          ctx.save();
          ctx.globalAlpha = f.alpha * shimmer;
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          drawIcePrism(ctx, f.size);
          ctx.restore();
        }

        // Vết nứt pha lê đóng băng theo chuột & khi click
        if (iceCracks.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (let i = iceCracks.length - 1; i >= 0; i--) {
            const ck = iceCracks[i];
            ck.alpha -= 0.016;
            ctx.strokeStyle = `rgba(224, 242, 254, ${Math.max(0, ck.alpha)})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(ck.x1, ck.y1);
            ctx.lineTo(ck.x2, ck.y2);
            ctx.stroke();
            if (ck.alpha <= 0) iceCracks.splice(i, 1);
          }
          ctx.restore();
        }
      }

      // ---------------------------------------------------------
      // THEME 5: GALAXY (Ngân hà sao 4 cánh lấp lánh, hành tinh có vòng & xoáy hố đen)
      // ---------------------------------------------------------
      if (hudThemeKey === 'galaxy') {
        if (Math.random() < 0.015 && meteors.length < 4) {
          meteors.push({
            x: Math.random() * width * 0.7,
            y: Math.random() * height * 0.3,
            vx: 11 + Math.random() * 5,
            vy: 6 + Math.random() * 4,
            len: 95 + Math.random() * 65,
            alpha: 1,
            color: Math.random() > 0.5 ? '#c084fc' : '#38bdf8'
          });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Hành tinh có vành đai xoay chậm trôi ở góc nền vũ trụ
        const px = width * 0.84 + Math.sin(time * 0.18) * 18;
        const py = height * 0.24 + Math.cos(time * 0.14) * 12;
        ctx.save();
        ctx.translate(px, py);
        const pGrad = ctx.createRadialGradient(-8, -8, 2, 0, 0, 22);
        pGrad.addColorStop(0, 'rgba(192, 132, 252, 0.45)');
        pGrad.addColorStop(1, 'rgba(56, 189, 248, 0.08)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(-0.32 + Math.sin(time * 0.3) * 0.05);
        ctx.strokeStyle = 'rgba(165, 180, 252, 0.38)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 38, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // Vòng xoáy hố đen hấp dẫn quanh con trỏ
        if (pointer.active) {
          for (let ring = 0; ring < 3; ring++) {
            ctx.strokeStyle = ring % 2 === 0 ? 'rgba(192, 132, 252, 0.32)' : 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 1.6;
            const rOrb = 22 + ring * 16;
            const aStart = time * (2.2 - ring * 0.4) + ring * 1.1;
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, rOrb, aStart, aStart + Math.PI * 1.25);
            ctx.stroke();
          }
        }
        // Sao 4 cánh xoay lấp lánh bị hút nhẹ quanh hố đen
        for (const s of ambient) {
          if (pointer.active) {
            const dx = pointer.x - s.x;
            const dy = pointer.y - s.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 14 && dist < 190) {
              // Hút + xoay tiếp tuyến (spiral orbit)
              s.vx += ((dx / dist) * 0.028 - (dy / dist) * 0.022) * s.depth;
              s.vy += ((dy / dist) * 0.028 + (dx / dist) * 0.022) * s.depth;
            }
          }
          s.vx *= 0.99;
          s.vy *= 0.99;
          s.rot += 0.012;
          s.x = (s.x + s.vx + width) % width;
          s.y = (s.y + s.vy + height) % height;
          const glow = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.twinkle + s.phase));
          ctx.save();
          ctx.globalAlpha = glow;
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          drawStarGlint(ctx, s.r, s.color);
          ctx.restore();
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          m.alpha -= 0.02;
          const tailGrad = ctx.createLinearGradient(m.x, m.y, m.x - m.len, m.y - m.len * (m.vy / (Math.abs(m.vx) + 0.1)));
          tailGrad.addColorStop(0, `rgba(255,255,255,${Math.max(0, m.alpha)})`);
          tailGrad.addColorStop(1, 'rgba(192,132,252,0)');
          ctx.strokeStyle = tailGrad;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.len * Math.sign(m.vx), m.y - m.len * 0.55);
          ctx.stroke();
          if (m.alpha <= 0 || m.x < -160 || m.x > width + 160 || m.y > height + 160) meteors.splice(i, 1);
        }
        ctx.restore();
      }

      // ---------------------------------------------------------
      // THEME 6: INFERNO (Ngọn lửa giọt nước bốc từ dung nham đáy màn hình)
      // ---------------------------------------------------------
      if (hudThemeKey === 'inferno') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Vệt dung nham rực ở mép đáy màn hình
        const lavaGrad = ctx.createLinearGradient(0, height - 95, 0, height);
        lavaGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
        lavaGrad.addColorStop(0.65, 'rgba(234, 88, 12, 0.14)');
        lavaGrad.addColorStop(1, 'rgba(250, 204, 21, 0.24)');
        ctx.fillStyle = lavaGrad;
        ctx.fillRect(0, height - 95, width, 95);

        for (const f of ambient) {
          const sway = Math.sin(time * 3.5 + f.phase);
          f.x += f.vx + sway * 0.65;
          f.y += f.vy;
          if (pointer.active) {
            const dx = f.x - pointer.x;
            const dy = f.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && dist < 135) {
              f.x += (dx / dist) * 1.8;
              f.y -= 1.6;
            }
          }
          if (f.y < -25) {
            f.y = height + 15;
            f.x = Math.random() * width;
          }
          if (f.x < -20) f.x = width + 20;
          if (f.x > width + 20) f.x = -20;
          ctx.save();
          ctx.globalAlpha = f.alpha * (0.72 + 0.28 * Math.sin(time * 7 + f.phase));
          ctx.translate(f.x, f.y);
          drawFlameTongue(ctx, f.size, sway * 0.22, f.cOuter, f.cInner);
          ctx.restore();
        }
        ctx.restore();
      }

      // ---------------------------------------------------------
      // THEME 7: MATRIX (Mưa mã số xanh + Tia quét chữ thập Cyber khi click)
      // ---------------------------------------------------------
      if (hudThemeKey === 'matrix') {
        ctx.save();
        ctx.font = 'bold 14px monospace';
        for (const d of ambient) {
          const xPos = d.colIndex * 24 + 8;
          if (xPos > width) continue;
          d.y += d.speed;
          d.speed += (3.2 - d.speed) * 0.01;
          if (d.y - d.len * 18 > height) {
            d.y = -20;
            d.speed = 2.4 + Math.random() * 3.6;
          }
          const nearPtr = pointer.active && Math.hypot(xPos - pointer.x, d.y - pointer.y) < 120;
          for (let k = 0; k < d.len; k++) {
            const cy = d.y - k * 18;
            if (cy < -18 || cy > height + 18) continue;
            const ch = d.chars[(d.glyphSeed + k + Math.floor(time * 6)) % d.chars.length];
            if (k === 0) {
              ctx.fillStyle = nearPtr ? '#ffffff' : '#bbf7d0';
              ctx.globalAlpha = nearPtr ? 0.95 : 0.72;
            } else {
              ctx.fillStyle = nearPtr ? '#4ade80' : '#22c55e';
              ctx.globalAlpha = Math.max(0.05, (1 - k / d.len) * (nearPtr ? 0.85 : 0.38));
            }
            ctx.fillText(ch, xPos, cy);
          }
        }
        for (let i = matrixScans.length - 1; i >= 0; i--) {
          const sc = matrixScans[i];
          sc.life -= 0.035;
          ctx.strokeStyle = `rgba(74, 222, 128, ${Math.max(0, sc.life * 0.75)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, sc.y);
          ctx.lineTo(width, sc.y);
          ctx.moveTo(sc.x, 0);
          ctx.lineTo(sc.x, height);
          ctx.stroke();
          if (sc.life <= 0) matrixScans.splice(i, 1);
        }
        ctx.restore();
      }

      // ---------------------------------------------------------
      // THEME 8: AURORA (Màn rèm cực quang dựng đứng + dải lụa quang phổ con trỏ)
      // ---------------------------------------------------------
      if (hudThemeKey === 'aurora') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 16 dải màn rèm cực quang rủ từ đỉnh xuống giữa nền (không dùng đốm tròn)
        for (const c of ambient) {
          const baseX = c.xRatio * width + Math.sin(time * c.speed + c.phase) * 34;
          const swayPull = pointer.active ? (pointer.x - baseX) * Math.exp(-Math.abs(pointer.x - baseX) / 240) * 0.16 : 0;
          const cx = baseX + swayPull;
          const hBeam = height * c.heightRatio;
          const grad = ctx.createLinearGradient(cx, 0, cx + 18, hBeam);
          grad.addColorStop(0, `${c.color}00`);
          grad.addColorStop(0.28, `${c.color}36`);
          grad.addColorStop(0.62, `${c.color}18`);
          grad.addColorStop(1, `${c.color}00`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(cx - c.width * 0.5, 0);
          ctx.lineTo(cx + c.width * 0.5, 0);
          ctx.quadraticCurveTo(cx + c.width * 0.75 + swayPull * 0.4, hBeam * 0.55, cx + c.width * 0.2, hBeam);
          ctx.lineTo(cx - c.width * 0.3, hBeam);
          ctx.quadraticCurveTo(cx - c.width * 0.65 + swayPull * 0.4, hBeam * 0.55, cx - c.width * 0.5, 0);
          ctx.fill();
        }
        // Dải lụa quang phổ uốn theo chuột
        if (trailPoints.length >= 2) {
          for (let i = 1; i < trailPoints.length; i++) {
            const p0 = trailPoints[i - 1];
            const p1 = trailPoints[i];
            const hue = (time * 90 + i * 18) % 360;
            ctx.strokeStyle = `hsla(${150 + (hue % 130)}, 88%, 68%, ${p1.life * 0.48})`;
            ctx.lineWidth = p1.life * 9;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
        // Sóng màn cực quang quét ngang khi click
        for (let i = auroraFlashes.length - 1; i >= 0; i--) {
          const af = auroraFlashes[i];
          af.spread += (af.maxSpread - af.spread) * 0.14;
          af.alpha *= 0.92;
          const fGrad = ctx.createLinearGradient(af.x - af.spread, 0, af.x + af.spread, 0);
          fGrad.addColorStop(0, 'rgba(52, 211, 153, 0)');
          fGrad.addColorStop(0.5, `rgba(167, 139, 250, ${af.alpha * 0.24})`);
          fGrad.addColorStop(1, 'rgba(52, 211, 153, 0)');
          ctx.fillStyle = fGrad;
          ctx.fillRect(af.x - af.spread, 0, af.spread * 2, height * 0.85);
          if (af.alpha < 0.03) auroraFlashes.splice(i, 1);
        }
        ctx.restore();
      }

      // ---------------------------------------------------------
      // LỚP HIỆU ỨNG CHUNG: Sét Fractal, Sóng Xung Kích & Hạt Tương Tác
      // ---------------------------------------------------------
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (b.flashAlpha > 0.01) {
          ctx.fillStyle = `rgba(216, 180, 254, ${b.flashAlpha * 0.45})`;
          ctx.fillRect(0, 0, width, height);
          b.flashAlpha *= 0.72;
        }
        ctx.globalAlpha = Math.max(0, b.alpha);
        strokeSegments(ctx, b.mainSegs, 'rgba(168, 85, 247, 0.45)', 8);
        strokeSegments(ctx, b.mainSegs, '#facc15', 4.2);
        strokeSegments(ctx, b.mainSegs, '#ffffff', 1.8);
        for (const br of b.branches) {
          strokeSegments(ctx, br, '#c084fc', 1.5);
        }
        ctx.restore();
        b.alpha -= b.decay;
        if (b.alpha <= 0) bolts.splice(i, 1);
      }

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += (sw.maxR - sw.r) * 0.14 + 1.8;
        sw.alpha *= 0.91;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = sw.color2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (sw.alpha < 0.03 || sw.r >= sw.maxR) shockwaves.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.017;

        if (p.kind === 'petal') {
          p.rot += p.rotSpeed;
          p.pitch += p.pitchSpeed;
          p.vy += 0.028;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawSakuraPetal(ctx, p.size, p.cA, p.cB, p.pitch);
          ctx.restore();
        } else if (p.kind === 'iceShard') {
          p.rot += p.rotSpeed;
          p.vx *= 0.97;
          p.vy *= 0.97;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawIceShard(ctx, p.size, p.color);
          ctx.restore();
        } else if (p.kind === 'crystal') {
          p.rot += p.rotSpeed;
          p.vy += 0.015;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawCrystalSnowflake(ctx, p.size, p.color);
          ctx.restore();
        } else if (p.kind === 'star') {
          p.rot += p.rotSpeed;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          drawStarGlint(ctx, p.size, p.color);
          ctx.restore();
        } else if (p.kind === 'flame') {
          p.vy -= 0.06;
          p.size *= 0.985;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          drawFlameTongue(ctx, p.size, p.tilt || 0, p.cOuter, p.cInner);
          ctx.restore();
        } else if (p.kind === 'glyph') {
          p.vy += 0.04;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.font = `bold ${p.size || 13}px monospace`;
          ctx.fillText(p.char || '1', p.x, p.y);
          ctx.restore();
        } else {
          p.vy += p.gravity || 0.1;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (p.alpha <= 0) particles.splice(i, 1);
      }

      for (let i = trailPoints.length - 1; i >= 0; i--) {
        trailPoints[i].life -= 0.08;
        if (trailPoints[i].life <= 0) trailPoints.splice(i, 1);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const onVisibilityChange = () => {
      if (isDisposed) return;
      if (document.hidden) {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } else if (!animId) {
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isFxEnabled, hudThemeKey]);

  if (!isFxEnabled || hudThemeKey === 'off') return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9998 }}>
      {/* LỚP CANVAS VECTOR RETINA 60 FPS TƯƠNG TÁC TRỰC TIẾP THEO CON TRỎ & CHẠM */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999
        }}
      />

      {/* Hào quang nhẹ theo từng Theme */}
      {hudThemeKey === 'sakura' && <div className="sakura-aurora-glow" />}

      {hudThemeKey === 'cyber' && (
        <>
          <div className="cyber-scan-beam" />
          {[
            { style: { top: 0, left: 0, width: '140px', height: '140px' } },
            { style: { top: 0, right: 0, width: '140px', height: '140px', transform: 'scaleX(-1)' } },
            { style: { bottom: 0, left: 0, width: '110px', height: '110px', transform: 'scaleY(-1)', opacity: 0.65 } },
            { style: { bottom: 0, right: 0, width: '110px', height: '110px', transform: 'scale(-1, -1)', opacity: 0.65 } }
          ].map((corner, idx) => (
            <svg key={idx} className="cyber-web-corner" style={corner.style} viewBox="0 0 100 100">
              <line x1="0" y1="0" x2="100" y2="0" stroke="#38bdf8" strokeWidth="1.4" />
              <line x1="0" y1="0" x2="0" y2="100" stroke="#38bdf8" strokeWidth="1.4" />
              <line x1="0" y1="0" x2="100" y2="100" stroke="#38bdf8" strokeWidth="1.1" />
              <line x1="0" y1="0" x2="90" y2="45" stroke="#38bdf8" strokeWidth="0.8" />
              <line x1="0" y1="0" x2="45" y2="90" stroke="#38bdf8" strokeWidth="0.8" />
              <path d="M 0,25 Q 12,18 25,0" fill="none" stroke="#22c55e" strokeWidth="1" className="cyber-web-pulse-arc" />
              <path d="M 0,50 Q 25,35 50,0" fill="none" stroke="#38bdf8" strokeWidth="1.1" />
              <path d="M 0,75 Q 38,55 75,0" fill="none" stroke="#22c55e" strokeWidth="1" className="cyber-web-pulse-arc" />
              <path d="M 0,100 Q 50,75 100,0" fill="none" stroke="#38bdf8" strokeWidth="1.3" />
            </svg>
          ))}
        </>
      )}
    </div>
  );
});

export default ThemeAmbientFx;
