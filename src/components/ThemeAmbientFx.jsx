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
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
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
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 12;
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
    if (!isFxEnabled) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animId = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

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
    const frostFractals = [];
    const dataPackets = [];

    // Khởi tạo đối tượng nền theo từng Theme
    const ambient = [];
    if (hudThemeKey === 'sakura') {
      for (let i = 0; i < 36; i++) {
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
      for (let i = 0; i < 32; i++) {
        ambient.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.45 + Math.random() * 0.95,
          size: 4.5 + Math.random() * 8.5,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.025,
          swayPhase: Math.random() * Math.PI * 2,
          alpha: 0.35 + Math.random() * 0.55,
          color: i % 2 === 0 ? '#a5f3fc' : '#e0f2fe'
        });
      }
    }

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
      bolts.push({
        mainSegs,
        branches,
        alpha: 1,
        decay: isBig ? 0.038 : 0.055,
        flashAlpha: isBig ? 0.24 : 0.12
      });
      shockwaves.push({
        x: targetX,
        y: targetY,
        r: 4,
        maxR: isBig ? 140 : 75,
        alpha: 1,
        color: '#facc15',
        color2: '#c084fc'
      });
      const sparkCount = isBig ? 22 : 10;
      for (let i = 0; i < sparkCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * (isBig ? 7 : 4.5);
        particles.push({
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

      const dist = Math.hypot(x - pointer.lastX, y - pointer.lastY);
      if (dist >= 14) {
        pointer.lastX = x;
        pointer.lastY = y;
        if (particles.length < 180) {
          if (hudThemeKey === 'sakura') {
            particles.push({
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
            particles.push({
              x: x + (Math.random() - 0.5) * 10,
              y: y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 0.9,
              vy: 0.35 + Math.random() * 0.8,
              size: 4 + Math.random() * 5.5,
              rot: Math.random() * Math.PI,
              rotSpeed: (Math.random() - 0.5) * 0.05,
              alpha: 0.92,
              color: Math.random() > 0.4 ? '#67e8f9' : '#ffffff',
              kind: 'crystal'
            });
          } else if (hudThemeKey === 'thunder') {
            particles.push({
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
          }
        }
      }
    };

    const onPointerDown = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      pointer.down = true;

      if (hudThemeKey === 'sakura') {
        shockwaves.push({ x, y, r: 6, maxR: 110, alpha: 0.9, color: '#f472b6', color2: '#fbcfe8' });
        for (let i = 0; i < 24; i++) {
          const ang = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.25;
          const spd = 2.2 + Math.random() * 4.8;
          particles.push({
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
        shockwaves.push({ x, y, r: 8, maxR: 185, alpha: 1, color: '#38bdf8', color2: '#22c55e' });
        for (const n of ambient) {
          const dx = n.x - x;
          const dy = n.y - y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < 220) {
            const impulse = (220 - d) / 26;
            n.vx += (dx / d) * impulse;
            n.vy += (dy / d) * impulse;
          }
        }
      } else if (hudThemeKey === 'thunder') {
        spawnStormBolt(x, y, true);
      } else if (hudThemeKey === 'frost') {
        frostFractals.push({ x, y, radius: 4, maxRadius: 72, alpha: 1, rot: Math.random() * Math.PI });
        shockwaves.push({ x, y, r: 5, maxR: 120, alpha: 0.95, color: '#67e8f9', color2: '#e0f2fe' });
        for (let i = 0; i < 20; i++) {
          const ang = (Math.PI * 2 * i) / 20;
          const spd = 1.8 + Math.random() * 4.2;
          particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 4 + Math.random() * 5,
            rot: ang,
            rotSpeed: (Math.random() - 0.5) * 0.09,
            alpha: 1,
            color: i % 2 === 0 ? '#67e8f9' : '#ffffff',
            kind: 'crystal'
          });
        }
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

    const render = (now) => {
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
          ctx.shadowColor = 'rgba(244, 114, 182, 0.55)';
          ctx.shadowBlur = 8;
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
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
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
      // THEME 4: FROST (Tinh thể tuyết lục giác + Rạn băng pha lê)
      // ---------------------------------------------------------
      if (hudThemeKey === 'frost') {
        // Bông tuyết tinh thể quay 6 cánh
        for (const f of ambient) {
          const drift = Math.sin(time * 0.85 + f.swayPhase) * 0.42;
          f.x += f.vx + drift;
          f.y += f.vy;
          f.rot += f.rotSpeed;

          if (pointer.active) {
            const dx = f.x - pointer.x;
            const dy = f.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 130) {
              const force = ((130 - d) / 130) * 0.7;
              f.vx += (dx / d) * force;
              f.vy += (dy / d) * force;
            }
          }

          f.vx *= 0.97;
          f.vy = f.vy * 0.98 + 0.018;

          if (f.x > width + 20) f.x = -20;
          if (f.x < -20) f.x = width + 20;
          if (f.y > height + 20) {
            f.y = -20;
            f.x = Math.random() * width;
          }

          ctx.save();
          ctx.globalAlpha = f.alpha;
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.shadowColor = 'rgba(103, 232, 249, 0.75)';
          ctx.shadowBlur = 8;
          drawCrystalSnowflake(ctx, f.size, f.color);
          ctx.restore();
        }

        // Hoa văn rạn băng pha lê mọc ra tại vị trí click
        for (let i = frostFractals.length - 1; i >= 0; i--) {
          const fr = frostFractals[i];
          fr.radius += (fr.maxRadius - fr.radius) * 0.16;
          fr.alpha -= 0.015;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, fr.alpha);
          ctx.translate(fr.x, fr.y);
          ctx.rotate(fr.rot);
          ctx.shadowColor = '#67e8f9';
          ctx.shadowBlur = 14;
          drawCrystalSnowflake(ctx, fr.radius, '#e0f2fe');
          ctx.restore();
          if (fr.alpha <= 0) frostFractals.splice(i, 1);
        }
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
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 22;
        strokeSegments(ctx, b.mainSegs, '#facc15', 4.5);
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
        } else {
          p.vy += p.gravity || 0.1;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
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

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isFxEnabled, hudThemeKey]);

  if (!isFxEnabled) return null;

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

      {hudThemeKey === 'frost' && (
        <>
          <div className="frost-vignette-overlay" />
          <svg
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '58px',
              zIndex: 9991,
              animation: 'icicleDripShine 4.5s ease-in-out infinite'
            }}
            viewBox="0 0 1000 60"
            preserveAspectRatio="none"
          >
            <path
              d="M 0,0 L 0,25 L 30,8 L 60,35 L 90,12 L 130,45 L 160,15 L 210,38 L 260,10 L 310,50 L 350,14 L 400,32 L 450,10 L 510,55 L 560,12 L 620,40 L 670,16 L 730,48 L 780,12 L 840,36 L 890,10 L 940,46 L 980,18 L 1000,28 L 1000,0 Z"
              fill="rgba(6, 182, 212, 0.24)"
              stroke="rgba(165, 243, 252, 0.72)"
              strokeWidth="1.5"
            />
          </svg>
        </>
      )}
    </div>
  );
});

export default ThemeAmbientFx;
