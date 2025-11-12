import API from './api.esm.js';
const api = API;

function el(id){ return document.getElementById(id); }
function htmlEscape(s){ return String(s || '').replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

// Cargar conceptos para el selector de base de porcentaje
async function loadConceptsForPercentBase() {
  try {
    const concepts = await api.get('/api/v1/payroll/concepts');
    const sel = document.getElementById('pc-percentBaseConceptId');
    if (sel) {
      const currentValue = sel.value;
      sel.innerHTML = '<option value="">Seleccione concepto...</option>' + 
        concepts
          .filter(c => c.amountType === 'fixed' && c.type === 'earning') // Solo conceptos fijos de tipo ingreso
          .map(c => `<option value="${c._id}">${htmlEscape(c.code)} · ${htmlEscape(c.name)}</option>`)
          .join('');
      if (currentValue) {
        sel.value = currentValue;
      }
    }
  } catch (err) {
    console.error('Error loading concepts for percent base:', err);
  }
}

async function loadConcepts(){
  try {
    const list = await api.get('/api/v1/payroll/concepts');
    // poblar selector de conceptos (para otras pestañas)
    const sel = document.getElementById('pa-conceptSel');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccione concepto…</option>' + list.map(c => `<option value="${c._id}">${htmlEscape(c.code)} · ${htmlEscape(c.name)}</option>`).join('');
    }
    
    // Mapear tipos a español y colores
    const typeLabels = {
      'earning': { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      'deduction': { label: 'Descuento', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      'surcharge': { label: 'Recargo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
    };
    const amountTypeLabels = {
      'fixed': 'Fijo',
      'percent': 'Porcentaje'
    };
    
    const rows = list.map(c => {
      const typeInfo = typeLabels[c.type] || { label: c.type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
      const amountLabel = amountTypeLabels[c.amountType] || c.amountType;
      const valueDisplay = c.amountType === 'percent' 
        ? `${c.defaultValue}%` 
        : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(c.defaultValue || 0);
      
      return `<div class="concept-row p-3 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200 hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-3 items-center flex-1 min-w-[200px]">
            <span class="concept-badge px-2.5 py-1 rounded-md text-xs font-semibold uppercase" style="background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}40;">
              ${htmlEscape(typeInfo.label)}
            </span>
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-xs mr-1.5">${htmlEscape(c.code)}</span>
                ${htmlEscape(c.name)}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                ${amountLabel}: <strong class="text-white dark:text-white theme-light:text-slate-900">${valueDisplay}</strong>
              </div>
            </div>
          </div>
          <div class="flex gap-1.5 items-center">
            <button data-id="${c._id}" class="x-del px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300" title="Eliminar concepto">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      </div>`;
    });
    
    const container = el('pc-list');
    if (!container) return;
    
    if (list.length === 0) {
      container.innerHTML = '<div class="text-center py-6 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay conceptos configurados. Crea el primero arriba.</div>';
    } else {
      container.innerHTML = rows.join('');
      // Agregar event listeners para eliminar
      container.querySelectorAll('.x-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          const conceptName = btn.closest('.concept-row')?.querySelector('strong')?.textContent || 'este concepto';
          if (!confirm(`¿Estás seguro de eliminar "${conceptName}"? Esta acción no se puede deshacer.`)) return;
          
          try {
            btn.disabled = true;
            btn.textContent = 'Eliminando...';
            await api.del(`/api/v1/payroll/concepts/${id}`);
            await loadConcepts();
          } catch (err) {
            alert('Error al eliminar concepto: ' + (err.message || 'Error desconocido'));
            btn.disabled = false;
            btn.innerHTML = '🗑️ Eliminar';
          }
        });
      });
    }
  } catch (err) {
    console.error('Error loading concepts:', err);
    const container = el('pc-list');
    if (container) {
      container.innerHTML = `<div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600">
        ❌ Error al cargar conceptos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function addConcept(){
  try {
    const type = el('pc-type')?.value;
    const isVariable = type === 'variable';
    const amountType = isVariable ? 'fixed' : el('pc-amountType')?.value;
    const code = (el('pc-code')?.value || '').trim().toUpperCase();
    const name = (el('pc-name')?.value || '').trim();
    const valueStr = isVariable ? '0' : (el('pc-value')?.value || '').trim();
    const variableFixedAmount = isVariable ? parseFloat(el('pc-variableFixedAmount')?.value || '0') : 0;
    
    // Validaciones
    if (!code) {
      alert('⚠️ El código es requerido');
      el('pc-code')?.focus();
      return;
    }
    if (!name) {
      alert('⚠️ El nombre es requerido');
      el('pc-name')?.focus();
      return;
    }
    
    // Declarar allowOver100 fuera del bloque para que esté disponible en todo el scope
    let allowOver100 = false;
    
    if (isVariable) {
      if (variableFixedAmount <= 0) {
        alert('⚠️ El monto fijo a completar debe ser mayor a 0');
        el('pc-variableFixedAmount')?.focus();
        return;
      }
    } else {
    if (!valueStr) {
      alert('⚠️ El valor es requerido');
      el('pc-value')?.focus();
      return;
    }
    
    const defaultValue = parseFloat(valueStr);
    if (isNaN(defaultValue) || defaultValue < 0) {
      alert('⚠️ El valor debe ser un número positivo');
      el('pc-value')?.focus();
      return;
    }
    
    if (amountType === 'percent' && defaultValue > 100) {
      if (!confirm('⚠️ El porcentaje es mayor a 100%. ¿Deseas continuar?')) {
        return;
      }
      allowOver100 = true;
    }
    
      if (!amountType) {
        alert('⚠️ Selecciona tipo de monto');
      return;
      }
    }
    
    if (!type) {
      alert('⚠️ Selecciona un tipo');
      return;
    }
    
    // Obtener configuración de base de porcentaje si es porcentaje
    let percentBaseType = 'total_gross';
    let percentBaseConceptId = null;
    let percentBaseFixedValue = 0;
    
    if (!isVariable && amountType === 'percent') {
      percentBaseType = el('pc-percentBaseType')?.value || 'total_gross';
      if (percentBaseType === 'specific_concept') {
        percentBaseConceptId = el('pc-percentBaseConceptId')?.value || null;
        if (!percentBaseConceptId) {
          alert('⚠️ Si la base es un concepto específico, debes seleccionar el concepto');
          return;
        }
      } else if (percentBaseType === 'fixed_value') {
        const fixedValueStr = el('pc-percentBaseFixedValue')?.value || '0';
        percentBaseFixedValue = parseFloat(fixedValueStr);
        if (isNaN(percentBaseFixedValue) || percentBaseFixedValue <= 0) {
          alert('⚠️ Si la base es un valor fijo, debe ser mayor a 0');
          el('pc-percentBaseFixedValue')?.focus();
          return;
        }
      }
    }
    
    const payload = {
      type: isVariable ? 'earning' : type, // Los conceptos variables son de tipo 'earning'
      amountType: isVariable ? 'fixed' : amountType,
      code,
      name,
      defaultValue: isVariable ? 0 : parseFloat(valueStr),
      isActive: true,
      isVariable,
      variableFixedAmount: isVariable ? variableFixedAmount : 0,
      percentBaseType,
      percentBaseConceptId,
      percentBaseFixedValue,
      ...(isVariable ? {} : (allowOver100 ? { allowOver100: true } : {}))
    };
    
    // Deshabilitar botón durante la petición
    const btn = el('pc-add');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando...';
    }
    
    try {
      await api.post('/api/v1/payroll/concepts', payload);
      
      // Limpiar formulario
      el('pc-code').value = '';
      el('pc-name').value = '';
      el('pc-value').value = '';
      el('pc-type').value = 'earning';
      el('pc-variableFixedAmount').value = '';
      el('pc-percentBaseType').value = 'total_gross';
      el('pc-percentBaseConceptId').value = '';
      el('pc-percentBaseFixedValue').value = '';
      // Actualizar campos según el tipo (usar el selector del DOM directamente)
      const typeSelAfter = el('pc-type');
      if (typeSelAfter) {
        typeSelAfter.dispatchEvent(new Event('change'));
      }
      
      // Recargar lista y conceptos para selector
      await Promise.all([loadConcepts(), loadConceptsForPercentBase()]);
      
      // Feedback visual
      if (btn) {
        btn.textContent = '✓ Creado';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 1500);
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      if (errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
        alert('⚠️ Ya existe un concepto con ese código. Usa un código diferente.');
        el('pc-code')?.focus();
      } else {
        alert('❌ Error al crear concepto: ' + errorMsg);
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch (err) {
    console.error('Error in addConcept:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

async function loadTechnicians(){
  try {
    const r = await api.get('/api/v1/company/technicians');
    const technicians = r.technicians || [];
    // Normalizar: convertir a objetos simples con nombre como string
    const normalizedTechs = technicians.map(t => {
      // Función auxiliar para extraer nombre como string
      const extractName = (obj) => {
        if (!obj) return 'Sin nombre';
        
        // Si es string, devolverlo directamente
        if (typeof obj === 'string') {
          return obj.trim() || 'Sin nombre';
        }
        
        // Si es objeto con propiedad name
        if (obj && typeof obj === 'object') {
          // Si tiene propiedad name
          if (obj.name !== undefined && obj.name !== null) {
            // Si name es string
            if (typeof obj.name === 'string') {
              return obj.name.trim() || 'Sin nombre';
            }
            // Si name es objeto (caracteres indexados), convertirlo
            if (typeof obj.name === 'object') {
              try {
                const nameKeys = Object.keys(obj.name);
                if (nameKeys.length > 0) {
                  // Si tiene claves numéricas, es un string indexado
                  if (nameKeys.every(k => /^\d+$/.test(k))) {
                    return Object.values(obj.name).join('').trim() || 'Sin nombre';
                  }
                }
                return String(obj.name).trim() || 'Sin nombre';
              } catch (e) {
                return 'Sin nombre';
              }
            }
            return String(obj.name).trim() || 'Sin nombre';
          }
          
          // Si no tiene name pero tiene claves numéricas, es un string antiguo
          const keys = Object.keys(obj);
          if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
            try {
              return Object.values(obj).join('').trim() || 'Sin nombre';
            } catch (e) {
              return 'Sin nombre';
            }
          }
        }
        
        return 'Sin nombre';
      };
      
      const name = extractName(t);
      
      // Extraer otros campos de forma segura
      let identification = '';
      let basicSalary = null;
      let workHoursPerMonth = null;
      let basicSalaryPerDay = null;
      let contractType = '';
      
      if (t && typeof t === 'object') {
        identification = String(t.identification || '').trim();
        basicSalary = (t.basicSalary !== undefined && t.basicSalary !== null) ? Number(t.basicSalary) : null;
        workHoursPerMonth = (t.workHoursPerMonth !== undefined && t.workHoursPerMonth !== null) ? Number(t.workHoursPerMonth) : null;
        basicSalaryPerDay = (t.basicSalaryPerDay !== undefined && t.basicSalaryPerDay !== null) ? Number(t.basicSalaryPerDay) : null;
        contractType = String(t.contractType || '').trim();
      }
      
      // Retornar objeto normalizado con nombre SIEMPRE como string
      return { 
        name: String(name), // Asegurar que sea string
        identification: identification,
        basicSalary: basicSalary,
        workHoursPerMonth: workHoursPerMonth,
        basicSalaryPerDay: basicSalaryPerDay,
        contractType: contractType
      };
    });
    const names = normalizedTechs.map(t => t.name);
    const opts = normalizedTechs.map(t => `<option value="${htmlEscape(t.name)}">${htmlEscape(t.name)}${t.identification ? ' (' + htmlEscape(t.identification) + ')' : ''}</option>`).join('');
    
    // Actualizar selects de técnicos
    const techSel = document.getElementById('pl-technicianSel');
    if (techSel) techSel.innerHTML = '<option value="">Seleccione técnico…</option>' + opts;
    const techSel2 = document.getElementById('pa-technicianSel');
    if (techSel2) {
      techSel2.innerHTML = '<option value="">Seleccione técnico…</option>' + opts;
      // Si ya había un técnico seleccionado, mantenerlo
      const currentValue = techSel2.value;
      if (currentValue && names.includes(currentValue)) {
        techSel2.value = currentValue;
      }
    }
    
    // Render listado de técnicos con mejor diseño
    const listEl = document.getElementById('tk-list');
    if (listEl) {
      if (normalizedTechs.length === 0) {
        listEl.innerHTML = '<div class="text-center py-3 px-3 text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay técnicos registrados. Crea el primero arriba.</div>';
      } else {
        listEl.innerHTML = normalizedTechs.map(t => {
          const identificationText = t.identification ? ` <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">(${htmlEscape(t.identification)})</span>` : '';
          return `<div class="technician-chip inline-flex items-center gap-2 bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 border border-blue-500/30 dark:border-blue-500/30 theme-light:border-blue-300 text-white dark:text-white theme-light:text-slate-900 px-3 py-2 rounded-lg text-sm font-medium">
            <span>👤 ${htmlEscape(t.name)}${identificationText}</span>
            <button class="x-edit bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/30 dark:hover:bg-blue-600/30 theme-light:bg-blue-50 theme-light:hover:bg-blue-100 border border-blue-600/30 dark:border-blue-600/30 theme-light:border-blue-300 text-blue-400 dark:text-blue-400 theme-light:text-blue-600 px-2 py-0.5 rounded text-xs font-semibold transition-all duration-200 cursor-pointer" 
              data-name="${htmlEscape(t.name)}" 
              data-identification="${htmlEscape(t.identification || '')}"
              data-basic-salary="${t.basicSalary !== null && t.basicSalary !== undefined ? t.basicSalary : ''}"
              data-work-hours="${t.workHoursPerMonth !== null && t.workHoursPerMonth !== undefined ? t.workHoursPerMonth : ''}"
              data-salary-per-day="${t.basicSalaryPerDay !== null && t.basicSalaryPerDay !== undefined ? t.basicSalaryPerDay : ''}"
              data-contract-type="${htmlEscape(t.contractType || '')}"
              title="Editar técnico">
              ✏️ Editar
            </button>
            <button class="x-del bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/30 dark:hover:bg-red-600/30 theme-light:bg-red-50 theme-light:hover:bg-red-100 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 text-red-400 dark:text-red-400 theme-light:text-red-600 px-2 py-0.5 rounded text-xs font-semibold transition-all duration-200 cursor-pointer" data-name="${htmlEscape(t.name)}" title="Eliminar técnico">
              🗑️ Eliminar
            </button>
          </div>`;
        }).join('');
        
        // Agregar event listeners para editar
        listEl.querySelectorAll('.x-edit').forEach(btn => {
          btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name');
            const currentIdentification = btn.getAttribute('data-identification') || '';
            const basicSalary = btn.getAttribute('data-basic-salary') || '';
            const workHoursPerMonth = btn.getAttribute('data-work-hours') || '';
            const basicSalaryPerDay = btn.getAttribute('data-salary-per-day') || '';
            const contractType = btn.getAttribute('data-contract-type') || '';
            if (!name) return;
            
            // Mostrar modal para editar
            showEditTechnicianModal(name, currentIdentification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType);
          });
        });
        
        // Agregar event listeners para eliminar
        listEl.querySelectorAll('.x-del').forEach(btn => {
          btn.addEventListener('click', async () => {
            const name = btn.getAttribute('data-name');
            if (!name) return;
            
            // Confirmar eliminación
            if (!confirm(`¿Estás seguro de eliminar el técnico "${name}"?\n\n⚠️ Esta acción eliminará:\n- El técnico de la lista\n- Todas sus asignaciones personalizadas\n\nEsta acción no se puede deshacer.`)) {
              return;
            }
            
            try {
              btn.disabled = true;
              btn.textContent = 'Eliminando...';
              await api.del('/api/v1/company/technicians/' + encodeURIComponent(name));
              
              // Si este técnico estaba seleccionado, limpiar selección
              const techSel2 = document.getElementById('pa-technicianSel');
              if (techSel2 && techSel2.value === name) {
                techSel2.value = '';
                el('pa-list').innerHTML = '<div class="p-4 text-center border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Selecciona un técnico para ver sus asignaciones personalizadas.</div>';
              }
              
              // Limpiar también el selector de liquidaciones si está seleccionado
              const techSel3 = document.getElementById('pl-technicianSel');
              if (techSel3 && techSel3.value === name) {
                techSel3.value = '';
                const conceptsContainer = document.getElementById('pl-concepts-container');
                if (conceptsContainer) {
                  conceptsContainer.innerHTML = '<div class="w-full text-center text-xs py-2 px-2 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Selecciona período y técnico primero</div>';
                }
              }
              
              await loadTechnicians();
            } catch (err) {
              console.error('Error eliminando técnico:', err);
              alert('❌ Error al eliminar técnico: ' + (err.message || 'Error desconocido'));
              btn.disabled = false;
              btn.textContent = '🗑️ Eliminar';
            }
          });
        });
      }
    }
  } catch (err) {
    console.error('Error loading technicians:', err);
    const listEl = document.getElementById('tk-list');
    if (listEl) {
      listEl.innerHTML = `<div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600 text-sm">
        ❌ Error al cargar técnicos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function loadOpenPeriods(){
  try {
    const list = await api.get('/api/v1/payroll/periods/open');
    const sel = document.getElementById('pl-periodSel');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccione período…</option>' + list.map(p => {
        const start = new Date(p.startDate).toLocaleDateString('es-CO');
        const end = new Date(p.endDate).toLocaleDateString('es-CO');
        return `<option value="${p._id}">${start} → ${end}</option>`;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading open periods:', err);
  }
}

async function loadAllPeriods(){
  try {
    const list = await api.get('/api/v1/payroll/periods');
    const container = document.getElementById('ppd-list');
    if (!container) return;
    
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="text-center py-6 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay períodos creados. Crea el primero arriba.</div>';
      return;
    }
    
    // Mapear tipos a español
    const typeLabels = {
      'monthly': { label: 'Mensual', icon: '📅' },
      'biweekly': { label: 'Quincenal', icon: '📆' },
      'weekly': { label: 'Semanal', icon: '🗓️' }
    };
    
    const rows = list.map(p => {
      const typeInfo = typeLabels[p.periodType] || { label: p.periodType, icon: '📅' };
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      const startStr = start.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endStr = end.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      
      const statusBadge = p.status === 'open' 
        ? '<span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);">Abierto</span>'
        : '<span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;background:rgba(107,114,128,0.1);color:#6b7280;border:1px solid rgba(107,114,128,0.3);">Cerrado</span>';
      
      return `<div class="period-row p-3 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200 hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-3 items-center flex-1 min-w-[200px]">
            ${statusBadge}
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                ${typeInfo.icon} ${htmlEscape(typeInfo.label)} · ${days} días
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                ${startStr} → ${endStr}
              </div>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
              ID: <code class="text-xs bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 px-1.5 py-0.5 rounded text-white dark:text-white theme-light:text-slate-900">${String(p._id).slice(-8)}</code>
            </div>
            ${p.status === 'open' ? `<button class="x-close-period px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300 cursor-pointer" data-id="${p._id}" title="Cerrar período">🔒 Cerrar</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    
    container.innerHTML = rows;
    
    // Agregar event listeners para cerrar períodos
    container.querySelectorAll('.x-close-period').forEach(btn => {
      btn.addEventListener('click', async () => {
        const periodId = btn.getAttribute('data-id');
        if (!periodId) return;
        
        const period = list.find(p => String(p._id) === periodId);
        if (!period) return;
        
        const start = new Date(period.startDate).toLocaleDateString('es-CO');
        const end = new Date(period.endDate).toLocaleDateString('es-CO');
        
        if (!confirm(`¿Cerrar el período ${start} → ${end}?\n\n⚠️ Una vez cerrado, no podrás crear liquidaciones para este período.`)) {
          return;
        }
        
        try {
          btn.disabled = true;
          btn.textContent = 'Cerrando...';
          
          await api.patch(`/api/v1/payroll/periods/${periodId}/close`);
          
          // Recargar períodos y actualizar select
          await Promise.all([loadAllPeriods(), loadOpenPeriods()]);
        } catch (err) {
          alert('❌ Error al cerrar período: ' + (err.message || 'Error desconocido'));
          btn.disabled = false;
          btn.textContent = '🔒 Cerrar';
        }
      });
    });
  } catch (err) {
    console.error('Error loading periods:', err);
    const container = document.getElementById('ppd-list');
    if (container) {
      container.innerHTML = `<div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600 text-sm">
        ❌ Error al cargar períodos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function loadAssignments(){
  try {
    const techName = document.getElementById('pa-technicianSel')?.value;
    if (!techName) {
      el('pa-list').innerHTML = '<div class="p-4 text-center border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Selecciona un técnico para ver sus asignaciones personalizadas.</div>';
      return;
    }
    
    const [assignments, concepts] = await Promise.all([
      api.get('/api/v1/payroll/assignments', { technicianName: techName }),
      api.get('/api/v1/payroll/concepts')
    ]);
    
    // Crear mapa de conceptos para buscar nombres
    const conceptMap = new Map();
    concepts.forEach(c => conceptMap.set(String(c._id), c));
    
    const container = el('pa-list');
    if (!container) return;
    
    if (!assignments || assignments.length === 0) {
      container.innerHTML = `<div class="p-4 text-center border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
        <strong class="text-white dark:text-white theme-light:text-slate-900">${htmlEscape(techName)}</strong> no tiene asignaciones personalizadas.<br/>
        <span class="text-xs">Usará los valores por defecto de los conceptos.</span>
      </div>`;
      return;
    }
    
    // Renderizar asignaciones con mejor formato
    const rows = assignments.map(a => {
      const concept = conceptMap.get(String(a.conceptId));
      const conceptName = concept ? concept.name : `Concepto ${a.conceptId}`;
      const conceptCode = concept ? concept.code : '';
      const conceptType = concept ? concept.type : '';
      const defaultValue = concept ? concept.defaultValue : 0;
      const amountType = concept ? concept.amountType : 'fixed';
      const overrideValue = a.valueOverride;
      
      // Determinar valor mostrado
      let valueDisplay = '—';
      if (overrideValue !== null && overrideValue !== undefined) {
        if (amountType === 'percent') {
          valueDisplay = `${overrideValue}%`;
        } else {
          valueDisplay = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(overrideValue);
        }
      }
      
      // Tipo de concepto
      const typeLabels = {
        'earning': { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
        'deduction': { label: 'Descuento', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
        'surcharge': { label: 'Recargo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
      };
      const typeInfo = typeLabels[conceptType] || { label: conceptType, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
      
      // Valor por defecto para comparar
      let defaultDisplay = '—';
      if (concept) {
        if (amountType === 'percent') {
          defaultDisplay = `${defaultValue}%`;
        } else {
          defaultDisplay = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(defaultValue);
        }
      }
      
      return `<div class="assignment-row p-3 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200 hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-3 items-center flex-1 min-w-[200px]">
            <span class="concept-badge px-2.5 py-1 rounded-md text-xs font-semibold uppercase" style="background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}40;">
              ${htmlEscape(typeInfo.label)}
            </span>
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-xs mr-1.5">${htmlEscape(conceptCode)}</span>
                ${htmlEscape(conceptName)}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                Valor por defecto: <strong class="text-white dark:text-white theme-light:text-slate-900">${defaultDisplay}</strong>
              </div>
            </div>
          </div>
          <div class="flex gap-4 items-center">
            <div class="text-right">
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-0.5">Valor personalizado:</div>
              <div class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900">${valueDisplay}</div>
            </div>
            <button class="x-del-assignment px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300 cursor-pointer" data-id="${a._id}" data-concept-id="${a.conceptId}" title="Eliminar asignación">
              🗑️
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
    
    container.innerHTML = `
      <div class="mb-2">
        <h4 class="m-0 text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Asignaciones de <strong>${htmlEscape(techName)}</strong></h4>
        <p class="m-1 mt-0 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${assignments.length} asignación(es) personalizada(s)</p>
      </div>
      ${rows}
    `;
    
    // Agregar event listeners para eliminar asignaciones
    container.querySelectorAll('.x-del-assignment').forEach(btn => {
      btn.addEventListener('click', async () => {
        const assignmentId = btn.getAttribute('data-id');
        const conceptId = btn.getAttribute('data-concept-id');
        const concept = conceptMap.get(conceptId);
        const conceptName = concept ? concept.name : 'este concepto';
        
        if (!confirm(`¿Eliminar la asignación personalizada de "${conceptName}" para ${htmlEscape(techName)}?\n\nEl técnico usará el valor por defecto del concepto.`)) {
          return;
        }
        
        try {
          btn.disabled = true;
          btn.textContent = '...';
          
          // Buscar la asignación para obtener datos completos
          const assignment = assignments.find(a => String(a._id) === assignmentId);
          if (assignment) {
            await api.del('/api/v1/payroll/assignments', {
              technicianName: techName,
              conceptId: conceptId
            });
          }
          
          await loadAssignments();
        } catch (err) {
          alert('❌ Error al eliminar asignación: ' + (err.message || 'Error desconocido'));
          btn.disabled = false;
          btn.textContent = '🗑️';
        }
      });
    });
  } catch (err) {
    console.error('Error loading assignments:', err);
    const container = el('pa-list');
    if (container) {
      container.innerHTML = `<div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600 text-sm">
        ❌ Error al cargar asignaciones: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function saveAssignment(){
  try {
    const technicianName = document.getElementById('pa-technicianSel')?.value?.trim();
    const conceptId = document.getElementById('pa-conceptSel')?.value?.trim();
    const valueStr = (el('pa-value')?.value || '').trim();
    
    // Validaciones
    if (!technicianName) {
      alert('⚠️ Selecciona un técnico');
      document.getElementById('pa-technicianSel')?.focus();
      return;
    }
    if (!conceptId) {
      alert('⚠️ Selecciona un concepto');
      document.getElementById('pa-conceptSel')?.focus();
      return;
    }
    
    // Si no hay valor, usar null para eliminar la asignación personalizada
    let valueOverride = null;
    if (valueStr) {
      const parsed = parseFloat(valueStr);
      if (isNaN(parsed) || parsed < 0) {
        alert('⚠️ El valor debe ser un número positivo');
        el('pa-value')?.focus();
        return;
      }
      valueOverride = parsed;
    }
    
    const payload = {
      technicianName,
      conceptId,
      valueOverride,
      isActive: true
    };
    
    // Deshabilitar botón durante la petición
    const btn = el('pa-save');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando...';
    }
    
    try {
      await api.post('/api/v1/payroll/assignments', payload);
      
      // Limpiar campo de valor
      el('pa-value').value = '';
      
      // Recargar asignaciones
      await loadAssignments();
      
      // Feedback visual
      if (btn) {
        btn.textContent = '✓ Guardado';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 1500);
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      alert('❌ Error al guardar asignación: ' + errorMsg);
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch (err) {
    console.error('Error in saveAssignment:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

// Variable global para almacenar valores editados de préstamos
let editedLoanPayments = {};

// Variable global para almacenar comisiones calculadas
let calculatedCommissions = {};

// Función para cargar conceptos asignados al técnico seleccionado
async function loadConceptsForTechnician(){
  try {
    const technicianName = document.getElementById('pl-technicianSel')?.value?.trim();
    const periodId = document.getElementById('pl-periodSel')?.value?.trim();
    const container = document.getElementById('pl-concepts-container');
    if (!container) return;
    
    if (!technicianName || !periodId) {
      container.innerHTML = '<div class="grid-column-[1/-1] text-center text-xs py-4 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Selecciona período y técnico primero</div>';
      return;
    }
    
    // Obtener asignaciones del técnico
    const assignments = await api.get('/api/v1/payroll/assignments', { technicianName });
    
    // Obtener préstamos pendientes del técnico
    let pendingLoans = [];
    try {
      // Asegurar que el nombre del técnico esté en mayúsculas para la búsqueda
      const techNameUpper = technicianName.toUpperCase();
      const loansData = await API.cashflow.loans.list({ technicianName: techNameUpper, status: 'pending,partially_paid' });
      console.log('Loans data for', techNameUpper, ':', loansData);
      pendingLoans = (loansData.items || []).filter(l => {
        const pending = l.amount - (l.paidAmount || 0);
        return pending > 0;
      });
      console.log('Pending loans after filter:', pendingLoans);
    } catch (err) {
      console.error('Error loading loans:', err);
    }
    
    // Obtener comisiones del período (preview temporal para calcular comisiones)
    let commissionTotal = 0;
    let commissionDetails = [];
    try {
      const previewData = await api.post('/api/v1/payroll/settlements/preview', {
        periodId,
        technicianName,
        selectedConceptIds: [] // Sin conceptos, solo para calcular comisiones
      });
      commissionTotal = previewData.grossTotal || 0;
      // Extraer items de comisión del preview
      commissionDetails = (previewData.items || []).filter(i => 
        i.calcRule && (i.calcRule.startsWith('laborPercent') || i.calcRule === 'sales.laborCommissions')
      );
      calculatedCommissions[technicianName] = {
        total: commissionTotal,
        details: commissionDetails
      };
    } catch (err) {
      console.error('Error calculating commissions:', err);
    }
    
    // Obtener los conceptos de las asignaciones
    const conceptIds = assignments.map(a => a.conceptId).filter(Boolean);
    let assignedConcepts = [];
    
    if (conceptIds.length > 0) {
    // Obtener detalles de los conceptos
    const allConcepts = await api.get('/api/v1/payroll/concepts');
      assignedConcepts = allConcepts.filter(c => conceptIds.some(id => String(id) === String(c._id)));
    }
    
    // Si no hay conceptos, préstamos ni comisiones
    if (assignedConcepts.length === 0 && pendingLoans.length === 0 && commissionTotal === 0) {
      container.innerHTML = '<div class="grid-column-[1/-1] text-center text-xs py-4 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Este técnico no tiene conceptos asignados, préstamos pendientes ni comisiones en el período.</div>';
      return;
    }
    
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    const typeLabels = {
      'earning': { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      'deduction': { label: 'Descuento', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      'surcharge': { label: 'Recargo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
    };
    
    let html = '';
    
    // Renderizar comisiones como concepto seleccionable
    if (commissionTotal > 0) {
      const storedCommission = editedLoanPayments[`${technicianName}_commission`] || commissionTotal;
      html += `<div class="concept-card commission-card p-3 border-2 border-blue-500 dark:border-blue-500 theme-light:border-blue-400 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200">
        <label class="flex items-center gap-2.5 cursor-pointer mb-2.5">
          <input type="checkbox" value="COMMISSION" data-commission-concept="true" class="cursor-pointer w-[18px] h-[18px] m-0" />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/10 dark:bg-green-500/10 theme-light:bg-green-50 text-green-500 dark:text-green-400 theme-light:text-green-700 border border-green-500 dark:border-green-500 theme-light:border-green-300">
                Ingreso
              </span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 text-blue-500 dark:text-blue-400 theme-light:text-blue-700 border border-blue-500 dark:border-blue-500 theme-light:border-blue-300">💰 Comisiones</span>
            </div>
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-sm mb-0.5">Participación por ventas</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">${commissionDetails.length} participación(es) · Total calculado: ${formatMoney(commissionTotal)}</div>
          </div>
        </label>
        <div class="flex gap-2 items-center flex-wrap">
          <label class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-nowrap">Monto a liquidar:</label>
          <input type="number" 
                 id="commission-amount" 
                 data-technician="${technicianName}"
                 data-max="${commissionTotal}"
                 min="0" 
                 max="${commissionTotal}" 
                 step="1" 
                 value="${storedCommission}"
                 class="w-[140px] px-2.5 py-1.5 border-2 border-blue-500 dark:border-blue-500 theme-light:border-blue-400 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onchange="saveCommissionAmount('${technicianName}')" />
          <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-nowrap">Máx: ${formatMoney(commissionTotal)}</span>
        </div>
      </div>`;
    }
    
    // Renderizar conceptos normales con tarjetas bonitas
    assignedConcepts.forEach(c => {
      const assignment = assignments.find(a => String(a.conceptId) === String(c._id));
      const displayValue = assignment?.valueOverride !== null && assignment?.valueOverride !== undefined 
        ? (c.amountType === 'percent' ? `${assignment.valueOverride}%` : formatMoney(assignment.valueOverride))
        : (c.amountType === 'percent' 
          ? `${c.defaultValue || 0}%` 
          : formatMoney(c.defaultValue || 0));
      
      const typeInfo = typeLabels[c.type] || { label: c.type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
      const overrideBadge = assignment?.valueOverride !== null && assignment?.valueOverride !== undefined 
        ? '<span style="padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;background:rgba(59,130,246,0.1);color:#3b82f6;border:1px solid #3b82f6;">Personalizado</span>'
        : '';
      
      const isVariable = c.isVariable || false;
      const variableBadge = isVariable 
        ? '<span style="padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;background:rgba(139,92,246,0.1);color:#8b5cf6;border:1px solid #8b5cf6;">🔧 Variable</span>'
        : '';
      
      // Los conceptos variables no se pueden editar desde la liquidación, solo se muestran
      
      html += `<div class="concept-card ${isVariable ? 'variable-concept-card' : ''} p-3 border-2 ${isVariable ? 'border-purple-500/30 dark:border-purple-500/30 theme-light:border-purple-300' : 'border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300'} rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 theme-light:hover:border-blue-400 hover:-translate-y-0.5 hover:shadow-lg">
        <label class="flex items-center gap-2.5 cursor-pointer m-0">
          <input type="checkbox" value="${c._id}" data-concept-id="${c._id}" data-is-variable="${isVariable}" class="cursor-pointer w-[18px] h-[18px] m-0" />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="px-2.5 py-1 rounded-md text-xs font-semibold" style="background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}40;">
          ${htmlEscape(typeInfo.label)}
        </span>
        ${overrideBadge}
              ${variableBadge}
            </div>
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-sm mb-0.5">${htmlEscape(c.code)} · ${htmlEscape(c.name)}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${displayValue}${isVariable ? ` · Completa hasta ${formatMoney(c.variableFixedAmount || 0)}` : ''}</div>
          </div>
        </label>
      </div>`;
    });
    
    // Renderizar préstamos pendientes como concepto especial editable
    if (pendingLoans.length > 0) {
      const totalPending = pendingLoans.reduce((sum, l) => sum + (l.amount - (l.paidAmount || 0)), 0);
      const loanCardId = 'loan-payment-card';
      const storedValue = editedLoanPayments[technicianName] || totalPending;
      
      html += `<div class="concept-card loan-card p-3 border-2 border-blue-500 dark:border-blue-500 theme-light:border-blue-400 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200" id="${loanCardId}">
        <label class="flex items-center gap-2.5 cursor-pointer mb-2.5 m-0">
          <input type="checkbox" value="LOAN_PAYMENT" data-loan-concept="true" class="cursor-pointer w-[18px] h-[18px] m-0" />
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/10 dark:bg-red-500/10 theme-light:bg-red-50 text-red-500 dark:text-red-400 theme-light:text-red-700 border border-red-500 dark:border-red-500 theme-light:border-red-300">
                Descuento
              </span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 text-blue-500 dark:text-blue-400 theme-light:text-blue-700 border border-blue-500 dark:border-blue-500 theme-light:border-blue-300">💰 Préstamos</span>
            </div>
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-sm mb-0.5">Pago préstamos</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">${pendingLoans.length} préstamo(s) pendiente(s) · Total pendiente: ${formatMoney(totalPending)}</div>
          </div>
        </label>
        <div class="flex gap-2 items-center flex-wrap">
          <label class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-nowrap">Monto a pagar:</label>
          <input type="number" 
                 id="loan-payment-amount" 
                 data-technician="${technicianName}"
                 data-max="${totalPending}"
                 min="0" 
                 max="${totalPending}" 
                 step="1" 
                 value="${storedValue}"
                 class="w-[140px] px-2.5 py-1.5 border-2 border-blue-500 dark:border-blue-500 theme-light:border-blue-400 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                 onchange="saveLoanPaymentAmount('${technicianName}')" />
          <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-nowrap">Máx: ${formatMoney(totalPending)}</span>
        </div>
      </div>`;
    }
    
    container.innerHTML = html;
    
    // Agregar event listeners a los checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        // No se necesita lógica especial para conceptos variables
      });
    });
  } catch (err) {
    console.error('Error loading assigned concepts:', err);
    const container = document.getElementById('pl-concepts-container');
    if (container) {
      container.innerHTML = '<div class="text-red-500 dark:text-red-400 theme-light:text-red-600 text-xs py-2 px-2 grid-column-[1/-1]">Error al cargar conceptos asignados</div>';
    }
  }
}

// Función para guardar el monto editado del préstamo (desde la lista de conceptos)
window.saveLoanPaymentAmount = function(technicianName) {
  const input = document.getElementById('loan-payment-amount');
  if (!input) return;
  
  const amount = Math.max(0, Math.min(Number(input.value) || 0, Number(input.dataset.max) || 0));
  input.value = amount;
  editedLoanPayments[technicianName] = amount;
  
  // Mostrar feedback visual
  const card = input.closest('.loan-card');
  if (card) {
    card.style.borderColor = '#10b981';
    setTimeout(() => {
    card.style.borderColor = '#3b82f6';
    }, 1000);
  }
};

// Función para guardar el monto editado de comisiones (desde la lista de conceptos)
window.saveCommissionAmount = function(technicianName) {
  const input = document.getElementById('commission-amount');
  if (!input) return;
  
  const amount = Math.max(0, Math.min(Number(input.value) || 0, Number(input.dataset.max) || 0));
  input.value = amount;
  editedLoanPayments[`${technicianName}_commission`] = amount;
  
  // Mostrar feedback visual
  const card = input.closest('.commission-card');
  if (card) {
    card.style.borderColor = '#10b981';
    setTimeout(() => {
    card.style.borderColor = '#3b82f6';
    }, 1000);
  }
};

// Función para guardar el monto editado del préstamo (desde el preview)
window.saveLoanPaymentFromPreview = function(loanId, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const amount = Math.max(0, Math.min(Number(input.value) || 0, Number(input.dataset.max) || 0));
  input.value = amount;
  
  // Almacenar el valor editado
  if (!editedLoanPayments.preview) {
    editedLoanPayments.preview = {};
  }
  editedLoanPayments.preview[loanId] = amount;
  
  // Mostrar feedback visual
  const card = input.closest('[data-loan-id]');
  if (card) {
    const originalBorder = card.style.borderColor || 'rgba(148, 163, 184, 0.5)';
    card.style.borderColor = '#10b981';
    setTimeout(() => {
      card.style.borderColor = originalBorder;
    }, 1000);
  }
  
  // Actualizar totales
  if (typeof updateLoanPaymentTotal === 'function') {
    updateLoanPaymentTotal();
  }
};

// Obtener conceptos seleccionados
function getSelectedConceptIds(){
  const container = document.getElementById('pl-concepts-container');
  if (!container) return [];
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  // Incluir VARIABLE, COMMISSION y LOAN_PAYMENT como strings especiales, filtrar solo valores vacíos
  return Array.from(checkboxes).map(cb => cb.value).filter(id => id);
}

// Obtener comisiones configuradas para el técnico
function getCommissionForTechnician(technicianName) {
  const commissionCheckbox = document.querySelector('input[data-commission-concept="true"]');
  if (!commissionCheckbox || !commissionCheckbox.checked) {
    return null;
  }
  
  const input = document.getElementById('commission-amount');
  if (!input) return null;
  
  const amount = editedLoanPayments[`${technicianName}_commission`] || Number(input.value) || 0;
  return amount > 0 ? amount : null;
}

// Obtener préstamos configurados para el técnico
function getLoanPaymentsForTechnician(technicianName) {
  const loanCheckbox = document.querySelector('input[data-loan-concept="true"]');
  if (!loanCheckbox || !loanCheckbox.checked) {
    return [];
  }
  
  // Obtener el monto editado o usar el máximo disponible
  const input = document.getElementById('loan-payment-amount');
  if (!input) return [];
  
  const amount = editedLoanPayments[technicianName] || Number(input.value) || 0;
  if (amount <= 0) return [];
  
  // Retornar un array especial que el backend procesará
  return [{ technicianName, totalAmount: amount }];
}

async function preview(){
  try {
    const periodId = document.getElementById('pl-periodSel')?.value?.trim();
    const technicianName = document.getElementById('pl-technicianSel')?.value?.trim();
    let selectedConceptIds = getSelectedConceptIds();
    
    // Validaciones
    if (!periodId) {
      alert('⚠️ Selecciona un período');
      document.getElementById('pl-periodSel')?.focus();
      return;
    }
    
    if (!technicianName) {
      alert('⚠️ Selecciona un técnico');
      document.getElementById('pl-technicianSel')?.focus();
      return;
    }
    
    // Verificar si se seleccionaron comisiones o préstamos
    const commissionSelected = document.querySelector('input[data-commission-concept="true"]:checked');
    const loanSelected = document.querySelector('input[data-loan-concept="true"]:checked');
    
    if (selectedConceptIds.length === 0 && !commissionSelected && !loanSelected) {
      alert('⚠️ Selecciona al menos un concepto, comisión o préstamo para aplicar');
      return;
    }
    
    // Agregar comisiones y préstamos a los conceptos seleccionados si están marcados
    if (commissionSelected) {
      selectedConceptIds.push('COMMISSION');
      // Asegurar que el valor editado de comisiones se guarde antes de hacer preview
      const commissionInput = document.getElementById('commission-amount');
      if (commissionInput) {
        const amount = Math.max(0, Math.min(Number(commissionInput.value) || 0, Number(commissionInput.dataset.max) || 0));
        commissionInput.value = amount;
        editedLoanPayments[`${technicianName}_commission`] = amount;
      }
    }
    if (loanSelected) {
      selectedConceptIds.push('LOAN_PAYMENT');
      // Asegurar que el valor editado del préstamo se guarde antes de hacer preview
      const loanInput = document.getElementById('loan-payment-amount');
      if (loanInput) {
        const amount = Math.max(0, Math.min(Number(loanInput.value) || 0, Number(loanInput.dataset.max) || 0));
        loanInput.value = amount;
        editedLoanPayments[technicianName] = amount;
      }
    }
    
    const payload = {
      periodId,
      technicianName,
      selectedConceptIds,
      commissionAmount: commissionSelected ? getCommissionForTechnician(technicianName) : null,
      loanPayments: loanSelected ? getLoanPaymentsForTechnician(technicianName) : []
    };
    
    // Deshabilitar botones durante la petición
    const previewBtn = el('pl-preview');
    const approveBtn = el('pl-approve');
    const originalPreviewText = previewBtn?.textContent || '';
    if (previewBtn) {
      previewBtn.disabled = true;
      previewBtn.textContent = 'Calculando...';
    }
    if (approveBtn) approveBtn.disabled = true;
    
    try {
      const r = await api.post('/api/v1/payroll/settlements/preview', payload);
      
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
      
      const typeLabels = {
        'earning': { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
        'deduction': { label: 'Descuento', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
        'surcharge': { label: 'Recargo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
      };
      
      // Separar items por tipo
      const earnings = r.items.filter(i => i.type === 'earning');
      const deductions = r.items.filter(i => i.type === 'deduction');
      const surcharges = r.items.filter(i => i.type === 'surcharge');
      
      // Debug: verificar préstamos
      const loanItems = deductions.filter(i => i.calcRule === 'employee_loan');
      if (loanItems.length > 0) {
        console.log('Préstamos encontrados:', loanItems.map(i => ({
          name: i.name,
          calcRule: i.calcRule,
          loanId: i.loanId,
          loanPending: i.loanPending,
          value: i.value
        })));
      }
      
      const renderItems = (items, title) => {
        if (!items || items.length === 0) return '';
        return `
          <div class="mb-4">
            <h4 class="m-0 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">${title}</h4>
            ${items.map((i, idx) => {
              const typeInfo = typeLabels[i.type] || { label: i.type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
              const itemId = `item-${idx}-${i.loanId || i.conceptId || 'other'}`;
              
              return `<div class="flex items-center justify-between p-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md mb-1.5 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white">
                <div class="flex-1">
                  <div class="flex gap-2.5 items-center mb-${i.notes ? '1' : '0'}">
                  <span class="px-2 py-0.5 rounded text-xs font-semibold" style="background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}40;">
                    ${htmlEscape(typeInfo.label)}
                  </span>
                  <span class="font-medium text-white dark:text-white theme-light:text-slate-900">${htmlEscape(i.name)}</span>
                  ${i.calcRule ? `<span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">(${htmlEscape(i.calcRule)})</span>` : ''}
                  </div>
                  ${i.notes ? `<div class="text-xs mt-1 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${htmlEscape(i.notes)}</div>` : ''}
                </div>
                <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-sm">
                  ${formatMoney(i.value)}
                </div>
              </div>`;
            }).join('')}
          </div>`;
      };
      
      // Función para actualizar totales cuando se cambia el monto de un préstamo
      window.updateLoanPaymentTotal = function() {
        const loanInputs = document.querySelectorAll('.loan-payment-input');
        let totalLoanDeduction = 0;
        
        loanInputs.forEach(input => {
          const value = Math.max(0, Math.min(Number(input.value) || 0, Number(input.dataset.max) || 0));
          input.value = value;
          const loanId = input.dataset.loanId;
          const display = document.querySelector(`.loan-payment-display[data-loan-id="${loanId}"]`);
          if (display) display.textContent = formatMoney(value);
          totalLoanDeduction += value;
        });
        
        // Recalcular totales
        const earnings = r.items.filter(i => i.type === 'earning');
        const surcharges = r.items.filter(i => i.type === 'surcharge');
        const deductions = r.items.filter(i => i.type === 'deduction' && i.calcRule !== 'employee_loan');
        const otherDeductions = deductions.reduce((sum, i) => sum + (i.value || 0), 0);
        
        const grossTotal = [...earnings, ...surcharges].reduce((sum, i) => sum + (i.value || 0), 0);
        const deductionsTotal = otherDeductions + totalLoanDeduction;
        const netTotal = grossTotal - deductionsTotal;
        
        // Actualizar totales en la UI
        const grossEl = document.querySelector('[data-total="gross"]');
        const dedEl = document.querySelector('[data-total="deductions"]');
        const netEl = document.querySelector('[data-total="net"]');
        if (grossEl) grossEl.textContent = formatMoney(grossTotal);
        if (dedEl) dedEl.textContent = formatMoney(deductionsTotal);
        if (netEl) netEl.textContent = formatMoney(netTotal);
      };
      
      el('pl-result').innerHTML = `
        <div class="bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg p-4">
          <div class="mb-4 pb-4 border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
            <h4 class="m-0 mb-2 text-base font-semibold text-white dark:text-white theme-light:text-slate-900">Vista previa de liquidación</h4>
            <div class="flex gap-4 flex-wrap">
              <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                <strong>Técnico:</strong> ${htmlEscape(r.technicianName || technicianName)}
              </div>
              <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                <strong>Período:</strong> ${document.getElementById('pl-periodSel').options[document.getElementById('pl-periodSel').selectedIndex]?.textContent || 'N/A'}
              </div>
            </div>
          </div>
          
          ${renderItems(earnings, 'Ingresos')}
          ${renderItems(surcharges, 'Recargos')}
          ${renderItems(deductions, 'Descuentos')}
          
          <div class="mt-4 pt-4 border-t-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-white dark:text-white theme-light:text-slate-900">Total bruto:</span>
              <span class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-base" data-total="gross">${formatMoney(r.grossTotal)}</span>
            </div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-white dark:text-white theme-light:text-slate-900">Total descuentos:</span>
              <span class="font-semibold text-red-500 dark:text-red-400 theme-light:text-red-600 text-base" data-total="deductions">-${formatMoney(r.deductionsTotal)}</span>
            </div>
            <div class="flex items-center justify-between p-3 bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 rounded-md mt-2">
              <span class="font-bold text-white dark:text-white theme-light:text-slate-900 text-base">Neto a pagar:</span>
              <span class="font-bold text-green-500 dark:text-green-400 theme-light:text-green-600 text-xl" data-total="net">${formatMoney(r.netTotal)}</span>
            </div>
          </div>
        </div>
      `;
      
      // Restaurar botones
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.textContent = originalPreviewText;
      }
      if (approveBtn) approveBtn.disabled = false;
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      alert('❌ Error al previsualizar: ' + errorMsg);
      
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.textContent = originalPreviewText;
      }
      if (approveBtn) approveBtn.disabled = false;
    }
  } catch (err) {
    console.error('Error in preview:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

async function approve(){
  try {
    const periodId = document.getElementById('pl-periodSel')?.value?.trim();
    const technicianName = document.getElementById('pl-technicianSel')?.value?.trim();
    const selectedConceptIds = getSelectedConceptIds();
    
    // Validaciones
    if (!periodId) {
      alert('⚠️ Selecciona un período');
      document.getElementById('pl-periodSel')?.focus();
      return;
    }
    
    if (!technicianName) {
      alert('⚠️ Selecciona un técnico');
      document.getElementById('pl-technicianSel')?.focus();
      return;
    }
    
    if (selectedConceptIds.length === 0) {
      alert('⚠️ Selecciona al menos un concepto para aplicar');
      return;
    }
    
    // Recolectar pagos de préstamos y comisiones desde la configuración inicial
    const loanPayments = [];
    const commissionAmount = getCommissionForTechnician(technicianName);
    
    // Obtener préstamos desde la lista de conceptos
    const loanCheckbox = document.querySelector('input[data-loan-concept="true"]');
    if (loanCheckbox && loanCheckbox.checked) {
      const loanConfig = getLoanPaymentsForTechnician(technicianName);
      if (loanConfig.length > 0 && loanConfig[0].totalAmount > 0) {
        loanPayments.push({ technicianName, totalAmount: loanConfig[0].totalAmount });
      }
    }
    
    // Verificar si se seleccionaron comisiones o préstamos
    const commissionSelected = document.querySelector('input[data-commission-concept="true"]:checked');
    const loanSelected = document.querySelector('input[data-loan-concept="true"]:checked');
    
    // Agregar comisiones y préstamos a los conceptos seleccionados si están marcados
    if (commissionSelected) {
      selectedConceptIds.push('COMMISSION');
    }
    if (loanSelected) {
      selectedConceptIds.push('LOAN_PAYMENT');
    }
    
    // Confirmar aprobación
    const periodText = document.getElementById('pl-periodSel').options[document.getElementById('pl-periodSel').selectedIndex]?.textContent || 'este período';
    if (!confirm(`¿Aprobar la liquidación de ${technicianName} para el período ${periodText}?\n\nSe calcularán las comisiones y se aplicarán los conceptos seleccionados.`)) {
      return;
    }
    
    const payload = {
      periodId,
      technicianName,
      selectedConceptIds,
      commissionAmount, // Monto editado de comisiones
      loanPayments // Array de { technicianName, totalAmount } para préstamos
    };
    
    // Deshabilitar botones durante la petición
    const approveBtn = el('pl-approve');
    const previewBtn = el('pl-preview');
    const originalApproveText = approveBtn?.textContent || '';
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = 'Aprobando...';
    }
    if (previewBtn) previewBtn.disabled = true;
    
    try {
      const r = await api.post('/api/v1/payroll/settlements/approve', payload);
      
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
      
      el('pl-result').innerHTML = `
        <div class="p-4 bg-green-500/10 dark:bg-green-500/10 theme-light:bg-green-50 border border-green-500 dark:border-green-500 theme-light:border-green-300 rounded-lg mb-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-2xl">✓</span>
            <h4 class="m-0 text-base font-semibold text-green-500 dark:text-green-400 theme-light:text-green-600">Liquidación aprobada</h4>
          </div>
          <div class="text-sm text-white dark:text-white theme-light:text-slate-900 mb-1">
            <strong>Técnico:</strong> ${htmlEscape(r.technicianName || technicianName)}
          </div>
          <div class="text-sm text-white dark:text-white theme-light:text-slate-900 mb-1">
            <strong>Período:</strong> ${periodText}
          </div>
          <div class="text-sm text-white dark:text-white theme-light:text-slate-900 mb-1">
            <strong>Neto a pagar:</strong> ${formatMoney(r.netTotal || 0)}
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-2">
            ID: <code class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 px-1.5 py-0.5 rounded text-xs text-white dark:text-white theme-light:text-slate-900">${String(r._id).slice(-8)}</code>
          </div>
        </div>
      `;
      
      // Recargar liquidaciones
      await loadSettlements();
      
      // Restaurar botones
      if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.textContent = originalApproveText;
      }
      if (previewBtn) previewBtn.disabled = false;
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      alert('❌ Error al aprobar liquidación: ' + errorMsg);
      
      if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.textContent = originalApproveText;
      }
      if (previewBtn) previewBtn.disabled = false;
    }
  } catch (err) {
    console.error('Error in approve:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

async function loadPendingSettlements(){
  try {
    const r = await api.get('/api/v1/payroll/settlements', { status: 'approved' });
    const items = r.items || [];
    
    const container = document.getElementById('pp-pending-list');
    const select = document.getElementById('pp-settlementSel');
    if (!container || !select) return;
    
    if (items.length === 0) {
      container.innerHTML = '<div class="text-center py-4 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay liquidaciones pendientes de pago.</div>';
      select.innerHTML = '<option value="">No hay liquidaciones pendientes</option>';
      return;
    }
    
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    
    // Renderizar listado
    const rows = items.map(s => {
      const createdAt = new Date(s.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<div class="pending-settlement-row p-3 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white cursor-pointer transition-all duration-200 hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50" data-id="${s._id}" onclick="selectSettlementForPayment('${s._id}')">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-3 items-center flex-1 min-w-[200px]">
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                👤 ${htmlEscape(s.technicianName||'Sin nombre')}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                Aprobada: ${createdAt}
              </div>
            </div>
          </div>
          <div class="text-right text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            <div>Bruto: <strong class="text-white dark:text-white theme-light:text-slate-900">${formatMoney(s.grossTotal)}</strong></div>
            <div>Desc: <strong class="text-red-500 dark:text-red-400 theme-light:text-red-600">-${formatMoney(s.deductionsTotal)}</strong></div>
            <div class="mt-1 text-base font-bold text-green-500 dark:text-green-400 theme-light:text-green-600">Neto: ${formatMoney(s.netTotal)}</div>
          </div>
        </div>
      </div>`;
    }).join('');
    
    container.innerHTML = rows;
    
    // Poblar select
    select.innerHTML = '<option value="">Seleccione liquidación…</option>' + items.map(s => {
      const techName = s.technicianName || 'Sin nombre';
      const netTotal = formatMoney(s.netTotal);
      const paidAmount = s.paidAmount || 0;
      return `<option value="${s._id}" data-net="${s.netTotal}" data-paid="${paidAmount}">${htmlEscape(techName)} - ${netTotal}${paidAmount > 0 ? ` (Pagado: ${formatMoney(paidAmount)})` : ''}</option>`;
    }).join('');
    
    // Event listener para cambiar selección (remover listener anterior si existe)
    const existingListener = select.dataset.listenerAttached;
    if (!existingListener) {
      select.addEventListener('change', () => {
        updateSettlementInfo();
      });
      select.dataset.listenerAttached = 'true';
    }
  } catch (err) {
    console.error('Error loading pending settlements:', err);
    const container = document.getElementById('pp-pending-list');
    if (container) {
      container.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
        ❌ Error al cargar liquidaciones: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function loadCashFlowAccounts(){
  try {
    const list = await api.get('/api/v1/cashflow/accounts');
    const select = document.getElementById('pp-accountSel');
    if (!select) return;
    
    if (!list || list.length === 0) {
      select.innerHTML = '<option value="">No hay cuentas disponibles</option>';
      return;
    }
    
    select.innerHTML = '<option value="">Seleccione cuenta…</option>' + list.map(a => {
      const typeLabel = a.type === 'CASH' ? '💵 Efectivo' : '🏦 Banco';
      return `<option value="${a._id}">${typeLabel} - ${htmlEscape(a.name)}</option>`;
    }).join('');
  } catch (err) {
    console.error('Error loading accounts:', err);
    const select = document.getElementById('pp-accountSel');
    if (select) {
      select.innerHTML = '<option value="">Error al cargar cuentas</option>';
    }
  }
}

// Exportar función para uso global desde onclick en HTML
window.selectSettlementForPayment = function(settlementId){
  const select = document.getElementById('pp-settlementSel');
  if (select) {
    select.value = settlementId;
    updateSettlementInfo();
  }
};

// Variable global para almacenar los pagos parciales
let partialPayments = [];
let currentSettlementNetTotal = 0;
let currentSettlementPaidAmount = 0;

function updateSettlementInfo(){
  const select = document.getElementById('pp-settlementSel');
  const infoEl = document.getElementById('pp-settlement-info');
  const paymentsContainer = document.getElementById('pp-payments-container');
  const dateInput = document.getElementById('pp-date');
  if (!select || !infoEl) return;
  
  const selectedOption = select.options[select.selectedIndex];
  if (!selectedOption || !selectedOption.value) {
    infoEl.style.display = 'none';
    if (paymentsContainer) paymentsContainer.style.display = 'none';
    if (dateInput) dateInput.value = '';
    partialPayments = [];
    currentSettlementNetTotal = 0;
    currentSettlementPaidAmount = 0;
    return;
  }
  
  // Autocompletar fecha y hora actual
  if (dateInput) {
    const now = new Date();
    // Formato para datetime-local: YYYY-MM-DDTHH:mm
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  const netTotal = Number(selectedOption.dataset.net || '0');
  const paidAmount = Number(selectedOption.dataset.paid || '0');
  currentSettlementNetTotal = netTotal;
  currentSettlementPaidAmount = paidAmount;
  const remainingAmount = netTotal - paidAmount;
  
  const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
  
  // Limpiar pagos anteriores
  partialPayments = [];
  
  infoEl.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xl">💰</span>
      <div class="flex-1">
        <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">Liquidación seleccionada</div>
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
          Monto total: <strong class="text-green-500 dark:text-green-400 theme-light:text-green-600 text-sm">${formatMoney(netTotal)}</strong>
          ${paidAmount > 0 ? ` · Pagado: ${formatMoney(paidAmount)}` : ''}
          ${remainingAmount > 0 ? ` · Restante: <strong class="text-yellow-500 dark:text-yellow-400 theme-light:text-yellow-600">${formatMoney(remainingAmount)}</strong>` : ''}
        </div>
      </div>
    </div>
  `;
  infoEl.style.display = 'block';
  
  // Mostrar contenedor de pagos parciales
  if (paymentsContainer) {
    paymentsContainer.style.display = remainingAmount > 0 ? 'block' : 'none';
    updatePaymentsList();
    updatePaymentsSummary();
  }
}

// Función para agregar un pago parcial
window.addPayment = function() {
  const paymentId = `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  partialPayments.push({
    id: paymentId,
    accountId: '',
    amount: 0
  });
  updatePaymentsList();
  updatePaymentsSummary();
};

// Función para eliminar un pago parcial
window.removePayment = function(paymentId) {
  partialPayments = partialPayments.filter(p => p.id !== paymentId);
  updatePaymentsList();
  updatePaymentsSummary();
};

// Función para actualizar un pago parcial
window.updatePayment = function(paymentId, field, value) {
  const payment = partialPayments.find(p => p.id === paymentId);
  if (payment) {
    if (field === 'accountId') {
      payment.accountId = value;
    } else if (field === 'amount') {
      payment.amount = Math.max(0, Number(value) || 0);
    }
    updatePaymentsSummary();
  }
};

// Función para actualizar la lista de pagos
async function updatePaymentsList() {
  const listContainer = document.getElementById('pp-payments-list');
  if (!listContainer) return;
  
  const remainingAmount = currentSettlementNetTotal - currentSettlementPaidAmount;
  const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
  
  if (partialPayments.length === 0) {
    listContainer.innerHTML = '<div class="text-center py-3 px-3 text-xs border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-md text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay pagos agregados. Haz clic en "Agregar pago" para comenzar.</div>';
    return;
  }
  
  // Cargar cuentas disponibles
  let accounts = [];
  try {
    accounts = await api.get('/api/v1/cashflow/accounts');
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
  
  listContainer.innerHTML = partialPayments.map((payment, index) => {
    const accountsOptions = accounts.map(a => {
      const typeLabel = a.type === 'CASH' ? '💵 Efectivo' : '🏦 Banco';
      const selected = payment.accountId === a._id ? 'selected' : '';
      return `<option value="${a._id}" ${selected}>${typeLabel} - ${htmlEscape(a.name)}</option>`;
    }).join('');
    
    return `
      <div class="payment-row p-3 border-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white" data-payment-id="${payment.id}">
        <div class="flex gap-3 items-end flex-wrap">
          <div class="flex-1 min-w-[200px]">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Cuenta ${index + 1}</label>
            <select 
              class="payment-account w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              data-payment-id="${payment.id}"
              onchange="updatePayment('${payment.id}', 'accountId', this.value)">
              <option value="">Seleccione cuenta…</option>
              ${accountsOptions}
            </select>
          </div>
          <div class="flex-1 min-w-[150px]">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Monto</label>
            <input 
              type="number" 
              class="payment-amount w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              data-payment-id="${payment.id}"
              min="0" 
              step="1"
              value="${payment.amount}"
              placeholder="0"
              onchange="updatePayment('${payment.id}', 'amount', this.value)"
              oninput="updatePayment('${payment.id}', 'amount', this.value)" />
          </div>
          <div class="min-w-[80px]">
            <label class="block text-xs text-transparent mb-1">&nbsp;</label>
            <button 
              class="w-full px-2 py-2 text-xs font-semibold bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 rounded-md transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300"
              onclick="removePayment('${payment.id}')">
              ✕ Eliminar
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Función para actualizar el resumen de pagos
function updatePaymentsSummary() {
  const summaryContainer = document.getElementById('pp-payments-summary');
  if (!summaryContainer) return;
  
  const totalPayments = partialPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingAmount = currentSettlementNetTotal - currentSettlementPaidAmount;
  const remainingAfterPayments = remainingAmount - totalPayments;
  
  const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
  
  if (partialPayments.length === 0) {
    summaryContainer.style.display = 'none';
    return;
  }
  
  summaryContainer.style.display = 'block';
  summaryContainer.innerHTML = `
    <div class="flex justify-between items-center flex-wrap gap-3">
      <div class="flex-1 min-w-[200px]">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total de pagos configurados</div>
        <div class="text-lg font-bold ${totalPayments > remainingAmount ? 'text-red-500 dark:text-red-400 theme-light:text-red-600' : 'text-green-500 dark:text-green-400 theme-light:text-green-600'}">${formatMoney(totalPayments)}</div>
      </div>
      <div class="flex-1 min-w-[200px]">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Monto restante a pagar</div>
        <div class="text-lg font-bold text-yellow-500 dark:text-yellow-400 theme-light:text-yellow-600">${formatMoney(remainingAmount)}</div>
      </div>
      <div class="flex-1 min-w-[200px]">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Después de estos pagos</div>
        <div class="text-lg font-bold ${remainingAfterPayments < 0 ? 'text-red-500 dark:text-red-400 theme-light:text-red-600' : remainingAfterPayments === 0 ? 'text-green-500 dark:text-green-400 theme-light:text-green-600' : 'text-yellow-500 dark:text-yellow-400 theme-light:text-yellow-600'}">
          ${formatMoney(Math.max(0, remainingAfterPayments))}
        </div>
      </div>
    </div>
    ${totalPayments > remainingAmount ? `
      <div class="mt-3 p-2 bg-red-500/10 dark:bg-red-500/10 theme-light:bg-red-50 border border-red-500 dark:border-red-500 theme-light:border-red-300 rounded-md text-red-500 dark:text-red-400 theme-light:text-red-600 text-xs">
        ⚠️ El total de los pagos excede el monto restante por ${formatMoney(totalPayments - remainingAmount)}
      </div>
    ` : ''}
    ${remainingAfterPayments < 0 ? `
      <div class="mt-2 p-2 bg-red-500/10 dark:bg-red-500/10 theme-light:bg-red-50 border border-red-500 dark:border-red-500 theme-light:border-red-300 rounded-md text-red-500 dark:text-red-400 theme-light:text-red-600 text-xs">
        ⚠️ El total de los pagos excede el monto a pagar. Ajusta los montos.
      </div>
    ` : remainingAfterPayments === 0 ? `
      <div class="mt-2 p-2 bg-green-500/10 dark:bg-green-500/10 theme-light:bg-green-50 border border-green-500 dark:border-green-500 theme-light:border-green-300 rounded-md text-green-500 dark:text-green-400 theme-light:text-green-600 text-xs">
        ✓ El pago está completo. Puedes proceder a registrar los pagos.
      </div>
    ` : `
      <div class="mt-2 p-2 bg-yellow-500/10 dark:bg-yellow-500/10 theme-light:bg-yellow-50 border border-yellow-500 dark:border-yellow-500 theme-light:border-yellow-300 rounded-md text-yellow-500 dark:text-yellow-400 theme-light:text-yellow-600 text-xs">
        ℹ️ Quedarán ${formatMoney(remainingAfterPayments)} pendientes después de estos pagos.
      </div>
    `}
  `;
}

async function pay(){
  try {
    const settlementId = document.getElementById('pp-settlementSel')?.value?.trim();
    const dateInput = document.getElementById('pp-date')?.value?.trim();
    
    // Validaciones
    if (!settlementId) {
      alert('⚠️ Selecciona una liquidación');
      document.getElementById('pp-settlementSel')?.focus();
      return;
    }
    
    // Validar que haya pagos configurados
    const validPayments = partialPayments.filter(p => p.accountId && p.amount > 0);
    if (validPayments.length === 0) {
      alert('⚠️ Agrega al menos un pago con cuenta y monto');
      return;
    }
    
    // La fecha se autocompleta automáticamente, usar la fecha actual si no está definida
    let date = null;
    if (dateInput && dateInput.value) {
      // Convertir datetime-local a ISO string para enviar al backend
      const dateObj = new Date(dateInput.value);
      if (isNaN(dateObj.getTime())) {
        // Si la fecha es inválida, usar la fecha actual
        date = new Date().toISOString();
      } else {
        // Enviar en formato ISO para que el backend lo interprete correctamente
        date = dateObj.toISOString();
      }
    } else {
      // Si no hay fecha, usar la fecha actual
      date = new Date().toISOString();
    }
    
    // Obtener información de la liquidación para confirmación
    const settlementOption = document.getElementById('pp-settlementSel').options[document.getElementById('pp-settlementSel').selectedIndex];
    const technicianName = settlementOption?.textContent?.split(' - ')[0] || 'Técnico';
    const netTotal = Number(settlementOption?.dataset.net || '0');
    const paidAmount = Number(settlementOption?.dataset.paid || '0');
    const remainingAmount = netTotal - paidAmount;
    const totalPayments = validPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    
    // Validar que el total no exceda el monto restante
    if (totalPayments > remainingAmount) {
      alert(`⚠️ El total de los pagos (${formatMoney(totalPayments)}) excede el monto restante a pagar (${formatMoney(remainingAmount)})`);
      return;
    }
    
    // Confirmar pago
    const paymentsText = validPayments.map((p, idx) => {
      const accountName = document.querySelector(`select[data-payment-id="${p.id}"]`)?.selectedOptions[0]?.textContent || 'Cuenta';
      return `  ${idx + 1}. ${accountName}: ${formatMoney(p.amount)}`;
    }).join('\n');
    
    if (!confirm(`¿Registrar ${validPayments.length} pago(s) parcial(es) por un total de ${formatMoney(totalPayments)} a ${technicianName}?\n\n${paymentsText}\n\nEl pago se registrará en el Flujo de Caja.`)) {
      return;
    }
    
    // Preparar array de pagos para enviar al backend
    const payments = validPayments.map(p => ({
      accountId: p.accountId,
      amount: Number(p.amount),
      date: date,
      notes: ''
    }));
    
    const payload = {
      settlementId,
      payments
    };
    
    // Deshabilitar botón durante la petición
    const btn = el('pp-pay');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Procesando...';
    }
    
    try {
      const r = await api.post('/api/v1/payroll/settlements/pay', payload);
      
      // Limpiar formulario
      document.getElementById('pp-settlementSel').value = '';
      document.getElementById('pp-date').value = '';
      document.getElementById('pp-settlement-info').style.display = 'none';
      document.getElementById('pp-payments-container').style.display = 'none';
      partialPayments = [];
      
      // Mostrar mensaje de éxito
      const paymentsInfo = Array.isArray(r.cashflow) 
        ? r.cashflow.map((cf, idx) => `Pago ${idx + 1}: ${formatMoney(cf.amount)}`).join('<br>')
        : `Pago: ${formatMoney(r.cashflow.amount)}`;
      
      el('pp-result').innerHTML = `
        <div class="p-4 bg-green-500/10 dark:bg-green-500/10 theme-light:bg-green-50 border border-green-500 dark:border-green-500 theme-light:border-green-300 rounded-lg mb-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-2xl">✓</span>
            <h4 class="m-0 text-base font-semibold text-green-500 dark:text-green-400 theme-light:text-green-600">${r.isFullyPaid ? 'Pago completo registrado exitosamente' : 'Pago(s) parcial(es) registrado(s) exitosamente'}</h4>
          </div>
          <div class="text-sm text-white dark:text-white theme-light:text-slate-900 mb-1">
            <strong>Técnico:</strong> ${htmlEscape(technicianName)}
          </div>
          <div class="text-sm text-white dark:text-white theme-light:text-slate-900 mb-1">
            <strong>Total pagado:</strong> ${formatMoney(r.totalPaid || totalPayments)}
          </div>
          ${r.remaining > 0 ? `
            <div class="text-sm text-yellow-500 dark:text-yellow-400 theme-light:text-yellow-600 mb-1">
              <strong>Restante:</strong> ${formatMoney(r.remaining)}
            </div>
          ` : ''}
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-2">
            ${paymentsInfo}
          </div>
        </div>
      `;
      
      // Recargar liquidaciones pendientes y liquidaciones generales
      await Promise.all([loadPendingSettlements(), loadSettlements()]);
      
      // Restaurar botón
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      let userMsg = '❌ Error al procesar pago: ' + errorMsg;
      
      if (errorMsg.includes('ya fue pagada')) {
        userMsg = '⚠️ Esta liquidación ya fue pagada anteriormente.';
      } else if (errorMsg.includes('aprobadas')) {
        userMsg = '⚠️ Solo se pueden pagar liquidaciones aprobadas.';
      } else if (errorMsg.includes('Saldo insuficiente') || errorMsg.includes('saldo suficiente')) {
        // El mensaje ya viene completo del backend con los detalles
        userMsg = '⚠️ ' + errorMsg;
      }
      
      el('pp-result').innerHTML = `
        <div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600 text-sm">
          ${userMsg}
        </div>`;
      
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch (err) {
    console.error('Error in pay:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

async function loadSettlements(){
  try {
    const periodId = (document.getElementById('pl-periodSel')||{}).value || '';
    const q = periodId ? { periodId } : {};
    const r = await api.get('/api/v1/payroll/settlements', q);
    const items = r.items || [];
    const summary = r.summary || { grossTotal:0, deductionsTotal:0, netTotal:0 };
    
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    
    // Mapear estados a español y colores
    const statusLabels = {
      'draft': { label: 'Borrador', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
      'approved': { label: 'Aprobada', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      'paid': { label: 'Pagada', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' }
    };
    
    const rows = items.map(s => {
      const statusInfo = statusLabels[s.status] || { label: s.status, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
      const createdAt = new Date(s.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      // Obtener API_BASE para los enlaces
      const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
      const printUrl = `${apiBase}/api/v1/payroll/settlements/${s._id}/print`;
      const settlementId = s._id;
      
      return `<div class="p-3 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50 transition-all duration-200">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3 flex-1 min-w-[200px]">
            <span class="px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${s.status === 'approved' ? 'bg-green-500/10 dark:bg-green-500/10 theme-light:bg-green-50 text-green-500 dark:text-green-400 theme-light:text-green-700 border border-green-500/20 dark:border-green-500/20 theme-light:border-green-200' : s.status === 'paid' ? 'bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 text-blue-500 dark:text-blue-400 theme-light:text-blue-700 border border-blue-500/20 dark:border-blue-500/20 theme-light:border-blue-200' : 'bg-slate-500/10 dark:bg-slate-500/10 theme-light:bg-slate-100 text-slate-500 dark:text-slate-400 theme-light:text-slate-600 border border-slate-500/20 dark:border-slate-500/20 theme-light:border-slate-300'}">
              ${htmlEscape(statusInfo.label)}
            </span>
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                👤 ${htmlEscape(s.technicianName||'Sin nombre')}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                ${createdAt}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="text-right text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
              <div>Bruto: <strong class="text-white dark:text-white theme-light:text-slate-900">${formatMoney(s.grossTotal)}</strong></div>
              <div>Desc: <strong class="text-red-400 dark:text-red-400 theme-light:text-red-600">-${formatMoney(s.deductionsTotal)}</strong></div>
              <div class="mt-1 text-sm font-semibold text-green-400 dark:text-green-400 theme-light:text-green-600">Neto: ${formatMoney(s.netTotal)}</div>
            </div>
            <div class="flex items-center gap-2">
              <a href="${printUrl}" target="_blank" class="px-3 py-1.5 text-xs border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300 rounded-md bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 text-white dark:text-white theme-light:text-slate-700 hover:bg-blue-500/20 dark:hover:bg-blue-500/20 theme-light:hover:bg-blue-50 no-underline transition-all duration-200" title="Imprimir con template configurado">
                🖨️ Imprimir
              </a>
              <button data-settlement-id="${settlementId}" class="pdf-download-btn px-3 py-1.5 text-xs border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300 rounded-md bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 text-white dark:text-white theme-light:text-slate-700 hover:bg-red-500/20 dark:hover:bg-red-500/20 theme-light:hover:bg-red-50 transition-all duration-200" title="Descargar PDF">
                📄 PDF
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
    
    const containerId = 'pl-result';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Preservar el preview si existe
    const existingPreview = container.querySelector('.bg-slate-800\\/30');
    const previewHtml = existingPreview ? existingPreview.outerHTML : '';
    
    if (items.length === 0 && !previewHtml) {
      container.innerHTML = '<div class="text-center py-6 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay liquidaciones aprobadas para este período.</div>';
      return;
    }
    
    const summaryHtml = items.length > 0 ? `
      <div class="mt-4 pt-4 border-t-2 border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
        <h4 class="m-0 mb-3 text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Resumen del período</h4>
        <div class="flex gap-6 flex-wrap justify-end">
          <div class="text-right">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Bruto</div>
            <div class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900">${formatMoney(summary.grossTotal)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Descuentos</div>
            <div class="text-base font-semibold text-red-400 dark:text-red-400 theme-light:text-red-600">-${formatMoney(summary.deductionsTotal)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Neto</div>
            <div class="text-lg font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${formatMoney(summary.netTotal)}</div>
          </div>
        </div>
      </div>
    ` : '';
    
    container.innerHTML = `
      ${previewHtml}
      ${items.length > 0 ? `
        <div class="${previewHtml ? 'mt-4' : ''}">
          <h4 class="m-0 mb-3 text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Liquidaciones aprobadas</h4>
          <div>${rows}</div>
          ${summaryHtml}
        </div>
      ` : ''}
    `;
  } catch (err) {
    console.error('Error loading settlements:', err);
    const container = document.getElementById('pl-result');
    if (container) {
      container.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
        ❌ Error al cargar liquidaciones: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function downloadSettlementPdf(settlementId, button) {
  if (!settlementId) {
    alert('❌ ID de liquidación no válido');
    return;
  }
  
  const originalText = button?.textContent || '';
  const originalDisabled = button?.disabled;
  
  try {
    // Deshabilitar botón durante la descarga
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Descargando...';
    }
    
    // Obtener token y API base
    const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
    const token = api.token.get();
    
    if (!token) {
      alert('❌ No hay sesión activa. Por favor, inicia sesión nuevamente.');
      return;
    }
    
    // Fetch PDF con autenticación
    const response = await fetch(`${apiBase}/api/v1/payroll/settlements/${settlementId}/pdf`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error || errorMsg;
      } catch {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(errorMsg);
    }
    
    // Obtener blob del PDF
    const blob = await response.blob();
    
    // Crear URL temporal y abrir en nueva ventana
    const blobUrl = URL.createObjectURL(blob);
    const newWindow = window.open(blobUrl, '_blank');
    
    if (!newWindow) {
      // Si el popup fue bloqueado, intentar descargar directamente
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `liquidacion-${settlementId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    // Limpiar URL después de un tiempo
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 10000);
    
    // Restaurar botón
    if (button) {
      button.textContent = originalText;
      button.disabled = originalDisabled;
    }
  } catch (err) {
    console.error('Error downloading PDF:', err);
    alert('❌ Error al descargar PDF: ' + (err.message || 'Error desconocido'));
    
    // Restaurar botón
    if (button) {
      button.textContent = originalText;
      button.disabled = originalDisabled;
    }
  }
}

async function createPeriod(){
  try {
    const startInput = document.getElementById('ppd-start');
    const endInput = document.getElementById('ppd-end');
    const typeSelect = document.getElementById('ppd-type');
    const msgEl = document.getElementById('ppd-msg');
    
    const start = startInput?.value?.trim();
    const end = endInput?.value?.trim();
    const type = typeSelect?.value || 'monthly';
    
    // Validaciones
    if (!start) {
      alert('⚠️ Selecciona la fecha de inicio');
      startInput?.focus();
      return;
    }
    
    if (!end) {
      alert('⚠️ Selecciona la fecha de fin');
      endInput?.focus();
      return;
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      alert('⚠️ Fechas inválidas');
      return;
    }
    
    if (endDate <= startDate) {
      alert('⚠️ La fecha de fin debe ser posterior a la fecha de inicio');
      endInput?.focus();
      return;
    }
    
    // Deshabilitar botón durante la petición
    const btn = document.getElementById('ppd-create');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando...';
    }
    
    // Limpiar mensaje anterior
    if (msgEl) msgEl.innerHTML = '';
    
    try {
      const r = await api.post('/api/v1/payroll/periods', { 
        startDate: start, 
        endDate: end, 
        periodType: type 
      });
      
      // Limpiar formulario
      if (startInput) startInput.value = '';
      if (endInput) endInput.value = '';
      
      // Mostrar mensaje de éxito
      if (msgEl) {
        const startStr = new Date(r.startDate).toLocaleDateString('es-CO');
        const endStr = new Date(r.endDate).toLocaleDateString('es-CO');
        msgEl.innerHTML = `<div style="padding:12px;background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:8px;color:#10b981;font-size:13px;">
          ✓ Período creado exitosamente: ${startStr} → ${endStr}
        </div>`;
      }
      
      // Recargar períodos y actualizar select
      await Promise.all([loadAllPeriods(), loadOpenPeriods()]);
      
      // Feedback visual
      if (btn) {
        btn.textContent = '✓ Creado';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 1500);
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      let userMsg = '❌ Error al crear período: ' + errorMsg;
      
      // Solo se previene si hay un período ABIERTO con las mismas fechas exactas
      if (errorMsg.includes('ABIERTO') || errorMsg.includes('abierto')) {
        userMsg = '⚠️ Ya existe un período ABIERTO con estas fechas exactas. Cierra el período existente o usa fechas diferentes.';
      }
      
      if (msgEl) {
        msgEl.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
          ${userMsg}
        </div>`;
      } else {
        alert(userMsg);
      }
      
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch (err) {
    console.error('Error in createPeriod:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

function init(){
  el('pc-add')?.addEventListener('click', addConcept);
  
  // Cargar conceptos para el selector de base de porcentaje
  loadConceptsForPercentBase();
  
  // Actualizar campos según el tipo seleccionado
  const typeSel = el('pc-type');
  const amountTypeSel = el('pc-amountType');
  const valueInput = el('pc-value');
  const valueLabel = el('pc-value-label');
  const valueHint = el('pc-value-hint');
  const valueContainer = document.getElementById('pc-value-container');
  const variableAmountContainer = document.getElementById('pc-variable-amount-container');
  const amountTypeContainer = document.getElementById('pc-amountType')?.parentElement;
  
  function updateFieldsByType() {
    const type = typeSel?.value;
    const isVariable = type === 'variable';
    
    // Mostrar/ocultar campos según el tipo
    if (valueContainer) {
      valueContainer.style.display = isVariable ? 'none' : 'block';
    }
    if (variableAmountContainer) {
      variableAmountContainer.style.display = isVariable ? 'block' : 'none';
    }
    if (amountTypeContainer) {
      amountTypeContainer.style.display = isVariable ? 'none' : 'block';
    }
    
    // Si es variable, enfocar el campo de monto fijo
    if (isVariable && variableAmountContainer) {
      setTimeout(() => {
        document.getElementById('pc-variableFixedAmount')?.focus();
      }, 100);
    }
    
    // Actualizar label y placeholder según el tipo de monto (solo si no es variable)
    if (!isVariable) {
      updateValueField();
    }
  }
  
  function updateValueField() {
    const amountType = amountTypeSel?.value;
    const percentBaseContainer = document.getElementById('pc-percent-base-container');
    const percentBaseConceptContainer = document.getElementById('pc-percent-base-concept-container');
    const percentBaseValueContainer = document.getElementById('pc-percent-base-value-container');
    const percentBaseTypeSel = document.getElementById('pc-percentBaseType');
    const percentBaseConceptSel = document.getElementById('pc-percentBaseConceptId');
    
    if (amountType === 'percent') {
      if (valueLabel) valueLabel.textContent = 'Porcentaje (%)';
      if (valueInput) {
        valueInput.placeholder = 'Ej: 10';
        valueInput.step = '0.01';
      }
      if (valueHint) valueHint.textContent = 'Ingresa el porcentaje (ej: 10 para 10%, 15.5 para 15.5%)';
      
      // Mostrar configuración de base de porcentaje
      if (percentBaseContainer) percentBaseContainer.style.display = 'flex';
      
      // Actualizar campos según el tipo de base seleccionado
      if (percentBaseTypeSel) {
        const baseType = percentBaseTypeSel.value;
        if (percentBaseConceptContainer) {
          percentBaseConceptContainer.style.display = baseType === 'specific_concept' ? 'flex' : 'none';
        }
        if (percentBaseValueContainer) {
          percentBaseValueContainer.style.display = baseType === 'fixed_value' ? 'block' : 'none';
        }
      }
    } else {
      if (valueLabel) valueLabel.textContent = 'Valor (COP)';
      if (valueInput) {
        valueInput.placeholder = '0.00';
        valueInput.step = '0.01';
      }
      if (valueHint) valueHint.textContent = 'Ingresa el valor fijo en pesos colombianos';
      
      // Ocultar configuración de base de porcentaje
      if (percentBaseContainer) percentBaseContainer.style.display = 'none';
      if (percentBaseConceptContainer) percentBaseConceptContainer.style.display = 'none';
      if (percentBaseValueContainer) percentBaseValueContainer.style.display = 'none';
    }
  }
  
  if (typeSel) {
    typeSel.addEventListener('change', updateFieldsByType);
    updateFieldsByType(); // Inicializar
  }
  
  // Event listener para cambiar el tipo de base de porcentaje
  const percentBaseTypeSel = document.getElementById('pc-percentBaseType');
  if (percentBaseTypeSel) {
    percentBaseTypeSel.addEventListener('change', () => {
      const baseType = percentBaseTypeSel.value;
      const percentBaseConceptContainer = document.getElementById('pc-percent-base-concept-container');
      const percentBaseValueContainer = document.getElementById('pc-percent-base-value-container');
      
      if (percentBaseConceptContainer) {
        percentBaseConceptContainer.style.display = baseType === 'specific_concept' ? 'flex' : 'none';
      }
      if (percentBaseValueContainer) {
        percentBaseValueContainer.style.display = baseType === 'fixed_value' ? 'block' : 'none';
      }
    });
  }
  
  if (amountTypeSel) {
    amountTypeSel.addEventListener('change', updateValueField);
    updateValueField(); // Inicializar
  }
  
  // Permitir crear concepto con Enter en cualquier campo del formulario
  ['pc-code', 'pc-name', 'pc-value'].forEach(id => {
    const input = el(id);
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addConcept();
        }
      });
    }
  });
  
  // Gestión de tipos de mano de obra
  el('lk-add')?.addEventListener('click', addLaborKind);
  ['lk-name', 'lk-percent'].forEach(id => {
    const input = el(id);
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addLaborKind();
        }
      });
    }
  });
  loadLaborKinds();
  
  el('pa-save')?.addEventListener('click', saveAssignment);
  const tSel = document.getElementById('pa-technicianSel');
  if (tSel) {
    tSel.addEventListener('change', () => {
      loadAssignments();
      // Limpiar selección de concepto y valor al cambiar técnico
      const conceptSel = document.getElementById('pa-conceptSel');
      if (conceptSel) conceptSel.value = '';
      el('pa-value').value = '';
    });
  }
  
  // Permitir Enter en el campo de valor para guardar
  const paValueInput = el('pa-value');
  if (paValueInput) {
    paValueInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveAssignment();
      }
    });
  }
  
  // Permitir Enter en el campo de crear técnico
  const tkAddInput = el('tk-add-name');
  if (tkAddInput) {
    tkAddInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createTechnician();
      }
    });
  }
  el('pl-preview')?.addEventListener('click', preview);
  el('pl-approve')?.addEventListener('click', approve);
  
  // Recargar conceptos cuando cambie el técnico
  const technicianSel = document.getElementById('pl-technicianSel');
  if (technicianSel) {
    technicianSel.addEventListener('change', () => {
      loadConceptsForTechnician();
    });
  }
  
  // Recargar liquidaciones cuando cambie el período
  const periodSel = document.getElementById('pl-periodSel');
  if (periodSel) {
    periodSel.addEventListener('change', () => {
      loadSettlements();
    });
  }
  
  // Cargar conceptos al iniciar si hay un técnico seleccionado
  setTimeout(() => {
    if (technicianSel?.value) {
      loadConceptsForTechnician();
    }
  }, 500);
  el('pp-pay')?.addEventListener('click', pay);
  el('pp-add-payment')?.addEventListener('click', () => {
    window.addPayment();
  });
  const btnCreate = document.getElementById('ppd-create');
  if (btnCreate) btnCreate.addEventListener('click', createPeriod);
  const addTechBtn = document.getElementById('tk-add-btn');
  if (addTechBtn) addTechBtn.addEventListener('click', createTechnician);
  
  // Event delegation para botones de PDF (se crean dinámicamente)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pdf-download-btn');
    if (!btn) return;
    const settlementId = btn.getAttribute('data-settlement-id');
    if (!settlementId) return;
    e.preventDefault();
    await downloadSettlementPdf(settlementId, btn);
  });
  
  // Tabs internas
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b=>{
    b.addEventListener('click', ()=> switchTab(b.dataset.subtab));
  });
  loadConcepts();
  loadTechnicians();
  loadOpenPeriods();
  loadAllPeriods();
  loadPendingSettlements();
  loadCashFlowAccounts();
  // Cargar listados al inicio
  setTimeout(loadSettlements, 0);
  switchTab('settlements');
}

function switchTab(name){
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b=> {
    if(b.dataset.subtab===name){
      b.classList.remove('bg-slate-700/50', 'dark:bg-slate-700/50', 'hover:bg-slate-700', 'dark:hover:bg-slate-700', 'text-white', 'dark:text-white', 'border', 'border-slate-600/50', 'dark:border-slate-600/50', 'theme-light:border-slate-300', 'theme-light:bg-slate-200', 'theme-light:text-slate-700', 'theme-light:hover:bg-slate-300', 'theme-light:hover:text-slate-900');
      b.classList.add('bg-blue-600', 'text-white');
    } else {
      b.classList.remove('bg-blue-600', 'text-white');
      b.classList.add('bg-slate-700/50', 'dark:bg-slate-700/50', 'hover:bg-slate-700', 'dark:hover:bg-slate-700', 'text-white', 'dark:text-white', 'border', 'border-slate-600/50', 'dark:border-slate-600/50', 'theme-light:border-slate-300', 'theme-light:bg-slate-200', 'theme-light:text-slate-700', 'theme-light:hover:bg-slate-300', 'theme-light:hover:text-slate-900');
    }
  });
  document.querySelectorAll('[data-subsection]').forEach(sec=> sec.classList.toggle('hidden', sec.dataset.subsection!==name));
  
  // Recargar datos cuando se abre la pestaña
  if (name === 'periods') {
    loadAllPeriods();
  } else if (name === 'pay') {
    loadPendingSettlements();
    loadCashFlowAccounts();
  }
}

async function createTechnician(){
  try {
    const nameInput = document.getElementById('tk-add-name');
    const identificationInput = document.getElementById('tk-add-identification');
    const basicSalaryInput = document.getElementById('tk-add-basic-salary');
    const workHoursInput = document.getElementById('tk-add-work-hours');
    const salaryPerDayInput = document.getElementById('tk-add-salary-per-day');
    const contractTypeInput = document.getElementById('tk-add-contract-type');
    
    const name = (nameInput?.value || '').trim();
    const identification = (identificationInput?.value || '').trim();
    const basicSalary = (basicSalaryInput?.value || '').trim();
    const workHoursPerMonth = (workHoursInput?.value || '').trim();
    const basicSalaryPerDay = (salaryPerDayInput?.value || '').trim();
    const contractType = (contractTypeInput?.value || '').trim();
    
    // Validaciones
    if (!name) {
      alert('⚠️ Ingresa un nombre de técnico');
      nameInput?.focus();
      return;
    }
    
    if (name.length < 2) {
      alert('⚠️ El nombre debe tener al menos 2 caracteres');
      nameInput?.focus();
      return;
    }
    
    if (name.length > 100) {
      alert('⚠️ El nombre no puede exceder 100 caracteres');
      nameInput?.focus();
      return;
    }
    
    // Deshabilitar botón durante la petición
    const btn = el('tk-add-btn');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando...';
    }
    
    try {
      // Verificar que api.company esté disponible
      let addFn = null;
      if (api && api.company && typeof api.company.addTechnician === 'function') {
        addFn = api.company.addTechnician;
      } else if (window.API && window.API.company && typeof window.API.company.addTechnician === 'function') {
        addFn = window.API.company.addTechnician;
      } else {
        throw new Error('API no disponible. Por favor recarga la página.');
      }
      
      await addFn(
        name,
        identification,
        basicSalary || null,
        workHoursPerMonth || null,
        basicSalaryPerDay || null,
        contractType
      );
      
      // Limpiar campos
      if (nameInput) nameInput.value = '';
      if (identificationInput) identificationInput.value = '';
      if (basicSalaryInput) basicSalaryInput.value = '';
      if (workHoursInput) workHoursInput.value = '';
      if (salaryPerDayInput) salaryPerDayInput.value = '';
      if (contractTypeInput) contractTypeInput.value = '';
      
      // Recargar lista de técnicos
      await loadTechnicians();
      
      // Feedback visual
      if (btn) {
        btn.textContent = '✓ Creado';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 1500);
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      if (errorMsg.includes('duplicate') || errorMsg.includes('ya existe')) {
        alert('⚠️ Ya existe un técnico con ese nombre');
      } else {
        alert('❌ Error al crear técnico: ' + errorMsg);
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      nameInput?.focus();
    }
  } catch (err) {
    console.error('Error in createTechnician:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

function showEditTechnicianModal(oldName, currentIdentification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');
  
  if (!modal || !modalBody) {
    alert('Modal no disponible');
    return;
  }
  
  // Crear contenido del modal
  modalBody.innerHTML = `
    <div class="p-6">
      <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Editar Técnico</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Nombre del técnico
          </label>
          <input 
            id="edit-tech-name" 
            type="text" 
            value="${htmlEscape(oldName)}" 
            maxlength="100"
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: Juan Pérez"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Número de identificación
          </label>
          <input 
            id="edit-tech-identification" 
            type="text" 
            value="${htmlEscape(currentIdentification)}" 
            maxlength="20"
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: 1234567890"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Salario Básico ($/MES)
          </label>
          <input 
            id="edit-tech-basic-salary" 
            type="number" 
            step="0.01"
            min="0"
            value="${basicSalary || ''}" 
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: 1000000"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Horas Trabajo MES
          </label>
          <input 
            id="edit-tech-work-hours" 
            type="number" 
            step="1"
            min="0"
            value="${workHoursPerMonth || ''}" 
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: 240"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Salario Básico (DÍA)
          </label>
          <input 
            id="edit-tech-salary-per-day" 
            type="number" 
            step="0.01"
            min="0"
            value="${basicSalaryPerDay || ''}" 
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: 33333.33"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">
            Tipo Contrato
          </label>
          <input 
            id="edit-tech-contract-type" 
            type="text" 
            value="${htmlEscape(contractType)}" 
            maxlength="50"
            class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej: Término Indefinido"
          />
        </div>
      </div>
      
      <div class="flex gap-3 mt-6">
        <button 
          id="edit-tech-save" 
          class="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
        >
          💾 Guardar cambios
        </button>
        <button 
          id="edit-tech-cancel" 
          class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900"
        >
          Cancelar
        </button>
      </div>
    </div>
  `;
  
  // Mostrar modal
  modal.classList.remove('hidden');
  
  // Focus en el campo de nombre
  const nameInput = document.getElementById('edit-tech-name');
  if (nameInput) {
    nameInput.focus();
    nameInput.select();
  }
  
  // Event listeners
  const saveBtn = document.getElementById('edit-tech-save');
  const cancelBtn = document.getElementById('edit-tech-cancel');
  
  const closeModal = () => {
    modal.classList.add('hidden');
  };
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newName = document.getElementById('edit-tech-name')?.value?.trim() || '';
      const newIdentification = document.getElementById('edit-tech-identification')?.value?.trim() || '';
      const basicSalary = document.getElementById('edit-tech-basic-salary')?.value?.trim() || '';
      const workHoursPerMonth = document.getElementById('edit-tech-work-hours')?.value?.trim() || '';
      const basicSalaryPerDay = document.getElementById('edit-tech-salary-per-day')?.value?.trim() || '';
      const contractType = document.getElementById('edit-tech-contract-type')?.value?.trim() || '';
      
      if (!newName) {
        alert('⚠️ El nombre del técnico es requerido');
        return;
      }
      
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      
      try {
        // Verificar que api.company esté disponible
        if (!api || !api.company || typeof api.company.updateTechnician !== 'function') {
          // Fallback: usar window.API directamente
          const API = window.API || api;
          if (!API || !API.company || typeof API.company.updateTechnician !== 'function') {
            throw new Error('API no disponible. Por favor recarga la página.');
          }
          await API.company.updateTechnician(oldName, newName, newIdentification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType);
        } else {
          await api.company.updateTechnician(oldName, newName, newIdentification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType);
        }
        await loadTechnicians();
        closeModal();
      } catch (err) {
        console.error('Error guardando técnico:', err);
        alert('❌ Error al guardar: ' + (err.message || 'Error desconocido'));
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar cambios';
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }
  
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }
  
  // Cerrar con ESC
  const escHandler = (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

async function editTechnician(name, identification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType) {
  if (!name) {
    throw new Error('Nombre de técnico requerido');
  }
  
  await api.company.updateTechnician(name, name, identification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType);
  await loadTechnicians();
}

// ===== Gestión de tipos de mano de obra =====
async function loadLaborKinds(){
  try {
    const r = await api.get('/api/v1/company/tech-config');
    const config = r.config || {};
    const laborKinds = config.laborKinds || [];
    
    const container = el('lk-list');
    if (!container) return;
    
    if (laborKinds.length === 0) {
      container.innerHTML = '<div class="text-center py-6 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay tipos de mano de obra configurados. Crea el primero arriba.</div>';
      return;
    }
    
    const rows = laborKinds.map(k => {
      const name = typeof k === 'string' ? k : (k?.name || '');
      const defaultPercent = typeof k === 'object' && k?.defaultPercent !== undefined ? k.defaultPercent : 0;
      
      return `<div class="concept-row p-3 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg mb-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white transition-all duration-200 hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex gap-3 items-center flex-1 min-w-[200px]">
            <div class="flex-1">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-0.5">
                ${htmlEscape(name)}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
                % Predeterminado: <strong class="text-white dark:text-white theme-light:text-slate-900">${defaultPercent}%</strong>
              </div>
            </div>
          </div>
          <div class="flex gap-1.5 items-center">
            <button data-name="${htmlEscape(name)}" class="x-del-lk px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300" title="Eliminar tipo">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      </div>`;
    });
    
    container.innerHTML = rows.join('');
    
    // Agregar event listeners para eliminar
    container.querySelectorAll('.x-del-lk').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-name');
        if (!name) return;
        
        if (!confirm(`¿Estás seguro de eliminar el tipo "${name}"? Esta acción no se puede deshacer.`)) return;
        
        try {
          btn.disabled = true;
          btn.textContent = 'Eliminando...';
          
          const r = await api.get('/api/v1/company/tech-config');
          const config = r.config || {};
          const laborKinds = (config.laborKinds || []).filter(k => {
            const kindName = typeof k === 'string' ? k : (k?.name || '');
            return kindName !== name;
          });
          
          await api.put('/api/v1/company/tech-config', { ...config, laborKinds });
          await loadLaborKinds();
        } catch (err) {
          alert('❌ Error al eliminar tipo: ' + (err.message || 'Error desconocido'));
          btn.disabled = false;
          btn.innerHTML = '🗑️ Eliminar';
        }
      });
    });
  } catch (err) {
    console.error('Error loading labor kinds:', err);
    const container = el('lk-list');
    if (container) {
      container.innerHTML = `<div class="p-3 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 rounded-lg text-red-400 dark:text-red-400 theme-light:text-red-600 text-sm">
        ❌ Error al cargar tipos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function addLaborKind(){
  try {
    const name = (el('lk-name')?.value || '').trim().toUpperCase();
    const percentStr = (el('lk-percent')?.value || '').trim();
    
    if (!name) {
      alert('⚠️ El nombre del tipo es requerido');
      el('lk-name')?.focus();
      return;
    }
    
    const defaultPercent = percentStr ? parseFloat(percentStr) : 0;
    if (isNaN(defaultPercent) || defaultPercent < 0 || defaultPercent > 100) {
      alert('⚠️ El porcentaje debe ser un número entre 0 y 100');
      el('lk-percent')?.focus();
      return;
    }
    
    const btn = el('lk-add');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando...';
    }
    
    try {
      const r = await api.get('/api/v1/company/tech-config');
      const config = r.config || {};
      const laborKinds = config.laborKinds || [];
      
      // Verificar si ya existe
      const exists = laborKinds.some(k => {
        const kindName = typeof k === 'string' ? k : (k?.name || '');
        return kindName === name;
      });
      
      if (exists) {
        alert('⚠️ Ya existe un tipo con ese nombre. Usa un nombre diferente.');
        el('lk-name')?.focus();
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        return;
      }
      
      // Agregar nuevo tipo
      const newKinds = [...laborKinds, { name, defaultPercent }];
      await api.put('/api/v1/company/tech-config', { ...config, laborKinds: newKinds });
      
      // Limpiar formulario
      el('lk-name').value = '';
      el('lk-percent').value = '';
      
      // Recargar lista
      await loadLaborKinds();
      
      // Feedback visual
      if (btn) {
        btn.textContent = '✓ Creado';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 1500);
      }
    } catch (err) {
      alert('❌ Error al crear tipo: ' + (err.message || 'Error desconocido'));
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch (err) {
    console.error('Error in addLaborKind:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

document.addEventListener('DOMContentLoaded', init);


