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
  rgbToOpenCvHsv
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

  it('defines all 4 HUD themes and 7 sticker color definitions', () => {
    expect(Object.keys(HUD_THEMES)).toEqual(['sakura', 'cyber', 'thunder', 'frost']);
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
});
