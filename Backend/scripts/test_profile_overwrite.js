/**
 * Script de prueba para verificar que los cambios manuales en ventas, cotizaciones y calendario
 * actualicen correctamente el perfil del cliente en la base de datos
 * 
 * Ejecutar con: node scripts/test_profile_overwrite.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { upsertProfileFromSource } from '../src/controllers/profile.helper.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import Company from '../src/models/Company.js';

// Cargar variables de entorno (buscar .env en la raíz del proyecto Backend)
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI no está configurado en las variables de entorno');
  console.error('   Asegúrate de tener un archivo .env en la raíz del proyecto con MONGODB_URI');
  process.exit(1);
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' });
    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

async function getTestCompanyId() {
  // Obtener el primer companyId de la base de datos para pruebas
  const company = await Company.findOne().lean();
  if (!company) {
    console.error('❌ No se encontró ninguna empresa en la base de datos');
    process.exit(1);
  }
  return String(company._id);
}

async function cleanup(companyId) {
  // Limpiar perfiles de prueba
  await CustomerProfile.deleteMany({ 
    companyId, 
    plate: { $in: ['TEST123', 'TEST456'] } 
  });
  console.log('🧹 Perfiles de prueba limpiados');
}

async function testProfileOverwrite(companyId) {
  console.log('\n🧪 Prueba de Sobrescritura de Perfiles de Cliente\n');
  
  const testPlate = 'TEST123';
  
  // Paso 1: Crear perfil inicial
  console.log('1. Creando perfil inicial...');
  const initialProfile = await upsertProfileFromSource(companyId, {
    customer: {
      name: 'Cliente Original',
      phone: '3001234567',
      email: 'original@test.com',
      idNumber: '1234567890',
      address: 'Dirección Original'
    },
    vehicle: {
      plate: testPlate,
      brand: 'TOYOTA',
      line: 'COROLLA',
      engine: '1.8',
      year: 2020,
      mileage: 50000
    }
  }, { source: 'test' });
  
  if (!initialProfile) {
    console.error('❌ No se pudo crear el perfil inicial');
    return false;
  }
  
  const profileAfterCreate = await CustomerProfile.findOne({ 
    companyId, 
    plate: testPlate 
  });
  
  console.log('   ✅ Perfil creado:');
  console.log(`      Nombre: ${profileAfterCreate.customer.name}`);
  console.log(`      Teléfono: ${profileAfterCreate.customer.phone}`);
  console.log(`      Email: ${profileAfterCreate.customer.email}`);
  console.log(`      Año: ${profileAfterCreate.vehicle.year}`);
  console.log(`      Kilometraje: ${profileAfterCreate.vehicle.mileage}`);
  
  // Paso 2: Simular actualización desde venta (con overwrite)
  console.log('\n2. Simulando actualización desde venta (con overwrite)...');
  const saleUpdate = await upsertProfileFromSource(companyId, {
    customer: {
      name: 'Cliente Actualizado Venta',
      phone: '3009876543',
      email: 'venta@test.com',
      idNumber: '9876543210',
      address: 'Nueva Dirección Venta'
    },
    vehicle: {
      plate: testPlate,
      brand: 'HONDA',
      line: 'CIVIC',
      engine: '2.0',
      year: 2022,
      mileage: 30000
    }
  }, { 
    source: 'sale',
    overwriteCustomer: true,
    overwriteVehicle: true,
    overwriteYear: true,
    overwriteMileage: true
  });
  
  const profileAfterSale = await CustomerProfile.findOne({ 
    companyId, 
    plate: testPlate 
  });
  
  console.log('   ✅ Perfil actualizado desde venta:');
  console.log(`      Nombre: ${profileAfterSale.customer.name}`);
  console.log(`      Teléfono: ${profileAfterSale.customer.phone}`);
  console.log(`      Email: ${profileAfterSale.customer.email}`);
  console.log(`      Marca: ${profileAfterSale.vehicle.brand}`);
  console.log(`      Año: ${profileAfterSale.vehicle.year}`);
  console.log(`      Kilometraje: ${profileAfterSale.vehicle.mileage}`);
  
  // Verificar que los datos se actualizaron
  const nameChanged = profileAfterSale.customer.name === 'Cliente Actualizado Venta';
  const phoneChanged = profileAfterSale.customer.phone === '3009876543';
  const brandChanged = profileAfterSale.vehicle.brand === 'HONDA';
  const yearChanged = profileAfterSale.vehicle.year === 2022;
  
  if (!nameChanged || !phoneChanged || !brandChanged || !yearChanged) {
    console.error('   ❌ Los datos NO se actualizaron correctamente');
    return false;
  }
  
  console.log('   ✅ Todos los datos se actualizaron correctamente');
  
  // Paso 3: Simular actualización desde cotización (con overwrite)
  console.log('\n3. Simulando actualización desde cotización (con overwrite)...');
  await upsertProfileFromSource(companyId, {
    customer: {
      name: 'Cliente Actualizado Cotización',
      phone: '3001111111',
      email: 'cotizacion@test.com',
      idNumber: '1111111111',
      address: 'Dirección Cotización'
    },
    vehicle: {
      plate: testPlate,
      brand: 'MAZDA',
      line: 'CX5',
      engine: '2.5',
      year: 2023,
      mileage: 15000
    }
  }, { 
    source: 'quote',
    overwriteCustomer: true,
    overwriteVehicle: true,
    overwriteYear: true,
    overwriteMileage: true
  });
  
  const profileAfterQuote = await CustomerProfile.findOne({ 
    companyId, 
    plate: testPlate 
  });
  
  console.log('   ✅ Perfil actualizado desde cotización:');
  console.log(`      Nombre: ${profileAfterQuote.customer.name}`);
  console.log(`      Teléfono: ${profileAfterQuote.customer.phone}`);
  console.log(`      Marca: ${profileAfterQuote.vehicle.brand}`);
  console.log(`      Año: ${profileAfterQuote.vehicle.year}`);
  
  // Verificar que los datos se actualizaron
  const nameChanged2 = profileAfterQuote.customer.name === 'Cliente Actualizado Cotización';
  const phoneChanged2 = profileAfterQuote.customer.phone === '3001111111';
  const brandChanged2 = profileAfterQuote.vehicle.brand === 'MAZDA';
  const yearChanged2 = profileAfterQuote.vehicle.year === 2023;
  
  if (!nameChanged2 || !phoneChanged2 || !brandChanged2 || !yearChanged2) {
    console.error('   ❌ Los datos NO se actualizaron correctamente desde cotización');
    return false;
  }
  
  console.log('   ✅ Todos los datos se actualizaron correctamente desde cotización');
  
  // Paso 4: Simular actualización desde calendario (con overwrite)
  console.log('\n4. Simulando actualización desde calendario (con overwrite)...');
  await upsertProfileFromSource(companyId, {
    customer: {
      name: 'Cliente Actualizado Calendario',
      phone: '3002222222',
      email: 'calendario@test.com',
      idNumber: '2222222222',
      address: 'Dirección Calendario'
    },
    vehicle: {
      plate: testPlate,
      vehicleId: null
    }
  }, { 
    source: 'calendar',
    overwriteCustomer: true,
    overwriteVehicle: true
  });
  
  const profileAfterCalendar = await CustomerProfile.findOne({ 
    companyId, 
    plate: testPlate 
  });
  
  console.log('   ✅ Perfil actualizado desde calendario:');
  console.log(`      Nombre: ${profileAfterCalendar.customer.name}`);
  console.log(`      Teléfono: ${profileAfterCalendar.customer.phone}`);
  console.log(`      Email: ${profileAfterCalendar.customer.email}`);
  
  // Verificar que los datos se actualizaron
  const nameChanged3 = profileAfterCalendar.customer.name === 'Cliente Actualizado Calendario';
  const phoneChanged3 = profileAfterCalendar.customer.phone === '3002222222';
  const emailChanged3 = profileAfterCalendar.customer.email === 'calendario@test.com';
  
  if (!nameChanged3 || !phoneChanged3 || !emailChanged3) {
    console.error('   ❌ Los datos NO se actualizaron correctamente desde calendario');
    return false;
  }
  
  console.log('   ✅ Todos los datos se actualizaron correctamente desde calendario');
  
  // Paso 5: Verificar que los datos persisten después de buscar
  console.log('\n5. Verificando persistencia de datos...');
  const finalProfile = await CustomerProfile.findOne({ 
    companyId, 
    plate: testPlate 
  });
  
  if (finalProfile.customer.name !== 'Cliente Actualizado Calendario') {
    console.error('   ❌ Los datos NO persisten correctamente');
    return false;
  }
  
  console.log('   ✅ Los datos persisten correctamente en la base de datos');
  
  return true;
}

async function main() {
  try {
    await connectDB();
    const TEST_COMPANY_ID = await getTestCompanyId();
    console.log(`📋 Usando companyId de prueba: ${TEST_COMPANY_ID}\n`);
    
    await cleanup(TEST_COMPANY_ID);
    
    const success = await testProfileOverwrite(TEST_COMPANY_ID);
    
    if (success) {
      console.log('\n✅ Todas las pruebas pasaron correctamente');
      console.log('✅ Los cambios manuales se guardan correctamente en la base de datos');
      console.log('✅ Ventas, cotizaciones y calendario actualizan el perfil con overwrite');
    } else {
      console.log('\n❌ Algunas pruebas fallaron');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error en las pruebas:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

main();

