#!/usr/bin/env node
/**
 * Genera un XLSX de plantilla para import de lista de precios GENERAL
 * (SERVICIO / PRODUCTO / COMBO con hasta 5 productos y slot abierto).
 *
 * Uso:
 *   node scripts/generate_prices_import_template.js [--out ./plantilla-import-precios-general.xlsx]
 */

import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [key, val] = token.split('=');
      out[key] = val;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[token] = argv[i + 1];
      i++;
    } else {
      out[token] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const outPath = args.out || path.join(process.cwd(), 'plantilla-import-precios-general.xlsx');

const headers = [
  'Nombre*',
  'Tipo* (SERVICIO|PRODUCTO|COMBO)',
  'Precio total',
  'Valor inversión (opcional)',
  'Valor mano de obra (opcional)',
  'Tipo mano de obra (opcional)',
  'Año desde (opcional)',
  'Año hasta (opcional)',
];

for (let i = 1; i <= 5; i++) {
  headers.push(
    `Combo${i} Nombre`,
    `Combo${i} Cantidad`,
    `Combo${i} Precio unitario`,
    `Combo${i} ItemSKU (opcional)`,
    `Combo${i} ItemId (opcional)`,
    `Combo${i} Slot abierto (SI|NO)`
  );
}

const examples = [
  [
    'Cambio de aceite',
    'SERVICIO',
    '50000',
    '0',
    '0',
    '',
    '',
    '',
    ...Array.from({ length: 5 }, () => ['', '', '', '', '', ''])
  ],
  [
    'Filtro de aceite',
    'PRODUCTO',
    '45000',
    '0',
    '0',
    '',
    '',
    '',
    ...Array.from({ length: 5 }, () => ['', '', '', '', '', ''])
  ],
  [
    'Combo mantenimiento básico',
    'COMBO',
    '0',
    '25000',
    '15000',
    'MOTOR',
    '2021',
    '2025',
    'Aceite 5W30',
    '1',
    '80000',
    'SKU-ACEITE-5W30',
    '',
    'NO',
    'Filtro (slot abierto)',
    '1',
    '20000',
    '',
    '',
    'SI',
    ...Array.from({ length: 3 }, () => ['', '', '', '', '', ''])
  ]
];

const wsData = [headers, ...examples];
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.aoa_to_sheet(wsData);
xlsx.utils.book_append_sheet(wb, ws, 'PRECIOS');

const info = [
  ['INSTRUCCIONES'],
  ['- Columnas con * son obligatorias.'],
  ['- Tipo debe ser: SERVICIO, PRODUCTO o COMBO.'],
  ['- "Valor inversión" es opcional: se usa para autocompletar inversión al cerrar la venta (se suma por ítems).'],
  ['- PRODUCTO: se importa solo con nombre y precio (sin SKU/ItemId).'],
  ['- COMBO: llena hasta 5 productos (Combo1..Combo5).'],
  ['  - Si "Slot abierto" es SI, NO debes indicar SKU/ItemId (se asigna al cerrar venta/QR).'],
  ['  - Si "Precio total" es 0, se calculará como suma(qty * precio unitario).'],
  ['- Año desde/hasta son opcionales (aplica solo si el año del vehículo cae en el rango).'],
];
const wsInfo = xlsx.utils.aoa_to_sheet(info);
xlsx.utils.book_append_sheet(wb, wsInfo, 'INFO');

const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(outPath, buf);
// eslint-disable-next-line no-console
console.log(`✅ Plantilla generada: ${outPath}`);

