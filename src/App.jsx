import React, { useState, useEffect, useRef } from 'react';
import RubikCube from './components/RubikCube';
import RubikScanner from './components/RubikScanner';
import AuthModal from './components/AuthModal';
import { generateScramble, solveScramble } from './utils/rubikSolver';

export default function App() {
  // Timer State: 'idle' | 'holding' | 'ready' | 'running'
  const [timerState, setTimerState] = useState('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [scramble, setScramble] = useState(() => generateScramble(20));
  
  // Solves History
  const [solves, setSolves] = useState(() => {
    const saved = localStorage.getItem('user_solves');
    return saved ? JSON.parse(saved) : [
      { id: 1, time: 14.52, date: '09/11' },
      { id: 2, time: 12.80, date: '09/11' }
    ];
  });

  // User Auth & Anti-Clone
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('rubik_user');
    return saved ? JSON.parse(saved) : {
      name: 'khoa.tt2611758',
      email: 'khoa.tt2611758@sis.hust.edu.vn',
      verified: true
    };
  });

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([
    { rank: 1, name: 'khoa.tt2611758', best: '0.71', avg: '1.02' },
    { rank: 2, name: 'tungtungvuadhur', best: '6.53', avg: '7.92' },
    { rank: 3, name: 'Người Tây Đồng Bằng', best: '6.55', avg: '11.57' },
    { rank: 4, name: 'tranduct757', best: '12.12', avg: '14.57' },
    { rank: 5, name: 'Tiến Dũng newbie', best: '12.14', avg: '14.75' },
    { rank: 6, name: 'khangspring', best: '15.30', avg: '15.76' },
    { rank: 7, name: 'nguniquaduong', best: '13.08', avg: '16.37' },
    { rank: 8, name: 'Minh Tiến', best: '13.46', avg: '18.36' },
    { rank: 9, name: 'vy hà', best: '17.40', avg: '23.67' },
    { rank: 10, name: 'Nhan', best: '18.72', avg: '24.31' }
  ]);

  // Modals
  const [show3DModal, setShow3DModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [solutionSteps, setSolutionSteps] = useState([]);
  const [isSolving, setIsSolving] = useState(false);

  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const timerStateRef = useRef('idle');
  const rubikRef = useRef(null);

  // Keep ref synchronized with state to avoid stale closures in event listeners
  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  // WCA Spacebar timer logic (Bulletproof with e.repeat handling)
  useEffect(() => {
    let holdTimeout = null;

    const handleKeyDown = (e) => {
      if (show3DModal || showScannerModal || isAuthOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

      const currentState = timerStateRef.current;

      if (e.code === 'Space') {
        e.preventDefault();

        // When running, pressing Space stops immediately
        if (currentState === 'running') {
          stopTimer();
          return;
        }

        // Ignore browser auto-repeat when holding key down
        if (e.repeat) return;

        if (currentState === 'idle') {
          setTimerState('holding');
          clearTimeout(holdTimeout);
          holdTimeout = setTimeout(() => {
            setTimerState('ready');
          }, 350); // 350ms hold -> turns green / READY
        }
      } else {
        // Any other key stops the timer if it's currently running
        if (currentState === 'running') {
          stopTimer();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        clearTimeout(holdTimeout);
        const currentState = timerStateRef.current;

        if (currentState === 'ready') {
          startTimer();
        } else if (currentState === 'holding') {
          setTimerState('idle');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      clearTimeout(holdTimeout);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [show3DModal, showScannerModal, isAuthOpen]);

  const startTimer = () => {
    setTimeMs(0);
    setTimerState('running');
    startTimeRef.current = performance.now();

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeMs(performance.now() - startTimeRef.current);
    }, 10);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    const finalMs = performance.now() - startTimeRef.current;
    setTimeMs(finalMs);
    setTimerState('idle');

    const finalSec = (finalMs / 1000).toFixed(2);
    const newSolve = {
      id: Date.now(),
      time: parseFloat(finalSec),
      date: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    };

    setSolves(prev => {
      const updated = [newSolve, ...prev];
      localStorage.setItem('user_solves', JSON.stringify(updated));
      return updated;
    });

    // Generate new scramble
    setScramble(generateScramble(20));
  };

  const formatDisplayTime = (ms) => {
    const totalSec = ms / 1000;
    return totalSec.toFixed(2);
  };

  const handleDeleteSolve = (id) => {
    setSolves(prev => {
      const filtered = prev.filter(s => s.id !== id);
      localStorage.setItem('user_solves', JSON.stringify(filtered));
      return filtered;
    });
  };

  // Stats
  const bestTime = solves.length > 0 ? Math.min(...solves.map(s => s.time)).toFixed(2) : '--';
  const meanTime = solves.length > 0 
    ? (solves.reduce((acc, s) => acc + s.time, 0) / solves.length).toFixed(2) 
    : '--';

  const handleSolveWithAI = async () => {
    if (!scramble) return;
    setIsSolving(true);
    try {
      const solution = solveScramble(scramble);
      setSolutionSteps(solution);
      if (solution.length > 0 && rubikRef.current) {
        await rubikRef.current.executeAlgorithm(solution, 200);
      }
    } catch (e) {
      alert('Lỗi tính toán: ' + e.message);
    } finally {
      setIsSolving(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#090f1d',
      color: '#e2e8f0',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      {/* 1. TOP HEADER */}
      <header style={{
        padding: '12px 28px',
        background: '#0d1629',
        borderBottom: '1px solid #192642',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            boxShadow: '0 2px 10px rgba(37, 99, 235, 0.4)'
          }}>
            ⏱️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', letterSpacing: '-0.01em', color: '#f8fafc' }}>
              Rubik Timer
            </h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
              Speedcubing practice
            </p>
          </div>
        </div>

        {/* User bar & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentUser && (
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', marginRight: '6px' }}>
              {currentUser.email || currentUser.name}
            </span>
          )}

          <button
            onClick={() => setShow3DModal(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #223558',
              background: '#131e36',
              color: '#38bdf8',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🧊 Rubik 3D & AI Giải
          </button>

          <button
            onClick={() => setShowScannerModal(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #223558',
              background: '#131e36',
              color: '#4ade80',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📷 Quét Camera
          </button>

          {currentUser ? (
            <button
              onClick={() => {
                localStorage.removeItem('rubik_user');
                setCurrentUser(null);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#cbd5e1',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Đăng xuất
            </button>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* 2. MAIN 3-COLUMN LAYOUT */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '260px 1fr 340px',
        padding: '20px 24px',
        gap: '20px',
        overflow: 'hidden'
      }}>
        {/* === LEFT COLUMN: THÀNH TÍCH & LỊCH SỬ === */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
          {/* Card: Thành tích của tôi */}
          <div style={{
            background: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>Thành tích của tôi</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{solves.length} lượt</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Best</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc' }}>{bestTime}</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mean</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc' }}>{meanTime}</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>ao5</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#94a3b8' }}>--</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>ao12</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#94a3b8' }}>--</div>
              </div>
            </div>
          </div>

          {/* Card: Lịch sử */}
          <div style={{
            background: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>Lịch sử</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mới nhất</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {solves.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem', marginTop: '20px' }}>
                  Chưa có lượt giải nào
                </div>
              ) : (
                solves.map((s, index) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#111c34',
                      border: '1px solid #192642',
                      marginBottom: '8px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{solves.length - index}</span>
                      <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{s.time}s</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleDeleteSolve(s.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* === CENTER COLUMN: GIANT TIMER & SCRAMBLE === */}
        <div style={{
          background: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          {/* Top of Center */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.08em', color: '#64748b' }}>
              NGƯỜI GIẢI
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#94a3b8' }}>
              {currentUser?.name || 'Khách'}
            </span>
          </div>

          {/* Scramble Display */}
          <div style={{ width: '100%', textAlign: 'center', maxWidth: '750px', margin: '20px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em' }}>SCRAMBLE 3×3</span>
              <span style={{ background: '#111c34', border: '1px solid #1a2a4c', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', color: '#94a3b8' }}>3×3</span>
              <button
                onClick={() => setScramble(generateScramble(20))}
                title="Đổi scramble mới"
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                🔄
              </button>
            </div>

            <div style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              lineHeight: 1.6,
              color: '#cbd5e1',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              padding: '12px 20px',
              background: '#090f1d',
              borderRadius: '10px',
              border: '1px solid #16223b'
            }}>
              {scramble}
            </div>
          </div>

          {/* GIANT TIMER DISPLAY */}
          <div
            onClick={() => {
              if (timerState === 'running') stopTimer();
              else if (timerState === 'idle') startTimer();
            }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              margin: 'auto 0'
            }}
          >
            <div style={{
              fontSize: '9.5rem',
              fontWeight: '900',
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', monospace",
              letterSpacing: '-2px',
              lineHeight: 1,
              color: timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#ffffff'),
              textShadow: timerState === 'ready' ? '0 0 40px rgba(34, 197, 94, 0.4)' : 'none',
              transition: 'color 0.1s ease'
            }}>
              {formatDisplayTime(timeMs)}
            </div>

            <div style={{
              marginTop: '18px',
              fontSize: '0.95rem',
              fontWeight: '600',
              color: timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#64748b')
            }}>
              {timerState === 'ready' ? '● Sẵn sàng' : (timerState === 'holding' ? '○ Giữ thêm một chút...' : (timerState === 'running' ? 'Đang bấm giờ...' : 'Sẵn sàng'))}
            </div>
          </div>

          {/* Instructions at Bottom */}
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', lineHeight: 1.6 }}>
            <div>Space: kiểm tra · giữ rồi thả để chạy · space lần nữa để dừng</div>
            <div>Hoặc bấm chuột vào đồng hồ để bắt đầu / dừng</div>
          </div>
        </div>

        {/* === RIGHT COLUMN: BẢNG XẾP HẠNG === */}
        <div style={{
          background: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f8fafc' }}>Bảng xếp hạng</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', background: '#111c34', padding: '3px 8px', borderRadius: '4px', border: '1px solid #1a2a4c', color: '#94a3b8' }}>
                Avg ▾
              </span>
              <button
                onClick={() => {}}
                style={{ background: '#111c34', border: '1px solid #1a2a4c', color: '#cbd5e1', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
              >
                Làm mới
              </button>
            </div>
          </div>

          <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: '#64748b' }}>
            Bấm tên người chơi để xem lịch sử.
          </p>

          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '30px 1fr 65px 65px',
            padding: '6px 10px',
            fontSize: '0.75rem',
            color: '#64748b',
            borderBottom: '1px solid #192642',
            fontWeight: '600'
          }}>
            <span>#</span>
            <span>Tài khoản</span>
            <span style={{ textAlign: 'right' }}>Best</span>
            <span style={{ textAlign: 'right' }}>Avg</span>
          </div>

          {/* Table Rows */}
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
            {leaderboard.map((item) => (
              <div
                key={item.rank}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 1fr 65px 65px',
                  padding: '9px 10px',
                  borderBottom: '1px solid #111c34',
                  fontSize: '0.82rem',
                  alignItems: 'center',
                  background: item.rank === 1 ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  borderRadius: '6px'
                }}
              >
                <span style={{ fontWeight: '700', color: item.rank <= 3 ? '#38bdf8' : '#64748b' }}>
                  {item.rank}
                </span>

                <span style={{
                  color: '#e2e8f0',
                  fontWeight: '600',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: '6px'
                }}>
                  {item.name}
                </span>

                <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#f8fafc' }}>
                  {item.best}
                </span>

                <span style={{ textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>
                  {item.avg}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MODAL: RUBIK 3D & AI GIẢI */}
      {show3DModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 10, 20, 0.88)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 24px',
            background: '#0d1629',
            borderBottom: '1px solid #192642',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>🧊</span>
              <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>Mô Phỏng Rubik 3D & AI Giải Tự Động</strong>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handleSolveWithAI}
                disabled={isSolving}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSolving ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  cursor: isSolving ? 'not-allowed' : 'pointer'
                }}
              >
                {isSolving ? '⏳ Đang giải...' : '✨ AI Giải Chuỗi Này'}
              </button>

              <button
                onClick={() => setShow3DModal(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#cbd5e1',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <RubikCube ref={rubikRef} />

            {solutionSteps.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                padding: '8px 14px',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '0.85rem'
              }}>
                <strong>Bước giải ({solutionSteps.length}): </strong>
                <span>{solutionSteps.join(' ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL: CAMERA SCANNER */}
      {showScannerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 10, 20, 0.88)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 24px',
            background: '#0d1629',
            borderBottom: '1px solid #192642',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>📷 Quét Màu Rubik Qua Camera</strong>
            <button
              onClick={() => setShowScannerModal(false)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              Đóng
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <RubikScanner onScanComplete={(state) => {
              alert(`Quét thành công: ${state}`);
              setShowScannerModal(false);
              setShow3DModal(true);
            }} />
          </div>
        </div>
      )}

      {/* 5. MODAL: AUTH */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(user) => setCurrentUser(user)}
      />
    </div>
  );
}
