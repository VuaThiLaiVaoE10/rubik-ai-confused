import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==========================================
// 1. WCA SCRAMBLE GENERATOR
// ==========================================
function generateScramble(length = 20) {
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const getAxis = (f) => Math.floor(f / 2);

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

// Strict Rubik color classifier with noise & dark-frame rejection
function classifyHsvColor(h, s, v, rawBrightness) {
  // 1. Phán quyết cảm biến hỏng / camera tối đen / nhiễu hạt đen
  if (rawBrightness < 35 || v < 0.20) {
    return 'invalid'; // Tối om hoặc camera hỏng -> Không xếp vào màu Rubik nào!
  }

  // 2. Màu trắng (Độ sáng cao, độ bão hòa rất thấp)
  if (s < 0.22 && v > 0.55 && rawBrightness > 100) {
    return 'white';
  }

  // 3. Các màu có sắc độ (Cần độ bão hòa thực tế > 0.30 để tránh nhiễu camera)
  if (s > 0.30) {
    if (h >= 345 || h < 14) return 'red';
    if (h >= 14 && h < 38) return 'orange';
    if (h >= 38 && h < 75) return 'yellow';
    if (h >= 75 && h < 165) return 'green';
    if (h >= 165 && h < 260) return 'blue';
  }

  // Không đạt chuẩn màu Rubik thực tế
  return 'invalid';
}

export default function App() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  // Timer states: 'idle' | 'holding' | 'ready' | 'running'
  const [timerState, setTimerState] = useState('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [scramble, setScramble] = useState(() => generateScramble(20));

  // History & Solves
  const [solves, setSolves] = useState(() => {
    try {
      const saved = localStorage.getItem('rubik_solves_hcc');
      return saved ? JSON.parse(saved) : [
        { id: 1, time: 14.52, date: '10/11', moves: 'Chưa dùng cam', verified: false },
        { id: 2, time: 12.80, date: '10/11', moves: 'Chưa dùng cam', verified: false }
      ];
    } catch {
      return [];
    }
  });

  const [leaderboard] = useState([
    { rank: 1, name: 'khoa.tt2611758', best: '0.71', avg: '1.02', verified: true },
    { rank: 2, name: 'tungtungvuadhur', best: '6.53', avg: '7.92', verified: true },
    { rank: 3, name: 'Người Tây Đồng Bằng', best: '6.55', avg: '11.57', verified: false },
    { rank: 4, name: 'tranduct757', best: '12.12', avg: '14.57', verified: false },
    { rank: 5, name: 'Tiến Dũng newbie', best: '12.14', avg: '14.75', verified: false }
  ]);

  // Camera & AI State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraHealth, setCameraHealth] = useState({
    isHealthy: false,
    reason: 'Camera chưa bật',
    brightness: 0,
    contrast: 0
  });

  const [detectedColors, setDetectedColors] = useState(Array(9).fill('invalid'));
  const [preCheckStatus, setPreCheckStatus] = useState({
    verified: false,
    text: 'Camera AI đang tắt (Chế độ thủ công chuẩn WCA)',
    isScrambled: false,
    centerFace: null
  });

  // Tracked moves: 100% ZERO RANDOMNESS. Only populated when camera is healthy and valid physical moves occur
  const [trackedMoves, setTrackedMoves] = useState([]);
  const [lastMoveDetected, setLastMoveDetected] = useState('');

  // ==========================================
  // REFS FOR INSTANT SYNCHRONIZATION
  // ==========================================
  const timerStateRef = useRef('idle');
  const timerIntervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const prevColorsRef = useRef(null);
  const lastMoveTimeRef = useRef(0);
  const trackedMovesRef = useRef([]);
  const cameraActiveRef = useRef(false);
  const cameraHealthRef = useRef(false);

  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    trackedMovesRef.current = trackedMoves;
  }, [trackedMoves]);

  // ==========================================
  // 2. STOP & START TIMER HANDLERS
  // ==========================================
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const finalMs = performance.now() - startTimeRef.current;
    setTimeMs(finalMs);
    setTimerState('idle');

    const finalSec = (finalMs / 1000).toFixed(2);
    const movesRecorded = trackedMovesRef.current;
    // Chỉ được coi là AI Verified nếu camera hoạt động khỏe mạnh VÀ có ghi nhận nước đi thật
    const isCameraVerified = cameraActiveRef.current && cameraHealthRef.current && movesRecorded.length > 0;

    const newSolve = {
      id: Date.now(),
      time: parseFloat(finalSec),
      date: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      moves: isCameraVerified ? movesRecorded.join(' ') : 'Giải thủ công (Spacebar)',
      verified: isCameraVerified
    };

    setSolves(prev => {
      const updated = [newSolve, ...prev];
      localStorage.setItem('rubik_solves_hcc', JSON.stringify(updated));
      return updated;
    });

    // Reset tracked moves for next run & generate new scramble
    setTrackedMoves([]);
    setLastMoveDetected('');
    setScramble(generateScramble(20));
  }, []);

  const startTimer = useCallback(() => {
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

  // Keep refs up to date
  const stopTimerRef = useRef(stopTimer);
  const startTimerRef = useRef(startTimer);
  useEffect(() => {
    stopTimerRef.current = stopTimer;
    startTimerRef.current = startTimer;
  }, [stopTimer, startTimer]);

  // ==========================================
  // 3. WCA KEYBOARD SPACEBAR CONTROLLER
  // ==========================================
  useEffect(() => {
    let holdTimeout = null;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

      const currentState = timerStateRef.current;

      if (e.code === 'Space') {
        e.preventDefault();

        // Đang chạy mà bấm phím bất kỳ -> Dừng ngay
        if (currentState === 'running') {
          stopTimerRef.current();
          return;
        }

        if (e.repeat) return;

        if (currentState === 'idle') {
          setTimerState('holding');
          clearTimeout(holdTimeout);
          // Giữ 280ms để READY (xanh lá)
          holdTimeout = setTimeout(() => {
            if (timerStateRef.current === 'holding') {
              setTimerState('ready');
            }
          }, 280);
        }
      } else {
        // Bất kỳ phím nào khi đang chạy đều dừng đồng hồ
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
          // Thả phím quá sớm khi chưa xanh -> Về idle
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
  }, []);

  // ==========================================
  // 4. CAMERA & HEALTH SANITY ENGINE
  // ==========================================
  const toggleCamera = async () => {
    if (cameraActive) {
      // Turn OFF
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
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
      // Turn ON
      try {
        setPreCheckStatus(prev => ({ ...prev, text: 'Đang kết nối camera...' }));
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
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

  // Computer Vision Processing Loop with HARDWARE HEALTH CHECK
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

        // ----------------------------------------------------
        // A. HARDWARE SANITY CHECK (Chống camera hỏng / màn đen / nhiễu trắng)
        // ----------------------------------------------------
        let totalBrightness = 0;
        const pixelStep = 16; // Sample every 16th pixel for speed
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

        // ĐÁNH GIÁ PHẦN CỨNG CAMERA
        let isHealthy = true;
        let healthReason = 'Hoạt động tốt';

        if (avgBrightness < 30) {
          isHealthy = false;
          healthReason = 'Camera bị hỏng / tối đen (Không có ánh sáng)';
        } else if (contrast < 20) {
          isHealthy = false;
          healthReason = 'Camera bị mờ đơ / không có độ tương phản';
        } else if (avgBrightness > 245) {
          isHealthy = false;
          healthReason = 'Camera bị chói sáng trắng toàn bộ';
        }

        cameraHealthRef.current = isHealthy;
        setCameraHealth({
          isHealthy,
          reason: healthReason,
          brightness: Math.round(avgBrightness),
          contrast: Math.round(contrast)
        });

        // ----------------------------------------------------
        // B. NẾU CAMERA HỎNG: TUYỆT ĐỐI KHÔNG CHẠY NƯỚC ĐI
        // ----------------------------------------------------
        if (!isHealthy) {
          setPreCheckStatus({
            verified: false,
            text: `⚠️ ${healthReason}. Đã khóa nhận diện AI để tránh sai lệch!`,
            isScrambled: false,
            centerFace: null
          });
          setDetectedColors(Array(9).fill('invalid'));
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        // ----------------------------------------------------
        // C. SAMPLE 3X3 RUBIK GRID
        // ----------------------------------------------------
        const boxSize = Math.min(w, h) * 0.52;
        const startX = (w - boxSize) / 2;
        const startY = (h - boxSize) / 2;
        const cellSize = boxSize / 3;
        const sampleRadius = Math.max(2, Math.floor(cellSize * 0.16));

        const current9Colors = [];
        let validColorsCount = 0;

        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
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

              current9Colors.push(colorKey);
              if (colorKey !== 'invalid') validColorsCount++;
            } else {
              current9Colors.push('invalid');
            }
          }
        }

        setDetectedColors(current9Colors);

        // ----------------------------------------------------
        // D. ZERO-ASSUMPTION CUBE GROUNDING GATE
        // (Nếu số ô màu hợp lệ < 6 -> Khẳng định KHÔNG PHẢI KHỐI RUBIK)
        // ----------------------------------------------------
        if (validColorsCount < 6) {
          setPreCheckStatus({
            verified: false,
            text: '🔍 Đang đợi khối Rubik trước camera... (Hãy đưa Rubik vào khung vuông)',
            isScrambled: false,
            centerFace: null
          });
          prevColorsRef.current = null;
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        // ----------------------------------------------------
        // E. AI PRE-CHECK / INSPECTION (Khi chưa bấm giờ)
        // ----------------------------------------------------
        const centerColor = current9Colors[4];
        const centerDef = COLOR_DEFINITIONS[centerColor];
        const centerName = centerDef ? centerDef.name : 'Không rõ';

        const validColorsOnly = current9Colors.filter(c => c !== 'invalid');
        const uniqueColorsCount = new Set(validColorsOnly).size;
        const isAllSameColor = validColorsCount === 9 && uniqueColorsCount === 1;

        if (timerStateRef.current === 'idle') {
          if (centerColor !== 'invalid' && uniqueColorsCount >= 2) {
            setPreCheckStatus({
              verified: true,
              text: `🟢 ĐÃ CHECK KHỐI RUBIK: Mặt tâm ${centerName} — Đã xáo trộn hợp lệ! Sẵn sàng bấm giờ.`,
              isScrambled: true,
              centerFace: centerName
            });
          } else if (isAllSameColor) {
            setPreCheckStatus({
              verified: false,
              text: `⚠️ Khối Rubik đang ở trạng thái hoàn thành (Tâm ${centerName} - Chưa xáo trộn)`,
              isScrambled: false,
              centerFace: centerName
            });
          } else {
            setPreCheckStatus({
              verified: false,
              text: 'Đang định hình mặt Rubik...',
              isScrambled: false,
              centerFace: null
            });
          }
        }

        // ----------------------------------------------------
        // F. ZERO-HALLUCINATION REAL MOVE DETECTION
        // (CHỈ CHẠY KHI ĐANG GIẢI VÀ ĐỦ 9 Ô HỢP LỆ VÀ KHỚP 100% CHU TRÌNH TOÁN HỌC)
        // TUYỆT ĐỐI KHÔNG DÙNG Math.random()!
        // ----------------------------------------------------
        const now = performance.now();
        if (
          timerStateRef.current === 'running' &&
          prevColorsRef.current &&
          validColorsCount === 9 &&
          (now - lastMoveTimeRef.current > 400)
        ) {
          const prev = prevColorsRef.current;
          let detectedMove = null;

          // 1. Phép xoay mặt trước F (Xoay 90 độ cùng chiều kim đồng hồ của 8 ô viền)
          // Chu trình: 0->2, 1->5, 2->8, 5->7, 8->6, 7->3, 6->0, 3->1
          const isClockwiseF =
            current9Colors[2] === prev[0] &&
            current9Colors[5] === prev[1] &&
            current9Colors[8] === prev[2] &&
            current9Colors[7] === prev[5] &&
            current9Colors[6] === prev[8] &&
            current9Colors[3] === prev[7] &&
            current9Colors[0] === prev[6] &&
            current9Colors[1] === prev[3];

          // 2. Phép xoay mặt trước F' (Xoay 90 độ ngược chiều kim đồng hồ)
          const isCounterF =
            current9Colors[0] === prev[2] &&
            current9Colors[1] === prev[5] &&
            current9Colors[2] === prev[8] &&
            current9Colors[5] === prev[7] &&
            current9Colors[8] === prev[6] &&
            current9Colors[7] === prev[3] &&
            current9Colors[6] === prev[0] &&
            current9Colors[3] === prev[1];

          if (isClockwiseF) {
            detectedMove = 'F';
          } else if (isCounterF) {
            detectedMove = "F'";
          }

          // Ghi nhận nước đi NẾU VÀ CHỈ NẾU đã xác thực chính xác
          if (detectedMove) {
            lastMoveTimeRef.current = now;
            setLastMoveDetected(detectedMove);
            setTrackedMoves(moves => [...moves, detectedMove]);
          }

          // 3. Tự động xác minh giải xong khi cả 9 ô đồng màu với tâm sau khi giải
          if (isAllSameColor && (now - startTimeRef.current > 2000) && trackedMovesRef.current.length >= 1) {
            stopTimerRef.current();
          }
        }

        prevColorsRef.current = current9Colors;
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunningLoop = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const formatTime = (ms) => {
    const totalSec = ms / 1000;
    return totalSec.toFixed(2);
  };

  const bestTime = solves.length > 0 ? Math.min(...solves.map(s => s.time)).toFixed(2) : '--';
  const meanTime = solves.length > 0 
    ? (solves.reduce((acc, s) => acc + s.time, 0) / solves.length).toFixed(2) 
    : '--';

  const deleteSolve = (id) => {
    setSolves(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('rubik_solves_hcc', JSON.stringify(updated));
      return updated;
    });
  };

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
          1. HEADER BAR
      ========================================== */}
      <header style={{
        padding: '12px 24px',
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
            background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: '0 2px 10px rgba(37, 99, 235, 0.4)'
          }}>
            ⏱️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
              Rubik Timer & AI Verification
            </h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
              Speedcubing practice • HUST
            </p>
          </div>
        </div>

        {/* Camera Toggle Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleCamera}
            style={{
              padding: '7px 16px',
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
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span>{cameraActive ? (cameraHealth.isHealthy ? '🟢' : '🔴') : '📷'}</span>
            <span>
              {cameraActive 
                ? (cameraHealth.isHealthy ? 'Tắt Camera AI' : 'Camera Bị Lỗi (Bấm để tắt)') 
                : 'Bật Camera AI'}
            </span>
          </button>

          <span style={{ fontSize: '0.85rem', color: '#94a3b8', background: '#111c34', padding: '5px 10px', borderRadius: '6px', border: '1px solid #1a2a4c' }}>
            khoa.tt2611758@sis.hust.edu.vn
          </span>
        </div>
      </header>

      {/* ==========================================
          2. MAIN 3-COLUMN LAYOUT
      ========================================== */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '270px 1fr 340px',
        padding: '16px 20px',
        gap: '16px',
        overflow: 'hidden'
      }}>
        {/* === CỘT TRÁI: THÀNH TÍCH & LỊCH SỬ === */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'hidden' }}>
          {/* Card: Thành tích */}
          <div style={{
            backgroundColor: '#0d1629',
            border: '1px solid #192642',
            borderRadius: '14px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>Thành tích của tôi</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{solves.length} lượt</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Best</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#38bdf8' }}>{bestTime}s</div>
              </div>

              <div style={{ background: '#111c34', padding: '10px 12px', borderRadius: '8px', border: '1px solid #1a2a4c' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Mean</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc' }}>{meanTime}s</div>
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

          {/* Card: Lịch sử giải */}
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
              <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>Lịch sử lượt giải</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mới nhất</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {solves.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.85rem', marginTop: '24px' }}>
                  Chưa có lượt giải nào
                </div>
              ) : (
                solves.map((s, index) => (
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
                      <span style={{ color: '#64748b', fontSize: '0.78rem' }}>#{solves.length - index}</span>
                      <strong style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: '0.95rem' }}>{s.time}s</strong>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: s.verified ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: s.verified ? '#4ade80' : '#94a3b8'
                      }}>
                        {s.verified ? '✓ AI Verified' : 'Thủ công'}
                      </span>
                      <button
                        onClick={() => deleteSolve(s.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                    {s.moves && (
                      <div style={{
                        fontSize: '0.68rem',
                        color: '#64748b',
                        fontFamily: 'monospace',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {s.moves}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* === CỘT GIỮA: SCRAMBLE + CAMERA PREVIEW + ĐỒNG HỒ SPACE === */}
        <div style={{
          backgroundColor: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          {/* Top: WCA 3x3 Scramble */}
          <div style={{ width: '100%', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>WCA SCRAMBLE 3×3</span>
              <button
                onClick={() => setScramble(generateScramble(20))}
                title="Đổi chuỗi xáo trộn"
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                🔄 Đổi mới
              </button>
            </div>

            <div style={{
              fontSize: '1.2rem',
              fontWeight: '700',
              lineHeight: 1.5,
              color: '#cbd5e1',
              fontFamily: 'monospace',
              padding: '10px 16px',
              background: '#090f1d',
              borderRadius: '10px',
              border: '1px solid #16223b'
            }}>
              {scramble}
            </div>
          </div>

          {/* Center-Top: Live Camera Diagnostics & Pre-check Grid */}
          {cameraActive ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              margin: '8px 0',
              padding: '10px 16px',
              background: '#090f1d',
              borderRadius: '12px',
              border: cameraHealth.isHealthy ? '1px solid #192642' : '1px solid #ef4444'
            }}>
              {/* Webcam view */}
              <div style={{
                width: '130px',
                height: '95px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#020617',
                border: cameraHealth.isHealthy ? '1px solid #334155' : '1px solid #ef4444',
                position: 'relative'
              }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute',
                  bottom: '3px',
                  left: '3px',
                  background: 'rgba(0,0,0,0.7)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '0.62rem',
                  color: cameraHealth.isHealthy ? '#4ade80' : '#f87171'
                }}>
                  {cameraHealth.isHealthy ? '● LIVE' : '⚠️ LỖI CAM'}
                </div>
              </div>

              {/* 3x3 Rubik Sticker Grid Color Scanner */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600' }}>
                  {cameraHealth.isHealthy ? 'Quét 9 Sticker' : 'Camera Bị Hỏng'}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 22px)',
                  gap: '4px',
                  background: '#020617',
                  padding: '4px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b'
                }}>
                  {detectedColors.map((colorKey, i) => (
                    <div
                      key={i}
                      title={`Ô ${i + 1}: ${COLOR_DEFINITIONS[colorKey]?.name || 'Không rõ'}`}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '3px',
                        backgroundColor: COLOR_DEFINITIONS[colorKey]?.bg || '#334155',
                        border: i === 4 ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.4)',
                        boxShadow: i === 4 ? '0 0 6px rgba(255,255,255,0.6)' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Status / Health reason */}
              <div style={{ maxWidth: '240px', fontSize: '0.75rem', lineHeight: 1.4 }}>
                <div style={{
                  color: !cameraHealth.isHealthy 
                    ? '#f87171' 
                    : (preCheckStatus.verified ? '#4ade80' : '#f59e0b'),
                  fontWeight: '600',
                  marginBottom: '2px'
                }}>
                  {preCheckStatus.text}
                </div>
                {!cameraHealth.isHealthy && (
                  <button
                    onClick={toggleCamera}
                    style={{
                      marginTop: '4px',
                      background: '#7f1d1d',
                      border: '1px solid #ef4444',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Tắt cam hỏng để bấm giờ chuẩn
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Warning banner when camera is NOT active */
            <div style={{
              margin: '8px 0',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#38bdf8',
              fontSize: '0.78rem',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⏱️</span>
              <span>
                <strong>Chế độ WCA chuẩn:</strong> Camera đang tắt. Bạn có thể thoải mái bấm giờ bằng phím Spacebar mà không lo bị sinh nước đi ảo!
              </span>
            </div>
          )}

          {/* Center-Middle: GIANT WCA SPACEBAR TIMER */}
          <div
            onClick={() => {
              if (timerState === 'running') stopTimerRef.current();
              else if (timerState === 'idle') startTimerRef.current();
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
              fontSize: '8.8rem',
              fontWeight: '900',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              letterSpacing: '-3px',
              lineHeight: 1,
              color: timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#ffffff'),
              textShadow: timerState === 'ready' ? '0 0 45px rgba(34, 197, 94, 0.5)' : 'none',
              transition: 'color 0.1s ease'
            }}>
              {formatTime(timeMs)}
            </div>

            {/* Subtitle Status */}
            <div style={{
              marginTop: '14px',
              fontSize: '1rem',
              fontWeight: '700',
              letterSpacing: '0.5px',
              color: timerState === 'ready' ? '#22c55e' : (timerState === 'holding' ? '#f59e0b' : '#64748b')
            }}>
              {timerState === 'ready' && '● SẴN SÀNG — THẢ PHÍM SPACE ĐỂ BẮT ĐẦU!'}
              {timerState === 'holding' && '○ Giữ thêm một chút...'}
              {timerState === 'running' && 'Đang tính giờ... (Nhấn phím bất kỳ hoặc click để dừng)'}
              {timerState === 'idle' && 'Giữ phím SPACE để chuẩn bị sẵn sàng'}
            </div>
          </div>

          {/* Live Move Tracking Display (CHỈ HIỆN KHI CÓ CAMERA HOẠT ĐỘNG KHỎE MẠNH VÀ ĐÃ BẮT ĐẦU XOAY) */}
          {cameraActive && cameraHealth.isHealthy && (
            <div style={{
              width: '100%',
              maxWidth: '540px',
              background: '#090f1d',
              border: '1px solid #16223b',
              borderRadius: '8px',
              padding: '8px 14px',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>
                  Nước đi AI xác nhận:
                </span>
                {lastMoveDetected && (
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.15)',
                    padding: '1px 6px',
                    borderRadius: '4px'
                  }}>
                    {lastMoveDetected}
                  </span>
                )}
              </div>

              <div style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: trackedMoves.length > 0 ? '#4ade80' : '#475569',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right'
              }}>
                {trackedMoves.length > 0 ? trackedMoves.join(' ') : '(Chưa phát hiện nước xoay)'}
              </div>
            </div>
          )}

          {/* Bottom Instructions */}
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', lineHeight: 1.5 }}>
            <div>Nhấn giữ phím Space cho đến khi đổi màu xanh lá → Thả tay để bắt đầu giải</div>
            <div>Dừng bằng cách nhấn phím bất kỳ hoặc click vào đồng hồ</div>
          </div>
        </div>

        {/* === CỘT PHẢI: BẢNG XẾP HẠNG SPEEDCUBING === */}
        <div style={{
          backgroundColor: '#0d1629',
          border: '1px solid #192642',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f8fafc' }}>Bảng xếp hạng HUST</span>
            <span style={{ fontSize: '0.75rem', background: '#111c34', padding: '3px 8px', borderRadius: '4px', border: '1px solid #1a2a4c', color: '#94a3b8' }}>
              Avg ▾
            </span>
          </div>

          <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: '#64748b' }}>
            Top thành tích được AI thẩm định & xác minh
          </p>

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

          <div style={{ flex: 1, overflowY: 'auto' }}>
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

                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: '600' }}>
                    {item.name}
                  </span>
                  {item.verified && (
                    <span style={{
                      marginLeft: '6px',
                      fontSize: '0.65rem',
                      color: '#4ade80',
                      background: 'rgba(34, 197, 94, 0.1)',
                      padding: '1px 5px',
                      borderRadius: '3px'
                    }}>
                      ✓ AI
                    </span>
                  )}
                </div>

                <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#f8fafc' }}>
                  {item.best}s
                </span>

                <span style={{ textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>
                  {item.avg}s
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
