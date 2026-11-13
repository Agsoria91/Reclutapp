# Reclutamiento EFiS · Tecpetrol

App web que une las tres patas del reclutamiento de la operación EFiS:

| Módulo | Qué es | Quién lo ve |
|---|---|---|
| **Posiciones** ("el taco") | Una fila por silla a cubrir: área, sector, persona asignada, estado, fecha objetivo. Incluye **Modo reunión** limpio e imprimible (PDF). | Público (solo lectura) · RRHH edita |
| **Candidatos PP** | Pipeline de todos los orígenes: KPIs por etapa, avance vs. necesidad, días promedio, origen, motivos de baja, localidades. RRHH ve fichas, CVs y **sienta candidatos en sillas**. | KPIs públicos · fichas solo RRHH |
| **Nómina** | Registro único de todo el personal EFiS (planilla + ingresos confirmados en la app). | Solo RRHH |
| **Legajos** | La nómina filtrada a quienes ingresaron por una silla (mismo registro, no una copia). | Solo RRHH |

Frontend: Vite + JavaScript con módulos ES (sin framework). Backend: Supabase (Postgres + Auth + Storage), consumido directo desde el navegador. Hosting: GitHub Pages.

## Novedades

* **Terna por silla**: varios candidatos en proceso para la misma silla. Uno es el *principal* (el que está sentado) y el resto espera; si el principal se cae, la silla queda libre y se promueve a otro con "Hacer principal". La vista pública muestra solo la cantidad ("+2 en terna").
* **Próximos ingresos**: todo lo que pasa a *Próximo ingreso* se completa acá (DNI, CUIL, nacimiento, domicilio, localidad, provincia, contacto y talles de mameluco, botas y campera) y se confirma el ingreso. El legajo se crea con todo lo cargado.
* **Puesto de convenio con buscador**: se elige el puesto y la categoría y el convenio se completan solos (`src/data/convenio.json`, de la planilla *Referencia Categorías*).

## Flujo

```
CSV Candidatos PP ─┐                       ┌─> Legajo (alta automática)
                   ├─> Candidato ──sentar──> Silla ──"Ingresado"──┘
CSV Seguimiento ───┘   (etapa)     en silla  (etapa sincronizada)
```

* **Una sola tabla de etapas** (`public.stages`) y una tabla de alias (`public.stage_aliases`) que traduce los textos de *ambas* planillas: CV Recibido → Entrevista → Entrevista Aprobada → Validación RRLL → Propuesta / Oferta → Examen Médico → Apto → Próximo ingreso → Ingresado (+ Cancelado / Sin candidato). Se ve completa en la pantalla *Importar*.
* La etapa del candidato y la de su silla se mantienen sincronizadas por triggers. Al vincular, gana la más avanzada. Si se cancela al candidato, la silla queda libre.
* Al importar posiciones se vinculan solas las sillas cuyo "Candidato principal" coincide exactamente (sin acentos ni mayúsculas) con un único candidato no cancelado.

## Seguridad de datos sensibles

`Basico`, `Telefono`, `Mail`, `DNI`, CVs, comentarios, observaciones y legajos **nunca viajan a un navegador sin login de RRHH**. No se ocultan con CSS: la base no los entrega.

1. **Privilegios por columna**: el rol anónimo solo tiene `SELECT` sobre columnas no sensibles. Pedir `basico` o `dni` con la clave pública devuelve *permission denied*, aunque se consulte la tabla directo.
2. **Vistas públicas** `positions_public` y `candidates_public` (sin nombre de candidatos en esta última) que es lo único que lee la vista pública.
3. **RLS + allowlist**: lectura completa y escritura solo para usuarios en `public.staff` con email confirmado. Cualquier otra cuenta logueada no ve nada.
4. **Storage**: bucket `cvs` privado; los CVs se abren con URLs firmadas de 2 minutos.

Las migraciones están en `supabase/migrations/`. La clave de `src/config.js` es la *publicable* de Supabase: está hecha para estar en el navegador.

## Capacidad (plan gratuito de Supabase)

* Archivos (CVs): 1 GB. Un CV en PDF pesa en general 100–500 KB, o sea entre 2.000 y 10.000 CVs. Límite por archivo en la app: 10 MB.
* Base de datos: 500 MB. Las 128 sillas y 338 candidatos actuales ocupan menos de 5 MB.
* Importante: un proyecto gratuito se **pausa tras 7 días sin uso**. Se reactiva desde el panel de Supabase (Restore). Con uso semanal normal no pasa.

## Respaldos

* **Respaldo descargable**: *Usuarios → Descargar respaldo* (o el aviso naranja que aparece si pasan 7 días sin bajar uno) descarga un archivo con sillas, candidatos, ternas y la nómina completa. Guardarlo en el OneDrive/Drive de RRHH: contiene datos personales.
* **Respaldo en la base**: el schema `respaldo` de Supabase guarda copias tomadas antes de cada carga masiva o cambio de estructura (no es visible desde la app ni la API).
* Los CVs están en el Storage de Supabase (bucket privado `cvs`) y no se incluyen en el archivo descargable.

## Administración

**Dar acceso a alguien de RRHH**: desde la app, pantalla *Usuarios* → email y nombre → *Dar acceso*. Se genera una contraseña temporal que la persona cambia en *Mi contraseña*. Desde la misma pantalla se genera una contraseña nueva o se quita el acceso.

**Configuración recomendada en Supabase → Authentication**:
* *Sign In / Providers → Email*: desactivar **Allow new users to sign up** (las cuentas se crean por invitación).
* *URL Configuration*: poner como **Site URL** la URL de GitHub Pages, para que funcionen los links de acceso por mail.

**Importar planillas**: pantalla *Importar* (logueado como RRHH). Acepta el CSV de Seguimiento de ingresos (Windows-1252, `;`, doble encabezado) y el de Candidatos PP (UTF-8 con BOM, `,`). Re-importar actualiza en lugar de duplicar. Los CSV **no se suben al repositorio** (están en `.gitignore`).

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parsers y KPIs
npm run build    # genera dist/
```

Deploy: cada push a `main` publica en GitHub Pages (`.github/workflows/deploy.yml`). Activar una vez en *Settings → Pages → Source: GitHub Actions*.

## Identidad visual

Tokens en `src/styles/tokens.css`, tomados del Manual de Marca Tecpetrol 3.0 (feb 2026): primarios Pantone 3015 `#0073B4`, 348 `#008750`, 369 `#78B450`, Cool Gray 10 `#666666`, y la paleta secundaria. Tipografía de pantalla Arial + Georgia, como indica el manual. El isologo (`public/brand/`) es el arte del manual, sin redibujar. Tema claro y oscuro "HUD".

La mascota es **la Cigüeña**: un balancín con cara de ave que bombea mientras carga, mira un pozo seco cuando no hay resultados, festeja cuando se confirma un ingreso y queda con un bulón suelto si algo falla (`src/components/mascot.js`).
