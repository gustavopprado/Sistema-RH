# RH — Gestão de Funcionários (MVP)

MVP para **cadastro/edição**, **demissão (data)** e **listagem com filtros**.

## Requisitos
- Node 18+
- Docker (recomendado para subir MySQL)

## 1) Subir banco (MySQL + Adminer)
Na raiz do projeto:
```bash
docker compose up -d
```

Adminer: http://localhost:8080  
- Sistema: MySQL
- Servidor: mysql
- Usuário: root
- Senha: root
- Base: rh

## 2) API
```bash
cd api
cp .env.example .env
npm i
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

API: http://localhost:3333  
Health: http://localhost:3333/health

### Endpoints principais
- `GET /employees?status=active|inactive|all&search=&branch=&costCenter=&page=&pageSize=`
- `POST /employees`
- `PUT /employees/:id` (não altera matrícula)
- `PATCH /employees/:id/terminate`
- `PATCH /employees/:id/reactivate`

## Observações
- O seed usa `api/data/funcionarios.json`.