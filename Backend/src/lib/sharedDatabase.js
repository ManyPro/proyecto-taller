// Helper para obtener todos los companyIds que comparten la BD
// Esta función consulta sharedDatabaseConfig para obtener todas las empresas compartidas
// (principal + todas las secundarias)
export async function getAllSharedCompanyIds(originalCompanyId) {
  let companyIdsToSearch = [originalCompanyId];
  
  // Siempre verificar si hay empresas que comparten la BD (tanto si es principal como secundaria)
  if (originalCompanyId) {
    try {
      const Company = (await import('../models/Company.js')).default;
      const companyDoc = await Company.findById(originalCompanyId).select('sharedDatabaseConfig').lean();
      
      if (companyDoc?.sharedDatabaseConfig?.sharedWith && companyDoc.sharedDatabaseConfig.sharedWith.length > 0) {
        // Esta empresa es principal, incluir todas las empresas secundarias
        companyIdsToSearch = [
          originalCompanyId, // La empresa principal
          ...companyDoc.sharedDatabaseConfig.sharedWith.map(sw => String(sw.companyId)) // Empresas secundarias
        ];
      } else if (companyDoc?.sharedDatabaseConfig?.sharedFrom?.companyId) {
        // Esta empresa es secundaria, incluir la principal y otras secundarias
        const mainCompanyId = String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId);
        const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
        
        companyIdsToSearch = [mainCompanyId]; // La empresa principal
        if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
          // Agregar todas las empresas secundarias (incluyendo esta)
          mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
            companyIdsToSearch.push(String(sw.companyId));
          });
        }
        // Asegurar que la empresa actual también esté incluida
        if (!companyIdsToSearch.includes(String(originalCompanyId))) {
          companyIdsToSearch.push(String(originalCompanyId));
        }
      }
    } catch (err) {
      console.error('[getAllSharedCompanyIds] Error obteniendo empresas compartidas:', err);
      // En caso de error, usar solo originalCompanyId
      companyIdsToSearch = [originalCompanyId];
    }
  }
  
  return companyIdsToSearch;
}

