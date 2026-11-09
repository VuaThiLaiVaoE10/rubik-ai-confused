import React, { useState } from 'react';
import RubikCube from './components/RubikCube';
import Timer from './components/Timer';
import RubikScanner from './components/RubikScanner';

export default function App() {
  const [activeTab, setActiveTab] = useState('3d'); // '3d' | 'timer' | 'scanner'
  const [lastScannedState, setLastScannedState] = useState('');

  const handleScanComplete = (cubeString54) => {
    setLastScannedState(cubeString54);
    alert(`Quét thành công 54 ô màu:\n${cubeString54}`);
    setActiveTab('3d');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#090d16', color: '#f8fafc', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Main Navigation Tabs */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 20px',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🎲</span>
          <span style={{ fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Rubik Speed Studio
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: '#1e293b', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('3d')}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === '3d' ? '#3b82f6' : 'transparent',
              color: activeTab === '3d' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            🧊 Rubik 3D
          </button>

          <button
            onClick={() => setActiveTab('timer')}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === 'timer' ? '#3b82f6' : 'transparent',
              color: activeTab === 'timer' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            ⏱️ Bấm Giờ (Timer)
          </button>

          <button
            onClick={() => setActiveTab('scanner')}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === 'scanner' ? '#3b82f6' : 'transparent',
              color: activeTab === 'scanner' ? '#ffffff' : '#94a3b8',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            📷 Quét Camera
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          v1.0 • Vibe Coding
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeTab === '3d' && (
          <div style={{ width: '100%', height: '100%' }}>
            <RubikCube />
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
