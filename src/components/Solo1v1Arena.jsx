import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';

export default function Solo1v1Arena({
  currentUser,
  cameraActive,
  cameraHealth,
  puzzleType,
  generateScramble,
  formatTime,
  onExitSolo
}) {
  // Connection & Room state
  const [peerId, setPeerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'disconnected'
  const [connectionError, setConnectionError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Opponent info
  const [opponent, setOpponent] = useState(null); // { name, cameraActive, isHealthy }

  // Match / Round state
  const [roundNumber, setRoundNumber] = useState(1);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [currentScramble, setCurrentScramble] = useState('');
  const [matchState, setMatchState] = useState('idle'); // 'idle' | 'ready' | 'racing' | 'finished'

  // Local Timer state
  const [myTimerState, setMyTimerState] = useState('idle'); // 'idle' | 'holding' | 'ready' | 'running' | 'done'
  const [myTimeMs, setMyTimeMs] = useState(0);
  const [myFinalTime, setMyFinalTime] = useState(null);

  // Opponent Live state
  const [oppTimerState, setOppTimerState] = useState('idle'); // 'idle' | 'holding' | 'ready' | 'running' | 'done'
  const [oppLiveTimeMs, setOppLiveTimeMs] = useState(0);
  const [oppFinalTime, setOppFinalTime] = useState(null);

  // Floating reaction / chat toast
  const [reactions, setReactions] = useState([]);

  // Peer & Connection refs
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const timerStartTimestampRef = useRef(0);
  const holdTimeoutRef = useRef(null);
  const spacePressedRef = useRef(false);
  const lastTickSentRef = useRef(0);

  // Sound effects via Web Audio API (No external assets required!)
  const playSound = useCallback((type) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'ready') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'start') {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3); // C6
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else if (type === 'tick') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch {}
  }, []);

  // Broadcast reaction toast
  const addReactionToast = (emoji, text, fromMe = false) => {
    const id = Date.now() + Math.random();
    setReactions(prev => [...prev.slice(-4), { id, emoji, text, fromMe }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 3500);
  };

  // Safe message sender over WebRTC DataChannel
  const sendP2P = (data) => {
    if (connRef.current && connRef.current.open) {
      try {
        connRef.current.send(data);
      } catch (err) {
        console.error('Lỗi gửi P2P:', err);
      }
    }
  };

  // Cleanup helper
  const disconnectAll = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (connRef.current) {
      try { connRef.current.close(); } catch {}
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    setConnectionStatus('idle');
    setOpponent(null);
    setMatchState('idle');
    setMyTimerState('idle');
    setOppTimerState('idle');
  }, []);

  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  // Handle incoming P2P messages
  const handleP2PData = useCallback((data) => {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'HANDSHAKE': {
        setOpponent({
          name: data.name || 'Đối thủ',
          cameraActive: !!data.cameraActive,
          isHealthy: !!data.isHealthy
        });
        setConnectionStatus('connected');
        // If we are host, also sync initial scramble
        break;
      }

      case 'HANDSHAKE_ACK': {
        setOpponent({
          name: data.name || 'Đối thủ',
          cameraActive: !!data.cameraActive,
          isHealthy: !!data.isHealthy
        });
        setConnectionStatus('connected');
        break;
      }

      case 'CAMERA_UPDATE': {
        setOpponent(prev => prev ? {
          ...prev,
          cameraActive: !!data.cameraActive,
          isHealthy: !!data.isHealthy
        } : null);
        break;
      }

      case 'NEW_ROUND': {
        setCurrentScramble(data.scramble || '');
        setRoundNumber(data.roundNumber || 1);
        setMatchState('ready');
        setMyTimerState('idle');
        setMyTimeMs(0);
        setMyFinalTime(null);
        setOppTimerState('idle');
        setOppLiveTimeMs(0);
        setOppFinalTime(null);
        playSound('tick');
        break;
      }

      case 'TIMER_STATE': {
        setOppTimerState(data.state);
        break;
      }

      case 'TIMER_TICK': {
        setOppTimerState('running');
        setOppLiveTimeMs(data.timeMs);
        break;
      }

      case 'SOLVE_DONE': {
        setOppTimerState('done');
        setOppLiveTimeMs(data.timeMs);
        setOppFinalTime(data.timeMs);
        playSound('tick');
        break;
      }

      case 'REACTION': {
        addReactionToast(data.emoji, `${data.sender}: ${data.text || ''}`, false);
        break;
      }

      case 'RESTART_REQUEST': {
        // Guest receives new round from host
        break;
      }

      default:
        break;
    }
  }, [playSound]);

  // Setup connection handlers
  const setupConnection = useCallback((conn, isHostSide) => {
    connRef.current = conn;

    conn.on('open', () => {
      setConnectionStatus('connected');
      setConnectionError('');

      if (isHostSide) {
        // Send handshake
        conn.send({
          type: 'HANDSHAKE',
          name: currentUser.name || 'Người chơi 1',
          cameraActive,
          isHealthy: cameraHealth.isHealthy
        });

        // Generate initial scramble
        const initialScramble = generateScramble(puzzleType);
        setCurrentScramble(initialScramble);
        setMatchState('ready');
        conn.send({
          type: 'NEW_ROUND',
          scramble: initialScramble,
          puzzleType,
          roundNumber: 1
        });
      } else {
        // Ack handshake
        conn.send({
          type: 'HANDSHAKE_ACK',
          name: currentUser.name || 'Người chơi 2',
          cameraActive,
          isHealthy: cameraHealth.isHealthy
        });
      }
    });

    conn.on('data', (data) => {
      handleP2PData(data);
    });

    conn.on('close', () => {
      setConnectionStatus('disconnected');
      setConnectionError('Đối thủ đã ngắt kết nối hoặc rời phòng.');
      setOpponent(null);
    });

    conn.on('error', (err) => {
      console.error('Peer connection error:', err);
      setConnectionError('Lỗi kết nối P2P: ' + (err.message || 'Không thể duy trì luồng'));
    });
  }, [currentUser, cameraActive, cameraHealth, puzzleType, generateScramble, handleP2PData]);

  // CREATE ROOM (HOST)
  const handleCreateRoom = () => {
    disconnectAll();
    setConnectionStatus('creating');
    setConnectionError('');
    setIsHost(true);

    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const fullRoomId = `hust-rubik-solo-${randomCode}`;
    setRoomCode(randomCode);

    try {
      const peer = new Peer(fullRoomId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        setConnectionStatus('waiting');
      });

      peer.on('connection', (conn) => {
        setupConnection(conn, true);
      });

      peer.on('error', (err) => {
        console.error('Peer init error:', err);
        setConnectionError('Không thể tạo phòng đấu P2P. Thử lại sau giây lát!');
        setConnectionStatus('idle');
      });
    } catch (err) {
      setConnectionError('Lỗi khởi tạo PeerJS: ' + err.message);
      setConnectionStatus('idle');
    }
  };

  // JOIN ROOM (GUEST)
  const handleJoinRoom = () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      alert('Vui lòng nhập mã phòng (VD: 8492)!');
      return;
    }

    disconnectAll();
    setConnectionStatus('connecting');
    setConnectionError('');
    setIsHost(false);
    setRoomCode(code);

    const targetPeerId = `hust-rubik-solo-${code}`;

    try {
      const peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        const conn = peer.connect(targetPeerId, { reliable: true });
        setupConnection(conn, false);

        // Timeout fallback if cannot connect
        setTimeout(() => {
          if (connRef.current && !connRef.current.open && connectionStatus !== 'connected') {
            setConnectionError(`Không tìm thấy phòng "${code}". Hãy kiểm tra lại mã hoặc nhờ Host tạo lại phòng!`);
            setConnectionStatus('idle');
          }
        }, 8000);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setConnectionError(`Lỗi kết nối đến phòng "${code}": ` + (err.type === 'peer-unavailable' ? 'Phòng không tồn tại hoặc Host chưa bật' : err.message));
        setConnectionStatus('idle');
      });
    } catch (err) {
      setConnectionError('Lỗi khi tham gia phòng: ' + err.message);
      setConnectionStatus('idle');
    }
  };

  // Broadcast camera state updates
  useEffect(() => {
    sendP2P({
      type: 'CAMERA_UPDATE',
      cameraActive,
      isHealthy: cameraHealth.isHealthy
    });
  }, [cameraActive, cameraHealth.isHealthy]);

  // Host starts next round
  const handleNextRound = () => {
    if (!isHost) return;
    const nextRound = roundNumber + 1;
    const newScramble = generateScramble(puzzleType);
    setRoundNumber(nextRound);
    setCurrentScramble(newScramble);
    setMatchState('ready');

    // Reset local timers
    setMyTimerState('idle');
    setMyTimeMs(0);
    setMyFinalTime(null);

    // Reset opponent
    setOppTimerState('idle');
    setOppLiveTimeMs(0);
    setOppFinalTime(null);

    sendP2P({
      type: 'NEW_ROUND',
      scramble: newScramble,
      puzzleType,
      roundNumber: nextRound
    });

    playSound('tick');
  };

  // Check victory condition when both finish
  useEffect(() => {
    if (myFinalTime !== null && oppFinalTime !== null && matchState !== 'finished') {
      setMatchState('finished');
      if (myFinalTime < oppFinalTime) {
        setMyScore(s => s + 1);
        playSound('win');
      } else if (oppFinalTime < myFinalTime) {
        setOpponentScore(s => s + 1);
        playSound('tick');
      }
    }
  }, [myFinalTime, oppFinalTime, matchState, playSound]);

  // ==========================================
  // SPACEBAR & TOUCH TIMER CONTROLS
  // ==========================================
  const startTimer = useCallback(() => {
    setMyTimerState('running');
    setMatchState('racing');
    timerStartTimestampRef.current = performance.now();
    playSound('start');

    sendP2P({ type: 'TIMER_STATE', state: 'running' });

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor(performance.now() - timerStartTimestampRef.current);
      setMyTimeMs(elapsed);

      // Throttle network tick to ~50ms
      const now = performance.now();
      if (now - lastTickSentRef.current > 50) {
        lastTickSentRef.current = now;
        sendP2P({ type: 'TIMER_TICK', timeMs: elapsed });
      }
    }, 10);
  }, [playSound]);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const finalElapsed = Math.floor(performance.now() - timerStartTimestampRef.current);
    setMyTimeMs(finalElapsed);
    setMyFinalTime(finalElapsed);
    setMyTimerState('done');

    sendP2P({
      type: 'SOLVE_DONE',
      timeMs: finalElapsed,
      formattedTime: formatTime(finalElapsed),
      cameraVerified: cameraActive && cameraHealth.isHealthy
    });

    playSound('tick');
  }, [cameraActive, cameraHealth.isHealthy, formatTime, playSound]);

  // Spacebar listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();

      if (myTimerState === 'running') {
        stopTimer();
        return;
      }

      if (myTimerState === 'idle' || myTimerState === 'done') {
        if (!spacePressedRef.current) {
          spacePressedRef.current = true;
          setMyTimerState('holding');
          sendP2P({ type: 'TIMER_STATE', state: 'holding' });

          holdTimeoutRef.current = setTimeout(() => {
            setMyTimerState('ready');
            sendP2P({ type: 'TIMER_STATE', state: 'ready' });
            playSound('ready');
          }, 280);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();

      spacePressedRef.current = false;
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (myTimerState === 'ready') {
        startTimer();
      } else if (myTimerState === 'holding') {
        setMyTimerState('idle');
        sendP2P({ type: 'TIMER_STATE', state: 'idle' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [myTimerState, startTimer, stopTimer, playSound]);

  // Quick Emoji reaction sender
  const sendReaction = (emoji, text) => {
    addReactionToast(emoji, `${currentUser.name}: ${text}`, true);
    sendP2P({
      type: 'REACTION',
      emoji,
      text,
      sender: currentUser.name || 'Người chơi'
    });
  };

  // Copy room link / code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Render Win/Loss Result Banner
  const renderMatchVerdict = () => {
    if (myFinalTime === null || oppFinalTime === null) return null;

    const diffSec = (Math.abs(myFinalTime - oppFinalTime) / 1000).toFixed(2);
    const iWon = myFinalTime < oppFinalTime;
    const isTie = myFinalTime === oppFinalTime;

    return (
      <div style={{
        marginTop: '16px',
        padding: '16px',
        borderRadius: '12px',
        background: iWon
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.35))'
          : (isTie ? 'rgba(59, 130, 246, 0.2)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.35))'),
        border: `2px solid ${iWon ? '#22c55e' : (isTie ? '#3b82f6' : '#ef4444')}`,
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: iWon ? '#4ade80' : (isTie ? '#60a5fa' : '#f87171') }}>
          {iWon ? '🏆 BẠN ĐÃ CHIẾN THẮNG!' : (isTie ? '🤝 HÒA NHAU KỊCH TÍNH!' : '🥈 ĐỐI THỦ ĐÃ VỀ ĐÍCH TRƯỚC!')}
        </div>
        <div style={{ fontSize: '1rem', color: '#cbd5e1', marginTop: '6px' }}>
          {isTie ? 'Cả hai có thời gian bằng nhau tuyệt đối!' : (iWon ? `Bạn nhanh hơn đối thủ ${diffSec} giây! 🚀` : `Đối thủ nhanh hơn bạn ${diffSec} giây!`)}
        </div>

        {isHost && (
          <button
            onClick={handleNextRound}
            style={{
              marginTop: '12px',
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
            }}
          >
            🎲 Ván Tiếp Theo (Scramble Mới)
          </button>
        )}
        {!isHost && (
          <div style={{ marginTop: '10px', fontSize: '0.82rem', color: '#94a3b8' }}>
            ⏳ Đang chờ Host bắt đầu ván tiếp theo...
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '960px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* HEADER BAR: SOLO STATUS & LEAVE */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        background: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>⚔️</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#f8fafc', letterSpacing: '0.5px' }}>
              ĐẤU TRƯỜNG SOLO 1V1 REALTIME (WebRTC P2P)
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Kết nối trực tiếp mạng P2P Browser-to-Browser • Miễn phí 100% • Không cần máy chủ riêng
            </div>
          </div>
        </div>

        <button
          onClick={onExitSolo}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: '1px solid #475569',
            background: '#0f172a',
            color: '#cbd5e1',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          🚪 Rời Chế Độ Solo
        </button>
      </div>

      {/* CONNECTION / LOBBY CARD (When not connected) */}
      {connectionStatus !== 'connected' && (
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.15rem', color: '#38bdf8', textAlign: 'center' }}>
            Tham Gia Hoặc Tạo Phòng Đấu Rubik 1v1
          </h3>
          <p style={{ margin: '0 0 20px 0', textAlign: 'center', fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
            Đấu trực tiếp với bạn bè theo thời gian thực! Bạn có thể xem đồng hồ bấm giờ của đối thủ chạy từng tích-tắc trực tiếp trên màn hình.
          </p>

          {connectionError && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#ef444422',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontSize: '0.82rem',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              ⚠️ {connectionError}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px'
          }}>
            {/* OPTION 1: CREATE ROOM */}
            <div style={{
              background: '#0f172a',
              borderRadius: '10px',
              padding: '20px',
              border: '1px solid #38bdf844',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👑</div>
                <h4 style={{ margin: '0 0 6px 0', color: '#38bdf8', fontSize: '1rem' }}>Tạo Phòng Đấu Mới</h4>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Làm chủ phòng (Host), chọn khối Rubik và sinh Scramble thi đấu cho cả hai.
                </p>
              </div>

              {connectionStatus === 'waiting' ? (
                <div style={{ width: '100%' }}>
                  <div style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px dashed #38bdf8',
                    marginBottom: '10px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>MÃ PHÒNG CỦA BẠN:</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#38bdf8', letterSpacing: '4px' }}>
                      {roomCode}
                    </div>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: copiedLink ? '#22c55e' : '#2563eb',
                      color: '#ffffff',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '0.82rem'
                    }}
                  >
                    {copiedLink ? '✓ Đã Sao Chép Mã!' : '📋 Sao Chép Mã Phòng Gửi Bạn'}
                  </button>
                  <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#f59e0b' }}>
                    ⏳ Đang chờ đối thủ nhập mã vào phòng...
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCreateRoom}
                  disabled={connectionStatus === 'creating'}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#ffffff',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {connectionStatus === 'creating' ? '⏳ Đang khởi tạo Peer...' : '🚀 Tạo Phòng Ngay'}
                </button>
              )}
            </div>

            {/* OPTION 2: JOIN ROOM */}
            <div style={{
              background: '#0f172a',
              borderRadius: '10px',
              padding: '20px',
              border: '1px solid #22c55e44',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎯</div>
                <h4 style={{ margin: '0 0 6px 0', color: '#22c55e', fontSize: '1rem' }}>Vào Phòng Bạn Bè</h4>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Nhập mã phòng 4 chữ số do bạn bè gửi để vào tranh tài ngay lập tức.
                </p>
              </div>

              <div style={{ width: '100%' }}>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="VD: 8492"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#ffffff',
                    fontSize: '1.2rem',
                    textAlign: 'center',
                    fontWeight: '700',
                    letterSpacing: '3px',
                    marginBottom: '10px'
                  }}
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={connectionStatus === 'connecting'}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#ffffff',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {connectionStatus === 'connecting' ? '⏳ Đang kết nối WebRTC...' : '⚡ Tham Gia Phòng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECTED ARENA VIEW (Both players in room) */}
      {connectionStatus === 'connected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* MATCH HEADER & SCRAMBLE */}
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '16px 20px',
            border: '1px solid #334155',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '700' }}>
                VÁN ĐẤU #{roundNumber} • {puzzleType.toUpperCase()}
              </div>

              {/* LIVE SCOREBOARD */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#0f172a',
                padding: '4px 16px',
                borderRadius: '20px',
                border: '1px solid #38bdf833'
              }}>
                <span style={{ fontWeight: '800', color: '#38bdf8', fontSize: '1rem' }}>{currentUser.name}</span>
                <span style={{ fontWeight: '900', color: '#f59e0b', fontSize: '1.2rem' }}>
                  {myScore} : {opponentScore}
                </span>
                <span style={{ fontWeight: '800', color: '#f43f5e', fontSize: '1rem' }}>{opponent?.name || 'Đối thủ'}</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Mã phòng: <strong style={{ color: '#ffffff' }}>{roomCode}</strong>
              </div>
            </div>

            {/* SHARED SCRAMBLE */}
            <div style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '1.15rem',
              fontWeight: '700',
              color: '#fbbf24',
              letterSpacing: '1px',
              border: '1px solid #334155',
              wordBreak: 'break-word'
            }}>
              {currentScramble || 'Đang chuẩn bị Scramble...'}
            </div>
          </div>

          {/* DUAL TIMERS BATTLEFIELD (Left: You, Right: Opponent) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px'
          }}>
            {/* LEFT CARD: YOU */}
            <div style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '24px 16px',
              border: `2px solid ${
                myTimerState === 'ready'
                  ? '#22c55e'
                  : (myTimerState === 'holding' ? '#f59e0b' : (myTimerState === 'running' ? '#38bdf8' : '#334155'))
              }`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: myTimerState === 'ready' ? '0 0 20px rgba(34, 197, 94, 0.3)' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1rem' }}>👤</span>
                <strong style={{ fontSize: '1.05rem', color: '#38bdf8' }}>{currentUser.name} (Bạn)</strong>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: cameraActive && cameraHealth.isHealthy ? '#10b98122' : '#ef444422',
                  color: cameraActive && cameraHealth.isHealthy ? '#34d399' : '#f87171',
                  fontWeight: '700'
                }}>
                  {cameraActive && cameraHealth.isHealthy ? '🟢 Cam OK' : '🔴 Cam Tắt'}
                </span>
              </div>

              {/* YOUR TIMER DISPLAY */}
              <div style={{
                fontFamily: 'monospace',
                fontSize: '3.6rem',
                fontWeight: '900',
                color: myTimerState === 'ready'
                  ? '#22c55e'
                  : (myTimerState === 'holding' ? '#f59e0b' : (myTimerState === 'running' ? '#ffffff' : '#e2e8f0')),
                margin: '10px 0'
              }}>
                {formatTime(myTimeMs)}
              </div>

              {/* YOUR STATUS INSTRUCTION */}
              <div style={{
                fontSize: '0.82rem',
                fontWeight: '700',
                color: myTimerState === 'ready'
                  ? '#22c55e'
                  : (myTimerState === 'holding' ? '#f59e0b' : (myTimerState === 'running' ? '#38bdf8' : '#94a3b8'))
              }}>
                {myTimerState === 'idle' && 'Bấm & Giữ phím SPACE để chuẩn bị!'}
                {myTimerState === 'holding' && '⏳ Đang giữ phím... chờ xanh lá'}
                {myTimerState === 'ready' && '🚀 SẴN SÀNG! THẢ SPACE ĐỂ GIẢI!'}
                {myTimerState === 'running' && '🔥 ĐANG GIẢI... BẤM SPACE ĐỂ DỪNG!'}
                {myTimerState === 'done' && `🏁 Đã xong: ${formatTime(myFinalTime)}!`}
              </div>
            </div>

            {/* RIGHT CARD: OPPONENT */}
            <div style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '24px 16px',
              border: `2px solid ${
                oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#10b981' : '#334155')
              }`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1rem' }}>⚔️</span>
                <strong style={{ fontSize: '1.05rem', color: '#f43f5e' }}>{opponent?.name || 'Đối thủ'}</strong>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: opponent?.cameraActive && opponent?.isHealthy ? '#10b98122' : '#ef444422',
                  color: opponent?.cameraActive && opponent?.isHealthy ? '#34d399' : '#f87171',
                  fontWeight: '700'
                }}>
                  {opponent?.cameraActive && opponent?.isHealthy ? '🟢 Cam OK' : '🔴 Cam Tắt'}
                </span>
              </div>

              {/* OPPONENT LIVE TIMER */}
              <div style={{
                fontFamily: 'monospace',
                fontSize: '3.6rem',
                fontWeight: '900',
                color: oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#34d399' : '#64748b'),
                margin: '10px 0'
              }}>
                {formatTime(oppLiveTimeMs)}
              </div>

              {/* OPPONENT STATUS */}
              <div style={{
                fontSize: '0.82rem',
                fontWeight: '700',
                color: oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#34d399' : '#94a3b8')
              }}>
                {oppTimerState === 'idle' && 'Đối thủ đang quan sát khối Rubik...'}
                {oppTimerState === 'holding' && '⏳ Đối thủ đang giữ Space...'}
                {oppTimerState === 'ready' && '⚡ Đối thủ đã sẵn sàng xuất phát!'}
                {oppTimerState === 'running' && '🔥 ĐỐI THỦ ĐANG XOAY TỐC ĐỘ CAO!'}
                {oppTimerState === 'done' && `🏁 Đối thủ đã về đích: ${formatTime(oppFinalTime)}!`}
              </div>
            </div>
          </div>

          {/* WIN / LOSS VERDICT */}
          {renderMatchVerdict()}

          {/* QUICK CHAT / EMOJI REACTIONS */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: '#1e293b',
            borderRadius: '10px',
            padding: '10px',
            border: '1px solid #334155'
          }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '6px' }}>Biểu cảm nhanh:</span>
            {[
              { emoji: '🔥', text: 'Nhanh quá!' },
              { emoji: '👏', text: 'Hay lắm!' },
              { emoji: '⚡', text: 'Tái đấu đi!' },
              { emoji: '😱', text: 'Tiếc ghê!' },
              { emoji: '🏆', text: 'Tuyệt đỉnh!' }
            ].map(r => (
              <button
                key={r.emoji}
                onClick={() => sendReaction(r.emoji, r.text)}
                title={r.text}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.text}</span>
              </button>
            ))}
          </div>

          {/* REACTION TOASTS OVERLAY */}
          {reactions.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              alignItems: 'center'
            }}>
              {reactions.map(r => (
                <div
                  key={r.id}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '20px',
                    background: r.fromMe ? '#2563eb' : '#f43f5e',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    animation: 'bounceIn 0.3s ease'
                  }}
                >
                  {r.emoji} {r.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
