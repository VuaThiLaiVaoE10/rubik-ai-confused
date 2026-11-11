import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import SecurityErrorBoundary from './components/SecurityErrorBoundary.jsx';

// Chặn các lỗi Promise bất đồng bộ ngoài luồng (mạng chập chờn, PeerJS timeout) làm đơ trang
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Anti-Crash Shield] Đã cô lập Promise rejection:', event.reason);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SecurityErrorBoundary>
      <App />
    </SecurityErrorBoundary>
  </StrictMode>
);
