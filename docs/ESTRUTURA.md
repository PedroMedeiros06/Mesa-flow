# MesaFlow — Estrutura do projeto

Documento de partida do repositório novo. O código é escrito do zero; o projeto antigo (`Pedidos_App` + `backend/`) serve só como referência de regras e de visual.

> Escolhas marcadas com **(proposta)** foram feitas pelo Claude e podem ser trocadas.

## 1. Decisões já tomadas

- Um repositório só, com `frontend/`, `backend/` e `shared/`.
- Frontend: React + Vite + TypeScript.
- Visual: **mudança total**, criado do zero com as skills de design numa etapa própria (etapa 4). Nada do visual antigo é herdado automaticamente. Paleta obrigatória, sempre quente: creme no tema claro, preto no tema escuro, laranja, amarelo-alaranjado e vermelho-alaranjado. Nada de cores frias na marca.
- Backend: NestJS + TypeScript, acesso ao Postgres com **Drizzle** e transações nas operações de pedido, estoque e pagamento.
- Banco e login: o mesmo projeto Supabase de hoje. O login usa o Supabase Auth. O schema será recriado do zero; **apagar as tabelas antigas só depois de autorização explícita**.
- Migrações versionadas no repositório desde o primeiro commit.
- Construção em etapas pequenas: cada etapa fecha só quando compila, tem teste da lógica nova e foi conferida rodando.

Decisões de negócio herdadas do planejamento anterior (continuam valendo até você dizer o contrário):
- venda assistida (o admin cadastra o restaurante);
- comandas por mesa;
- cobrança manual primeiro, Asaas depois.

## 2. Pastas

```
MesaFlow/
├─ package.json            # npm workspaces + scripts gerais (typecheck, test, build, dev)
├─ tsconfig.base.json      # regras de TypeScript comuns
├─ .env.example            # variáveis necessárias (sem valores reais)
├─ docs/                   # este documento, decisões, relatórios
├─ shared/                 # @mesaflow/shared — usado pelo front e pelo back
│  └─ src/
│     ├─ permissions.ts    # lista única de permissões (ex.: "orders.create")
│     ├─ schemas/          # validação zod: pedido, produto, membro...
│     ├─ money.ts          # dinheiro sempre em centavos (inteiro)
│     └─ index.ts
├─ backend/                # @mesaflow/backend — API NestJS
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ app.module.ts
│  │  ├─ db/               # conexão Drizzle + schema das tabelas
│  │  ├─ auth/             # guards, sessão, permissões
│  │  └─ modules/          # um módulo por domínio (ver seção 4)
│  └─ drizzle/             # migrações SQL geradas e revisadas
└─ frontend/               # @mesaflow/frontend — app React
   └─ src/
      ├─ main.tsx
      ├─ app/              # rotas, layouts, proteção de rota
      ├─ ui/               # componentes visuais base (botão, input, modal...)
      ├─ lib/              # api, sessão, formatação
      └─ features/         # uma pasta por área (ver seção 3)
```

**(proposta)** O `shared` é compilado para JavaScript antes do backend, para o Node conseguir importar em produção (não basta o `tsc` passar).
**(proposta)** TypeScript 5.9 em todo o repositório: o NestJS depende de `emitDecoratorMetadata`, e a versão 5.x mantém o ESLint com tipos funcionando.

## 3. Mapa do site (frontend)

### Público
| Rota | Para quem | O que faz |
|---|---|---|
| `/` | dono de restaurante interessado | apresenta o produto, planos, contato via WhatsApp |
| `/loja/:codigo` | cliente final, no celular | cardápio do restaurante, carrinho, pedido para retirada |
| `/loja/:codigo/pedido/:id` | cliente final | acompanha o status do pedido |

### Acesso
| Rota | O que faz |
|---|---|
| `/entrar` | login do restaurante (código + CPF + senha) |
| `/esqueci-senha`, `/redefinir-senha` | recuperação por e-mail |
| `/convite` | dono ou funcionário define a senha no primeiro acesso |
| `/admin/entrar` | login da equipe MesaFlow |

### Painel do restaurante (`/app`)
| Rota | Aparelho principal | O que faz |
|---|---|---|
| `/app` | computador | resumo do dia: vendas, ticket médio, pedidos abertos, mais vendidos |
| `/app/mesas` | tablet / celular do garçom | mapa de mesas, abrir comanda, lançar rodada, fechar conta |
| `/app/balcao` | computador do caixa | PDV para pedido de balcão |
| `/app/cozinha` | tela na cozinha | fila de pedidos por status, com som e impressão |
| `/app/pedidos` | computador | histórico e busca de pedidos |
| `/app/cardapio` | computador | produtos, categorias, adicionais, fotos, descontos |
| `/app/estoque` | computador | ingredientes, ficha técnica, ajustes |
| `/app/equipe` | computador | funcionários e permissões |
| `/app/ajustes` | computador | dados do restaurante, taxa de serviço, vitrine, histórico de alterações |

### Admin da plataforma (`/admin`)
| Rota | O que faz |
|---|---|
| `/admin` | visão geral: restaurantes ativos, inadimplentes, saúde do sistema |
| `/admin/restaurantes` | cadastro assistido, bloqueio, convite ao dono |
| `/admin/restaurantes/:id` | detalhe: plano, faturas, equipe, uso |
| `/admin/cobranca` | faturas do mês, marcar pagamento, inadimplência |

## 4. Módulos do backend

| Módulo | Responsabilidade |
|---|---|
| `health` | saúde da API e do banco |
| `auth` | login, sessão, convite, recuperação de senha |
| `companies` | restaurante, configurações, plano |
| `members` | equipe e permissões |
| `catalog` | categorias, produtos, adicionais, fotos, descontos |
| `stock` | ingredientes, ficha técnica, movimentações |
| `orders` | pedidos de balcão e da vitrine, status, cancelamento |
| `tabs` | mesas, comandas, pagamentos parciais, divisão da conta |
| `storefront` | rotas públicas da vitrine |
| `dashboard` | números agregados no banco |
| `admin` | rotas da equipe MesaFlow |
| `billing` | assinaturas e faturas (manual; Asaas depois) |
| `audit` | registro de quem fez o quê |

Regras transversais:
- toda consulta filtra por `company_id`, tirado da sessão e nunca do corpo da requisição;
- dinheiro sempre em centavos;
- operações que gravam em várias tabelas rodam numa transação só;
- pedidos e pagamentos levam um `client_request_id` para não duplicar com clique duplo.

## 5. Ordem das etapas

| # | Etapa | Pronto quando |
|---|---|---|
| 1 | **Esqueleto**: workspaces, `shared`, Nest com `/health`, Vite exibindo o `/health` | `typecheck`, `test` e `build` passam na raiz; `node backend/dist/main.js` sobe e a página mostra o status |
| 2 | **Banco**: Drizzle conectado, primeira migração (empresas, membros, permissões) | migração aplicada (com sua autorização), `/health` confirma o banco |
| 3 | **Login e sessão** do restaurante e do admin, permissões vindas do `shared` | teste: sem permissão = 403; empresa A não lê dado da empresa B |
| 4 | **Identidade visual**: direção de design (cores, tipografia, layout), protótipos das telas principais para você aprovar, depois componentes base e casca do painel | você aprova os protótipos; navegação completa no desktop e no celular (390 px) |
| 5 | **Cardápio** (categorias, produtos, adicionais, até 4 fotos por produto). Descontos e preço promocional ficam para a etapa 7 (cálculo do pedido); "sem cebola" vem com a ficha técnica na etapa 6 | CRUD testado de ponta a ponta |
| 6 | **Estoque** (ingredientes, ficha técnica) | baixa e estorno exatos em teste |
| 7 | **Pedidos**: balcão + cozinha + lista do dia. Inclui preço promocional no produto e desconto no pedido (permissão `orders.discount`). Sem estoque, o pedido é recusado | 20 pedidos simultâneos deixam o estoque exato |
| 8 | **Vitrine** pública | pedido do celular aparece na cozinha |
| 9 | **Comandas e mesas** | dois garçons na mesma mesa mantêm o total certo |
| 10 | **Dashboard** | números batem com consulta SQL de referência |
| 11 | **Admin + cobrança manual** | cadastro do restaurante até o primeiro pedido sem ajuda técnica |

Cada etapa vira um ou mais commits e é mostrada antes de começar a próxima.

## 6. O que fica fora por enquanto

Delivery com endereço e taxa, Asaas automatizado, divisão da conta por item, app instalável (PWA), várias unidades por restaurante.
