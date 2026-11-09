import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// 1. WCA SCRAMBLE GENERATOR (2x2, 3x3, 4x4, 5x5)
// ==========================================
const PUZZLE_CONFIGS = {
  '2x2': { id: '2x2', name: '2×2×2', label: '2×2 Pocket Cube', dim: 2, defaultMoves: 9 },
  '3x3': { id: '3x3', name: '3×3×3', label: '3×3 Rubik Cube', dim: 3, defaultMoves: 20 },
  '4x4': { id: '4x4', name: '4×4×4', label: "4×4 Rubik's Revenge", dim: 4, defaultMoves: 40 },
  '5x5': { id: '5x5', name: '5×5×5', label: "5×5 Professor's Cube", dim: 5, defaultMoves: 60 }
};

const GAME_MODES = [
  { id: 'free', name: '🎯 Tự do', desc: 'Bấm Space là chạy ngay, luyện tập không giới hạn' },
  { id: 'wca', name: '🏆 WCA 15s', desc: '15 giây quan sát (Inspection) chuẩn thi đấu quốc tế' },
  { id: 'target', name: '⚡ Mục tiêu Sub-X', desc: 'Thử thách phá vỡ mốc thời gian mục tiêu' },
  { id: 'ai', name: '🤖 Trọng tài AI', desc: 'Kiểm tra Rubik qua camera & tự động xác nhận giải xong' }
];

function generateScramble(puzzleType = '3x3') {
  const modifiers = ['', "'", '2'];

  if (puzzleType === '2x2') {
    const faces = ['U', 'R', 'F'];
    const scramble = [];
    let lastFace = -1;
    for (let i = 0; i < 9; i++) {
      let faceIndex;
      do {
        faceIndex = Math.floor(Math.random() * faces.length);
      } while (faceIndex === lastFace);
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${faces[faceIndex]}${mod}`);
      lastFace = faceIndex;
    }
    return scramble.join(' ');
  }

  if (puzzleType === '4x4') {
    const outerFaces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const wideFaces = ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
    const allMoves = [...outerFaces, ...wideFaces];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 40; i++) {
      let move;
      do {
        move = allMoves[Math.floor(Math.random() * allMoves.length)];
      } while (move === lastMove || (move[0] === lastMove[0] && move.length === lastMove.length));
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${move}${mod}`);
      lastMove = move;
    }
    return scramble.join(' ');
  }

  if (puzzleType === '5x5') {
    const moves = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
    const scramble = [];
    let lastMove = '';
    for (let i = 0; i < 60; i++) {
      let move;
      do {
        move = moves[Math.floor(Math.random() * moves.length)];
      } while (move === lastMove || (move[0] === lastMove[0] && move.length === lastMove.length));
      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble.push(`${move}${mod}`);
      lastMove = move;
    }
    return scramble.join(' ');
  }

  // Standard 3x3x3 WCA Scramble
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const getAxis = (f) => Math.floor(f / 2);
  const scramble = [];
  let lastFace = -1;
  let secondLastFace = -1;

  for (let i = 0; i < 20; i++) {
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

// Color mapping for Rubik stickers
const COLOR_DEFINITIONS = {
  white:  { code: 'U', name: 'Trắng', hex: '#f8fafc', bg: '#f8fafc', textColor: '#0f172a' },
  yellow: { code: 'D', name: 'Vàng', hex: '#eab308', bg: '#eab308', textColor: '#0f172a' },
  red:    { code: 'R', name: 'Đỏ', hex: '#ef4444', bg: '#ef4444', textColor: '#ffffff' },
  orange: { code: 'L', name: 'Cam', hex: '#f97316', bg: '#f97316', textColor: '#ffffff' },
  green:  { code: 'F', name: 'Xanh lá', hex: '#22c55e', bg: '#22c55e', textColor: '#ffffff' },
  blue:   { code: 'B', name: 'Xanh dương', hex: '#3b82f6', bg: '#3b82f6', textColor: '#ffffff' },
  invalid:{ code: '?', name: 'Không rõ', hex: '#334155', bg: '#334155', textColor: '#94a3b8' }
};

// RGB to HSV Conversion
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0, v = max;

  if (delta !== 0) {
    s = delta / max;
    switch (max) {
      case r: h = 60 * (((g - b) / delta) % 6); break;
      case g: h = 60 * (((b - r) / delta) + 2); break;
      case b: h = 60 * (((r - g) / delta) + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, v };
}

function classifyHsvColor(h, s, v, rawBrightness) {
  if (rawBrightness < 35 || v < 0.20) return 'invalid';
  if (s < 0.22 && v > 0.55 && rawBrightness > 100) return 'white';
  if (s > 0.30) {
    if (h >= 345 || h < 14) return 'red';
    if (h >= 14 && h < 38) return 'orange';
    if (h >= 38 && h < 75) return 'yellow';
    if (h >= 75 && h < 165) return 'green';
    if (h >= 165 && h < 260) return 'blue';
  }
  return 'invalid';
}

// Accurate WCA Average of N (removes 1 min and 1 max)
function calculateAo(solvesList, count) {
  if (!solvesList || solvesList.length < count) return '--';
  const times = solvesList.slice(0, count).map(s => s.time);
  const min = Math.min(...times);
  const max = Math.max(...times);
  let removedMin = false;
  let removedMax = false;
  const trimmed = [];
  for (const t of times) {
    if (!removedMin && t === min) {
      removedMin = true;
      continue;
    }
    if (!removedMax && t === max) {
      removedMax = true;
      continue;
    }
    trimmed.push(t);
  }
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return (sum / trimmed.length).toFixed(2);
}

export default function App() {
  // ==========================================
  // 1. AUTHENTICATION & ADMIN ROLES
  // ==========================================
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_auth_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      role: 'user',
      name: 'khoa.tt2611758',
      email: 'khoa.tt2611758@sis.hust.edu.vn'
    };
  });

  const [adminSettings, setAdminSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_admin_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      adminPassword: 'admin123',
      competitionTitle: 'Rubik Timer & AI Verification',
      subTitle: 'HUST Speedcubing • 2×2, 3×3, 4×4, 5×5',
      spaceHoldMs: 280
    };
  });

  // Navigation Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState('user');
  const [inputUserName, setInputUserName] = useState('');
  const [inputUserEmail, setInputUserEmail] = useState('');
  const [inputAdminPassword, setInputAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [showAdminPanelModal, setShowAdminPanelModal] = useState(false);
  const [editCompTitle, setEditCompTitle] = useState(adminSettings.competitionTitle);
  const [editCompSub, setEditCompSub] = useState(adminSettings.subTitle);
  const [editSpaceHoldMs, setEditSpaceHoldMs] = useState(adminSettings.spaceHoldMs);
  const [editAdminPassword, setEditAdminPassword] = useState(adminSettings.adminPassword);

  // DASHBOARD MODAL STATE
  const [showDashboardModal, setShowDashboardModal] = useState(false);

  // ==========================================
  // 2. PUZZLE & GAME MODE STATE
  // ==========================================
  const [puzzleType, setPuzzleType] = useState(() => {
    return localStorage.getItem('rubik_puzzle_type') || '3x3';
  });

  const [gameMode, setGameMode] = useState(() => {
    return localStorage.getItem('rubik_game_mode') || 'free';
  });

  // Target Sub-X mode
  const [targetSeconds, setTargetSeconds] = useState(15);
  const [lastTargetResult, setLastTargetResult] = useState(null); // 'win' | 'loss'

  // WCA 15s Inspection Phase
  const [inspectionSeconds, setInspectionSeconds] = useState(15);
  const [penaltyText, setPenaltyText] = useState(''); // '+2' | 'DNF' | ''

  // Timer states: 'idle' | 'inspecting' | 'holding' | 'ready' | 'running'
  const [timerState, setTimerState] = useState('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [scramble, setScramble] = useState(() => generateScramble(puzzleType));

  // History & Solves
  const [solves, setSolves] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_solves_hcc');
      return saved ? JSON.parse(saved) : [
        { id: 1, puzzleType: '3x3', time: 14.52, date: '10/11', moves: 'Chưa dùng cam', verified: false },
        { id: 2, puzzleType: '3x3', time: 12.80, date: '10/11', moves: 'Chưa dùng cam', verified: false },
        { id: 3, puzzleType: '4x4', time: 54.20, date: '10/11', moves: 'Giải thủ công', verified: false },
        { id: 4, puzzleType: '5x5', time: 112.45, date: '10/11', moves: 'Giải thủ công', verified: false }
      ];
    } catch {
      return [];
    }
  });

  const currentSolves = solves.filter(s => (s.puzzleType || '3x3') === puzzleType);

  // ==========================================
  // 3. MULTI-LEADERBOARD SYSTEM
  // ==========================================
  const [leaderboards, setLeaderboards] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_multi_leaderboards_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      'board_1': {
        id: 'board_1',
        title: 'Bảng Xếp Hạng HUST',
        entries: [
          { id: 1, puzzleType: '3x3', name: 'khoa.tt2611758', best: 0.71, avg: 1.02, verified: true },
          { id: 2, puzzleType: '3x3', name: 'tungtungvuadhur', best: 6.53, avg: 7.92, verified: true },
          { id: 3, puzzleType: '4x4', name: 'Người Tây Đồng Bằng', best: 36.55, avg: 41.57, verified: false },
          { id: 4, puzzleType: '5x5', name: 'tranduct757', best: 72.12, avg: 84.57, verified: false },
          { id: 5, puzzleType: '3x3', name: 'Tiến Dũng newbie', best: 12.14, avg: 14.75, verified: false }
        ]
      }
    };
  });

  const [activeBoardId, setActiveBoardId] = useState(() => {
    return localStorage.getItem('rubik_active_board_id') || 'board_1';
  });

  const [leaderboardFilter, setLeaderboardFilter] = useState('current');

  // Modals for Leaderboard
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardMode, setNewBoardMode] = useState('empty');

  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerBest, setNewPlayerBest] = useState('');
  const [newPlayerAvg, setNewPlayerAvg] = useState('');

  const currentBoard = leaderboards[activeBoardId] || Object.values(leaderboards)[0];

  const saveLeaderboards = (newBoards, newActiveId = null) => {
    setLeaderboards(newBoards);
    localStorage.setItem('rubik_multi_leaderboards_v2', JSON.stringify(newBoards));
    if (newActiveId) {
      setActiveBoardId(newActiveId);
      localStorage.setItem('rubik_active_board_id', newActiveId);
    }
  };

  const handleSelectPuzzle = (type) => {
    setPuzzleType(type);
    localStorage.setItem('rubik_puzzle_type', type);
    setScramble(generateScramble(type));
    setTrackedMoves([]);
    setLastMoveDetected('');
  };

  const handleSelectGameMode = (mode) => {
    setGameMode(mode);
    localStorage.setItem('rubik_game_mode', mode);
    setTimerState('idle');
    setPenaltyText('');
    setLastTargetResult(null);
  };

  const handleCreateNewBoard = (e) => {
    e.preventDefault();
    const title = newBoardTitle.trim() || `Bảng đấu #${Object.keys(leaderboards).length + 1}`;
    const newId = `board_${Date.now()}`;
    const newBoard = {
      id: newId,
      title: title,
      entries: newBoardMode === 'clone' && currentBoard 
        ? JSON.parse(JSON.stringify(currentBoard.entries)) 
        : []
    };
    const updated = { ...leaderboards, [newId]: newBoard };
    saveLeaderboards(updated, newId);
    setNewBoardTitle('');
    setShowNewBoardModal(false);
  };

  const handleDeleteCurrentBoard = () => {
    const boardKeys = Object.keys(leaderboards);
    if (boardKeys.length <= 1) {
      const reset = {
        'board_1': { id: 'board_1', title: 'Bảng Xếp Hạng Mới', entries: [] }
      };
      saveLeaderboards(reset, 'board_1');
      return;
    }
    if (window.confirm(`Bạn có chắc muốn xóa bảng "${currentBoard.title}"?`)) {
      const remaining = { ...leaderboards };
      delete remaining[activeBoardId];
      const nextKey = Object.keys(remaining)[0];
      saveLeaderboards(remaining, nextKey);
    }
  };

  const handleAddEntry = (e) => {
    e.preventDefault();
    if (!newPlayerName.trim() || !newPlayerBest) return;

    const bestVal = parseFloat(newPlayerBest);
    const avgVal = newPlayerAvg ? parseFloat(newPlayerAvg) : bestVal;

    const newEntry = {
      id: Date.now(),
      puzzleType: puzzleType,
      name: newPlayerName.trim(),
      best: bestVal,
      avg: avgVal,
      verified: currentUser.role === 'admin'
    };

    const currentEntries = currentBoard?.entries || [];
    const sorted = [...currentEntries, newEntry].sort((a, b) => a.best - b.best);
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: sorted }
    };
    saveLeaderboards(updated);
    setNewPlayerName('');
    setNewPlayerBest('');
    setNewPlayerAvg('');
    setShowAddEntryModal(false);
  };

  const handleDeleteEntry = (entryId) => {
    if (!currentBoard) return;
    const filtered = currentBoard.entries.filter(e => e.id !== entryId);
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: filtered }
    };
    saveLeaderboards(updated);
  };

  const handleToggleVerifyEntry = (entryId) => {
    if (currentUser.role !== 'admin' || !currentBoard) return;
    const updatedEntries = currentBoard.entries.map(e => {
      if (e.id === entryId) {
        return { ...e, verified: !e.verified };
      }
      return e;
    });
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: updatedEntries }
    };
    saveLeaderboards(updated);
  };

  // Auth Handlers
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    if (authTab === 'user') {
      const name = inputUserName.trim() || 'Người chơi';
      const email = inputUserEmail.trim() || `${name.toLowerCase()}@cuber.vn`;
      const userObj = { role: 'user', name, email };
      setCurrentUser(userObj);
      localStorage.setItem('rubik_auth_user', JSON.stringify(userObj));
      setShowAuthModal(false);
      setInputUserName('');
      setInputUserEmail('');
    } else {
      if (inputAdminPassword === adminSettings.adminPassword) {
        const adminObj = { role: 'admin', name: 'Quản Trị Viên (Admin)', email: 'admin@hust.edu.vn' };
        setCurrentUser(adminObj);
        localStorage.setItem('rubik_auth_user', JSON.stringify(adminObj));
        setShowAuthModal(false);
        setInputAdminPassword('');
        alert('🎉 Đăng nhập Admin thành công!');
      } else {
        setAuthError('Mật khẩu Admin không chính xác! (Mặc định: admin123)');
      }
    }
  };

  const handleLogout = () => {
    const defaultUser = { role: 'user', name: 'Khách', email: 'guest@cuber.vn' };
    setCurrentUser(defaultUser);
    localStorage.setItem('rubik_auth_user', JSON.stringify(defaultUser));
  };

  const handleSaveAdminSettings = (e) => {
    e.preventDefault();
    const newSettings = {
      adminPassword: editAdminPassword.trim() || 'admin123',
      competitionTitle: editCompTitle.trim() || 'Rubik Timer & AI Verification',
      subTitle: editCompSub.trim() || 'HUST Speedcubing',
      spaceHoldMs: Number(editSpaceHoldMs) || 280
    };
    setAdminSettings(newSettings);
    localStorage.setItem('rubik_admin_settings', JSON.stringify(newSettings));
    setShowAdminPanelModal(false);
    alert('✅ Đã lưu cài đặt Quản trị thành công!');
  };

  // Camera & AI State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraHealth, setCameraHealth] = useState({
    isHealthy: false,
    reason: 'Camera chưa bật',
    brightness: 0,
    contrast: 0
  });

  const currentDim = PUZZLE_CONFIGS[puzzleType]?.dim || 3;
  const [detectedColors, setDetectedColors] = useState(() => Array(currentDim * currentDim).fill('invalid'));
  const [preCheckStatus, setPreCheckStatus] = useState({
    verified: false,
    text: 'Camera AI đang tắt (Chế độ thủ công chuẩn WCA)',
    isScrambled: false,
    centerFace: null
  });

  const [trackedMoves, setTrackedMoves] = useState([]);
  const [lastMoveDetected, setLastMoveDetected] = useState('');

  // Refs
  const timerStateRef = useRef('idle');
  const timerIntervalRef = useRef(null);
  const inspectionIntervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const inspectionStartRef = useRef(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const prevColorsRef = useRef(null);
  const lastMoveTimeRef = useRef(0);
  const trackedMovesRef = useRef([]);
  const cameraActiveRef = useRef(false);
  const cameraHealthRef = useRef(false);
  const puzzleTypeRef = useRef(puzzleType);
  const gameModeRef = useRef(gameMode);
  const adminSettingsRef = useRef(adminSettings);

  useEffect(() => { timerStateRef.current = timerState; }, [timerState]);
  useEffect(() => { cameraActiveRef.current = cameraActive; }, [cameraActive]);
  useEffect(() => { trackedMovesRef.current = trackedMoves; }, [trackedMoves]);
  useEffect(() => {
    puzzleTypeRef.current = puzzleType;
    setDetectedColors(Array(currentDim * currentDim).fill('invalid'));
  }, [puzzleType, currentDim]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { adminSettingsRef.current = adminSettings; }, [adminSettings]);

  // Inspection Timer Loop (WCA Mode)
  const startInspection = useCallback(() => {
    setTimerState('inspecting');
    setInspectionSeconds(15);
    setPenaltyText('');
    inspectionStartRef.current = performance.now();

    if (inspectionIntervalRef.current) clearInterval(inspectionIntervalRef.current);
    inspectionIntervalRef.current = setInterval(() => {
      const elapsedSec = (performance.now() - inspectionStartRef.current) / 1000;
      const remain = 15 - elapsedSec;

      if (remain <= -2) {
        // Exceeded 17s: DNF
        setPenaltyText('DNF');
        setInspectionSeconds(0);
      } else if (remain <= 0) {
        // Exceeded 15s to 17s: +2s penalty
        setPenaltyText('+2');
        setInspectionSeconds(0);
      } else {
        setInspectionSeconds(Math.ceil(remain));
      }
    }, 100);
  }, []);

  // Stop Timer
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }

    const finalRawMs = performance.now() - startTimeRef.current;
    let finalSec = parseFloat((finalRawMs / 1000).toFixed(2));

    // Handle penalties
    if (penaltyText === '+2') {
      finalSec = parseFloat((finalSec + 2.0).toFixed(2));
    }

    setTimeMs(finalSec * 1000);
    setTimerState('idle');

    // Check target mode
    if (gameModeRef.current === 'target') {
      if (finalSec <= targetSeconds) {
        setLastTargetResult('win');
      } else {
        setLastTargetResult('loss');
      }
    }

    const movesRecorded = trackedMovesRef.current;
    const isCameraVerified = cameraActiveRef.current && cameraHealthRef.current && movesRecorded.length > 0;
    const currentP = puzzleTypeRef.current;

    const newSolve = {
      id: Date.now(),
      puzzleType: currentP,
      time: finalSec,
      penalty: penaltyText,
      date: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      moves: isCameraVerified ? movesRecorded.join(' ') : 'Giải thủ công (Spacebar)',
      verified: isCameraVerified
    };

    setSolves(prev => {
      const updated = [newSolve, ...prev];
      localStorage.setItem('rubik_solves_hcc', JSON.stringify(updated));
      return updated;
    });

    setTrackedMoves([]);
    setLastMoveDetected('');
    setScramble(generateScramble(currentP));
  }, [penaltyText, targetSeconds]);

  // Start Solve Timer
  const startTimer = useCallback(() => {
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }

    setTimeMs(0);
    setTrackedMoves([]);
    setLastMoveDetected('');
    setTimerState('running');
    startTimeRef.current = performance.now();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeMs(performance.now() - startTimeRef.current);
    }, 10);
  }, []);

  const stopTimerRef = useRef(stopTimer);
  const startTimerRef = useRef(startTimer);
  const startInspectionRef = useRef(startInspection);
  useEffect(() => {
    stopTimerRef.current = stopTimer;
    startTimerRef.current = startTimer;
    startInspectionRef.current = startInspection;
  }, [stopTimer, startTimer, startInspection]);

  // WCA Keyboard Spacebar Controller
  useEffect(() => {
    let holdTimeout = null;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

      const currentState = timerStateRef.current;
      const currentMode = gameModeRef.current;

      if (e.code === 'Space') {
        e.preventDefault();

        if (currentState === 'running') {
          stopTimerRef.current();
          return;
        }

        if (e.repeat) return;

        // In WCA mode, if idle, pressing space begins 15s inspection first!
        if (currentMode === 'wca' && currentState === 'idle') {
          startInspectionRef.current();
          return;
        }

        // Ready to solve (Holding space in idle or inspecting)
        if (currentState === 'idle' || currentState === 'inspecting') {
          setTimerState('holding');
          clearTimeout(holdTimeout);
          const holdMs = adminSettingsRef.current?.spaceHoldMs || 280;
          holdTimeout = setTimeout(() => {
            if (timerStateRef.current === 'holding') {
              setTimerState('ready');
            }
          }, holdMs);
        }
      } else {
        if (currentState === 'running') {
          stopTimerRef.current();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        clearTimeout(holdTimeout);
        const currentState = timerStateRef.current;

        if (currentState === 'ready') {
          startTimerRef.current();
        } else if (currentState === 'holding') {
          // If released early in WCA inspection, return to inspection
          if (gameModeRef.current === 'wca') {
            setTimerState('inspecting');
          } else {
            setTimerState('idle');
          }
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
  }, []);

  // Camera Handler
  const toggleCamera = async () => {
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setCameraActive(false);
      cameraHealthRef.current = false;
      setCameraHealth({ isHealthy: false, reason: 'Camera đã tắt', brightness: 0, contrast: 0 });
      setPreCheckStatus({
        verified: false,
        text: 'Camera đã tắt — Chế độ tính giờ WCA thủ công',
        isScrambled: false,
        centerFace: null
      });
      setTrackedMoves([]);
      setLastMoveDetected('');
    } else {
      try {
        setPreCheckStatus(prev => ({ ...prev, text: 'Đang kết nối camera...' }));
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraActive(true);
      } catch (err) {
        setCameraActive(false);
        cameraHealthRef.current = false;
        setCameraHealth({ isHealthy: false, reason: 'Không thể mở camera: ' + err.message, brightness: 0, contrast: 0 });
        setPreCheckStatus({
          verified: false,
          text: 'Lỗi: Không tìm thấy camera hoặc bị lỗi phần cứng',
          isScrambled: false,
          centerFace: null
        });
      }
    }
  };

  useEffect(() => {
    if (!cameraActive) return;

    let isRunningLoop = true;

    const processFrame = () => {
      if (!isRunningLoop) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === 4 && video.videoWidth > 0) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(video, 0, 0, w, h);
        const frameImg = ctx.getImageData(0, 0, w, h).data;

        let totalBrightness = 0;
        const pixelStep = 16;
        let sampledCount = 0;
        let minVal = 255;
        let maxVal = 0;

        for (let i = 0; i < frameImg.length; i += pixelStep * 4) {
          const lum = 0.299 * frameImg[i] + 0.587 * frameImg[i + 1] + 0.114 * frameImg[i + 2];
          totalBrightness += lum;
          if (lum < minVal) minVal = lum;
          if (lum > maxVal) maxVal = lum;
          sampledCount++;
        }

        const avgBrightness = totalBrightness / sampledCount;
        const contrast = maxVal - minVal;

        let isHealthy = true;
        let healthReason = 'Hoạt động tốt';

        if (avgBrightness < 30) {
          isHealthy = false;
          healthReason = 'Camera bị hỏng / tối đen';
        } else if (contrast < 20) {
          isHealthy = false;
          healthReason = 'Camera bị mờ đơ / không tương phản';
        }

        cameraHealthRef.current = isHealthy;
        setCameraHealth({
          isHealthy,
          reason: healthReason,
          brightness: Math.round(avgBrightness),
          contrast: Math.round(contrast)
        });

        if (!isHealthy) {
          setPreCheckStatus({
            verified: false,
            text: `⚠️ ${healthReason}. Đã khóa AI để tránh sai lệch!`,
            isScrambled: false,
            centerFace: null
          });
          setDetectedColors(Array(currentDim * currentDim).fill('invalid'));
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const dim = currentDim;
        const boxSize = Math.min(w, h) * 0.54;
        const startX = (w - boxSize) / 2;
        const startY = (h - boxSize) / 2;
        const cellSize = boxSize / dim;
        const sampleRadius = Math.max(2, Math.floor(cellSize * 0.16));

        const currentNxNColors = [];
        let validColorsCount = 0;

        for (let row = 0; row < dim; row++) {
          for (let col = 0; col < dim; col++) {
            const cx = Math.floor(startX + col * cellSize + cellSize / 2);
            const cy = Math.floor(startY + row * cellSize + cellSize / 2);

            let rSum = 0, gSum = 0, bSum = 0, count = 0;

            for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) {
              for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
                const px = cx + dx;
                const py = cy + dy;
                if (px >= 0 && px < w && py >= 0 && py < h) {
                  const idx = (py * w + px) * 4;
                  rSum += frameImg[idx];
                  gSum += frameImg[idx + 1];
                  bSum += frameImg[idx + 2];
                  count++;
                }
              }
            }

            if (count > 0) {
              const avgR = rSum / count;
              const avgG = gSum / count;
              const avgB = bSum / count;
              const rawB = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
              const hsv = rgbToHsv(avgR, avgG, avgB);
              const colorKey = classifyHsvColor(hsv.h, hsv.s, hsv.v, rawB);

              currentNxNColors.push(colorKey);
              if (colorKey !== 'invalid') validColorsCount++;
            } else {
              currentNxNColors.push('invalid');
            }
          }
        }

        setDetectedColors(currentNxNColors);

        const minStickersRequired = Math.floor(dim * dim * 0.6);
        if (validColorsCount < minStickersRequired) {
          setPreCheckStatus({
            verified: false,
            text: `🔍 Đang đợi khối ${dim}×${dim} trước camera...`,
            isScrambled: false,
            centerFace: null
          });
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const centerIdx = dim % 2 === 1 ? Math.floor((dim * dim) / 2) : 0;
        const centerColor = currentNxNColors[centerIdx];
        const centerDef = COLOR_DEFINITIONS[centerColor];
        const centerName = centerDef ? centerDef.name : 'Không rõ';
        const validColorsOnly = currentNxNColors.filter(c => c !== 'invalid');
        const uniqueColorsCount = new Set(validColorsOnly).size;
        const isAllSameColor = validColorsCount === (dim * dim) && uniqueColorsCount === 1;

        if (timerStateRef.current === 'idle') {
          if (uniqueColorsCount >= 2) {
            setPreCheckStatus({
              verified: true,
              text: `🟢 ĐÃ CHECK KHỐI ${dim}×${dim}: Đã xáo trộn hợp lệ! Sẵn sàng bấm giờ.`,
              isScrambled: true,
              centerFace: centerName
            });
          } else if (isAllSameColor) {
            setPreCheckStatus({
              verified: false,
              text: `⚠️ Khối ${dim}×${dim} đang ở trạng thái hoàn thành`,
              isScrambled: false,
              centerFace: centerName
            });
          }
        }

        const now = performance.now();
        if (
          timerStateRef.current === 'running' &&
          isAllSameColor &&
          (now - startTimeRef.current > 2500)
        ) {
          stopTimerRef.current();
        }

        prevColorsRef.current = currentNxNColors;
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunningLoop = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraActive, currentDim]);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (ms) => {
    const totalSec = ms / 1000;
    return totalSec.toFixed(2);
  };

  // Stat calculations
  const bestTime = currentSolves.length > 0 
    ? Math.min(...currentSolves.map(s => s.time)).toFixed(2) 
    : '--';
  const meanTime = currentSolves.length > 0 
    ? (currentSolves.reduce((acc, s) => acc + s.time, 0) / currentSolves.length).toFixed(2) 
    : '--';
  const ao5 = calculateAo(currentSolves, 5);
  const ao12 = calculateAo(currentSolves, 12);

  const deleteSolve = (id) => {
    setSolves(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('rubik_solves_hcc', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAddMyScoreToBoard = () => {
    if (currentSolves.length === 0) {
      alert(`Bạn chưa có lượt giải ${puzzleType} nào để thêm vào bảng!`);
      return;
    }
    const myBest = Math.min(...currentSolves.map(s => s.time));
    const myAvg = parseFloat(meanTime);

    const newEntry = {
      id: Date.now(),
      puzzleType: puzzleType,
      name: `${currentUser.name} (${puzzleType})`,
      best: myBest,
      avg: isNaN(myAvg) ? myBest : myAvg,
      verified: currentUser.role === 'admin'
    };

    const currentEntries = currentBoard?.entries || [];
    const sorted = [...currentEntries, newEntry].sort((a, b) => a.best - b.best);
    const updated = {
      ...leaderboards,
      [activeBoardId]: { ...currentBoard, entries: sorted }
    };
    saveLeaderboards(updated);
  };

  const displayedEntries = (currentBoard?.entries || []).filter(e => {
    if (leaderboardFilter === 'all') return true;
    return (e.puzzleType || '3x3') === puzzleType;
  });

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#090f1d',
      color: '#e2e8f0',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ==========================================
          HEADER BAR: AUTH + DASHBOARD + ADMIN
      ========================================== */}
      <header style={{
        padding: '10px 24px',
        backgroundColor: '#0d1629',
        borderBottom: '1px solid #192642',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            background: currentUser.role === 'admin' 
              ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
              : 'linear-gradient(135deg, #2563eb, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: currentUser.role === 'admin' 
              ? '0 2px 10px rgba(245, 158, 11, 0.4)' 
              : '0 2px 10px rgba(37, 99, 235, 0.4)'
          }}>
            {currentUser.role === 'admin' ? '👑' : '⏱️'}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.02rem', fontWeight: '700', color: '#f8fafc' }}>
              {adminSettings.competitionTitle}
            </h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
              {adminSettings.subTitle}
            </p>
          </div>
        </div>

        {/* Right header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* NÚT MỞ DASHBOARD THỐNG KÊ */}
          <button
            onClick={() => setShowDashboardModal(true)}
            style={{
              padding: '6px 13px',
              borderRadius: '6px',
              border: '1px solid #38bdf844',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(37, 99, 235, 0.2))',
              color: '#38bdf8',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(56, 189, 248, 0.2)'
            }}
          >
            <span>📊</span>
            <span>Dashboard Thống Kê</span>
          </button>

          {/* Camera Button */}
          <button
            onClick={toggleCamera}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: cameraActive 
                ? (cameraHealth.isHealthy ? '1px solid #22c55e' : '1px solid #ef4444') 
                : '1px solid #334155',
              background: cameraActive 
                ? (cameraHealth.isHealthy ? '#14532d55' : '#7f1d1d44') 
                : '#1e293b',
              color: cameraActive 
                ? (cameraHealth.isHealthy ? '#4ade80' : '#f87171') 
                : '#94a3b8',
              fontWeight: '600',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{cameraActive ? (cameraHealth.isHealthy ? '🟢' : '🔴') : '📷'}</span>
            <span>{cameraActive ? (cameraHealth.isHealthy ? 'Tắt Cam' : 'Lỗi Cam') : 'Bật Cam'}</span>
          </button>

          {/* User / Admin Controls */}
          {currentUser.role === 'admin' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  setEditCompTitle(adminSettings.competitionTitle);
                  setEditCompSub(adminSettings.subTitle);
                  setEditSpaceHoldMs(adminSettings.spaceHoldMs);
                  setEditAdminPassword(adminSettings.adminPassword);
                  setShowAdminPanelModal(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)'
                }}
              >
                <span>⚙️</span>
                <span>Bảng Quản Trị Admin</span>
              </button>

              <button
                onClick={handleLogout}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Thoát Admin
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                onClick={() => setShowAuthModal(true)}
                title="Bấm để đổi tài khoản"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#111c34',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #1a2a4c',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>👤</span>
                <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '600' }}>
                  {currentUser.name}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                  Tuyển thủ
                </span>
              </div>

              <button
                onClick={() => { setAuthTab('admin'); setShowAuthModal(true); }}
                style={{
                  background: '#111c34',
                  border: '1px solid #f59e0b55',
                  color: '#f59e0b',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                👑 Admin Login
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ==========================================
          MAIN 3-COLUMN WORKSPACE
      ========================================== */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '270px 1fr 380px',
        padding: '12px 20px',
        gap: '16px',
        overflow: 'hidden'
      }}>
        {/* === CỘT TRÁI: THÀNH TÍCH & LỊCH SỬ === */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
                Thành tích ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{currentSolves.length} lượt</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Best Single</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#38bdf8' }}>{bestTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mean</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc' }}>{meanTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Current ao5</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Current ao12</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Lịch sử giải */}
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
                Lịch sử ({puzzleType})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mới nhất</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {currentSolves.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem', marginTop: '24px' }}>
                  Chưa có lượt giải {puzzleType} nào
                </div>
              ) : (
                currentSolves.map((s, index) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#111c34',
                      border: '1px solid #192642',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>#{currentSolves.length - index}</span>
                      <div>
                        <strong style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                          {s.time}s
                        </strong>
                        {s.penalty && (
                          <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: '700', marginLeft: '4px' }}>
                            ({s.penalty})
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: s.verified ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: s.verified ? '#4ade80' : '#94a3b8'
                      }}>
                        {s.verified ? '✓ AI' : 'Thủ công'}
                      </span>
                      <button
                        onClick={() => deleteSolve(s.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* === CỘT GIỮA: CHẾ ĐỘ CHƠI + PUZZLE TABS + SCRAMBLE + CAMERA + TIMER === */}
        <div style={{
          backgroundColor: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '16px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          {/* Top Bar: GAME MODES + PUZZLE SELECTOR */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {/* 1. GAME MODES TABS */}
            <div style={{
              display: 'flex',
              background: '#090f1d',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #16223b',
              gap: '4px'
            }}>
              {GAME_MODES.map((m) => {
                const isSelected = gameMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelectGameMode(m.id)}
                    title={m.desc}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                      color: isSelected ? '#ffffff' : '#64748b',
                      fontWeight: isSelected ? '700' : '600',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>

            {/* Target mode config if selected */}
            {gameMode === 'target' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#94a3b8' }}>
                <span>Mục tiêu Sub:</span>
                {[10, 15, 20, 30].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setTargetSeconds(sec)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: targetSeconds === sec ? '1px solid #38bdf8' : '1px solid #1e293b',
                      background: targetSeconds === sec ? '#1e3a8a' : '#111c34',
                      color: targetSeconds === sec ? '#ffffff' : '#94a3b8',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      fontWeight: '700'
                    }}
                  >
                    Sub-{sec}s
                  </button>
                ))}
              </div>
            )}

            {/* 2. PUZZLE SELECTOR TABS (2x2, 3x3, 4x4, 5x5) */}
            <div style={{
              display: 'inline-flex',
              background: '#090f1d',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #16223b',
              gap: '4px'
            }}>
              {Object.values(PUZZLE_CONFIGS).map((p) => {
                const isSelected = puzzleType === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPuzzle(p.id)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSelected ? '#1e293b' : 'transparent',
                      color: isSelected ? '#38bdf8' : '#64748b',
                      fontWeight: isSelected ? '800' : '600',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      borderBottom: isSelected ? '2px solid #38bdf8' : '2px solid transparent'
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            {/* Scramble text */}
            <div style={{ width: '100%', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>
                  SCRAMBLE {PUZZLE_CONFIGS[puzzleType]?.name}
                </span>
                <button
                  onClick={() => setScramble(generateScramble(puzzleType))}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  🔄 Đổi
                </button>
              </div>

              <div style={{
                fontSize: puzzleType === '5x5' ? '0.9rem' : (puzzleType === '4x4' ? '1.02rem' : '1.15rem'),
                fontWeight: '700',
                lineHeight: 1.4,
                color: '#cbd5e1',
                fontFamily: 'monospace',
                padding: '8px 12px',
                background: '#090f1d',
                borderRadius: '8px',
                border: '1px solid #16223b',
                maxHeight: '65px',
                overflowY: 'auto'
              }}>
                {scramble}
              </div>
            </div>
          </div>

          {/* Center-Top: Camera view or Mode status banner */}
          {cameraActive ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 12px',
              background: '#090f1d',
              borderRadius: '10px',
              border: cameraHealth.isHealthy ? '1px solid #192642' : '1px solid #ef4444'
            }}>
              <div style={{
                width: '110px',
                height: '75px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: '#020617',
                border: '1px solid #334155'
              }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${currentDim}, ${currentDim >= 4 ? '14px' : '18px'})`,
                gap: '2px',
                background: '#020617',
                padding: '3px',
                borderRadius: '5px'
              }}>
                {detectedColors.map((colorKey, i) => (
                  <div
                    key={i}
                    style={{
                      width: currentDim >= 4 ? '14px' : '18px',
                      height: currentDim >= 4 ? '14px' : '18px',
                      borderRadius: '2px',
                      backgroundColor: COLOR_DEFINITIONS[colorKey]?.bg || '#334155'
                    }}
                  />
                ))}
              </div>

              <div style={{ maxWidth: '200px', fontSize: '0.7rem', color: preCheckStatus.verified ? '#4ade80' : '#f59e0b' }}>
                {preCheckStatus.text}
              </div>
            </div>
          ) : (
            <div style={{
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontSize: '0.74rem'
            }}>
              {gameMode === 'wca' && '🏆 Chế độ WCA: Bấm Space để bắt đầu 15s Inspection (quan sát)'}
              {gameMode === 'target' && `⚡ Mục tiêu: Cố gắng hoàn thành trong Sub-${targetSeconds}s!`}
              {gameMode === 'free' && '🎯 Chế độ Tự Do: Nhấn giữ Spacebar để sẵn sàng giải'}
              {gameMode === 'ai' && '🤖 Chế độ AI: Bật camera để AI làm trọng tài xác minh'}
            </div>
          )}

          {/* Center-Middle: GIANT TIMER & INSPECTION DISPLAY */}
          <div
            onClick={() => {
              if (timerState === 'running') stopTimerRef.current();
              else if (timerState === 'inspecting') startTimerRef.current();
              else if (timerState === 'idle') {
                if (gameMode === 'wca') startInspectionRef.current();
                else startTimerRef.current();
              }
            }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              margin: 'auto 0'
            }}
          >
            {/* Timer digits or Inspection seconds */}
            <div style={{
              fontSize: timerState === 'inspecting' ? '9rem' : '8.2rem',
              fontWeight: '900',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              letterSpacing: '-3px',
              lineHeight: 1,
              color: timerState === 'inspecting' 
                ? (inspectionSeconds <= 3 ? '#ef4444' : '#f59e0b')
                : (timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#ffffff')),
              textShadow: timerState === 'ready' ? '0 0 45px rgba(34, 197, 94, 0.5)' : 'none',
              transition: 'color 0.1s ease'
            }}>
              {timerState === 'inspecting' ? inspectionSeconds : formatTime(timeMs)}
            </div>

            {/* Subtitle / Status */}
            <div style={{
              marginTop: '10px',
              fontSize: '0.95rem',
              fontWeight: '700',
              color: timerState === 'inspecting'
                ? '#f59e0b'
                : (timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#64748b'))
            }}>
              {timerState === 'inspecting' && '⏱️ ĐANG QUAN SÁT (15s WCA) — GIỮ SPACE ĐỂ SẴN SÀNG!'}
              {timerState === 'ready' && '● SẴN SÀNG — THẢ PHÍM SPACE ĐỂ BẮT ĐẦU!'}
              {timerState === 'holding' && '○ Giữ thêm một chút...'}
              {timerState === 'running' && 'Đang tính giờ... (Nhấn phím bất kỳ hoặc click để dừng)'}
              {timerState === 'idle' && (
                gameMode === 'wca' 
                  ? 'Nhấn Space để bắt đầu 15s quan sát (Inspection)' 
                  : `Giữ phím SPACE để chuẩn bị giải ${PUZZLE_CONFIGS[puzzleType]?.name}`
              )}
            </div>

            {/* Target mode celebration / fail badge */}
            {lastTargetResult && timerState === 'idle' && (
              <div style={{
                marginTop: '8px',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '700',
                background: lastTargetResult === 'win' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: lastTargetResult === 'win' ? '#4ade80' : '#ef4444'
              }}>
                {lastTargetResult === 'win' ? `🎉 CHIẾN THẮNG! Đạt mục tiêu Sub-${targetSeconds}s!` : `Chưa đạt Sub-${targetSeconds}s, cố lên!`}
              </div>
            )}
          </div>

          {/* Bottom Instructions */}
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.78rem', lineHeight: 1.5 }}>
            <div>Giữ phím Space cho đến khi đổi màu xanh lá → Thả tay để bắt đầu giải</div>
            <div>Dừng bằng cách nhấn phím bất kỳ hoặc click chuột vào đồng hồ</div>
          </div>
        </div>

        {/* === CỘT PHẢI: BẢNG XẾP HẠNG === */}
        <div style={{
          backgroundColor: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Header Bảng Xếp Hạng & Chọn Bảng */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <select
              value={activeBoardId}
              onChange={(e) => {
                setActiveBoardId(e.target.value);
                localStorage.setItem('rubik_active_board_id', e.target.value);
              }}
              style={{
                background: '#111c34',
                border: '1px solid #1a2a4c',
                color: '#f8fafc',
                fontSize: '0.9rem',
                fontWeight: '700',
                padding: '5px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '190px'
              }}
            >
              {Object.values(leaderboards).map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>

            <button
              onClick={() => setShowNewBoardModal(true)}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: '700',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ➕ Lập bảng mới
            </button>
          </div>

          {/* Action Bar & Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', margin: '4px 0 8px 0' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setShowAddEntryModal(true)}
                style={{
                  background: '#111c34',
                  border: '1px solid #1e293b',
                  color: '#38bdf8',
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                + Thêm kỷ lục
              </button>

              <button
                onClick={handleAddMyScoreToBoard}
                style={{
                  background: '#111c34',
                  border: '1px solid #1e293b',
                  color: '#4ade80',
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                + Ghi điểm tôi
              </button>
            </div>

            <div style={{ display: 'flex', background: '#111c34', borderRadius: '4px', border: '1px solid #1e293b', padding: '2px' }}>
              <button
                onClick={() => setLeaderboardFilter('current')}
                style={{
                  background: leaderboardFilter === 'current' ? '#2563eb' : 'transparent',
                  border: 'none',
                  color: leaderboardFilter === 'current' ? '#ffffff' : '#94a3b8',
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {puzzleType}
              </button>
              <button
                onClick={() => setLeaderboardFilter('all')}
                style={{
                  background: leaderboardFilter === 'all' ? '#2563eb' : 'transparent',
                  border: 'none',
                  color: leaderboardFilter === 'all' ? '#ffffff' : '#94a3b8',
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Tất cả
              </button>
            </div>
          </div>

          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '26px 42px 1fr 58px 58px 24px',
            padding: '6px 6px',
            fontSize: '0.72rem',
            color: '#64748b',
            borderBottom: '1px solid #192642',
            fontWeight: '600'
          }}>
            <span>#</span>
            <span>Loại</span>
            <span>Tài khoản</span>
            <span style={{ textAlign: 'right' }}>Best</span>
            <span style={{ textAlign: 'right' }}>Avg</span>
            <span></span>
          </div>

          {/* Table Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayedEntries.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem', marginTop: '36px' }}>
                Chưa có kỷ lục nào.
              </div>
            ) : (
              displayedEntries.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px 42px 1fr 58px 58px 24px',
                    padding: '8px 6px',
                    borderBottom: '1px solid #111c34',
                    fontSize: '0.8rem',
                    alignItems: 'center',
                    background: index === 0 ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{ fontWeight: '700', color: index < 3 ? '#38bdf8' : '#64748b' }}>
                    {index + 1}
                  </span>

                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: '700',
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    width: 'fit-content'
                  }}>
                    {item.puzzleType || '3x3'}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                    <span
                      title={item.name}
                      style={{
                        color: '#e2e8f0',
                        fontWeight: '600',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.name}
                    </span>
                    {item.verified && (
                      <span
                        onClick={() => currentUser.role === 'admin' && handleToggleVerifyEntry(item.id)}
                        style={{
                          flexShrink: 0,
                          fontSize: '0.6rem',
                          color: '#4ade80',
                          background: 'rgba(34, 197, 94, 0.1)',
                          padding: '1px 3px',
                          borderRadius: '3px',
                          cursor: currentUser.role === 'admin' ? 'pointer' : 'default'
                        }}
                      >
                        ✓ AI
                      </span>
                    )}
                  </div>

                  <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#f8fafc' }}>
                    {typeof item.best === 'number' ? `${item.best}s` : item.best}
                  </span>

                  <span style={{ textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>
                    {typeof item.avg === 'number' ? `${item.avg}s` : item.avg}
                  </span>

                  <button
                    onClick={() => handleDeleteEntry(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: currentUser.role === 'admin' ? '#ef4444' : '#475569',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          MODAL: DASHBOARD THỐNG KÊ TOÀN DIỆN
      ========================================== */}
      {showDashboardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '720px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowDashboardModal(false)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.3rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <span style={{ fontSize: '1.6rem' }}>📊</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                  Dashboard Thống Kê & Phân Tích Kỷ Lục
                </h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  Dữ liệu phân tích chi tiết tiến độ luyện tập speedcubing của bạn
                </p>
              </div>
            </div>

            {/* 1. KPI CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Best Single ({puzzleType})</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#38bdf8' }}>{bestTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Current ao5</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao5 !== '--' ? '#4ade80' : '#94a3b8' }}>
                  {ao5 !== '--' ? `${ao5}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Current ao12</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: ao12 !== '--' ? '#c084fc' : '#94a3b8' }}>
                  {ao12 !== '--' ? `${ao12}s` : '--'}
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '12px', borderRadius: '10px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Tổng Lượt Giải</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc' }}>
                  {solves.length} lượt
                </div>
              </div>
            </div>

            {/* 2. BIỂU ĐỒ ĐƯỜNG TIẾN ĐỘ THỜI GIAN (SVG LINE CHART) */}
            <div style={{ background: '#111c34', padding: '16px', borderRadius: '12px', border: '1px solid #1a2a4c', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc' }}>
                  📈 Xu Hướng Biến Thiên Thời Gian ({puzzleType})
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {currentSolves.length} lượt giải gần nhất
                </span>
              </div>

              {currentSolves.length < 2 ? (
                <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.8rem' }}>
                  Cần tối thiểu 2 lượt giải {puzzleType} để vẽ biểu đồ tiến độ.
                </div>
              ) : (
                <div style={{ width: '100%', height: '150px', position: 'relative' }}>
                  {/* SVG Chart */}
                  {(() => {
                    const rev = [...currentSolves].reverse();
                    const times = rev.map(s => s.time);
                    const minT = Math.min(...times);
                    const maxT = Math.max(...times);
                    const range = Math.max(maxT - minT, 1);
                    const chartW = 600;
                    const chartH = 120;

                    const points = times.map((t, idx) => {
                      const x = (idx / (times.length - 1)) * chartW;
                      const y = chartH - ((t - minT) / range) * (chartH - 20) - 10;
                      return `${x},${y}`;
                    }).join(' ');

                    return (
                      <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        {/* Horizontal grid lines */}
                        <line x1="0" y1="10" x2={chartW} y2="10" stroke="#192642" strokeDasharray="4" />
                        <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#192642" strokeDasharray="4" />
                        <line x1="0" y1={chartH - 10} x2={chartW} y2={chartH - 10} stroke="#192642" strokeDasharray="4" />

                        {/* Trend line */}
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points}
                        />

                        {/* Data dots */}
                        {times.map((t, idx) => {
                          const x = (idx / (times.length - 1)) * chartW;
                          const y = chartH - ((t - minT) / range) * (chartH - 20) - 10;
                          const isBest = t === minT;
                          return (
                            <circle
                              key={idx}
                              cx={x}
                              cy={y}
                              r={isBest ? 5 : 3.5}
                              fill={isBest ? '#facc15' : '#2563eb'}
                              stroke="#ffffff"
                              strokeWidth={isBest ? 2 : 1}
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 3. BẢNG SO SÁNH CẢ 4 KHỐI (2x2, 3x3, 4x4, 5x5) */}
            <div style={{ background: '#111c34', padding: '16px', borderRadius: '12px', border: '1px solid #1a2a4c' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '12px' }}>
                🏆 Tổng Kết Thành Tích Cả 4 Khối
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {Object.values(PUZZLE_CONFIGS).map(p => {
                  const pSolves = solves.filter(s => (s.puzzleType || '3x3') === p.id);
                  const pBest = pSolves.length > 0 ? Math.min(...pSolves.map(s => s.time)).toFixed(2) : '--';
                  const pAo5 = calculateAo(pSolves, 5);

                  return (
                    <div
                      key={p.id}
                      onClick={() => { handleSelectPuzzle(p.id); setShowDashboardModal(false); }}
                      style={{
                        background: puzzleType === p.id ? 'rgba(37, 99, 235, 0.15)' : '#090f1d',
                        border: puzzleType === p.id ? '1px solid #38bdf8' : '1px solid #192642',
                        borderRadius: '8px',
                        padding: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc' }}>{p.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{pSolves.length} lượt</div>
                      <div style={{ marginTop: '6px', fontSize: '1.1rem', fontWeight: '800', color: '#38bdf8' }}>
                        {pBest !== '--' ? `${pBest}s` : '--'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                        ao5: {pAo5 !== '--' ? `${pAo5}s` : '--'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ĐĂNG NHẬP RIÊNG (USER VS ADMIN)
      ========================================== */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '430px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '16px',
            padding: '26px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowAuthModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: '#090f1d',
              borderRadius: '8px',
              padding: '4px',
              marginBottom: '20px',
              border: '1px solid #16223b'
            }}>
              <button
                onClick={() => { setAuthTab('user'); setAuthError(''); }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: authTab === 'user' ? '#1e3a8a' : 'transparent',
                  color: authTab === 'user' ? '#ffffff' : '#94a3b8',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                👤 Tuyển Thủ (User)
              </button>

              <button
                onClick={() => { setAuthTab('admin'); setAuthError(''); }}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: authTab === 'admin' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                  color: authTab === 'admin' ? '#ffffff' : '#94a3b8',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                👑 Admin Quản Trị
              </button>
            </div>

            {authTab === 'user' && (
              <form onSubmit={handleLoginSubmit}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
                  Đăng Nhập Tuyển Thủ
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Lưu thành tích và đưa điểm của bạn vào bảng xếp hạng.
                </p>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Tên hiển thị / Nickname:
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: khoa.tt2611758"
                    value={inputUserName}
                    onChange={(e) => setInputUserName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      background: '#111c34',
                      border: '1px solid #1a2a4c',
                      color: '#f8fafc',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Email:
                  </label>
                  <input
                    type="email"
                    placeholder="Ví dụ: khoa.tt@sis.hust.edu.vn"
                    value={inputUserEmail}
                    onChange={(e) => setInputUserEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      background: '#111c34',
                      border: '1px solid #1a2a4c',
                      color: '#f8fafc',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '7px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Đăng Nhập Tuyển Thủ
                </button>
              </form>
            )}

            {authTab === 'admin' && (
              <form onSubmit={handleLoginSubmit}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: '#f59e0b' }}>
                  Cổng Đăng Nhập Quản Trị Viên
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Dành riêng cho bạn để tùy chỉnh hệ thống và bảng điểm.
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Mật khẩu Admin:
                  </label>
                  <input
                    type="password"
                    placeholder="Mặc định: admin123"
                    value={inputAdminPassword}
                    onChange={(e) => setInputAdminPassword(e.target.value)}
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      background: '#111c34',
                      border: '1px solid #f59e0b55',
                      color: '#f8fafc',
                      fontSize: '0.88rem'
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '4px' }}>
                    * Mật khẩu quản trị mặc định: <strong>admin123</strong>
                  </div>
                </div>

                {authError && (
                  <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '14px', background: '#450a0a', padding: '6px 10px', borderRadius: '4px' }}>
                    ⚠️ {authError}
                  </div>
                )}

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '7px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Mở Khóa Quyền Admin
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: ADMIN CONTROL PANEL
      ========================================== */}
      {showAdminPanelModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 8, 16, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            width: '92%',
            maxWidth: '560px',
            backgroundColor: '#0d1629',
            border: '1px solid #f59e0b66',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8)',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowAdminPanelModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.5rem' }}>👑</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f59e0b' }}>
                  Bảng Điều Khiển Quản Trị Viên (Admin)
                </h2>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Cấu hình hệ thống, phím Spacebar và bảo mật
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveAdminSettings}>
              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#38bdf8' }}>
                  ⚙️ 1. Cấu hình tiêu đề giải đấu
                </h4>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Tiêu đề chính:
                  </label>
                  <input
                    type="text"
                    value={editCompTitle}
                    onChange={(e) => setEditCompTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Tiêu đề phụ:
                  </label>
                  <input
                    type="text"
                    value={editCompSub}
                    onChange={(e) => setEditCompSub(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '14px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#4ade80' }}>
                  ⏱️ 2. Độ nhạy phím Spacebar
                </h4>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Thời gian giữ Space để đổi sang màu xanh (Ready):
                  </label>
                  <select
                    value={editSpaceHoldMs}
                    onChange={(e) => setEditSpaceHoldMs(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value={150}>150ms — Rất nhạy (Chạm nhanh là chạy)</option>
                    <option value={280}>280ms — Tiêu chuẩn cân bằng (Khuyên dùng)</option>
                    <option value={350}>350ms — Chuẩn WCA quốc tế (csTimer)</option>
                    <option value={550}>550ms — Giữ chắc tay (Tránh bấm nhầm)</option>
                  </select>
                </div>
              </div>

              <div style={{ background: '#111c34', padding: '14px', borderRadius: '10px', marginBottom: '18px', border: '1px solid #1a2a4c' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#f59e0b' }}>
                  🔒 3. Đổi mật khẩu Admin mới
                </h4>

                <div>
                  <input
                    type="text"
                    value={editAdminPassword}
                    onChange={(e) => setEditAdminPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: '#090f1d',
                      border: '1px solid #192642',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdminPanelModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Lưu Cài Đặt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: LẬP BẢNG MỚI
      ========================================== */}
      {showNewBoardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            width: '90%',
            maxWidth: '400px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
              ➕ Lập Bảng Xếp Hạng Mới
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b' }}>
              Tạo một bảng đấu riêng cho bạn bè, câu lạc bộ hoặc giải thi đấu của bạn.
            </p>

            <form onSubmit={handleCreateNewBoard}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Tên bảng xếp hạng:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bảng Đấu Lớp CNTT, Cá Nhân 2026..."
                  value={newBoardTitle}
                  onChange={(e) => setNewBoardTitle(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#111c34',
                    border: '1px solid #1a2a4c',
                    color: '#f8fafc',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Nội dung bảng ban đầu:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boardMode"
                      checked={newBoardMode === 'empty'}
                      onChange={() => setNewBoardMode('empty')}
                    />
                    Bảng trống
                  </label>

                  <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boardMode"
                      checked={newBoardMode === 'clone'}
                      onChange={() => setNewBoardMode('clone')}
                    />
                    Sao chép từ bảng hiện tại
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewBoardModal(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Tạo Bảng Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL: THÊM TUYỂN THỦ VÀO BẢNG
      ========================================== */}
      {showAddEntryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            width: '90%',
            maxWidth: '380px',
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', color: '#f8fafc' }}>
              ➕ Thêm Kỷ Lục Vào {currentBoard?.title}
            </h3>

            <form onSubmit={handleAddEntry}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Loại khối:
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {Object.values(PUZZLE_CONFIGS).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPuzzleType(p.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '5px',
                        border: puzzleType === p.id ? '1px solid #38bdf8' : '1px solid #1e293b',
                        background: puzzleType === p.id ? '#1e3a8a' : '#111c34',
                        color: puzzleType === p.id ? '#ffffff' : '#94a3b8',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Tên người chơi / Tài khoản:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: NguyenVanA..."
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#111c34',
                    border: '1px solid #1a2a4c',
                    color: '#f8fafc',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Thời gian Best (giây):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ví dụ: 9.85"
                    value={newPlayerBest}
                    onChange={(e) => setNewPlayerBest(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#111c34',
                      border: '1px solid #1a2a4c',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Thời gian Avg (giây):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ví dụ: 12.30"
                    value={newPlayerAvg}
                    onChange={(e) => setNewPlayerAvg(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#111c34',
                      border: '1px solid #1a2a4c',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddEntryModal(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Lưu Kỷ Lục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
