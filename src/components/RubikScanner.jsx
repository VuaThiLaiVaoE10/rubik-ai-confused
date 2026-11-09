// src/components/RubikScanner.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

const RubikScanner = ({ onScanComplete }) => {
  // ==========================================
  // CONSTANTS & CONFIGURATION
  // ==========================================
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE_NAMES = {
    U: 'Trên (Trắng)', R: 'Phải (Đỏ)', F: 'Trước (Xanh lá)',
    D: 'Dưới (Vàng)', L: 'Trái (Cam)', B: 'Sau (Xanh dương)'
  };
  const FACE_CENTER_COLORS = {
    U: 'white', R: 'red', F: 'limegreen', D: 'gold', L: 'orange', B: 'dodgerblue'
  };
  // Standard Singmaster notation order for each face (0-8)
  // Visual mapping on screen (3x3 grid):
  // 0 1 2
  // 3 4 5
  // 6 7 8

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [currentFaceIndex, setCurrentFaceIndex] = useState(0);
  const [capturedFaces, setCapturedFaces] = useState({}); // { U: ['w','w',...], R: [...] }
  const [previewColors, setPreviewColors] = useState(Array(9).fill('gray'));
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [showManualPicker, setShowManualPicker] = useState(-1); // index of cell being edited

  // ==========================================
  // REFS
  // ==========================================
  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null); // For drawing grid
  const captureCanvasRef = useRef(null); // For offscreen capture & sampling
  const animationFrameRef = useRef(null);

  // ==========================================
  // COMPUTER VISION: COLOR ENGINE
  // ==========================================

  /**
   * Converts RGB (0-255) to HSV (H: 0-360, S: 0-1, V: 0-1)
   */
  const rgbToHsv = (r, g, b) => {
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
  };

  /**
   * Classifies HSV into Rubik Color Letter (U, R, F, D, L, B)
   * Thresholds tuned for typical indoor lighting.
   */
  const classifyColor = (h, s, v) => {
    // 1. White (U): Low Sat, High Value
    if (s < 0.20 && v > 0.65) return 'U';

    // 2. Red (R): Hue wraps around 0/360. H < 10 or H >= 345. Sat > 0.4
    if ((h < 10 || h >= 345) && s > 0.40) return 'R';

    // 3. Orange (L): 11 <= H < 25. Sat > 0.4. Distinct from Red.
    if (h >= 11 && h < 25 && s > 0.40) return 'L';

    // 4. Yellow (D): 40 <= H <= 70. Sat > 0.35, Val > 0.5
    if (h >= 40 && h <= 70 && s > 0.35 && v > 0.50) return 'D';

    // 5. Green (F): 85 <= H <= 165. Sat > 0.3
    if (h >= 85 && h <= 165 && s > 0.30) return 'F';

    // 6. Blue (B): 190 <= H <= 255. Sat > 0.3
    if (h >= 190 && h <= 255 && s > 0.30) return 'B';

    // Fallback: Default to White if bright, else closest guess (should not happen ideally)
    return v > 0.5 ? 'U' : 'R';
  };

  /**
   * Samples the 3x3 grid from the video frame.
   * Draws video to captureCanvas, reads pixel data at center of each cell.
   */
  const captureAndClassify = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;

    const ctx = canvas.getContext('2d');
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h).data;
    
    // Grid Geometry: Centered square covering ~70% of min dimension
    const size = Math.min(w, h) * 0.7;
    const startX = (w - size) / 2;
    const startY = (h - size) / 2;
    const cellSize = size / 3;
    const sampleRatio = 0.3; // Sample center 30% of cell to avoid black borders

    const colors = [];
    const colorCodes = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        // Center of cell
        const cx = startX + col * cellSize + cellSize / 2;
        const cy = startY + row * cellSize + cellSize / 2;
        // Sample area radius
        const radiusX = Math.max(1, Math.floor(cellSize * sampleRatio / 2));
        const radiusY = Math.max(1, Math.floor(cellSize * sampleRatio / 2));
        
        let sumR = 0, sumG = 0, sumB = 0, count = 0;

        for (let dy = -radiusY; dy <= radiusY; dy++) {
          for (let dx = -radiusX; dx <= radiusX; dx++) {
            const px = Math.floor(cx + dx);
            const py = Math.floor(cy + dy);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const idx = (py * w + px) * 4;
              sumR += imageData[idx];
              sumG += imageData[idx + 1];
              sumB += imageData[idx + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          const avgR = sumR / count;
          const avgG = sumG / count;
          const avgB = sumB / count;
          const { h, s, v } = rgbToHsv(avgR, avgG, avgB);
          const code = classifyColor(h, s, v);
          colors.push(FACE_CENTER_COLORS[code] || 'gray'); // For UI preview
          colorCodes.push(code);
        } else {
          colors.push('gray');
          colorCodes.push('U');
        }
      }
    }
    return { colors, colorCodes };
  }, []);

  // ==========================================
  // RENDER LOOP: Draw Overlay Grid
  // ==========================================
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      animationFrameRef.current = requestAnimationFrame(drawOverlay);
      return;
    }

    const ctx = canvas.getContext('2d');
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid Geometry
    const size = Math.min(w, h) * 0.7;
    const startX = (w - size) / 2;
    const startY = (h - size) / 2;
    const cellSize = size / 3;

    // Draw Semi-transparent background outside grid (vignette)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(startX, startY, size, size); // Clear center for grid

    // Draw Grid Lines
    ctx.strokeStyle = '#00ff88'; // Neon Green
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;

    for (let i = 1; i < 3; i++) {
      // Vertical
      ctx.beginPath();
      ctx.moveTo(startX + i * cellSize, startY);
      ctx.lineTo(startX + i * cellSize, startY + size);
      ctx.stroke();
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(startX, startY + i * cellSize);
      ctx.lineTo(startX + size, startY + i * cellSize);
      ctx.stroke();
    }

    // Draw Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 15;
    ctx.strokeRect(startX, startY, size, size);

    // Corner Brackets (UI Polish)
    const bracketLen = 25;
    ctx.lineWidth = 6;
    const corners = [
      [startX, startY], [startX + size, startY],
      [startX, startY + size], [startX + size, startY + size]
    ];
    corners.forEach(([x, y]) => {
      const isRight = x > w/2;
      const isBottom = y > h/2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (isRight ? -bracketLen : bracketLen), y);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (isBottom ? -bracketLen : bracketLen));
      ctx.stroke();
    });

    animationFrameRef.current = requestAnimationFrame(drawOverlay);
  }, []);

  // ==========================================
  // WEBCAM LIFECYCLE
  // ==========================================
  useEffect(() => {
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          // Start overlay render loop once video metadata loaded
          videoRef.current.onloadedmetadata = () => {
            drawOverlay();
          };
        }
      } catch (err) {
        console.error("Camera Error:", err);
        setError("Không thể truy cập Camera. Vui lòng cấp quyền và tải lại trang. Lỗi: " + err.message);
      }
    };
    initCamera();

    return () => {
      // Cleanup
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [drawOverlay, stream]); // stream in dep to ensure cleanup uses latest, though usually empty dep is fine for mount/unmount. 
  // Actually, stream is set once. We'll keep cleanup in return.

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  const handleCapture = () => {
    const result = captureAndClassify();
    if (result) {
      setPreviewColors(result.colors);
      // Store temporarily in state for confirmation
      setCapturedFaces(prev => ({
        ...prev,
        [FACE_ORDER[currentFaceIndex]]: result.colorCodes
      }));
      setIsScanning(true); // Show preview mode
    }
  };

  const handleRetake = () => {
    setIsScanning(false);
    setPreviewColors(Array(9).fill('gray'));
    // Remove temp capture for this face
    setCapturedFaces(prev => {
      const next = { ...prev };
      delete next[FACE_ORDER[currentFaceIndex]];
      return next;
    });
  };

  const handleConfirmFace = () => {
    // Move to next face
    if (currentFaceIndex < 5) {
      setCurrentFaceIndex(i => i + 1);
    }
    setIsScanning(false);
    setPreviewColors(Array(9).fill('gray'));
  };

  const handleManualColorChange = (cellIndex, newColorCode) => {
    setPreviewColors(prev => {
      const next = [...prev];
      next[cellIndex] = FACE_CENTER_COLORS[newColorCode] || 'gray';
      return next;
    });
    setCapturedFaces(prev => {
      const faceKey = FACE_ORDER[currentFaceIndex];
      if (!prev[faceKey]) return prev;
      const nextFace = [...prev[faceKey]];
      nextFace[cellIndex] = newColorCode;
      return { ...prev, [faceKey]: nextFace };
    });
    setShowManualPicker(-1);
  };

  const handleFinish = () => {
    // Validate all 6 faces captured
    const missing = FACE_ORDER.filter(f => !capturedFaces[f] || capturedFaces[f].length !== 9);
    if (missing.length > 0) {
      alert(`Thiếu dữ liệu mặt: ${missing.join(', ')}`);
      return;
    }
    // Construct 54-char string: U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9
    let cubeString = '';
    FACE_ORDER.forEach(face => {
      cubeString += capturedFaces[face].join('');
    });
    onScanComplete(cubeString);
  };

  // ==========================================
  // RENDER UI
  // ==========================================
  const currentFaceKey = FACE_ORDER[currentFaceIndex];
  const progress = ((currentFaceIndex) / 6) * 100; // 0% -> 83% before last confirm

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h2>⚠️ Lỗi Camera</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} style={styles.btnPrimary}>Tải lại trang</button>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={styles.loadingContainer}>
        <div className="spinner" style={styles.spinner}></div>
        <p>Đang khởi động Camera...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header & Progress */}
      <div style={styles.header}>
        <h1 style={styles.title}>🎯 Quét Khối Rubik 3x3</h1>
        <div style={styles.progressWrapper}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }}></div>
          </div>
          <span style={styles.progressText}>
            Mặt {currentFaceIndex + 1}/6: <strong>{FACE_NAMES[currentFaceKey]}</strong>
          </span>
        </div>
      </div>

      {/* Main Camera View */}
      <div style={styles.videoWrapper}>
        <video 
          ref={videoRef} 
          style={styles.video} 
          playsInline 
          muted 
          autoPlay 
        />
        <canvas ref={overlayCanvasRef} style={styles.overlayCanvas} />
        
        {/* Capture Button Overlay */}
        {!isScanning && (
          <button 
            onClick={handleCapture} 
            style={styles.captureBtn}
            disabled={currentFaceIndex >= 6}
          >
            <span style={{fontSize: '24px'}}>📸</span> Chụp mặt {FACE_NAMES[currentFaceKey]}
          </button>
        )}
      </div>

      {/* Preview / Confirmation Panel */}
      {isScanning && (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Xem trước 9 ô màu (Click ô để sửa)</h3>
          <div style={styles.gridPreview}>
            {previewColors.map((color, idx) => (
              <button
                key={idx}
                onClick={() => setShowManualPicker(idx)}
                style={{ 
                  ...styles.colorCell, 
                  backgroundColor: color,
                  border: showManualPicker === idx ? '3px solid #ffcc00' : '2px solid #333'
                }}
                title={`Ô ${idx + 1}`}
              >
                {showManualPicker === idx && <span style={styles.checkMark}>✓</span>}
              </button>
            ))}
          </div>
          
          {/* Manual Color Picker Modal/Dropdown */}
          {showManualPicker >= 0 && (
            <div style={styles.pickerOverlay}>
              <div style={styles.pickerBox}>
                <p>Chọn màu cho ô {showManualPicker + 1}:</p>
                <div style={styles.pickerGrid}>
                  {Object.entries(FACE_CENTER_COLORS).map(([code, cssColor]) => (
                    <button
                      key={code}
                      onClick={() => handleManualColorChange(showManualPicker, code)}
                      style={{ ...styles.pickerBtn, backgroundColor: cssColor }}
                      title={code}
                    />
                  ))}
                </div>
                <button onClick={() => setShowManualPicker(-1)} style={styles.btnSecondary}>Hủy</button>
              </div>
            </div>
          )}

          <div style={styles.panelActions}>
            <button onClick={handleRetake} style={styles.btnDanger}>🔄 Chụp lại</button>
            <button onClick={handleConfirmFace} style={styles.btnSuccess}>
              {currentFaceIndex === 5 ? '✅ Hoàn tất quét' : '➡️ Xác nhận & Mặt tiếp'}
            </button>
          </div>
        </div>
      )}

      {/* Completion Screen */}
      {currentFaceIndex === 5 && !isScanning && Object.keys(capturedFaces).length === 6 && (
        <div style={styles.completePanel}>
          <h2>🎉 Đã quét xong 6 mặt!</h2>
          <pre style={styles.cubeStringDisplay}>
            {FACE_ORDER.map(f => capturedFaces[f].join('')).join(' ')}
          </pre>
          <button onClick={handleFinish} style={{...styles.btnPrimary, padding: '15px 40px', fontSize: '18px'}}>
            Gửi dữ liệu & Đóng
          </button>
        </div>
      )}

      {/* Instructions */}
      <div style={styles.instructions}>
        <details style={styles.details}>
          <summary>💡 Hướng dẫn quét chuẩn</summary>
          <ul style={styles.instList}>
            <li>Đặt khối Rubik sao cho mặt tâm khớp với hướng dẫn (Ví dụ: Mặt 1 = Tâm Trắng).</li>
            <li>Giữ khối cách camera ~20-30cm, căn giữa vào khung vuông xanh.</li>
            <li>Tránh ánh sáng chói trực tiếp vào mặt khối (gây trắng bệch/over-exposure).</li>
            <li>Nếu màu sai (thường là Cam/Đỏ hoặc Xanh lá/Xanh dương), click vào ô màu đó để chọn thủ công.</li>
            <li>Thứ tự mặt: <b>Trên (U) → Phải (R) → Trước (F) → Dưới (D) → Trái (L) → Sau (B)</b>.</li>
          </ul>
        </details>
      </div>
    </div>
  );
};

// ==========================================
// INLINE STYLES (Dark Mode, Modern, Responsive)
// ==========================================
const styles = {
  container: {
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
    backgroundColor: '#121212',
    color: '#e0e0e0',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  },
  errorContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: '20px', textAlign: 'center', background: '#121212', color: '#fff'
  },
  loadingContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#121212', color: '#fff'
  },
  spinner: {
    width: '40px', height: '40px', border: '4px solid #333', borderTopColor: '#00ff88',
    borderRadius: '50%', animation: 'spin 1s linear infinite',
  },
  header: {
    width: '100%', maxWidth: '640px', marginBottom: '16px', textAlign: 'center',
  },
  title: { margin: '0 0 12px 0', fontSize: '28px', fontWeight: '600', background: 'linear-gradient(90deg, #00ff88, #00ccff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  progressWrapper: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' },
  progressBar: { width: '100%', height: '8px', background: '#1e1e1e', borderRadius: '4px', overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #00ff88, #00ccff)', borderRadius: '4px', transition: 'width 0.3s ease' },
  progressText: { fontSize: '14px', color: '#aaa' },
  videoWrapper: {
    position: 'relative', width: '100%', maxWidth: '640px', aspectRatio: '4/3',
    background: '#000', borderRadius: '12px', overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px #333',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'rotateY(180deg)', display: 'block' }, // Mirror for user intuition
  overlayCanvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  captureBtn: {
    position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    padding: '14px 32px', fontSize: '16px', fontWeight: 'bold', color: '#121212',
    background: 'linear-gradient(90deg, #00ff88, #00ccff)', border: 'none', borderRadius: '50px',
    cursor: 'pointer', boxShadow: '0 4px 15px rgba(0, 255, 136, 0.4)',
    display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10,
    transition: 'transform 0.1s, box-shadow 0.1s',
  },
  panel: {
    width: '100%', maxWidth: '640px', marginTop: '16px', padding: '20px',
    background: '#1e1e1e', borderRadius: '12px', border: '1px solid #333',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  panelTitle: { margin: '0 0 16px 0', textAlign: 'center', fontSize: '18px', color: '#00ff88' },
  gridPreview: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px',
  },
  colorCell: {
    aspectRatio: '1/1', borderRadius: '8px', cursor: 'pointer', position: 'relative',
    transition: 'transform 0.1s, box-shadow 0.1s', border: '2px solid #333',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
  },
  checkMark: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '24px', color: '#fff', textShadow: '0 0 5px #000' },
  panelActions: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' },
  btnPrimary: { padding: '12px 24px', fontSize: '16px', fontWeight: '600', color: '#121212', background: 'linear-gradient(90deg, #00ff88, #00ccff)', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'opacity 0.2s' },
  btnSecondary: { padding: '10px 20px', fontSize: '14px', color: '#fff', background: '#333', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', marginTop: '12px', width: '100%' },
  btnDanger: { padding: '12px 24px', fontSize: '16px', fontWeight: '600', color: '#fff', background: '#cc3333', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  btnSuccess: { padding: '12px 24px', fontSize: '16px', fontWeight: '600', color: '#121212', background: '#00ff88', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  pickerOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  pickerBox: { background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '1px solid #444', textAlign: 'center', minWidth: '280px' },
  pickerGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', margin: '16px 0' },
  pickerBtn: { aspectRatio: '1/1', borderRadius: '8px', border: '3px solid transparent', cursor: 'pointer', transition: 'transform 0.1s, border-color 0.1s' },
  completePanel: { textAlign: 'center', padding: '40px 20px', animation: 'fadeIn 0.5s' },
  cubeStringDisplay: { background: '#000', padding: '16px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.6', wordBreak: 'break-all', color: '#00ff88', fontFamily: 'monospace', margin: '20px 0', border: '1px solid #333' },
  instructions: { width: '100%', maxWidth: '640px', marginTop: '20px' },
  details: { background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '0 16px' },
  instList: { paddingLeft: '20px', lineHeight: '1.8', color: '#bbb', fontSize: '14px' },
};

// Inject Keyframes for Spinner & FadeIn
const styleSheet = document.createElement("style");
styleSheet.innerHTML = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  /* Picker Button Hover */
  button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
  button:active:not(:disabled) { transform: translateY(0) scale(0.98); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Color Cell Hover */
  .color-cell-hover:hover { transform: scale(1.05); z-index: 5; box-shadow: 0 0 15px rgba(255,255,255,0.3); }
  /* Picker Button Selected */
  button[data-selected="true"] { border-color: #ffcc00; transform: scale(1.1); }
`;
document.head.appendChild(styleSheet);

// Add hover class dynamically via style prop spread is tricky in inline styles without CSS classes.
// We'll rely on the inline style transitions defined in styles.colorCell.

export default RubikScanner;
