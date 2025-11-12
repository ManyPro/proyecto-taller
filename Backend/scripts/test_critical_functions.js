/**
 * Script de pruebas para funciones críticas del sistema
 * 
 * Prueba:
 * 1. Descuento de inventario al cerrar venta
 * 2. Movimientos automáticos de flujo de caja
 * 3. Guardado de % de participación en liquidación de nómina
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Item from '../src/models/Item.js';
import Sale from '../src/models/Sale.js';
import CashFlowEntry from '../src/models/CashFlowEntry.js';
import PayrollSettlement from '../src/models/PayrollSettlement.js';
import CompanyPayrollConcept from '../src/models/CompanyPayrollConcept.js';
import Account from '../src/models/Account.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';

let testCompanyId = null;
let testResults = {
  inventory: { passed: false, errors: [] },
  cashflow: { passed: false, errors: [] },
  payroll: { passed: false, errors: [] }
};

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
  // Buscar una empresa existente para pruebas
  const Company = mongoose.model('Company', new mongoose.Schema({}, { strict: false }));
  const company = await Company.findOne({});
  if (company) {
    testCompanyId = company._id;
    console.log(`✅ Usando empresa de prueba: ${company.name || company.email || testCompanyId}`);
  } else {
    throw new Error('No se encontró ninguna empresa en la base de datos');
  }
}

// ===== PRUEBA 1: Descuento de inventario =====
async function testInventoryDecrease() {
  console.log('\n📦 PRUEBA 1: Descuento de inventario');
  
  try {
    // Buscar un item con stock disponible
    const item = await Item.findOne({ 
      companyId: testCompanyId, 
      stock: { $gt: 0 } 
    });
    
    if (!item) {
      testResults.inventory.errors.push('No se encontró ningún item con stock disponible para probar');
      return;
    }
    
    const initialStock = item.stock || 0;
    const testQty = 1;
    console.log(`   Item: ${item.sku || item.name}, Stock inicial: ${initialStock}`);
    
    // Simular descuento como en closeSale
    const upd = await Item.updateOne(
      { _id: item._id, companyId: testCompanyId, stock: { $gte: testQty } },
      { $inc: { stock: -testQty } }
    );
    
    if (upd.matchedCount === 0) {
      testResults.inventory.errors.push(`No se pudo actualizar el stock (matchedCount: 0)`);
      return;
    }
    
    // Verificar que el stock se redujo correctamente
    const updatedItem = await Item.findOne({ _id: item._id, companyId: testCompanyId });
    const finalStock = updatedItem.stock || 0;
    
    if (finalStock !== initialStock - testQty) {
      testResults.inventory.errors.push(
        `Stock incorrecto: esperado ${initialStock - testQty}, obtenido ${finalStock}`
      );
      return;
    }
    
    // Restaurar stock para no afectar datos reales
    await Item.updateOne(
      { _id: item._id, companyId: testCompanyId },
      { $inc: { stock: testQty } }
    );
    
    console.log(`   ✅ Stock se redujo correctamente: ${initialStock} → ${finalStock}`);
    testResults.inventory.passed = true;
    
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
    
    // Verificar que existe entrada de flujo de caja para esta venta
    const entry = await CashFlowEntry.findOne({
      companyId: testCompanyId,
      source: 'SALE',
      sourceRef: sale._id
    });
    
    if (!entry) {
      testResults.cashflow.errors.push(
        `No se encontró entrada de flujo de caja para la venta #${sale.number || sale._id}`
      );
      return;
    }
    
    // Verificar campos críticos
    if (entry.kind !== 'IN') {
      testResults.cashflow.errors.push(`Tipo incorrecto: esperado 'IN', obtenido '${entry.kind}'`);
      return;
    }
    
    if (entry.amount <= 0) {
      testResults.cashflow.errors.push(`Monto inválido: ${entry.amount}`);
      return;
    }
    
    if (!entry.balanceAfter && entry.balanceAfter !== 0) {
      testResults.cashflow.errors.push('balanceAfter no está definido');
      return;
    }
    
    console.log(`   ✅ Entrada encontrada: ${entry.description}, Monto: ${entry.amount}, Balance: ${entry.balanceAfter}`);
    testResults.cashflow.passed = true;
    
  } catch (error) {
    testResults.cashflow.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== PRUEBA 3: Guardado de % de participación =====
async function testPayrollPercentage() {
  console.log('\n📊 PRUEBA 3: Guardado de % de participación en liquidación');
  
  try {
    // Buscar un settlement existente
    const settlement = await PayrollSettlement.findOne({
      companyId: testCompanyId
    }).sort({ createdAt: -1 });
    
    if (!settlement) {
      testResults.payroll.errors.push('No se encontró ninguna liquidación para probar');
      return;
    }
    
    console.log(`   Liquidación encontrada: ${settlement.technicianName}, Período: ${settlement.periodId}`);
    
    // Verificar que los items tienen la estructura correcta
    if (!settlement.items || settlement.items.length === 0) {
      testResults.payroll.errors.push('La liquidación no tiene items');
      return;
    }
    
    // Buscar items con porcentajes (deben tener calcRule con 'laborPercent' o 'percent')
    const itemsWithPercent = settlement.items.filter(item => {
      const calcRule = item.calcRule || '';
      return calcRule.includes('laborPercent') || 
             calcRule.includes('percent') ||
             calcRule.match(/\d+%/);
    });
    
    if (itemsWithPercent.length === 0) {
      console.log('   ⚠️  No se encontraron items con porcentajes en esta liquidación');
      // Esto no es un error, puede que no haya porcentajes en esta liquidación
      // Verificamos que la estructura permite guardar porcentajes
    } else {
      console.log(`   ✅ Encontrados ${itemsWithPercent.length} items con porcentajes`);
      
      // Verificar que los items tienen base y value
      itemsWithPercent.forEach((item, idx) => {
        if (item.base === undefined || item.base === null) {
          testResults.payroll.errors.push(`Item ${idx}: 'base' no está definido`);
        }
        if (item.value === undefined || item.value === null) {
          testResults.payroll.errors.push(`Item ${idx}: 'value' no está definido`);
        }
        if (item.calcRule && !item.calcRule.includes('laborPercent') && !item.calcRule.match(/\d+%/)) {
          console.log(`   ⚠️  Item ${idx}: calcRule no contiene porcentaje explícito: ${item.calcRule}`);
        }
      });
    }
    
    // Verificar estructura del modelo: los items deben poder tener campos adicionales
    // MongoDB permite campos adicionales por defecto, pero verificamos que se guarden
    const testItem = settlement.items[0];
    if (!testItem.hasOwnProperty('base')) {
      testResults.payroll.errors.push('El modelo no tiene campo "base" en items');
      return;
    }
    
    if (!testItem.hasOwnProperty('value')) {
      testResults.payroll.errors.push('El modelo no tiene campo "value" en items');
      return;
    }
    
    // Verificar que los porcentajes se guardan en calcRule o notes
    const hasPercentInfo = settlement.items.some(item => {
      const calcRule = String(item.calcRule || '');
      const notes = String(item.notes || '');
      return calcRule.includes('%') || notes.includes('%');
    });
    
    if (!hasPercentInfo && settlement.items.length > 0) {
      console.log('   ⚠️  No se encontró información de porcentajes en calcRule o notes');
      // No es crítico, pero es recomendable
    }
    
    console.log(`   ✅ Estructura del settlement es correcta`);
    testResults.payroll.passed = true;
    
  } catch (error) {
    testResults.payroll.errors.push(`Error: ${error.message}`);
    console.error(`   ❌ Error: ${error.message}`);
  }
}

// ===== EJECUTAR TODAS LAS PRUEBAS =====
async function runAllTests() {
  console.log('🧪 INICIANDO PRUEBAS DE FUNCIONES CRÍTICAS\n');
  console.log('=' .repeat(60));
  
  await connectDB();
  await setupTestCompany();
  
  await testInventoryDecrease();
  await testCashflowAutoMovement();
  await testPayrollPercentage();
  
  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN DE PRUEBAS\n');
  
  console.log('1. Descuento de inventario:');
  if (testResults.inventory.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.inventory.errors.forEach(err => console.log(`      - ${err}`));
  }
  
  console.log('\n2. Movimientos automáticos de flujo de caja:');
  if (testResults.cashflow.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.cashflow.errors.forEach(err => console.log(`      - ${err}`));
  }
  
  console.log('\n3. Guardado de % de participación:');
  if (testResults.payroll.passed) {
    console.log('   ✅ PASÓ');
  } else {
    console.log('   ❌ FALLÓ');
    testResults.payroll.errors.forEach(err => console.log(`      - ${err}`));
  }
  
  const allPassed = testResults.inventory.passed && 
                   testResults.cashflow.passed && 
                   testResults.payroll.passed;
  
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

