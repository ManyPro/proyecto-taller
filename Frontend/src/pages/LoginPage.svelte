<script>
  import { onMount } from 'svelte';
  import PortalSelector from '../lib/components/PortalSelector.svelte';
  import CompanyLogin from '../lib/components/CompanyLogin.svelte';
  import { initTheme } from '../lib/utils/theme.js';
  
  let showPortal = true;
  let showLogin = false;
  
  onMount(() => {
    initTheme();
    // Cargar config y API
    import('../../assets/js/config.js');
    import('../../assets/js/api.js');
  });
  
  function handleSelectCompany() {
    showPortal = false;
    showLogin = true;
  }
  
  function handleSelectAdmin() {
    // Redirigir a admin.html
    window.location.href = 'admin.html';
  }
</script>

<svelte:head>
  <title>M&M - Inicio</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if showPortal}
  <PortalSelector onSelectCompany={handleSelectCompany} onSelectAdmin={handleSelectAdmin} />
{/if}

{#if showLogin}
  <CompanyLogin />
{/if}

