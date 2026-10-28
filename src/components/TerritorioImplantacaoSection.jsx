import React, { useEffect, useMemo, useState } from 'react';
import territoriosMunicipios from '../../utils/territorioMunicipios.json';
import { applyFilterMode, fetchConectaData } from '../../utils/spreadsheetService';

const normalize = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

const MUNICIPIO_ALIASES = {
  camacan: 'camaca',
  'muquem do sao francisco': 'muquem de sao francisco',
};

const simplifyName = (s) => {
  const base = normalize(s).replace(/\s*[\-–].*$/g, '').trim();
  return MUNICIPIO_ALIASES[base] || base;
};

const TERRITORY_REFERENCE = territoriosMunicipios.territorios_de_identidade.map((territorio) => ({
  id: territorio.id,
  territorio: territorio.nome,
  municipios: territorio.quantidade_municipios || territorio.municipios.length,
  municipioKeys: territorio.municipios.map((nomeMunicipio) => simplifyName(nomeMunicipio)),
}));

const buildRowsFromSpreadsheet = (spreadsheetData) => {
  const safeData = spreadsheetData && typeof spreadsheetData === 'object' ? spreadsheetData : {};
  const installedData = applyFilterMode(safeData, 'instalado');

  const installedMunicipioKeys = new Set(
    Object.keys(installedData).map((municipioNome) => simplifyName(municipioNome))
  );

  const rows = TERRITORY_REFERENCE.map((territorio) => {
    const implantados = territorio.municipioKeys.reduce(
      (acc, municipioKey) => (installedMunicipioKeys.has(municipioKey) ? acc + 1 : acc),
      0
    );

    const percentual = territorio.municipios > 0
      ? Math.round((implantados / territorio.municipios) * 100)
      : 0;

    return {
      id: territorio.id,
      territorio: territorio.territorio,
      municipios: territorio.municipios,
      implantados,
      percentual,
    };
  });

  const rowsComImplantacao = rows.filter((row) => row.implantados > 0);
  return rowsComImplantacao.length > 0 ? rowsComImplantacao : rows;
};

const PIE_COLORS = [
  '#EE2F5A', '#FBA751', '#CFDD90', '#0397DA', '#9CD3AF', '#EB278F', '#BE4481',
  '#BF8057', '#D7CB76', '#04AFED', '#B6B317', '#099D9E', '#F38735', '#A4C757',
  '#9493B5', '#01A859', '#5CC3D4', '#0F9296', '#FFCD37', '#9F637C', '#FDF588',
  '#F8AFAD', '#47887A', '#D9CB72', '#B0BD77', '#C5C7DB', '#C8C6C4',
];

const ANALYSIS_METHODS = [
  {
    id: 'visao-geral',
    label: 'Visão geral',
    description: 'Ordena por maior cobertura percentual.',
  },
  {
    id: 'mais-implantados',
    label: 'Quem tem mais',
    description: 'Prioriza territórios com maior número de implantados.',
  },
  {
    id: 'menos-implantados',
    label: 'Quem tem menos',
    description: 'Mostra primeiro territórios com menos implantados.',
  },
  {
    id: 'proximos-100',
    label: 'Próximos de 100%',
    description: 'Mostra quem está mais perto da cobertura total.',
  },
  {
    id: 'mais-longe-100',
    label: 'Mais longe de 100%',
    description: 'Mostra quem está mais distante da cobertura total.',
  },
];

const sortRowsByMethod = (rows, methodId) => {
  const cloned = [...rows];

  switch (methodId) {
    case 'mais-implantados':
      return cloned.sort((a, b) => b.implantados - a.implantados || b.percentual - a.percentual);
    case 'menos-implantados':
      return cloned.sort((a, b) => a.implantados - b.implantados || a.percentual - b.percentual);
    case 'proximos-100':
      return cloned.sort((a, b) => a.gap100 - b.gap100 || b.percentual - a.percentual);
    case 'mais-longe-100':
      return cloned.sort((a, b) => b.gap100 - a.gap100 || a.percentual - b.percentual);
    case 'visao-geral':
    default:
      return cloned.sort((a, b) => b.percentual - a.percentual || b.implantados - a.implantados);
  }
};

const getCoverageTone = (percentual) => {
  if (percentual >= 70) {
    return {
      barClass: 'bg-emerald-500',
    };
  }

  if (percentual >= 50) {
    return {
      barClass: 'bg-blue-500',
    };
  }

  return {
    barClass: 'bg-amber-500',
  };
};

export default function TerritorioImplantacaoSection() {
  const [analysisMode, setAnalysisMode] = useState('visao-geral');
  const [activeSlice, setActiveSlice] = useState('todos');
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [territorioRows, setTerritorioRows] = useState([]);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;

    const applyRows = (data) => {
      if (!active) {
        return;
      }

      setTerritorioRows(buildRowsFromSpreadsheet(data));
      setLoadError('');
    };

    const loadData = async () => {
      setIsLoadingRows(true);

      try {
        const { data } = await fetchConectaData((updatedData) => {
          applyRows(updatedData);
          if (active) {
            setIsLoadingRows(false);
          }
        }, 'instalado');

        applyRows(data);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('[TerritorioImplantacaoSection] Falha ao carregar dados ao vivo:', error);
        setLoadError('Nao foi possivel carregar os dados da planilha agora.');
        setTerritorioRows([]);
      } finally {
        if (active) {
          setIsLoadingRows(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, []);

  const rowsWithMeta = useMemo(() => {
    return territorioRows.map((item) => ({
      ...item,
      pendentes: item.municipios - item.implantados,
      gap100: 100 - item.percentual,
    }));
  }, [territorioRows]);

  useEffect(() => {
    if (activeSlice === 'todos') {
      return;
    }

    const hasSelectedSlice = rowsWithMeta.some((row) => row.territorio === activeSlice);
    if (!hasSelectedSlice) {
      setActiveSlice('todos');
    }
  }, [activeSlice, rowsWithMeta]);

  const totalMunicipios = useMemo(() => {
    return rowsWithMeta.reduce((acc, item) => acc + item.municipios, 0);
  }, [rowsWithMeta]);

  const totalImplantados = useMemo(() => {
    return rowsWithMeta.reduce((acc, item) => acc + item.implantados, 0);
  }, [rowsWithMeta]);

  const percentualGeral = totalMunicipios > 0
    ? Math.round((totalImplantados / totalMunicipios) * 100)
    : 0;

  const pieData = useMemo(() => {
    const sorted = [...rowsWithMeta].sort((a, b) => b.implantados - a.implantados);
    const slices = sorted.map((item, index) => ({
      label: item.territorio,
      value: item.implantados,
      color: PIE_COLORS[index % PIE_COLORS.length],
      territorios: [item.territorio],
    }));

    const totalSlices = slices.reduce((acc, item) => acc + item.value, 0);

    return {
      slices,
      total: totalSlices,
    };
  }, [rowsWithMeta]);

  const donutSegments = useMemo(() => {
    if (pieData.total === 0) {
      return [];
    }

    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    let consumedLength = 0;

    return pieData.slices.map((slice) => {
      const fraction = slice.value / pieData.total;
      const segmentLength = fraction * circumference;

      const segment = {
        ...slice,
        percentage: fraction * 100,
        radius,
        circumference,
        segmentLength,
        dasharray: `${segmentLength} ${circumference - segmentLength}`,
        dashoffset: -consumedLength,
      };

      consumedLength += segmentLength;
      return segment;
    });
  }, [pieData]);

  const scopedRows = useMemo(() => {
    if (activeSlice === 'todos') {
      return rowsWithMeta;
    }

    const selectedSlice = pieData.slices.find((slice) => slice.label === activeSlice);
    if (!selectedSlice) {
      return rowsWithMeta;
    }

    return rowsWithMeta.filter((row) => selectedSlice.territorios.includes(row.territorio));
  }, [activeSlice, pieData, rowsWithMeta]);

  const visibleRows = useMemo(() => {
    return sortRowsByMethod(scopedRows, analysisMode);
  }, [scopedRows, analysisMode]);

  const quickInsights = useMemo(() => {
    if (scopedRows.length === 0) {
      return null;
    }

    const byImplantadosDesc = [...scopedRows].sort((a, b) => b.implantados - a.implantados || b.percentual - a.percentual);
    const byImplantadosAsc = [...scopedRows].sort((a, b) => a.implantados - b.implantados || a.percentual - b.percentual);
    const byGapAsc = [...scopedRows].sort((a, b) => a.gap100 - b.gap100 || b.percentual - a.percentual);

    return {
      maiorImplantado: byImplantadosDesc[0],
      menorImplantado: byImplantadosAsc[0],
      maisPerto100: byGapAsc[0],
    };
  }, [scopedRows]);

  const activeMethod = ANALYSIS_METHODS.find((method) => method.id === analysisMode);
  const selectedSlice = activeSlice === 'todos' ? null : donutSegments.find((segment) => segment.label === activeSlice);
  const focusedSlice = hoveredSlice ? donutSegments.find((segment) => segment.label === hoveredSlice) : selectedSlice;

  const handleSliceToggle = (label) => {
    setActiveSlice((current) => (current === label ? 'todos' : label));
  };

  return (
    <section className="mt-6 sm:mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs">
            Implantação por TI
          </span>
        </div>

        <h2 className="text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
          Cobertura por Território de Identidade
        </h2>
        <p className="text-sm leading-relaxed text-slate-600 sm:text-[15px]">
          Painel consolidado com municípios previstos, implantados e percentual de cobertura em cada território.
        </p>
        <p className="text-xs font-medium text-slate-500">
          Fonte: planilha ao vivo do SharePoint.
        </p>
        {loadError && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {loadError}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Gráfico Interativo</h3>
            {activeSlice !== 'todos' && (
              <button
                type="button"
                onClick={() => setActiveSlice('todos')}
                className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 hover:border-blue-400 hover:text-blue-700"
              >
                Limpar filtro
              </button>
            )}
          </div>

          <div className="relative mx-auto mt-3 h-52 w-52">
            <svg viewBox="0 0 220 220" className="h-full w-full">
              <circle cx="110" cy="110" r="68" fill="none" stroke="#E2E8F0" strokeWidth="24" />

              <g transform="translate(110,110) rotate(-90)">
                {donutSegments.map((segment) => {
                  const isActive = activeSlice === segment.label;
                  const isHovered = hoveredSlice === segment.label;

                  return (
                    <circle
                      key={segment.label}
                      cx="0"
                      cy="0"
                      r={segment.radius}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth={isActive ? 34 : isHovered ? 31 : 28}
                      strokeDasharray={segment.dasharray}
                      strokeDashoffset={segment.dashoffset}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredSlice(segment.label)}
                      onMouseLeave={() => setHoveredSlice(null)}
                      onClick={() => handleSliceToggle(segment.label)}
                    />
                  );
                })}
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-extrabold text-slate-900">
                {isLoadingRows
                  ? '...'
                  : focusedSlice
                    ? `${focusedSlice.percentage.toFixed(1)}%`
                    : `${percentualGeral}%`}
              </span>
              <span className="mt-1 max-w-[130px] text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {isLoadingRows
                  ? 'Carregando'
                  : focusedSlice
                    ? focusedSlice.label
                    : rowsWithMeta.length > 0
                      ? 'Cobertura geral'
                      : 'Sem dados'}
              </span>
            </div>
          </div>

          <ul className="mt-4 max-h-72 space-y-1.5 overflow-auto pr-1">
            {donutSegments.map((slice) => {
              const pct = slice.percentage.toFixed(1);
              const isActive = activeSlice === slice.label;

              return (
                <li key={slice.label}>
                  <button
                    type="button"
                    onClick={() => handleSliceToggle(slice.label)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition ${isActive
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                      }`}
                  >
                    <span className="inline-flex items-center gap-2 text-left">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="max-w-[145px] truncate font-medium">{slice.label}</span>
                    </span>
                    <span className="font-bold">{pct}%</span>
                  </button>
                </li>
              );
            })}
            {!isLoadingRows && donutSegments.length === 0 && (
              <li className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-500">
                Nenhum território com implantação encontrado.
              </li>
            )}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Clique em uma fatia ou legenda para filtrar a tabela. O método de leitura à direita muda a ordenação para comparar rapidamente quem tem mais, menos e quem está mais próximo de 100%.
          </p>
        </aside>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50/90 px-3 py-3 sm:px-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Métodos de análise</p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {ANALYSIS_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setAnalysisMode(method.id)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${analysisMode === method.id
                    ? 'border-blue-300 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                    }`}
                >
                  {method.label}
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs text-slate-600">
              {activeMethod?.description}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Quem tem mais</p>
                <p className="mt-1 truncate text-sm font-bold text-emerald-900">{quickInsights?.maiorImplantado?.territorio || '--'}</p>
                <p className="text-xs font-semibold text-emerald-700">{quickInsights?.maiorImplantado?.implantados ?? 0} implantados</p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Quem tem menos</p>
                <p className="mt-1 truncate text-sm font-bold text-amber-900">{quickInsights?.menorImplantado?.territorio || '--'}</p>
                <p className="text-xs font-semibold text-amber-700">{quickInsights?.menorImplantado?.implantados ?? 0} implantados</p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Mais próximo de 100%</p>
                <p className="mt-1 truncate text-sm font-bold text-blue-900">{quickInsights?.maisPerto100?.territorio || '--'}</p>
                <p className="text-xs font-semibold text-blue-700">faltam {quickInsights?.maisPerto100?.gap100 ?? 0}%</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              Escopo atual: <span className="font-semibold text-slate-700">{activeSlice === 'todos' ? 'Todos os territórios' : activeSlice}</span> • {visibleRows.length} território(s)
            </p>
          </div>

          <div className="max-h-[540px] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">#</th>
                  <th className="px-3 py-3 text-left font-bold">Território</th>
                  <th className="px-3 py-3 text-right font-bold">Municípios</th>
                  <th className="px-3 py-3 text-right font-bold">Implantados</th>
                  <th className="px-3 py-3 text-right font-bold">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingRows && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                      Carregando dados da planilha...
                    </td>
                  </tr>
                )}

                {!isLoadingRows && visibleRows.length === 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                      Nenhum dado de implantação disponível no momento.
                    </td>
                  </tr>
                )}

                {!isLoadingRows && visibleRows.map((item, index) => {
                  const tone = getCoverageTone(item.percentual);
                  const isComplete = item.percentual === 100;
                  const highlightClass = isComplete
                    ? 'bg-emerald-50/80 ring-1 ring-emerald-200'
                    : index === 0
                      ? 'bg-blue-50/70'
                      : index < 3
                        ? 'bg-blue-50/30'
                        : '';

                  return (
                    <tr key={item.id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${highlightClass}`}>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500">{item.id}</td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-semibold text-slate-800">{item.territorio}</p>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${tone.barClass}`} style={{ width: `${item.percentual}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">{item.municipios}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{item.implantados}</td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-bold text-slate-900">{item.percentual}%</p>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${isComplete ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {isComplete ? 'Cobertura total' : `faltam ${item.gap100}%`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cobertura Geral</span>
                <span className="font-extrabold text-emerald-700">{percentualGeral}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
