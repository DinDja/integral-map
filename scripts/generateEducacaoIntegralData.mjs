import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbookPath = path.join(projectRoot, 'MAPAS EDUCAÇÃO INTEGRAL.xlsx');
const outputDirectory = path.join(projectRoot, 'src', 'data');
const outputPath = path.join(outputDirectory, 'educacaoIntegralMunicipios.js');
const workbook = XLSX.readFile(workbookPath);

const municipalitiesByYear = Object.fromEntries(workbook.SheetNames
  .filter((sheetName) => /^\d{4}$/.test(sheetName))
  .sort((a, b) => Number(a) - Number(b))
  .map((year) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[year], { header: 1, defval: '' });
    const names = rows.slice(2)
      .map((row) => String(row[1] ?? '').trim())
      .filter(Boolean);
    return [year, names];
  }));

if (Object.keys(municipalitiesByYear).length === 0) {
  throw new Error('A planilha não contém abas nomeadas por ano.');
}

const output = [
  '// Gerado de MAPAS EDUCAÇÃO INTEGRAL.xlsx por scripts/generateEducacaoIntegralData.mjs.',
  '// Execute `npm run generate-educacao-integral` após atualizar a planilha.',
  `export const educationMunicipalitiesByYear = ${JSON.stringify(municipalitiesByYear, null, 2)};`,
  '',
].join('\n');

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`Dados de ${Object.keys(municipalitiesByYear).length} anos gravados em ${path.relative(projectRoot, outputPath)}.`);
