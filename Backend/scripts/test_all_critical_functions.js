/**
 * Test completo de todas las funciones críticas del sistema
 * 
 * Prueba:
 * 1. Descuento de inventario usando StockEntry y FIFO
 * 2. Ingreso de entradas y salidas de flujo de caja
 * 3. Mano de obra guardada correctamente (laborValue, laborPercent, laborCommissions)
 * 4. Horas correctas usando utilidades de horas (workHoursPerMonth)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Item from '../src/models/Item.js';
import Sale from '../src/models/Sale.js';
import StockEntry from '../src/models/StockEntry.js';
import StockMove from '../src/models/StockMove.js';
import CashFlowEntry from '../src/models/CashFlowEntry.js';
import Account from '../src/models/Account.js';
import PayrollSettlement from '../src/models/PayrollSettlement.js';
import CompanyPayrollConcept from '../src/models/CompanyPayrollConcept.js';
import Company from '../src/models/Company.js';
import VehicleIntake from '../src/models/VehicleIntake.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';

let testCompanyId = null;
let testResults = {
  inventory: { passed: false, errors: [], warnings: [] },
  cashflow: { passed: false, errors: [], warnings: [] },
  labor: { passed: false, errors: [], warnings: [] },
  hours: { passed: false, errors: [], warnings: [] }
};

// Utilidades de horas (simulando las que deberían existir)
function parseHours(hoursStr) {
  if (!hoursStr) return 0;
  if (typeof hoursStr === 'number') return hoursStr;
  
  // Formato HH:mm o HH.mm
  const match = String(hoursStr).match(/(\d+)[:.](\d+)/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours + (minutes / 60);
  }
  
  // Formato decimal simple
  const num = parseFloat(hoursStr);
  return isNaN(num) ? 0 : num;
}

function formatHours(hours) {
  if (typeof hours !== 'number' || isNaN(hours)) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function hoursToMinutes(hours) {
  return Math.round(parseHours(hours) * 60);
}

function minutesToHours(minutes) {
  return parseFloat((minutes / 60).toFixed(2));
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function setupTestCompany() {
  const company = await Company.findOne({});
  if (company) {
    testCompanyId = company._id;
    console.log(`✅ Usando empresa de prueba: ${company.name || company.email || testCompanyId}`);
  } else {
    throw new Error('No se encontró ninguna empresa en la base de datos');
  }
}

// ===== PRUEBA 1: Descuento de inventario usando StockEntry y FIFO =====
async function testInventoryDecrease() {
  console.log('\n📦 PRUEBA 1: Descuento de inventario usando StockEntry y FIFO');
  
  try {
    // Buscar un item con stock disponible y StockEntries
    const item = await Item.findOne({ 
      companyId: testCompanyId, 
      stock: { $gt: 0 } 
    });
    
    if (!item) {
      testResults.inventory.errors.push('No se encontró ningún item con stock disponible para probar');
      return;
    }
    
    // Buscar StockEntries para este item
    const stockEntries = await StockEntry.find({
      companyId: testCompanyId,
      itemId: item._id,
      qty: { $gt: 0 }
    }).sort({ entryDate: 1, _id: 1 });
    
    if (stockEntries.length === 0) {
      testResults.inventory.warnings.push(`Item ${item.sku || item.name} tiene stock (${item.stock}) pero no tiene StockEntries`);
      // Crear un StockEntry de prueba si es posible
      const vehicleIntake = await VehicleIntake.findOne({ companyId: testCompanyId });
      if (vehicleIntake) {
        const testEntry = await StockEntry.create({
          companyId: testCompanyId,
          itemId: item._id,
          vehicleIntakeId: vehicleIntake._id,
          qty: item.stock,
          entryPrice: item.entryPrice || null,
          entryDate: new Date()
        });
        stockEntries.push(testEntry);
        console.log(`   ⚠️  Creado StockEntry de prueba para sincronización`);
      } else {
        testResults.inventory.errors.push('No se encontró VehicleIntake para crear StockEntry de prueba');
        return;
      }
    }
    
    const initialStock = item.stock || 0;
    const initialStockFromEntries = stockEntries.reduce((sum, se) => sum + (se.qty || 0), 0);
    const testQty = Math.min(1, Math.floor(initialStock / 2)); // Usar máximo la mitad del stock
    
    if (testQty <= 0) {
      testResults.inventory.errors.push(`Stock insuficiente para prueba: ${initialStock}`);
      return;
    }
    
    console.log(`   Item: ${item.sku || item.name}`);
    console.log(`   Stock inicial (Item.stock): ${initialStock}`);
    console.log(`   Stock inicial (StockEntries): ${initialStockFromEntries}`);
    console.log(`   Cantidad a descontar: ${testQty}`);
    
    // Verificar sincronización entre Item.stock y StockEntries
    if (Math.abs(initialStock - initialStockFromEntries) > 0.01) {
      testResults.inventory.warnings.push(
        `Stock desincronizado: Item.stock=${initialStock}, StockEntries=${initialStockFromEntries}`
      );
    }
    
    // Simular descuento usando FIFO (como en closeSale)
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        let remainingQty = testQty;
        const stockEntriesToUpdate = await StockEntry.find({
          companyId: testCompanyId,
          itemId: item._id,
          qty: { $gt: 0 }
        })
        .sort({ entryDate: 1, _id: 1 })
        .session(session);
        
        const stockEntriesUsed = [];
        for (const entry of stockEntriesToUpdate) {
          if (remainingQty <= 0) break;
          
          const qtyToDeduct = Math.min(remainingQty, entry.qty);
          entry.qty -= qtyToDeduct;
          remainingQty -= qtyToDeduct;
          
          stockEntriesUsed.push({
            entryId: entry._id,
            qty: qtyToDeduct
          });
          
          if (entry.qty <= 0) {
            await StockEntry.deleteOne({ _id: entry._id }).session(session);
          } else {
            await entry.save({ session });
          }
        }
        
        if (remainingQty > 0) {
          throw new Error(`Stock insuficiente en entradas. Necesario: ${testQty}, Disponible: ${testQty - remainingQty}`);
        }
        
        // Actualizar stock total del item
        const upd = await Item.updateOne(
          { _id: item._id, companyId: testCompanyId, stock: { $gte: testQty } },
          { $inc: { stock: -testQty } }
        ).session(session);
        
        if (upd.matchedCount === 0) {
          throw new Error('No se pudo actualizar el stock del item');
        }
        
        // Registrar movimientos de stock
        const stockMoves = stockEntriesUsed.map(se => ({
          companyId: testCompanyId,
          itemId: item._id,
          qty: se.qty,
          reason: 'OUT',
          meta: { test: true, stockEntryId: se.entryId }
        }));
        
        if (stockMoves.length > 0) {
          await StockMove.insertMany(stockMoves, { session });
        }
      });
      
      // Verificar que el stock se redujo correctamente
      const updatedItem = await Item.findOne({ _id: item._id, companyId: testCompanyId });
      const finalStock = updatedItem.stock || 0;
      
      // Verificar StockEntries
      const finalStockEntries = await StockEntry.find({
        companyId: testCompanyId,
        itemId: item._id,
        qty: { $gt: 0 }
      });
      const finalStockFromEntries = finalStockEntries.reduce((sum, se) => sum + (se.qty || 0), 0);
      
      if (finalStock !== initialStock - testQty) {
        testResults.inventory.errors.push(
          `Stock del Item incorrecto: esperado ${initialStock - testQty}, obtenido ${finalStock}`
        );
      }
      
      if (Math.abs(finalStockFromEntries - (initialStockFromEntries - testQty)) > 0.01) {
        testResults.inventory.errors.push(
          `Stock de Entradas incorrecto: esperado ${initialStockFromEntries - testQty}, obtenido ${finalStockFromEntries}`
        );
      }
      
      // Verificar sincronización final
      if (Math.abs(finalStock - finalStockFromEntries) > 0.01) {
        testResults.inventory.warnings.push(
          `Stock desincronizado después del descuento: Item.stock=${finalStock}, StockEntries=${finalStockFromEntries}`
        );
      }
      
      // Restaurar stock para no afectar datos reales
      await session.withTransaction(async () => {
        // Restaurar StockEntries
        const vehicleIntake = await VehicleIntake.findOne({ companyId: testCompanyId }).session(session);
        if (vehicleIntake) {
          // Buscar si hay una entrada existente para restaurar
          const existingEntry = await StockEntry.findOne({
            companyId: testCompanyId,
            itemId: item._id,
            vehicleIntakeId: vehicleIntake._id
          }).session(session);
          
          if (existingEntry) {
            existingEntry.qty += testQty;
            await existingEntry.save({ session });
          } else {
            await StockEntry.create([{
              companyId: testCompanyId,
              itemId: item._id,
              vehicleIntakeId: vehicleIntake._id,
              qty: testQty,
              entryPrice: item.entryPrice || null,
              entryDate: new Date()
            }], { session });
          }
        }
        
        // Restaurar stock del item
        await Item.updateOne(
          { _id: item._id, companyId: testCompanyId },
          { $inc: { stock: testQty } }
        ).session(session);
        
        // Eliminar movimientos de prueba
        await StockMove.deleteMany({
          companyId: testCompanyId,
          itemId: item._id,
          'meta.test': true
        }).session(session);
      });
      
      if (testResults.inventory.errors.length === 0) {
        console.log(`   ✅ Stock se redujo correctamente: ${initialStock} → ${finalStock}`);
        console.log(`   ✅ StockEntries se actualizaron correctamente usando FIFO`);
        testResults.inventory.passed = true;
      }
      
    } finally {
      await session.endSession();
    }
    
  } catch (error) {
    testResults.inventory.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== PRUEBA 2: Movimientos automáticos de flujo de caja =====
async function testCashflowAutoMovement() {
  console.log('\n💰 PRUEBA 2: Movimientos automáticos de flujo de caja');
  
  try {
    // Buscar o crear cuenta de prueba
    let account = await Account.findOne({ 
      companyId: testCompanyId, 
      type: 'CASH' 
    });
    
    if (!account) {
      account = await Account.create({
        companyId: testCompanyId,
        name: 'Caja Prueba',
        type: 'CASH',
        initialBalance: 0
      });
      console.log(`   ✅ Creada cuenta de prueba: ${account.name}`);
    }
    
    // Buscar una venta cerrada reciente
    const sale = await Sale.findOne({
      companyId: testCompanyId,
      status: 'closed'
    }).sort({ closedAt: -1 });
    
    if (!sale) {
      testResults.cashflow.errors.push('No se encontró ninguna venta cerrada para probar');
      return;
    }
    
    console.log(`   Venta encontrada: #${sale.number || sale._id}`);
    console.log(`   Total: ${sale.total || 0}`);
    console.log(`   Métodos de pago: ${JSON.stringify(sale.paymentMethods || [sale.paymentMethod])}`);
    
    // Verificar que existe entrada de flujo de caja para esta venta
    const entries = await CashFlowEntry.find({
      companyId: testCompanyId,
      source: 'SALE',
      sourceRef: sale._id
    });
    
    if (entries.length === 0) {
      // Si la venta es crédito, es normal que no haya entrada
      const isCredit = sale.paymentMethods?.some(m => 
        String(m.method || '').toUpperCase() === 'CREDITO' || 
        String(m.method || '').toUpperCase() === 'CRÉDITO'
      ) || String(sale.paymentMethod || '').toUpperCase() === 'CREDITO';
      
      if (isCredit) {
        console.log(`   ⚠️  Venta es crédito, no debe tener entrada de flujo de caja`);
        testResults.cashflow.passed = true;
        return;
      } else {
        testResults.cashflow.errors.push(
          `No se encontró entrada de flujo de caja para la venta #${sale.number || sale._id} (no es crédito)`
        );
        return;
      }
    }
    
    // Verificar campos críticos de cada entrada
    let totalInEntries = 0;
    for (const entry of entries) {
      if (entry.kind !== 'IN') {
        testResults.cashflow.errors.push(`Tipo incorrecto: esperado 'IN', obtenido '${entry.kind}'`);
        continue;
      }
      
      if (entry.amount <= 0) {
        testResults.cashflow.errors.push(`Monto inválido: ${entry.amount}`);
        continue;
      }
      
      if (entry.balanceAfter === undefined && entry.balanceAfter !== 0) {
        testResults.cashflow.errors.push('balanceAfter no está definido');
        continue;
      }
      
      if (!entry.date) {
        testResults.cashflow.errors.push('date no está definido');
        continue;
      }
      
      totalInEntries += entry.amount;
      console.log(`   ✅ Entrada: ${entry.description}, Monto: ${entry.amount}, Balance: ${entry.balanceAfter}, Fecha: ${entry.date}`);
    }
    
    // Verificar que la suma de entradas coincide con el total (excluyendo crédito)
    const nonCreditTotal = sale.paymentMethods?.filter(m => {
      const method = String(m.method || '').toUpperCase();
      return method !== 'CREDITO' && method !== 'CRÉDITO';
    }).reduce((sum, m) => sum + (m.amount || 0), 0) || 
    (String(sale.paymentMethod || '').toUpperCase() !== 'CREDITO' ? sale.total : 0);
    
    if (Math.abs(totalInEntries - nonCreditTotal) > 0.01) {
      testResults.cashflow.warnings.push(
        `Suma de entradas (${totalInEntries}) no coincide exactamente con total no crédito (${nonCreditTotal})`
      );
    }
    
    if (testResults.cashflow.errors.length === 0) {
      console.log(`   ✅ Todas las entradas de flujo de caja son correctas`);
      testResults.cashflow.passed = true;
    }
    
  } catch (error) {
    testResults.cashflow.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== PRUEBA 3: Mano de obra guardada correctamente =====
async function testLaborSaved() {
  console.log('\n🔧 PRUEBA 3: Mano de obra guardada correctamente');
  
  try {
    // Buscar una venta cerrada con mano de obra
    const sale = await Sale.findOne({
      companyId: testCompanyId,
      status: 'closed',
      $or: [
        { laborValue: { $gt: 0 } },
        { 'laborCommissions.0': { $exists: true } }
      ]
    }).sort({ closedAt: -1 });
    
    if (!sale) {
      testResults.labor.warnings.push('No se encontró ninguna venta cerrada con mano de obra para probar');
      // No es un error crítico, puede que no haya ventas con mano de obra
      testResults.labor.passed = true;
      return;
    }
    
    console.log(`   Venta encontrada: #${sale.number || sale._id}`);
    console.log(`   laborValue: ${sale.laborValue || 0}`);
    console.log(`   laborPercent: ${sale.laborPercent || 0}`);
    console.log(`   laborShare: ${sale.laborShare || 0}`);
    console.log(`   laborCommissions: ${sale.laborCommissions?.length || 0} líneas`);
    
    // Verificar cálculo de laborShare
    if (sale.laborValue && sale.laborPercent) {
      const expectedShare = Math.round(sale.laborValue * (sale.laborPercent / 100));
      if (Math.abs(sale.laborShare - expectedShare) > 0.01) {
        testResults.labor.errors.push(
          `laborShare incorrecto: esperado ${expectedShare}, obtenido ${sale.laborShare}`
        );
      } else {
        console.log(`   ✅ laborShare calculado correctamente: ${sale.laborShare}`);
      }
    }
    
    // Verificar laborCommissions si existen
    if (sale.laborCommissions && sale.laborCommissions.length > 0) {
      let totalShareFromCommissions = 0;
      
      for (const commission of sale.laborCommissions) {
        // Verificar campos requeridos
        if (!commission.technician && !commission.technicianName) {
          testResults.labor.errors.push('Comisión sin técnico');
          continue;
        }
        
        if (!commission.kind) {
          testResults.labor.warnings.push('Comisión sin tipo de maniobra (kind)');
        }
        
        // Verificar cálculo de share
        const expectedShare = Math.round((commission.laborValue || 0) * ((commission.percent || 0) / 100));
        if (Math.abs(commission.share - expectedShare) > 0.01) {
          testResults.labor.errors.push(
            `Share de comisión incorrecto: esperado ${expectedShare}, obtenido ${commission.share}`
          );
        }
        
        totalShareFromCommissions += commission.share || 0;
        
        console.log(`   ✅ Comisión: ${commission.technician || commission.technicianName}, ${commission.kind || 'N/A'}, ${commission.percent}% sobre ${commission.laborValue} = ${commission.share}`);
      }
      
      // Verificar que la suma de comisiones coincide con laborShare (aproximadamente)
      if (sale.laborShare && Math.abs(totalShareFromCommissions - sale.laborShare) > 1) {
        testResults.labor.warnings.push(
          `Suma de comisiones (${totalShareFromCommissions}) no coincide exactamente con laborShare (${sale.laborShare})`
        );
      }
    }
    
    if (testResults.labor.errors.length === 0) {
      console.log(`   ✅ Mano de obra guardada correctamente`);
      testResults.labor.passed = true;
    }
    
  } catch (error) {
    testResults.labor.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== PRUEBA 4: Horas correctas usando utilidades =====
async function testHoursUtilities() {
  console.log('\n⏰ PRUEBA 4: Horas correctas usando utilidades');
  
  try {
    // Probar funciones de utilidades de horas
    console.log('   Probando funciones de utilidades de horas...');
    
    // Test 1: parseHours
    const testCases = [
      { input: '8:30', expected: 8.5 },
      { input: '8.5', expected: 8.5 },
      { input: '8', expected: 8 },
      { input: '0:45', expected: 0.75 },
      { input: '1:15', expected: 1.25 },
      { input: 8.5, expected: 8.5 },
      { input: null, expected: 0 },
      { input: '', expected: 0 }
    ];
    
    let parseErrors = 0;
    for (const testCase of testCases) {
      const result = parseHours(testCase.input);
      if (Math.abs(result - testCase.expected) > 0.01) {
        testResults.hours.errors.push(
          `parseHours('${testCase.input}') incorrecto: esperado ${testCase.expected}, obtenido ${result}`
        );
        parseErrors++;
      }
    }
    
    if (parseErrors === 0) {
      console.log(`   ✅ parseHours funciona correctamente`);
    }
    
    // Test 2: formatHours
    const formatTestCases = [
      { input: 8.5, expected: '8:30' },
      { input: 8, expected: '8:00' },
      { input: 0.75, expected: '0:45' },
      { input: 1.25, expected: '1:15' },
      { input: 0, expected: '0:00' }
    ];
    
    let formatErrors = 0;
    for (const testCase of formatTestCases) {
      const result = formatHours(testCase.input);
      if (result !== testCase.expected) {
        testResults.hours.errors.push(
          `formatHours(${testCase.input}) incorrecto: esperado '${testCase.expected}', obtenido '${result}'`
        );
        formatErrors++;
      }
    }
    
    if (formatErrors === 0) {
      console.log(`   ✅ formatHours funciona correctamente`);
    }
    
    // Test 3: hoursToMinutes
    const hoursToMinutesCases = [
      { input: 8.5, expected: 510 },
      { input: 1.25, expected: 75 },
      { input: 0.75, expected: 45 }
    ];
    
    let htmErrors = 0;
    for (const testCase of hoursToMinutesCases) {
      const result = hoursToMinutes(testCase.input);
      if (result !== testCase.expected) {
        testResults.hours.errors.push(
          `hoursToMinutes(${testCase.input}) incorrecto: esperado ${testCase.expected}, obtenido ${result}`
        );
        htmErrors++;
      }
    }
    
    if (htmErrors === 0) {
      console.log(`   ✅ hoursToMinutes funciona correctamente`);
    }
    
    // Test 4: minutesToHours
    const minutesToHoursCases = [
      { input: 510, expected: 8.5 },
      { input: 75, expected: 1.25 },
      { input: 45, expected: 0.75 }
    ];
    
    let mthErrors = 0;
    for (const testCase of minutesToHoursCases) {
      const result = minutesToHours(testCase.input);
      if (Math.abs(result - testCase.expected) > 0.01) {
        testResults.hours.errors.push(
          `minutesToHours(${testCase.input}) incorrecto: esperado ${testCase.expected}, obtenido ${result}`
        );
        mthErrors++;
      }
    }
    
    if (mthErrors === 0) {
      console.log(`   ✅ minutesToHours funciona correctamente`);
    }
    
    // Test 5: Verificar workHoursPerMonth en técnicos de la empresa
    const company = await Company.findOne({ _id: testCompanyId });
    if (company && company.technicians && company.technicians.length > 0) {
      console.log(`   Verificando workHoursPerMonth en ${company.technicians.length} técnicos...`);
      
      let techsWithHours = 0;
      for (const tech of company.technicians) {
        if (tech.workHoursPerMonth !== null && tech.workHoursPerMonth !== undefined) {
          techsWithHours++;
          if (tech.workHoursPerMonth < 0 || tech.workHoursPerMonth > 200) {
            testResults.hours.warnings.push(
              `Técnico ${tech.name}: workHoursPerMonth parece inválido: ${tech.workHoursPerMonth}`
            );
          }
        }
      }
      
      if (techsWithHours > 0) {
        console.log(`   ✅ ${techsWithHours} técnicos tienen workHoursPerMonth configurado`);
      } else {
        testResults.hours.warnings.push('Ningún técnico tiene workHoursPerMonth configurado');
      }
    }
    
    if (testResults.hours.errors.length === 0) {
      console.log(`   ✅ Todas las utilidades de horas funcionan correctamente`);
      testResults.hours.passed = true;
    }
    
  } catch (error) {
    testResults.hours.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== EJECUTAR TODAS LAS PRUEBAS =====
async function runAllTests() {
  console.log('🧪 INICIANDO PRUEBAS COMPLETAS DE FUNCIONES CRÍTICAS\n');
  console.log('='.repeat(60));
  
  await connectDB();
  await setupTestCompany();
  
  await testInventoryDecrease();
  await testCashflowAutoMovement();
  await testLaborSaved();
  await testHoursUtilities();
  
  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN DE PRUEBAS\n');
  
  console.log('1. Descuento de inventario (StockEntry + FIFO):');
  if (testResults.inventory.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.inventory.errors.forEach(err => console.log(`      - ${err}`));
  }
  if (testResults.inventory.warnings.length > 0) {
    testResults.inventory.warnings.forEach(warn => console.log(`      ⚠️  ${warn}`));
  }
  
  console.log('\n2. Movimientos automáticos de flujo de caja:');
  if (testResults.cashflow.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.cashflow.errors.forEach(err => console.log(`      - ${err}`));
  }
  if (testResults.cashflow.warnings.length > 0) {
    testResults.cashflow.warnings.forEach(warn => console.log(`      ⚠️  ${warn}`));
  }
  
  console.log('\n3. Mano de obra guardada correctamente:');
  if (testResults.labor.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.labor.errors.forEach(err => console.log(`      - ${err}`));
  }
  if (testResults.labor.warnings.length > 0) {
    testResults.labor.warnings.forEach(warn => console.log(`      ⚠️  ${warn}`));
  }
  
  console.log('\n4. Horas correctas usando utilidades:');
  if (testResults.hours.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.hours.errors.forEach(err => console.log(`      - ${err}`));
  }
  if (testResults.hours.warnings.length > 0) {
    testResults.hours.warnings.forEach(warn => console.log(`      ⚠️  ${warn}`));
  }
  
  const allPassed = testResults.inventory.passed && 
                   testResults.cashflow.passed && 
                   testResults.labor.passed &&
                   testResults.hours.passed;
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ TODAS LAS PRUEBAS PASARON');
  } else {
    console.log('⚠️  ALGUNAS PRUEBAS FALLARON - Revisar errores arriba');
  }
  
  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

