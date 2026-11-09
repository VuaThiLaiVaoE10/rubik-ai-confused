import React from 'react';
import RubikCube from './RubikCube';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <RubikCube />
    </div>
  );
}
