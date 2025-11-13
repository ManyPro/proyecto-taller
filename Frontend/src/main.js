import './app.css';
import LoginPage from './pages/LoginPage.svelte';
import { initTheme } from './lib/utils/theme.js';

// Inicializar tema
initTheme();

// Determinar qué página mostrar basado en la URL
const path = window.location.pathname;
const app = document.getElementById('app');

if (path.includes('admin.html') || path.includes('admin')) {
  import('./pages/AdminPage.svelte').then(({ default: AdminPage }) => {
    new AdminPage({ target: app });
  });
} else if (path.includes('forgot.html') || path.includes('forgot')) {
  import('./pages/ForgotPage.svelte').then(({ default: ForgotPage }) => {
    new ForgotPage({ target: app });
  });
} else if (path.includes('reset.html') || path.includes('reset')) {
  import('./pages/ResetPage.svelte').then(({ default: ResetPage }) => {
    new ResetPage({ target: app });
  });
} else {
  // Página principal (login/portal)
  new LoginPage({ target: app });
}

