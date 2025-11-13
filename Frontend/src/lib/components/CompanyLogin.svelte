<script>
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { getAPI } from '../utils/api.js';
  
  let email = '';
  let password = '';
  let loading = false;
  let error = '';
  
  let API;
  
  onMount(async () => {
    API = await getAPI();
  });
  
  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      error = 'Ingresa correo y contraseña';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      const res = await API.loginCompany({ 
        email: email.trim().toLowerCase(), 
        password: password.trim() 
      });
      
      // Guardar features si están disponibles
      try {
        if (res?.company?.features) {
          const emailKey = res?.email || email.trim().toLowerCase();
          const featuresKey = `taller.features:${window.location.hostname}:${emailKey}`;
          localStorage.setItem(featuresKey, JSON.stringify(res.company.features));
        }
      } catch {}
      
      // Redirigir después del login exitoso
      const pending = sessionStorage.getItem('app:pending');
      if (pending) {
        sessionStorage.removeItem('app:pending');
        window.location.href = pending;
      } else {
        // Ir a la página principal
        window.location.href = 'index.html';
      }
    } catch (e) {
      error = e?.message || 'Error al iniciar sesión';
    } finally {
      loading = false;
    }
  }
  
  async function handleRegister() {
    if (!email.trim() || !password.trim()) {
      error = 'Ingresa correo y contraseña';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      await API.registerCompany({ 
        email: email.trim().toLowerCase(), 
        password: password.trim() 
      });
      await handleLogin();
    } catch (e) {
      error = e?.message || 'Error al registrar';
      loading = false;
    }
  }
  
  function handleSubmit(e) {
    e.preventDefault();
    handleLogin();
  }
</script>

<section
  id="loginSection"
  class="h-screen flex items-center justify-center px-4 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 theme-light:from-slate-50 theme-light:via-slate-100 theme-light:to-slate-50 relative"
>
  <ThemeToggle />
  
  <div class="w-full max-w-md">
    <!-- Card de Login -->
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          </div>
          <h2 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">
            Ingreso de Empresa
          </h2>
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            Accede a tu panel de gestión
          </p>
        </div>

        <!-- Mensaje de error -->
        {#if error}
          <div class="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p class="text-xs text-red-400 dark:text-red-400 theme-light:text-red-600">{error}</p>
          </div>
        {/if}

        <!-- Formulario -->
        <form on:submit={handleSubmit} class="space-y-4">
          <div>
            <label
              for="email"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Correo de empresa
            </label>
            <input
              type="email"
              id="email"
              bind:value={email}
              placeholder="empresa@correo.com"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              for="password"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              bind:value={password}
              placeholder="********"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={loading}
              class="flex-1 px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Cargando...' : 'Entrar'}
            </button>
            <button
              type="button"
              on:click={handleRegister}
              disabled={loading}
              class="flex-1 px-4 py-2 text-sm bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white theme-light:!bg-white theme-light:border-2 theme-light:!border-2 theme-light:border-slate-300 theme-light:!border-slate-300 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-50 theme-light:!hover:bg-slate-50 text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Registrar
            </button>
          </div>
          <div class="text-center">
            <a
              href="forgot.html"
              class="text-xs text-blue-400 dark:text-blue-400 theme-light:text-blue-600 hover:text-blue-300 dark:hover:text-blue-300 theme-light:hover:text-blue-700 transition-colors duration-200"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </form>
      </div>
    </div>
  </div>
</section>

<style>
  /* Estilos específicos del login si son necesarios */
</style>

