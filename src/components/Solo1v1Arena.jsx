import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { validateP2PPacket, sanitizeText } from '../utils/securityShield';
import { playSoundEffect } from '../utils/soundEngine';

const BOT_LEVELS = [
  { id: 'noob', name: '🥉 Bot Tân Binh', desc: 'Trung bình ~32s (Dành cho người mới)', targetSec: 32, varianceSec: 6, avatar: '🤖' },
  { id: 'pro', name: '🥈 Bot Bán Chuyên', desc: 'Trung bình ~19s (Sub-20)', targetSec: 19, varianceSec: 3.5, avatar: '⚡' },
  { id: 'master', name: '🥇 Bot Kiện Tướng', desc: 'Trung bình ~13s (Sub-15 WCA)', targetSec: 13, varianceSec: 2, avatar: '🔥' },
  { id: 'alien', name: '👑 Bot Siêu Cấp WCA', desc: 'Thần tốc ~7.5s (Kỷ lục thế giới)', targetSec: 7.5, varianceSec: 1.2, avatar: '👾' }
];

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

  // Bot AI Rival state
  const [isBotMode, setIsBotMode] = useState(false);
  const [selectedBotLevel, setSelectedBotLevel] = useState('pro');
  const botTimerIntervalRef = useRef(null);
  const botTargetTimeMsRef = useRef(0);

  // Opponent info
  const [opponent, setOpponent] = useState(null); // { name, cameraActive, isHealthy, isBot, avatar }

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

  // Shared singleton Web Audio feedback (zero AudioContext hardware limit leak)
  const playSound = useCallback((type) => {
    playSoundEffect(type);
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
    if (isBotMode) return;
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
    if (botTimerIntervalRef.current) clearInterval(botTimerIntervalRef.current);
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
    setIsBotMode(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  // Handle incoming P2P messages
  const handleP2PData = useCallback((rawData) => {
    const check = validateP2PPacket(rawData);
    if (!check.valid) return;
    const data = check.packet;

    switch (data.type) {
      case 'HANDSHAKE':
      case 'HANDSHAKE_ACK': {
        setOpponent({
          name: sanitizeText(data.name, 32, 'Đối thủ'),
          cameraActive: !!data.cameraActive,
          isHealthy: !!data.isHealthy,
          isBot: false,
          avatar: '👤'
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
        conn.send({
          type: 'HANDSHAKE',
          name: currentUser.name || 'Người chơi 1',
          cameraActive,
          isHealthy: cameraHealth.isHealthy
        });

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

  // ==========================================
  // CHẾ ĐỘ 1: ĐẤU VỚI BOT AI SPEEDCUBER
  // ==========================================
  const handleStartBotMatch = (botLevelId = selectedBotLevel) => {
    disconnectAll();
    setIsBotMode(true);
    setIsHost(true);
    setConnectionStatus('connected');
    setConnectionError('');

    const botConfig = BOT_LEVELS.find(b => b.id === botLevelId) || BOT_LEVELS[1];
    setOpponent({
      name: botConfig.name,
      cameraActive: true,
      isHealthy: true,
      isBot: true,
      avatar: botConfig.avatar,
      badge: botConfig.badge
    });

    // Sinh Scramble mới và tính thời gian mục tiêu của Bot cho ván này
    const initialScramble = generateScramble(puzzleType);
    setCurrentScramble(initialScramble);
    setRoundNumber(1);
    setMyScore(0);
    setOpponentScore(0);
    setMatchState('ready');

    // Reset timers
    setMyTimerState('idle');
    setMyTimeMs(0);
    setMyFinalTime(null);
    setOppTimerState('idle');
    setOppLiveTimeMs(0);
    setOppFinalTime(null);

    // Tính thời gian Bot giải (ms) có dao động ngẫu nhiên
    const randomVariance = (Math.random() * 2 - 1) * botConfig.varianceSec;
    const computedSec = Math.max(5.5, botConfig.targetSec + randomVariance);
    botTargetTimeMsRef.current = Math.round(computedSec * 1000);

    playSound('ready');
    addReactionToast('🤖', `${botConfig.name}: "Sẵn sàng đấu nào! Hãy xem ai giải nhanh hơn!"`, false);
  };

  // ==========================================
  // CHẾ ĐỘ 2: TẠO PHÒNG HOST P2P
  // ==========================================
  const handleCreateRoom = () => {
    disconnectAll();
    setConnectionStatus('creating');
    setConnectionError('');
    setIsHost(true);
    setIsBotMode(false);

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
        setConnectionError('Không thể tạo phòng đấu P2P. Thử lại sau giây lát hoặc chọn Đấu Bot!');
        setConnectionStatus('idle');
      });
    } catch (err) {
      setConnectionError('Lỗi khởi tạo PeerJS: ' + err.message);
      setConnectionStatus('idle');
    }
  };

  // ==========================================
  // CHẾ ĐỘ 3: VÀO PHÒNG BẠN BÈ (GUEST P2P)
  // ==========================================
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
    setIsBotMode(false);
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

  // VÁN TIẾP THEO (NEXT ROUND)
  const handleNextRound = () => {
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

    if (isBotMode) {
      const botConfig = BOT_LEVELS.find(b => b.id === selectedBotLevel) || BOT_LEVELS[1];
      const randomVariance = (Math.random() * 2 - 1) * botConfig.varianceSec;
      const computedSec = Math.max(5.5, botConfig.targetSec + randomVariance);
      botTargetTimeMsRef.current = Math.round(computedSec * 1000);
      if (botTimerIntervalRef.current) clearInterval(botTimerIntervalRef.current);
    } else {
      sendP2P({
        type: 'NEW_ROUND',
        scramble: newScramble,
        puzzleType,
        roundNumber: nextRound
      });
    }

    playSound('tick');
  };

  // Check victory condition when both finish
  useEffect(() => {
    if (myFinalTime !== null && oppFinalTime !== null && matchState !== 'finished') {
      setMatchState('finished');
      if (myFinalTime < oppFinalTime) {
        setMyScore(s => s + 1);
        playSound('win');
        if (isBotMode) {
          setTimeout(() => {
            addReactionToast('👏', `${opponent?.name}: "Bạn giải quá nhanh! Khâm phục đấy!"`, false);
          }, 600);
        }
      } else if (oppFinalTime < myFinalTime) {
        setOpponentScore(s => s + 1);
        playSound('tick');
        if (isBotMode) {
          setTimeout(() => {
            addReactionToast('😎', `${opponent?.name}: "Ván này tôi về đích trước rồi nhé!"`, false);
          }, 600);
        }
      }
    }
  }, [myFinalTime, oppFinalTime, matchState, isBotMode, opponent, playSound]);

  // ==========================================
  // SPACEBAR & MOBILE TOUCHPAD TIMER LOGIC
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
      if (!isBotMode && now - lastTickSentRef.current > 50) {
        lastTickSentRef.current = now;
        sendP2P({ type: 'TIMER_TICK', timeMs: elapsed });
      }
    }, 10);

    // KÍCH HOẠT BOT AI GIẢI SONG SONG KHI BẠN BẮT ĐẦU
    if (isBotMode) {
      if (botTimerIntervalRef.current) clearInterval(botTimerIntervalRef.current);
      setOppTimerState('holding');
      // Mô phỏng phản xạ quan sát 0.4s của Bot
      setTimeout(() => {
        setOppTimerState('running');
        const botStart = performance.now();
        const target = botTargetTimeMsRef.current;

        botTimerIntervalRef.current = setInterval(() => {
          const botElapsed = Math.floor(performance.now() - botStart);
          setOppLiveTimeMs(botElapsed);

          if (botElapsed >= target) {
            clearInterval(botTimerIntervalRef.current);
            botTimerIntervalRef.current = null;
            setOppLiveTimeMs(target);
            setOppFinalTime(target);
            setOppTimerState('done');
            playSound('tick');
          }
        }, 16);
      }, 400);
    }
  }, [isBotMode, playSound]);

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

  // Unified Hold & Release Handlers (Both Spacebar & Mobile Touch)
  const handleHoldStart = useCallback(() => {
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
  }, [myTimerState, stopTimer, playSound]);

  const handleHoldEnd = useCallback(() => {
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
  }, [myTimerState, startTimer]);

  // Spacebar listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      handleHoldStart();
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      handleHoldEnd();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleHoldStart, handleHoldEnd]);

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
        marginTop: '12px',
        padding: '14px',
        borderRadius: '12px',
        background: iWon
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.35))'
          : (isTie ? 'rgba(59, 130, 246, 0.2)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.35))'),
        border: `2px solid ${iWon ? '#22c55e' : (isTie ? '#3b82f6' : '#ef4444')}`,
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-in-out'
      }}>
        <div style={{ fontSize: 'clamp(1.2rem, 5vw, 1.8rem)', fontWeight: '900', color: iWon ? '#4ade80' : (isTie ? '#60a5fa' : '#f87171') }}>
          {iWon ? '🏆 BẠN ĐÃ CHIẾN THẮNG!' : (isTie ? '🤝 HÒA NHAU KỊCH TÍNH!' : '🥈 ĐỐI THỦ ĐÃ VỀ ĐÍCH TRƯỚC!')}
        </div>
        <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '4px' }}>
          {isTie ? 'Cả hai có thời gian bằng nhau tuyệt đối!' : (iWon ? `Bạn nhanh hơn ${diffSec} giây! 🚀` : `Đối thủ nhanh hơn ${diffSec} giây!`)}
        </div>

        {(isHost || isBotMode) && (
          <button
            onClick={handleNextRound}
            style={{
              marginTop: '10px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
            }}
          >
            🎲 Ván Tiếp Theo (Scramble Mới)
          </button>
        )}
        {!isHost && !isBotMode && (
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
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
      gap: '12px'
    }}>
      {/* HEADER BAR: SOLO STATUS & LEAVE */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.3rem' }}>⚔️</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#f8fafc' }}>
              ĐẤU TRƯỜNG SOLO 1V1 {isBotMode ? '• ĐẤU VỚI BOT AI' : '• P2P BẠN BÈ'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              {isBotMode ? 'Luyện phản xạ tốc độ với Bot AI thông minh' : 'P2P Browser-to-Browser • Hỗ trợ cả Điện Thoại & Máy Tính'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isBotMode && (
            <button
              onClick={() => disconnectAll()}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #38bdf8',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              🔄 Đổi Đối Thủ / Cấp Độ
            </button>
          )}
          <button
            onClick={onExitSolo}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🚪 Rời Solo
          </button>
        </div>
      </div>

      {/* CONNECTION / LOBBY CARD (When not connected) */}
      {connectionStatus !== 'connected' && (
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: '#38bdf8', textAlign: 'center' }}>
            Chọn Chế Độ Thi Đấu Solo 1v1
          </h3>
          <p style={{ margin: '0 0 16px 0', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
            Đấu ngay 1-chạm với Bot AI Speedcuber thông minh hoặc Tạo phòng so tài trực tiếp cùng bạn bè!
          </p>

          {connectionError && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#ef444422',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontSize: '0.78rem',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              ⚠️ {connectionError}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px'
          }}>
            {/* OPTION 1: PLAY WITH BOT AI (HOT - NGAY LẬP TỨC 1 CHẠM) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
              borderRadius: '10px',
              padding: '16px',
              border: '1.8px solid #f59e0b',
              boxShadow: '0 0 16px rgba(245, 158, 11, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '2rem', marginBottom: '4px' }}>🤖</div>
                <h4 style={{ margin: '0 0 4px 0', color: '#f59e0b', fontSize: '1rem', fontWeight: '800' }}>
                  Đấu Luyện Tập Với Bot AI
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Vào đấu ngay trong 1 giây! Không cần chờ bạn bè, luyện phản xạ thần tốc.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px', textAlign: 'left' }}>
                  {BOT_LEVELS.map(b => (
                    <label
                      key={b.id}
                      onClick={() => setSelectedBotLevel(b.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: selectedBotLevel === b.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: selectedBotLevel === b.id ? '1.5px solid #f59e0b' : '1px solid #334155',
                        cursor: 'pointer',
                        fontSize: '0.74rem'
                      }}
                    >
                      <span style={{ fontWeight: selectedBotLevel === b.id ? '800' : '600', color: selectedBotLevel === b.id ? '#fbbf24' : '#e2e8f0' }}>
                        {b.name}
                      </span>
                      <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>{b.desc.split('(')[1]?.replace(')', '') || ''}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStartBotMatch(selectedBotLevel)}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#ffffff',
                  fontWeight: '800',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.45)'
                }}
              >
                ⚡ Bắt Đầu Đấu Bot Ngay
              </button>
            </div>

            {/* OPTION 2: CREATE ROOM (P2P HOST) */}
            <div style={{
              background: '#0f172a',
              borderRadius: '10px',
              padding: '16px',
              border: '1px solid #38bdf844',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>👑</div>
                <h4 style={{ margin: '0 0 4px 0', color: '#38bdf8', fontSize: '0.95rem' }}>Tạo Phòng Đấu Bạn Bè</h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  Làm Host, tạo mã phòng 4 số gửi bạn bè thi đấu trực tiếp P2P.
                </p>
              </div>

              {connectionStatus === 'waiting' ? (
                <div style={{ width: '100%' }}>
                  <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px dashed #38bdf8',
                    marginBottom: '8px'
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>MÃ PHÒNG:</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#38bdf8', letterSpacing: '3px' }}>
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
                      fontSize: '0.78rem'
                    }}
                  >
                    {copiedLink ? '✓ Đã Sao Chép!' : '📋 Sao Chép Mã Gửi Bạn'}
                  </button>
                  <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#f59e0b' }}>
                    ⏳ Đang chờ bạn bè nhập mã...
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
                    fontSize: '0.85rem'
                  }}
                >
                  {connectionStatus === 'creating' ? '⏳ Đang khởi tạo...' : '🚀 Tạo Phòng P2P'}
                </button>
              )}
            </div>

            {/* OPTION 3: JOIN ROOM (P2P GUEST) */}
            <div style={{
              background: '#0f172a',
              borderRadius: '10px',
              padding: '16px',
              border: '1px solid #22c55e44',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>🎯</div>
                <h4 style={{ margin: '0 0 4px 0', color: '#22c55e', fontSize: '0.95rem' }}>Vào Phòng Bạn Bè</h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  Nhập mã phòng 4 số do bạn bè gửi để tranh tài ngay.
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
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    textAlign: 'center',
                    fontWeight: '700',
                    letterSpacing: '2px',
                    marginBottom: '8px'
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
                    fontSize: '0.85rem'
                  }}
                >
                  {connectionStatus === 'connecting' ? '⏳ Đang kết nối...' : '⚡ Tham Gia Phòng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECTED ARENA VIEW (Both players or Bot in room) */}
      {connectionStatus === 'connected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* MATCH HEADER & SCRAMBLE */}
          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '12px 14px',
            border: '1px solid #334155',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '700' }}>
                VÁN #{roundNumber} • {puzzleType.toUpperCase()} {isBotMode ? `• ${opponent?.name}` : ''}
              </div>

              {/* LIVE SCOREBOARD */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#0f172a',
                padding: '3px 12px',
                borderRadius: '20px',
                border: '1px solid #38bdf833'
              }}>
                <span style={{ fontWeight: '800', color: '#38bdf8', fontSize: '0.9rem' }}>{currentUser.name}</span>
                <span style={{ fontWeight: '900', color: '#f59e0b', fontSize: '1.1rem' }}>
                  {myScore} : {opponentScore}
                </span>
                <span style={{ fontWeight: '800', color: '#f43f5e', fontSize: '0.9rem' }}>{opponent?.name || 'Đối thủ'}</span>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {isBotMode ? (
                  <span style={{ color: '#fbbf24', fontWeight: '700' }}>🤖 Đấu Bot AI ({opponent?.badge || 'Pro'})</span>
                ) : (
                  <>Phòng: <strong style={{ color: '#ffffff' }}>{roomCode}</strong></>
                )}
              </div>
            </div>

            {/* SHARED SCRAMBLE */}
            <div style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: 'clamp(0.85rem, 3.5vw, 1.1rem)',
              fontWeight: '700',
              color: '#fbbf24',
              letterSpacing: '0.5px',
              border: '1px solid #334155',
              wordBreak: 'break-word'
            }}>
              {currentScramble || 'Đang chuẩn bị Scramble...'}
            </div>
          </div>

          {/* DUAL TIMERS BATTLEFIELD (Left: You, Right: Opponent / Bot) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px'
          }}>
            {/* LEFT CARD: YOU (TOUCH-FRIENDLY SPEEDCUBING PAD) */}
            <div
              onPointerDown={(e) => {
                if (e.target.tagName === 'BUTTON') return;
                handleHoldStart();
              }}
              onPointerUp={(e) => {
                if (e.target.tagName === 'BUTTON') return;
                handleHoldEnd();
              }}
              onPointerCancel={handleHoldEnd}
              style={{
                background: '#1e293b',
                borderRadius: '12px',
                padding: '18px 14px',
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
                transition: 'border-color 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.9rem' }}>👤</span>
                <strong style={{ fontSize: '0.95rem', color: '#38bdf8' }}>{currentUser.name} (Bạn)</strong>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 5px',
                  borderRadius: '4px',
                  background: cameraActive && cameraHealth?.isHealthy ? '#10b98122' : '#38bdf822',
                  color: cameraActive && cameraHealth?.isHealthy ? '#34d399' : '#38bdf8',
                  fontWeight: '700'
                }}>
                  {cameraActive && cameraHealth?.isHealthy ? '🟢 Cam AI' : '⚡ Bấm Giờ Tự Do'}
                </span>
              </div>

              {/* YOUR TIMER DISPLAY */}
              <div style={{
                fontFamily: 'monospace',
                fontSize: 'clamp(2.6rem, 10vw, 3.6rem)',
                fontWeight: '900',
                color: myTimerState === 'ready'
                  ? '#22c55e'
                  : (myTimerState === 'holding' ? '#f59e0b' : (myTimerState === 'running' ? '#ffffff' : '#e2e8f0')),
                margin: '6px 0'
              }}>
                {formatTime(myTimeMs)}
              </div>

              {/* YOUR STATUS INSTRUCTION */}
              <div style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                textAlign: 'center',
                color: myTimerState === 'ready'
                  ? '#22c55e'
                  : (myTimerState === 'holding' ? '#f59e0b' : (myTimerState === 'running' ? '#38bdf8' : '#94a3b8'))
              }}>
                {myTimerState === 'idle' && '📱 Chạm giữ thẻ này (hoặc bấm Space) để chuẩn bị!'}
                {myTimerState === 'holding' && '⏳ Đang giữ... chờ đổi màu xanh'}
                {myTimerState === 'ready' && '🚀 SẴN SÀNG! THẢ TAY ĐỂ GIẢI!'}
                {myTimerState === 'running' && '🔥 ĐANG GIẢI... CHẠM ĐỂ DỪNG!'}
                {myTimerState === 'done' && `🏁 Đã xong: ${formatTime(myFinalTime)}! (Chạm để ván mới)`}
              </div>
            </div>

            {/* RIGHT CARD: OPPONENT / BOT AI */}
            <div style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '18px 14px',
              border: `2px solid ${
                oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#10b981' : '#334155')
              }`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.9rem' }}>{opponent?.avatar || '⚔️'}</span>
                <strong style={{ fontSize: '0.95rem', color: '#f43f5e' }}>{opponent?.name || 'Đối thủ'}</strong>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 5px',
                  borderRadius: '4px',
                  background: isBotMode ? '#f59e0b22' : (opponent?.cameraActive && opponent?.isHealthy ? '#10b98122' : '#64748b22'),
                  color: isBotMode ? '#fbbf24' : (opponent?.cameraActive && opponent?.isHealthy ? '#34d399' : '#94a3b8'),
                  fontWeight: '700'
                }}>
                  {isBotMode ? `🤖 AI ${opponent?.badge || 'Pro'}` : (opponent?.cameraActive && opponent?.isHealthy ? '🟢 Cam OK' : '⚡ Online')}
                </span>
              </div>

              {/* OPPONENT LIVE TIMER */}
              <div style={{
                fontFamily: 'monospace',
                fontSize: 'clamp(2.6rem, 10vw, 3.6rem)',
                fontWeight: '900',
                color: oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#34d399' : '#64748b'),
                margin: '6px 0'
              }}>
                {formatTime(oppLiveTimeMs)}
              </div>

              {/* OPPONENT STATUS */}
              <div style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                textAlign: 'center',
                color: oppTimerState === 'running' ? '#f43f5e' : (oppTimerState === 'done' ? '#34d399' : '#94a3b8')
              }}>
                {oppTimerState === 'idle' && (isBotMode ? 'Bot AI đang sẵn sàng đua cùng bạn...' : 'Đối thủ đang quan sát khối Rubik...')}
                {oppTimerState === 'holding' && '⏳ Đối thủ đang giữ chuẩn bị...'}
                {oppTimerState === 'ready' && '⚡ Đối thủ đã sẵn sàng xuất phát!'}
                {oppTimerState === 'running' && (isBotMode ? '🔥 BOT AI ĐANG GIẢI TỐC ĐỘ CAO!' : '🔥 ĐỐI THỦ ĐANG XOAY TỐC ĐỘ CAO!')}
                {oppTimerState === 'done' && `🏁 ${isBotMode ? 'Bot AI' : 'Đối thủ'} đã về đích: ${formatTime(oppFinalTime)}!`}
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
            gap: '6px',
            background: '#1e293b',
            borderRadius: '10px',
            padding: '8px',
            border: '1px solid #334155',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginRight: '4px' }}>Cảm xúc nhanh:</span>
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
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.text}</span>
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
                    padding: '5px 14px',
                    borderRadius: '20px',
                    background: r.fromMe ? '#2563eb' : '#f43f5e',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
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
