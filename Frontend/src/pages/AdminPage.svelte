<script>
  import { onMount } from 'svelte';
  import AdminLogin from '../lib/components/AdminLogin.svelte';
  import { initTheme } from '../lib/utils/theme.js';
  
  onMount(() => {
    initTheme();
    // Cargar config y API
    import('../../assets/js/config.js');
    import('../../assets/js/api.js');
  });
</script>

<svelte:head>
  <title>Panel Admin</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<AdminLogin />

