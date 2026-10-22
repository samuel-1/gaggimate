import { t } from '@lingui/core/macro';
import { signal } from '@preact/signals';

const THEME_STORAGE_KEY = 'gaggimate-daisyui-theme';
const AVAILABLE_THEMES = ['system', 'light', 'dark', 'espresso', 'espresso-dark', 'coffee', 'nord'];
// DaisyUI themes (style.css) with a dark color scheme.
const DARK_THEMES = ['dark', 'coffee', 'espresso-dark'];

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

// The chosen theme ('system' included), so every theme picker stays in sync.
export const themeSignal = signal('system');

// A page may swap the applied theme while it is open (see setPageTheme).
let pageTheme = null;

export function getSystemTheme() {
  return mediaQuery.matches ? 'dark' : 'light';
}

export function isDarkTheme(theme) {
  return DARK_THEMES.includes(theme);
}

// Whether the theme currently on screen is dark, for code that draws its own colors.
export function isAppliedThemeDark() {
  return isDarkTheme(document.documentElement.getAttribute('data-theme'));
}

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored && AVAILABLE_THEMES.includes(stored) ? stored : 'system';
  } catch (error) {
    console.warn('Failed to get stored theme:', error);
    return 'system';
  }
}

export function setStoredTheme(theme) {
  if (!AVAILABLE_THEMES.includes(theme)) return false;
  themeSignal.value = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch (error) {
    console.warn('Failed to set stored theme:', error);
    return false;
  }
}

export function applyTheme(theme) {
  if (!AVAILABLE_THEMES.includes(theme)) {
    return;
  }
  const chosen = theme === 'system' ? getSystemTheme() : theme;
  const actualTheme = pageTheme ? pageTheme(chosen) : chosen;
  document.documentElement.setAttribute('data-theme', actualTheme);
}

// Lets a page show its own theme while it is open: `mapper` gets the user's resolved theme
// and returns the one to show. Pass null when the page closes to restore the user's theme.
export function setPageTheme(mapper) {
  pageTheme = mapper;
  applyTheme(themeSignal.value);
}

export function getAvailableThemes() {
  const labels = {
    system: t({ message: 'System', context: 'theme' }),
    light: t({ message: 'Light', context: 'theme' }),
    dark: t({ message: 'Dark', context: 'theme' }),
    espresso: t({ message: 'Espresso', context: 'theme' }),
    'espresso-dark': t({ message: 'Espresso Dark', context: 'theme' }),
    coffee: t({ message: 'Coffee', context: 'theme' }),
    nord: 'Nord',
  };
  return AVAILABLE_THEMES.map(theme => ({
    value: theme,
    label: labels[theme] ?? theme.charAt(0).toUpperCase() + theme.slice(1),
  }));
}

function onSystemThemeChange() {
  if (themeSignal.value === 'system') {
    applyTheme('system');
  }
}

// Initialize theme on load
export function initializeTheme() {
  themeSignal.value = getStoredTheme();
  mediaQuery.addEventListener('change', onSystemThemeChange);
  applyTheme(themeSignal.value);
}
