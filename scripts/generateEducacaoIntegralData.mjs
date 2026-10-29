import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbookPath = path.join(projectRoot, 'MAPAS EDUCAÇÃO INTEGRAL.xlsx');
const outputDirectory = path.join(projectRoot, 'src', 'data');
const outputPath = path.join(outputDirectory, 'educacaoIntegralMunicipios.js');
const workbook = XLSX.readFile(workbookPath);
const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');
const municipalityKey = (value) => {
  const key = normalizeText(value);
  return key === 'saodesiferio' ? 'saodesiderio' : key;
};
const readRows = (sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

const municipalitiesByYear = Object.fromEntries(workbook.SheetNames
  .filter((sheetName) => /^\d{4}$/.test(sheetName))
  .sort((a, b) => Number(a) - Number(b))
  .map((year) => {
    const rows = readRows(year);
    const names = rows.slice(2)
      .map((row) => String(row[1] ?? '').trim())
      .filter(Boolean);
    return [year, names];
  }));

if (Object.keys(municipalitiesByYear).length === 0) {
  throw new Error('A planilha não contém abas nomeadas por ano.');
}

const universalizationSheet = workbook.SheetNames.find((sheetName) => normalizeText(sheetName) === 'universalizacao');
const eightMunicipalitiesSheet = workbook.SheetNames.find((sheetName) => {
  const normalizedName = normalizeText(sheetName);
  return normalizedName.startsWith('8') && normalizedName.includes('munic');
});
const universalizationRows = universalizationSheet
  ? readRows(universalizationSheet).slice(1).filter((row) => row[1] && row[2])
  : [];
const forecastByYear = {};
const proposalsByYear = {};
const tenderRows = [];

universalizationRows.forEach((row) => {
  const municipality = String(row[1]).trim();
  const status = String(row[2]).trim();
  const forecastYear = status.match(/^Previsão para passar a ofertar\s+(\d{4})$/i)?.[1];
  const proposalYear = status.match(/^Proposta para passar a ofertar\s+(\d{4})$/i)?.[1];

  if (forecastYear) {
    forecastByYear[forecastYear] ??= [];
    forecastByYear[forecastYear].push(municipality);
  } else if (proposalYear) {
    proposalsByYear[proposalYear] ??= [];
    proposalsByYear[proposalYear].push(municipality);
  } else if (/^Necessita licitação$/i.test(status)) {
    tenderRows.push(municipality);
  }
});

const eightMunicipalityNames = eightMunicipalitiesSheet
  ? readRows(eightMunicipalitiesSheet).slice(2)
    .map((row) => String(row[1] ?? '').trim())
    .filter(Boolean)
  : [];
const tenderNameByKey = new Map(tenderRows.map((name) => [municipalityKey(name), name]));
const needsLicitation = eightMunicipalityNames.length
  ? eightMunicipalityNames.map((name) => tenderNameByKey.get(municipalityKey(name)) ?? name)
  : tenderRows;

if (eightMunicipalityNames.length && needsLicitation.some((name) => !tenderRows.some((tenderName) => municipalityKey(tenderName) === municipalityKey(name)))) {
  console.warn('[Educação Integral] A aba de 8 municípios tem nomes que não aparecem no grupo "Necessita licitação" da aba Universalização.');
}

const universalizationMunicipalities = {
  forecastByYear,
  proposalsByYear,
  needsLicitation,
};

const output = [
  '// Gerado de MAPAS EDUCAÇÃO INTEGRAL.xlsx por scripts/generateEducacaoIntegralData.mjs.',
  '// Execute `npm run generate-educacao-integral` após atualizar a planilha.',
  `export const educationMunicipalitiesByYear = ${JSON.stringify(municipalitiesByYear, null, 2)};`,
  `export const universalizationMunicipalities = ${JSON.stringify(universalizationMunicipalities, null, 2)};`,
  '',
].join('\n');

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`Dados de ${Object.keys(municipalitiesByYear).length} anos e ${needsLicitation.length} municípios na situação "Necessita licitação" gravados em ${path.relative(projectRoot, outputPath)}.`);
