# MesaFlow

Sistema para restaurantes: mesas e comandas, balcão, cozinha, cardápio, estoque e vitrine online.

## Estrutura

- `shared/` — tipos, permissões e validações usados pelo front e pelo back (`@mesaflow/shared`)
- `backend/` — API NestJS (`@mesaflow/backend`)
- `frontend/` — app React + Vite (`@mesaflow/frontend`)
- `docs/` — estrutura do projeto e decisões (`docs/ESTRUTURA.md`)

## Rodando

Requer Node 22 ou superior.

```bash
npm install
cp .env.example .env
npm run dev:backend    # API em http://localhost:3000/api
npm run dev:frontend   # site em http://localhost:5173
```

## Verificação

```bash
npm run check   # typecheck + testes + build de todos os pacotes
```
