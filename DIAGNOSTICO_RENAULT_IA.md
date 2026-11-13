# Diagnóstico Renault IA — instalación y OpenAI

Módulo para CASA RENAULT H&H (Bogotá). El técnico carga vehículo y falla; el backend consulta OpenAI (Responses API) y guarda el caso en MongoDB. El escáner AUTEL no se conecta al sistema.

## Qué quedó integrado

- Página: `Frontend/diagnostico-renault.html`
- API autenticada: `/api/v1/diagnosis/*` (mismo JWT de empresa que el resto del taller)
- Modelos: `DiagnosisCase`, `DiagnosisDocument` (MongoDB; no hace falta migración SQL)
- Prompt de sistema versionado: `Backend/src/lib/diagnosis/prompt.js` (`1.0.0`)
- Feature flag: `diagnosticoRenault` (si no existe, el módulo queda habilitado por compatibilidad)

## 1. Proyecto en OpenAI (API, no ChatGPT)

1. Entra a [platform.openai.com](https://platform.openai.com).
2. Crea o selecciona un **proyecto de API**.
3. Esto no es tu suscripción de ChatGPT Plus/Pro. ChatGPT cobra el chat en chatgpt.com. La API cobra por tokens en Usage y requiere crédito o billing de plataforma.

## 2. Facturación y consumo

1. [Billing](https://platform.openai.com/settings/organization/billing) → añade método de pago y crédito.
2. [Usage](https://platform.openai.com/usage) → consumo de API.
3. En el taller, cada caso guarda tokens en `usage`. Admin de empresa: pestaña **Consumo** en Diagnóstico Renault IA.

## 3. Crear la clave

1. [API keys](https://platform.openai.com/api-keys) → Create new secret key.
2. Permiso de uso del modelo (por defecto, Responses).
3. Copia la clave **una vez**. No la pegues en este chat ni en el frontend.

## 4. Dónde ponerla (privado)

**Desarrollo local**

1. Copia `.env.example` a `Backend/.env` (o usa `.env.dev` del compose de desarrollo).
2. Completa:

```
OPENAI_API_KEY=sk-...tu-clave...
OPENAI_MODEL=gpt-4o-mini
```

3. No subas `.env` ni `.env.dev` (están en `.gitignore`).

**Docker / servidor (MobaXterm)**

En `/root/proyecto-taller/.env` (producción) o `.env.dev` (develop):

```
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

`docker-compose.yml` ya pasa esas variables al contenedor `backend`. Luego:

```bash
cd /root/proyecto-taller
docker compose -p taller-prod -f docker-compose.yml up -d --build backend
```

En develop, el puerto del API sigue siendo **4001**.

## 5. Modelo

`OPENAI_MODEL` por defecto: `gpt-4o-mini` (salida estructurada, costo bajo, amplia disponibilidad).

Si tu proyecto tiene `gpt-4o` o `gpt-4.1-mini`, cámbialo en el env. El backend no adivina modelos: usa exactamente el valor configurado.

## 6. Prueba mínima real desde el backend

```bash
cd Backend
npm install
npm test
npm run test:diagnosis:openai
```

- Sin clave: el script sale con código 2 y **no** finge una llamada.
- Con clave válida: debe imprimir `Llamada real: OK` y una próxima prueba.

## 7. El navegador no recibe la clave

- La clave solo vive en el proceso Node.
- `GET /api/v1/diagnosis/meta` devuelve `{ openai: { configured: true|false, model, promptVersion } }` — nunca `apiKey`.
- Revisa en DevTools → Red que las respuestas no contienen `sk-`.

## 8. Errores habituales

| Síntoma | Causa | Qué hacer |
| --- | --- | --- |
| `Falta OPENAI_API_KEY` | Env no cargado | Completar `.env` y recrear el contenedor |
| Credenciales inválidas (401) | Clave revocada o de otro proyecto | Nueva clave de platform.openai.com |
| Cuota insuficiente (429) | Sin crédito API | Billing de plataforma (no ChatGPT) |
| Rate limit (429) | Demasiadas peticiones | Esperar; el backend reintenta 2 veces |
| Timeout (504) | Red o modelo lento | Subir `OPENAI_TIMEOUT_MS` |
| `Base técnica pendiente de cargar` | No hay fichas revisadas | Cargar documentación en la pestaña Base técnica y marcarla como revisada |
| Feature deshabilitada | Admin ocultó el módulo | Activar `diagnosticoRenault` en Admin |

## Despliegue del módulo

1. En `Backend`: `npm install` (añade el SDK oficial `openai` y actualiza `package-lock.json`).
2. Rebuild del backend Docker (la imagen ejecuta `npm install` y deja `openai` en el contenedor).
3. Pon `OPENAI_API_KEY` en `/root/proyecto-taller/.env` (prod) o `.env.dev` (develop). Nunca en el frontend.
4. Hard refresh (Ctrl+F5) en Netlify / frontend.
5. Abre **Diagnóstico Renault IA** en el menú.

MongoDB crea índices al usar los modelos. No hay colección que rellenar con valores inventados: la base técnica nace vacía a propósito.

En Moba (producción, puerto 4000):

```bash
cd /root/proyecto-taller
# Edita .env y agrega OPENAI_API_KEY y OPENAI_MODEL=gpt-4o-mini
docker compose -p taller-prod -f docker-compose.yml up -d --build backend
```

## Pruebas

Ejecutadas en esta entrega (simuladas / unitarias, 26 OK):

- Schema estructurado, guards técnicos, sanitización de secretos y PII
- Dos casos no mezclan vehículo
- Clave ausente, rechazo del modelo, acumulación de uso
- El prompt prohíbe diagnosticar pieza solo por código

Pendientes (no se declaran como hechas):

- `npm run test:diagnosis:openai` con una clave real en el servidor (ahora sale código 2: clave ausente, sin llamada fingida)
- Recorrido en el navegador: crear caso → medición → recargar → pausar/cerrar
- Cargar fichas técnicas autorizadas y revisarlas
- Validación mecánica en el taller con vehículos reales (casos ficticios de prueba deben etiquetarse como tales)
