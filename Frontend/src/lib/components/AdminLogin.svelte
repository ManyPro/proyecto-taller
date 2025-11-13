<script>
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  
  let email = '';
  let password = '';
  let loading = false;
  let error = '';
  
  let signupEmail = '';
  let signupCode = '';
  let signupPassword = '';
  let signupLoading = false;
  let signupMessage = '';
  
  const LS_KEY = 'adm:token';
  
  function setToken(t) {
    try {
      localStorage.setItem(LS_KEY, t || '');
    } catch {}
  }
  
  function getToken() {
    try {
      return localStorage.getItem(LS_KEY) || '';
    } catch {
      return '';
    }
  }
  
  async function req(path, opts = {}) {
    const tok = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: 'Bearer ' + tok } : {})
    };
    const apiBase = window.API_BASE || window.BACKEND_URL || '';
    const res = await fetch(apiBase + path, {
      ...opts,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      data = txt;
    }
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  }
  
  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      error = 'Ingresa correo y contraseña';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      const r = await req('/api/v1/admin/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password: password.trim() }
      });
      setToken(r.token);
      // Redirigir al dashboard admin
      window.location.href = 'admin.html';
    } catch (e) {
      error = e?.message || 'Error al iniciar sesión';
    } finally {
      loading = false;
    }
  }
  
  async function handleSignupRequest() {
    if (!signupEmail.trim()) {
      signupMessage = 'Ingresa un correo';
      return;
    }
    
    signupLoading = true;
    signupMessage = '';
    
    try {
      await req('/api/v1/admin/signup/request', {
        method: 'POST',
        body: { email: signupEmail.trim().toLowerCase() }
      });
      signupMessage = 'Solicitud enviada. Contacta al developer para recibir tu código.';
    } catch (e) {
      signupMessage = e?.message || 'Error';
    } finally {
      signupLoading = false;
    }
  }
  
  async function handleSignupConfirm() {
    if (!signupEmail.trim() || !signupCode.trim() || !signupPassword.trim()) {
      signupMessage = 'Completa todos los campos';
      return;
    }
    
    signupLoading = true;
    signupMessage = '';
    
    try {
      const r = await req('/api/v1/admin/signup/confirm', {
        method: 'POST',
        body: {
          email: signupEmail.trim().toLowerCase(),
          code: signupCode.trim(),
          password: signupPassword.trim()
        }
      });
      setToken(r.token);
      window.location.href = 'admin.html';
    } catch (e) {
      signupMessage = e?.message || 'Error';
      signupLoading = false;
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
  
  <div class="w-full max-w-xl space-y-4">
    <!-- Card de Login Admin -->
    <div
      class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-5 relative overflow-hidden"
    >
      <!-- Decoración de fondo -->
      <div class="absolute inset-0 opacity-5">
        <div class="absolute top-0 right-0 w-48 h-48 bg-purple-500 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 bg-pink-500 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10">
        <!-- Header -->
        <div class="text-center mb-4">
          <div class="flex justify-center mb-2">
            <div
              class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </div>
          <h2 class="text-lg font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">
            Ingreso Admin/Developer
          </h2>
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            Accede al panel de administración
          </p>
        </div>

        <!-- Mensaje de error -->
        {#if error}
          <div class="mb-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p class="text-xs text-red-400 dark:text-red-400 theme-light:text-red-600">{error}</p>
          </div>
        {/if}

        <!-- Formulario -->
        <form on:submit={handleSubmit} class="space-y-3">
          <div>
            <label
              for="a-email"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Correo
            </label>
            <input
              id="a-email"
              type="email"
              bind:value={email}
              placeholder="admin@correo.com"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <div>
            <label
              for="a-password"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Contraseña
            </label>
            <input
              id="a-password"
              type="password"
              bind:value={password}
              placeholder="********"
              disabled={loading}
              class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            class="w-full px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-600 dark:to-purple-700 theme-light:from-purple-500 theme-light:to-purple-600 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-700 dark:hover:to-purple-800 theme-light:hover:from-purple-600 theme-light:hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Cargando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>

    <!-- Card de Registro Admin -->
    <div
      class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-5 relative overflow-hidden"
    >
      <!-- Decoración de fondo -->
      <div class="absolute inset-0 opacity-5">
        <div class="absolute top-0 left-0 w-48 h-48 bg-blue-500 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 right-0 w-48 h-48 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10">
        <h3 class="text-base font-bold text-white dark:text-white theme-light:text-slate-900 mb-3">
          Crear cuenta de Admin
        </h3>
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
          Solicita un código de aprobación para crear tu cuenta de administrador.
        </p>

        <!-- Solicitar código -->
        <div class="space-y-3 mb-4">
          <div>
            <label
              for="s-email"
              class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
            >
              Correo
            </label>
            <div class="flex gap-2">
              <input
                id="s-email"
                type="email"
                bind:value={signupEmail}
                placeholder="tu-correo@dominio.com"
                disabled={signupLoading}
                class="flex-1 px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
              />
              <button
                type="button"
                on:click={handleSignupRequest}
                disabled={signupLoading}
                class="px-4 py-2 text-sm bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white theme-light:!bg-white theme-light:border-2 theme-light:!border-2 theme-light:border-slate-300 theme-light:!border-slate-300 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-50 theme-light:!hover:bg-slate-50 text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 font-semibold rounded-lg transition-all duration-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Solicitar
              </button>
            </div>
          </div>
        </div>

        <div class="h-px bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-300/50 my-4"></div>

        <!-- Confirmar registro -->
        <div class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                for="s-code"
                class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
              >
                Código
              </label>
              <input
                id="s-code"
                type="text"
                bind:value={signupCode}
                placeholder="000000"
                disabled={signupLoading}
                class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
              />
            </div>
            <div>
              <label
                for="s-pass"
                class="block text-xs font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1.5"
              >
                Contraseña
              </label>
              <input
                id="s-pass"
                type="password"
                bind:value={signupPassword}
                placeholder="********"
                disabled={signupLoading}
                class="w-full px-3 py-2 text-sm bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white theme-light:!bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 theme-light:!border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 theme-light:!text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:opacity-50"
              />
            </div>
          </div>
          <button
            type="button"
            on:click={handleSignupConfirm}
            disabled={signupLoading}
            class="w-full px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-600 dark:to-purple-700 theme-light:from-purple-500 theme-light:to-purple-600 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-700 dark:hover:to-purple-800 theme-light:hover:from-purple-600 theme-light:hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signupLoading ? 'Procesando...' : 'Confirmar registro'}
          </button>
          {#if signupMessage}
            <div
              class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-2 text-center {signupMessage.includes('Error') || signupMessage.includes('error') ? 'text-red-400' : ''}"
            >
              {signupMessage}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  /* Estilos específicos del admin login si son necesarios */
</style>

