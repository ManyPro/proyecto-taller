<script>
  import { onMount } from 'svelte';
  import PasswordRecovery from '../lib/components/PasswordRecovery.svelte';
  import { initTheme } from '../lib/utils/theme.js';
  
  onMount(() => {
    initTheme();
  });
</script>

<svelte:head>
  <title>Taller App - Recuperar contraseña</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<PasswordRecovery />

