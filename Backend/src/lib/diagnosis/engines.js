export const RENAULT_ENGINES = [
  { code: 'H5H', label: 'H5H / H5Ht 1.3 turbo', family: 'H5H', displacement: '1.3', aspiration: 'turbo' },
  { code: 'H5Ht', label: 'H5Ht 1.3 turbo', family: 'H5H', displacement: '1.3', aspiration: 'turbo' },
  { code: 'H4M', label: 'H4M 1.6', family: 'H4M', displacement: '1.6', aspiration: 'na' },
  { code: 'K4M', label: 'K4M 1.6 16V', family: 'K4M', displacement: '1.6', aspiration: 'na' },
  { code: 'F4R', label: 'F4R 2.0', family: 'F4R', displacement: '2.0', aspiration: 'na' },
  { code: 'B4D', label: 'B4D 1.0 Kwid', family: 'B4D', displacement: '1.0', aspiration: 'na' },
  { code: 'K7M', label: 'K7M 1.6 8V', family: 'K7M', displacement: '1.6', aspiration: 'na' },
  { code: 'UNKNOWN', label: 'No lo sé', family: null, displacement: null, aspiration: null },
  { code: 'OTHER', label: 'Otro / no listado', family: null, displacement: null, aspiration: null }
];

export const WHEN_OPTIONS = ['frio', 'caliente', 'ralenti', 'aceleracion', 'carga', 'arranque', 'intermitente'];
export const TRANSMISSION_OPTIONS = ['manual', 'automatica', 'cvt', 'no_se'];
export const FUEL_OPTIONS = ['gasolina', 'diesel', 'hibrido', 'no_se'];
export const DTC_STATUS_OPTIONS = ['sin_codigos', 'no_leidos', 'con_codigos'];
export const CASE_STATUS_OPTIONS = ['abierto', 'esperando_medicion', 'pausado', 'pendiente_verificacion', 'cerrado'];
export const HYPOTHESIS_LEVELS = ['posible', 'respaldada_por_estas_pruebas', 'confirmada_por_el_tecnico'];
export const PARAM_INPUT_TYPES = ['numero', 'si_no', 'texto', 'grupo'];
export const REFERENCE_ORIGINS = ['fabricante', 'orientativa_general', 'vehiculo_sano', 'pendiente'];
export const SKIP_REASONS = ['no_encuentro_parametro', 'no_tengo_herramienta', 'no_puedo_realizar_prueba'];

export function findEngine(code) {
  const key = String(code || '').trim();
  return RENAULT_ENGINES.find((e) => e.code.toLowerCase() === key.toLowerCase()) || null;
}
