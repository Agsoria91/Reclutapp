// Uso local (no sube nada): node scripts/csv-to-json.mjs <posiciones|candidatos> <archivo.csv>
import { readFileSync } from 'node:fs';
import { parsePositionsCSV, parseCandidatesCSV } from '../src/lib/importers.js';
const [kind, file] = process.argv.slice(2);
const bytes = readFileSync(file);
const res = kind === 'posiciones' ? parsePositionsCSV(bytes) : parseCandidatesCSV(bytes);
process.stdout.write(JSON.stringify(res));
