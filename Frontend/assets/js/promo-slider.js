// Promo Slider básico
// Rotación automática con pausa al interactuar, accesibilidad y futura carga dinámica.
(function(){
  const slider = document.getElementById('heroSlider');
  if(!slider) return;
  const slidesContainer = slider.querySelector('.hero-slides');
  const slides = Array.from(slidesContainer.querySelectorAll('.hero-slide'));
  const dots = Array.from(slider.querySelectorAll('.hero-dot'));
  const prevBtn = slider.querySelector('.hero-prev');
  const nextBtn = slider.querySelector('.hero-next');

  let idx = 0;
  let timer = null;
  const interval = parseInt(slider.dataset.interval||'6000',10);
  const autoplay = slider.dataset.autoplay === 'true';

  function prefersReducedMotion(){
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function show(n){
    idx = (n + slides.length) % slides.length;
    slides.forEach((s,i)=>{
      const active = i===idx;
      s.classList.toggle('active', active);
      s.setAttribute('aria-hidden', active? 'false':'true');
    });
    dots.forEach((d,i)=>{
      const active = i===idx;
      d.classList.toggle('active', active);
      d.setAttribute('aria-selected', active? 'true':'false');
    });
  }

  function next(){ show(idx+1); }
  function prev(){ show(idx-1); }

  function start(){
    if(!autoplay || prefersReducedMotion()) return;
    stop();
    timer = setInterval(next, interval);
  }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }

  // Events
  nextBtn && nextBtn.addEventListener('click', ()=>{ next(); start(); });
  prevBtn && prevBtn.addEventListener('click', ()=>{ prev(); start(); });
  dots.forEach(d => d.addEventListener('click', ()=>{ const go=parseInt(d.dataset.go,10); show(go); start(); }));

  // Pause on hover/focus
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);
  slider.addEventListener('focusin', stop);
  slider.addEventListener('focusout', start);

  // Keyboard navigation
  slider.addEventListener('keydown', (e)=>{
    if(e.key==='ArrowRight'){ next(); start(); }
    else if(e.key==='ArrowLeft'){ prev(); start(); }
  });

  // Future dynamic data hook
  window.loadPromotions = async function(data){
    // data: [{ title, text, tag }]
    // Replace slides preserving structure
    if(!Array.isArray(data)||!data.length) return;
    slidesContainer.innerHTML='';
    data.forEach((p,i)=>{
      const div=document.createElement('div');
      div.className='hero-slide'+(i===0?' active':'');
      div.dataset.index=String(i);
      div.setAttribute('aria-hidden', i===0?'false':'true');
      div.innerHTML = `<h2>${p.title}</h2><p>${p.text}</p><button class="slider-cta" data-action="detail" data-tag="${p.tag||''}">Ver detalle</button>`;
      slidesContainer.appendChild(div);
    });
    // Rebuild internal references
    const newSlides = Array.from(slidesContainer.querySelectorAll('.hero-slide'));
    slides.length=0; newSlides.forEach(s=>slides.push(s));
    // Dots
    const nav = slider.querySelector('.hero-nav');
    nav.innerHTML = newSlides.map((_,i)=>`<button class="hero-dot${i===0?' active':''}" data-go="${i}" role="tab" aria-selected="${i===0?'true':'false'}"><span class="visually-hidden">${i+1}</span></button>`).join('');
    dots.length=0; nav.querySelectorAll('.hero-dot').forEach(d=>dots.push(d));
    dots.forEach(d=> d.addEventListener('click', ()=>{ const go=parseInt(d.dataset.go,10); show(go); start(); }));
    idx=0; show(0); start();
  };

  show(0); start();
})();
