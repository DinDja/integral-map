import React, { useState, useRef } from 'react';
import { generateAndDownloadReport, htmlElementToBase64 } from '../../utils/pdfReportService';

/**
 * @param {Array} municipiosData
 * @param {React.RefObject} mapRef 
 */

export default function PDFExportButton({
  municipiosData = [],
  mapRef = null,
  className = '',
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef(null);

  const sectiLogoPath = '/img/Secti_Vertical.png';
  const conectaLogoPath = '/img/LogoConecta.png';


  const loadImageAsBase64 = async (imagePath) => {
    try {
      const response = await fetch(imagePath);
      if (!response.ok) throw new Error(`Erro ao carregar ${imagePath}`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn(`Não foi possível carregar ${imagePath}:`, err);
      return null;
    }
  };


  const handleGenerateFullReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sectiLogo, conectaLogo] = await Promise.all([
        loadImageAsBase64(sectiLogoPath),
        loadImageAsBase64(conectaLogoPath),
      ]);

      let mapImage = null;
      if (mapRef && mapRef.current) {
        mapImage = await htmlElementToBase64(mapRef.current);
      }

      const options = {
        title: 'Programa Conecta Bahia',
        subtitle: 'Relatório de Pontos de Acesso à Internet',
        municipiosData: municipiosData || [],
        mapElement: mapRef?.current || null,
        sectiLogo,
        conectaLogo,
        includeMap: true,
        includeStatistics: true,
        includeData: true,
      };

      await generateAndDownloadReport(options);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError('Erro ao gerar relatório. Verifique o console para mais detalhes.');
    } finally {
      setIsLoading(false);
      setShowOptions(false);
    }
  };

  const handleGenerateStatisticsReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sectiLogo, conectaLogo] = await Promise.all([
        loadImageAsBase64(sectiLogoPath),
        loadImageAsBase64(conectaLogoPath),
      ]);

      const options = {
        title: 'Programa Conecta Bahia',
        subtitle: 'Relatório de Estatísticas',
        municipiosData: municipiosData || [],
        sectiLogo,
        conectaLogo,
        includeMap: false,
        includeStatistics: true,
        includeData: true,
      };

      await generateAndDownloadReport(options);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError('Erro ao gerar relatório. Verifique o console para mais detalhes.');
    } finally {
      setIsLoading(false);
      setShowOptions(false);
    }
  };

  const handleGenerateMapReport = async () => {
    if (!mapRef || !mapRef.current) {
      setError('Mapa não disponível');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [sectiLogo, conectaLogo] = await Promise.all([
        loadImageAsBase64(sectiLogoPath),
        loadImageAsBase64(conectaLogoPath),
      ]);

      const mapImage = await htmlElementToBase64(mapRef.current);

      const options = {
        title: 'Programa Conecta Bahia',
        subtitle: 'Mapa de Distribuição de Pontos de Acesso',
        municipiosData: municipiosData || [],
        mapElement: mapRef.current,
        sectiLogo,
        conectaLogo,
        includeMap: true,
        includeStatistics: false,
        includeData: false,
      };

      await generateAndDownloadReport(options);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError('Erro ao gerar relatório. Verifique o console para mais detalhes.');
    } finally {
      setIsLoading(false);
      setShowOptions(false);
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    };

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOptions]);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={isLoading || !municipiosData || municipiosData.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1E3A8A] to-[#1e40af] hover:from-[#1a2058] hover:to-[#1a2f4a] text-white font-bold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Gerando...</span>
          </>
        ) : (
          <>
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Exportar PDF</span>
          </>
        )}
        {!isLoading && (
          <svg
            className={`h-4 w-4 transition-transform ${showOptions ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        )}
      </button>

      {showOptions && (
        <div
          ref={optionsRef}
          className="absolute left-0 mt-2 w-64 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden z-50"
        >
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm">Tipo de Relatório</h3>
            <p className="text-xs text-slate-500 mt-1">
              Escolha o formato desejado para seu relatório
            </p>
          </div>

          <button
            onClick={handleGenerateFullReport}
            disabled={isLoading}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-slate-900 text-sm">
              Relatório Completo
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Inclui estatísticas, mapa e dados dos municípios (padrão ABNT)
            </p>
          </button>

          <button
            onClick={handleGenerateStatisticsReport}
            disabled={isLoading}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-slate-900 text-sm">
              Relatório de Estatísticas
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Apenas estatísticas e dados dos municípios
            </p>
          </button>

          {mapRef && mapRef.current && (
            <button
              onClick={handleGenerateMapReport}
              disabled={isLoading}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-semibold text-slate-900 text-sm">
                Relatório com Mapa
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Mapa geográfico com todos os pontos de acesso
              </p>
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="absolute -bottom-10 left-0 right-0 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
