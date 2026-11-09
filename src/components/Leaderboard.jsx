import React, { useState, useEffect } from 'react';

// Anti-cheat & mock initial verified leaderboard
const INITIAL_LEADERBOARD = [
  { id: 'lb_1', name: 'Max Park', time: '03.134', timeMs: 3134, date: '2026-11-01', provider: 'google', verified: true, scramble: "F2 U2 R' D2 R' F2 L' B2 D2 F2" },
  { id: 'lb_2', name: 'Yiheng Wang', time: '04.120', timeMs: 4120, date: '2026-11-02', provider: 'google', verified: true, scramble: "U R2 F2 D' B2 L2 U2 F2 D B2" },
  { id: 'lb_3', name: 'Luke Garrett', time: '05.030', timeMs: 5030, date: '2026-11-05', provider: 'github', verified: true, scramble: "R' D2 F2 L' B2 U2 R' F2 L2 U" },
  { id: 'lb_4', name: 'Minh Toan', time: '09.450', timeMs: 9450, date: '2026-11-08', provider: 'github', verified: true, scramble: "U2 F2 R' U2 L F2 R' B2 D2" },
  { id: 'lb_5', name: 'SpeedCuberVN', time: '12.820', timeMs: 12820, date: '2026-11-09', provider: 'email', verified: true, scramble: "D2 B2 L2 U' R2 F2 D' L2 U2" }
];

export default function Leaderboard({ currentUser, onOpenAuth, newSolve }) {
  const [scores, setScores] = useState(() => {
    const saved = localStorage.getItem('rubik_leaderboard');
    return saved ? JSON.parse(saved) : INITIAL_LEADERBOARD;
  });

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'mine'
  const [cheatWarning, setCheatWarning] = useState('');

  // Handle incoming new solve from Timer
  useEffect(() => {
    if (!newSolve) return;

    // 1. Anti-cheat rule: impossible human time under 3.0s
    if (newSolve.timeMs < 3000) {
      setCheatWarning('⚠️ Phát hiện thời gian bất thường (< 3.0s). Kỷ lục bị từ chối để chống gian lận/tool!');
      return;
    }

    // 2. Anti-clone rule: must be logged in to submit score
    if (!currentUser) {
      setCheatWarning('⚠️ Bạn chưa đăng nhập! Vui lòng đăng nhập tài khoản xác thực để ghi danh tránh nick clone.');
      return;
    }

    setCheatWarning('');
    const newEntry = {
      id: `lb_${Date.now()}`,
      name: currentUser.name,
      time: (newSolve.timeMs / 1000).toFixed(3),
      timeMs: newSolve.timeMs,
      date: new Date().toISOString().split('T')[0],
      provider: currentUser.provider || 'google',
      verified: true,
      scramble: newSolve.scramble || 'WCA Scramble'
    };

    setScores(prev => {
      const updated = [...prev, newEntry].sort((a, b) => a.timeMs - b.timeMs);
      localStorage.setItem('rubik_leaderboard', JSON.stringify(updated));
      return updated;
    });
  }, [newSolve, currentUser]);

  const displayedScores = activeTab === 'mine' && currentUser
    ? scores.filter(s => s.name === currentUser.name)
    : scores;

  return (
    <div style={{
      maxWidth: '850px',
      margin: '0 auto',
      padding: '24px 20px',
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🏆</span>
            <span style={{ background: 'linear-gradient(135deg, #facc15, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Bảng Vàng Speedcubing
            </span>
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Hệ thống xếp hạng thời gian giải Rubik • Chống nick ảo & gian lận điểm
          </p>
        </div>

        {/* Auth prompt if guest */}
        {!currentUser ? (
          <button
            onClick={onOpenAuth}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #3b82f6',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            🛡️ Đăng nhập để ghi danh
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155' }}>
            <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: '700' }}>● Đã xác minh:</span>
            <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '600' }}>{currentUser.name}</span>
          </div>
        )}
      </div>

      {/* Cheat / Clone Warning Alert */}
      {cheatWarning && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '0.9rem',
          marginBottom: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{cheatWarning}</span>
          {!currentUser && (
            <button
              onClick={onOpenAuth}
              style={{
                marginLeft: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Đăng nhập ngay
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'all' ? '#334155' : '#1e293b',
            color: activeTab === 'all' ? '#f8fafc' : '#94a3b8',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          🌐 Toàn Cầu
        </button>

        <button
          onClick={() => {
            if (!currentUser) onOpenAuth();
            else setActiveTab('mine');
          }}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'mine' ? '#334155' : '#1e293b',
            color: activeTab === 'mine' ? '#f8fafc' : '#94a3b8',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          👤 Kỷ Lục Của Tôi
        </button>
      </div>

      {/* Leaderboard Table */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 18px', width: '70px' }}>Hạng</th>
              <th style={{ padding: '12px 18px' }}>Cuber</th>
              <th style={{ padding: '12px 18px' }}>Thời Gian</th>
              <th style={{ padding: '12px 18px', display: 'none', maxWidth: '200px' }}>Scramble</th>
              <th style={{ padding: '12px 18px', width: '120px' }}>Ngày</th>
            </tr>
          </thead>
          <tbody>
            {displayedScores.map((item, index) => {
              const isTop1 = index === 0;
              const isTop2 = index === 1;
              const isTop3 = index === 2;

              return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #1e293b',
                    background: isTop1 ? 'rgba(250, 204, 21, 0.05)' : 'transparent',
                    transition: 'background 0.15s'
                  }}
                >
                  {/* Rank */}
                  <td style={{ padding: '14px 18px', fontWeight: '800' }}>
                    {isTop1 && <span style={{ fontSize: '1.25rem' }}>🥇</span>}
                    {isTop2 && <span style={{ fontSize: '1.25rem' }}>🥈</span>}
                    {isTop3 && <span style={{ fontSize: '1.25rem' }}>🥉</span>}
                    {!isTop1 && !isTop2 && !isTop3 && (
                      <span style={{ color: '#64748b', fontSize: '1rem' }}>#{index + 1}</span>
                    )}
                  </td>

                  {/* Player Name & Anti-Clone Badge */}
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        color: '#38bdf8'
                      }}>
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '700', color: isTop1 ? '#facc15' : '#f8fafc', fontSize: '0.95rem' }}>
                            {item.name}
                          </span>
                          {item.verified && (
                            <span title="Tài khoản đã xác thực chống Clone" style={{ color: '#38bdf8', fontSize: '0.85rem' }}>
                              🛡️
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Xác thực qua {item.provider || 'Google'}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Time */}
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '1.15rem',
                      fontWeight: '800',
                      color: isTop1 ? '#facc15' : '#38bdf8'
                    }}>
                      {item.time}s
                    </span>
                  </td>

                  {/* Date */}
                  <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.85rem' }}>
                    {item.date}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
