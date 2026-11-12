import { describe, it, expect } from 'vitest';
import {
  PUZZLE_CONFIGS,
  generateScramble,
  HUD_THEMES,
  COLOR_DEFINITIONS
} from '../config/rubikConfig';
import {
  classifyRubikStickerCell,
  classifyCenterStickerFallback,
  rgbToOpenCvHsv,
  nhanDienMauOpenCv,
  layMauTrungViOpenCv,
  sampleCubieStickerCell,
  evaluateRubikGridCandidate,
  evaluateCenteredRubikWithOffset,
  buildCameraConstraintFallbacks,
  enhanceLowLightRgbaBuffer,
  calibrateWebcamFrameBuffer,
  computeFrameLumaStats,
  runVisionDiagnosticSuite
} from '../vision/rubikVision';
import {
  sanitizeText,
  hasMaliciousPayload,
  checkRateLimit
} from '../utils/securityShield';
import {
  calculateEloDelta,
  getRankTier
} from '../utils/cloudBackend';
import { calculateAo } from '../utils/timerStats';
import { isSoundMuted, setSoundMuted, playSoundEffect } from '../utils/soundEngine';
import { buildScrambledFaces } from '../components/Rubik3DView';

describe('WCA Scramble Generator & Config', () => {
  it('generates valid scrambles for 2x2 through 7x7 without consecutive same-face moves', () => {
    for (const key of Object.keys(PUZZLE_CONFIGS)) {
      const scramble = generateScramble(key);
      const tokens = scramble.split(/\s+/).filter(Boolean);
      expect(tokens.length).toBeGreaterThanOrEqual(9);
      for (let i = 1; i < tokens.length; i++) {
        const curBase = tokens[i].replace(/['2]/g, '');
        const prevBase = tokens[i - 1].replace(/['2]/g, '');
        if (key === '2x2' || key === '3x3') {
          expect(curBase[0]).not.toBe(prevBase[0]);
        } else {
          expect(curBase).not.toBe(prevBase);
        }
      }
    }
  });

  it('defines off mode, 8 interactive HUD themes, and 7 sticker color definitions', () => {
    expect(Object.keys(HUD_THEMES)).toEqual([
      'off',
      'sakura',
      'cyber',
      'thunder',
      'frost',
      'galaxy',
      'inferno',
      'matrix',
      'aurora'
    ]);
    for (const theme of Object.values(HUD_THEMES)) {
      expect(typeof theme.id).toBe('string');
      expect(typeof theme.icon).toBe('string');
      expect(typeof theme.shortName).toBe('string');
      expect(typeof theme.color).toBe('string');
    }
    expect(Object.keys(COLOR_DEFINITIONS)).toEqual([
      'white',
      'yellow',
      'red',
      'orange',
      'green',
      'blue',
      'invalid'
    ]);
  });
});

describe('Computer Vision HSV Color Classifier', () => {
  it('accurately classifies primary Rubik sticker colors', () => {
    expect(classifyRubikStickerCell(245, 245, 245, 5)).toBe('white');
    expect(classifyRubikStickerCell(230, 30, 30, 5)).toBe('red');
    expect(classifyRubikStickerCell(245, 130, 20, 5)).toBe('orange');
    expect(classifyRubikStickerCell(240, 230, 25, 5)).toBe('yellow');
    expect(classifyRubikStickerCell(30, 200, 60, 5)).toBe('green');
    expect(classifyRubikStickerCell(30, 90, 235, 5)).toBe('blue');
  });

  it('rejects dark/shadow cells and high variance blur as invalid', () => {
    expect(classifyRubikStickerCell(15, 15, 15, 5)).toBe('invalid');
    expect(classifyRubikStickerCell(200, 30, 30, 95)).toBe('invalid');
  });

  it('auto-recovers center sticker color under mild glare via fallback', () => {
    expect(classifyCenterStickerFallback(235, 235, 235)).toBe('white');
    expect(classifyCenterStickerFallback(220, 40, 40)).toBe('red');
    expect(classifyCenterStickerFallback(40, 190, 70)).toBe('green');
    const hsv = rgbToOpenCvHsv(0, 0, 255);
    expect(Math.round(hsv.h)).toBe(120);
  });

  it('provides progressive camera constraint fallbacks including low-spec presets', () => {
    const stdList = buildCameraConstraintFallbacks('environment', false);
    const lowList = buildCameraConstraintFallbacks('user', true);
    expect(stdList.length).toBeGreaterThanOrEqual(4);
    expect(lowList.length).toBeGreaterThanOrEqual(4);
    expect(stdList[stdList.length - 1]).toBe(true);
    expect(lowList[lowList.length - 1]).toBe(true);
    expect(lowList[0].width.ideal).toBeLessThanOrEqual(480);
    expect(lowList[0].frameRate.max).toBeLessThanOrEqual(24);
  });

  it('enhances dim/low-contrast buffers via LUT while leaving bright frames untouched', () => {
    const bright = new Uint8ClampedArray([200, 180, 160, 255, 60, 120, 220, 255]);
    expect(enhanceLowLightRgbaBuffer(bright, 140, 120)).toBe(false);
    expect(bright[0]).toBe(200);

    const dim = new Uint8ClampedArray([20, 60, 25, 255, 45, 30, 20, 255]);
    const beforeGreen = dim[1];
    expect(enhanceLowLightRgbaBuffer(dim, 42, 30)).toBe(true);
    expect(dim[1]).toBeGreaterThan(beforeGreen);
    expect(dim[3]).toBe(255);
  });

  it('recovers dim OpenCV and sticker cell colors only when lowLightMode is enabled', () => {
    expect(nhanDienMauOpenCv({ h: 60, s: 75, v: 36 }, false)).toBe('?');
    expect(nhanDienMauOpenCv({ h: 60, s: 75, v: 36 }, true)).toBe('Xanh lá');
    expect(classifyRubikStickerCell(28, 75, 32, 6, 0, 'auto', null, true)).toBe('green');
    expect(classifyRubikStickerCell(15, 15, 15, 6, 0, 'auto', null, true)).toBe('invalid');
  });

  it('prevents circular Hue 0/179 wrap-around bug on noisy Red stickers via RGB histogram median', () => {
    const w = 12;
    const h = 12;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      buf[idx] = 220;
      buf[idx + 1] = i % 2 === 0 ? 15 : 22;
      buf[idx + 2] = i % 2 === 0 ? 22 : 15;
      buf[idx + 3] = 255;
    }
    const hsv = layMauTrungViOpenCv(buf, w, h, 2, 2, 10, 10);
    expect(nhanDienMauOpenCv(hsv)).toBe('Đỏ');
    const sample = sampleCubieStickerCell(buf, w, h, 6, 6, 12);
    expect(sample.valid).toBe(true);
    expect(classifyRubikStickerCell(sample.avgR, sample.avgG, sample.avgB, sample.stdDev, 0, 'auto', sample.medHsv)).toBe('red');
  });

  it('auto white-balances yellow-tinted dim frames via calibrateWebcamFrameBuffer', () => {
    const clean = new Uint8ClampedArray([150, 150, 150, 255]);
    expect(calibrateWebcamFrameBuffer(clean, 150, 90, 150, 150, 150)).toEqual({
      enhanced: false,
      whiteBalanced: false
    });

    const warmDim = new Uint8ClampedArray([80, 68, 42, 255, 70, 60, 35, 255]);
    const res = calibrateWebcamFrameBuffer(warmDim, 60, 40, 75, 64, 38);
    expect(res).toEqual({ enhanced: true, whiteBalanced: true });
    // Blue channel lifted stronger than red to reduce warm cast while overall luminance boosted
    expect(warmDim[2]).toBeGreaterThan(42);
    expect(warmDim[0]).toBeGreaterThan(80);
  });

  it('recovers UV glare, warm indoor White, Pastel Macaron, and washed-out 3x3 cube grids while rejecting flat skin tones', () => {
    // Glare-washed UV, warm bulb white, cool monitor white, pastel macaron
    expect(classifyRubikStickerCell(195, 242, 204, 5, 0, 'uv')).toBe('green');
    expect(classifyRubikStickerCell(245, 242, 192, 5, 0, 'uv')).toBe('yellow');
    expect(classifyRubikStickerCell(235, 220, 175, 5, 0, 'auto')).toBe('white');
    expect(classifyRubikStickerCell(185, 205, 232, 5, 0, 'auto')).toBe('white');
    expect(classifyRubikStickerCell(192, 236, 214, 5, 0, 'pastel')).toBe('green');
    expect(classifyRubikStickerCell(242, 192, 202, 5, 0, 'pastel')).toBe('red');
    expect(classifyRubikStickerCell(192, 216, 245, 5, 0, 'pastel')).toBe('blue');

    // Washed-out 3x3 grid must lock 9/9 instead of triggering false skin rejection
    const w = 180;
    const h = 180;
    const buf = new Uint8ClampedArray(w * h * 4);
    buf.fill(18);
    const washedFace = [
      [175, 128, 86], [218, 215, 202], [192, 184, 138],
      [92, 158, 108], [178, 124, 84],  [98, 128, 188],
      [185, 92, 92],  [196, 188, 140], [216, 214, 200]
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const [R, G, B] = washedFace[r * 3 + c];
        for (let y = 45 + r * 30 + 3; y < 45 + (r + 1) * 30 - 3; y++) {
          for (let x = 45 + c * 30 + 3; x < 45 + (c + 1) * 30 - 3; x++) {
            const idx = (y * w + x) * 4;
            buf[idx] = R;
            buf[idx + 1] = G;
            buf[idx + 2] = B;
            buf[idx + 3] = 255;
          }
        }
      }
    }
    const gridRes = evaluateRubikGridCandidate(buf, w, h, 3, 45, 45, 90, 0, 'auto', true);
    expect(gridRes.validColorsCount).toBe(9);
    expect(gridRes.isMostlySkinOrWood).toBe(false);
    expect(gridRes.isGeometricallyVerifiedCube).toBe(true);

    // Flat sunlit skin patch must still be rejected
    const skinBuf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      skinBuf[i * 4] = 212;
      skinBuf[i * 4 + 1] = 166;
      skinBuf[i * 4 + 2] = 138;
      skinBuf[i * 4 + 3] = 255;
    }
    const skinRes = evaluateRubikGridCandidate(skinBuf, w, h, 3, 45, 45, 90, 0, 'auto', true);
    expect(skinRes.isMostlySkinOrWood).toBe(true);
    expect(skinRes.isGeometricallyVerifiedCube).toBe(false);
    expect(skinRes.validColorsCount).toBe(0);
  });

  it('passes 100% of runVisionDiagnosticSuite and rescues shifted cubes via evaluateCenteredRubikWithOffset', () => {
    const suite = runVisionDiagnosticSuite();
    expect(suite.total).toBe(11);
    expect(suite.results.filter((r) => !r.passed)).toEqual([]);
    expect(suite.passed).toBe(suite.total);
    expect(suite.passRatePct).toBe(100);
    expect(suite.baselineBeforePassed).toBeLessThan(suite.passed);

    const w = 180;
    const h = 150;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 16;
      buf[i + 1] = 20;
      buf[i + 2] = 28;
      buf[i + 3] = 255;
    }
    const faceColors = [
      [215, 42, 40], [42, 188, 86], [44, 104, 224],
      [238, 214, 42], [238, 130, 38], [238, 238, 238],
      [215, 42, 40], [42, 188, 86], [238, 214, 42]
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const [R, G, B] = faceColors[r * 3 + c];
        for (let y = 21 + r * 36 + 2; y < 21 + (r + 1) * 36 - 2; y++) {
          for (let x = 64 + c * 36 + 2; x < 64 + (c + 1) * 36 - 2; x++) {
            const idx = (y * w + x) * 4;
            if (x < w && y < h) {
              buf[idx] = R;
              buf[idx + 1] = G;
              buf[idx + 2] = B;
            }
          }
        }
      }
    }
    const rescued = evaluateCenteredRubikWithOffset(buf, w, h, 3, 46, 21, 108, 'auto', false);
    expect(rescued.usedMicroOffset).toBe(true);
    expect(rescued.validColorsCount).toBeGreaterThanOrEqual(8);

    const luma = computeFrameLumaStats(buf);
    expect(luma.avgBrightness).toBeGreaterThan(20);
    expect(luma.contrast).toBeGreaterThan(100);
  });
});

describe('Security Shield & ELO Ranking', () => {
  it('sanitizes XSS payloads and detects malicious scripts', () => {
    expect(hasMaliciousPayload('<script>alert(1)</script>')).toBe(true);
    expect(hasMaliciousPayload('Nguyen Van A')).toBe(false);
    expect(sanitizeText('  <b>Player</b>  ')).toBe('bPlayer/b');
    expect(checkRateLimit('test_action_unit', 5, 1000).allowed).toBe(true);
  });

  it('calculates ELO deltas and rank tiers accurately', () => {
    const win = calculateEloDelta(1200, 1200, 1);
    expect(win.deltaA).toBe(16);
    expect(win.newRatingA).toBe(1216);
    expect(win.newRatingB).toBe(1184);
    expect(getRankTier(2300).id).toBe('grandmaster');
    expect(getRankTier(900).id).toBe('rookie');
  });

  it('computes WCA Ao5 trimming best and worst solves', () => {
    const solves = [{ time: 8.0 }, { time: 10.0 }, { time: 11.0 }, { time: 12.0 }, { time: 20.0 }];
    expect(calculateAo(solves, 5)).toBe('11.00');
    expect(calculateAo(solves.slice(0, 3), 5)).toBe('--');
  });

  it('persists sound mute state and safely skips Web Audio when unavailable or muted', () => {
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    expect(playSoundEffect('click')).toBe(false);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it('conserves exact per-color sticker counts when building 3D scrambled cube faces', () => {
    const faces = buildScrambledFaces(3, "R U R' U' F2 L D' B2");
    const counts = { white: 0, yellow: 0, red: 0, orange: 0, green: 0, blue: 0 };
    for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
      expect(faces[f].length).toBe(9);
      for (const col of faces[f]) counts[col]++;
    }
    expect(counts).toEqual({ white: 9, yellow: 9, red: 9, orange: 9, green: 9, blue: 9 });
  });
});
