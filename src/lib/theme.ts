/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'stocck_theme_mode';

/**
 * Gets the current theme mode from localStorage, defaulting to 'dark'.
 */
export function getSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch (e) {
    console.warn('Could not read theme from localStorage', e);
  }
  return 'dark';
}

/**
 * Applies the selected theme to the HTML document root and body.
 */
export function applyTheme(theme: ThemeMode): void {
  try {
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      if (body) {
        body.style.backgroundColor = '#f8fafc';
        body.classList.add('light');
        body.classList.remove('dark');
      }
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      if (body) {
        body.style.backgroundColor = '#020617';
        body.classList.add('dark');
        body.classList.remove('light');
      }
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  } catch (e) {
    console.warn('Could not apply theme', e);
  }
}
