const STORAGE_KEY = 'tur_font_scale';
const EVENT_NAME = 'tur-font-scale-change';

export const FONT_SCALES = [
  { key: 'sm', label: '小', px: 16 },
  { key: 'md', label: '標準', px: 18 },
  { key: 'lg', label: '大', px: 20 },
  { key: 'xl', label: '特大', px: 22 },
];

export const DEFAULT_FONT_SCALE = 'md';

export function getSavedFontScale() {
  if (typeof window === 'undefined') return DEFAULT_FONT_SCALE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (FONT_SCALES.some((s) => s.key === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_FONT_SCALE;
}

export function applyFontScale(scaleKey) {
  const valid = FONT_SCALES.some((s) => s.key === scaleKey) ? scaleKey : DEFAULT_FONT_SCALE;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-font-scale', valid);
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, valid);
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: valid }));
  }
  return valid;
}

export function initFontScale() {
  const scale = getSavedFontScale();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-font-scale', scale);
  }
  return scale;
}

export function subscribeFontScale(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => callback(e.detail || getSavedFontScale());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
