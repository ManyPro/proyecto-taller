// assets/js/api.js
const BASE = (typeof window !== 'undefined' && window.API_BASE) || '/api/v1';
async function req(path, opts={}){
  const r = await fetch(BASE + path, { headers:{'Content-Type':'application/json'}, credentials:'include', ...opts });
  const txt = await r.text(); let data=null; try{ data=txt?JSON.parse(txt):null; }catch{ data=txt; }
  if(!r.ok) throw new Error((data&&data.error)||r.statusText||'Request error'); return data;
}
const API={
  getActiveCompany(){ try{ return localStorage.getItem('companyId')||'default'; }catch{ return 'default'; } },
  sales:{
    start(){ return req('/sales/start',{method:'POST'}); },
    get(id){ return req('/sales/'+id); },
    list(p={}){ const q=new URLSearchParams(p).toString(); return req('/sales'+(q?('?'+q):'')); },
    patch(id,b){ return req('/sales/'+id,{method:'PATCH',body:JSON.stringify(b)}); },
    addItem(id,b){ return req(`/sales/${id}/items`,{method:'POST',body:JSON.stringify(b)}); },
    updateItem(id,ln,b){ return req(`/sales/${id}/items/${ln}`,{method:'PATCH',body:JSON.stringify(b)}); },
    removeItem(id,ln){ return req(`/sales/${id}/items/${ln}`,{method:'DELETE'}); },
    setCustomerVehicle(id,b){ return req(`/sales/${id}/setCustomerVehicle`,{method:'POST',body:JSON.stringify(b)}); },
    addByQR(id,b){ return req(`/sales/${id}/addByQR`,{method:'POST',body:JSON.stringify(b)}); },
    close(id){ return req(`/sales/${id}/close`,{method:'POST'}); },
    cancel(id){ return req(`/sales/${id}/cancel`,{method:'POST'}); },
  },
  inventory:{ itemsList(p={}){ const q=new URLSearchParams(p).toString(); return req('/inventory/items'+(q?('?'+q):'')); } },
  quotes:{ list(p={}){ const q=new URLSearchParams(p).toString(); return req('/quotes'+(q?('?'+q):'')); }, get(id){ return req('/quotes/'+id); } }
}; export default API;
