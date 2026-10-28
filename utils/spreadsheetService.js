import * as XLSX from 'xlsx';
import { get, set, del } from 'idb-keyval'; // Importando o gerenciador de IndexedDB
import { MUNICIPIOS_BAHIA } from './Municipios.js';

const CACHE_KEY = 'conecta_spreadsheet_data_v8'; // v8: normalizar aliases de municípios no payload
const CACHE_TIMESTAMP_KEY = 'conecta_spreadsheet_timestamp_v8';
const CACHE_DURATION = 1000 * 60 * 60; // 1 hora em milissegundos

const SHAREPOINT_PROXY_URL = import.meta.env.DEV
  ? '/api/sharepoint'
  : 'https://conectabahia.pages.dev/api/sharepoint';

// Evita chamadas duplicadas simultaneas para o mesmo filtro.
const inFlightSharePointRequests = new Map();
let staticFallbackCache = null;
let inFlightStaticFallback = null;

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

const MUNICIPIO_KEY_ALIASES = {
  maragojipe: 'maragogipe',
  muquem_do_sao_francisco: 'muquem_de_sao_francisco',
};

// OTIMIZAÇÃO: Pré-processamento dos municípios (Mapa O(1))
const MUNICIPIOS_MAP = new Map();
MUNICIPIOS_BAHIA.forEach(m => {
  MUNICIPIOS_MAP.set(normalizeMunicipioKey(m), m);
});

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

  // OTIMIZAÇÃO: Busca direta no mapa em vez de loop
  return MUNICIPIOS_MAP.get(nomeKey) || nomeInput;
}

/**
 * @param {number|string} excelDate - número serial do Excel ou string
 * @returns {string} data formatada DD/MM/YYYY ou valor original se não for número
 */
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

function isInstalledStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'instalado';
}

/**
 * @param {ArrayBuffer} buffer - conteúdo do arquivo Excel
 * @returns {Object} dados agrupados por município (SEM FILTRO - retorna todos)
 */
export function parseSpreadsheet(buffer) {
  // OTIMIZAÇÃO: Lendo apenas os dados necessários, ignorando formatações pesadas
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellText: false
  });

  let sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
  const acompanhaSheet = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('acompanham') || name.toLowerCase().includes('acompanhamento')
  );

  if (acompanhaSheet) {
    sheetName = acompanhaSheet;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw new Error('Planilha vazia ou sem dados suficientes.');

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
  const iKitIndigena = findColIndex(headers, ['kit aldeias indígenas', 'kit aldeias indigenas', 'kit indigenas']);
  const iKitQuilombo = findColIndex(headers, ['kit quilombo', 'quilombo']);
  const iLocal = findColIndex(headers, ['local']);

  const iMun = iMunicipio !== -1 ? iMunicipio : (iLocal !== -1 ? iLocal : findColIndex(headers, ['mun']));

  if (iMun === -1) {
    console.warn('[Conecta] ❌ Não foi possível identificar a coluna de município.');
  }

  // DEBUG: Log das colunas encontradas
  console.log('[Conecta] 🔍 COLUNAS IDENTIFICADAS:');
  console.log(`  - Município: índice ${iMun}`);
  console.log(`  - Praça: índice ${iPraca}`);
  console.log(`  - Projeto: índice ${iProjeto}`);
  console.log(`  - Território: índice ${iTerritorio}`);
  console.log(`  - Status Instalação: índice ${iStatusInstalacao}`);
  console.log(`  - Filtro (Link TLD): índice ${iFilterLinkTLD}`);
  console.log(`  - Filtro (Homologação PRODEB): índice ${iFilterHomologacao}`);
  console.log(`  - Kit Aldeias Indígenas: índice ${iKitIndigena}`);
  console.log(`  - Kit Quilombo: índice ${iKitQuilombo}`);

  if (iFilterLinkTLD === -1) {
    console.warn('[Conecta] ⚠️ COLUNA "Link TLD" NÃO ENCONTRADA!');
  }
  if (iFilterHomologacao === -1) {
    console.warn('[Conecta] ⚠️ COLUNA "Homologação PRODEB" NÃO ENCONTRADA!');
  }

  const keyIndices = new Set([iMun, iPraca, iProjeto, iTerritorio, iStatusInstalacao, iFilterLinkTLD, iFilterHomologacao, iKitIndigena, iKitQuilombo].filter((i) => i !== -1));
  const extraCols = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => !keyIndices.has(i) && h && !isFinancial(h))
    .map(({ h, i }) => ({ key: headerToKey(h), label: h, idx: i }));

  const result = {};
  const filterValues = {};
  const processedRows = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const municipioInput = iMun !== -1 ? String(row[iMun] || '').trim() : '';
    if (!municipioInput) continue;
    // Ignorar linhas de total/rodapé onde o campo munícipio é numérico
    if (/^\d+([.,]\d+)?$/.test(municipioInput)) continue;

    const municipioNome = normalizeMunicipioNome(municipioInput);
    const municipioKey = normalizeMunicipioKey(municipioNome);

    if (processedRows.length < 20) {
      processedRows.push({
        linha: r,
        municipio: municipioNome,
        municipioOriginal: municipioInput,
        projeto: iProjeto !== -1 ? String(row[iProjeto] || '').trim() : '',
        praca: iPraca !== -1 ? String(row[iPraca] || '').trim() : '',
      });
    }

    // Converter data de homologação (pode ser serial numérico do Excel ou string)
    let homologacaoVal = '';
    if (iFilterHomologacao !== -1) {
      const raw = row[iFilterHomologacao];
      const rawStr = String(raw ?? '').trim();
      if (rawStr) {
        homologacaoVal = convertExcelDate(rawStr);
      }
    }

    const praca = {
      projeto: iProjeto !== -1 ? String(row[iProjeto] || '').trim() : '',
      nome_da_praca: iPraca !== -1 ? String(row[iPraca] || '').trim() : '',
      territorio_identidade: iTerritorio !== -1 ? String(row[iTerritorio] || '').trim() : '',
      status_instalacao: iStatusInstalacao !== -1 ? String(row[iStatusInstalacao] || '').trim() : '',
      kit_aldeias_indigenas: iKitIndigena !== -1 ? String(row[iKitIndigena] || '').trim() : '',
      kit_quilombo: iKitQuilombo !== -1 ? String(row[iKitQuilombo] || '').trim() : '',
      homologacao_prodeb: homologacaoVal,
    };

    for (const col of extraCols) {
      const val = row[col.idx];
      let processedVal = val != null ? String(val).trim() : '';

      if ((col.label.toLowerCase().includes('data') || col.label.toLowerCase().includes('date')) && processedVal) {
        processedVal = convertExcelDate(processedVal);
      }

      praca[col.key] = processedVal;
    }

    if (!result[municipioNome]) result[municipioNome] = [];
    result[municipioNome].push(praca);
  }

  processedRows.forEach((item, idx) => {
    const infoNormalizacao = item.municipioOriginal !== item.municipio
      ? ` (normalizado: "${item.municipioOriginal}")`
      : '';
  });

  return result;
}

/**
 * @param {Function} onUpdate - Callback opcional chamado quando dados são atualizados em background
 * @returns {{ data: Object, source: 'upload'|'sharepoint'|'cache', fresh: boolean }}
 */
export async function fetchConectaData(onUpdate = null, filterMode = 'instalado') {
  let cachedData = null;
  let cacheAge = Infinity;

  try {
    // Limpar cache antigo (v1 e v2) se existir
    try {
      await del('conecta_spreadsheet_data');
      await del('conecta_spreadsheet_timestamp');
      await del('conecta_spreadsheet_data_v2');
      await del('conecta_spreadsheet_timestamp_v2');
    } catch (e) {
      // Ignorar erros ao limpar cache antigo
    }

    // OTIMIZAÇÃO: Lendo do IndexedDB (suporta arquivos enormes sem estourar limite)
    const cached = await get(CACHE_KEY);
    const timestamp = await get(CACHE_TIMESTAMP_KEY);

    if (cached && timestamp) {
      cachedData = cached; // O IndexedDB já retorna o objeto, não precisa fazer JSON.parse
      cacheAge = Date.now() - parseInt(timestamp, 10);
      const count = Object.keys(cachedData).length;

      if (cacheAge < CACHE_DURATION && count > 0) {
        return { data: cachedData, source: 'cache', fresh: true };
      }

      if (count > 0) {
        fetchFreshData(onUpdate, filterMode);
        return { data: cachedData, source: 'cache', fresh: false };
      }
    }
  } catch (e) {
    console.warn('[Conecta] Erro ao ler cache do IndexedDB:', e.message);
  }

  try {
    const data = await getSharedSharePointData(filterMode, 'foreground');
    if (data) {
      await saveToCache(data);
      return { data, source: 'sharepoint', fresh: true };
    }
  } catch (err) {
    console.error(`[Conecta] Erro ao carregar do SharePoint: ${err.message}`);
    const fallbackData = await fetchStaticFallbackData();
    if (fallbackData) {
      return { data: fallbackData, source: 'static', fresh: true };
    }
    throw new Error('Não foi possível carregar dados do SharePoint');
  }

  const fallbackData = await fetchStaticFallbackData();
  if (fallbackData) {
    return { data: fallbackData, source: 'static', fresh: true };
  }

  throw new Error('Não foi possível carregar dados do Conecta Bahia');
}

async function fetchStaticFallbackData() {
  if (staticFallbackCache) {
    return staticFallbackCache;
  }

  if (inFlightStaticFallback) {
    console.log('[Conecta] Reutilizando fallback local em andamento');
    return inFlightStaticFallback;
  }

  inFlightStaticFallback = (async () => {
    console.log('[Conecta] Tentando fallback local: /conectaMunicipios.json');
    const res = await fetch('/conectaMunicipios.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== 'object') return null;
    staticFallbackCache = json;
    return json;
  })()
    .catch((err) => {
      console.warn('[Conecta] Fallback local indisponível:', err.message);
      return null;
    })
    .finally(() => {
      inFlightStaticFallback = null;
    });

  try {
    return await inFlightStaticFallback;
  } finally {
    inFlightStaticFallback = null;
  }
}

/**
 * @param {Function} onUpdate - Callback chamado quando atualização completa
 * @param {string} filterMode - Modo de filtro
 */
async function fetchFreshData(onUpdate, filterMode = 'ambos') {
  try {
    const data = await getSharedSharePointData(filterMode, 'background');
    if (data) {
      await saveToCache(data);
      if (onUpdate && typeof onUpdate === 'function') {
        onUpdate(data);
      }
    }
  } catch (err) {
    console.warn('[Conecta] [Background] Falha na atualização:', err.message);
  }
}

async function getSharedSharePointData(filterMode = 'ambos', context = 'foreground') {
  const requestKey = String(filterMode || 'ambos');

  if (inFlightSharePointRequests.has(requestKey)) {
    console.log(`[Conecta] Reutilizando requisicao em andamento (${context}) para filterMode=${requestKey}`);
    return inFlightSharePointRequests.get(requestKey);
  }

  const requestPromise = fetchFromSharePoint(filterMode)
    .finally(() => {
      inFlightSharePointRequests.delete(requestKey);
    });

  inFlightSharePointRequests.set(requestKey, requestPromise);
  return requestPromise;
}

/**
 * @param {string} filterMode - 'homologacao' | 'ambos'
 * @returns {Promise<Object>}
 */
async function fetchFromSharePoint(filterMode = 'ambos') {
  const startTime = Date.now();
  console.log('[Conecta] 🚀 Iniciando busca de dados...');

  try {
    const fetchStart = Date.now();
    const nocacheParam = new URLSearchParams(location.search).get('nocache') ? '&nocache=true' : '';
    const filterModeParam = typeof window !== 'undefined' && window.filterMode ? `?filterMode=${window.filterMode}` : `?filterMode=${encodeURIComponent(filterMode)}`;
    const res = await fetch(SHAREPOINT_PROXY_URL + filterModeParam + nocacheParam);
    const fetchTime = Date.now() - fetchStart;

    console.log(`[Conecta] ✓ Fetch completado em ${fetchTime}ms (status: ${res.status})`);

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      const contentSource = res.headers.get('x-content-source') || 'unknown';
      const cacheAge = res.headers.get('x-cache-age');
      const parseTime = res.headers.get('x-parse-time');

      console.log(`[Conecta] Content-Type: ${contentType}, Source: ${contentSource}`);
      if (cacheAge) console.log(`[Conecta] Cache age: ${cacheAge}s`);
      if (parseTime) console.log(`[Conecta] Server parse time (geracao): ${parseTime}ms`);

      if (contentType.includes('application/json')) {
        const jsonStart = Date.now();
        const data = await res.json();
        const jsonTime = Date.now() - jsonStart;

        console.log(`[Conecta] ✓ JSON parseado em ${jsonTime}ms`);

        if (data.error) {
          console.error('[Conecta] Erro do servidor:', data.error);
          throw new Error(data.error);
        }

        const totalTime = Date.now() - startTime;
        console.log(`[Conecta] ✅ TOTAL: ${totalTime}ms (fetch: ${fetchTime}ms + json: ${jsonTime}ms) - ${Object.keys(data).length} municípios`);

        // Em respostas de cache/CDN, X-Parse-Time representa a geracao original,
        // nao o tempo desta requisicao atual.
        if (parseTime && totalTime < 1000) {
          console.log('[Conecta] ℹ️ Resposta veio de cache/CDN; parse-time e historico da geracao no servidor.');
        }

        return data;
      }

      if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('octet-stream')) {
        console.log('[Conecta] ⚠️ Recebeu Excel bruto - processando no cliente (LENTO)...');
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
          console.error('[Conecta] Arquivo não é XLSX válido');
          throw new Error('Arquivo não é Excel válido');
        }

        const parseStart = Date.now();
        const data = parseSpreadsheet(buffer);
        const parseTime = Date.now() - parseStart;

        const totalTime = Date.now() - startTime;
        console.log(`[Conecta] ✅ TOTAL: ${totalTime}ms (fetch: ${fetchTime}ms + parse: ${parseTime}ms)`);

        return data;
      }

      if (contentType.includes('text/html')) {
        const html = await res.text();
        console.error('[Conecta] SharePoint retornou HTML:', html.substring(0, 500));
        throw new Error('SharePoint retornou HTML em vez de arquivo Excel');
      }

      console.warn(`[Conecta] Content-Type desconhecido: ${contentType}`);
    } else {
      console.warn(`[Conecta] Falha ao baixar do SharePoint (HTTP ${res.status})`);
    }

    return null;
  } catch (err) {
    const totalTime = Date.now() - startTime;
    console.error(`[Conecta] ❌ Erro após ${totalTime}ms: ${err.message}`);
    return null;
  }
}

// OTIMIZAÇÃO: Salvando no IndexedDB de forma assíncrona
async function saveToCache(data) {
  try {
    await set(CACHE_KEY, data);
    await set(CACHE_TIMESTAMP_KEY, Date.now());
  } catch (e) {
    console.warn('[Conecta] Erro ao salvar cache no IndexedDB:', e.message);
  }
}

export async function parseUploadedFile(file) {
  const buf = await file.arrayBuffer();
  const data = parseSpreadsheet(buf);
  await saveToCache(data);
  return data;
}

// OTIMIZAÇÃO: Limpando IndexedDB
export async function clearSpreadsheetCache() {
  try {
    await del(CACHE_KEY);
    await del(CACHE_TIMESTAMP_KEY);
  } catch (e) {
    console.warn('[Conecta] Erro ao limpar cache do IndexedDB:', e.message);
  }
}

/**
 * Filtra dados conforme o filterMode selecionado pelo usuário
 * @param {Object} data - Dados de todas as práças por município
 * @param {string} filterMode - 'instalado' | 'homologacao'
 * @returns {Object} Dados filtrados
 */
export function applyFilterMode(data, filterMode = 'instalado') {
  const filtered = {};

  for (const municipio in data) {
    const pracas = data[municipio];
    const pracasFiltradas = pracas.filter(p => {
      const statusInstalacao = p.status_instalacao || '';
      const homologacao = String(p.homologacao_prodeb || p.status_homologacao_pontos || '').trim().toLowerCase();

      if (filterMode === 'homologacao') {
        return homologacao !== '' && homologacao !== 'não' && homologacao !== 'nao' && homologacao !== 'false' && homologacao !== '0';
      }

      if (filterMode === 'instalado') {
        return isInstalledStatus(statusInstalacao);
      }

      return true;
    });

    if (pracasFiltradas.length > 0) {
      filtered[municipio] = pracasFiltradas;
    }
  }

  return filtered;
}

// OTIMIZAÇÃO: Lendo dados analíticos do IndexedDB
export async function getCacheInfo() {
  try {
    const data = await get(CACHE_KEY);
    const timestamp = await get(CACHE_TIMESTAMP_KEY);

    if (data && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      const valid = age < CACHE_DURATION;

      return {
        exists: true,
        count: Object.keys(data).length,
        age: Math.round(age / 1000),
        valid,
        timestamp: new Date(parseInt(timestamp, 10)).toLocaleString('pt-BR')
      };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}
