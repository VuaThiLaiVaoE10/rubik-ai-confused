import React, { useState, useRef, useEffect } from 'react';
import { isTrustedInput, detectAutomation, getHumanSessionInfo } from '../utils/antiBot';
import { getSecurityStats } from '../utils/securityShield';

/**
 * SMART ANTI-BOT & SECURITY SHIELD MODAL (v2.0 — Turnstile Style)
 * - Gọn nhẹ, hiện đại, chỉ cần 1 chạm ("Tôi là người chơi thật") hoặc kéo thanh trượt.
 * - Kiểm tra phần cứng isTrusted, bẫy Honeypot ẩn và tín hiệu môi trường trình duyệt.
 * - Lưu phiên xác minh suốt 24 giờ để không làm gián đoạn lúc bấm Space giải Rubik.
 */
export default function HumanCheckModal({ open, onVerified, onCancel }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'verifying' | 'verified' | 'slider'
  const [sliderVal, setSliderVal] = useState(0);
  const [targetVal, setTargetVal] = useState(72);
  const [error, setError] = useState('');

  const honeypotRef = useRef(null);
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (open) {
      const existing = getHumanSessionInfo();
      if (existing) {
        setStatus('verified');
      } else {
        setStatus('idle');
      }
      setSliderVal(0);
      setTargetVal(Math.floor(58 + Math.random() * 28)); // 58% -> 86%
      setError('');
      openedAtRef.current = performance.now();
    }
  }, [open]);

  if (!open) return null;

  const handleOneClickVerify = (e) => {
    if (!isTrustedInput(e)) {
      setError('Phát hiện sự kiện giả lập từ script (isTrusted = false).');
      return;
    }
    if (honeypotRef.current && honeypotRef.current.value) {
      setError('Bẫy chống Bot (Honeypot) đã chặn yêu cầu.');
      return;
    }

    setError('');
    setStatus('verifying');

    setTimeout(() => {
      const autoFlags = detectAutomation();
      if (autoFlags.length > 0) {
        // Nếu trình duyệt có cờ tự động hóa, yêu cầu kéo thanh trượt khớp khối Rubik
        setStatus('slider');
        setError('Môi trường cần xác minh bổ sung: Hãy kéo khối Rubik khớp vào ô đích.');
        return;
      }

      setStatus('verified');
      setTimeout(() => {
        onVerified();
      }, 380);
    }, 320);
  };

  const handleSliderRelease = (e) => {
    if (!isTrustedInput(e)) {
      setError('Sự kiện kéo không hợp lệ.');
      setSliderVal(0);
      return;
    }
    if (Math.abs(sliderVal - targetVal) <= 7) {
      setError('');
      setStatus('verified');
      setTimeout(() => {
        onVerified();
      }, 350);
    } else {
      setError('Chưa khớp vị trí ô đích, hãy kéo khối 🧊 trùng vào khung vàng!');
      setSliderVal(0);
    }
  };

  const stats = getSecurityStats();
  const sessionInfo = getHumanSessionInfo();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 8, 16, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000
    }}>
      <div style={{
        width: '92%',
        maxWidth: '410px',
        background: 'linear-gradient(180deg, #0f1b33 0%, #0a1122 100%)',
        border: status === 'verified' ? '1.5px solid #22c55e' : '1.5px solid rgba(56, 189, 248, 0.45)',
        borderRadius: '18px',
        padding: '22px 24px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: status === 'verified'
                ? 'rgba(34, 197, 94, 0.18)'
                : 'rgba(56, 189, 248, 0.15)',
              border: status === 'verified'
                ? '1px solid #22c55e'
                : '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>
              {status === 'verified' ? '✅' : '🛡️'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: '800' }}>
                Khiên Bảo Vệ Smart Anti-Bot
              </h3>
              <p style={{ margin: 0, fontSize: '0.73rem', color: '#94a3b8' }}>
                Xác thực 1 chạm • Tự động duy trì 24 giờ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '1.15rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Honeypot ẩn bắt bot tự điền form */}
        <input
          ref={honeypotRef}
          type="text"
          name="rubik_bot_trap_field"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
        />

        {/* Hộp kiểm 1 chạm phong cách Cloudflare Turnstile */}
        {status !== 'slider' ? (
          <div
            onClick={status === 'idle' ? handleOneClickVerify : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#090f1d',
              border: status === 'verified'
                ? '1.5px solid #22c55e'
                : '1.5px solid #1e293b',
              cursor: status === 'idle' ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              marginBottom: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                border: status === 'verified'
                  ? '2px solid #22c55e'
                  : status === 'verifying'
                    ? '2px solid #38bdf8'
                    : '2px solid #64748b',
                background: status === 'verified' ? '#22c55e' : '#111c34',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: '900',
                fontSize: '0.9rem'
              }}>
                {status === 'verified' ? '✓' : status === 'verifying' ? '⏳' : ''}
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>
                  {status === 'verified'
                    ? 'Đã xác minh bạn là Người Chơi Thật'
                    : status === 'verifying'
                      ? 'Đang kiểm tra chữ ký thiết bị...'
                      : 'Bấm vào đây để xác minh nhanh'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  {sessionInfo
                    ? `Xác thực lúc ${sessionInfo.verifiedAt || 'hôm nay'} (${sessionInfo.method})`
                    : 'Kiểm tra phần cứng isTrusted & chống Script'}
                </div>
              </div>
            </div>

            <span style={{
              fontSize: '0.66rem',
              padding: '3px 7px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.1)',
              color: '#38bdf8',
              fontWeight: '700'
            }}>
              Smart WAF
            </span>
          </div>
        ) : (
          /* Thanh trượt khớp khối Rubik dự phòng khi nghi ngờ môi trường tự động */
          <div style={{
            padding: '14px',
            borderRadius: '12px',
            background: '#090f1d',
            border: '1px solid #1e293b',
            marginBottom: '14px'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fbbf24', marginBottom: '10px' }}>
              Kéo mảnh Rubik 🧊 trùng vào ô đích màu vàng:
            </div>
            <div style={{
              position: 'relative',
              height: '42px',
              background: '#111c34',
              borderRadius: '8px',
              marginBottom: '10px',
              border: '1px solid #1e293b',
              overflow: 'hidden'
            }}>
              {/* Ô đích */}
              <div style={{
                position: 'absolute',
                left: `calc(${targetVal}% - 18px)`,
                top: '4px',
                width: '34px',
                height: '32px',
                borderRadius: '6px',
                border: '2px dashed #facc15',
                background: 'rgba(250, 204, 21, 0.15)'
              }} />
              {/* Khối Rubik di chuyển */}
              <div style={{
                position: 'absolute',
                left: `calc(${sliderVal}% - 16px)`,
                top: '5px',
                width: '32px',
                height: '30px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(56, 189, 248, 0.5)'
              }}>
                🧊
              </div>
            </div>
            <input
              type="range"
              min={5}
              max={92}
              value={sliderVal}
              onChange={(e) => setSliderVal(Number(e.target.value))}
              onPointerUp={handleSliderRelease}
              onKeyUp={handleSliderRelease}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
        )}

        {/* Thông số bảo vệ thời gian thực */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '8px',
          marginBottom: '12px'
        }}>
          <div style={{ background: '#111c34', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid #192642' }}>
            <div style={{ fontSize: '0.66rem', color: '#64748b' }}>Chặn Bot Spam</div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#38bdf8' }}>{stats.blockedBotRequests}</div>
          </div>
          <div style={{ background: '#111c34', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid #192642' }}>
            <div style={{ fontSize: '0.66rem', color: '#64748b' }}>Chặn Nguồn Độc</div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#4ade80' }}>{stats.blockedMaliciousPayloads}</div>
          </div>
          <div style={{ background: '#111c34', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid #192642' }}>
            <div style={{ fontSize: '0.66rem', color: '#64748b' }}>Tường Lửa P2P</div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#c084fc' }}>{stats.blockedP2PFloods}</div>
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: '12px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            fontSize: '0.75rem',
            textAlign: 'center'
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: '1px solid #1e293b',
              background: '#111c34',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
