import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Configurações ABNT para PDF
 * Normas: ABNT NBR 6023:2018 (Referências bibliográficas)
 *         ABNT NBR 14724:2011 (Trabalhos acadêmicos)
 */
const ABNT_CONFIG = {
  paperSize: 'a4',
  orientation: 'p', // portrait
  unit: 'mm',
  margins: {
    top: 30,    // 3cm
    right: 20,  // 2cm
    bottom: 20, // 2cm
    left: 30,   // 3cm
  },
  fontSize: {
    title: 16,
    subtitle: 14,
    heading2: 13,
    heading3: 12,
    body: 11,
    footer: 9,
  },
  lineHeight: 1.5,
  colors: {
    primary: [30, 58, 138], // azul escuro
    secondary: [71, 85, 119], // cinza azulado
    accent: [255, 109, 0], // laranja
    text: [25, 25, 25], // preto
    lightText: [80, 80, 80], // cinza escuro
    border: [200, 200, 200], // cinza claro
  },
};

/**
 * Cria um novo documento PDF com padrão ABNT
 * @returns {jsPDF} Documento PDF
 */
function createPDFDocument() {
  const pdf = new jsPDF({
    orientation: ABNT_CONFIG.orientation,
    unit: ABNT_CONFIG.unit,
    format: ABNT_CONFIG.paperSize,
  });

  // Configurar fonte padrão
  pdf.setFont('Helvetica', 'normal');
  pdf.setFontSize(ABNT_CONFIG.fontSize.body);
  pdf.setTextColor(...ABNT_CONFIG.colors.text);

  return pdf;
}

/**
 * Adiciona cabeçalho institucional ao PDF
 * @param {jsPDF} pdf - Documento PDF
 * @param {string} sectiLogoBase64 - Logo SECTI em base64
 */
async function addInstitutionalHeader(pdf, sectiLogoBase64) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { top, left, right } = ABNT_CONFIG.margins;

  let yPos = 15;

  // Adicionar logo SECTI à esquerda
  if (sectiLogoBase64) {
    try {
      pdf.addImage(sectiLogoBase64, 'PNG', left, yPos - 5, 25, 25);
    } catch (e) {
      console.warn('Erro ao adicionar logo SECTI:', e);
    }
  }

  // Texto institucional centralizado
  pdf.setFontSize(ABNT_CONFIG.fontSize.footer);
  pdf.setTextColor(...ABNT_CONFIG.colors.primary);
  pdf.setFont('Helvetica', 'bold');
  
  const centerX = pageWidth / 2;
  pdf.text('Secretaria de Ciência, Tecnologia e Inovação', centerX, yPos, { align: 'center' });
  pdf.setFontSize(ABNT_CONFIG.fontSize.footer - 1);
  pdf.text('Governo do Estado da Bahia', centerX, yPos + 5, { align: 'center' });

  // Linha separadora
  pdf.setDrawColor(...ABNT_CONFIG.colors.border);
  pdf.line(left, yPos + 10, pageWidth - right, yPos + 10);

  return yPos + 15;
}

/**
 * Adiciona capa do relatório
 * @param {jsPDF} pdf - Documento PDF
 * @param {string} sectiLogoBase64 - Logo SECTI em base64
 * @param {string} conectaLogoBase64 - Logo ConectaBahia em base64
 * @param {string} title - Título do relatório
 * @param {string} subtitle - Subtítulo
 * @param {string} date - Data do relatório
 */
async function addCover(pdf, sectiLogoBase64, conectaLogoBase64, title, subtitle, date) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const { left, right } = ABNT_CONFIG.margins;

  let yPos = 40;
  const centerX = pageWidth / 2;
  const contentWidth = pageWidth - left - right;

  // Logos no topo - lado a lado
  const logoWidth = 45;
  const logoHeight = 35;
  const logosSpacing = 30;

  // Logo SECTI à esquerda
  if (sectiLogoBase64) {
    try {
      const sectiX = centerX - logoWidth - logosSpacing / 2;
      pdf.addImage(sectiLogoBase64, 'PNG', sectiX, yPos, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Erro ao adicionar logo SECTI:', e);
    }
  }

  // Logo ConectaBahia à direita
  if (conectaLogoBase64) {
    try {
      const conectaX = centerX + logosSpacing / 2;
      pdf.addImage(conectaLogoBase64, 'PNG', conectaX, yPos, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Erro ao adicionar logo ConectaBahia:', e);
    }
  }

  yPos += logoHeight + 20;

  // Linha decorativa
  pdf.setDrawColor(...ABNT_CONFIG.colors.primary);
  pdf.setLineWidth(1);
  pdf.line(left + 30, yPos - 5, pageWidth - right - 30, yPos - 5);

  yPos += 10;

  // Título
  pdf.setFontSize(ABNT_CONFIG.fontSize.title + 2);
  pdf.setFont('Helvetica', 'bold');
  pdf.setTextColor(...ABNT_CONFIG.colors.primary);
  
  const titleLines = pdf.splitTextToSize(title, contentWidth - 40);
  pdf.text(titleLines, centerX, yPos, { align: 'center' });
  yPos += titleLines.length * 10 + 10;

  // Subtítulo
  pdf.setFontSize(ABNT_CONFIG.fontSize.subtitle);
  pdf.setFont('Helvetica', 'normal');
  pdf.setTextColor(...ABNT_CONFIG.colors.secondary);
  
  const subtitleLines = pdf.splitTextToSize(subtitle, contentWidth - 40);
  pdf.text(subtitleLines, centerX, yPos, { align: 'center' });
  yPos += subtitleLines.length * 8 + 30;

  // linha decorativa inferior removida (sem acento laranja)
  // pdf.setDrawColor(...ABNT_CONFIG.colors.accent);
  // pdf.setLineWidth(1.5);
  // pdf.line(left + 30, yPos, pageWidth - right - 30, yPos);

  yPos += 15;

  // Data
  pdf.setFontSize(ABNT_CONFIG.fontSize.body);
  pdf.setFont('Helvetica', 'normal');
  pdf.setTextColor(...ABNT_CONFIG.colors.lightText);
  pdf.text(`Relatório gerado em: ${date}`, centerX, pageHeight - 40, { align: 'center' });

  // Informações institucionais no footer da capa
  pdf.setFontSize(ABNT_CONFIG.fontSize.footer - 1);
  pdf.setFont('Helvetica', 'normal');
  pdf.setTextColor(...ABNT_CONFIG.colors.lightText);
  pdf.text('Secretaria de Ciência, Tecnologia e Inovação', centerX, pageHeight - 30, { align: 'center' });
  pdf.text('Governo do Estado da Bahia', centerX, pageHeight - 25, { align: 'center' });

  // Adicionar nova página
  pdf.addPage();
  return 0;
}

/**
 * Adiciona sumário ao PDF
 * @param {jsPDF} pdf - Documento PDF
 * @param {Array} sections - Seções do documento
 */
function addTableOfContents(pdf, sections) {
  const { top, left, right } = ABNT_CONFIG.margins;
  let yPos = top;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - left - right;

  // Título
  pdf.setFontSize(ABNT_CONFIG.fontSize.heading2);
  pdf.setFont('Helvetica', 'bold');
  pdf.setTextColor(...ABNT_CONFIG.colors.primary);
  pdf.text('SUMÁRIO', left, yPos);

  yPos += 15;
  pdf.setFontSize(ABNT_CONFIG.fontSize.body);
  pdf.setFont('Helvetica', 'normal');
  pdf.setTextColor(...ABNT_CONFIG.colors.text);

  sections.forEach((section, index) => {
    const text = `${index + 1}. ${section}`;
    const lines = pdf.splitTextToSize(text, contentWidth);
    pdf.text(lines, left, yPos);
    yPos += lines.length * 6 + 3;

    if (yPos > pdf.internal.pageSize.getHeight() - 20) {
      pdf.addPage();
      yPos = top;
    }
  });

  pdf.addPage();
  return 0;
}

/**
 * Adiciona uma seção com título
 * @param {jsPDF} pdf - Documento PDF
 * @param {number} yPos - Posição Y atual
 * @param {string} title - Título da seção
 * @param {number} level - Nível do título (1, 2, 3)
 * @returns {number} Nova posição Y
 */
function addSection(pdf, yPos, title, level = 1) {
  const { left, right } = ABNT_CONFIG.margins;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pdf.internal.pageSize.getWidth() - left - right;

  // Verificar espaço mínimo
  if (yPos > pageHeight - 60) {
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;
  }

  // Configurar estilo conforme nível
  let fontSize, isBold, color;
  if (level === 1) {
    fontSize = ABNT_CONFIG.fontSize.heading2;
    isBold = true;
    color = ABNT_CONFIG.colors.primary;
  } else if (level === 2) {
    fontSize = ABNT_CONFIG.fontSize.heading3;
    isBold = true;
    color = ABNT_CONFIG.colors.secondary;
  } else {
    fontSize = ABNT_CONFIG.fontSize.body;
    isBold = true;
    color = ABNT_CONFIG.colors.lightText;
  }

  pdf.setFontSize(fontSize);
  pdf.setFont('Helvetica', isBold ? 'bold' : 'normal');
  pdf.setTextColor(...color);

  const lines = pdf.splitTextToSize(title.toUpperCase(), contentWidth);
  pdf.text(lines, left, yPos);

  yPos += lines.length * (fontSize / 10) * 1.5 + 5;

  // Linha decorativa para título nível 1
  if (level === 1) {
    pdf.setDrawColor(...ABNT_CONFIG.colors.primary);
    pdf.setLineWidth(0.5);
    pdf.line(left, yPos - 3, pdf.internal.pageSize.getWidth() - ABNT_CONFIG.margins.right, yPos - 3);
    yPos += 3;
  }

  return yPos + 5;
}

/**
 * Adiciona parágrafo ao PDF
 * @param {jsPDF} pdf - Documento PDF
 * @param {number} yPos - Posição Y atual
 * @param {string} text - Texto do parágrafo
 * @returns {number} Nova posição Y
 */
function addParagraph(pdf, yPos, text) {
  const { left, right } = ABNT_CONFIG.margins;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pdf.internal.pageSize.getWidth() - left - right;

  // Verificar espaço mínimo
  if (yPos > pageHeight - 30) {
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;
  }

  pdf.setFontSize(ABNT_CONFIG.fontSize.body);
  pdf.setFont('Helvetica', 'normal');
  pdf.setTextColor(...ABNT_CONFIG.colors.text);

  const lines = pdf.splitTextToSize(text, contentWidth);
  pdf.text(lines, left, yPos);

  return yPos + lines.length * 6 + 3;
}

/**
 * Adiciona tabela ao PDF
 * @param {jsPDF} pdf - Documento PDF
 * @param {number} yPos - Posição Y atual
 * @param {Array} headers - Cabeçalhos da tabela
 * @param {Array} rows - Linhas da tabela
 * @returns {number} Nova posição Y
 */
function addTable(pdf, yPos, headers, rows) {
  const { left, right } = ABNT_CONFIG.margins;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pdf.internal.pageSize.getWidth() - left - right;

  // Verificar espaço
  if (yPos > pageHeight - 60) {
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;
  }

  const columnWidth = contentWidth / headers.length;

  // Cabeçalho da tabela
  pdf.setFillColor(...ABNT_CONFIG.colors.primary);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(ABNT_CONFIG.fontSize.body - 1);

  headers.forEach((header, i) => {
    const x = left + i * columnWidth;
    pdf.rect(x, yPos - 5, columnWidth, 8, 'F');
    pdf.text(header, x + 2, yPos, { maxWidth: columnWidth - 4 });
  });

  pdf.setTextColor(...ABNT_CONFIG.colors.text);
  pdf.setFont('Helvetica', 'normal');
  pdf.setFontSize(ABNT_CONFIG.fontSize.body - 1);

  yPos += 10;
  let rowIndex = 0;

  // Linhas da tabela
  rows.forEach((row) => {
    // Alternância de cores
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(245, 245, 245);
      pdf.rect(left, yPos - 5, contentWidth, 7, 'F');
    }

    row.forEach((cell, i) => {
      const x = left + i * columnWidth;
      const cellText = String(cell || '').substring(0, 30);
      pdf.text(cellText, x + 2, yPos, { maxWidth: columnWidth - 4 });
    });

    yPos += 7;
    rowIndex++;

    // Nova página se necessário
    if (yPos > pageHeight - 20) {
      pdf.addPage();
      yPos = ABNT_CONFIG.margins.top;
    }
  });

  return yPos + 5;
}

/**
 * Adiciona imagem ao PDF
 * @param {jsPDF} pdf - Documento PDF
 * @param {number} yPos - Posição Y atual
 * @param {string} imageBase64 - Imagem em base64
 * @param {string} caption - Legenda da imagem
 * @param {number} width - Largura da imagem em mm
 * @returns {number} Nova posição Y
 */
function addImage(pdf, yPos, imageBase64, caption, width = 150) {
  const { left, right } = ABNT_CONFIG.margins;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - left - right;

  // Verificar espaço
  if (yPos > pageHeight - 80) {
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;
  }

  try {
    // Calcular altura proporcional
    const maxWidth = Math.min(width, contentWidth);
    const centerX = left + (contentWidth - maxWidth) / 2;

    // Adicionar imagem
    pdf.addImage(imageBase64, 'PNG', centerX, yPos, maxWidth, maxWidth * 0.75);
    yPos += maxWidth * 0.75 + 5;

    // Adicionar legenda
    if (caption) {
      pdf.setFontSize(ABNT_CONFIG.fontSize.footer);
      pdf.setFont('Helvetica', 'italic');
      pdf.setTextColor(...ABNT_CONFIG.colors.lightText);

      const captionLines = pdf.splitTextToSize(`Figura: ${caption}`, contentWidth);
      pdf.text(captionLines, left, yPos);
      yPos += captionLines.length * 4 + 5;
    }
  } catch (e) {
    console.warn('Erro ao adicionar imagem:', e);
  }

  return yPos;
}

/**
 * Adiciona rodapé ao PDF
 * @param {jsPDF} pdf - Documento PDF
 */
function addFooter(pdf) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { left, right } = ABNT_CONFIG.margins;

  const totalPages = pdf.internal.pages.length - 1;

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    // Linha separadora
    pdf.setDrawColor(...ABNT_CONFIG.colors.border);
    pdf.setLineWidth(0.3);
    pdf.line(left, pageHeight - 15, pageWidth - right, pageHeight - 15);

    // Número da página
    pdf.setFontSize(ABNT_CONFIG.fontSize.footer);
    pdf.setFont('Helvetica', 'normal');
    pdf.setTextColor(...ABNT_CONFIG.colors.lightText);
    pdf.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }
}

/**
 * Gera PDF base64 de uma imagem HTML
 * @param {HTMLElement} element - Elemento HTML para converter
 * @returns {Promise<string>} Base64 da imagem
 */
export async function htmlElementToBase64(element) {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Erro ao converter elemento para imagem:', e);
    return null;
  }
}

/**
 * Gera relatório PDF completo
 * @param {Object} options - Opções do relatório
 * @returns {Promise<jsPDF>} Documento PDF gerado
 */
export async function generatePDFReport(options = {}) {
  const {
    title = 'Programa Conecta Bahia',
    subtitle = 'Relatório de Pontos de Acesso à Internet',
    municipiosData = [],
    mapElement = null,
    sectiLogo = null,
    conectaLogo = null,
    includeMap = true,
    includeStatistics = true,
    includeData = true,
  } = options;

  const pdf = createPDFDocument();
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Adicionar capa
  await addCover(pdf, sectiLogo, conectaLogo, title, subtitle, dateStr);

  // Adicionar cabeçalho em todas as páginas
  let yPos = ABNT_CONFIG.margins.top;

  // Sumário
  const sections = [];
  if (includeStatistics) sections.push('Estatísticas Gerais');
  if (includeMap) sections.push('Mapa de Localização');
  if (includeData) sections.push('Dados dos Municípios');
  sections.push('Referências');

  if (sections.length > 0) {
    addTableOfContents(pdf, sections);
     yPos = ABNT_CONFIG.margins.top;
  }

  // Introdução
  yPos = addSection(pdf, yPos, '1. Introdução', 1);
  yPos = addParagraph(
    pdf,
    yPos,
    'O Programa Conecta Bahia é uma iniciativa da Secretaria de Ciência, Tecnologia e Inovação do Governo do Estado da Bahia, destinado a democratizar o acesso à internet e promover a inclusão digital dos cidadãos baianos através da instalação de pontos de acesso Wi-Fi em praças e espaços públicos.'
  );

  // Estatísticas
  if (includeStatistics && municipiosData.length > 0) {
    yPos = addSection(pdf, yPos, '2. Estatísticas Gerais', 1);

    const totalMunicipios = municipiosData.length;
    const totalPontos = municipiosData.reduce((sum, m) => sum + (m.quantidade || 0), 0);
    const mediaPontos = (totalPontos / totalMunicipios).toFixed(2);

    yPos = addParagraph(
      pdf,
      yPos,
      `Este relatório apresenta uma análise dos ${totalMunicipios} municípios participantes do Programa Conecta Bahia, com um total de ${totalPontos} pontos de acesso à internet, representando uma média de ${mediaPontos} pontos por município.`
    );

    // Tabela de estatísticas
    const stats = [
      ['Métrica', 'Valor'],
      ['Total de Municípios', totalMunicipios.toString()],
      ['Total de Pontos de Acesso', totalPontos.toString()],
      ['Média de Pontos por Município', mediaPontos],
      ['Data de Geração', dateStr],
    ];

    yPos = addTable(pdf, yPos, stats[0], stats.slice(1)) + 5;
  }

  // Mapa - garante página exclusiva
  if (includeMap && mapElement) {
    // força quebra de página antes da seção
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;

    yPos = addSection(pdf, yPos, '3. Mapa de Localização', 1);

    yPos = addParagraph(
      pdf,
      yPos,
      'Abaixo apresenta-se o mapa geográfico dos pontos de acesso distribuídos no estado da Bahia:'
    );

    const mapImage = await htmlElementToBase64(mapElement);
    if (mapImage) {
      // ocupar página inteira ajustando largura
      yPos = addImage(pdf, yPos, mapImage, 'Distribuição dos pontos de acesso Wi-Fi no estado da Bahia', 180);
    }

    // garantir quebra após mapa para não mesclar com próximos conteúdos
    pdf.addPage();
    yPos = ABNT_CONFIG.margins.top;
  }

  // Dados dos Municípios
  if (includeData && municipiosData.length > 0) {
    yPos = addSection(pdf, yPos, '4. Dados dos Municípios', 1);

    // Subdividir em múltiplas tabelas se necessário
    const chunkSize = 15;
    for (let i = 0; i < municipiosData.length; i += chunkSize) {
      const chunk = municipiosData.slice(i, i + chunkSize);

      const tableHeaders = ['Município', 'Quantidade', 'Região'];
      const tableRows = chunk.map((m) => [
        m.nome || '',
        m.quantidade ? m.quantidade.toString() : '0',
        m.territorio || '',
      ]);

      yPos = addTable(pdf, yPos, tableHeaders, tableRows) + 5;
    }
  }

  // Referências
  yPos = addSection(pdf, yPos, '5. Referências', 1);
  yPos = addParagraph(
    pdf,
    yPos,
    'Secretaria de Ciência, Tecnologia e Inovação - SECTI. Disponível em: <http://www.secti.ba.gov.br>'
  );
  yPos = addParagraph(pdf, yPos, 'ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. NBR 6023: Informação e documentação - Referências - Elaboração. Rio de Janeiro, 2018.');
  yPos = addParagraph(pdf, yPos, 'ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. NBR 14724: Informação e documentação - Trabalhos acadêmicos - Apresentação. Rio de Janeiro, 2011.');

  // Adicionar footer em todas as páginas
  addFooter(pdf);

  return pdf;
}

/**
 * Gerara relatório e faz download
 * @param {Object} options - Opções do relatório
 */
export async function generateAndDownloadReport(options = {}) {
  try {
    const pdf = await generatePDFReport(options);
    const filename = `ConectaBahia_Relatorio_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    throw error;
  }
}

export default {
  generatePDFReport,
  generateAndDownloadReport,
  htmlElementToBase64,
};
