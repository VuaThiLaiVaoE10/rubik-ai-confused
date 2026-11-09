import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- HÀM TIỆN ÍCH (WCA UTILITIES) ---
function generateWcaScramble(length = 20) {
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const getAxis = (faceIndex) => Math.floor(faceIndex / 2);

  const scramble = [];
  let lastFace = -1;
  let secondLastFace = -1;

  for (let i = 0; i < length; i++) {
    let faceIndex;
    do {
      faceIndex = Math.floor(Math.random() * faces.length);
    } while (
      faceIndex === lastFace ||
      (lastFace !== -1 &&
        secondLastFace !== -1 &&
        getAxis(faceIndex) === getAxis(lastFace) &&
        faceIndex === secondLastFace)
    );

    const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
    scramble.push(`${faces[faceIndex]}${modifier}`);

    secondLastFace = lastFace;
    lastFace = faceIndex;
  }

  return scramble.join(' ');
}

function formatTimeMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '--:--.---';
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function calculateAo5(solvesList) {
  if (!solvesList || solvesList.length < 5) return null;
  const recentFive = solvesList.slice(0, 5).map((s) => s.timeMs);
  const sorted = [...recentFive].sort((a, b) => a - b);
  const middleThree = sorted.slice(1, 4);
  const sum = middleThree.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / 3);
}

const TIMER_STATE = {
  IDLE: 'IDLE',
  HOLDING_WARN: 'WARN', // < 0.3s: Đỏ/Cam (Chưa sẵn sàng)
  HOLDING_PREP: 'PREP', // 0.3s - 0.5s: Cam (Đang chuẩn bị)
  READY: 'READY',       // >= 0.5s: Xanh lá (Sẵn sàng)
  RUNNING: 'RUNNING',   // Đang chạy
  STOPPED: 'STOPPED',   // Vừa dừng
};

// --- COMPONENT CHÍNH (ĐỘC LẬP TRONG 1 FILE DUY NHẤT) ---
export default function Timer({ onSolveComplete }) {
  const [scramble, setScramble] = useState(() => generateWcaScramble(20));
  const [displayTimeMs, setDisplayTimeMs] = useState(0);
  const [timerState, setTimerState] = useState(TIMER_STATE.IDLE);
  const [holdProgress, setHoldProgress] = useState(0);
  const [solves, setSolves] = useState([]);
  const [lastEmittedPayload, setLastEmittedPayload] = useState(null);

  const stateRef = useRef(TIMER_STATE.IDLE);
  const holdStartTimeRef = useRef(0);
  const runStartTimeRef = useRef(0);
  const holdRafRef = useRef(null);
  const runRafRef = useRef(null);
  const scrambleRef = useRef(scramble);
  const onSolveCompleteRef = useRef(onSolveComplete);

  useEffect(() => {
    scrambleRef.current = scramble;
  }, [scramble]);

  useEffect(() => {
    onSolveCompleteRef.current = onSolveComplete;
  }, [onSolveComplete]);

  const updateTimerState = useCallback((newState) => {
    stateRef.current = newState;
    setTimerState(newState);
  }, []);

  const handleNewScramble = useCallback((e) => {
    if (e) e.stopPropagation();
    if (stateRef.current === TIMER_STATE.RUNNING) return;
    setScramble(generateWcaScramble(20));
  }, []);

  const startHold = useCallback(() => {
    if (stateRef.current !== TIMER_STATE.IDLE) return;

    holdStartTimeRef.current = performance.now();
    setDisplayTimeMs(0);
    setHoldProgress(0);
    updateTimerState(TIMER_STATE.HOLDING_WARN);

    const checkHoldLoop = (now) => {
      const elapsed = now - holdStartTimeRef.current;
      const pct = Math.min(100, (elapsed / 500) * 100);
      setHoldProgress(pct);

      if (elapsed >= 500) {
        updateTimerState(TIMER_STATE.READY);
        setHoldProgress(100);
        return;
      } else if (elapsed >= 300) {
        if (stateRef.current !== TIMER_STATE.HOLDING_PREP) {
          updateTimerState(TIMER_STATE.HOLDING_PREP);
        }
      } else {
        if (stateRef.current !== TIMER_STATE.HOLDING_WARN) {
          updateTimerState(TIMER_STATE.HOLDING_WARN);
        }
      }

      holdRafRef.current = requestAnimationFrame(checkHoldLoop);
    };

    holdRafRef.current = requestAnimationFrame(checkHoldLoop);
  }, [updateTimerState]);

  const releaseHold = useCallback(() => {
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }

    if (stateRef.current === TIMER_STATE.STOPPED) {
      updateTimerState(TIMER_STATE.IDLE);
      setHoldProgress(0);
      return;
    }

    if (
      stateRef.current === TIMER_STATE.HOLDING_WARN ||
      stateRef.current === TIMER_STATE.HOLDING_PREP
    ) {
      updateTimerState(TIMER_STATE.IDLE);
      setHoldProgress(0);
      return;
    }

    if (stateRef.current === TIMER_STATE.READY) {
      runStartTimeRef.current = performance.now();
      setHoldProgress(0);
      updateTimerState(TIMER_STATE.RUNNING);

      const updateClockLoop = (now) => {
        if (stateRef.current !== TIMER_STATE.RUNNING) return;
        const currentElapsed = now - runStartTimeRef.current;
        setDisplayTimeMs(Math.floor(currentElapsed));
        runRafRef.current = requestAnimationFrame(updateClockLoop);
      };

      runRafRef.current = requestAnimationFrame(updateClockLoop);
    }
  }, [updateTimerState]);

  const stopRunningTimer = useCallback(() => {
    if (stateRef.current !== TIMER_STATE.RUNNING) return;

    const endTime = performance.now();
    if (runRafRef.current) {
      cancelAnimationFrame(runRafRef.current);
      runRafRef.current = null;
    }

    const finalTimeMs = Math.max(1, Math.floor(endTime - runStartTimeRef.current));
    const formatted = formatTimeMs(finalTimeMs);
    const usedScramble = scrambleRef.current;

    setDisplayTimeMs(finalTimeMs);
    updateTimerState(TIMER_STATE.STOPPED);

    const payload = {
      timeMs: finalTimeMs,
      formattedTime: formatted,
      scramble: usedScramble,
    };

    const newSolveItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...payload,
    };

    setSolves((prev) => [newSolveItem, ...prev]);
    setLastEmittedPayload(payload);
    setScramble(generateWcaScramble(20));

    // Phát callback ra bên ngoài nếu component cha truyền vào, hoặc log mặc định
    if (typeof onSolveCompleteRef.current === 'function') {
      onSolveCompleteRef.current(payload);
    } else {
      console.log('[WCA Timer - onSolveComplete]:', payload);
    }
  }, [updateTimerState]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      if (stateRef.current === TIMER_STATE.RUNNING) {
        e.preventDefault();
        stopRunningTimer();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        if (stateRef.current === TIMER_STATE.IDLE) {
          startHold();
        }
      }
    };

    const handleKeyUp = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      if (stateRef.current === TIMER_STATE.STOPPED) {
        releaseHold();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        releaseHold();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
      if (runRafRef.current) cancelAnimationFrame(runRafRef.current);
    };
  }, [startHold, releaseHold, stopRunningTimer]);

  const handleTouchStart = (e) => {
    if (e.target.closest('button')) return;
    if (e.cancelable) e.preventDefault();

    if (stateRef.current === TIMER_STATE.RUNNING) {
      stopRunningTimer();
    } else if (stateRef.current === TIMER_STATE.IDLE) {
      startHold();
    }
  };

  const handleTouchEnd = (e) => {
    if (e.target.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    releaseHold();
  };

  const handleDeleteSolve = (id, e) => {
    e.stopPropagation();
    setSolves((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearSession = (e) => {
    e.stopPropagation();
    setSolves([]);
    setDisplayTimeMs(0);
    setLastEmittedPayload(null);
  };

  const personalBestMs = solves.length > 0 ? Math.min(...solves.map((s) => s.timeMs)) : null;
  const currentAo5Ms = calculateAo5(solves);

  const getVisualConfig = () => {
    switch (timerState) {
      case TIMER_STATE.HOLDING_WARN:
        return {
          color: '#ef4444',
          glow: '0 0 36px rgba(239, 68, 68, 0.35)',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeBorder: 'rgba(239, 68, 68, 0.4)',
          statusText: 'CHƯA SẴN SÀNG (< 0.3s — GIỮ TIẾP...)',
        };
      case TIMER_STATE.HOLDING_PREP:
        return {
          color: '#f59e0b',
          glow: '0 0 36px rgba(245, 158, 11, 0.35)',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeBorder: 'rgba(245, 158, 11, 0.4)',
          statusText: 'ĐANG CHUẨN BỊ (0.3s - 0.5s)...',
        };
      case TIMER_STATE.READY:
        return {
          color: '#10b981',
          glow: '0 0 45px rgba(16, 185, 129, 0.45)',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeBorder: 'rgba(16, 185, 129, 0.45)',
          statusText: 'SẴN SÀNG (READY) — THẢ ĐỂ CHẠY!',
        };
      case TIMER_STATE.RUNNING:
        return {
          color: '#38bdf8',
          glow: '0 0 40px rgba(56, 189, 248, 0.3)',
          badgeBg: 'rgba(56, 189, 248, 0.12)',
          badgeBorder: 'rgba(56, 189, 248, 0.35)',
          statusText: 'ĐANG BẤM GIỜ — NHẤN PHÍM BẤT KỲ HOẶC CHẠM ĐỂ DỪNG',
        };
      default:
        return {
          color: '#f8fafc',
          glow: 'none',
          badgeBg: 'rgba(148, 163, 184, 0.1)',
          badgeBorder: 'rgba(148, 163, 184, 0.2)',
          statusText: 'GIỮ PHÍM SPACE HOẶC CHẠM GIỮ MÀN HÌNH 0.5 GIÂY ĐỂ BẮT ĐẦU',
        };
    }
  };

  const visual = getVisualConfig();
  const isRunning = timerState === TIMER_STATE.RUNNING;

  return (
    <div style={styles.wrapper} className="w-full min-h-screen bg-slate-950 text-slate-100 select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        .wca-mono {
          font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      <div style={styles.container}>
        {/* 1. SCRAMBLE BAR */}
        <header
          style={{
            ...styles.scrambleCard,
            opacity: isRunning ? 0.25 : 1,
            pointerEvents: isRunning ? 'none' : 'auto',
          }}
        >
          <div style={styles.scrambleTopRow}>
            <span style={styles.wcaBadge}>WCA 3x3x3 SCRAMBLE</span>
            <button type="button" onClick={handleNewScramble} style={styles.scrambleBtn}>
              ↻ Đổi Scramble
            </button>
          </div>
          <div className="wca-mono" style={styles.scrambleText}>
            {scramble}
          </div>
        </header>

        {/* 2. ĐỒNG HỒ TRUNG TÂM */}
        <main
          style={{
            ...styles.timerZone,
            borderColor:
              timerState === TIMER_STATE.READY
                ? 'rgba(16, 185, 129, 0.5)'
                : timerState === TIMER_STATE.HOLDING_WARN || timerState === TIMER_STATE.HOLDING_PREP
                ? 'rgba(245, 158, 11, 0.45)'
                : 'rgba(51, 65, 85, 0.6)',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div
            style={{
              ...styles.statusPill,
              backgroundColor: visual.badgeBg,
              borderColor: visual.badgeBorder,
              color: visual.color,
            }}
          >
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: visual.color,
                boxShadow: `0 0 10px ${visual.color}`,
              }}
            />
            <span>{visual.statusText}</span>
          </div>

          <div
            className="wca-mono"
            style={{
              ...styles.mainClock,
              color: visual.color,
              textShadow: visual.glow,
              transform: timerState === TIMER_STATE.READY ? 'scale(1.03)' : 'scale(1)',
            }}
          >
            {formatTimeMs(displayTimeMs)}
          </div>

          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressBar,
                width: `${holdProgress}%`,
                backgroundColor: visual.color,
              }}
            />
          </div>

          <div style={styles.holdLegend}>
            <span>&lt; 0.3s: Đỏ/Cam (Chưa sẵn sàng)</span>
            <span>•</span>
            <span>≥ 0.5s: Xanh lá (Ready)</span>
          </div>
        </main>

        {/* 3. CHỈ SỐ PB & Ao5 */}
        <section
          style={{
            ...styles.statsGrid,
            opacity: isRunning ? 0.2 : 1,
            pointerEvents: isRunning ? 'none' : 'auto',
          }}
        >
          <div style={styles.statCard}>
            <span style={styles.statLabel}>KỶ LỤC CÁ NHÂN (PB)</span>
            <span className="wca-mono" style={{ ...styles.statValue, color: '#fbbf24' }}>
              {personalBestMs !== null ? formatTimeMs(personalBestMs) : '--:--.---'}
            </span>
            <span style={styles.statSub}>Thành tích tốt nhất phiên</span>
          </div>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>TRUNG BÌNH 5 LẦN (Ao5)</span>
            <span className="wca-mono" style={{ ...styles.statValue, color: '#38bdf8' }}>
              {currentAo5Ms !== null ? formatTimeMs(currentAo5Ms) : '--:--.---'}
            </span>
            <span style={styles.statSub}>
              {solves.length < 5
                ? `Cần thêm ${5 - solves.length} lần giải nữa`
                : 'Chuẩn WCA (bỏ 1 nhanh nhất & 1 chậm nhất)'}
            </span>
          </div>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>SỐ LẦN GIẢI (SOLVES)</span>
            <span className="wca-mono" style={{ ...styles.statValue, color: '#e2e8f0' }}>
              {solves.length}
            </span>
            <span style={styles.statSub}>
              {lastEmittedPayload
                ? `Vừa gửi: ${lastEmittedPayload.formattedTime} (${lastEmittedPayload.timeMs}ms)`
                : 'Sẵn sàng gửi dữ liệu onSolveComplete'}
            </span>
          </div>
        </section>

        {/* 4. BẢNG LỊCH SỬ PHIÊN CHƠI */}
        <section
          style={{
            ...styles.historyCard,
            opacity: isRunning ? 0.2 : 1,
            pointerEvents: isRunning ? 'none' : 'auto',
          }}
        >
          <div style={styles.historyHeader}>
            <h3 style={styles.historyTitle}>Lịch sử phiên giải (Session History)</h3>
            {solves.length > 0 && (
              <button type="button" onClick={handleClearSession} style={styles.clearBtn}>
                Xóa tất cả
              </button>
            )}
          </div>

          {solves.length === 0 ? (
            <div style={styles.emptyState}>
              Chưa có lượt giải nào. Hãy giữ phím <strong>Space</strong> hoặc chạm giữ màn hình để bắt đầu!
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeadRow}>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Thời gian</th>
                    <th style={styles.th}>Ao5</th>
                    <th style={styles.th}>Scramble</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {solves.map((solve, idx) => {
                    const solveNumber = solves.length - idx;
                    const ao5AtSolve = calculateAo5(solves.slice(idx));
                    const isPB = solve.timeMs === personalBestMs;

                    return (
                      <tr key={solve.id} style={styles.tr}>
                        <td className="wca-mono" style={styles.tdIndex}>#{solveNumber}</td>
                        <td className="wca-mono" style={styles.tdTime}>
                          <span>{solve.formattedTime}</span>
                          {isPB && <span style={styles.pbTag}>PB</span>}
                        </td>
                        <td className="wca-mono" style={styles.tdAo5}>
                          {ao5AtSolve !== null ? formatTimeMs(ao5AtSolve) : '-'}
                        </td>
                        <td className="wca-mono" style={styles.tdScramble}>{solve.scramble}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSolve(solve.id, e)}
                            style={styles.deleteRowBtn}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    backgroundColor: '#090d16',
    color: '#f8fafc',
    minHeight: '100vh',
    padding: '24px 16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    boxSizing: 'border-box',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  container: {
    maxWidth: '960px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  scrambleCard: {
    backgroundColor: '#111827',
    border: '1px solid rgba(51, 65, 85, 0.65)',
    borderRadius: '16px',
    padding: '18px 24px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
    transition: 'opacity 0.2s ease',
  },
  scrambleTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  wcaBadge: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '4px 10px',
    borderRadius: '999px',
    border: '1px solid rgba(56, 189, 248, 0.25)',
  },
  scrambleBtn: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  scrambleText: {
    fontSize: 'clamp(18px, 2.5vw, 24px)',
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '0.06em',
    lineHeight: 1.4,
    textAlign: 'center',
  },
  timerZone: {
    backgroundColor: '#0f172a',
    border: '2px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '24px',
    padding: '48px 20px 36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    touchAction: 'none',
    boxShadow: 'inset 0 2px 20px rgba(0, 0, 0, 0.5), 0 12px 30px -10px rgba(0, 0, 0, 0.6)',
    transition: 'border-color 0.15s ease',
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    marginBottom: '20px',
    textAlign: 'center',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  mainClock: {
    fontSize: 'clamp(54px, 13vw, 116px)',
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    margin: '8px 0 28px',
    transition: 'color 0.08s ease, transform 0.12s ease',
  },
  progressTrack: {
    width: 'min(360px, 85%)',
    height: '6px',
    backgroundColor: '#1e293b',
    borderRadius: '999px',
    overflow: 'hidden',
    marginBottom: '14px',
  },
  progressBar: {
    height: '100%',
    borderRadius: '999px',
    transition: 'background-color 0.1s ease',
  },
  holdLegend: {
    display: 'flex',
    gap: '10px',
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 500,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    transition: 'opacity 0.2s ease',
  },
  statCard: {
    backgroundColor: '#111827',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '16px',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: '#94a3b8',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 800,
  },
  statSub: {
    fontSize: '12px',
    color: '#64748b',
  },
  historyCard: {
    backgroundColor: '#111827',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '16px',
    padding: '20px 24px',
    transition: 'opacity 0.2s ease',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  historyTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    textAlign: 'center',
    padding: '32px 16px',
    color: '#64748b',
    fontSize: '14px',
    border: '1px dashed #1e293b',
    borderRadius: '12px',
  },
  tableWrapper: {
    overflowX: 'auto',
    maxHeight: '320px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '14px',
  },
  tableHeadRow: {
    borderBottom: '1px solid #1e293b',
    color: '#94a3b8',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  th: {
    padding: '10px 12px',
    fontWeight: 600,
  },
  tr: {
    borderBottom: '1px solid rgba(30, 41, 59, 0.6)',
  },
  tdIndex: {
    padding: '12px',
    color: '#64748b',
    fontWeight: 600,
  },
  tdTime: {
    padding: '12px',
    fontWeight: 700,
    color: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pbTag: {
    fontSize: '10px',
    fontWeight: 800,
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
    color: '#fbbf24',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  tdAo5: {
    padding: '12px',
    color: '#38bdf8',
    fontWeight: 600,
  },
  tdScramble: {
    padding: '12px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  td: {
    padding: '12px',
  },
  deleteRowBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 8px',
  },
};
