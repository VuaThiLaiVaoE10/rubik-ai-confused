import React, { useState, useRef } from 'react';
import RubikCube from './components/RubikCube';
import Timer from './components/Timer';
import RubikScanner from './components/RubikScanner';
import { generateScramble, solveScramble } from './utils/rubikSolver';

export default function App() {
  const [activeTab, setActiveTab] = useState('3d'); // '3d' | 'timer' | 'scanner'
  const [currentScramble, setCurrentScramble] = useState('');
  const [solutionSteps, setSolutionSteps] = useState([]);
  const [isSolving, setIsSolving] = useState(false);
  const rubikRef = useRef(null);

  // Scramble cube with tracked moves
  const handleScrambleWithSolver = () => {
    const scramble = generateScramble(15);
    setCurrentScramble(scramble);
    setSolutionSteps([]);
    const moves = scramble.split(' ');
    if (rubikRef.current) {
      rubikRef.current.executeAlgorithm(moves, 120);
    }
  };

  // Auto-solve the scrambled cube
  const handleAutoSolve = async () => {
    if (!currentScramble) {
      alert('Vui lòng bấm nút "Xáo Trộn" trước khi bấm Giải tự động!');
      return;
    }
    setIsSolving(true);
    try {
      const solution = solveScramble(currentScramble);
      setSolutionSteps(solution);
      if (solution.length > 0 && rubikRef.current) {
        await rubikRef.current.executeAlgorithm(solution, 220);
      }
    } catch (e) {
      alert('Đã xảy ra lỗi khi tìm đường giải: ' + e.message);
    } finally {
      setIsSolving(false);
      setCurrentScramble('');
    }
  };

  const handleScanComplete = (cubeString54) => {
    alert(`Quét thành công 54 ô màu:\n${cubeString54}`);
    setActiveTab('3d');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#090d16', color: '#f8fafc', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Navigation Tabs */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.3rem' }}>🎲</span>
          <span style={{ fontWeight: '800', fontSize: '1.15rem', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Rubik Speed Studio
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: '#1e293b', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('3d')}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === '3d' ? '#3b82f6' : 'transparent',
              color: activeTab === '3d' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            🧊 Rubik 3D & AI Giải
          </button>

          <button
            onClick={() => setActiveTab('timer')}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'timer' ? '#3b82f6' : 'transparent',
              color: activeTab === 'timer' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            ⏱️ Bấm Giờ (Timer)
          </button>

          <button
            onClick={() => setActiveTab('scanner')}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'scanner' ? '#3b82f6' : 'transparent',
              color: activeTab === 'scanner' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            📷 Quét Camera
          </button>
        </div>

        {/* Action Controls for 3D Tab */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeTab === '3d' && (
            <>
              <button
                onClick={handleScrambleWithSolver}
                disabled={isSolving}
                style={{
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#38bdf8',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: isSolving ? 'not-allowed' : 'pointer'
                }}
              >
                🎲 Xáo Trộn
              </button>

              <button
                onClick={handleAutoSolve}
                disabled={isSolving || !currentScramble}
                style={{
                  padding: '7px 16px',
                  borderRadius: '7px',
                  border: 'none',
                  background: !currentScramble || isSolving ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  cursor: !currentScramble || isSolving ? 'not-allowed' : 'pointer',
                  boxShadow: currentScramble ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none'
                }}
              >
                {isSolving ? '⏳ Đang giải...' : '✨ AI Tự Giải'}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeTab === '3d' && (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <RubikCube ref={rubikRef} />

            {/* Floating Solution Display */}
            {solutionSteps.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '75px',
                left: '20px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                backdropFilter: 'blur(10px)',
                padding: '10px 16px',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '0.9rem',
                zIndex: 20
              }}>
                <span style={{ fontWeight: '700' }}>✨ Bước giải ({solutionSteps.length} bước): </span>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{solutionSteps.join(' ')}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timer' && (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
            <Timer />
          </div>
        )}

        {activeTab === 'scanner' && (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <RubikScanner onScanComplete={handleScanComplete} />
          </div>
        )}
      </main>
    </div>
  );
}
