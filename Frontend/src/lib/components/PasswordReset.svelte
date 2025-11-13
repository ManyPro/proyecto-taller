<script>
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  
  let password = '';
  let password2 = '';
  let loading = false;
  let message = '';
  let error = false;
  let email = '';
  let token = '';
  
  onMount(async () => {
    // Obtener parámetros de la URL
    const params = new URLSearchParams(window.location.search);
    token = params.get('token') || '';
    email = params.get('email') || '';
    
    // Cargar config y API si no están disponibles
    if (!window.BACKEND_URL) {
      await import('../../../assets/js/config.js');
    }
    if (!window.API) {
      await import('../../../assets/js/api.js');
    }
  });
  
  async function handleSubmit(e) {
    e.preventDefault();
    
    if (password !== password2) {
      message = 'Las contraseñas no coinciden';
      error = true;
      return;
    }
    
    if (password.length < 6) {
      message = 'La contraseña debe tener al menos 6 caracteres';
      error = true;
      return;
    }
    
    loading = true;
    message = 'Procesando...';
    error = false;
    
    try {
      const apiBase = window.API_BASE || window.BACKEND_URL || '';
      const res = await fetch(apiBase + '/api/v1/auth/company/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          token,
          password: password.trim()
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      message = 'Contraseña actualizada. Puedes volver al inicio de sesión.';
      error = false;
    } catch (err) {
      error = true;
      message = err.message || 'Error';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 theme-light:from-slate-50 theme-light:via-slate-100 theme-light:to-slate-50 relative">
  <ThemeToggle />
  
  <div class="w-full max-w-md">
    <div
      class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6 relative overflow-hidden"
    >
      <!-- Decoración de fondo -->
      <div class="absolute inset-0 opacity-5">
        <div class="absolute top-0 right-0 w-48 h-48 bg-blue-500 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10">
        <!-- Header -->
        <div class="text-center mb-5">
          <div class="flex justify-center mb-2">
            <div
              class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>
          <h1 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">
            Restablecer contraseña
          </h1>
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            Correo: <strong class="text-white dark:text-white theme-light:text-slate-900">{email || '(desconocido)'}</strong>
          </p>
        </div>

        <!-- Mensaje -->
        {#if message}
          <div
            class="mb-4 p-3 rounded-lg {error ? 'bg-red-500/20 border border-red-500/50' : 'bg-green-500/20 border border-green-500/50'}"
          >
            <p class="text-xs {error ? 'text-red-400' : 'text-green-400'} dark:{error ? 'text-red-400' : 'text-green-400'} theme-light:{error ? 'text-red-600' : 'text-green-600'}">
              {message}
            </p>
          </div>
        {/if}

        <!-- Formulario -->
        <form on:submit={handleSubmit} class="space-y-4">
          <div>
            <label
              for="new-pass"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Nueva contraseña
            </label>
            <input
              id="new-pass"
              type="password"
              bind:value={password}
              required
              minlength="6"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              for="new-pass2"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Repetir contraseña
            </label>
            <input
              id="new-pass2"
              type="password"
              bind:value={password2}
              required
              minlength="6"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            class="w-full px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Procesando...' : 'Cambiar contraseña'}
          </button>
        </form>

        <div class="text-center mt-4">
          <a
            href="index.html"
            class="text-xs text-blue-400 dark:text-blue-400 theme-light:text-blue-600 hover:text-blue-300 dark:hover:text-blue-300 theme-light:hover:text-blue-700 transition-colors duration-200"
          >
            Ir a inicio de sesión
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Estilos específicos de reset si son necesarios */
</style>

