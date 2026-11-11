import React, { useState, useRef, useEffect, useMemo } from 'react';
import { isTrustedInput } from '../utils/antiBot';

const COLOR_TILES = [
  { key: 'white',  label: 'TRẮNG', hex: '#f8fafc' },
  { key: 'yellow', label: 'VÀNG',  hex: '#facc15' },
  { key: 'red',    label: 'ĐỎ',    hex: '#ef4444' },
  { key: 'orange', label: 'CAM',   hex: '#f97316' },
  { key: 'green',  label: 'XANH LÁ', hex: '#22c55e' },
  { key: 'blue',   label: 'XANH DƯƠNG', hex: '#3b82f6' }
];

const HOLD_REQUIRED_MS = 1000;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 20000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HumanCheckModal({ open, onVerified, onCancel }) {
  const [challenge, setChallenge] = useState(null);
  const [picked, setPicked] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const openedAtRef = useRef(0);
  const holdStartRef = useRef(0);
  const holdRafRef = useRef(null);
  const honeypotRef = useRef(null);

  const newChallenge = () => {
    const target = COLOR_TILES[Math.floor(Math.random() * COLOR_TILES.length)];
    setChallenge({ target, tiles: shuffle(COLOR_TILES) });
    setPicked(null);
    setHoldProgress(0);
    openedAtRef.current = performance.now();
  };

  useEffect(() => {
    if (open) {
      newChallenge();
      setError('');
    }
    return () => {
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const locked = lockedUntil > now;

  const fail = (msg) => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setError(msg);
    if (nextAttempts >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      setAttempts(0);
    }
    newChallenge();
  };

  const stopHoldLoop = () => {
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
  };

  const handleHoldDown = (e) => {
    if (locked) return;
    if (!isTrustedInput(e)) {
      fail('Sự kiện không hợp lệ (nghi ngờ tự động hóa).');
      return;
    }
    if (!picked) {
      setError('Hãy chọn ô màu được yêu cầu trước.');
      return;
    }
    setError('');
    holdStartRef.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - holdStartRef.current) / HOLD_REQUIRED_MS);
      setHoldProgress(p);
      if (p < 1) holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  };

  const handleHoldUp = (e) => {
    if (locked || !holdStartRef.current) return;
    stopHoldLoop();
    const held = performance.now() - holdStartRef.current;
    holdStartRef.current = 0;

    if (!isTrustedInput(e)) {
      fail('Sự kiện không hợp lệ (nghi ngờ tự động hóa).');
      return;
    }
    if (honeypotRef.current && honeypotRef.current.value) {
      fail('Xác minh thất bại.');
      return;
    }
    if (held < HOLD_REQUIRED_MS) {
      setHoldProgress(0);
      setError('Giữ nút đủ 1 giây rồi mới thả ra.');
      return;
    }
    const totalElapsed = performance.now() - openedAtRef.current;
    if (totalElapsed < 800) {
      fail('Thao tác quá nhanh so với con người.');
      return;
    }
    if (!challenge || picked !== challenge.target.key) {
      fail('Sai ô màu. Hãy thử lại với thử thách mới.');
      return;
    }
    setAttempts(0);
    onVerified();
  };

  const instruction = useMemo(
    () => (challenge ? `Chọn ô màu ${challenge.target.label}` : ''),
    [challenge]
  );

  if (!open || !challenge) return null;

  const lockSecs = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 8, 16, 0.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000
    }}>
      <div style={{
        width: '92%',
        maxWidth: '380px',
        background: '#0d1629',
        border: '1px solid #38bdf866',
        borderRadius: '16px',
        padding: '22px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
        textAlign: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}>
        <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🛡️</div>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: '#f8fafc' }}>
          Xác minh bạn là người thật
        </h3>
        <p style={{ margin: '0 0 14px 0', fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.4 }}>
          Chỉ cần làm 1 lần mỗi phiên (30 phút) trước khi bắt đầu giải.
        </p>

        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#38bdf8', marginBottom: '10px' }}>
          Bước 1: {instruction}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '14px'
        }}>
          {challenge.tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={locked}
              onClick={(e) => {
                if (!isTrustedInput(e)) {
                  fail('Sự kiện không hợp lệ (nghi ngờ tự động hóa).');
                  return;
                }
                setPicked(t.key);
                setError('');
              }}
              aria-label={`Ô màu ${t.label}`}
              style={{
                height: '52px',
                borderRadius: '10px',
                background: t.hex,
                border: picked === t.key ? '3px solid #38bdf8' : '2px solid #1e293b',
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.4 : 1,
                boxShadow: picked === t.key ? '0 0 14px rgba(56, 189, 248, 0.55)' : 'none'
              }}
            />
          ))}
        </div>

        {/* Honeypot: người thật không thấy và không điền; bot tự động điền form sẽ bị bắt */}
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
        />

        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#fbbf24', marginBottom: '8px' }}>
          Bước 2: Nhấn giữ nút 1 giây rồi thả ra
        </div>

        <button
          type="button"
          disabled={locked}
          onPointerDown={handleHoldDown}
          onPointerUp={handleHoldUp}
          onPointerCancel={() => {
            stopHoldLoop();
            holdStartRef.current = 0;
            setHoldProgress(0);
          }}
          style={{
            position: 'relative',
            width: '100%',
            height: '48px',
            borderRadius: '10px',
            border: 'none',
            overflow: 'hidden',
            background: '#1e293b',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '0.9rem',
            cursor: locked ? 'not-allowed' : 'pointer',
            touchAction: 'none'
          }}
        >
          <span style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${holdProgress * 100}%`,
            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
            transition: 'none'
          }} />
          <span style={{ position: 'relative' }}>
            {locked ? `Khóa tạm thời ${lockSecs}s` : (holdProgress >= 1 ? 'Thả tay ra!' : 'Giữ để xác minh')}
          </span>
        </button>

        {error && (
          <div style={{
            marginTop: '10px',
            padding: '7px 10px',
            borderRadius: '8px',
            background: '#ef444422',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            fontSize: '0.76rem'
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: '12px',
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '0.78rem',
            cursor: 'pointer'
          }}
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
