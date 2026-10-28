# Relatório técnico — Funcionamento do sistema Conecta Bahia

Este documento descreve, de forma concisa, como o projeto carrega, processa e filtra dados da planilha seguida pela aplicação, além dos principais pontos da UI e geração de artefatos (JSON estático / PDF).

**Arquivos principais**
- **Front-end (mapa / UI)**: [ConectaMap.jsx](ConectaMap.jsx) — componente principal que monta o mapa, carrega topologia e aplica filtros visuais.
- **Seção de implantação por território**: [src/components/TerritorioImplantacaoSection.jsx](src/components/TerritorioImplantacaoSection.jsx) — calcula cobertura por território e monta gráficos/tabelas.
- **Exportar PDF**: [src/components/PDFExportButton.jsx](src/components/PDFExportButton.jsx) — botão que dispara `utils/pdfReportService.js` para gerar relatórios.
- **Serviço de planilha / parsing / cache**: [utils/spreadsheetService.js](utils/spreadsheetService.js) — lógica de download, parsing, normalização, cache e filtros (muito importante).
- **Lista de municípios**: [utils/Municipios.js](utils/Municipios.js) — base de nomes usada para normalização.
- **Territórios**: [utils/territorioMunicipios.json](utils/territorioMunicipios.json) — definição dos territórios de identidade e seus municípios.
- **JSON estático (fallback)**: [public/conectaMunicipios.json](public/conectaMunicipios.json) — produto gerado por `scripts/generateJson.mjs` e usado como fallback.
- **Script de geração**: [scripts/generateJson.mjs](scripts/generateJson.mjs) — baixa/processa a planilha e escreve `public/conectaMunicipios.json`.

**Visão geral do fluxo de dados**
1. A UI tenta carregar dados com `fetchConectaData()` (em `utils/spreadsheetService.js`).
2. `fetchConectaData` verifica cache (IndexedDB via `idb-keyval`, chave `conecta_spreadsheet_data_v8`).
   - Se o cache for válido (idade < 1 hora) retorna os dados imediatamente.
   - Se existir cache mas estiver velho, retorna-o e dispara `fetchFreshData` em background.
3. Se não houver cache ou estiver ausente, a função chama `fetchFromSharePoint()` através do proxy `SHAREPOINT_PROXY_URL` (`/api/sharepoint` em dev, `/.netlify/functions/sharepoint` em produção).
4. `fetchFromSharePoint` trata três cenários principais de resposta:
   - `application/json`: servidor já retornou o JSON pronto → uso direto.
   - arquivo Excel (`spreadsheet`/`excel`/`octet-stream`): o cliente chama `parseSpreadsheet(buffer)` para converter XLSX → objeto agrupado por município.
   - resposta inválida/HTML/erro → fallback para `public/conectaMunicipios.json` (lido por `fetchStaticFallbackData`).
5. Depois de carregar os dados (via cache, SharePoint ou fallback), a UI aplica `applyFilterMode(data, filterMode)` para gerar a lista usada pelo mapa e painéis.

**Como a planilha é parseada e normalizada**
- O parsing central é `parseSpreadsheet(buffer)` (usa `xlsx`). Etapas:
  1. Leitura do workbook com opções leves (sem estilos/formulas pesadas).
  2. Escolha da folha: usa `SheetNames[1]` ou `SheetNames[0]`, mas prefere folhas cujo nome contenha `acompanham`/`acompanhamento` quando existentes.
  3. Converte a folha em linhas via `XLSX.utils.sheet_to_json(..., { header: 1, defval: '' })`.
  4. Detecta a linha de cabeçalho com `findHeaderRow(rows)` — heurística que inspeciona até 25 linhas e pontua linhas que contenham colunas-chave (município, projeto, território, local, status, etc.).
  5. Identifica índices de colunas com `findColIndex(headers, patterns)` (ex.: `município`, `nome da praça`, `projeto`, `território de identidade`, `status instalação`, `homologação prodeb`, `instalação link (tld)` etc.).
  6. Monta campos extras (`extraCols`) ignorando colunas financeiras (lista em `FINANCIAL_PATTERNS`).
  7. Para cada linha subsequente: normaliza o nome do município com `normalizeMunicipioNome()` (usa `utils/Municipios.js` e `MUNICIPIO_KEY_ALIASES`), ignora linhas de total/rodapé (campo município numérico) e cria um objeto `praca` com campos como `projeto`, `nome_da_praca`, `territorio_identidade`, `status_instalacao`, `kit_aldeias_indigenas`, `kit_quilombo`, `homologacao_prodeb` (convertida por `convertExcelDate` quando necessário) e as `extraCols` detectadas.
  8. Resultado final: objeto agrupado por município → `{ "Município A": [praca1, praca2, ...], ... }`.

**Normalização e aliases**
- `normalizeHeader`, `normalizeForMatch`, `headerToKey` — removem quebras/acentos e transformam para lowercase/underscore para comparação e geração de chaves.
- `normalizeMunicipioKey` + `MUNICIPIOS_MAP` (Map O(1) criado a partir de `MUNICIPIOS_BAHIA`) garantem correspondência robusta entre grafias variadas.
- Há um pequeno conjunto de aliases (`MUNICIPIO_KEY_ALIASES` e `MUNICIPIO_ALIASES`) para casos conhecidos (por exemplo `maragojipe → maragogipe`).

**Regras de filtragem (função `applyFilterMode`)**
- `filterMode === 'instalado'`: mantém apenas `praca` cuja coluna `status_instalacao` normalizada é exatamente `instalado` (ver (`isInstalledStatus`)).
- `filterMode === 'homologacao'`: mantém apenas `praca` com campo de homologação preenchido e não equivalente a valores falsos (`'', 'não', 'nao', 'false', '0'`).
- valores distintos de `instalado`/`homologacao` → modo permissivo (retorna tudo).

Observação prática: a UI (em `ConectaMap.jsx`) usa `applyFilterMode` ao carregar dados e também quando o usuário muda `filterMode` (há um useEffect que atualiza `conectaList` quando `filterMode` muda).

**Cache e fallback**
- Cache local: `idb-keyval` com chaves `conecta_spreadsheet_data_v8` e `conecta_spreadsheet_timestamp_v8` (duração padrão: 1 hora).
- Se o servidor estiver indisponível, a aplicação tenta `public/conectaMunicipios.json` como fallback estático.

**Geração do JSON estático**
- `scripts/generateJson.mjs` é um utilitário Node que baixa a planilha do SharePoint (URL configurada no script) e gera `public/conectaMunicipios.json`.
- O script também detecta cabeçalho e faz filtragem (ex.: coluna `instalação placa (tld)` exigida como `sim` para incluir linhas, conforme heurística do script).

**Como a UI usa os dados (mapa e painéis)**
- `ConectaMap.jsx`:
  - carrega topojson (`public/BA_(1)9396399957704198.json`) e converte para geometria SVG através de `buildPaths` / `geometryToD`.
  - monta `conectaList`, `conectaSet` e `conectaData` a partir dos dados filtrados.
  - calcula `installedMunicipioSet` (municípios que possuem pelo menos um `praca` com `status_instalacao === 'instalado'`).
  - aplica filtros da UI: busca por texto (`searchTerm`), `filterIndigena`, `filterQuilombo`, `filterWithoutInstalled`, `filterTerritory`. A função que centraliza é `passesAllFilters(nomeMunicipio)`.
  - em hover/seleção mostra painel com lista de `pracas` do município, indicando kits, homologação, datas e outros campos detectados.

**Seção de cobertura por território**
- `TerritorioImplantacaoSection.jsx` aplica `applyFilterMode(data, 'instalado')` e usa `utils/territorioMunicipios.json` para contar quantos municípios de cada território têm pelo menos um ponto instalado.
- Cálculo: para cada território, gera `implantados` (municípios com match por `simplifyName`) e `percentual = round((implantados / total) * 100)`.

**Exportação / Relatório em PDF**
- `PDFExportButton.jsx` carrega imagens (logos), captura o elemento do mapa (`htmlElementToBase64`) se solicitado e chama `generateAndDownloadReport` em `utils/pdfReportService.js`.

**Comandos úteis**
```bash
# Gerar JSON estático (node + planilha local)
node scripts/generateJson.mjs path/para/planilha.xlsx

# Iniciar ambiente de desenvolvimento (projecto Vite)
npm install
npm run dev
```

**Observações e riscos / recomendações**
- Normalização de nomes é heurística: manter `utils/Municipios.js` atualizado reduz falsos negativos.
- Colunas com grafias diferentes (acentos, abreviações) são detectadas por heurísticas; se a planilha mudar muito a estrutura pode ser necessário atualizar os padrões em `findColIndex` e `FINANCIAL_PATTERNS`.
- Preferir gerar o JSON no servidor (script `generateJson.mjs`) e servir `application/json` para evitar parsing pesado no cliente.

---

Se quiser, eu:
- atualizo o relatório com exemplos reais de linhas da planilha;
- gero versão em PDF do relatório;
- adapto o script para aceitar parâmetros (ex.: forçar inclusão de colunas).
