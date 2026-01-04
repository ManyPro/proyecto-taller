// Script para leer y analizar el Excel de mantenimiento Renault
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '../../Frontend/assets/plan_mantenimiento_renault_para_web.xlsx');

console.log('📖 Leyendo Excel de mantenimiento...');
console.log('📂 Ruta:', excelPath);

if (!fs.existsSync(excelPath)) {
  console.error('❌ Archivo no encontrado:', excelPath);
  process.exit(1);
}

try {
  const workbook = xlsx.readFile(excelPath);
  console.log('\n📋 Hojas disponibles:', workbook.SheetNames);
  
  // Leer todas las hojas
  workbook.SheetNames.forEach((sheetName, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 Hoja ${index + 1}: ${sheetName}`);
    console.log('='.repeat(60));
    
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
    
    console.log(`\n📊 Total de filas: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log('\n🔍 Primera fila (ejemplo):');
      console.log(JSON.stringify(rows[0], null, 2));
      
      console.log('\n📝 Columnas disponibles:');
      const columns = Object.keys(rows[0]);
      columns.forEach((col, i) => {
        console.log(`   ${i + 1}. ${col}`);
      });
      
      if (rows.length > 1) {
        console.log('\n📋 Primeras 5 filas:');
        rows.slice(0, 5).forEach((row, i) => {
          console.log(`\n   Fila ${i + 1}:`);
          Object.entries(row).forEach(([key, value]) => {
            if (value && String(value).trim()) {
              console.log(`      ${key}: ${value}`);
            }
          });
        });
      }
    }
  });
  
  console.log('\n✅ Análisis completado');
} catch (error) {
  console.error('❌ Error al leer Excel:', error.message);
  console.error(error.stack);
  process.exit(1);
}

