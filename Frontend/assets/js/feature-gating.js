// assets/js/feature-gating.js
// Centraliza las utilidades de opciones/restricciones para evitar ciclos entre módulos.
import { API } from './api.esm.js';

let featureOptionsCache = null;
let restrictionsCache = null;
let inflight = null;

/**
 * Carga y cachea opciones de subfuncionalidades y restricciones por empresa.
 * El llamado es compartido entre app.js, ventas e inventario.
 * @param {{ force?: boolean }} opts
 */
export async function loadFeatureOptionsAndRestrictions(opts = {}) {
  const { force = false } = opts;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const fo = await API.company.getFeatureOptions();
      featureOptionsCache = fo || {};
    } catch {
      featureOptionsCache = featureOptionsCache || {};
    }
    try {
      const r = await API.company.getRestrictions();
      restrictionsCache = r || {};
    } catch {
      restrictionsCache = restrictionsCache || {};
    }
    return {
      featureOptions: featureOptionsCache || {},
      restrictions: restrictionsCache || {}
    };
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getFeatureOptions() {
  return featureOptionsCache || {};
}

export function getRestrictions() {
  return restrictionsCache || {};
}

// Helper para mostrar/ocultar nodos según sub-feature habilitada.
export function gateElement(enabled, selector) {
  try {
    document.querySelectorAll(selector).forEach((el) => {
      if (enabled) {
        el.classList.add('js-show');
        el.classList.remove('js-hide');
      } else {
        el.classList.add('js-hide');
        el.classList.remove('js-show');
      }
    });
  } catch {
    // noop
  }
}
