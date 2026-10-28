import React, { useEffect, useMemo, useState } from 'react';
import * as topojson from 'topojson-client';
import { educationMunicipalitiesByYear } from './src/data/educacaoIntegralMunicipios.js';

const YEARS = Object.keys(educationMunicipalitiesByYear).map(Number).sort((a, b) => a - b);
const SVG_W = 600;
const SVG_H = 600;
const PADDING = 20;
const YEAR_COLORS = {
  2014: '#D91F26',
  2019: '#E88718',
  2023: '#164F86',
  2026: '#C89414',
};

const normalizeMunicipio = (value) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const MUNICIPIO_ALIASES = {
  camacan: 'camaca',
  maragojipe: 'maragogipe',
  'muquem do sao francisco': 'muquem de sao francisco',
  'santa terezinha': 'santa teresinha',
};

const municipioKey = (name) => {
  const normalized = normalizeMunicipio(name);
  return MUNICIPIO_ALIASES[normalized] || normalized;
};

const lineToPath = (line, project) => line.map(([longitude, latitude], index) => {
  const [x, y] = project([longitude, latitude]);
  return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
}).join(' ');

const geometryToPath = (geometry, project) => {
  if (!geometry) return '';
  if (geometry.type === 'LineString') return lineToPath(geometry.coordinates, project);
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.map((line) => lineToPath(line, project)).join(' ');
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => `${lineToPath(ring, project)} Z`).join(' ');
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => `${lineToPath(ring, project)} Z`))
      .join(' ');
  }
  return '';
};

const buildMapFeatures = (topology) => {
  const geojson = topojson.feature(topology, topology.objects.BA);
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;
  let minLatitude = Infinity;
  let maxLatitude = -Infinity;

  geojson.features.forEach((feature) => {
    if (!feature.geometry) return;
    const rings = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates
      : feature.geometry.coordinates.flat(1);
    rings.forEach((ring) => ring.forEach(([longitude, latitude]) => {
      minLongitude = Math.min(minLongitude, longitude);
      maxLongitude = Math.max(maxLongitude, longitude);
      minLatitude = Math.min(minLatitude, latitude);
      maxLatitude = Math.max(maxLatitude, latitude);
    }));
  });

  const rangeLongitude = maxLongitude - minLongitude;
  const rangeLatitude = maxLatitude - minLatitude;
  const drawWidth = SVG_W - 2 * PADDING;
  const drawHeight = SVG_H - 2 * PADDING;
  const project = ([longitude, latitude]) => [
    PADDING + ((longitude - minLongitude) / rangeLongitude) * drawWidth,
    PADDING + ((maxLatitude - latitude) / rangeLatitude) * drawHeight,
  ];

  return geojson.features
    .filter((feature) => feature.geometry)
    .map((feature) => {
      return {
        name: feature.properties.NOME,
        geocode: feature.properties.GEOCODIGO,
        path: geometryToPath(feature.geometry, project),
      };
    });
};

const getCohortMap = () => {
  const cohortMap = new Map();
  YEARS.forEach((year) => {
    educationMunicipalitiesByYear[year].forEach((name) => {
      const key = municipioKey(name);
      if (!cohortMap.has(key)) cohortMap.set(key, year);
    });
  });
  return cohortMap;
};

const cohortMap = getCohortMap();

const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(value);

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.2 4.2" strokeLinecap="round" />
    </svg>
  );
}

export default function EducacaoIntegralMap() {
  const [mapFeatures, setMapFeatures] = useState([]);
  const [mapError, setMapError] = useState('');
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState('');
  const [hoveredMunicipio, setHoveredMunicipio] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let active = true;
    fetch('/BA_(1)9396399957704198.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((topology) => {
        if (active) setMapFeatures(buildMapFeatures(topology));
      })
      .catch((error) => {
        console.error('Erro ao carregar o mapa da Bahia:', error);
        if (active) setMapError('Não foi possível carregar o mapa da Bahia. Atualize a página para tentar novamente.');
      });
    return () => { active = false; };
  }, []);

  const previousYear = YEARS[YEARS.indexOf(selectedYear) - 1];
  const selectedMunicipioKey = municipioKey(selectedMunicipio);
  const selectedCohort = cohortMap.get(selectedMunicipioKey);
  const activeFeatures = useMemo(() => mapFeatures
    .filter((feature) => {
      const firstYear = cohortMap.get(municipioKey(feature.name));
      return firstYear && firstYear <= selectedYear;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [mapFeatures, selectedYear]);

  const visibleMunicipios = useMemo(() => {
    const term = normalizeMunicipio(searchTerm);
    return activeFeatures.filter((feature) => normalizeMunicipio(feature.name).includes(term));
  }, [activeFeatures, searchTerm]);

  const activeCount = activeFeatures.length;
  const newCount = educationMunicipalitiesByYear[selectedYear].length
    - (previousYear ? educationMunicipalitiesByYear[previousYear].length : 0);
  const coverage = mapFeatures.length ? (activeCount / mapFeatures.length) * 100 : 0;
  const selectedFeature = mapFeatures.find((feature) => municipioKey(feature.name) === selectedMunicipioKey);

  const selectMunicipio = (name) => setSelectedMunicipio(name);
  const changeZoom = (amount) => setZoom((current) => Math.min(2.5, Math.max(0.8, Number((current + amount).toFixed(2)))));

  return (
    <section className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-white shadow-[0_20px_60px_-35px_rgba(20,45,70,0.35)] sm:rounded-[28px]">
      <div className="border-b border-[#e9e5dc] bg-[#fffefa] px-4 py-5 sm:px-7 sm:py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a25c14]">Linha do tempo</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-[#153c61] sm:text-2xl">Expansão por ano</h2>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-slate-500 sm:text-sm">
            Selecione um ano para acompanhar os municípios que já faziam parte da política.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {YEARS.map((year) => {
            const total = educationMunicipalitiesByYear[year].length;
            const added = total - (educationMunicipalitiesByYear[YEARS[YEARS.indexOf(year) - 1]]?.length || 0);
            const selected = selectedYear === year;
            return (
              <button
                key={year}
                type="button"
                aria-pressed={selected}
                onClick={() => { setSelectedYear(year); setSelectedMunicipio(''); }}
                className={`group rounded-xl border px-3 py-3 text-left transition sm:px-4 ${selected
                  ? 'border-[#153c61] bg-[#153c61] text-white shadow-md shadow-[#153c61]/15'
                  : 'border-[#e7e2d8] bg-white text-[#153c61] hover:border-[#c6bda9] hover:bg-[#faf8f2]'}`}
              >
                <span className={`block text-[11px] font-bold uppercase tracking-[0.14em] ${selected ? 'text-white/70' : 'text-slate-400'}`}>Ano</span>
                <span className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-extrabold tabular-nums sm:text-[28px]">{year}</span>
                  <span className={`text-sm font-bold tabular-nums ${selected ? 'text-white' : 'text-slate-600'}`}>{formatNumber(total)}</span>
                </span>
                <span className={`mt-1 block text-[11px] ${selected ? 'text-white/70' : 'text-slate-500'}`}>
                  {YEARS.indexOf(year) === 0 ? `${formatNumber(added)} municípios` : `+${formatNumber(added)} no período`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-[720px] grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-[#e9e5dc] bg-[#fbfaf6] xl:border-b-0 xl:border-r">
          <div className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Em {selectedYear}</p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-[#153c61] tabular-nums">{formatNumber(activeCount)}</p>
                <p className="mt-1 text-sm text-slate-600">municípios com Educação Integral</p>
              </div>
              <div className="rounded-xl border border-[#eadfc8] bg-[#fff8e8] px-3 py-2 text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#956019]">Crescimento</span>
                <span className="mt-1 block text-lg font-extrabold text-[#956019] tabular-nums">+{formatNumber(newCount)}</span>
                <span className="block text-[10px] text-[#956019]">desde {previousYear || 'o início'}</span>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Municípios da Bahia</span>
                <span className="font-bold tabular-nums text-[#153c61]">{coverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e9e4d8]">
                <div className="h-full rounded-full bg-[#153c61] transition-[width] duration-500" style={{ width: `${Math.min(100, coverage)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">{formatNumber(activeCount)} de {formatNumber(mapFeatures.length || 417)} municípios no estado</p>
            </div>

            <div className="mt-5 rounded-xl border border-[#e8e2d7] bg-white p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Município selecionado</p>
              {selectedFeature ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#153c61]">{selectedFeature.name}</span>
                  {selectedCohort && selectedCohort <= selectedYear ? (
                    <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: YEAR_COLORS[selectedCohort] }}>
                      Desde {selectedCohort}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Sem registro até {selectedYear}</span>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Clique em um município no mapa ou na lista.</p>
              )}
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Buscar município</span>
              <span className="flex items-center gap-2 rounded-lg border border-[#ddd7ca] bg-white px-3 py-2.5 text-slate-500 transition focus-within:border-[#153c61] focus-within:ring-2 focus-within:ring-[#153c61]/10">
                <IconSearch />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Digite o nome"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </span>
            </label>
          </div>

          <div className="min-h-0 flex-1 border-t border-[#e9e5dc]">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-[#153c61]">Municípios participantes</h3>
              <span className="rounded-full bg-[#e9eef3] px-2 py-1 text-[10px] font-bold text-[#153c61]">{visibleMunicipios.length}</span>
            </div>
            <div className="max-h-[350px] overflow-y-auto px-2 pb-3 sm:px-3 xl:max-h-[430px]" role="list" aria-label={`Municípios com Educação Integral até ${selectedYear}`}>
              {visibleMunicipios.length ? visibleMunicipios.map((feature) => {
                const firstYear = cohortMap.get(municipioKey(feature.name));
                const selected = municipioKey(selectedMunicipio) === municipioKey(feature.name);
                return (
                  <div key={feature.geocode || feature.name} role="listitem">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectMunicipio(feature.name)}
                      className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-[#153c61] text-white' : 'text-slate-700 hover:bg-white hover:shadow-sm'}`}
                    >
                      <span className="truncate text-xs font-medium">{feature.name}</span>
                      <span className={`shrink-0 text-[10px] font-bold tabular-nums ${selected ? 'text-white/75' : 'text-slate-400'}`}>{firstYear}</span>
                    </button>
                  </div>
                );
              }) : (
                <p className="px-4 py-6 text-center text-xs text-slate-500">Nenhum município encontrado.</p>
              )}
            </div>
          </div>

          <p className="border-t border-[#e9e5dc] px-4 py-3 text-[10px] leading-relaxed text-slate-400 sm:px-6">
            Fonte: planilha MAPAS EDUCAÇÃO INTEGRAL. Os totais mostram a expansão acumulada em cada ano.
          </p>
        </aside>

        <div className="flex min-h-[520px] flex-col bg-[#f7f6f1] p-3 sm:min-h-[650px] sm:p-5 lg:p-7">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1 sm:px-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#a25c14]">Bahia • {selectedYear}</p>
              <h3 className="mt-1 text-lg font-bold text-[#153c61] sm:text-xl">Municípios da Educação Integral</h3>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[#e4dfd4] bg-white p-1 shadow-sm" aria-label="Controles de zoom do mapa">
              <button type="button" onClick={() => changeZoom(-0.2)} aria-label="Diminuir zoom" className="grid h-8 w-8 place-items-center rounded-md text-lg font-semibold text-[#153c61] transition hover:bg-[#f2f0e9]">−</button>
              <button type="button" onClick={() => setZoom(1)} aria-label="Redefinir zoom" className="h-8 min-w-12 rounded-md px-1 text-[10px] font-bold tabular-nums text-slate-500 transition hover:bg-[#f2f0e9]">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => changeZoom(0.2)} aria-label="Aumentar zoom" className="grid h-8 w-8 place-items-center rounded-md text-lg font-semibold text-[#153c61] transition hover:bg-[#f2f0e9]">+</button>
            </div>
          </div>

          <div className="relative flex min-h-[430px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#e5e0d5] bg-[#fffefa] shadow-inner sm:min-h-[540px]">
            {mapError ? (
              <p className="max-w-sm px-6 text-center text-sm font-medium text-red-700">{mapError}</p>
            ) : mapFeatures.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-sm font-medium text-slate-500">
                <span className="h-9 w-9 animate-spin rounded-full border-4 border-[#d9e1e8] border-t-[#153c61]" />
                Carregando mapa da Bahia...
              </div>
            ) : (
              <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} role="img" aria-label={`Mapa da Bahia com municípios participantes da Educação Integral em ${selectedYear}`} className="h-full max-h-[720px] w-full">
                <g transform={`translate(${SVG_W / 2} ${SVG_H / 2}) scale(${zoom}) translate(${-SVG_W / 2} ${-SVG_H / 2})`}>
                  {mapFeatures.map((feature) => {
                    const firstYear = cohortMap.get(municipioKey(feature.name));
                    const isActive = firstYear && firstYear <= selectedYear;
                    const isHovered = municipioKey(hoveredMunicipio) === municipioKey(feature.name);
                    const isSelected = municipioKey(selectedMunicipio) === municipioKey(feature.name);
                    return (
                      <path
                        key={feature.geocode || feature.name}
                        d={feature.path}
                        aria-label={`${feature.name}${isActive ? `, participante desde ${firstYear}` : ', sem registro até ' + selectedYear}`}
                        className="cursor-pointer transition-colors duration-200"
                        style={{
                          fill: isActive ? YEAR_COLORS[firstYear] : '#e7e4dc',
                          stroke: isSelected || isHovered ? '#172b3d' : '#fffefa',
                          strokeWidth: isSelected ? 1.65 : isHovered ? 1.35 : 0.72,
                          strokeLinejoin: 'round',
                          vectorEffect: 'non-scaling-stroke',
                          opacity: !isActive && hoveredMunicipio ? 0.66 : 1,
                        }}
                        onClick={() => selectMunicipio(feature.name)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectMunicipio(feature.name);
                          }
                        }}
                        onMouseEnter={() => setHoveredMunicipio(feature.name)}
                        onMouseLeave={() => setHoveredMunicipio('')}
                        onFocus={() => setHoveredMunicipio(feature.name)}
                        onBlur={() => setHoveredMunicipio('')}
                        tabIndex={0}
                        role="button"
                      />
                    );
                  })}
                </g>
              </svg>
            )}
            {mapFeatures.length > 0 && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-[#e7e2d8] bg-white/90 px-3 py-2 text-[10px] text-slate-500 shadow-sm backdrop-blur sm:bottom-4 sm:left-4">
                Passe o cursor ou selecione um município
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 sm:px-2" aria-label="Legenda dos anos de entrada">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Ano de entrada</span>
            {YEARS.filter((year) => year <= selectedYear).map((year) => (
              <span key={year} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: YEAR_COLORS[year] }} />
                {year} <span className="text-slate-400">({formatNumber(educationMunicipalitiesByYear[year].length - (educationMunicipalitiesByYear[YEARS[YEARS.indexOf(year) - 1]]?.length || 0))})</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="h-3 w-3 rounded-[3px] bg-[#e7e4dc]" />Sem registro no período
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
