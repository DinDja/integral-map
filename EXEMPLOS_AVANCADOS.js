/**
 * EXEMPLOS AVANÇADOS DE CUSTOMIZAÇÃO
 * Sistema de Geração de Relatórios PDF - Conecta Bahia
 * 
 * Este arquivo contém exemplos de como estender e customizar
 * o sistema de geração de relatórios PDF.
 */

// ============================================================================
// EXEMPLO 1: Relatório com Filtros Específicos
// ============================================================================

import { generatePDFReport } from './utils/pdfReportService';

/**
 * Gera relatório apenas para um território específico
 */
export async function generateTerritoryReport(territory, allMunicipios) {
  // Filtrar apenas municípios do território
  const filteredMunicipios = allMunicipios.filter(
    m => m.territorio === territory
  );

  const pdf = await generatePDFReport({
    title: 'Programa Conecta Bahia',
    subtitle: `Relatório do Território: ${territory}`,
    municipiosData: filteredMunicipios,
    includeStatistics: true,
    includeData: true,
    includeMap: true,
  });

  pdf.save(`ConectaBahia_${territory.replace(/\s/g, '_')}.pdf`);
}

// Uso:
// await generateTerritoryReport('Metropolitana', municipiosData);


// ============================================================================
// EXEMPLO 2: Relatório com Comparação Temporal
// ============================================================================

/**
 * Gera relatório comparando dados atuais com período anterior
 */
export async function generateComparisonReport(
  currentData,
  previousData,
  mapElement,
  logos
) {
  const pdf = require('jspdf').jsPDF;
  const { 
    generatePDFReport,
    addSection,
    addParagraph,
    addTable,
    addFooter 
  } = require('./utils/pdfReportService');

  const options = {
    title: 'Programa Conecta Bahia',
    subtitle: 'Relatório Comparativo de Desempenho',
    municipiosData: currentData,
    mapElement,
    includeStatistics: true,
    includeMap: true,
  };

  const pdfDoc = await generatePDFReport(options);
  
  // Adicionar seção de comparação
  let yPos = 150; // Posição arbitrária
  
  yPos = addSection(pdfDoc, yPos, 'Análise Comparativa', 1);
  yPos = addParagraph(
    pdfDoc,
    yPos,
    'Esta seção apresenta a comparação entre o período atual e o período anterior.'
  );

  // Tabela de comparação
  const tableHeaders = ['Município', 'Atual', 'Anterior', 'Variação'];
  const tableRows = currentData.map(curr => {
    const prev = previousData.find(p => p.nome === curr.nome);
    const prevQty = prev?.quantidade || 0;
    const variation = curr.quantidade - prevQty;
    const varPercent = prevQty > 0 
      ? ((variation / prevQty) * 100).toFixed(1) 
      : '—';
    
    return [
      curr.nome,
      curr.quantidade.toString(),
      prevQty.toString(),
      `${variation > 0 ? '+' : ''}${variation} (${varPercent}%)`
    ];
  });

  yPos = addTable(pdfDoc, yPos, tableHeaders, tableRows);

  addFooter(pdfDoc);
  pdfDoc.save('ConectaBahia_Comparativo.pdf');
}


// ============================================================================
// EXEMPLO 3: Relatório Multi-página com Detalhes de Municípios
// ============================================================================

/**
 * Gera relatório detalhado com uma página por município
 */
export async function generateDetailedMunicipalReport(municipiosDetailed) {
  const jsPDF = require('jspdf').jsPDF;
  const {
    createPDFDocument,
    addSection,
    addParagraph,
    addImage,
    addFooter
  } = require('./utils/pdfReportService');

  const pdf = createPDFDocument();
  
  municipiosDetailed.forEach((municipio, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    let yPos = 30;
    
    // Cabeçalho do município
    yPos = addSection(pdf, yPos, municipio.nome, 1);
    
    // Informações gerais
    yPos = addParagraph(
      pdf,
      yPos,
      `Território: ${municipio.territorio}`
    );
    
    yPos = addParagraph(
      pdf,
      yPos,
      `Total de "Praças Conectadas: ${municipio.quantidade}`
    );
    
    yPos = addParagraph(
      pdf,
      yPos,
      `População Beneficiada: ${municipio.populacao || 'N/A'}`
    );

    // Detalhes de implementação
    if (municipio.detalhes) {
      yPos = addSection(pdf, yPos, 'Detalhes de Implementação', 2);
      yPos = addParagraph(pdf, yPos, municipio.detalhes);
    }

    // Foto/imagem do município (se disponível)
    if (municipio.imagemBase64) {
      yPos = addImage(
        pdf,
        yPos,
        municipio.imagemBase64,
        `Praça conectada em ${municipio.nome}`
      );
    }
  });

  addFooter(pdf);
  pdf.save('ConectaBahia_Detalhado.pdf');
}


// ============================================================================
// EXEMPLO 4: Relatório com Gráficos Customizados
// ============================================================================

/**
 * Cria gráfico simples em texto ASCII para mapa de calor
 */
function createASCIIHeatmap(data) {
  const maxQty = Math.max(...data.map(m => m.quantidade));
  const chars = ['░', '▒', '▓', '█'];

  return data.map(municipio => {
    const ratio = municipio.quantidade / maxQty;
    const charIndex = Math.floor(ratio * (chars.length - 1));
    const char = chars[charIndex];
    const bar = char.repeat(Math.ceil(ratio * 20));
    
    return `${municipio.nome.padEnd(25)} ${bar} ${municipio.quantidade}`;
  }).join('\n');
}

export async function generateReportWithVisualization(
  municipiosData,
  mapElement,
  logos
) {
  const {
    generatePDFReport,
    addSection,
    addParagraph
  } = require('./utils/pdfReportService');

  const pdf = await generatePDFReport({
    title: 'Programa Conecta Bahia',
    subtitle: 'Análise Visual de Cobertura',
    municipiosData,
    mapElement,
    includeMap: true,
  });

  // Adicionar visualização de dados
  let yPos = 150;
  yPos = addSection(pdf, yPos, 'Visualização de Distribuição', 1);
  
  const heatmap = createASCIIHeatmap(municipiosData);
  yPos = addParagraph(pdf, yPos, heatmap);

  pdf.save('ConectaBahia_Visualizado.pdf');
}


// ============================================================================
// EXEMPLO 5: Relatório em Lote (Múltiplos PDFs)
// ============================================================================

/**
 * Gera múltiplos relatórios, um por território
 */
export async function generateBatchReports(allData) {
  // Agrupar por território
  const byTerritory = {};
  
  allData.forEach(municipio => {
    const territory = municipio.territorio;
    if (!byTerritory[territory]) {
      byTerritory[territory] = [];
    }
    byTerritory[territory].push(municipio);
  });

  // Gerar um pdf por território
  const { generateAndDownloadReport } = require('./utils/pdfReportService');
  
  for (const [territory, municipios] of Object.entries(byTerritory)) {
    console.log(`Gerando relatório para ${territory}...`);
    
    await generateAndDownloadReport({
      title: 'Programa Conecta Bahia',
      subtitle: `Relatório do Território: ${territory}`,
      municipiosData: municipios,
      includeMap: false,
      includeStatistics: true,
      includeData: true,
    });

    // Aguardar um pouco entre downloads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}


// ============================================================================
// EXEMPLO 6: Relatório com Estadísticas Calculadas
// ============================================================================

/**
 * Calcula estatísticas avançadas e as inclui no relatório
 */
export async function generateAnalyticsReport(municipiosData, mapElement) {
  // Calcular estatísticas
  const stats = {
    total: municipiosData.length,
    totalPontos: municipiosData.reduce((sum, m) => sum + m.quantidade, 0),
    media: municipiosData.length > 0 
      ? (municipiosData.reduce((sum, m) => sum + m.quantidade, 0) / municipiosData.length).toFixed(2)
      : 0,
    maximo: Math.max(...municipiosData.map(m => m.quantidade)),
    minimo: Math.min(...municipiosData.map(m => m.quantidade)),
    desvio: calculateStandardDeviation(municipiosData.map(m => m.quantidade)),
  };

  // Municípios com maior cobertura
  const topMunicipios = [...municipiosData]
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5);

  // Municípios com menor cobertura
  const bottomMunicipios = [...municipiosData]
    .sort((a, b) => a.quantidade - b.quantidade)
    .slice(0, 5);

  const { generatePDFReport, addSection, addTable, addParagraph } = 
    require('./utils/pdfReportService');

  const pdf = await generatePDFReport({
    title: 'Programa Conecta Bahia',
    subtitle: 'Relatório Analítico Detalhado',
    municipiosData,
    mapElement,
    includeMap: true,
  });

  // Adicionar análises
  let yPos = 150;

  // Estatísticas descritivas
  yPos = addSection(pdf, yPos, 'Análise Estatística', 1);
  
  const statsTable = [
    ['Métrica', 'Valor'],
    ['Total de Municípios', stats.total.toString()],
    ['Total de Pontos', stats.totalPontos.toString()],
    ['Média Aritmética', stats.media.toString()],
    ['Valor Máximo', stats.maximo.toString()],
    ['Valor Mínimo', stats.minimo.toString()],
    ['Desvio Padrão', stats.desvio.toFixed(2)],
  ];

  yPos = addTable(pdf, yPos, statsTable[0], statsTable.slice(1));

  // Top 5
  yPos = addSection(pdf, yPos, 'Municípios com Maior Cobertura', 2);
  const topTable = [
    ['Município', 'Quantidade'],
    ...topMunicipios.map(m => [m.nome, m.quantidade.toString()])
  ];
  yPos = addTable(pdf, yPos, topTable[0], topTable.slice(1));

  // Bottom 5
  yPos = addSection(pdf, yPos, 'Municípios com Menor Cobertura', 2);
  const bottomTable = [
    ['Município', 'Quantidade'],
    ...bottomMunicipios.map(m => [m.nome, m.quantidade.toString()])
  ];
  yPos = addTable(pdf, yPos, bottomTable[0], bottomTable.slice(1));

  pdf.save('ConectaBahia_Analitico.pdf');
}

/**
 * Calcula desvio padrão de um array
 */
function calculateStandardDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}


// ============================================================================
// EXEMPLO 7: Hook React para Usar em Componentes
// ============================================================================

import { useCallback, useState } from 'react';

/**
 * Hook customizado para gerar relatórios
 */
export function useGeneratePDFReport() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateReport = useCallback(async (options) => {
    setIsLoading(true);
    setError(null);

    try {
      const { generateAndDownloadReport } = await import('./utils/pdfReportService');
      await generateAndDownloadReport(options);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { generateReport, isLoading, error };
}

// Uso em componente:
/*
function MyComponent() {
  const { generateReport, isLoading, error } = useGeneratePDFReport();

  const handleExport = async () => {
    await generateReport({
      title: 'Meu Relatório',
      municipiosData: dados,
      includeMap: true,
    });
  };

  return (
    <div>
      <button onClick={handleExport} disabled={isLoading}>
        {isLoading ? 'Gerando...' : 'Gerar PDF'}
      </button>
      {error && <p style={{color: 'red'}}>{error}</p>}
    </div>
  );
}
*/


// ============================================================================
// EXEMPLO 8: Customização de Estilos ABNT
// ============================================================================

/**
 * Cria um documento PDF com configurações ABNT customizadas
 */
export function createCustomizedPDFConfig() {
  return {
    paperSize: 'a4',
    orientation: 'p',
    unit: 'mm',
    margins: {
      top: 30,    // 3cm padrão ABNT
      right: 20,  // 2cm padrão ABNT
      bottom: 20, // 2cm padrão ABNT
      left: 30,   // 3cm padrão ABNT
    },
    fontSize: {
      title: 16,     // 16pt
      subtitle: 14,  // 14pt
      heading2: 13,  // 13pt
      heading3: 12,  // 12pt
      body: 11,      // 11pt
      footer: 9,     // 9pt
    },
    lineHeight: 1.5,  // Conforme ABNT
    colors: {
      primary: [30, 58, 138],      // Azul governamental
      secondary: [71, 85, 119],    // Cinza azul
      accent: [255, 109, 0],       // Laranja destaque
      text: [25, 25, 25],          // Quase preto
      lightText: [80, 80, 80],     // Cinza escuro
      border: [200, 200, 200],     // Cinza claro
    },
  };
}


// ============================================================================
// EXEMPLO 9: Validação de Dados para PDF
// ============================================================================

/**
 * Valida dados antes de gerar PDF
 */
export function validateMunicipiosData(data) {
  const errors = [];

  if (!Array.isArray(data)) {
    errors.push('Dados devem ser um array');
    return errors;
  }

  if (data.length === 0) {
    errors.push('Nenhum município fornecido');
    return errors;
  }

  data.forEach((municipio, index) => {
    if (!municipio.nome || typeof municipio.nome !== 'string') {
      errors.push(`Municipio[${index}]: nome é obrigatório e deve ser string`);
    }
    if (typeof municipio.quantidade !== 'number' || municipio.quantidade < 0) {
      errors.push(`Municipio[${index}]: quantidade deve ser número positivo`);
    }
    if (!municipio.territorio) {
      errors.push(`Municipio[${index}]: territorio é obrigatório`);
    }
  });

  return errors;
}

// Uso:
/*
const errors = validateMunicipiosData(municipios);
if (errors.length > 0) {
  console.error('Erros de validação:', errors);
  return;
}
*/


// ============================================================================
// EXEMPLO 10: Fila de Processamento para Grandes Volumes
// ============================================================================

/**
 * Processa geração de múltiplos PDFs em fila com controle de concorrência
 */
export class PDFExportQueue {
  constructor(maxConcurrent = 2) {
    this.queue = [];
    this.processing = 0;
    this.maxConcurrent = maxConcurrent;
  }

  async add(reportConfig) {
    return new Promise((resolve, reject) => {
      this.queue.push({ config: reportConfig, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const { config, resolve, reject } = this.queue.shift();

    try {
      const { generateAndDownloadReport } = require('./utils/pdfReportService');
      await generateAndDownloadReport(config);
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      this.processing--;
      this.process();
    }
  }
}

// Uso:
/*
const queue = new PDFExportQueue(3); // Máx 3 processamentos simultâneos

for (const territory of territories) {
  queue.add({
    title: 'Relatório Territorial',
    subtitle: territory.name,
    municipiosData: territory.municipios,
  });
}
*/

export default {
  generateTerritoryReport,
  generateComparisonReport,
  generateDetailedMunicipalReport,
  generateReportWithVisualization,
  generateBatchReports,
  generateAnalyticsReport,
  useGeneratePDFReport,
  createCustomizedPDFConfig,
  validateMunicipiosData,
  PDFExportQueue,
};
