#!/usr/bin/env node
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/*
Script maestro para importar todos los datos legacy:
1. Limpia datos legacy existentes
2. Importa clientes
3. Importa órdenes con productos y servicios
*/

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [k, v] = token.split(/=(.*)/);
      out[k] = v;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[token] = next; i++; }
      else out[token] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const mongoUri = args.mongo || process.env.MONGODB_URI;
const dryRun = !!args.dry;
const limit = args.limit || null;

if (!mongoUri) {
  console.error('❌ Error: Falta --mongo o MONGODB_URI en variables de entorno');
  console.error('Usage: node scripts/import_all_legacy.js --mongo "mongodb://..." [--dry] [--limit 1000]');
  process.exit(1);
}

const baseDir = path.join(__dirname, 'excels');
const ordersPath = path.join(baseDir, 'ordenesfinal.csv');
const clientsPath = path.join(baseDir, 'clientesfinal.csv');
const vehiclesPath = path.join(baseDir, 'automovilfinal.csv');
const remisPath = path.join(baseDir, 'remis.csv');
const productsPath = path.join(baseDir, 'productos.csv');
const servicesPath = path.join(baseDir, 'servicios.csv');

// Company IDs por defecto (Shelby y Casa Renault)
const companyMap = args.companyMap || '2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1';

async function runCommand(cmd, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${description}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Ejecutando: ${cmd.split('--mongo')[0]}...`);
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: path.join(__dirname, '..') });
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('warning')) console.error(stderr);
    return true;
  } catch (error) {
    console.error(`❌ Error ejecutando: ${description}`);
    console.error(error.message);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

async function main() {
  console.log('🚀 Iniciando importación completa de datos legacy');
  console.log(`MongoDB URI: ${mongoUri.split('@').pop() || mongoUri}`);
  console.log(`Modo: ${dryRun ? 'DRY RUN (preview)' : 'REAL (importación)'}`);
  if (limit) console.log(`Límite: ${limit} registros`);
  
  // 1. Limpiar datos legacy existentes
  if (!dryRun) {
    const cleanCmd = `node scripts/clean_legacy_data.js --mongo "${mongoUri}" --force`;
    const cleaned = await runCommand(cleanCmd, 'Limpiando datos legacy existentes');
    if (!cleaned) {
      console.error('❌ Error en limpieza. Abortando.');
      process.exit(1);
    }
  } else {
    const cleanCmd = `node scripts/clean_legacy_data.js --mongo "${mongoUri}" --dry`;
    await runCommand(cleanCmd, 'Preview: Datos legacy que se eliminarían');
  }

  // 2. Importar clientes
  const clientsCmd = `node scripts/import_clients_from_legacy.js --orders "${ordersPath}" --clients "${clientsPath}" --vehicles "${vehiclesPath}" --mongo "${mongoUri}" --companyMap "${companyMap}"${dryRun ? ' --dry' : ''}${limit ? ` --limit ${limit}` : ''}`;
  const clientsImported = await runCommand(clientsCmd, 'Importando clientes');
  if (!clientsImported && !dryRun) {
    console.error('❌ Error importando clientes. Continuando con órdenes...');
  }

  // 3. Importar órdenes (con productos y servicios)
  const ordersCmd = `node scripts/import_orders_from_legacy.js --orders "${ordersPath}" --clients "${clientsPath}" --vehicles "${vehiclesPath}" --remisions "${remisPath}" --products "${productsPath}" --services "${servicesPath}" --mongo "${mongoUri}" --companyMap "${companyMap}"${dryRun ? ' --dry' : ''}${limit ? ` --limit ${limit}` : ''}`;
  const ordersImported = await runCommand(ordersCmd, 'Importando órdenes con productos y servicios');
  if (!ordersImported && !dryRun) {
    console.error('❌ Error importando órdenes.');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Importación completada');
  console.log(`${'='.repeat(60)}`);
  
  if (dryRun) {
    console.log('\n💡 Para ejecutar la importación real, ejecuta sin --dry');
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});

