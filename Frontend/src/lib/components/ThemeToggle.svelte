<script>
  import { onMount } from 'svelte';
  import { toggleTheme, getCurrentTheme } from '../utils/theme.js';
  
  let currentTheme = 'dark';
  let icon = '🌗';
  
  onMount(() => {
    currentTheme = getCurrentTheme();
    updateIcon();
  });
  
  function updateIcon() {
    icon = currentTheme === 'light' ? '🌙' : '🌞';
  }
  
  function handleToggle() {
    currentTheme = toggleTheme();
    updateIcon();
  }
</script>

<button
  on:click={handleToggle}
  class="absolute top-4 right-4 p-3 text-slate-300 dark:text-slate-300 theme-light:text-slate-700 hover:text-white dark:hover:text-white theme-light:hover:text-slate-900 hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-slate-200/50 rounded-lg transition-colors duration-200 z-20"
  title={currentTheme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro'}
>
  {icon}
</button>

