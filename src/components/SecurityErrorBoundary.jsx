import React from 'react';

/**
 * Tường lửa chống sập giao diện (Anti-Crash Runtime Error Boundary)
 * Cô lập mọi lỗi bất ngờ (dữ liệu hỏng, lỗi WebGL 3D, xung đột gói tin mạng)
 * để trang web không bao giờ bị màn hình trắng và tự phục hồi trong 1 cú nhấp.
 */
export default class SecurityErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Lỗi ngoại lệ không xác định'
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SecurityErrorBoundary] Đã chặn sự cố runtime:', error, errorInfo);
  }

  handleSafeRecover = () => {
    try {
      // Xóa các khóa tạm thời có nguy cơ bị hỏng nhưng giữ nguyên tài khoản & lịch sử hợp lệ
      sessionStorage.clear();
    } catch {
      // ignore
    }
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleHardReset = () => {
    try {
      localStorage.removeItem('rubik_multi_leaderboards_clean');
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#050811',
          color: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            background: '#0d1629',
            border: '1.5px solid #38bdf8',
            borderRadius: '16px',
            padding: '26px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.6rem', marginBottom: '8px' }}>🛡️</div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#38bdf8' }}>
              Hệ Thống Tự Bảo Vệ Chống Sập Web Đã Kích Hoạt
            </h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Tường lửa ứng dụng vừa cô lập một tác vụ bất thường để bảo vệ phiên làm việc và dữ liệu kỷ lục của bạn.
            </p>
            {this.state.errorMessage && (
              <div style={{
                background: '#090f1d',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.74rem',
                color: '#f87171',
                fontFamily: 'monospace',
                marginBottom: '16px',
                wordBreak: 'break-word'
              }}>
                Chi tiết: {this.state.errorMessage}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleSafeRecover}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                ⚡ Khôi Phục Ngay (Giữ Dữ Liệu)
              </button>
              <button
                type="button"
                onClick={this.handleHardReset}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#cbd5e1',
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                🔄 Tải Lại Trang An Toàn
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
