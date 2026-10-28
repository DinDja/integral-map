
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'public', 'conectaMunicipios.json');

const SHAREPOINT_DOWNLOAD_URL =
  'https://prodeboffice365-my.sharepoint.com/personal/valmir_ferreira_secti_ba_gov_br/_layouts/15/download.aspx?UniqueId=7ed06cd9-f10e-4c89-8191-bde4a43b30d9&e=kPaGNt';

const FINANCIAL_PATTERNS = [
  'recurso',
  'inova cidade',
  'investimento estadual',
  'execução financeira',
  'execucao financeira',
  'execução física',
  'execucao fisica',
  'valor implantação',
  'valor implantacao',
  'nota fiscal',
  'nº sei nota fiscal',
  'pagamento efetuado',
  'processo de pagamento',
];

function normalizeHeader(raw) {
  if (raw == null) return '';
  return String(raw).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function headerToKey(header) {
  return normalizeHeader(header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function isFinancial(header) {
  const h = normalizeHeader(header).toLowerCase();
  return FINANCIAL_PATTERNS.some((p) => h.includes(p));
}

function findColIndex(headers, patterns) {
  const normed = headers.map((h) => normalizeHeader(h).toLowerCase());
  for (const pat of patterns) {
    const idx = normed.findIndex((h) => h.includes(pat.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function processWorkbook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw new Error('Planilha vazia.');

  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const filled = (rows[i] || []).filter((c) => c != null && String(c).trim() !== '').length;
    if (filled >= 10) { headerIdx = i; break; }
  }

  const headers = rows[headerIdx].map(normalizeHeader);

  const iMunicipio   = findColIndex(headers, ['município', 'municipio']);
  const iPraca       = findColIndex(headers, ['nome da praça', 'nome_da_praca', 'descrição do local']);
  const iProjeto     = findColIndex(headers, ['projeto']);
  const iTerritorio  = findColIndex(headers, ['território de identidade', 'territorio de identidade', 'território', 'territorio']);
  const iFilterPlaca = findColIndex(headers, ['instalação placa (tld)', 'instalacao placa (tld)', 'placa (tld)']);
  const iLocal       = findColIndex(headers, ['local']);
  const iMun         = iMunicipio !== -1 ? iMunicipio : (iLocal !== -1 ? iLocal : findColIndex(headers, ['mun']));

  console.log('Colunas detectadas:');
  console.log(`  Município: ${iMun !== -1 ? `[${iMun}] "${headers[iMun]}"` : 'NÃO ENCONTRADA'}`);
  console.log(`  Praça:     ${iPraca !== -1 ? `[${iPraca}] "${headers[iPraca]}"` : 'NÃO ENCONTRADA'}`);
  console.log(`  Projeto:   ${iProjeto !== -1 ? `[${iProjeto}] "${headers[iProjeto]}"` : 'NÃO ENCONTRADA'}`);
  console.log(`  Território:${iTerritorio !== -1 ? `[${iTerritorio}] "${headers[iTerritorio]}"` : 'NÃO ENCONTRADA'}`);
  console.log(`  Filtro:    ${iFilterPlaca !== -1 ? `[${iFilterPlaca}] "${headers[iFilterPlaca]}"` : 'NÃO ENCONTRADA'}`);
  const keySet = new Set([iMun, iPraca, iProjeto, iTerritorio, iFilterPlaca].filter((i) => i !== -1));
  const extraCols = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => !keySet.has(i) && h && !isFinancial(h))
    .map(({ h, i }) => ({ key: headerToKey(h), label: h, idx: i }));

  console.log(`  Colunas extras (não-financeiras): ${extraCols.length}`);

  const result = {};
  let total = 0;
  let filtered = 0;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    total++;

    if (iFilterPlaca !== -1) {
      const val = String(row[iFilterPlaca] || '').trim().toLowerCase();
      if (val !== 'sim') { filtered++; continue; }
    }

    const municipio = iMun !== -1 ? String(row[iMun] || '').trim() : '';
    if (!municipio) continue;

    const praca = {
      projeto:               iProjeto    !== -1 ? String(row[iProjeto] || '').trim()    : '',
      nome_da_praca:         iPraca      !== -1 ? String(row[iPraca] || '').trim()      : '',
      territorio_identidade: iTerritorio !== -1 ? String(row[iTerritorio] || '').trim() : '',
    };

    for (const col of extraCols) {
      const val = row[col.idx];
      praca[col.key] = val != null ? String(val).trim() : '';
    }

    if (!result[municipio]) result[municipio] = [];
    result[municipio].push(praca);
  }

  console.log(`\nTotal de linhas: ${total}`);
  console.log(`Filtradas (Placa TLD ≠ Sim): ${filtered}`);
  console.log(`Incluídas: ${total - filtered}`);
  console.log(`Municípios: ${Object.keys(result).length}`);

  return result;
}

async function downloadFile(url) {
  console.log('Baixando planilha do SharePoint...');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const inputFile = process.argv[2];
  let workbook;

  if (inputFile) {
    const absPath = path.resolve(inputFile);
    console.log(`Lendo arquivo: ${absPath}`);
    if (!fs.existsSync(absPath)) throw new Error(`Arquivo não encontrado: ${absPath}`);
    workbook = XLSX.readFile(absPath);
  } else {
    try {
      const buffer = await downloadFile(SHAREPOINT_DOWNLOAD_URL);
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      console.error(`\nNão foi possível baixar a planilha: ${err.message}`);
      console.error('\nUso alternativo:');
      console.error('  node scripts/generateJson.mjs <caminho-para-o-arquivo.xlsx>\n');
      process.exit(1);
    }
  }

  const data = processWorkbook(workbook);
  const sorted = {};
  Object.keys(data).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((k) => {
    sorted[k] = data[k];
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`\n✓ JSON gerado em: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
