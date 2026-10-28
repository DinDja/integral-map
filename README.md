# ConectaMap – Pontos do Conecta Bahia

Aplicação React que carrega um mapa da Bahia e destaca, por meio de marcadores, todos os municípios participantes do programa **Conecta Bahia**. O objetivo não é mais selecionar municípios, mas visualizar rapidamente quais localidades do estado fazem parte do programa.

---

## Estrutura de arquivos

```
mapfilter-BA/
├── src/
│   ├── App.jsx                    ← Componente de alto nível que exibe o mapa
│   ├── ConectaMap.jsx             ← Mapa interativo com pontos Conecta
│   └── utils/
│       ├── Municipios.js          ← Lista dos 417 municípios da Bahia (para colorização)
│       └── territorioMunicipios.json  ← Agrupamento por territórios (usado para cores opcionais)
└── public/
    ├── BA_(1)9396399957704198.json ← TopoJSON do mapa da Bahia (~3.9 MB)
    └── conectaMunicipios.json     ← Lista dos 133 municípios atendidos pelo programa
```

---

## Instalação no projeto destino

### 1. Instalar dependências NPM

```bash
npm install topojson-client lucide-react
```

> **Tailwind CSS** também é necessário e deve estar configurado no projeto.

### 2. Copiar os arquivos

| Arquivo | Destino sugerido (Vite/CRA) |
|---|---|
| `src/ConectaMap.jsx` | `src/components/` (ou o local de sua preferência) |
| `utils/Municipios.js` | `src/utils/` |
| `utils/territorioMunicipios.json` | `src/utils/` |
| `public/BA_(1)9396399957704198.json` | `public/` (raiz pública) |
| `public/conectaMunicipios.json` | `public/` |

> Ajuste os imports no topo de `ConectaMap.jsx` caso altere os caminhos dos utilitários.

### 3. Ajustar vite.config.js (se necessário)

Para importar JSON com `assert { type: 'json' }` no Vite, certifique-se que `resolveJsonModule: true` está no `tsconfig` ou não há nenhuma configuração bloqueando import de JSON.

---

## Uso básico

```jsx
import ConectaMap from './ConectaMap';

export default function App() {
  return <ConectaMap />;
}
```




---

(O componente `ConectaMap` não recebe props; ele carrega automaticamente os dados e renderiza o mapa.)

---

## Funcionalidades

- Mapa SVG vetorial interativo da Bahia com zoom (0.5x–4x) e pan por arrasto
- Municípios participantes do Conecta são destacados com a cor do seu território; os demais aparecem esmaecidos em cinza
- Círculos vermelhos no centro de cada município que participa do programa Conecta Bahia
- Tooltip ao passar o mouse mostrando nome do município e indicação de pertencimento ao Conecta
- Legenda simples explicando o marcador

*Removidas as opções de filtro, seleção e lista lateral – o foco agora é apenas a visualização dos pontos do programa.*

---

## Dependências

| Pacote | Versão mínima | Uso |
|---|---|---|
| `react` | 17+ | Framework (peer dependency) |
| `topojson-client` | 3.1+ | Converte TopoJSON → GeoJSON para renderizar o SVG |
| `tailwindcss` | 3+ | Estilização via classes utilitárias |

---

## Dados geográficos

- **TopoJSON** (`BA_(1)9396399957704198.json`): geometria vetorial de todos os 417 municípios da Bahia. Fonte: IBGE.
- **Territórios de Identidade** (`territorioMunicipios.json`): agrupamento dos 27 territórios definidos pela SEPLAN/BA, usado apenas para colorização por território.
- **Conecta Bahia** (`conectaMunicipios.json`): lista dos municípios atendidos pelo programa; utilizada para posicionar os pontos no mapa.
