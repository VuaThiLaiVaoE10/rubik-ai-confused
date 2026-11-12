import React from 'react';

const RADAR_RING_CONFIGS = {
  sakura: {
    rings: [
      { r: 16, fill: 'rgba(244, 114, 182, 0.05)', stroke: '#f472b6', width: '0.9', dash: '3,3' },
      { r: 30, fill: 'none', stroke: '#fb7185', width: '0.75', dash: '4,3' },
      { r: 42, fill: 'none', stroke: '#f472b6', width: '0.5', dash: '2,3' }
    ],
    axisStroke: '#f472b6',
    axisWidth: '0.5',
    spanMin: 12,
    spanMax: 88,
    lockedOpacity: '0.85',
    idleOpacity: '0.55'
  },
  thunder: {
    rings: [
      { r: 20, fill: 'none', stroke: '#facc15', width: '1', dash: '4,2' },
      { r: 35, fill: 'none', stroke: '#c084fc', width: '0.8', dash: '3,3' }
    ],
    axisStroke: '#facc15',
    axisWidth: '0.6',
    spanMin: 8,
    spanMax: 92,
    lockedOpacity: '0.9',
    idleOpacity: '0.6'
  },
  frost: {
    rings: [
      { r: 18, fill: 'none', stroke: '#38bdf8', width: '0.9', dash: '3,3' },
      { r: 32, fill: 'none', stroke: '#a5f3fc', width: '0.8', dash: '4,2' }
    ],
    axisStroke: '#38bdf8',
    axisWidth: '0.5',
    spanMin: 12,
    spanMax: 88,
    lockedOpacity: '0.85',
    idleOpacity: '0.55'
  }
};

const RadarHudOverlay = React.memo(function RadarHudOverlay({
  hudThemeKey,
  currentHudTheme,
  trackingBox,
  solveStep
}) {
  const cx = solveStep === 'step1_check_scb' ? 50 : trackingBox.cxPct;
  const cy = solveStep === 'step1_check_scb' ? 50 : trackingBox.cyPct;
  const ringCfg = RADAR_RING_CONFIGS[hudThemeKey];

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
    >
      {hudThemeKey === 'cyber' && (
        trackingBox.spiderRays && trackingBox.spiderRays.length > 0 ? (
          <>
            {[0.33, 0.66, 1.0].map((ringScale, rIdx) => {
              const ringPoints = trackingBox.spiderRays.map((r) => {
                const rx = trackingBox.cxPct + (r.xPct - trackingBox.cxPct) * ringScale;
                const ry = trackingBox.cyPct + (r.yPct - trackingBox.cyPct) * ringScale;
                return `${Number(rx.toFixed(2))},${Number(ry.toFixed(2))}`;
              }).join(' ');
              return (
                <polygon
                  key={rIdx}
                  points={ringPoints}
                  fill="none"
                  stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                  strokeOpacity={0.4}
                  strokeWidth={rIdx === 2 ? '1.0' : '0.6'}
                  strokeDasharray={rIdx === 2 ? 'none' : '2,2'}
                />
              );
            })}
            {trackingBox.spiderRays.map((r, i) => (
              <line
                key={i}
                x1={trackingBox.cxPct}
                y1={trackingBox.cyPct}
                x2={r.xPct}
                y2={r.yPct}
                stroke={trackingBox.isLocked ? currentHudTheme.rayLockedColor : currentHudTheme.rayColor}
                strokeOpacity={0.4}
                strokeWidth="0.6"
              />
            ))}
          </>
        ) : (
          <g opacity="0.45">
            <circle cx="50" cy="50" r="20" fill="none" stroke={currentHudTheme.color} strokeWidth="0.8" strokeDasharray="3,3" />
            <circle cx="50" cy="50" r="38" fill="none" stroke={currentHudTheme.color} strokeWidth="0.8" strokeDasharray="3,3" />
            <line x1="50" y1="10" x2="50" y2="90" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
            <line x1="10" y1="50" x2="90" y2="50" stroke={currentHudTheme.color} strokeWidth="0.6" strokeDasharray="2,2" />
          </g>
        )
      )}

      {ringCfg && (
        <g opacity={trackingBox.isLocked ? ringCfg.lockedOpacity : ringCfg.idleOpacity}>
          {ringCfg.rings.map((ring, idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={ring.r}
              fill={ring.fill}
              stroke={ring.stroke}
              strokeWidth={ring.width}
              strokeDasharray={ring.dash}
            />
          ))}
          <line x1={cx} y1={ringCfg.spanMin} x2={cx} y2={ringCfg.spanMax} stroke={ringCfg.axisStroke} strokeWidth={ringCfg.axisWidth} strokeDasharray="2,2" />
          <line x1={ringCfg.spanMin} y1={cy} x2={ringCfg.spanMax} y2={cy} stroke={ringCfg.axisStroke} strokeWidth={ringCfg.axisWidth} strokeDasharray="2,2" />
        </g>
      )}
    </svg>
  );
});

export default RadarHudOverlay;
