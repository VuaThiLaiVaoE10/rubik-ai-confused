import React from 'react';

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

const ThemeAmbientFx = React.memo(function ThemeAmbientFx({ isFxEnabled, hudThemeKey }) {
  if (!isFxEnabled) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9998 }}>
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
