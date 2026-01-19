#!/usr/bin/env node
/**
 * Script para exportar TODOS los precios a un archivo Excel completo
 * 
 * Este script extrae todos los precios de la base de datos y los exporta
 * a un archivo Excel con todas las columnas relevantes para reorganización.
 * 
 * CONFIGURACIÓN DE MONGODB_URI:
 * 
 * Opción 1 (Recomendada): Crear archivo .env en la carpeta Backend/
 *   MONGODB_URI=mongodb://usuario:password@host:puerto/database
 *   Ejemplo: MONGODB_URI=mongodb://localhost:27017
 *   Ejemplo Cloud: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
 * 
 * Opción 2: Pasar como parámetro al ejecutar
 *   npm run export:prices -- --mongo "mongodb://tu-uri"
 * 
 * Opción 3: Variable de entorno del sistema
 *   Windows PowerShell: $env:MONGODB_URI="mongodb://tu-uri"
 *   Linux/Mac: export MONGODB_URI="mongodb://tu-uri"
 * 
 * USO:
 *   npm run export:prices
 *   npm run export:prices -- --mongo "mongodb://..." --output "mi-archivo.xlsx"
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import { connectDB } from '../src/db.js';
import PriceEntry from '../src/models/PriceEntry.js';
import Vehicle from '../src/models/Vehicle.js';
import Service from '../src/models/Service.js';
import Item from '../src/models/Item.js';
import Company from '../src/models/Company.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== CONFIGURACIÓN ====================

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
const mongoUri = args.mongo || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ Error: No se encontró la URI de MongoDB');
  console.error('\n📝 Opciones para configurar MONGODB_URI:');
  console.error('   1. Crear archivo .env en la carpeta Backend con:');
  console.error('      MONGODB_URI=mongodb://tu-uri-aqui');
  console.error('\n   2. Pasar como parámetro:');
  console.error('      npm run export:prices -- --mongo "mongodb://tu-uri-aqui"');
  console.error('\n   3. Exportar variable de entorno:');
  console.error('      export MONGODB_URI="mongodb://tu-uri-aqui" (Linux/Mac)');
  console.error('      $env:MONGODB_URI="mongodb://tu-uri-aqui" (Windows PowerShell)');
  process.exit(1);
}

const outputFile = args.output || `precios-completo-${new Date().toISOString().split('T')[0]}.xlsx`;

// ==================== FUNCIONES AUXILIARES ====================

function formatVariables(variables) {
  if (!variables || typeof variables !== 'object') return '';
  if (variables instanceof Map) {
    const entries = Array.from(variables.entries());
    return entries.map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const entries = Object.entries(variables);
  return entries.map(([k, v]) => `${k}=${v}`).join('; ');
}

function formatComboProducts(comboProducts) {
  if (!Array.isArray(comboProducts) || comboProducts.length === 0) return '';
  return comboProducts.map((cp, idx) => {
    const parts = [
      `${idx + 1}. ${cp.name || ''}`,
      `Cant: ${cp.qty || 1}`,
      `Precio: ${cp.unitPrice || 0}`,
      cp.isOpenSlot ? '(Slot Abierto)' : '',
      cp.itemId ? `[Item: ${cp.itemId}]` : ''
    ].filter(Boolean);
    return parts.join(' | ');
  }).join('\n');
}

function formatYearRange(yearFrom, yearTo) {
  if (yearFrom === null && yearTo === null) return '';
  if (yearFrom !== null && yearTo !== null) {
    return `${yearFrom} - ${yearTo}`;
  }
  if (yearFrom !== null) return `Desde ${yearFrom}`;
  if (yearTo !== null) return `Hasta ${yearTo}`;
  return '';
}

function formatVehicle(vehicle) {
  if (!vehicle) return '';
  const parts = [
    vehicle.make || '',
    vehicle.line || '',
    vehicle.displacement || '',
    vehicle.modelYear ? `(${vehicle.modelYear})` : ''
  ].filter(Boolean);
  return parts.join(' ');
}

function formatService(service) {
  if (!service) return '';
  return service.name || service._id?.toString() || '';
}

function formatItem(item) {
  if (!item) return '';
  const parts = [
    item.sku || '',
    item.name || ''
  ].filter(Boolean);
  return parts.join(' - ');
}

// ==================== EXPORTACIÓN ====================

async function exportAllPrices() {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await connectDB(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    console.log('📊 Obteniendo todos los precios...');
    const prices = await PriceEntry.find({})
      .populate('vehicleId', 'make line displacement modelYear')
      .populate('serviceId', 'name')
      .populate('itemId', 'sku name')
      .populate('comboProducts.itemId', 'sku name')
      .populate('companyId', 'name email')
      .sort({ companyId: 1, type: 1, name: 1, createdAt: -1 })
      .lean();

    console.log(`✅ Encontrados ${prices.length} precios\n`);

    if (prices.length === 0) {
      console.log('⚠️  No hay precios para exportar');
      await mongoose.connection.close();
      return;
    }

    console.log('📝 Generando Excel...');

    // Definir columnas del Excel
    const headers = [
      'ID',
      'Empresa',
      'Tipo',
      'Nombre',
      'Vehículo',
      'Marca (Legacy)',
      'Línea (Legacy)',
      'Motor (Legacy)',
      'Año (Legacy)',
      'Rango Años',
      'Servicio',
      'Item Inventario',
      'Productos Combo',
      'Variables',
      'Precio Total',
      'Mano de Obra',
      'Tipo Mano de Obra',
      'Fecha Creación',
      'Fecha Actualización'
    ];

    const wsData = [headers];

    // Procesar cada precio
    for (const price of prices) {
      const row = [
        price._id?.toString() || '',
        price.companyId?.name || price.companyId?.email || price.companyId?.toString() || '',
        price.type?.toUpperCase() || '',
        price.name || '',
        formatVehicle(price.vehicleId),
        price.brand || '',
        price.line || '',
        price.engine || '',
        price.year || '',
        formatYearRange(price.yearFrom, price.yearTo),
        formatService(price.serviceId),
        formatItem(price.itemId),
        formatComboProducts(price.comboProducts),
        formatVariables(price.variables),
        price.total || 0,
        price.laborValue || 0,
        price.laborKind || '',
        price.createdAt ? new Date(price.createdAt).toLocaleString('es-CO') : '',
        price.updatedAt ? new Date(price.updatedAt).toLocaleString('es-CO') : ''
      ];
      wsData.push(row);
    }

    // Crear workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(wsData);

    // Ajustar ancho de columnas
    const colWidths = [
      { wch: 25 }, // ID
      { wch: 20 }, // Empresa
      { wch: 12 }, // Tipo
      { wch: 40 }, // Nombre
      { wch: 30 }, // Vehículo
      { wch: 15 }, // Marca (Legacy)
      { wch: 20 }, // Línea (Legacy)
      { wch: 15 }, // Motor (Legacy)
      { wch: 10 }, // Año (Legacy)
      { wch: 15 }, // Rango Años
      { wch: 30 }, // Servicio
      { wch: 40 }, // Item Inventario
      { wch: 60 }, // Productos Combo
      { wch: 40 }, // Variables
      { wch: 15 }, // Precio Total
      { wch: 15 }, // Mano de Obra
      { wch: 20 }, // Tipo Mano de Obra
      { wch: 20 }, // Fecha Creación
      { wch: 20 }  // Fecha Actualización
    ];
    ws['!cols'] = colWidths;

    // Agregar hoja al workbook
    xlsx.utils.book_append_sheet(wb, ws, 'PRECIOS');

    // Guardar archivo en la raíz del proyecto
    const outputPath = path.join(__dirname, '..', '..', outputFile);
    xlsx.writeFile(wb, outputPath);

    console.log(`✅ Excel generado exitosamente: ${outputPath}`);
    console.log(`\n📊 Resumen:`);
    console.log(`   - Total de precios: ${prices.length}`);
    
    // Estadísticas por tipo
    const stats = {};
    for (const price of prices) {
      const type = price.type || 'unknown';
      stats[type] = (stats[type] || 0) + 1;
    }
    console.log(`\n   Por tipo:`);
    for (const [type, count] of Object.entries(stats)) {
      console.log(`   - ${type.toUpperCase()}: ${count}`);
    }

    // Estadísticas por empresa
    const companyStats = {};
    for (const price of prices) {
      const companyName = price.companyId?.name || price.companyId?.email || 'Sin empresa';
      companyStats[companyName] = (companyStats[companyName] || 0) + 1;
    }
    console.log(`\n   Por empresa:`);
    for (const [company, count] of Object.entries(companyStats)) {
      console.log(`   - ${company}: ${count}`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Exportación completada');

  } catch (error) {
    console.error('❌ Error durante la exportación:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Ejecutar
exportAllPrices();
