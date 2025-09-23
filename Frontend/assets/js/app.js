// Frontend/assets/js/app.js
import { API } from './api.js';

function qs(sel, root=document){ return root.querySelector(sel); }

function isLogged(){ return !!API.token.get(); }

function showLogin(){
  const card = qs('#loginCard');
  const app  = qs('#appRoot');
  if (card) card.hidden = false;
  if (app)  app.hidden  = true;
}

function showApp(){
  const card = qs('#loginCard');
  const app  = qs('#appRoot');
  if (card) card.hidden = true;
  if (app)  app.hidden  = false;
}

async function bootAfterLogin(){
  showApp();

  // Carga diferida de módulos para evitar llamadas sin token
  try {
    const [{ initNotes }]      = await Promise.all([ import('./notes.js').catch(()=>({})) ]);
    const [{ initInventory }]  = await Promise.all([ import('./inventory.js').catch(()=>({})) ]);
    const [{ initPrices }]     = await Promise.all([ import('./prices.js').catch(()=>({})) ]);
    const [{ initQuotes }]     = await Promise.all([ import('./quotes.js').catch(()=>({})) ]);
    const [{ initSales, initCash }] = await Promise.all([ import('./sales.js').catch(()=>({})) ]);

    // Inicializa si existen (según tu app)
    initNotes && initNotes();
    initInventory && initInventory();
    initPrices && initPrices();
    initQuotes && initQuotes();
    initSales && initSales();
    initCash && initCash();

  } catch(e){
    console.error('[boot] error inicializando módulos', e);
    alert('Ocurrió un error cargando los módulos. Revisa la consola.');
  }
}

async function handleLogin(e){
  e?.preventDefault?.();
  const email = qs('#loginEmail')?.value?.trim();
  const pass  = qs('#loginPass')?.value?.trim();
  if (!email || !pass){ alert('Correo y contraseña requeridos'); return; }

  try {
    await API.loginCompany(email, pass); // alias retro-compat
    await API.companyMe().catch(()=>null); // opcional
    await bootAfterLogin();
  } catch(err){
    console.error(err);
    alert(err?.message || 'No fue posible iniciar sesión');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // API base por meta (si quieres forzarlo desde HTML, ya está soportado en api.js)
  // const meta = document.querySelector('meta[name="api-base"]')?.content;
  // if (meta) API.setBase(meta);

  // Botón del login
  qs('#btnLogin')?.addEventListener('click', handleLogin);
  qs('#formLogin')?.addEventListener('submit', handleLogin);

  if (isLogged()){
    await bootAfterLogin();
  } else {
    showLogin();
  }
});
