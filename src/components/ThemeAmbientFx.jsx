import React, { useEffect, useRef } from 'react';

const SAKURA_PETALS = [
  { left: '4%', delay: '0s', dur: '8.2s', size: '1.25rem', icon: '🌸' },
  { left: '12%', delay: '2.1s', dur: '9.8s', size: '0.9rem', icon: '💮' },
  { left: '21%', delay: '1.1s', dur: '8.9s', size: '1.15rem', icon: '🌸' },
  { left: '33%', delay: '3.4s', dur: '11.2s', size: '0.85rem', icon: '🌸' },
  { left: '45%', delay: '0.6s', dur: '9.4s', size: '1.3rem', icon: '🌸' },
  { left: '57%', delay: '4.1s', dur: '10.6s', size: '0.95rem', icon: '💮' },
  { left: '68%', delay: '1.8s', dur: '8.6s', size: '1.2rem', icon: '🌸' },
  { left: '79%', delay: '2.9s', dur: '10.1s', size: '0.9rem', icon: '🌸' },
  { left: '89%', delay: '0.4s', dur: '11.8s', size: '1.15rem', icon: '💮' },
  { left: '95%', delay: '3.7s', dur: '9.1s', size: '1.0rem', icon: '🌸' }
];

const FROST_FLAKES = [
  { left: '5%', delay: '0s', dur: '7.4s', size: '1.35rem', icon: '❄' },
  { left: '14%', delay: '2.4s', dur: '9.6s', size: '0.95rem', icon: '❅' },
  { left: '25%', delay: '1.1s', dur: '8.2s', size: '1.25rem', icon: '❆' },
  { left: '36%', delay: '3.8s', dur: '10.8s', size: '0.9rem', icon: '✦' },
  { left: '47%', delay: '0.7s', dur: '8.9s', size: '1.3rem', icon: '❄' },
  { left: '58%', delay: '3.1s', dur: '10.2s', size: '1.05rem', icon: '❅' },
  { left: '69%', delay: '1.6s', dur: '8.5s', size: '1.35rem', icon: '❆' },
  { left: '80%', delay: '2.8s', dur: '9.4s', size: '0.95rem', icon: '❄' },
  { left: '90%', delay: '0.5s', dur: '11.1s', size: '1.2rem', icon: '❅' },
  { left: '96%', delay: '4.2s', dur: '9.8s', size: '0.9rem', icon: '✦' }
];

const THUNDER_SPARKS = [
  { top: '18%', left: '8%', delay: '0s' },
  { top: '34%', left: '4%', delay: '0.4s' },
  { top: '24%', right: '7%', delay: '0.2s' },
  { top: '42%', right: '5%', delay: '0.7s' }
];

function drawLightningSegment(ctx, x1, y1, x2, y2, displace, color, width) {
  if (displace < 4) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }
  const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displace;
  const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displace * 0.4;
  drawLightningSegment(ctx, x1, y1, midX, midY, displace / 1.9, color, width);
  drawLightningSegment(ctx, midX, midY, x2, y2, displace / 1.9, color, width);
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
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const pointer = { x: -9999, y: -9999, active: false, lastX: -9999, lastY: -9999 };
    const particles = [];
    const bolts = [];
    const rings = [];

    // Khởi tạo các hạt tương tác nền cho Cyber (nút mạng) & Frost (tinh thể băng lơ lửng)
    const ambientNodes = [];
    if (hudThemeKey === 'cyber' || hudThemeKey === 'frost' || hudThemeKey === 'sakura') {
      const count = hudThemeKey === 'cyber' ? 28 : 22;
      for (let i = 0; i < count; i++) {
        ambientNodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.7,
          vy: hudThemeKey === 'cyber' ? (Math.random() - 0.5) * 0.7 : 0.4 + Math.random() * 0.7,
          size: 2 + Math.random() * 3.5,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.04
        });
      }
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const spawnMoveParticles = (x, y) => {
      if (particles.length > 140) return;
      if (hudThemeKey === 'sakura') {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 1.8 + 0.5,
          vy: 0.6 + Math.random() * 1.4,
          size: 4 + Math.random() * 5,
          alpha: 0.9,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.12,
          color: Math.random() > 0.4 ? '#f472b6' : '#fda4af',
          kind: 'petal'
        });
      } else if (hudThemeKey === 'thunder') {
        if (Math.random() > 0.35) {
          particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 4.5,
            vy: (Math.random() - 0.5) * 4.5,
            size: 2 + Math.random() * 2.5,
            alpha: 1,
            color: Math.random() > 0.5 ? '#facc15' : '#c084fc',
            kind: 'spark'
          });
        }
      } else if (hudThemeKey === 'frost') {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 1.4,
          vy: 0.3 + Math.random() * 1.1,
          size: 2.5 + Math.random() * 3.5,
          alpha: 0.9,
          color: Math.random() > 0.5 ? '#a5f3fc' : '#e0f2fe',
          kind: 'ice'
        });
      } else if (hudThemeKey === 'cyber') {
        if (Math.random() > 0.55) {
          particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 1.6,
            vy: (Math.random() - 0.5) * 1.6,
            size: 2 + Math.random() * 2,
            alpha: 0.85,
            color: Math.random() > 0.5 ? '#38bdf8' : '#22c55e',
            kind: 'spark'
          });
        }
      }
    };

    const handlePointerMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      const dist = Math.hypot(pointer.x - pointer.lastX, pointer.y - pointer.lastY);
      if (dist >= 12) {
        pointer.lastX = pointer.x;
        pointer.lastY = pointer.y;
        spawnMoveParticles(pointer.x, pointer.y);
      }
    };

    const handlePointerDown = (e) => {
      const x = e.clientX;
      const y = e.clientY;

      if (hudThemeKey === 'sakura') {
        rings.push({ x, y, r: 4, maxR: 65, alpha: 0.8, color: '#f472b6' });
        for (let i = 0; i < 16; i++) {
          const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
          const spd = 2 + Math.random() * 3.5;
          particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 0.6,
            size: 5 + Math.random() * 5,
            alpha: 1,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.18,
            color: i % 2 === 0 ? '#f472b6' : '#fbcfe8',
            kind: 'petal'
          });
        }
      } else if (hudThemeKey === 'cyber') {
        rings.push({ x, y, r: 6, maxR: 130, alpha: 0.95, color: '#38bdf8' });
        rings.push({ x, y, r: 2, maxR: 85, alpha: 0.8, color: '#22c55e' });
        for (const node of ambientNodes) {
          const dx = node.x - x;
          const dy = node.y - y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < 180) {
            const push = (180 - d) / 40;
            node.vx += (dx / d) * push;
            node.vy += (dy / d) * push;
          }
        }
      } else if (hudThemeKey === 'thunder') {
        bolts.push({
          x1: x + (Math.random() - 0.5) * 140,
          y1: 0,
          x2: x,
          y2: y,
          alpha: 1,
          color: '#facc15'
        });
        rings.push({ x, y, r: 5, maxR: 105, alpha: 1, color: '#c084fc' });
        for (let i = 0; i < 14; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 2.5 + Math.random() * 5;
          particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 2.5 + Math.random() * 2.5,
            alpha: 1,
            color: i % 2 === 0 ? '#facc15' : '#ffffff',
            kind: 'spark'
          });
        }
      } else if (hudThemeKey === 'frost') {
        rings.push({ x, y, r: 5, maxR: 95, alpha: 0.9, color: '#67e8f9' });
        for (let i = 0; i < 14; i++) {
          const ang = (Math.PI * 2 * i) / 14;
          const spd = 1.6 + Math.random() * 3.2;
          particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3 + Math.random() * 4,
            alpha: 1,
            color: i % 2 === 0 ? '#67e8f9' : '#ffffff',
            kind: 'ice'
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Cập nhật & vẽ các hạt nền tương tác theo con trỏ
      for (let i = 0; i < ambientNodes.length; i++) {
        const n = ambientNodes[i];

        // Đẩy nhẹ bởi con trỏ chuột (hiệu ứng gió/từ trường)
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < 130) {
            if (hudThemeKey === 'cyber') {
              // Cyber vẽ tơ mạng nhện nối con trỏ với các nút mạng gần đó!
              ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - d / 130) * 0.65})`;
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.moveTo(pointer.x, pointer.y);
              ctx.lineTo(n.x, n.y);
              ctx.stroke();
            } else {
              // Sakura & Frost thổi dạt cánh hoa / tuyết khỏi con trỏ
              const force = ((130 - d) / 130) * 0.55;
              n.vx += (dx / d) * force;
              n.vy += (dy / d) * force;
            }
          }
        }

        n.x += n.vx;
        n.y += n.vy;
        n.angle += n.spin;

        // Giảm chấn dần về tốc độ chuẩn
        if (hudThemeKey === 'cyber') {
          n.vx *= 0.992;
          n.vy *= 0.992;
          if (Math.abs(n.vx) < 0.25) n.vx += (Math.random() - 0.5) * 0.08;
          if (Math.abs(n.vy) < 0.25) n.vy += (Math.random() - 0.5) * 0.08;
        } else {
          n.vx *= 0.97;
          n.vy = n.vy * 0.97 + 0.025;
        }

        if (n.x < -10) n.x = width + 10;
        if (n.x > width + 10) n.x = -10;
        if (n.y < -10) n.y = height + 10;
        if (n.y > height + 10) n.y = -10;

        if (hudThemeKey === 'cyber') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size * 0.55, 0, Math.PI * 2);
          ctx.fill();

          // Nối tơ giữa các nút mạng gần nhau
          for (let j = i + 1; j < ambientNodes.length; j++) {
            const m = ambientNodes[j];
            const dist = Math.hypot(n.x - m.x, n.y - m.y);
            if (dist < 115) {
              ctx.strokeStyle = `rgba(34, 197, 94, ${(1 - dist / 115) * 0.25})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(m.x, m.y);
              ctx.stroke();
            }
          }
        }
      }

      // 2. Vẽ các vòng xung kích khi click
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += (ring.maxR - ring.r) * 0.14 + 1.5;
        ring.alpha *= 0.92;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ring.alpha);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        if (ring.alpha < 0.04 || ring.r >= ring.maxR) {
          rings.splice(i, 1);
        }
      }

      // 3. Vẽ tia sét tương tác khi click (Theme Thunder)
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 16;
        drawLightningSegment(ctx, b.x1, b.y1, b.x2, b.y2, 58, '#facc15', 3);
        drawLightningSegment(ctx, b.x1, b.y1, b.x2, b.y2, 42, '#ffffff', 1.4);
        ctx.restore();
        b.alpha -= 0.065;
        if (b.alpha <= 0) bolts.splice(i, 1);
      }

      // 4. Vẽ các hạt tương tác sinh ra khi di chuột / click
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.018;
        if (p.kind === 'petal') {
          p.angle += p.spin || 0;
          p.vy += 0.02;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.kind === 'ice') {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.3;
          for (let k = 0; k < 3; k++) {
            const a = (Math.PI / 3) * k;
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(a) * p.size, p.y - Math.sin(a) * p.size);
            ctx.lineTo(p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (p.alpha <= 0) particles.splice(i, 1);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isFxEnabled, hudThemeKey]);

  if (!isFxEnabled) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9998 }}>
      {/* Lớp Canvas Tương Tác Chuột & Chạm Cảm Ứng 60 FPS (Không chặn click UI) */}
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

      {/* 1. HOA ANH ĐÀO (SAKURA 3D WIND PETALS + AURORA) */}
      {hudThemeKey === 'sakura' && (
        <>
          <div className="sakura-aurora-glow" />
          {SAKURA_PETALS.map((p, idx) => (
            <span
              key={idx}
              className="sakura-screen-petal"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.dur,
                fontSize: p.size
              }}
            >
              {p.icon}
            </span>
          ))}
        </>
      )}

      {/* 2. MẠNG NHỆN NEON CYBER (4 GÓC TƠ PHÁT SÁNG + 2 NHỆN ĐU ĐƯA + TIA QUÉT LASER) */}
      {hudThemeKey === 'cyber' && (
        <>
          <div className="cyber-scan-beam" />
          {[
            { style: { top: 0, left: 0, width: '135px', height: '135px' } },
            { style: { top: 0, right: 0, width: '135px', height: '135px', transform: 'scaleX(-1)' } },
            { style: { bottom: 0, left: 0, width: '105px', height: '105px', transform: 'scaleY(-1)', opacity: 0.65 } },
            { style: { bottom: 0, right: 0, width: '105px', height: '105px', transform: 'scale(-1, -1)', opacity: 0.65 } }
          ].map((corner, idx) => (
            <svg key={idx} className="cyber-web-corner" style={corner.style} viewBox="0 0 100 100">
              <line x1="0" y1="0" x2="100" y2="0" stroke="#38bdf8" strokeWidth="1.5" />
              <line x1="0" y1="0" x2="0" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
              <line x1="0" y1="0" x2="100" y2="100" stroke="#38bdf8" strokeWidth="1.2" />
              <line x1="0" y1="0" x2="90" y2="45" stroke="#38bdf8" strokeWidth="0.9" />
              <line x1="0" y1="0" x2="45" y2="90" stroke="#38bdf8" strokeWidth="0.9" />
              <path d="M 0,25 Q 12,18 25,0" fill="none" stroke="#22c55e" strokeWidth="1" className="cyber-web-pulse-arc" />
              <path d="M 0,50 Q 25,35 50,0" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
              <path d="M 0,75 Q 38,55 75,0" fill="none" stroke="#22c55e" strokeWidth="1" className="cyber-web-pulse-arc" />
              <path d="M 0,100 Q 50,75 100,0" fill="none" stroke="#38bdf8" strokeWidth="1.4" />
            </svg>
          ))}

          <div className="cyber-hanging-spider" style={{ right: '14%' }}>
            <div style={{ width: '1.5px', height: '120px', background: 'linear-gradient(to bottom, rgba(56, 189, 248, 0.2), #38bdf8)', margin: '0 auto', boxShadow: '0 0 6px #38bdf8' }} />
            <div style={{ fontSize: '1.35rem', textAlign: 'center', filter: 'drop-shadow(0 0 10px #38bdf8) drop-shadow(0 0 18px #22c55e)' }}>
              🕷️
            </div>
          </div>

          <div className="cyber-hanging-spider-left" style={{ left: '11%' }}>
            <div style={{ width: '1px', height: '85px', background: 'linear-gradient(to bottom, rgba(34, 197, 94, 0.2), #22c55e)', margin: '0 auto', boxShadow: '0 0 5px #22c55e' }} />
            <div style={{ fontSize: '1.05rem', textAlign: 'center', filter: 'drop-shadow(0 0 8px #22c55e) drop-shadow(0 0 14px #38bdf8)' }}>
              🕷️
            </div>
          </div>
        </>
      )}

      {/* 3. LÔI THẦN ĐIỆN QUANG (SÉT ĐÁNH + CHỚP SÁNG + TIA ĐIỆN TÍCH) */}
      {hudThemeKey === 'thunder' && (
        <>
          <div className="thunder-screen-flash" />
          <svg className="lightning-bolt-1" style={{ left: '22%', width: '180px', height: '85vh' }} viewBox="0 0 100 400" preserveAspectRatio="none">
            <polyline points="50,0 45,60 62,65 38,150 56,155 30,260 48,265 20,400" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="50,0 45,60 62,65 38,150 56,155 30,260 48,265 20,400" fill="none" stroke="#facc15" strokeWidth="6" strokeOpacity="0.8" strokeLinecap="round" />
            <polyline points="38,150 15,190 28,195 5,250" fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
            <polyline points="30,260 55,305 45,310 65,360" fill="none" stroke="#e879f9" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <svg className="lightning-bolt-2" style={{ right: '24%', width: '160px', height: '78vh' }} viewBox="0 0 100 400" preserveAspectRatio="none">
            <polyline points="50,0 55,70 38,75 60,165 42,170 65,280 48,285 70,400" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="50,0 55,70 38,75 60,165 42,170 65,280 48,285 70,400" fill="none" stroke="#c084fc" strokeWidth="5.5" strokeOpacity="0.85" />
            <polyline points="60,165 85,210 72,215 90,270" fill="none" stroke="#facc15" strokeWidth="2.2" strokeLinecap="round" />
          </svg>

          {THUNDER_SPARKS.map((sp, i) => (
            <span
              key={i}
              className="thunder-electric-spark"
              style={{
                top: sp.top,
                left: sp.left,
                right: sp.right,
                animationDelay: sp.delay,
                fontSize: '1.1rem'
              }}
            >
              ⚡
            </span>
          ))}
        </>
      )}

      {/* 4. BĂNG TUYẾT PHA LÊ (VIỀN CÓNG + NHŨ BĂNG LẤP LÁNH + TUYẾT RƠI LẮC LƯ) */}
      {hudThemeKey === 'frost' && (
        <>
          <div className="frost-vignette-overlay" />
          <svg style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '58px', zIndex: 9991, animation: 'icicleDripShine 4.5s ease-in-out infinite' }} viewBox="0 0 1000 60" preserveAspectRatio="none">
            <path
              d="M 0,0 L 0,25 L 30,8 L 60,35 L 90,12 L 130,45 L 160,15 L 210,38 L 260,10 L 310,50 L 350,14 L 400,32 L 450,10 L 510,55 L 560,12 L 620,40 L 670,16 L 730,48 L 780,12 L 840,36 L 890,10 L 940,46 L 980,18 L 1000,28 L 1000,0 Z"
              fill="rgba(6, 182, 212, 0.24)"
              stroke="rgba(165, 243, 252, 0.72)"
              strokeWidth="1.5"
            />
          </svg>

          {FROST_FLAKES.map((s, idx) => (
            <span
              key={idx}
              className="frost-screen-snowflake"
              style={{
                left: s.left,
                animationDelay: s.delay,
                animationDuration: s.dur,
                fontSize: s.size
              }}
            >
              {s.icon}
            </span>
          ))}
        </>
      )}
    </div>
  );
});

export default ThemeAmbientFx;
