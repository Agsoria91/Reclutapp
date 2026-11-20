# Reclutamiento EFiS — Documento técnico de traspaso

Documento para el equipo de IT. Resume cómo está construida la app, dónde vive
cada pieza y qué hay que respetar si se la migra a sistemas internos.

> Última actualización: noviembre 2026.

---

## 1. Resumen

| | |
|---|---|
| **Qué es** | App web interna de Recursos Humanos de EFiS para el reclutamiento de la operación: mapa de posiciones (sillas a cubrir), pipeline de candidatos, entrevistas, exámenes médicos, próximos ingresos, nómina/legajos y un tablero de búsquedas (Dashboard PJ). |
| **Usuarios** | RRHH (edita y ve datos sensibles) y Lectores (supervisión y dirección, solo lectura sin datos personales). Solo correos `@efis.com`, `@efis.com.ar`, `@tecpetrol.com`, `@tecpetrol.com.ar`. |
| **Frontend** | Sitio estático: JavaScript con módulos ES + Vite 5. Sin framework. Sin servidor propio. |
| **Backend** | Supabase: **PostgreSQL 15+** (datos, reglas, seguridad por fila), **Auth** (usuarios y contraseñas), **Storage** (CVs). Se consume directo desde el navegador con `@supabase/supabase-js`. |
| **Hosting** | GitHub Pages, publicado automáticamente con GitHub Actions al hacer merge en `main`. |
| **Costo actual** | $0 (planes gratuitos de Supabase y GitHub). |

```
┌──────────────────────────┐        HTTPS (REST / Auth / Storage)        ┌───────────────────────────────┐
│  Navegador del usuario   │  ─────────────────────────────────────────▶ │  Supabase                     │
│  (sitio estático Vite)   │                                             │  • PostgreSQL (RLS + triggers)│
│  GitHub Pages            │ ◀─────────────────────────────────────────  │  • Auth (email + contraseña)  │
└──────────────────────────┘     JSON (solo lo que la base permite)      │  • Storage: bucket "cvs"      │
                                                                         └───────────────────────────────┘
```

**Toda la seguridad está en la base de datos** (políticas RLS, vistas y
funciones). El frontend no decide qué datos puede ver cada usuario: la base
solo entrega lo permitido. Esto es lo más importante a conservar en una migración.

---

## 2. Repositorio

```
├── index.html                 punto de entrada
├── src/
│   ├── main.js                router (#/ruta), barra superior, control de acceso por pantalla
│   ├── views/                 una pantalla por archivo (ver §5)
│   ├── components/            piezas reutilizables (formularios, avisos, historial, examen médico, mascota)
│   ├── lib/                   datos y utilidades
│   │   ├── supabase.js        cliente Supabase (URL + clave pública)
│   │   ├── store.js           carga de datos: RRHH lee tablas completas; lectores, vistas *_public
│   │   ├── kpis.js            cálculos de indicadores
│   │   ├── importers.js       lectura de los CSV de Posiciones y Candidatos PP
│   │   ├── vacantesPj.js      lectura del CSV Status_Vacantes (Dashboard PJ)
│   │   ├── xlsx.js, reporteExcel.js   exportación a Excel (sin librerías pesadas)
│   │   └── respaldo.js        descarga de respaldo completo (JSON)
│   ├── data/                  tablas de referencia (convenio, búsquedas, localidades)
│   └── styles/                tokens de marca EFiS + estilos
├── public/brand/              logos EFiS
├── supabase/migrations/       estructura completa de la base, en orden (ver §3)
├── tests/                     pruebas (node --test)
└── .github/workflows/deploy.yml   build + test + publicación en GitHub Pages
```

Comandos:

```
npm ci          # instalar dependencias
npm run dev     # entorno local (http://localhost:5173)
npm test        # pruebas
npm run build   # genera /dist (sitio estático listo para publicar)
```

La URL y la clave **pública** (anon/publishable) de Supabase están en
`src/lib/supabase.js`. Esa clave puede estar en el frontend: lo que protege los
datos son las políticas de la base. **Nunca** poner la clave `service_role` en el frontend.

---

## 3. Base de datos

La carpeta `supabase/migrations/` contiene archivos SQL numerados. Ejecutados en
orden sobre un PostgreSQL vacío (con el esquema `auth` de Supabase o equivalente)
recrean toda la estructura. Todos están aplicados en producción.

| Migración | Contenido |
|---|---|
| `…000100_schema` | Tablas base: etapas, alias de etapas, posiciones, candidatos, staff |
| `…000200_logic` | Reglas: sincronización de etapa silla ↔ candidato, importadores, asignación |
| `…000300_security` / `…000400` | RLS, vistas públicas, permisos |
| `…000500_staff_admin` | Alta/baja de usuarios RRHH desde la app |
| `…000600` / `…000700` | Terna por silla, convenio, datos de pre-ingreso |
| `…000800_hitos_automaticos` | Las fechas de cada hito mueven la etapa automáticamente |
| `…000900` / `…001000` | Nómina y unificación de legajos con nómina |
| `…001100_historial_sillas` | Historial de quién pasó por cada silla + fecha de baja |
| `…001200_acceso_corporativo` | Acceso solo con cuenta corporativa; rol Lector |
| `…001300` / `…001500` | Avisos a candidatos (WhatsApp/mail) y plantillas |
| `…001400` | Dominios .com.ar |
| `…001600` | Corrección de datos (fechas de entrevista por descarte) |
| `…001700` / `…001800` | Dashboard PJ (búsquedas desde CSV) |
| `…001900` / `…002000` | Exámenes médicos, interconsulta, POS SAP única, regla médica de etapa |

### Tablas (esquema `public`)

| Tabla | Qué guarda | Acceso |
|---|---|---|
| `stages`, `stage_aliases` | Etapas del proceso y equivalencias de textos de las planillas | Usuarios logueados |
| `positions` | Sillas (posiciones a cubrir): área, sector, puesto, POS SAP, estado, fechas, convenio, básico | RRHH (lectores vía `positions_public`) |
| `candidates` | Candidatos: etapa, hitos con fecha, datos personales, examen médico, interconsulta, CV | RRHH (lectores vía `candidates_public`) |
| `position_candidates` | Terna: candidatos en proceso para cada silla | RRHH |
| `position_history` | Historial por silla (titular/terna, desde/hasta, motivo) | RRHH |
| `nomina` | Nómina completa (incluye legajos de quienes ingresaron por una silla) | RRHH |
| `avisos`, `plantillas_aviso` | Registro de avisos enviados y textos de los mensajes | RRHH |
| `vacantes_pj`, `vacantes_pj_importaciones` | Dashboard PJ (foto de la planilla Status_Vacantes, solo EFiS) | RRHH |
| `staff` | Usuarios con rol RRHH | RRHH |
| `lectores` | Usuarios con rol Lectura | RRHH |

**Vistas:** `positions_public`, `candidates_public`: mismas filas, **sin columnas
sensibles**, filtradas por `puede_leer()`. Son lo único que leen los lectores.

**Esquema `respaldo`:** copias de seguridad internas tomadas antes de cambios
masivos de datos. No está expuesto por la API.

**Storage:** bucket privado `cvs` (CVs de candidatos, solo RRHH).

### Funciones principales

| Función | Para qué |
|---|---|
| `is_staff()`, `puede_leer()` | Rol del usuario actual (RRHH / lector). Base de todas las políticas |
| `es_correo_corporativo(email)` | Valida dominios permitidos |
| `staff_upsert_user`, `staff_remove`, `lector_upsert`, `lector_remove` | Alta/baja de usuarios desde la app (solo RRHH) |
| `assign_candidate`, `unassign_position`, `recount_terna` | Sentar/liberar candidatos en sillas y terna |
| `import_positions`, `import_candidates`, `link_positions_by_name` | Importación de planillas CSV |
| `import_vacantes_pj` | Reemplaza la foto del Dashboard PJ |
| `stage_por_hitos`, `hoy_ar` | Etapa que corresponde según las fechas cargadas (zona horaria Argentina) |

### Reglas automáticas (triggers)

- **Etapa ↔ fechas:** cargar la fecha de un hito avanza la etapa; elegir una etapa completa la fecha del hito (`candidates_hitos`).
- **Regla médica:** con aptitud "No apto" o interconsulta abierta, el candidato no puede quedar en "Apto"; vuelve a "Examen Médico" (`candidates_hitos_medico`).
- **Silla ↔ candidato:** la etapa se sincroniza en ambos sentidos; cancelar al candidato libera la silla (`candidates_after`, `positions_after`).
- **Ingreso:** al pasar a "Ingresado" se crea/actualiza el registro en `nomina`.
- **Historial:** cada cambio de titular o terna queda en `position_history`.
- **Fecha de baja:** se completa sola al cancelar (`candidates_fecha_baja`).
- **POS SAP única:** no se puede crear ni cambiar una silla a una POS SAP ya usada (`positions_pos_sap_unica`).

---

## 4. Seguridad y datos sensibles

**Regla de diseño:** `Básico` (sueldo), `Teléfono`, `Mail` y `DNI` **nunca** viajan
al navegador de un usuario que no sea RRHH. Esto se cumple en la base, no
ocultando columnas en pantalla:

1. Sin login (rol `anon`) no hay acceso a ninguna tabla ni vista.
2. Lectores: solo `positions_public` / `candidates_public`, que no incluyen esas
   columnas. Las tablas completas les devuelven 0 filas (RLS).
3. RRHH: tablas completas, filtradas por `is_staff()`.
4. Las cuentas solo las crea RRHH desde la pantalla Usuarios; el registro libre
   de Supabase Auth debe estar **desactivado**.

Cualquier migración debe mantener esta separación del lado del servidor.

---

## 5. Pantallas

| Ruta | Pantalla | Rol |
|---|---|---|
| `#/posiciones` | Mapa de posiciones, editor de silla, terna, historial de silla | Todos (RRHH edita) |
| `#/candidatos` | Pipeline, reportes, fichas, avisos | Todos (fichas solo RRHH) |
| `#/entrevistas` | Embudo y efectividad | Todos |
| `#/reunion` | Modo reunión (presentación 16:9 con datos en vivo) | Todos (exámenes solo RRHH) |
| `#/dashboardpj` | Búsquedas EFiS desde CSV Status_Vacantes | RRHH |
| `#/examenes` | Control de exámenes médicos e interconsultas | RRHH |
| `#/ingresos` | Próximos ingresos (datos de alta y talles) | RRHH |
| `#/legajos`, `#/nomina` | Personal | RRHH |
| `#/importar` | Carga de planillas CSV | RRHH |
| `#/usuarios` | Usuarios RRHH y Lectores, respaldo | RRHH |
| `#/historial?id=…` | Historial de una silla en pantalla completa | RRHH |

---

## 6. Cómo migrar

**A. Mover solo el hosting (lo más simple).** `npm ci && npm run build` y servir la
carpeta `dist/` desde cualquier servidor web interno (IIS, Nginx, Apache,
SharePoint con sitio estático). La app sigue usando el mismo Supabase.

**B. Llevar la base a un PostgreSQL interno.**
1. Exportar con `pg_dump` desde Supabase (o pedir el backup desde el panel).
2. Restaurar en el Postgres interno.
3. Reemplazar Supabase Auth y Storage (ver C) o levantar Supabase *self-hosted*
   (open source, mismo funcionamiento, no requiere cambiar el frontend).

**C. Integrar con sistemas corporativos.**
- **Login:** Supabase Auth soporta Microsoft Entra ID (Azure AD). Se activa el
  proveedor y se mantienen las tablas `staff` / `lectores` para los roles.
- **CVs:** el bucket `cvs` puede reemplazarse por SharePoint/servidor de archivos;
  el único código que lo usa está en `src/views/candidatos.js` (subir/ver/quitar CV).
- **Datos:** las planillas (CSV) de Posiciones, Candidatos PP y Status_Vacantes
  podrían reemplazarse por integraciones con SAP u otros sistemas.

**Puntos que no hay que perder:**
- La separación de datos sensibles en el servidor (§4).
- Los triggers de etapa, regla médica, historial e ingreso (§3).
- Las migraciones como fuente de verdad de la estructura.

---

## 7. Operación diaria

- **Respaldo:** botón "Descargar respaldo" (barra superior, solo RRHH): descarga
  un JSON con sillas, candidatos, ternas y nómina. Recomendado semanal.
- **Publicación:** todo cambio entra por Pull Request a `main`; GitHub Actions
  corre las pruebas, compila y publica.
- **Plan gratuito de Supabase:** 500 MB de base (uso ≈ 3%), 1 GB de archivos
  (uso 0%). El proyecto se pausa tras ~7 días sin uso; se reactiva desde el panel.
