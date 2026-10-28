import React from 'react';
import EducacaoIntegralMap from '../ConectaMap';

function BahiaPattern() {
  return (
    <div aria-hidden="true" className="h-12 overflow-hidden bg-[#fcfaf5] sm:h-[68px]">
      <svg viewBox="0 0 1600 110" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <rect width="1600" height="110" fill="#fcfaf5" />
        <g stroke="#fcfaf5" strokeWidth="5" strokeLinejoin="round">
          <path d="M0 0H190L74 110H0Z" fill="#d91f26" />
          <path d="M190 0H410L319 110H74Z" fill="#f5a623" />
          <path d="M410 0H650L555 110H319Z" fill="#d91f26" />
          <path d="M650 0H845L716 110H555Z" fill="#164f86" />
          <path d="M845 0H990L1070 110H716Z" fill="#f5a623" />
          <path d="M990 0H1300L1434 110H1070Z" fill="#d91f26" />
          <path d="M1300 0H1600V110H1434Z" fill="#164f86" />
          <path d="M72 110 190 0 248 0 163 110Z" fill="#164f86" />
          <path d="M560 110 650 0 701 0 630 110Z" fill="#f5a623" />
          <path d="M1300 0 1388 0 1472 110 1434 110Z" fill="#f5a623" />
        </g>
      </svg>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f3ed] font-sans text-slate-900">
      <div className="bg-[#102f4d] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white sm:px-6 sm:text-xs">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
          <span>Governo do Estado da Bahia</span>
          <span className="text-white/70">Secretaria da Educação</span>
        </div>
      </div>

      <header className="overflow-hidden bg-[#fcfaf5]">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:flex-row lg:items-center lg:px-10 lg:py-12">
          <div className="max-w-3xl">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#a25c14] sm:text-xs">
              Educação pública • Bahia
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-[#153c61] sm:text-4xl lg:text-5xl">
              Educação Integral <span className="text-[#d91f26]">na Bahia</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Acompanhe a expansão dos municípios com Educação Integral ao longo dos anos e explore os registros no mapa.
            </p>
          </div>
        </div>
        <BahiaPattern />
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-0 pb-10 sm:px-6 sm:pb-14 lg:px-10">
        <div className="mb-4 px-4 pt-5 sm:px-0 sm:pt-7">
          <p className="text-xs font-medium text-slate-500">Escolha um ano para ver o crescimento acumulado dos municípios participantes.</p>
        </div>
        <EducacaoIntegralMap />
      </main>

      <footer className="border-t border-[#e3ded3] bg-[#fcfaf5] px-4 py-5 text-center text-[11px] font-medium text-slate-500 sm:text-xs">
        Governo do Estado da Bahia <span className="mx-1.5 text-[#d91f26]">•</span> Secretaria da Educação
      </footer>
    </div>
  );
}
