import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Leaderboard.jsx — Bảng Vàng Speedcubing (độc lập, một file)
 *
 * Cách dùng:
 *   <Leaderboard newSolve={newSolve} />
 *
 * Prop:
 *   newSolve (tuỳ chọn): { timeMs: number, formattedTime: string, scramble: string }
 *   Khi newSolve xuất hiện (hoặc đổi sang lần giải mới) component tự bật popup ghi danh.
 *   Có thể thêm trường `id` vào newSolve để mỗi lần giải luôn được nhận là lần mới,
 *   kể cả khi trùng thời gian và scramble.
 *
 * Lưu trữ: localStorage (khoá "rubik3d.leaderboard.v1"). Nếu trình duyệt chặn
 * localStorage, bảng vẫn chạy bình thường nhưng chỉ lưu trong bộ nhớ của phiên.
 */

const STORAGE_KEY = 'rubik3d.leaderboard.v1';
const NAME_KEY = 'rubik3d.playerName';
const MAX_NAME_LENGTH = 20;

// ---------------------------------------------------------------------------
// Dữ liệu mẫu ban đầu (kỷ lục ảo)
// ---------------------------------------------------------------------------
const MOCK_RECORDS = [
  {
    id: 'mock-max-park',
    name: 'Max Park',
    timeMs: 3130,
    scramble: "D2 B' U2 L2 F2 R2 D' F2 U' R' B2 D L' F U2 R2 B' D2 F R",
    createdAt: Date.UTC(2025, 5, 14, 9, 30),
    mine: false,
  },
  {
    id: 'mock-yiheng-wang',
    name: 'Yiheng Wang',
    timeMs: 4120,
    scramble: "R' U2 F' D2 L2 B R2 U' L2 F2 D B2 R' F' U D2 L' B' R2 U2",
    createdAt: Date.UTC(2025, 8, 2, 14, 5),
    mine: false,
  },
  {
    id: 'mock-neon-ninja',
    name: 'Neon Ninja',
    timeMs: 7580,
    scramble: "F2 L' D2 R2 B2 U' F' L2 U2 R B' D F2 R' U' B L2 D' F U2",
    createdAt: Date.UTC(2026, 0, 21, 19, 45),
    mine: false,
  },
  {
    id: 'mock-minh-toan',
    name: 'Minh Toan',
    timeMs: 12450,
    scramble: "U' R2 F D2 B' L2 U2 F2 R' D' L B2 U R2 F' D2 L' U B2 R",
    createdAt: Date.UTC(2026, 3, 8, 3, 20),
    mine: false,
  },
  {
    id: 'mock-cube-tiger',
    name: 'Cube Tiger',
    timeMs: 15020,
    scramble: "B2 D' R F2 U2 L' B' D2 R2 F U' L2 D B2 R' U F' L2 B D2",
    createdAt: Date.UTC(2026, 6, 30, 11, 10),
    mine: false,
  },
];

const TABS = [
  { id: 'all', label: 'Tất cả thời gian' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'mine', label: 'Lịch sử của tôi' },
];

const EMPTY_TEXT = {
  all: 'Chưa có kỷ lục nào. Hãy giải một lượt và ghi danh lên Bảng Vàng.',
  today: 'Hôm nay chưa có kỷ lục nào. Hãy là người đầu tiên ghi danh.',
  mine: 'Bạn chưa lưu lần giải nào trên thiết bị này. Giải một lượt và bấm “Lưu Kỷ Lục” để xuất hiện ở đây.',
};

const MEDALS = [
  { emoji: '🥇', label: 'Vàng', cls: 'lb-gold' },
  { emoji: '🥈', label: 'Bạc', cls: 'lb-silver' },
  { emoji: '🥉', label: 'Đồng', cls: 'lb-bronze' },
];

// ---------------------------------------------------------------------------
// Hàm tiện ích
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');

/** 9450 -> "09.45s", 75320 -> "1:15.32" */
function formatTime(ms) {
  const centis = Math.max(0, Math.round((Number(ms) || 0) / 10));
  const minutes = Math.floor(centis / 6000);
  const seconds = ((centis % 6000) / 100).toFixed(2).padStart(5, '0');
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}s`;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function isToday(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Nhanh hơn xếp trên; bằng nhau thì ai ghi trước xếp trên. */
function compareRecords(a, b) {
  return a.timeMs - b.timeMs || a.createdAt - b.createdAt;
}

function makeId() {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidRecord(r) {
  return (
    r &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    Number.isFinite(r.timeMs) &&
    r.timeMs > 0 &&
    Number.isFinite(r.createdAt)
  );
}

function loadRecords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter(isValidRecord).map((r) => ({
          ...r,
          scramble: typeof r.scramble === 'string' ? r.scramble : '',
          mine: Boolean(r.mine),
        }));
        if (clean.length > 0) return clean;
      }
    }
  } catch (error) {
    // localStorage bị chặn hoặc dữ liệu hỏng: dùng dữ liệu mẫu.
  }
  return MOCK_RECORDS;
}

function readPlayerName() {
  try {
    return window.localStorage.getItem(NAME_KEY) || '';
  } catch (error) {
    return '';
  }
}

function writePlayerName(value) {
  try {
    window.localStorage.setItem(NAME_KEY, value);
  } catch (error) {
    // bỏ qua
  }
}

// ---------------------------------------------------------------------------
// CSS (đóng gói trong component, tiền tố lb- để không đụng style của dự án)
// ---------------------------------------------------------------------------
const STYLES = `
.lb-root{box-sizing:border-box;width:100%;max-width:960px;margin:0 auto;padding:28px 20px 32px;background:#0f172a;color:#e2e8f0;border-radius:24px;border:1px solid rgba(148,163,184,.16);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.lb-root *,.lb-root *::before,.lb-root *::after{box-sizing:border-box}
.lb-header{text-align:center;margin-bottom:22px}
.lb-title{margin:0;padding:.22em 0 .08em;line-height:1.25;font-size:clamp(1.5rem,4.6vw,2.4rem);font-weight:900;letter-spacing:.03em;background:linear-gradient(90deg,#fde047,#f59e0b 55%,#fb923c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 16px rgba(250,204,21,.4))}
.lb-sub{margin:8px 0 0;color:#94a3b8;font-size:.95rem}
.lb-sub strong{color:#f8fafc;font-variant-numeric:tabular-nums}
.lb-tabs{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:20px}
.lb-tab{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:#1e293b;color:#cbd5e1;font-size:.9rem;font-weight:600;transition:border-color .15s ease,color .15s ease,background .15s ease}
.lb-tab:hover{border-color:rgba(250,204,21,.55);color:#fff}
.lb-tab[aria-selected="true"]{background:#facc15;border-color:#facc15;color:#0f172a}
.lb-tab:focus-visible,.lb-btn:focus-visible,.lb-input:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
.lb-count{min-width:22px;padding:1px 7px;border-radius:999px;background:rgba(148,163,184,.2);font-size:.75rem;text-align:center;font-variant-numeric:tabular-nums}
.lb-tab[aria-selected="true"] .lb-count{background:rgba(15,23,42,.18)}
.lb-head,.lb-row{display:grid;grid-template-columns:72px minmax(120px,1.2fr) 120px minmax(0,2.4fr) 110px;align-items:center;column-gap:14px}
.lb-head{padding:0 19px 10px;color:#64748b;font-size:.78rem;font-weight:700;letter-spacing:.04em}
.lb-head span:first-child{text-align:center}
.lb-head span:last-child{text-align:right}
.lb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.lb-row{padding:14px 18px;border-radius:16px;background:#1e293b;border:1px solid rgba(148,163,184,.14);transition:transform .15s ease,border-color .15s ease}
.lb-row:hover{transform:translateY(-1px);border-color:rgba(148,163,184,.4)}
.lb-gold{background:linear-gradient(135deg,rgba(250,204,21,.16),#1e293b 60%);border-color:rgba(250,204,21,.8);box-shadow:0 0 0 1px rgba(250,204,21,.25),0 0 28px rgba(250,204,21,.35);animation:lbGlow 2.8s ease-in-out infinite}
.lb-gold:hover{border-color:#facc15}
.lb-silver{border-color:rgba(203,213,225,.6);box-shadow:inset 3px 0 0 #cbd5e1}
.lb-bronze{border-color:rgba(205,127,50,.7);box-shadow:inset 3px 0 0 #cd7f32}
.lb-new{animation:lbFlash 1.4s ease-out 3}
.lb-c-rank{text-align:center;font-weight:800}
.lb-medal{font-size:1.7rem;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.lb-rank-num{color:#94a3b8;font-size:1.05rem;font-variant-numeric:tabular-nums}
.lb-c-name{display:flex;align-items:center;gap:8px;min-width:0;font-weight:700;font-size:1.02rem}
.lb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-badge{flex:none;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:800;color:#7dd3fc;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.45)}
.lb-c-time{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-weight:800;font-size:1.2rem;color:#f8fafc}
.lb-gold .lb-c-time{color:#fde047;text-shadow:0 0 14px rgba(250,204,21,.55)}
.lb-silver .lb-c-time{color:#e2e8f0}
.lb-bronze .lb-c-time{color:#fdba74}
.lb-c-scramble{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8rem;color:#94a3b8}
.lb-c-date{text-align:right;color:#94a3b8;font-size:.85rem;font-variant-numeric:tabular-nums}
.lb-empty{padding:36px 16px;text-align:center;line-height:1.55;color:#94a3b8;border:1px dashed rgba(148,163,184,.35);border-radius:16px}
.lb-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.78);backdrop-filter:blur(6px)}
.lb-modal{width:100%;max-width:440px;padding:26px 24px 22px;border-radius:20px;background:#111c33;border:1px solid rgba(250,204,21,.5);box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 40px rgba(250,204,21,.2);animation:lbPop .22s ease-out}
.lb-modal-text{margin:0 0 14px;font-size:1.05rem;line-height:1.55;color:#e2e8f0}
.lb-modal-time{color:#fde047;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1.15em;white-space:nowrap}
.lb-modal-scramble{margin:0 0 14px;padding:8px 10px;border-radius:10px;background:#0b1220;color:#94a3b8;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.75rem;line-height:1.5;word-break:break-word}
.lb-input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(148,163,184,.4);background:#0b1220;color:#f8fafc;font-size:1rem}
.lb-input::placeholder{color:#64748b}
.lb-hint{margin:6px 2px 0;min-height:1.1em;color:#94a3b8;font-size:.8rem}
.lb-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:14px}
.lb-btn{appearance:none;cursor:pointer;padding:11px 18px;border-radius:12px;border:1px solid transparent;font-size:.95rem;font-weight:700;transition:transform .15s ease,opacity .15s ease,background .15s ease}
.lb-btn-primary{background:linear-gradient(135deg,#facc15,#f59e0b);color:#0f172a;box-shadow:0 8px 22px rgba(245,158,11,.3)}
.lb-btn-primary:hover:not(:disabled){transform:translateY(-1px)}
.lb-btn-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.lb-btn-ghost{background:transparent;color:#cbd5e1;border-color:rgba(148,163,184,.4)}
.lb-btn-ghost:hover{background:rgba(148,163,184,.12)}
.lb-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1100;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:14px;background:#14532d;color:#dcfce7;border:1px solid rgba(74,222,128,.55);box-shadow:0 12px 30px rgba(0,0,0,.45);font-weight:600;animation:lbToast .22s ease-out}
.lb-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes lbGlow{0%,100%{box-shadow:0 0 0 1px rgba(250,204,21,.25),0 0 22px rgba(250,204,21,.3)}50%{box-shadow:0 0 0 1px rgba(250,204,21,.5),0 0 40px rgba(250,204,21,.55)}}
@keyframes lbFlash{0%{background:rgba(56,189,248,.4)}100%{background:#1e293b}}
@keyframes lbPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@keyframes lbToast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:640px){
  .lb-root{padding:22px 12px 26px;border-radius:18px}
  .lb-head{display:none}
  .lb-row{grid-template-columns:48px minmax(0,1fr) auto;grid-template-areas:"rank name time" "rank scramble scramble" "rank date date";row-gap:4px;padding:12px 14px}
  .lb-c-rank{grid-area:rank;align-self:center}
  .lb-c-name{grid-area:name}
  .lb-c-time{grid-area:time;font-size:1.1rem}
  .lb-c-scramble{grid-area:scramble;white-space:normal;word-break:break-word;font-size:.74rem;line-height:1.4}
  .lb-c-date{grid-area:date;text-align:left;font-size:.78rem}
}
@media (prefers-reduced-motion:reduce){
  .lb-root *,.lb-overlay,.lb-modal,.lb-toast{animation:none !important;transition:none !important}
}
`;

// ---------------------------------------------------------------------------
// Một hàng trong bảng xếp hạng
// ---------------------------------------------------------------------------
function LeaderboardRow({ record, rank, highlighted }) {
  const medal = MEDALS[rank - 1];
  const className = ['lb-row', medal ? medal.cls : '', highlighted ? 'lb-new' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li id={`lb-row-${record.id}`} className={className}>
      <div className="lb-c-rank">
        {medal ? (
          <span className="lb-medal" role="img" aria-label={`Hạng ${rank}, huy chương ${medal.label}`}>
            {medal.emoji}
          </span>
        ) : (
          <span className="lb-rank-num" aria-label={`Hạng ${rank}`}>
            #{rank}
          </span>
        )}
      </div>
      <div className="lb-c-name">
        <span className="lb-name" title={record.name}>
          {record.name}
        </span>
        {record.mine && <span className="lb-badge">BẠN</span>}
      </div>
      <div className="lb-c-time">{formatTime(record.timeMs)}</div>
      <div className="lb-c-scramble" title={record.scramble}>
        {record.scramble || '—'}
      </div>
      <div className="lb-c-date">{formatDate(record.createdAt)}</div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Popup ghi danh khi có điểm mới
// ---------------------------------------------------------------------------
function SaveModal({ solve, name, onNameChange, onSave, onCancel }) {
  const inputRef = useRef(null);
  const canSave = name.trim().length > 0;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Chặn phím lan ra ngoài để gõ tên (kể cả phím Space) không kích hoạt Timer của trang.
  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="lb-overlay">
      <div
        className="lb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-modal-title"
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <p id="lb-modal-title" className="lb-modal-text">
          🎉 Chúc mừng bạn đã hoàn thành với thời gian{' '}
          <strong className="lb-modal-time">{solve.formattedTime}</strong>! Nhập tên để ghi danh lên
          Bảng Vàng:
        </p>

        {solve.scramble && <p className="lb-modal-scramble">{solve.scramble}</p>}

        <label htmlFor="lb-name-input" className="lb-sr-only">
          Tên người chơi
        </label>
        <input
          id="lb-name-input"
          ref={inputRef}
          className="lb-input"
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Tên của bạn…"
          autoComplete="nickname"
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSave) onSave();
          }}
        />
        <p className="lb-hint">{canSave ? `Tối đa ${MAX_NAME_LENGTH} ký tự.` : 'Nhập tên để lưu kỷ lục.'}</p>

        <div className="lb-actions">
          <button type="button" className="lb-btn lb-btn-ghost" onClick={onCancel}>
            Bỏ qua
          </button>
          <button type="button" className="lb-btn lb-btn-primary" onClick={onSave} disabled={!canSave}>
            Lưu Kỷ Lục
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component chính
// ---------------------------------------------------------------------------
export default function Leaderboard({ newSolve = null }) {
  const [records, setRecords] = useState(loadRecords);
  const [tab, setTab] = useState('all');
  const [pending, setPending] = useState(null);
  const [name, setName] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [toast, setToast] = useState(null);
  const handledSolveRef = useRef(null);

  // Lưu vào localStorage mỗi khi bảng thay đổi.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      // localStorage đầy hoặc bị chặn: bảng vẫn chạy trong bộ nhớ.
    }
  }, [records]);

  // Đồng bộ khi mở nhiều tab trình duyệt.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setRecords(loadRecords());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Có điểm mới từ Timer: mở popup ghi danh.
  useEffect(() => {
    if (!newSolve || !Number.isFinite(newSolve.timeMs) || newSolve.timeMs <= 0) {
      handledSolveRef.current = null;
      return;
    }
    const key = `${newSolve.id ?? ''}|${newSolve.timeMs}|${newSolve.scramble ?? ''}`;
    if (handledSolveRef.current === key) return;
    handledSolveRef.current = key;
    setPending({
      timeMs: newSolve.timeMs,
      formattedTime: newSolve.formattedTime || formatTime(newSolve.timeMs),
      scramble: newSolve.scramble || '',
    });
    setName(readPlayerName());
  }, [newSolve]);

  // Phím Escape đóng popup khi tiêu điểm đang nằm ngoài popup.
  useEffect(() => {
    if (!pending) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending]);

  // Cuộn tới hàng vừa ghi danh, rồi tắt hiệu ứng sau vài giây.
  useEffect(() => {
    if (!highlightId) return undefined;
    const row = document.getElementById(`lb-row-${highlightId}`);
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const timer = setTimeout(() => setHighlightId(null), 5000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const views = useMemo(() => {
    const sorted = [...records].sort(compareRecords);
    return {
      all: sorted,
      today: sorted.filter((r) => isToday(r.createdAt)),
      mine: sorted.filter((r) => r.mine),
    };
  }, [records]);

  const visible = views[tab];
  const best = views.all[0];

  const handleSave = () => {
    if (!pending) return;
    const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
    if (!cleanName) return;

    const record = {
      id: makeId(),
      name: cleanName,
      timeMs: Math.round(pending.timeMs),
      scramble: pending.scramble,
      createdAt: Date.now(),
      mine: true,
    };
    const rank = [...records, record].sort(compareRecords).findIndex((r) => r.id === record.id) + 1;

    setRecords((prev) => [...prev, record]);
    writePlayerName(cleanName);
    setTab('all');
    setHighlightId(record.id);
    setToast({ rank, formattedTime: formatTime(record.timeMs) });
    setPending(null);
  };

  return (
    <section className="lb-root" aria-label="Bảng vàng Speedcubing">
      <style>{STYLES}</style>

      <header className="lb-header">
        <h2 className="lb-title">🏆 BẢNG VÀNG SPEEDCUBING</h2>
        {best && (
          <p className="lb-sub">
            Kỷ lục hiện tại: <strong>{formatTime(best.timeMs)}</strong> · {best.name}
          </p>
        )}
      </header>

      <div className="lb-tabs" role="tablist" aria-label="Bộ lọc bảng xếp hạng">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`lb-tab-${t.id}`}
            type="button"
            role="tab"
            className="lb-tab"
            aria-selected={tab === t.id}
            aria-controls="lb-panel"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="lb-count">{views[t.id].length}</span>
          </button>
        ))}
      </div>

      <div id="lb-panel" role="tabpanel" aria-labelledby={`lb-tab-${tab}`}>
        {visible.length === 0 ? (
          <div className="lb-empty">{EMPTY_TEXT[tab]}</div>
        ) : (
          <>
            <div className="lb-head" aria-hidden="true">
              <span>Hạng</span>
              <span>Người chơi</span>
              <span>Thời gian</span>
              <span>Scramble</span>
              <span>Ngày giải</span>
            </div>
            <ol className="lb-list" role="list">
              {visible.map((record, index) => (
                <LeaderboardRow
                  key={record.id}
                  record={record}
                  rank={index + 1}
                  highlighted={record.id === highlightId}
                />
              ))}
            </ol>
          </>
        )}
      </div>

      {pending && (
        <SaveModal
          solve={pending}
          name={name}
          onNameChange={setName}
          onSave={handleSave}
          onCancel={() => setPending(null)}
        />
      )}

      {toast && (
        <div className="lb-toast" role="status">
          ✅ Đã ghi danh {toast.formattedTime}. Bạn đứng hạng #{toast.rank} trên Bảng Vàng!
        </div>
      )}
    </section>
  );
}
