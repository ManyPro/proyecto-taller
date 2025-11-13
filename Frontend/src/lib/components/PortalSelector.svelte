<script>
  import ThemeToggle from './ThemeToggle.svelte';
  
  export let onSelectCompany = () => {};
  export let onSelectAdmin = () => {};
</script>

<section
  id="portalSection"
  class="h-screen flex items-center justify-center px-4 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 theme-light:from-slate-50 theme-light:via-slate-100 theme-light:to-slate-50 relative"
>
  <ThemeToggle />
  
  <div class="w-full max-w-5xl">
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="flex justify-center mb-2">
        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">
        Portal de Acceso
      </h1>
      <p class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-600">
        Elige el tipo de sesión que deseas iniciar.
      </p>
    </div>

    <!-- Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Card Empresa -->
      <div
        class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-5 hover:shadow-2xl transition-all duration-300"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Empresa</h3>
          <span
            class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-100 text-blue-400 dark:text-blue-400 theme-light:text-blue-700 border border-blue-500/30 dark:border-blue-500/30 theme-light:border-blue-300"
          >
            Producción
          </span>
        </div>
        <div class="h-px bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-300/50 mb-4"></div>
        <p class="text-slate-300 dark:text-slate-300 theme-light:text-slate-600 mb-5 text-sm leading-snug">
          Panel de la empresa para operar Notas, Ventas, Cotizaciones y todas las herramientas de gestión.
        </p>
        <button
          on:click={onSelectCompany}
          class="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 group text-sm"
        >
          <svg
            class="w-4 h-4 group-hover:scale-110 transition-transform duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <span>Ingresar empresa</span>
        </button>
      </div>

      <!-- Card Admin -->
      <div
        class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-5 hover:shadow-2xl transition-all duration-300"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Admin</h3>
          <span
            class="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 dark:bg-purple-500/20 theme-light:bg-purple-100 text-purple-400 dark:text-purple-400 theme-light:text-purple-700 border border-purple-500/30 dark:border-purple-500/30 theme-light:border-purple-300"
          >
            Administración
          </span>
        </div>
        <div class="h-px bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-300/50 mb-4"></div>
        <p class="text-slate-300 dark:text-slate-300 theme-light:text-slate-600 mb-5 text-sm leading-snug">
          Gestiona empresas, habilita módulos, configura el entorno y administra el sistema completo.
        </p>
        <a
          href="admin.html"
          class="block w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-600 dark:to-purple-700 theme-light:from-purple-500 theme-light:to-purple-600 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-700 dark:hover:to-purple-800 theme-light:hover:from-purple-600 theme-light:hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 group text-sm"
        >
          <svg
            class="w-4 h-4 group-hover:scale-110 transition-transform duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
          <span>Ir a Admin</span>
        </a>
      </div>
    </div>
  </div>
</section>

<style>
  /* Estilos específicos del portal si son necesarios */
</style>

