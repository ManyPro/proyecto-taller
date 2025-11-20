#!/usr/bin/env node
/**
 * Test COMPLETO y ROBUSTO de importación en modo DRY RUN
 * 
 * Verifica exhaustivamente:
 * 1. Estructura de datos CSV
 * 2. Relaciones entre archivos
 * 3. Validación de datos antes de importar
 * 4. Clientes con vehicleId vinculado
 * 5. Búsqueda por placa funciona
 * 6. Ventas se importan correctamente
 * 7. Integridad referencial
 * 8. Performance y optimizaciones
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import Sale from '../src/models/Sale.js';
import Vehicle from '../src/models/Vehicle.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.join(__dirname, 'excels');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const CASA_RENAULT_ID = '68c871198d7595062498d7a1';
const SERVITECA_SHELBY_ID = '68cb18f4202d108152a26e4c';

const results = {
  passed: 0,
  failed: 0,
  tests: [],
  warnings: []
};

function logTest(name, passed, message = '') {
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}${message ? ': ' + message : ''}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}${message ? ': ' + message : ''}`);
  }
}

function logWarning(message) {
  results.warnings.push(message);
  console.log(`⚠️  ${message}`);
}

// Función parseCSV (copiada del script de importación para independencia)
async function parseCSV(filePath, { delimiter, encoding }) {
  const rows = [];
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Archivo no encontrado: ${filePath}`);
    return rows;
  }
  
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding }),
    crlfDelay: Infinity
  });
  
  let headers = null;
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    
    const cols = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cols.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.length) cols.push(current.trim());
    
    const cleanCols = cols.map(c => c.replace(/^\"|\"$/g, '').trim());
    if (!headers) {
      headers = cleanCols;
      continue;
    }
    
    const obj = Object.fromEntries(headers.map((h, idx) => [h, cleanCols[idx] ?? '']));
    rows.push(obj);
  }
  
  return rows;
}

async function testCSVStructure() {
  console.log('\n📋 TEST 1: Verificar estructura de archivos CSV');
  console.log('='.repeat(60));
  
  try {
    // Verificar que los archivos existen
    const files = {
      orders: path.join(baseDir, 'OrdenesDB.csv'),
      clients: path.join(baseDir, 'ClientesDB.csv'),
      vehicles: path.join(baseDir, 'AutomovilDB.csv'),
      remisions: path.join(baseDir, 'RemisionesDB.csv'),
      products: path.join(baseDir, 'ProductosDB.csv'),
      services: path.join(baseDir, 'serviciosDB.csv'),
      orderProducts: path.join(baseDir, 'RelacionordenproductosDB.csv'),
      orderServices: path.join(baseDir, 'RelacionordenservicioDB.csv'),
      brands: path.join(baseDir, 'MarcasDB.csv'),
      series: path.join(baseDir, 'SeriesDB.csv')
    };
    
    const fs = await import('fs');
    for (const [name, filePath] of Object.entries(files)) {
      const exists = fs.default.existsSync(filePath);
      logTest(`Archivo ${name} existe`, exists, exists ? 'OK' : `No encontrado: ${filePath}`);
    }
    
    // Leer y verificar estructura básica
    const orders = await parseCSV(files.orders, { delimiter: ';', encoding: 'utf8' });
    logTest('Órdenes CSV leíble', orders.length > 0, `${orders.length} órdenes`);
    
    if (orders.length > 0) {
      const requiredFields = ['or_id', 'or_fk_empresa', 'or_fk_cliente', 'or_fk_automovil'];
      const sample = orders[0];
      const hasRequiredFields = requiredFields.every(field => sample.hasOwnProperty(field));
      logTest('Órdenes tienen campos requeridos', hasRequiredFields, 
        hasRequiredFields ? 'OK' : `Faltan: ${requiredFields.filter(f => !sample.hasOwnProperty(f)).join(', ')}`);
    }
    
    const clients = await parseCSV(files.clients, { delimiter: ';', encoding: 'utf8' });
    logTest('Clientes CSV leíble', clients.length > 0, `${clients.length} clientes`);
    
    const vehicles = await parseCSV(files.vehicles, { delimiter: ';', encoding: 'utf8' });
    logTest('Vehículos CSV leíble', vehicles.length > 0, `${vehicles.length} vehículos`);
    
  } catch (err) {
    logTest('Estructura CSV', false, err.message);
  }
}

async function testDataRelations() {
  console.log('\n📋 TEST 2: Verificar relaciones entre datos');
  console.log('='.repeat(60));
  
  try {
    const orders = await parseCSV(path.join(baseDir, 'OrdenesDB.csv'), { delimiter: ';', encoding: 'utf8' });
    const clients = await parseCSV(path.join(baseDir, 'ClientesDB.csv'), { delimiter: ';', encoding: 'utf8' });
    const vehicles = await parseCSV(path.join(baseDir, 'AutomovilDB.csv'), { delimiter: ';', encoding: 'utf8' });
    const orderProducts = await parseCSV(path.join(baseDir, 'RelacionordenproductosDB.csv'), { delimiter: ';', encoding: 'utf8' });
    const orderServices = await parseCSV(path.join(baseDir, 'RelacionordenservicioDB.csv'), { delimiter: ';', encoding: 'utf8' });
    
    // Crear índices
    const clientIndex = new Map(clients.map(c => [String(c['cl_id'] || ''), c]));
    const vehicleIndex = new Map(vehicles.map(v => [String(v['au_id'] || ''), v]));
    
    // Verificar que las órdenes tienen clientes válidos
    let ordersWithValidClient = 0;
    let ordersWithValidVehicle = 0;
    let ordersWithProducts = 0;
    let ordersWithServices = 0;
    
    const orderProductMap = new Map();
    for (const row of orderProducts) {
      const orderId = String(row['rpo_fk_orden'] || '').trim();
      if (orderId) {
        if (!orderProductMap.has(orderId)) orderProductMap.set(orderId, []);
        orderProductMap.get(orderId).push(row);
      }
    }
    
    const orderServiceMap = new Map();
    for (const row of orderServices) {
      const orderId = String(row['rso_idOrdenfk'] || '').trim();
      if (orderId) {
        if (!orderServiceMap.has(orderId)) orderServiceMap.set(orderId, []);
        orderServiceMap.get(orderId).push(row);
      }
    }
    
    for (const order of orders.slice(0, 1000)) { // Muestra de 1000
      const clientId = String(order['or_fk_cliente'] || '').trim();
      const vehicleId = String(order['or_fk_automovil'] || '').trim();
      const orderId = String(order['or_id'] || '').trim();
      
      if (clientId && clientId !== '0' && clientIndex.has(clientId)) {
        ordersWithValidClient++;
      }
      
      if (vehicleId && vehicleId !== '0' && vehicleIndex.has(vehicleId)) {
        ordersWithValidVehicle++;
      }
      
      if (orderProductMap.has(orderId) && orderProductMap.get(orderId).length > 0) {
        ordersWithProducts++;
      }
      
      if (orderServiceMap.has(orderId) && orderServiceMap.get(orderId).length > 0) {
        ordersWithServices++;
      }
    }
    
    logTest('Órdenes con clientes válidos', ordersWithValidClient > 0, 
      `${ordersWithValidClient}/1000 muestras tienen cliente válido`);
    logTest('Órdenes con vehículos válidos', ordersWithValidVehicle > 0, 
      `${ordersWithValidVehicle}/1000 muestras tienen vehículo válido`);
    logTest('Órdenes con productos', ordersWithProducts > 0, 
      `${ordersWithProducts}/1000 muestras tienen productos`);
    logTest('Órdenes con servicios', ordersWithServices > 0, 
      `${ordersWithServices}/1000 muestras tienen servicios`);
    
  } catch (err) {
    logTest('Relaciones de datos', false, err.message);
  }
}

async function testClientsWithVehicleId() {
  console.log('\n📋 TEST 3: Verificar clientes con vehicleId vinculado');
  console.log('='.repeat(60));
  
  try {
    await connectDB(MONGODB_URI);
    
    // Contar clientes con vehicleId
    const clientsWithVehicleId = await CustomerProfile.countDocuments({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      'vehicle.vehicleId': { $exists: true, $ne: null }
    });
    
    logTest('Clientes con vehicleId', clientsWithVehicleId > 0, 
      `${clientsWithVehicleId} clientes con vehículo vinculado`);
    
    // Verificar que los vehicleIds son válidos
    const sampleClients = await CustomerProfile.find({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      'vehicle.vehicleId': { $exists: true, $ne: null }
    }).limit(50).lean();
    
    let validVehicleIds = 0;
    let activeVehicles = 0;
    const vehicleIds = new Set();
    
    for (const client of sampleClients) {
      if (client.vehicle?.vehicleId) {
        vehicleIds.add(String(client.vehicle.vehicleId));
        const vehicle = await Vehicle.findById(client.vehicle.vehicleId).lean();
        if (vehicle) {
          validVehicleIds++;
          if (vehicle.active) activeVehicles++;
        }
      }
    }
    
    logTest('VehicleIds válidos en BD', validVehicleIds === sampleClients.length, 
      `${validVehicleIds}/${sampleClients.length} vehicleIds válidos`);
    logTest('Vehículos activos', activeVehicles === validVehicleIds, 
      `${activeVehicles}/${validVehicleIds} vehículos activos`);
    logTest('VehicleIds únicos', vehicleIds.size > 0, 
      `${vehicleIds.size} vehicleIds únicos en muestra`);
    
    // Verificar coherencia de datos
    let consistentData = 0;
    for (const client of sampleClients.slice(0, 20)) {
      if (client.vehicle?.vehicleId) {
        const vehicle = await Vehicle.findById(client.vehicle.vehicleId).lean();
        if (vehicle) {
          const brandMatches = !client.vehicle.brand || 
            client.vehicle.brand.toUpperCase() === vehicle.make.toUpperCase();
          const lineMatches = !client.vehicle.line || 
            client.vehicle.line.toUpperCase() === vehicle.line.toUpperCase();
          
          if (brandMatches && lineMatches) {
            consistentData++;
          }
        }
      }
    }
    
    logTest('Datos coherentes (marca/línea)', consistentData === Math.min(20, sampleClients.length), 
      `${consistentData}/20 muestras tienen datos coherentes`);
    
    await mongoose.connection.close();
    
  } catch (err) {
    logTest('Clientes con vehicleId', false, err.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

async function testSearchByPlate() {
  console.log('\n📋 TEST 4: Verificar búsqueda por placa');
  console.log('='.repeat(60));
  
  try {
    await connectDB(MONGODB_URI);
    
    // Buscar clientes con placa y vehicleId
    const clientsWithPlate = await CustomerProfile.find({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      plate: { $exists: true, $ne: '' },
      'vehicle.vehicleId': { $exists: true, $ne: null }
    }).limit(20).lean();
    
    logTest('Clientes con placa y vehicleId', clientsWithPlate.length > 0, 
      `${clientsWithPlate.length} clientes encontrados`);
    
    let successfulSearches = 0;
    let vehiclesFound = 0;
    
    for (const client of clientsWithPlate) {
      if (client.plate) {
        // Buscar por placa
        const found = await CustomerProfile.findOne({
          companyId: client.companyId,
          plate: client.plate
        }).lean();
        
        if (found) {
          successfulSearches++;
          if (found.vehicle?.vehicleId) {
            const vehicle = await Vehicle.findById(found.vehicle.vehicleId).lean();
            if (vehicle && vehicle.active) {
              vehiclesFound++;
            }
          }
        }
      }
    }
    
    logTest('Búsquedas por placa exitosas', successfulSearches === clientsWithPlate.length, 
      `${successfulSearches}/${clientsWithPlate.length} búsquedas exitosas`);
    logTest('Vehículos encontrados por placa', vehiclesFound === successfulSearches, 
      `${vehiclesFound}/${successfulSearches} vehículos encontrados`);
    
    await mongoose.connection.close();
    
  } catch (err) {
    logTest('Búsqueda por placa', false, err.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

async function testSalesIntegrity() {
  console.log('\n📋 TEST 5: Verificar integridad de ventas');
  console.log('='.repeat(60));
  
  try {
    await connectDB(MONGODB_URI);
    
    // Contar ventas por empresa
    const casaRenaultSales = await Sale.countDocuments({
      companyId: CASA_RENAULT_ID,
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' }
    });
    
    const servitecaShelbySales = await Sale.countDocuments({
      companyId: SERVITECA_SHELBY_ID,
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' }
    });
    
    logTest('Ventas en Casa Renault', casaRenaultSales > 0, `${casaRenaultSales} ventas`);
    logTest('Ventas en Serviteca Shelby', servitecaShelbySales > 0, `${servitecaShelbySales} ventas`);
    
    // Verificar que las ventas tienen items
    const salesWithItems = await Sale.countDocuments({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' },
      items: { $exists: true, $ne: [] }
    });
    
    logTest('Ventas con items', salesWithItems > 0, `${salesWithItems} ventas con items`);
    
    // Verificar que no hay duplicados
    const duplicates = await Sale.aggregate([
      {
        $match: {
          companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
          legacyOrId: { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: { companyId: '$companyId', legacyOrId: '$legacyOrId' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    logTest('Sin ventas duplicadas', duplicates.length === 0, 
      duplicates.length === 0 ? 'OK' : `${duplicates.length} duplicados encontrados`);
    
    // Verificar que las ventas tienen cliente asociado
    const salesWithClient = await Sale.countDocuments({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' },
      'customer.name': { $exists: true, $ne: '' }
    });
    
    logTest('Ventas con cliente', salesWithClient > 0, `${salesWithClient} ventas con cliente`);
    
    // Verificar que las ventas tienen vehículo
    const salesWithVehicle = await Sale.countDocuments({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' },
      'vehicle.plate': { $exists: true, $ne: '' }
    });
    
    logTest('Ventas con vehículo', salesWithVehicle > 0, `${salesWithVehicle} ventas con vehículo`);
    
    // Verificar que las ventas tienen cliente con vehicleId
    const sampleSales = await Sale.find({
      companyId: { $in: [CASA_RENAULT_ID, SERVITECA_SHELBY_ID] },
      status: 'closed',
      legacyOrId: { $exists: true, $ne: '' },
      'vehicle.plate': { $exists: true, $ne: '' }
    }).limit(50).lean();
    
    let salesWithLinkedClient = 0;
    for (const sale of sampleSales) {
      if (sale.vehicle?.plate) {
        const client = await CustomerProfile.findOne({
          companyId: sale.companyId,
          plate: sale.vehicle.plate,
          'vehicle.vehicleId': { $exists: true, $ne: null }
        }).lean();
        
        if (client) {
          salesWithLinkedClient++;
        }
      }
    }
    
    logTest('Ventas con cliente vinculado', salesWithLinkedClient > 0, 
      `${salesWithLinkedClient}/${sampleSales.length} ventas tienen cliente con vehicleId`);
    
    await mongoose.connection.close();
    
  } catch (err) {
    logTest('Integridad de ventas', false, err.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

async function testPerformance() {
  console.log('\n📋 TEST 6: Verificar performance y optimizaciones');
  console.log('='.repeat(60));
  
  try {
    await connectDB(MONGODB_URI);
    
    // Test de búsqueda rápida por placa (debe usar índice)
    const startTime = Date.now();
    const clients = await CustomerProfile.find({
      companyId: CASA_RENAULT_ID,
      plate: { $exists: true, $ne: '' }
    }).limit(100).lean();
    const searchTime = Date.now() - startTime;
    
    logTest('Búsqueda por placa rápida', searchTime < 1000, 
      `${searchTime}ms para 100 clientes`);
    
    // Test de búsqueda con vehicleId
    const startTime2 = Date.now();
    const clientsWithVehicle = await CustomerProfile.find({
      companyId: CASA_RENAULT_ID,
      'vehicle.vehicleId': { $exists: true, $ne: null }
    }).limit(100).lean();
    const searchTime2 = Date.now() - startTime2;
    
    logTest('Búsqueda con vehicleId rápida', searchTime2 < 1000, 
      `${searchTime2}ms para 100 clientes`);
    
    // Verificar que hay índices (indirectamente, por velocidad)
    if (searchTime > 5000) {
      logWarning('Búsqueda lenta - considerar agregar índices en plate y vehicle.vehicleId');
    }
    
    await mongoose.connection.close();
    
  } catch (err) {
    logTest('Performance', false, err.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

async function main() {
  console.log('🧪 TEST COMPLETO Y ROBUSTO DE IMPORTACIÓN');
  console.log('='.repeat(60));
  console.log(`MongoDB URI: ${MONGODB_URI.split('@').pop() || MONGODB_URI}`);
  console.log(`Casa Renault ID: ${CASA_RENAULT_ID}`);
  console.log(`Serviteca Shelby ID: ${SERVITECA_SHELBY_ID}`);
  console.log('='.repeat(60));
  
  try {
    await testCSVStructure();
    await testDataRelations();
    await testClientsWithVehicleId();
    await testSearchByPlate();
    await testSalesIntegrity();
    await testPerformance();
    
    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE VERIFICACIÓN');
    console.log('='.repeat(60));
    console.log(`✅ Tests pasados: ${results.passed}`);
    console.log(`❌ Tests fallidos: ${results.failed}`);
    console.log(`📊 Total: ${results.passed + results.failed}`);
    if (results.warnings.length > 0) {
      console.log(`⚠️  Advertencias: ${results.warnings.length}`);
    }
    console.log('='.repeat(60));
    
    if (results.failed === 0) {
      console.log('\n🎉 ¡TODOS LOS TESTS PASARON!');
      if (results.warnings.length > 0) {
        console.log('\n⚠️  ADVERTENCIAS:');
        results.warnings.forEach(w => console.log(`   - ${w}`));
      }
    } else {
      console.log('\n⚠️  ALGUNOS TESTS FALLARON');
      console.log('\nTests fallidos:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.message}`);
      });
    }
    
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

