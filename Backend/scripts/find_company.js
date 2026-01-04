// Script para encontrar el companyId de una empresa
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from '../src/models/Company.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function findCompany() {
  try {
    await mongoose.connect(MONGODB_URI, { 
      dbName: process.env.MONGODB_DB || 'taller' 
    });
    console.log('✅ Conectado a MongoDB');

    // Buscar empresa "Casa Renault" (puede variar el nombre)
    const searchTerms = ['casa renault', 'renault', 'casa'];
    const companies = await Company.find({}).lean();
    
    console.log('\n📋 Empresas encontradas:');
    companies.forEach(company => {
      const name = String(company.name || '').toLowerCase();
      const email = String(company.email || '').toLowerCase();
      const matches = searchTerms.some(term => 
        name.includes(term) || email.includes(term)
      );
      
      if (matches || companies.length <= 3) {
        console.log(`\n🏢 ${company.name || 'Sin nombre'}`);
        console.log(`   ID: ${company._id}`);
        console.log(`   Email: ${company.email || 'Sin email'}`);
      }
    });

    // Buscar específicamente "Casa Renault"
    const casaRenault = companies.find(c => 
      String(c.name || '').toLowerCase().includes('casa') && 
      String(c.name || '').toLowerCase().includes('renault')
    );

    if (casaRenault) {
      console.log('\n✅ Casa Renault encontrada:');
      console.log(`   ID: ${casaRenault._id}`);
      console.log(`   Nombre: ${casaRenault.name}`);
      console.log(`   Email: ${casaRenault.email}`);
      return String(casaRenault._id);
    } else {
      console.log('\n⚠️  No se encontró "Casa Renault" exactamente.');
      console.log('   Mostrando todas las empresas para que elijas:');
      companies.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name || 'Sin nombre'} - ID: ${c._id}`);
      });
      return null;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

findCompany().then(companyId => {
  if (companyId) {
    console.log(`\n🎯 CompanyId para usar: ${companyId}`);
    process.exit(0);
  } else {
    console.log('\n❌ No se pudo determinar el companyId automáticamente');
    process.exit(1);
  }
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

