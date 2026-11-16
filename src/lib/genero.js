// Género para el Dashboard PJ. Si la planilla trae columna "Sexo"/"Género" se
// usa esa; si no, se ESTIMA por el nombre de pila con una lista de nombres
// frecuentes en Argentina (se muestra siempre como "estimado"). Sin dato si el
// nombre no está en la lista o es "Vacante".
const n = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FEM = new Set(`ana analia andrea angela angeles antonella araceli ayelen belen brenda camila carla carolina catalina cecilia celeste claudia constanza cristina daiana daniela debora delfina denise diana eliana elisa emilia erica estefania eugenia evelyn fabiana fernanda fiorella florencia gabriela georgina gisela gladys graciela guadalupe ines ivana jesica jessica jimena johana josefina julia juliana julieta karina laura lorena lucia luciana lucila luisa luz macarena magdalena maia maira marcela maria mariana mariela marina marisa marta martina melina melisa mercedes micaela milagros miriam monica nadia nahir natalia nerea noelia norma olga paola patricia paula paz rocio romina rosa rosario roxana sabrina sandra silvia sofia soledad stefania susana tamara tatiana valentina valeria vanesa veronica victoria virginia viviana yamila yanina yesica zoe franchesca francesca agustina candela carmen dolores elena esther irene isabel jazmin lara leila liliana lourdes ludmila marisol nancy nora pilar priscila sol abigail aldana alejandra anahi aylen barbara beatriz cynthia cinthia cintia solange yamila marianela rocio noemi elsa ruth stella mirta alicia adriana flavia vilma romina gimena ximena`.split(/\s+/));
const MASC = new Set(`adrian agustin alan alberto alejandro alexis alfredo andres angel antonio ariel armando arturo axel bautista benjamin bernardo braian brian bruno camilo carlos cesar christian cristian claudio cristobal damian daniel dario david diego eduardo elias emanuel emiliano emilio enrique ernesto esteban ezequiel facundo federico felipe fernando franco francisco gabriel gaston german gerardo gonzalo guillermo gustavo hector hernan horacio hugo ignacio ivan jaime javier jesus joaquin jonatan jonathan jorge jose juan julian julio kevin leandro leonardo lautaro lisandro lucas luciano luis manuel marcelo marcos mariano mario martin mateo matias mauricio maximiliano miguel milton nahuel nestor nicolas norberto oscar pablo patricio pedro rafael ramiro ramon raul renzo ricardo roberto rodolfo rodrigo roman ruben salvador samuel santiago santino sebastian sergio simon thiago tomas valentin victor walter axel brandon dante elian fabian fausto ignacio isaac joel leonel lorenzo marco mauro octavio orlando pascual rene rogelio ruben saul segundo teo tobias ulises uriel silvio roque nelson fidel edgar edgardo osvaldo omar rolando aldo abel hilario elvio cristhian rufino gustavo wilson ricardo jonas mariano luciano`.split(/\s+/));

export function generoDeTexto(v) {
  const t = n(v).trim();
  if (!t) return null;
  if (/^(m|masc|masculino|h|hombre|varon)$/.test(t)) return 'M';
  if (/^(f|fem|femenino|mujer)$/.test(t)) return 'F';
  return null;
}

// { g: 'M' | 'F' | null, estimado: boolean }
export function generoDe(v) {
  const dato = generoDeTexto(v.genero);
  if (dato) return { g: dato, estimado: false };
  const persona = n(v.persona);
  if (!persona || persona.includes('vacante')) return { g: null, estimado: false };
  // "Nombre Apellido" o "Apellido Nombre": gana la primera palabra reconocida
  for (const w of persona.replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (FEM.has(w)) return { g: 'F', estimado: true };
    if (MASC.has(w)) return { g: 'M', estimado: true };
  }
  return { g: null, estimado: true };
}
