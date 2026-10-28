import * as XLSX from 'xlsx';
import { MUNICIPIOS_BAHIA } from './municipios-data.js';

const FINANCIAL_PATTERNS = [
  'recurso', 'inova cidade', 'investimento estadual',
  'execução financeira', 'execucao financeira',
  'execução física', 'execucao fisica',
  'valor implantação', 'valor implantacao',
  'nota fiscal', 'nº sei nota fiscal',
  'pagamento efetuado', 'processo de pagamento',
];

const MUNICIPIO_KEY_ALIASES = {
  muquem_do_sao_francisco: 'muquem_de_sao_francisco',
};

function normalizeHeader(raw) {
  if (raw == null) return '';
  return String(raw).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(raw) {
  return normalizeHeader(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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

function normalizeMunicipioKey(nome) {
  const normalized = normalizeHeader(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim();
  return MUNICIPIO_KEY_ALIASES[normalized] || normalized;
}

function normalizeMunicipioNome(nomeInput) {
  if (!nomeInput || nomeInput.trim() === '') return '';
  const nomeKey = normalizeMunicipioKey(nomeInput);
  for (const municipio of MUNICIPIOS_BAHIA) {
    if (normalizeMunicipioKey(municipio) === nomeKey) {
      return municipio;
    }
  }
  return nomeInput;
}

function convertExcelDate(excelDate) {
  if (typeof excelDate === 'string') {
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(excelDate) || /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(excelDate)) {
      return excelDate;
    }
  }
  const num = parseInt(excelDate, 10);
  if (isNaN(num)) return excelDate;
  const date = new Date((num - 25569) * 86400 * 1000);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function findColIndex(headers, patterns) {
  const normed = headers.map((h) => normalizeForMatch(h));
  for (const pat of patterns) {
    const target = normalizeForMatch(pat);
    const idx = normed.findIndex((h) => h.includes(target));
    if (idx !== -1) return idx;
  }
  return -1;
}

function findHeaderRow(rows) {
  const maxRowsToInspect = Math.min(25, rows.length);
  const headerGroups = [
    ['municipio'],
    ['projeto'],
    ['territorio de identidade', 'territorio'],
    ['local', 'descricao do local'],
    ['status instalacao', 'homologacao prodeb', 'instalacao link (tld)'],
  ];

  let fallbackIdx = 0;
  for (let i = 0; i < maxRowsToInspect; i++) {
    const filled = (rows[i] || []).filter((c) => c != null && String(c).trim() !== '').length;
    if (filled >= 10) {
      fallbackIdx = i;
      break;
    }
  }

  let bestIdx = fallbackIdx;
  let bestScore = -1;

  for (let i = 0; i < maxRowsToInspect; i++) {
    const headers = (rows[i] || []).map(normalizeHeader);
    const filled = headers.filter(Boolean).length;
    if (filled < 5) continue;

    let score = filled >= 10 ? 1 : 0;
    for (const group of headerGroups) {
      if (findColIndex(headers, group) !== -1) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestScore > 0 ? bestIdx : fallbackIdx;
}

export function parseSpreadsheet(buffer) {
  const startTime = Date.now();

  const workbook = XLSX.read(buffer, {
    type: 'array',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellText: false,
    sheetStubs: false,
    bookVBA: false,
    bookDeps: false,
    bookSheets: false,
  });

  let sheetName = workbook.SheetNames[1];
  const acompanhaSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('acompanham') || name.toLowerCase().includes('acompanhamento')
  );
  if (acompanhaSheet) sheetName = acompanhaSheet;

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });

  if (rows.length < 2) throw new Error('Planilha vazia');

  const headerIdx = findHeaderRow(rows);
  const rawHeaders = rows[headerIdx];
  const headers = rawHeaders.map(normalizeHeader);

  const iMunicipio = findColIndex(headers, ['município', 'municipio']);
  const iPraca = findColIndex(headers, ['descrição do local', 'descricao do local', 'nome da praça', 'nome_da_praca']);
  const iProjeto = findColIndex(headers, ['projeto']);
  const iTerritorio = findColIndex(headers, ['território de identidade', 'territorio de identidade', 'território', 'territorio']);
  const iStatusInstalacao = findColIndex(headers, ['status instalação', 'status instalacao']);
  const iFilterLinkTLD = findColIndex(headers, ['instalação link (tld)', 'instalacao link (tld)', 'link (tld)']);
  const iFilterHomologacao = findColIndex(headers, ['homologação prodeb', 'homologacao prodeb']);
  const iLocal = findColIndex(headers, ['local']);
  const iKitIndigena = findColIndex(headers, ['kit aldeias indígenas', 'kit aldeias indigenas', 'aldeias indígenas', 'aldeias indigenas']);
  const iKitQuilombo = findColIndex(headers, ['kit quilombo', 'quilombo']);

  const iMun = iMunicipio !== -1 ? iMunicipio : (iLocal !== -1 ? iLocal : findColIndex(headers, ['mun']));

  const keyIndices = new Set([iMun, iPraca, iProjeto, iTerritorio, iStatusInstalacao, iFilterLinkTLD, iFilterHomologacao, iKitIndigena, iKitQuilombo].filter((i) => i !== -1));

  const extraCols = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => !keyIndices.has(i) && h && !isFinancial(h))
    .slice(0, 15)
    .map(({ h, i }) => ({ key: headerToKey(h), label: h, idx: i }));

  const result = {};
  const municipiosMap = new Map();
  MUNICIPIOS_BAHIA.forEach(m => {
    municipiosMap.set(normalizeMunicipioKey(m), m);
  });

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const municipioInput = iMun !== -1 ? String(row[iMun] || '').trim() : '';
    if (!municipioInput) continue;
    if (/^\d+([.,]\d+)?$/.test(municipioInput)) continue;

    const valLinkTLD = iFilterLinkTLD !== -1 ? String(row[iFilterLinkTLD] || '').trim() : '';
    const rawHomologacao = iFilterHomologacao !== -1 ? String(row[iFilterHomologacao] || '').trim() : '';
    const valHomologacao = rawHomologacao ? convertExcelDate(rawHomologacao) : '';

    const nomeKey = normalizeMunicipioKey(municipioInput);
    const municipioNome = municipiosMap.get(nomeKey) || municipioInput;

    const praca = {
      projeto: iProjeto !== -1 ? String(row[iProjeto] || '').trim() : '',
      nome_da_praca: iPraca !== -1 ? String(row[iPraca] || '').trim() : '',
      territorio_identidade: iTerritorio !== -1 ? String(row[iTerritorio] || '').trim() : '',
      status_instalacao: iStatusInstalacao !== -1 ? String(row[iStatusInstalacao] || '').trim() : '',
      kit_aldeias_indigenas: iKitIndigena !== -1 ? String(row[iKitIndigena] || '').trim() : '',
      kit_quilombo: iKitQuilombo !== -1 ? String(row[iKitQuilombo] || '').trim() : '',
      instalacao_link_tld: valLinkTLD,
      homologacao_prodeb: valHomologacao,
    };

    for (const col of extraCols) {
      const val = row[col.idx];
      if (val == null || val === '') continue;

      let processedVal = String(val).trim();
      if ((col.label.toLowerCase().includes('data') || col.label.toLowerCase().includes('date')) && processedVal) {
        processedVal = convertExcelDate(processedVal);
      }
      praca[col.key] = processedVal;
    }

    if (!result[municipioNome]) result[municipioNome] = [];
    result[municipioNome].push(praca);
  }

  const parseTime = Date.now() - startTime;
  const totalPracas = Object.values(result).flat().length;
  console.log(`[Parser] Parseado em ${parseTime}ms: ${Object.keys(result).length} municípios, ${totalPracas} praças`);

  return result;
}
