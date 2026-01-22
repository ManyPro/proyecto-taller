#!/usr/bin/env python3
"""
Script para limpiar CSS suelto de archivos HTML
Elimina CSS que no está dentro de etiquetas <style>
"""

import re
import os
from pathlib import Path

# Patrón para detectar CSS suelto (líneas que empiezan con selectores CSS)
CSS_PATTERN = re.compile(r'^\s*(body\.theme-light|\.custom-scrollbar|#modal|@media|html\s*\{|body\s*\{|\.nav-tab|\.card|\.topbar)', re.MULTILINE)

# Archivos HTML a procesar
HTML_FILES = [
    'Frontend/precios.html',
    'Frontend/nomina.html',
    'Frontend/cartera.html',
    'Frontend/skus.html',
    'Frontend/templates.html',
    'Frontend/template-selector.html',
    'Frontend/cashflow.html',
]

def clean_html_file(filepath):
    """Limpia CSS suelto de un archivo HTML"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Buscar el bloque de CSS suelto que está después de </head> o dentro del body
        # Patrón: desde "body.theme-light" o similar hasta encontrar un <div o comentario HTML válido
        # Buscar desde <body hasta encontrar el primer elemento HTML válido
        
        # Encontrar la posición de <body
        body_start = content.find('<body')
        if body_start == -1:
            print(f"⚠️  No se encontró <body en {filepath}")
            return False
        
        # Encontrar el cierre de <body>
        body_tag_end = content.find('>', body_start) + 1
        
        # Buscar el primer elemento HTML válido después de <body>
        # Buscar patrones como <!--, <div, <script, etc.
        html_elements = ['<!--', '<div', '<script', '<nav', '<header', '<main', '<section']
        first_element_pos = len(content)
        
        for element in html_elements:
            pos = content.find(element, body_tag_end)
            if pos != -1 and pos < first_element_pos:
                first_element_pos = pos
        
        # Si encontramos CSS suelto entre body_tag_end y first_element_pos
        if first_element_pos < len(content):
            # Extraer el bloque problemático
            problematic_block = content[body_tag_end:first_element_pos]
            
            # Verificar si contiene CSS (no solo espacios y saltos de línea)
            if re.search(r'[a-zA-Z]', problematic_block) and CSS_PATTERN.search(problematic_block):
                # Eliminar el bloque problemático
                content = content[:body_tag_end] + '\n' + content[first_element_pos:]
                print(f"✅ Limpiado CSS suelto de {filepath}")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                return True
        
        return False
    except Exception as e:
        print(f"❌ Error procesando {filepath}: {e}")
        return False

def main():
    """Función principal"""
    base_path = Path(__file__).parent.parent
    
    cleaned = 0
    for html_file in HTML_FILES:
        filepath = base_path / html_file
        if filepath.exists():
            if clean_html_file(filepath):
                cleaned += 1
        else:
            print(f"⚠️  Archivo no encontrado: {filepath}")
    
    print(f"\n✅ Procesados {len(HTML_FILES)} archivos, {cleaned} limpiados")

if __name__ == '__main__':
    main()
