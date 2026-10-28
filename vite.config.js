import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import * as XLSX from 'xlsx'
import { MUNICIPIOS_BAHIA } from './utils/Municipios.js'

let devCache = null;
let devCacheExpiry = 0;
const DEV_CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const CACHE_VERSION = 'v3'; 

// ==================== PROCESSADOR DE EXCEL (DEV) ====================
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

function parseSpreadsheet(buffer) {
  const startTime = Date.now();

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
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

  console.log(`[Dev Parser] Colunas encontradas: Indígena=${iKitIndigena}, Quilombo=${iKitQuilombo}`);

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
    // Ignorar linhas de total/rodapé onde o campo munícipio é numérico
    if (/^\d+([.,]\d+)?$/.test(municipioInput)) continue;

    const nomeKey = normalizeMunicipioKey(municipioInput);
    const municipioNome = municipiosMap.get(nomeKey) || municipioInput;

    // Pegar os valores das colunas
    const valLinkTLD = iFilterLinkTLD !== -1 ? String(row[iFilterLinkTLD] || '').trim() : '';
    const rawHomologacao = iFilterHomologacao !== -1 ? String(row[iFilterHomologacao] || '').trim() : '';
    // Converter serial numérico do Excel para DD/MM/AAAA (coluna agora contém data ou vazio)
    const valHomologacao = rawHomologacao ? convertExcelDate(rawHomologacao) : '';

    const praca = {
      projeto: iProjeto !== -1 ? String(row[iProjeto] || '').trim() : '',
      nome_da_praca: iPraca !== -1 ? String(row[iPraca] || '').trim() : '',
      territorio_identidade: iTerritorio !== -1 ? String(row[iTerritorio] || '').trim() : '',
      status_instalacao: iStatusInstalacao !== -1 ? String(row[iStatusInstalacao] || '').trim() : '',
      kit_aldeias_indigenas: iKitIndigena !== -1 ? String(row[iKitIndigena] || '').trim() : '',
      kit_quilombo: iKitQuilombo !== -1 ? String(row[iKitQuilombo] || '').trim() : '',
      // Adicionar explicitamente ao objeto:
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
  console.log(`[Dev Parser] ✓ Parseado em ${parseTime}ms: ${Object.keys(result).length} municípios`);

  return result;
}
// ==================== FIM DO PROCESSADOR ====================

// Plugin para criar proxy do SharePoint em DEV
// NOTA: Em produção, usa Cloudflare Pages Function que processa server-side
const sharepointProxyPlugin = () => ({
  name: 'sharepoint-proxy',
  configureServer(server) {
    server.middlewares.use('/api/sharepoint', async (req, res) => {
      console.log('[Dev Proxy] ⚡ Requisição recebida em /api/sharepoint');
      const startTime = Date.now();
      const nocache = req.url.includes('nocache=true');

      // OTIMIZAÇÃO: Cache em memória (retorna instantâneamente) - bypassar se ?nocache=true
      if (!nocache && devCache && Date.now() < devCacheExpiry) {
        const age = Math.round((Date.now() - (devCacheExpiry - DEV_CACHE_TTL)) / 1000);
        console.log(`[Dev Proxy] ✓ Cache HIT (idade: ${age}s) - respondendo instantaneamente`);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('X-Content-Source', 'dev-cache');
        res.setHeader('X-Cache-Age', age.toString());
        res.end(devCache);

        const responseTime = Date.now() - startTime;
        console.log(`[Dev Proxy] Resposta enviada em ${responseTime}ms ⚡`);
        return;
      }

      const downloadUrl = 'https://prodeboffice365-my.sharepoint.com/:x:/g/personal/valmir_ferreira_secti_ba_gov_br/IQDZbNB-DvGJTIGRveSkOzDZATYdKyDyClL0S6SsWABR4bw?download=1';

      if (nocache) {
        console.log('[Dev Proxy] 🚫 BYPASS DE CACHE SOLICITADO (nocache=true)');
      }

      console.log(`[Dev Proxy] Cache MISS - baixando Excel...`);

      // Verificar se cliente desconectou (mas continuar processando para popular cache)
      let clientDisconnected = false;
      res.on('close', () => {
        if (!devCache) {
          console.log('[Dev Proxy] ⚠️ Cliente desconectou MAS continuando processamento para popular cache...');
        } else {
          console.log('[Dev Proxy] Cliente desconectou (cache já existe)');
        }
        clientDisconnected = true;
      });

      https.get(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
        }
      }, (response) => {
        const contentType = response.headers['content-type'] || '';
        console.log(`[Dev Proxy] Status: ${response.statusCode}, Content-Type: ${contentType}`);

        // Seguir redirecionamentos
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          let redirectUrl = response.headers.location;

          // Se for caminho relativo, construir URL completa
          if (redirectUrl && redirectUrl.startsWith('/')) {
            redirectUrl = `https://prodeboffice365-my.sharepoint.com${redirectUrl}`;
          }

          console.log(`[Dev Proxy] Redirecionando para: ${redirectUrl?.substring(0, 80)}...`);

          // Preservar cookies do redirecionamento
          const cookies = response.headers['set-cookie'];
          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
          };

          if (cookies) {
            headers['Cookie'] = cookies.map(c => c.split(';')[0]).join('; ');
          }

          https.get(redirectUrl, { headers }, (redirectResponse) => {
            handleResponse(redirectResponse, res, startTime);
          }).on('error', (err) => {
            console.error('[Dev Proxy] Erro no redirecionamento:', err.message);
            sendError(res, 500, err.message);
          });
          return;
        }

        handleResponse(response, res, startTime);
      }).on('error', (err) => {
        console.error('[Dev Proxy] Erro:', err.message);
        sendError(res, 500, err.message);
      });
    });
  }
});

function handleResponse(response, res, startTime) {
  const contentType = response.headers['content-type'] || '';

  // Verificar se é Excel
  if (contentType.includes('spreadsheet') ||
    contentType.includes('excel') ||
    contentType.includes('application/vnd.openxmlformats') ||
    contentType.includes('application/octet-stream')) {

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const downloadTime = Date.now() - startTime;
      console.log(`[Dev Proxy] ✓ Excel baixado em ${downloadTime}ms: ${buffer.length} bytes`);

      try {
        // PROCESSAR Excel e converter para JSON (igual Netlify Function)
        console.log(`[Dev Proxy] 📊 Processando Excel...`);
        const parseStart = Date.now();
        const jsonData = parseSpreadsheet(buffer);
        const parseTime = Date.now() - parseStart;

        const jsonString = JSON.stringify(jsonData);
        console.log(`[Dev Proxy] ✓ Parseado em ${parseTime}ms: ${Object.keys(jsonData).length} municípios`);

        // Salvar JSON no cache para próximas requisições
        devCache = jsonString;
        devCacheExpiry = Date.now() + DEV_CACHE_TTL;
        console.log(`[Dev Proxy] ✓ Cache (JSON) salvo (válido por ${DEV_CACHE_TTL / 60000} minutos)`);

        const totalTime = Date.now() - startTime;
        console.log(`[Dev Proxy] ✅ TOTAL: ${totalTime}ms (download: ${downloadTime}ms + parse: ${parseTime}ms)`);

        // Retornar JSON processado (sem cache HTTP em dev)
        if (!res.writableEnded) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('X-Content-Source', 'dev-processed');
          res.setHeader('X-Download-Time', downloadTime.toString());
          res.setHeader('X-Parse-Time', parseTime.toString());
          res.end(jsonString);
        } else {
          console.log('[Dev Proxy] ✓ Cache populado mesmo com cliente desconectado');
        }
      } catch (parseError) {
        console.error('[Dev Proxy] Erro ao processar Excel:', parseError);
        sendError(res, 500, 'Erro ao processar planilha: ' + parseError.message);
      }
    });
    response.on('error', (err) => {
      console.error('[Dev Proxy] Erro ao ler response:', err.message);
      sendError(res, 500, 'Erro ao ler dados do SharePoint: ' + err.message);
    });
  } else {
    // HTML ou outro tipo - erro de autenticação
    console.error(`[Dev Proxy] Tipo inválido: ${contentType}`);
    sendError(res, 401, 'SharePoint retornou página HTML. Autenticação necessária ou link inválido.');
  }
}

function sendError(res, statusCode, message) {
  // Verificar se headers já foram enviados
  if (res.headersSent) {
    console.error('[Dev Proxy] Headers já foram enviados, ignorando erro:', message);
    return;
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: 'Erro ao acessar SharePoint',
    message,
  }));
}

export default defineConfig({
  plugins: [react(), sharepointProxyPlugin()],

  // Otimizações de build
  build: {
    target: 'es2015',
    minify: 'esbuild', // esbuild é mais rápido que terser e já vem com Vite
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar dependências grandes em chunks próprios
          'vendor-react': ['react', 'react-dom'],
          'vendor-xlsx': ['xlsx'],
          'vendor-topojson': ['topojson-client'],
          'vendor-storage': ['idb-keyval'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    sourcemap: false, // Desabilitar sourcemaps em produção para reduzir tamanho
  },

  // Otimizações de servidor de desenvolvimento
  server: {
    hmr: {
      overlay: true,
    },
  },

  // Pré-bundling otimizado
  optimizeDeps: {
    include: ['react', 'react-dom', 'xlsx', 'topojson-client', 'idb-keyval'],
    exclude: [],
  },
})

