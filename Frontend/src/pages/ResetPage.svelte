<script>
  import { onMount } from 'svelte';
  import PasswordReset from '../lib/components/PasswordReset.svelte';
  import { initTheme } from '../lib/utils/theme.js';
  
  onMount(() => {
    initTheme();
  });
</script>

<svelte:head>
  <title>M&M - Restablecer contraseña</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<PasswordReset />

