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
  buildCameraConstraintFallbacks,
  enhanceLowLightRgbaBuffer,
  calibrateWebcamFrameBuffer
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
});
