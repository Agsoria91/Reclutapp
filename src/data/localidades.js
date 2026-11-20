// Localidad -> provincia y código postal (CP numérico de 4 dígitos).
// Cubre las localidades que aparecen en la operación (Neuquén y Alto Valle)
// y las ciudades más comunes del país. Al elegir la localidad en una ficha se
// completan provincia y CP; siempre se pueden corregir a mano.
// Para sumar una: [nombre, provincia, CP] (y alias si se escribe distinto).
export const LOCALIDADES = [
  // Neuquén
  ['Neuquén', 'Neuquén', '8300'], ['Plottier', 'Neuquén', '8316'], ['Senillosa', 'Neuquén', '8316'],
  ['Centenario', 'Neuquén', '8309'], ['Vista Alegre', 'Neuquén', '8309'], ['Cutral Có', 'Neuquén', '8322'],
  ['Plaza Huincul', 'Neuquén', '8318'], ['Rincón de los Sauces', 'Neuquén', '8319'], ['Añelo', 'Neuquén', '8305'],
  ['San Patricio del Chañar', 'Neuquén', '8305'], ['Zapala', 'Neuquén', '8340'], ['Picún Leufú', 'Neuquén', '8313'],
  ['Piedra del Águila', 'Neuquén', '8315'], ['Chos Malal', 'Neuquén', '8353'], ['Junín de los Andes', 'Neuquén', '8371'],
  ['San Martín de los Andes', 'Neuquén', '8370'], ['Villa La Angostura', 'Neuquén', '8407'], ['Las Lajas', 'Neuquén', '8347'],
  ['Loncopué', 'Neuquén', '8349'], ['Aluminé', 'Neuquén', '8345'], ['Villa El Chocón', 'Neuquén', '8311'],
  ['Buta Ranquil', 'Neuquén', null], ['Barrancas', 'Neuquén', null], ['Octavio Pico', 'Neuquén', null],
  ['Sauzal Bonito', 'Neuquén', null], ['Tratayén', 'Neuquén', null], ['Arroyito', 'Neuquén', null],
  // Río Negro
  ['Cipolletti', 'Río Negro', '8324'], ['Fernández Oro', 'Río Negro', '8324'], ['Cinco Saltos', 'Río Negro', '8303'],
  ['Catriel', 'Río Negro', '8307'], ['Allen', 'Río Negro', '8328'], ['General Roca', 'Río Negro', '8332'],
  ['Villa Regina', 'Río Negro', '8336'], ['Villa Manzano', 'Río Negro', '8308'], ['Barda del Medio', 'Río Negro', '8305'],
  ['Contralmirante Cordero', 'Río Negro', '8301'], ['Sargento Vidal', 'Río Negro', '8305'], ['Campo Grande', 'Río Negro', '8305'],
  ['Ingeniero Huergo', 'Río Negro', '8334'], ['Cervantes', 'Río Negro', '8326'], ['Mainqué', 'Río Negro', '8326'],
  ['Choele Choel', 'Río Negro', '8360'], ['El Bolsón', 'Río Negro', '8430'], ['San Carlos de Bariloche', 'Río Negro', '8400'],
  ['Viedma', 'Río Negro', '8500'], ['Río Colorado', 'Río Negro', '8138'],
  ['Godoy', 'Río Negro', null], ['Chichinales', 'Río Negro', null], ['Peñas Blancas', 'Río Negro', null], ['San Isidro', 'Río Negro', null],
  // Mendoza
  ['Mendoza', 'Mendoza', '5500'], ['Godoy Cruz', 'Mendoza', '5501'], ['Maipú', 'Mendoza', '5515'],
  ['Luján de Cuyo', 'Mendoza', '5507'], ['Las Heras', 'Mendoza', '5539'], ['Guaymallén', 'Mendoza', '5521'],
  ['San Rafael', 'Mendoza', '5600'], ['Malargüe', 'Mendoza', '5613'],
  // La Pampa, Buenos Aires, Patagonia sur
  ['Santa Rosa', 'La Pampa', '6300'], ['General Pico', 'La Pampa', '6360'], ['25 de Mayo', 'La Pampa', '8201'],
  ['Santa Isabel', 'La Pampa', null], ['Gobernador Duval', 'La Pampa', null], ['Casa de Piedra', 'La Pampa', null],
  ['Bahía Blanca', 'Buenos Aires', '8000'], ['Carmen de Patagones', 'Buenos Aires', '8504'], ['La Plata', 'Buenos Aires', '1900'],
  ['Mar del Plata', 'Buenos Aires', '7600'], ['Ciudad de Buenos Aires', 'CABA', '1000'],
  ['Comodoro Rivadavia', 'Chubut', '9000'], ['Trelew', 'Chubut', '9100'], ['Rawson', 'Chubut', '9103'], ['Puerto Madryn', 'Chubut', '9120'],
  ['Caleta Olivia', 'Santa Cruz', '9011'], ['Río Gallegos', 'Santa Cruz', '9400'],
  // Resto del país (capitales y grandes ciudades)
  ['Córdoba', 'Córdoba', '5000'], ['Rosario', 'Santa Fe', '2000'], ['Santa Fe', 'Santa Fe', '3000'],
  ['Salta', 'Salta', '4400'], ['San Miguel de Tucumán', 'Tucumán', '4000'], ['San Salvador de Jujuy', 'Jujuy', '4600'],
  ['Formosa', 'Formosa', '3600'], ['Resistencia', 'Chaco', '3500'], ['Corrientes', 'Corrientes', '3400'],
  ['Posadas', 'Misiones', '3300'], ['Paraná', 'Entre Ríos', '3100'], ['Santiago del Estero', 'Santiago del Estero', '4200'],
  ['San Fernando del Valle de Catamarca', 'Catamarca', '4700'], ['La Rioja', 'La Rioja', '5300'], ['San Juan', 'San Juan', '5400'],
  ['San Luis', 'San Luis', '5700'], ['Ushuaia', 'Tierra del Fuego', '9410'],
];

// otras formas de escribir la misma localidad
const ALIAS = {
  'general fernandez oro': 'Fernández Oro', 'fernandez oro': 'Fernández Oro',
  'bariloche': 'San Carlos de Bariloche', 'tucuman': 'San Miguel de Tucumán', 'jujuy': 'San Salvador de Jujuy',
  'catamarca': 'San Fernando del Valle de Catamarca', 'caba': 'Ciudad de Buenos Aires', 'capital federal': 'Ciudad de Buenos Aires',
  'buenos aires': 'Ciudad de Buenos Aires', 'rdls': 'Rincón de los Sauces', 'rincon': 'Rincón de los Sauces',
  'cutral co': 'Cutral Có', 'chanar': 'San Patricio del Chañar', 'el chanar': 'San Patricio del Chañar',
};

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const POR_NOMBRE = new Map(LOCALIDADES.map(([n, p, cp]) => [norm(n), { localidad: n, provincia: p, cp }]));

export function buscarLocalidad(texto) {
  const k = norm(texto);
  if (!k) return null;
  return POR_NOMBRE.get(k) || POR_NOMBRE.get(norm(ALIAS[k] || '')) || null;
}

export const PROVINCIAS_AR = ['Neuquén', 'Río Negro', 'Mendoza', 'La Pampa', 'Buenos Aires', 'CABA', 'Chubut', 'Santa Cruz',
  'Tierra del Fuego', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'Corrientes', 'Misiones', 'Chaco', 'Formosa', 'Salta', 'Jujuy',
  'Tucumán', 'Santiago del Estero', 'Catamarca', 'La Rioja', 'San Juan', 'San Luis'];

// Lista que se ofrece al cargar candidatos: Alto Valle de Neuquén y Río Negro,
// localidades de Vaca Muerta y del área del convenio de Petroleros Privados de
// Río Negro, Neuquén y La Pampa. Cualquier otra se carga con "Otro…" (y si es
// una ciudad conocida igual completa provincia y CP).
export const LOCALIDADES_REGION = [
  // Neuquén: Confluencia / Alto Valle
  'Neuquén', 'Plottier', 'Centenario', 'Vista Alegre', 'Senillosa', 'Villa El Chocón', 'Arroyito',
  // Neuquén: Vaca Muerta y cuenca
  'Añelo', 'San Patricio del Chañar', 'Tratayén', 'Sauzal Bonito', 'Rincón de los Sauces', 'Octavio Pico',
  'Cutral Có', 'Plaza Huincul', 'Picún Leufú', 'Zapala', 'Las Lajas', 'Chos Malal', 'Buta Ranquil', 'Barrancas',
  // Río Negro: Alto Valle
  'Cipolletti', 'Fernández Oro', 'Allen', 'General Roca', 'Cervantes', 'Mainqué', 'Ingeniero Huergo', 'Villa Regina',
  'Godoy', 'Chichinales', 'Cinco Saltos', 'Contralmirante Cordero', 'Barda del Medio', 'Campo Grande', 'Sargento Vidal',
  'Villa Manzano', 'San Isidro', 'Catriel', 'Peñas Blancas',
  // La Pampa: zona petrolera del convenio
  '25 de Mayo', 'Santa Isabel', 'Gobernador Duval', 'Casa de Piedra',
];
