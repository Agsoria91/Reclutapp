# Reclutamiento EFiS · contexto del proyecto

Documento de traspaso para retomar el trabajo en una conversación nueva.
**Mantenerlo actualizado con cada cambio** (sección "Historial de decisiones" y "Pendientes").
No incluir datos personales (nombres, DNI, mails, teléfonos, sueldos) en este archivo ni en el repositorio.

## Qué es

App web interna de Recursos Humanos de EFiS (Energy Field Services, grupo Tecpetrol, Neuquén) para el
plan de cobertura de posiciones: sillas (posiciones) → candidatos → entrevistas → examen médico →
ingreso → legajo/nómina. La usa RRHH a diario y jefaturas/gerencias como lectores.

- Publicada en **GitHub Pages**: https://agsoria91.github.io/Reclutapp/
- Repositorio: `Agsoria91/reclutapp` · rama de trabajo `claude/beautiful-curie-rtk40j`
- Base de datos: **Supabase**, proyecto `hganqfffgmicpmstqytm` (plan gratuito: 500 MB base, 1 GB archivos; hoy ~15 MB)

## Cómo trabajar (flujo de cada cambio)

1. Editar en la rama de trabajo. `npx vite build` y `node --test tests/*.test.js` deben pasar.
2. Si toca diseño: pruebas visuales (ver abajo) antes y después.
3. Cambios de base: archivo nuevo en `supabase/migrations/AAAAMMDDhhmmss_nombre.sql` **y** aplicarlo con la herramienta de migraciones de Supabase. Guardar respaldo en el esquema `respaldo` antes de tocar datos masivamente.
4. Commit → `git fetch origin main && git merge` → push → crear PR a `main` → merge (método "merge"). GitHub Actions publica solo en Pages (`.github/workflows`).
5. Verificar que esté en línea buscando un texto nuevo en los `assets/*.js|css` publicados.
6. Contarle al usuario qué cambió, en español rioplatense (voseo), claro y sin jerga técnica.

## Reglas y criterios del usuario (respetar siempre)

- **Privacidad**: Básico/sueldo, teléfono, mail y DNI nunca viajan al navegador sin sesión de RRHH. Se resuelve en la base: los lectores leen solo `positions_public` / `candidates_public`; las tablas completas tienen RLS `is_staff()`. Sin sesión habilitada no se lee nada (`puede_leer()`).
- Nada de datos personales en el repositorio (planillas `.csv/.xlsx` están en `.gitignore`). Las capturas y pruebas usan **datos ficticios** (`tests/visual/datos-demo.cjs`).
- **Nada que consuma tokens** ni servicios pagos.
- Lenguaje **profesional**, sin textos de ayuda en pantalla.
- **Consultar antes** de cambios de diseño grandes o de usar fotos.
- Explicar con evidencia; si algo no se pudo verificar, decirlo.

## Estructura del código

- Vite 5 + JavaScript (ES modules), sin framework. Plantillas `html\`\`` con escape automático (`src/lib/html.js`, `raw()` para HTML confiable).
- `src/main.js`: rutas (hash), barra lateral agrupada (Cobertura / Proceso / Dotación / Administración), barra superior (buscar, campanita, Excel, compacto, tema), barra inferior en celular, transiciones.
- `src/lib/store.js`: estado global y carga desde Supabase (qué datos viajan según el rol).
- `src/lib/kpis.js`: cálculos puros (cobertura, días en etapa con plazos, avance del período…). Tienen pruebas en `tests/`.
- Pantallas en `src/views/`: posiciones (Mapa de sillas · Por mes objetivo · Por etapa), mapa (Leaflet satelital, inicio alternativo), candidatos (ficha por pestañas, varias entrevistas por DNI, próximo paso, filtros rápidos), agenda (mes/semana, feriados), entrevistas, exámenes, ingresos, legajos, nómina (Resumen · Gráficos · Perfil · Listado, diferencias con SAP, plazos fijos), dashboardpj, importar, usuarios, reunión (diapositivas 16:9), presentar, historial, login.
- Componentes en `src/components/`: `ui.js` (paneles, avisos con Deshacer, filtros), `avisos.js` (plantillas WhatsApp/mail, incluye turnos por clínica), `paraHoy.js` (franja + campanita), `cumples.js` (cumpleaños y aniversarios), `buscador.js` (Ctrl+K), `tarjetaFlotante.js`, `detalleGrafico.js`, `moderno.js`, `iconos.js`, `examen.js`, `ingreso.js`, `folds.js`.
- Datos fijos en `src/data/`: `yacimientos.js` (códigos y coordenadas), `feriados.js` (2026 oficial, 2027 por ley; agregar días puente 2027 cuando se publiquen), `areas-neuquen.json` (áreas de concesión oficiales).
- Estilos: `src/styles/tokens.css` → `app.css` (base) → `iris.css` (estilo actual: IRIS con paleta EFiS, claro/oscuro/automático). `src/views/reunion.css` para las diapositivas. Colores por yacimiento en `src/lib/coloresYac.js`.

## Base de datos (tablas principales)

`positions` (sillas), `candidates`, `position_candidates` (ternas), `position_history`, `nomina`, `sap_posiciones` (maestro SAP, solo RRHH), `stages` (etapas), `avisos` y `plantillas_aviso`, `vacantes_pj` (+ `_importaciones`), `staff` (RRHH), `lectores`, `stage_aliases`. Vistas para lectores: `positions_public`, `candidates_public`.
Triggers relevantes: `tg_candidates_hitos` (las fechas adelantan la etapa salvo que la etapa se elija a mano), `tg_candidates_after` (sincroniza la silla: etapa, nombre, localidad y procedencia salen siempre de la ficha del candidato), `tg_touch` (updated_by), historial de sillas. Función `nombre_de_usuario(uuid)` para "Modificado por" (solo RRHH).

## Pruebas

- Unitarias: `npm test` (`tests/*.test.js`).
- Visuales: `npm run visual:base` (antes) → `npm run visual:nuevo` (después) → `npm run visual:comparar`. 67 pantallas con datos ficticios; ver `tests/visual/README.md`. Al agregar una pantalla, sumarla en `tests/visual/pantallas.cjs`.
- Lección aprendida: al "limpiar" CSS no basta con las capturas (hay elementos transitorios: avisos, estados vacíos, diálogos). Solo quitar reglas que nombran clases inexistentes en el código.

## Historial de decisiones

- Diseño actual: estilo IRIS con paleta EFiS, barra lateral fija agrupada, tira de indicadores, barras graduadas, ficha por pestañas, barra inferior en celular. Inicio en Posiciones.
- Descartado por el usuario: diseño bento, fotos de fondo, animaciones "SCADA/telemetría", mapa dibujado (se mantiene el satelital real), cierre de mes, gráfico de residentes en Neuquén por yacimiento.
- Cumpleaños/aniversarios: fijos según el día (no se pueden ocultar); en Agenda, Nómina y campanita.
- Avisos de turno por clínica: plantillas `turno_synergys` y `turno_cmit` (se ofrecen al guardar un turno; usan `{fecha_turno}` con la hora de `turno_hora`). Cualquier clínica con plantilla `turno_<clínica>` funciona igual.
- "Días en etapa": CV recibido no cuenta; un turno agendado a futuro no es demora. Plazos en `PLAZOS_ETAPA` (kpis.js).
- Cargas masivas desde planilla (ej. 27/11/2026, Well Services LT2E enero): si el candidato ya existe solo se completan campos vacíos (no se pisa nada), los nuevos entran en CV recibido, se sientan en sillas libres sin ocupar relevos; sobrantes van a la terna. Respaldo previo en `respaldo.*_AAAAMMDD`.
- "Próximos ingresos" (pantalla Ingresos y diapositiva de reunión): solo sillas en etapa Próximo ingreso; una fecha de ingreso cargada por adelantado no alcanza.
- POS SAP: el maestro SAP manda; si quien figura en SAP está de baja en nómina, la POS se considera libre.

## Pendientes

- Plantillas de turno para **Santa Cruz** y **Dients** (esperar texto y dirección del usuario).
- Qué significa **"G"** en el campo sexo de la nómina (hoy se muestra como "Otro" en Perfil).
- Días puente (no laborables turísticos) de **2027** en `src/data/feriados.js` cuando se publiquen.
- Ideas en evaluación del usuario (en armado del área): habilitaciones de campo con vencimientos, diagramas y relevos, solicitud de personal por jefaturas, seguimiento de primeros 90 días, entrevista de salida.
