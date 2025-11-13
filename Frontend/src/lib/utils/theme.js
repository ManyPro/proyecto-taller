export function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
  }
  try {
    localStorage.setItem('app:theme', theme);
  } catch {}
}

export function getCurrentTheme() {
  try {
    const stored = localStorage.getItem('app:theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {}
  return document.body.classList.contains('theme-light') ? 'light' : 'dark';
}

export function initTheme() {
  const theme = getCurrentTheme();
  applyTheme(theme);
  return theme;
}

export function toggleTheme() {
  const current = getCurrentTheme();
  const newTheme = current === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  return newTheme;
}

