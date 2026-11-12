# Colocar o MesaFlow no ar

Roteiro para publicar o MesaFlow. Nada aqui foi executado ainda: criar contas, comprar o domínio e colar os segredos são passos seus. Os arquivos de configuração já estão no repositório.

| Parte | Onde (proposta) | Arquivo | Custo aproximado |
|---|---|---|---|
| Frontend (site, painel, cardápio online, página da mesa) | Vercel | `vercel.json` | grátis no começo |
| Backend (API NestJS) | Render, serviço web Node | `render.yaml` | plano Starter, cerca de US$ 7/mês (o plano grátis "dorme" e demora para acordar) |
| Banco e login | Supabase (o projeto de hoje) | — | ver a decisão do plano abaixo |
| Domínio | Registro.br | — | cerca de R$ 40/ano |

Railway, Fly.io ou Cloudflare Pages também servem. Se trocar, use os mesmos comandos de build e as mesmas variáveis.

## Antes de publicar: decisões suas

1. **Plano do Supabase.** No plano grátis, o projeto pausa depois de alguns dias sem uso (aconteceu em 2026-11-11) e não tem backup diário. Para cliente pagante, o recomendado é o plano Pro.
2. **Domínio.** Por exemplo `mesaflow.com.br`, com `app.` para o site e `api.` para a API. Compre o domínio antes de imprimir os QR das mesas: o QR leva o endereço do site, e trocar o domínio depois obriga a reimprimir todos.
3. **Termos e privacidade.** Peça a um advogado para revisar `/termos` e `/privacidade` e preencha os campos entre colchetes (razão social, CNPJ, contato).

## 1. Backend no Render

1. No Render, crie um **Blueprint** apontando para o repositório. Ele lê o `render.yaml`.
2. Escolha a região mais perto da região do projeto Supabase.
3. Preencha os segredos no painel do Render, nunca no Git:

| Variável | Valor |
|---|---|
| `SUPABASE_PUBLISHABLE_KEY` | a mesma do `.env` (é pública) |
| `SUPABASE_SECRET_KEY` | a chave secreta (`sb_secret_...`) |
| `DATABASE_URL` | a do Session pooler, igual à do `.env` |
| `FRONTEND_URL` | o endereço do site, ex.: `https://app.mesaflow.com.br` (mais de um: separe por vírgula) |
| `TRUST_PROXY` | já vem `1` no `render.yaml` (o Render fica na frente da API) |

4. Os comandos já estão no arquivo:
   - build: `npm ci && npm run build:shared && npm run build -w @mesaflow/backend`;
   - start: `node backend/dist/main.js`.
5. Confira: `https://SEU-SERVICO.onrender.com/api/health` deve responder `"status":"ok"` e `"database":"ok"`.
6. Domínio próprio da API: em Settings > Custom Domains, adicione `api.mesaflow.com.br`.

## 2. Frontend na Vercel

1. Importe o repositório na Vercel com a **raiz do repositório** (não a pasta `frontend`). O `vercel.json` já define a instalação, o build, a pasta de saída e o redirecionamento.
2. Em Environment Variables, crie `VITE_API_URL` com o endereço da API mais `/api`, ex.: `https://api.mesaflow.com.br/api`. Ela entra no build, então depois de mudar faça um novo deploy.
3. Domínio: em Settings > Domains, adicione `app.mesaflow.com.br` (ou o domínio principal).
4. O `rewrites` do `vercel.json` manda todo endereço para o app. Sem ele, quem abre direto um link como `/mesa/...`, `/senha?token=...` ou `/loja/...` (pelo QR ou pelo WhatsApp) cai num erro 404.

## 3. Depois do primeiro deploy

1. Atualize `FRONTEND_URL` no Render com o domínio final e reinicie a API.
2. Entre em `/admin/entrar` com o admin da plataforma e cadastre o primeiro restaurante.
3. Gere o link de senha do dono, crie a senha e entre com o código + CPF.
4. Imprima os QR das mesas **já no domínio final** e teste um adesivo impresso com um celular de verdade.
5. Faça um pedido pelo cardápio online no celular e confira se ele chega na Cozinha.

## Checklist de segurança

- [ ] `.env` nunca no Git (o `.gitignore` já cobre).
- [ ] `SUPABASE_SECRET_KEY` só no backend; o frontend só recebe `VITE_API_URL`.
- [ ] No Supabase, ligar a proteção contra senhas vazadas (Authentication > Policies). É o único aviso pendente dos advisors.
- [ ] No Supabase, ajustar o tempo de validade dos links de senha (configuração de expiração do código de login).
- [ ] Backup: no plano Pro é diário. Teste uma restauração antes do primeiro cliente pagante.
