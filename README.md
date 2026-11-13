# Reclutamiento EFiS · Tecpetrol

App web que une las tres patas del reclutamiento de la operación EFiS:

| Módulo | Qué es | Quién lo ve |
|---|---|---|
| **Posiciones** ("el taco") | Una fila por silla a cubrir: área, sector, persona asignada, estado, fecha objetivo. Incluye **Modo reunión** limpio e imprimible (PDF). | Público (solo lectura) · RRHH edita |
| **Candidatos PP** | Pipeline de todos los orígenes: KPIs por etapa, avance vs. necesidad, días promedio, origen, motivos de baja, localidades. RRHH ve fichas, CVs y **sienta candidatos en sillas**. | KPIs públicos · fichas solo RRHH |
| **Legajos** | Registro de ingresados. Se crea solo cuando una silla pasa a *Ingresado*; editable y exportable a CSV. | Solo RRHH |

Frontend: Vite + JavaScript con módulos ES (sin framework). Backend: Supabase (Postgres + Auth + Storage), consumido directo desde el navegador. Hosting: GitHub Pages.

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

## Administración

**Dar acceso a alguien de RRHH** (hasta hoy: 3 personas):
1. Supabase → Authentication → Users → *Invite user* (o *Add user* con contraseña).
2. SQL Editor: `insert into public.staff (email, nombre) values ('persona@tecpetrol.com', 'Nombre');`

Quitar acceso: `delete from public.staff where email = '...';`

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
