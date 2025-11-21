// Helper para obtener todos los companyIds que comparten la BD
// Esta función consulta sharedDatabaseConfig para obtener todas las empresas compartidas
// (principal + todas las secundarias)
import Company from '../models/Company.js';

export async function getAllSharedCompanyIds(originalCompanyId) {
  // Si no hay originalCompanyId, retornar array vacío
  if (!originalCompanyId) {
    return [];
  }
  
  // Normalizar a string para comparaciones consistentes
  const origIdStr = String(originalCompanyId);
  let companyIdsToSearch = [origIdStr];
  
  // Siempre verificar si hay empresas que comparten la BD (tanto si es principal como secundaria)
  try {
    const companyDoc = await Company.findById(origIdStr).select('sharedDatabaseConfig').lean();
    
    // Si la empresa no existe, retornar solo el originalCompanyId
    if (!companyDoc) {
      return [origIdStr];
    }
    
    if (companyDoc?.sharedDatabaseConfig?.sharedWith && companyDoc.sharedDatabaseConfig.sharedWith.length > 0) {
      // Esta empresa es principal, incluir todas las empresas secundarias
      companyIdsToSearch = [
        origIdStr, // La empresa principal
        ...companyDoc.sharedDatabaseConfig.sharedWith.map(sw => String(sw.companyId)) // Empresas secundarias
      ];
    } else if (companyDoc?.sharedDatabaseConfig?.sharedFrom?.companyId) {
      // Esta empresa es secundaria, incluir la principal y otras secundarias
      const mainCompanyId = String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId);
      const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
      
      // CRÍTICO: Siempre incluir la empresa principal primero (donde están los precios)
      companyIdsToSearch = [mainCompanyId]; // La empresa principal
      
      if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
        // Agregar todas las empresas secundarias (incluyendo esta)
        mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
          const secId = String(sw.companyId);
          if (!companyIdsToSearch.includes(secId)) {
            companyIdsToSearch.push(secId);
          }
        });
      }
      // Asegurar que la empresa actual también esté incluida
      if (!companyIdsToSearch.includes(origIdStr)) {
        companyIdsToSearch.push(origIdStr);
      }
    }
  } catch (err) {
    console.error('[getAllSharedCompanyIds] Error obteniendo empresas compartidas:', err);
    // En caso de error, usar solo originalCompanyId
    companyIdsToSearch = [origIdStr];
  }
  
  // Filtrar valores nulos/undefined y normalizar todos a strings
  return companyIdsToSearch
    .filter(Boolean)
    .map(id => String(id))
    .filter((id, index, arr) => arr.indexOf(id) === index); // Eliminar duplicados
}

