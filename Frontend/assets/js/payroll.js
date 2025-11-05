import API from './api.esm.js';
const api = API;

function el(id){ return document.getElementById(id); }
function htmlEscape(s){ return (s||'').replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

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
      
      return `<div class="concept-row" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--card);transition:all 0.2s;">
        <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="row" style="gap:12px;align-items:center;flex:1;min-width:200px;">
            <span class="concept-badge" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}20;">
              ${htmlEscape(typeInfo.label)}
            </span>
            <div style="flex:1;">
              <div style="font-weight:600;color:var(--text);margin-bottom:2px;">
                <span style="color:var(--muted);font-size:12px;margin-right:6px;">${htmlEscape(c.code)}</span>
                ${htmlEscape(c.name)}
              </div>
              <div style="font-size:12px;color:var(--muted);">
                ${amountLabel}: <strong style="color:var(--text);">${valueDisplay}</strong>
              </div>
            </div>
          </div>
          <div class="row" style="gap:6px;align-items:center;">
            <button data-id="${c._id}" class="secondary x-del" style="padding:6px 12px;font-size:12px;border-color:var(--danger, #ef4444);color:var(--danger, #ef4444);" title="Eliminar concepto">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      </div>`;
    });
    
    const container = el('pc-list');
    if (!container) return;
    
    if (list.length === 0) {
      container.innerHTML = '<div class="muted" style="text-align:center;padding:24px;border:1px dashed var(--border);border-radius:8px;">No hay conceptos configurados. Crea el primero arriba.</div>';
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
      container.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;">
        ❌ Error al cargar conceptos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function addConcept(){
  try {
    const type = el('pc-type')?.value;
    const amountType = el('pc-amountType')?.value;
    const code = (el('pc-code')?.value || '').trim().toUpperCase();
    const name = (el('pc-name')?.value || '').trim();
    const valueStr = (el('pc-value')?.value || '').trim();
    
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
    
    let allowOver100 = false;
    if (amountType === 'percent' && defaultValue > 100) {
      if (!confirm('⚠️ El porcentaje es mayor a 100%. ¿Deseas continuar?')) {
        return;
      }
      allowOver100 = true;
    }
    
    if (!type || !amountType) {
      alert('⚠️ Selecciona tipo y tipo de monto');
      return;
    }
    
    const payload = {
      type,
      amountType,
      code,
      name,
      defaultValue,
      isActive: true,
      ...(allowOver100 ? { allowOver100: true } : {})
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
      
      // Recargar lista
      await loadConcepts();
      
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
    const names = r.technicians || [];
    const opts = names.map(n => `<option value="${htmlEscape(n)}">${htmlEscape(n)}</option>`).join('');
    
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
      if (names.length === 0) {
        listEl.innerHTML = '<div class="muted" style="text-align:center;padding:12px;font-size:13px;">No hay técnicos registrados. Crea el primero arriba.</div>';
      } else {
        listEl.innerHTML = names.map(n => {
          return `<div class="technician-chip" style="display:inline-flex;align-items:center;gap:8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:var(--text);padding:8px 12px;border-radius:8px;font-size:13px;font-weight:500;">
            <span>👤 ${htmlEscape(n)}</span>
            <button class="x-del" data-name="${htmlEscape(n)}" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;transition:all 0.2s;" title="Eliminar técnico" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
              🗑️ Eliminar
            </button>
          </div>`;
        }).join('');
        
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
                el('pa-list').innerHTML = '<div class="muted" style="padding:16px;text-align:center;border:1px dashed var(--border);border-radius:8px;font-size:13px;">Selecciona un técnico para ver sus asignaciones personalizadas.</div>';
              }
              
              // Limpiar también el selector de liquidaciones si está seleccionado
              const techSel3 = document.getElementById('pl-technicianSel');
              if (techSel3 && techSel3.value === name) {
                techSel3.value = '';
                const conceptsContainer = document.getElementById('pl-concepts-container');
                if (conceptsContainer) {
                  conceptsContainer.innerHTML = '<div class="muted" style="width:100%;text-align:center;font-size:12px;padding:8px;">Selecciona período y técnico primero</div>';
                }
              }
              
              await loadTechnicians();
            } catch (err) {
              alert('❌ Error al eliminar técnico: ' + (err.message || 'Error desconocido'));
              btn.disabled = false;
              btn.innerHTML = '🗑️ Eliminar';
            }
          });
        });
      }
    }
  } catch (err) {
    console.error('Error loading technicians:', err);
    const listEl = document.getElementById('tk-list');
    if (listEl) {
      listEl.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
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
      container.innerHTML = '<div class="muted" style="text-align:center;padding:24px;border:1px dashed var(--border);border-radius:8px;">No hay períodos creados. Crea el primero arriba.</div>';
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
      
      return `<div class="period-row" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--card);transition:all 0.2s;">
        <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="row" style="gap:12px;align-items:center;flex:1;min-width:200px;">
            ${statusBadge}
            <div style="flex:1;">
              <div style="font-weight:600;color:var(--text);margin-bottom:2px;">
                ${typeInfo.icon} ${htmlEscape(typeInfo.label)} · ${days} días
              </div>
              <div style="font-size:12px;color:var(--muted);">
                ${startStr} → ${endStr}
              </div>
            </div>
          </div>
          <div class="row" style="gap:8px;align-items:center;">
            <div style="font-size:12px;color:var(--muted);">
              ID: <code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;">${String(p._id).slice(-8)}</code>
            </div>
            ${p.status === 'open' ? `<button class="x-close-period" data-id="${p._id}" style="padding:6px 12px;font-size:12px;border-color:var(--danger, #ef4444);color:var(--danger, #ef4444);background:rgba(239,68,68,0.1);border-radius:6px;cursor:pointer;" title="Cerrar período">🔒 Cerrar</button>` : ''}
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
      container.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
        ❌ Error al cargar períodos: ${htmlEscape(err.message || 'Error desconocido')}
      </div>`;
    }
  }
}

async function loadAssignments(){
  try {
    const techName = document.getElementById('pa-technicianSel')?.value;
    if (!techName) {
      el('pa-list').innerHTML = '<div class="muted" style="padding:16px;text-align:center;border:1px dashed var(--border);border-radius:8px;font-size:13px;">Selecciona un técnico para ver sus asignaciones personalizadas.</div>';
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
      container.innerHTML = `<div class="muted" style="padding:16px;text-align:center;border:1px dashed var(--border);border-radius:8px;font-size:13px;">
        <strong>${htmlEscape(techName)}</strong> no tiene asignaciones personalizadas.<br/>
        <span style="font-size:12px;">Usará los valores por defecto de los conceptos.</span>
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
      
      return `<div class="assignment-row" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--card);transition:all 0.2s;">
        <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="row" style="gap:12px;align-items:center;flex:1;min-width:200px;">
            <span class="concept-badge" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}20;">
              ${htmlEscape(typeInfo.label)}
            </span>
            <div style="flex:1;">
              <div style="font-weight:600;color:var(--text);margin-bottom:2px;">
                <span style="color:var(--muted);font-size:12px;margin-right:6px;">${htmlEscape(conceptCode)}</span>
                ${htmlEscape(conceptName)}
              </div>
              <div style="font-size:12px;color:var(--muted);">
                Valor por defecto: <strong style="color:var(--text);">${defaultDisplay}</strong>
              </div>
            </div>
          </div>
          <div class="row" style="gap:16px;align-items:center;">
            <div style="text-align:right;">
              <div style="font-size:12px;color:var(--muted);margin-bottom:2px;">Valor personalizado:</div>
              <div style="font-size:16px;font-weight:600;color:var(--text);">${valueDisplay}</div>
            </div>
            <button class="x-del-assignment" data-id="${a._id}" data-concept-id="${a.conceptId}" style="padding:6px 12px;font-size:12px;border-color:var(--danger, #ef4444);color:var(--danger, #ef4444);background:rgba(239,68,68,0.1);border-radius:6px;cursor:pointer;" title="Eliminar asignación">
              🗑️
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
    
    container.innerHTML = `
      <div style="margin-bottom:8px;">
        <h4 style="margin:0;font-size:14px;font-weight:600;">Asignaciones de <strong>${htmlEscape(techName)}</strong></h4>
        <p class="muted" style="margin:4px 0 0 0;font-size:12px;">${assignments.length} asignación(es) personalizada(s)</p>
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
      container.innerHTML = `<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
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

// Función para cargar conceptos asignados al técnico seleccionado
async function loadConceptsForTechnician(){
  try {
    const technicianName = document.getElementById('pl-technicianSel')?.value?.trim();
    const container = document.getElementById('pl-concepts-container');
    if (!container) return;
    
    if (!technicianName) {
      container.innerHTML = '<div class="muted" style="width:100%;text-align:center;font-size:12px;padding:8px;">Selecciona período y técnico primero</div>';
      return;
    }
    
    // Obtener asignaciones del técnico
    const assignments = await api.get('/api/v1/payroll/assignments', { technicianName });
    
    if (!assignments || assignments.length === 0) {
      container.innerHTML = '<div class="muted" style="width:100%;text-align:center;font-size:12px;padding:8px;">Este técnico no tiene conceptos asignados. Asigna conceptos en la pestaña "Asignaciones".</div>';
      return;
    }
    
    // Obtener los conceptos de las asignaciones
    const conceptIds = assignments.map(a => a.conceptId).filter(Boolean);
    if (conceptIds.length === 0) {
      container.innerHTML = '<div class="muted" style="width:100%;text-align:center;font-size:12px;padding:8px;">No se encontraron conceptos asignados.</div>';
      return;
    }
    
    // Obtener detalles de los conceptos
    const allConcepts = await api.get('/api/v1/payroll/concepts');
    const assignedConcepts = allConcepts.filter(c => conceptIds.some(id => String(id) === String(c._id)));
    
    if (assignedConcepts.length === 0) {
      container.innerHTML = '<div class="muted" style="width:100%;text-align:center;font-size:12px;padding:8px;">No se encontraron conceptos activos asignados.</div>';
      return;
    }
    
    // Renderizar checkboxes de conceptos asignados
    const typeLabels = {
      'earning': { label: 'Ingreso', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      'deduction': { label: 'Descuento', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      'surcharge': { label: 'Recargo', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
    };
    
    container.innerHTML = assignedConcepts.map(c => {
      // Buscar asignación para obtener valueOverride si existe
      const assignment = assignments.find(a => String(a.conceptId) === String(c._id));
      const displayValue = assignment?.valueOverride !== null && assignment?.valueOverride !== undefined 
        ? (c.amountType === 'percent' ? `${assignment.valueOverride}%` : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(assignment.valueOverride))
        : (c.amountType === 'percent' 
          ? `${c.defaultValue || 0}%` 
          : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(c.defaultValue || 0));
      
      const typeInfo = typeLabels[c.type] || { label: c.type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
      const overrideBadge = assignment?.valueOverride !== null && assignment?.valueOverride !== undefined 
        ? '<span style="padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;background:rgba(59,130,246,0.1);color:#3b82f6;border:1px solid #3b82f6;">Personalizado</span>'
        : '';
      
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--card);cursor:pointer;transition:all 0.2s;user-select:none;" onmouseover="this.style.background='rgba(148,163,184,0.1)'" onmouseout="this.style.background='var(--card)'">
        <input type="checkbox" value="${c._id}" data-concept-id="${c._id}" style="cursor:pointer;margin:0;" />
        <span style="padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}20;">
          ${htmlEscape(typeInfo.label)}
        </span>
        <span style="font-weight:500;color:var(--text);font-size:13px;">${htmlEscape(c.code)} · ${htmlEscape(c.name)}</span>
        ${overrideBadge}
        <span style="margin-left:auto;font-size:12px;color:var(--muted);">${displayValue}</span>
      </label>`;
    }).join('');
    
    // Agregar event listeners a los checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        // No hacer nada especial, solo mantener el estado
      });
    });
  } catch (err) {
    console.error('Error loading assigned concepts:', err);
    const container = document.getElementById('pl-concepts-container');
    if (container) {
      container.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:8px;">Error al cargar conceptos asignados</div>';
    }
  }
}

// Obtener conceptos seleccionados
function getSelectedConceptIds(){
  const container = document.getElementById('pl-concepts-container');
  if (!container) return [];
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value).filter(id => id);
}

async function preview(){
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
    
    const payload = {
      periodId,
      technicianName,
      selectedConceptIds
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
      
      const renderItems = (items, title) => {
        if (!items || items.length === 0) return '';
        return `
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;">${title}</h4>
            ${items.map(i => {
              const typeInfo = typeLabels[i.type] || { label: i.type, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
              return `<div class="row between" style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;background:var(--card);">
                <div class="row" style="gap:10px;align-items:center;flex:1;">
                  <span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${typeInfo.bg};color:${typeInfo.color};border:1px solid ${typeInfo.color}20;">
                    ${htmlEscape(typeInfo.label)}
                  </span>
                  <span style="font-weight:500;color:var(--text);">${htmlEscape(i.name)}</span>
                  ${i.calcRule ? `<span class="muted" style="font-size:11px;">(${htmlEscape(i.calcRule)})</span>` : ''}
                </div>
                <div style="font-weight:600;color:var(--text);font-size:14px;">
                  ${formatMoney(i.value)}
                </div>
              </div>`;
            }).join('')}
          </div>`;
      };
      
      el('pl-result').innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;">
          <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
            <h4 style="margin:0 0 8px 0;font-size:16px;font-weight:600;">Vista previa de liquidación</h4>
            <div class="row" style="gap:16px;flex-wrap:wrap;">
              <div style="font-size:13px;color:var(--muted);">
                <strong>Técnico:</strong> ${htmlEscape(r.technicianName || technicianName)}
              </div>
              <div style="font-size:13px;color:var(--muted);">
                <strong>Período:</strong> ${document.getElementById('pl-periodSel').options[document.getElementById('pl-periodSel').selectedIndex]?.textContent || 'N/A'}
              </div>
            </div>
          </div>
          
          ${renderItems(earnings, 'Ingresos')}
          ${renderItems(surcharges, 'Recargos')}
          ${renderItems(deductions, 'Descuentos')}
          
          <div style="margin-top:16px;padding-top:16px;border-top:2px solid var(--border);">
            <div class="row between" style="margin-bottom:8px;">
              <span style="font-weight:600;color:var(--text);">Total bruto:</span>
              <span style="font-weight:600;color:var(--text);font-size:16px;">${formatMoney(r.grossTotal)}</span>
            </div>
            <div class="row between" style="margin-bottom:8px;">
              <span style="font-weight:600;color:var(--text);">Total descuentos:</span>
              <span style="font-weight:600;color:#ef4444;font-size:16px;">-${formatMoney(r.deductionsTotal)}</span>
            </div>
            <div class="row between" style="padding:12px;background:rgba(59,130,246,0.1);border-radius:6px;margin-top:8px;">
              <span style="font-weight:700;color:var(--text);font-size:16px;">Neto a pagar:</span>
              <span style="font-weight:700;color:#10b981;font-size:20px;">${formatMoney(r.netTotal)}</span>
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
    
    // Confirmar aprobación
    const periodText = document.getElementById('pl-periodSel').options[document.getElementById('pl-periodSel').selectedIndex]?.textContent || 'este período';
    if (!confirm(`¿Aprobar la liquidación de ${technicianName} para el período ${periodText}?\n\nSe calcularán las comisiones y se aplicarán los conceptos seleccionados.`)) {
      return;
    }
    
    const payload = {
      periodId,
      technicianName,
      selectedConceptIds
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
        <div style="padding:16px;background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:8px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:24px;">✓</span>
            <h4 style="margin:0;font-size:16px;font-weight:600;color:#10b981;">Liquidación aprobada</h4>
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">
            <strong>Técnico:</strong> ${htmlEscape(r.technicianName || technicianName)}
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">
            <strong>Período:</strong> ${periodText}
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">
            <strong>Neto a pagar:</strong> ${formatMoney(r.netTotal || 0)}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:8px;">
            ID: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:11px;">${String(r._id).slice(-8)}</code>
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
      container.innerHTML = '<div class="muted" style="text-align:center;padding:16px;border:1px dashed var(--border);border-radius:8px;font-size:13px;">No hay liquidaciones pendientes de pago.</div>';
      select.innerHTML = '<option value="">No hay liquidaciones pendientes</option>';
      return;
    }
    
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    
    // Renderizar listado
    const rows = items.map(s => {
      const createdAt = new Date(s.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<div class="pending-settlement-row" data-id="${s._id}" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--card);cursor:pointer;transition:all 0.2s;" onclick="selectSettlementForPayment('${s._id}')">
        <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="row" style="gap:12px;align-items:center;flex:1;min-width:200px;">
            <div style="flex:1;">
              <div style="font-weight:600;color:var(--text);margin-bottom:2px;">
                👤 ${htmlEscape(s.technicianName||'Sin nombre')}
              </div>
              <div style="font-size:12px;color:var(--muted);">
                Aprobada: ${createdAt}
              </div>
            </div>
          </div>
          <div style="text-align:right;font-size:12px;color:var(--muted);">
            <div>Bruto: <strong style="color:var(--text);">${formatMoney(s.grossTotal)}</strong></div>
            <div>Desc: <strong style="color:#ef4444;">-${formatMoney(s.deductionsTotal)}</strong></div>
            <div style="margin-top:4px;font-size:16px;font-weight:700;color:#10b981;">Neto: ${formatMoney(s.netTotal)}</div>
          </div>
        </div>
      </div>`;
    }).join('');
    
    container.innerHTML = rows;
    
    // Poblar select
    select.innerHTML = '<option value="">Seleccione liquidación…</option>' + items.map(s => {
      const techName = s.technicianName || 'Sin nombre';
      const netTotal = formatMoney(s.netTotal);
      return `<option value="${s._id}" data-net="${s.netTotal}">${htmlEscape(techName)} - ${netTotal}</option>`;
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

function updateSettlementInfo(){
  const select = document.getElementById('pp-settlementSel');
  const infoEl = document.getElementById('pp-settlement-info');
  if (!select || !infoEl) return;
  
  const selectedOption = select.options[select.selectedIndex];
  if (!selectedOption || !selectedOption.value) {
    infoEl.style.display = 'none';
    return;
  }
  
  const netTotal = selectedOption.dataset.net || '0';
  const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
  
  infoEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:20px;">💰</span>
      <div style="flex:1;">
        <div style="font-weight:600;color:var(--text);margin-bottom:2px;">Liquidación seleccionada</div>
        <div style="font-size:12px;color:var(--muted);">
          Monto a pagar: <strong style="color:#10b981;font-size:14px;">${formatMoney(netTotal)}</strong>
        </div>
      </div>
    </div>
  `;
  infoEl.style.display = 'block';
}

async function pay(){
  try {
    const settlementId = document.getElementById('pp-settlementSel')?.value?.trim();
    const accountId = document.getElementById('pp-accountSel')?.value?.trim();
    const dateInput = document.getElementById('pp-date')?.value?.trim();
    
    // Validaciones
    if (!settlementId) {
      alert('⚠️ Selecciona una liquidación');
      document.getElementById('pp-settlementSel')?.focus();
      return;
    }
    
    if (!accountId) {
      alert('⚠️ Selecciona una cuenta de pago');
      document.getElementById('pp-accountSel')?.focus();
      return;
    }
    
    // Validar fecha si se proporciona
    let date = null;
    if (dateInput) {
      const dateObj = new Date(dateInput);
      if (isNaN(dateObj.getTime())) {
        alert('⚠️ Fecha inválida');
        document.getElementById('pp-date')?.focus();
        return;
      }
      date = dateInput;
    }
    
    // Obtener información de la liquidación para confirmación
    const settlementOption = document.getElementById('pp-settlementSel').options[document.getElementById('pp-settlementSel').selectedIndex];
    const technicianName = settlementOption?.textContent?.split(' - ')[0] || 'Técnico';
    const netTotal = settlementOption?.dataset.net || '0';
    const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
    
    // Confirmar pago
    if (!confirm(`¿Registrar pago de ${formatMoney(netTotal)} a ${technicianName}?\n\nEl pago se registrará en el Flujo de Caja.`)) {
      return;
    }
    
    const payload = {
      settlementId,
      accountId,
      ...(date ? { date } : {})
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
      document.getElementById('pp-accountSel').value = '';
      document.getElementById('pp-date').value = '';
      document.getElementById('pp-settlement-info').style.display = 'none';
      
      // Mostrar mensaje de éxito
      el('pp-result').innerHTML = `
        <div style="padding:16px;background:rgba(16,185,129,0.1);border:1px solid #10b981;border-radius:8px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:24px;">✓</span>
            <h4 style="margin:0;font-size:16px;font-weight:600;color:#10b981;">Pago registrado exitosamente</h4>
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">
            <strong>Técnico:</strong> ${htmlEscape(technicianName)}
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">
            <strong>Monto:</strong> ${formatMoney(netTotal)}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:8px;">
            ID CashFlow: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:11px;">${String(r.cashflow._id).slice(-8)}</code>
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
      }
      
      el('pp-result').innerHTML = `
        <div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;color:#ef4444;font-size:13px;">
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
      
      return `<div class="settlement-row" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--card);transition:all 0.2s;">
        <div class="row between" style="align-items:center;flex-wrap:wrap;gap:8px;">
          <div class="row" style="gap:12px;align-items:center;flex:1;min-width:200px;">
            <span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;background:${statusInfo.bg};color:${statusInfo.color};border:1px solid ${statusInfo.color}20;">
              ${htmlEscape(statusInfo.label)}
            </span>
            <div style="flex:1;">
              <div style="font-weight:600;color:var(--text);margin-bottom:2px;">
                👤 ${htmlEscape(s.technicianName||'Sin nombre')}
              </div>
              <div style="font-size:12px;color:var(--muted);">
                ${createdAt}
              </div>
            </div>
          </div>
          <div class="row" style="gap:16px;align-items:center;flex-wrap:wrap;">
            <div style="text-align:right;font-size:12px;color:var(--muted);">
              <div>Bruto: <strong style="color:var(--text);">${formatMoney(s.grossTotal)}</strong></div>
              <div>Desc: <strong style="color:#ef4444;">-${formatMoney(s.deductionsTotal)}</strong></div>
              <div style="margin-top:4px;font-size:14px;font-weight:600;color:#10b981;">Neto: ${formatMoney(s.netTotal)}</div>
            </div>
            <div class="row" style="gap:8px;">
              <a href="${printUrl}" target="_blank" style="padding:6px 12px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-decoration:none;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.1)'" onmouseout="this.style.background='var(--bg)'" title="Imprimir con template configurado">
                🖨️ Imprimir
              </a>
              <button data-settlement-id="${settlementId}" class="pdf-download-btn" style="padding:6px 12px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='var(--bg)'" title="Descargar PDF">
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
    const existingPreview = container.querySelector('.row.between')?.closest('div[style*="background:var(--card)"]');
    const previewHtml = existingPreview ? existingPreview.outerHTML : '';
    
    if (items.length === 0 && !previewHtml) {
      container.innerHTML = '<div class="muted" style="text-align:center;padding:24px;border:1px dashed var(--border);border-radius:8px;">No hay liquidaciones aprobadas para este período.</div>';
      return;
    }
    
    const summaryHtml = items.length > 0 ? `
      <div style="margin-top:16px;padding-top:16px;border-top:2px solid var(--border);">
        <h4 style="margin:0 0 12px 0;font-size:14px;font-weight:600;">Resumen del período</h4>
        <div class="row" style="gap:24px;flex-wrap:wrap;justify-content:flex-end;">
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:2px;">Total Bruto</div>
            <div style="font-size:16px;font-weight:600;color:var(--text);">${formatMoney(summary.grossTotal)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:2px;">Total Descuentos</div>
            <div style="font-size:16px;font-weight:600;color:#ef4444;">-${formatMoney(summary.deductionsTotal)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:2px;">Total Neto</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;">${formatMoney(summary.netTotal)}</div>
          </div>
        </div>
      </div>
    ` : '';
    
    container.innerHTML = `
      ${previewHtml}
      ${items.length > 0 ? `
        <div style="margin-top:${previewHtml ? '16px' : '0'};">
          <h4 style="margin:0 0 12px 0;font-size:14px;font-weight:600;">Liquidaciones aprobadas</h4>
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
      
      if (errorMsg.includes('solapa') || errorMsg.includes('overlapping')) {
        userMsg = '⚠️ Ya existe un período que se solapa con estas fechas. Verifica las fechas e intenta nuevamente.';
      } else if (errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
        userMsg = '⚠️ Ya existe un período con estas fechas exactas.';
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
  switchTab('concepts');
}

function switchTab(name){
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b=> b.classList.toggle('active', b.dataset.subtab===name));
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
    const input = document.getElementById('tk-add-name');
    const name = (input?.value || '').trim();
    
    // Validaciones
    if (!name) {
      alert('⚠️ Ingresa un nombre de técnico');
      input?.focus();
      return;
    }
    
    if (name.length < 2) {
      alert('⚠️ El nombre debe tener al menos 2 caracteres');
      input?.focus();
      return;
    }
    
    if (name.length > 100) {
      alert('⚠️ El nombre no puede exceder 100 caracteres');
      input?.focus();
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
      await api.post('/api/v1/company/technicians', { name });
      
      // Limpiar campo
      input.value = '';
      
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
      input?.focus();
    }
  } catch (err) {
    console.error('Error in createTechnician:', err);
    alert('❌ Error inesperado: ' + (err.message || 'Error desconocido'));
  }
}

document.addEventListener('DOMContentLoaded', init);


