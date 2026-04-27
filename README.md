# RH • Gestão de Funcionários e Custos de Benefícios

Sistema interno de RH para apurar, ratear e fechar mensalmente os **custos de benefícios** dos colaboradores (vale mercado, vale refeição, plano de saúde, mensalidade Unimed, convênios médicos, farmácia, lanche, reembolso escola e vale transporte). Substitui o controle em planilhas: cada nota fiscal vira uma "competência" no sistema, com rateio automático entre empresa e colaborador, fechamento controlado e relatórios consolidados de saúde por centro de custo.

---

## 📌 Visão geral

| Grupo | Perfil | Uso típico |
| --- | --- | --- |
| **RH / Departamento Pessoal** | Operador principal | Cadastra funcionários, lança notas, ajusta rateios, fecha competências |
| **Gestão** | Leitura | Acompanha custos consolidados de saúde (Unimed + convênios) via Relatório |

> O sistema **não possui login/autenticação** — é uso interno em rede confiável. O controle é feito pelo acesso à URL/instância e pela separação dos perfis acima por convenção operacional.
> O sistema tera sistema de login para o RH quando for finalizado!

---

## 🧱 Stack técnica

- **Node.js** + **TypeScript** `5.5.4`
- **Express** `4.19.2` (API REST)
- **Prisma ORM** `5.22.0` + **MySQL** `8.0`
- **Zod** `3.23.8` (validação de payloads)
- **React** `18.3.1` + **Vite** `5.4.6` (SPA)
- **axios** `1.7.4` (cliente HTTP)
- **recharts** `3.6.0` (gráficos do Relatório de Saúde)
- **ts-node-dev** `2.0.0` (dev server da API)

> *Monorepo com **npm workspaces*** (`api/` e `web/`). Rodar `npm install` na raiz instala os dois pacotes — não rode `npm install` dentro de `api/` ou `web/` separadamente.
>
> *Prisma Client é gerado no `postinstall`* da API. Se você alterar `schema.prisma` precisa rodar `npm run prisma:migrate -w api` (gera migration + client) ou `npm run prisma:generate -w api` (só client).
>
> *MySQL `utf8mb4` é obrigatório* — campos como `note` aceitam acentuação e símbolos. Não troque por `utf8` legado.

---

## 🗂️ Estrutura do projeto

```
rh-gestao-funcionarios/
├── docker-compose.yml         # MySQL 8 + Adminer para dev local (porta 3308 e 8080)
├── package.json               # Workspaces: api, web
├── api/
│   ├── prisma/
│   │   ├── schema.prisma      # Modelo único: Employee + Invoices/Allocations por benefício
│   │   ├── migrations/        # Histórico de migrations (não editar manualmente)
│   │   └── seed.ts            # Seed de funcionários (npm run seed)
│   └── src/
│       ├── server.ts          # Bootstrap Express + montagem de routers
│       ├── lib/               # Helpers (Prisma client, utilitários de cálculo)
│       └── routes/
│           ├── employees.ts             # CRUD de funcionários
│           ├── voucherMarket.ts         # Vale Mercado (rateio 95/5)
│           ├── voucherMeal.ts           # Vale Refeição (filial 1 e 2 — 80/20)
│           ├── unimed.ts                # Unimed Plano de Saúde (uso por procedimento)
│           ├── unimedMonthly.ts         # Unimed Mensalidade (titular + dependentes)
│           ├── medicalConvenios.ts      # 4 provedores (Lab. Santa Cruz, Centro Diag., Policlínicas)
│           ├── pharmacy.ts              # Farmácia + rateio por centro de custo
│           ├── snack.ts                 # Lanche por sessão (presença diária)
│           ├── schoolReimbursement.ts   # Reembolso Escola (35%/50%/100%)
│           ├── transportVoucher.ts      # Vale Transporte
│           └── reports.ts               # Consolidado Saúde (Unimed + Convênios)
└── web/
    └── src/
        ├── App.tsx            # Router por hash (#/funcionalidade) + sidebar
        ├── api.ts             # Cliente axios + tipagens compartilhadas com a API
        ├── pages/             # Uma página por benefício (ver App.tsx para o mapa)
        ├── components/        # Tabela, modais, inputs reutilizáveis
        └── styles.css         # CSS global (sem framework UI)
```

---

## 🧩 Funcionalidades por área

### Funcionários (`/employees`)
- CRUD com `matricula` única, centro de custo, filial, datas de admissão e desligamento.
- Flags `voucherMarketExcluded` e `voucherMealExcluded` para excluir definitivamente do rateio dos vales.
- Funcionários desligados (com `terminationDate`) ainda aparecem em competências antigas, mas não em novas.

### Vale Mercado (`/voucher-market`)
- Uma nota por competência (`@@unique([competence])`).
- Distribuição padrão: **R$ 541,00** por colaborador ativo.
- Status por colaborador: `DEFAULT` (541), `FALTA` (0), `PROPORCIONAL` (valor editável), `EXCLUIDO` (0, fora do rateio).
- Totais derivados: empresa **95%** / colaborador **5%**.

### Vale Refeição — Filial 01 e Filial 02 (`/voucher-meal`)
- Empresa recebe **duas notas por mês**: 2ª quinzena da competência + 1ª quinzena do mês seguinte.
- Linhas tipadas (`VoucherMealLineKind`): almoço colaboradores, terceiros/visitantes/doação (relatório), café/lanche/leite (rateio igual entre colaboradores), serviço especial.
- Filial 02 tem itens próprios: `COFFEE_GENERAL`, `MISC_SODA`, `MISC_MEAL_EVENT`.
- Rateio do almoço: **20% colaborador** / **80% empresa**. Café e lanche são divididos igualmente entre os colaboradores ativos.
- `@@unique([competence, branch])` — uma fatura por filial, por mês.

### Unimed — Plano de Saúde (`/unimed`)
- Lança **usos por procedimento** (`PERSONAL` ou `WORK_ACCIDENT`).
- Acidente de trabalho é 100% empresa; uso pessoal segue regra de coparticipação.
- Cada uso já grava `amountEmployee` e `amountCompany` rateados (auditoria — evita divergência por arredondamento ao recalcular).

### Unimed — Mensalidade (`/unimed-monthly`)
- Mensalidade fixa por vida: `unitValue` × (`dependents + 1`).
- Cabeçalho da NF + alocações por colaborador com quantidade de dependentes.

### Convênios médicos (`/medical-convenios`)
- 4 provedores fixos no enum `MedicalConvenioProvider`: **Laboratório Santa Cruz**, **Centro de Diagnóstico Capão Raso**, **Policlínica Capão Raso**, **Policlínica Mansur**.
- Mesmo modelo de uso da Unimed (procedimento + rateio empresa/colaborador).
- `@@unique([provider, competence])` — uma fatura por provedor, por mês.

### Farmácia (`/pharmacy`)
- Lançamento por colaborador, com cálculo automático do **rateio por centro de custo** para a contabilidade (`PharmacyCostCenterRateio`).

### Lanche (`/snack`)
- Diferente dos demais: organizado por **sessões** (datas de lanche). Cada `SnackSession` tem `totalAmount` e `perPerson`.
- `SnackAttendance` registra quem participou de cada sessão. Total do mês = soma das sessões; rateio também sai por centro de custo.

### Reembolso Escola (`/school-reimbursement`)
- Percentual da empresa fixo em **35%, 50% ou 100%** (`companyPct`) — não aceita valores arbitrários.
- Guarda `courseName` e nota livre.

### Vale Transporte (`/transport-voucher`)
- Alocação por colaborador com valor empresa e valor colaborador.

### Relatórios — Saúde (`/reports`)
- Consolida **Unimed (uso + mensalidade) + 4 convênios médicos** por competência.
- Gera gráficos (recharts) e exportação para conferência mensal.

### Ciclo de fechamento (vale para todas as faturas)
1. Cria-se a fatura/competência em `DRAFT`.
2. Lança-se notas, alocações ou usos.
3. Confere-se `diff` (diferença entre total da NF e soma dos rateios).
4. Fecha-se com status `CLOSED` + `closedAt` — após isso a fatura **não deve ser editada** (cascata `onDelete: Cascade` ainda funciona, mas a UI bloqueia edições).

---

## 🚀 Setup local

### Pré-requisitos
- **Node.js 20+** (alinhado ao `@types/node ^20`)
- **Docker** + **Docker Compose** (para subir MySQL local)
- **npm 9+** (workspaces)

### Instalação

```bash
# 1. Sobe MySQL 8 + Adminer
docker compose up -d

# 2. Instala dependências dos dois workspaces (a partir da raiz!)
npm install

# 3. Cria o arquivo de ambiente da API (ver bloco abaixo)
#    Não há .env.example versionado — crie manualmente.

# 4. Roda as migrations e gera o Prisma Client
npm run prisma:migrate -w api

# 5. (Opcional) popula funcionários iniciais
npm run seed -w api

# 6. Sobe API (3333) e Web (5173) em terminais separados
npm run dev -w api
npm run dev -w web
```

Adminer fica em `http://localhost:8080` (servidor: `mysql`, usuário: `root`, senha: `root`, base: `rh`).

### Variáveis de ambiente

`api/.env`:

```env
# Banco — MySQL 8 do docker-compose (porta 3308 no host!)
DATABASE_URL="mysql://root:root@localhost:3308/rh"

# HTTP
PORT=3333

# CORS — lista separada por vírgula. Use "*" só em dev.
# Em produção, fixe a origem do front (ex: https://rh.empresa.com.br)
CORS_ORIGIN="http://localhost:5173"
```

`web/.env` (opcional — só se a API não for `localhost:3333`):

```env
# URL pública da API consumida pelo axios
VITE_API_URL="http://localhost:3333"
```

### Scripts disponíveis

API (`api/`):
- `npm run dev -w api` — ts-node-dev em modo watch
- `npm run build -w api` — compila para `dist/`
- `npm start -w api` — roda `dist/server.js` (produção)
- `npm run prisma:generate -w api` — regenera Prisma Client
- `npm run prisma:migrate -w api` — cria migration + aplica no banco
- `npm run seed -w api` — popula funcionários iniciais

Web (`web/`):
- `npm run dev -w web` — Vite dev server (5173)
- `npm run build -w web` — build de produção em `web/dist/`
- `npm run preview -w web` — serve o build localmente

---

## 🔥 Banco de dados (MySQL + Prisma)

- **Engine:** MySQL 8.0 (não testado em MariaDB — não use).
- **Charset:** `utf8mb4` (default do MySQL 8). Se você importar um dump antigo em `latin1`, acentuação quebra silenciosamente.
- **Migrations:** `prisma/migrations/` — histórico linear, **não edite migrations já aplicadas**. Para alterar schema: edite `schema.prisma` → `npm run prisma:migrate -w api -- --name minha_alteracao`.
- **Reset em dev:** `npx prisma migrate reset --schema api/prisma/schema.prisma` (apaga o banco inteiro — só use no MySQL local do docker).
- **Cascata:** todas as `Allocation`/`Usage` têm `onDelete: Cascade`. Apagar uma `Invoice` apaga todas as alocações dela. **Não apague faturas `CLOSED` sem confirmar com o RH** — o histórico mensal vai junto.
- **Pegadinha do `@@unique([competence])`:** se você tentar criar duas faturas para o mesmo mês (ex: dois `2026-04-01`), o Prisma falha com `P2002`. Verifique se já não existe DRAFT antes de criar.
- **Pegadinha do Decimal:** todos os valores monetários são `Decimal(12,2)`. No frontend chegam como **string** (`"541.00"`) — sempre converter com `Number()` antes de operações matemáticas, nunca somar como string.
- **Porta do MySQL:** o `docker-compose.yml` expõe **3308** no host (não 3306) para não colidir com instalações locais. O `DATABASE_URL` precisa refletir isso.
- **Erro `P1001` (can't reach database):** geralmente é o container parado. Rode `docker compose ps` e `docker compose up -d` antes de mexer no `DATABASE_URL`.

---

## 📦 Deploy

- **Branch de produção:** `main` (atualmente trabalhando em `master`; merge para `main` antes de publicar).
- **Web:** build estático (`web/dist/`) — publique em qualquer host de SPA (Nginx, Vercel, etc.). Como o roteamento é por **hash** (`#/rota`), não precisa de configuração de fallback `index.html`.
- **API:** Node 20+ rodando `npm run build -w api && npm start -w api`. Precisa de MySQL acessível via `DATABASE_URL`.
- **Variáveis em produção:** configurar `DATABASE_URL`, `PORT`, `CORS_ORIGIN` no host da API e `VITE_API_URL` **em build time** no front (Vite injeta no bundle — não dá para mudar depois sem rebuildar).
- **Migrations:** `npx prisma migrate deploy` antes de subir a nova versão da API. **Não rode `migrate dev` em produção** — ele pode propor reset.
- **Não publicado automaticamente:** `docker-compose.yml` é só dev; `seed.ts` não roda em prod; arquivos `.env` nunca versionados (ver `.gitignore`).

---

## 📝 Convenções de código

- **Idioma:** comentários, mensagens de erro e nomes de UI em **português**. Identificadores de código (modelos, rotas, tipos) em **inglês** — ex: `VoucherMarketAllocation`, `competence`, `invoiceValue`.
- **Tipos compartilhados:** o front em `web/src/api.ts` espelha manualmente os tipos do Prisma. Ao alterar `schema.prisma`, atualize `api.ts` no mesmo PR — não há geração automática.
- **Validação de payload:** usar `zod` em todas as rotas que aceitam body. Não confiar em validação só do front.
- **Decimal:** valores monetários trafegam como **string** entre API↔front. Nunca `parseFloat` cru — perde precisão. Use os helpers em `api/src/lib/` ou converta apenas em totais já consolidados pelo backend.
- **Cálculos críticos (rateio, %):** sempre feitos no **backend** e gravados nas colunas `amountEmployee`/`amountCompany`. O frontend só exibe — não recalcula.
- **CORS:** nunca deixe `CORS_ORIGIN=*` em produção. A API é totalmente aberta (sem auth), então a origem é a única barreira.
- **Não exponha `DATABASE_URL`** no front, em logs ou em respostas da API.
- **Hash routing no front:** ao adicionar página nova, registre em `App.tsx` (tipo `Route`, `getRouteFromHash`, `go`, sidebar e render).

---

## 📧 Contato

Dúvidas, bugs ou sugestões: **gustavo@fgvtn.com.br**
