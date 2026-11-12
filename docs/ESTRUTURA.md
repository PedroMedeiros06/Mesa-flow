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
| `/termos`, `/privacidade` | qualquer pessoa | termos de uso e política de privacidade (LGPD). **Texto-base para revisão jurídica**, com campos entre colchetes para os dados da empresa |
| `/mesa/:token` | cliente sentado à mesa, pelo QR | vê a conta aberta da mesa (tempo, quem atendeu, pedidos com andamento, total) e chama o garçom |

### Acesso
| Rota | O que faz |
|---|---|
| `/entrar` | login do restaurante (código + CPF + senha) |
| `/esqueci-senha` | orienta a pedir um link de senha nova ao responsável pela equipe (sem e-mail por enquanto) |
| `/senha?token=` | quem recebeu o link (cadastro novo ou senha esquecida) cria a senha; vale uma vez |
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
| `/admin` | abre a lista de restaurantes (a visão geral com inadimplentes vem junto da cobrança) |
| `/admin/restaurantes` | cadastro assistido (restaurante + dono, código sorteado), bloqueio com motivo, link de senha do dono, uso nos últimos 30 dias |
| `/admin/restaurantes/:id` | detalhe: plano, faturas, equipe, uso |
| `/admin/cobranca` | faturas do mês, marcar pagamento, inadimplência |

## 4. Módulos do backend

| Módulo | Responsabilidade |
|---|---|
| `health` | saúde da API e do banco |
| `auth` | login, sessão, convite, recuperação de senha |
| `companies` | dados do restaurante (tela Ajustes: nome, WhatsApp do cardápio online, razão social, CNPJ/CPF). A taxa de serviço padrão por restaurante precisa de migração e ainda não existe: toda mesa abre com 10% |
| `members` | equipe, permissões, bloqueio e link de senha (gerado sem e-mail, enviado pelo dono) |
| `catalog` | categorias, produtos, adicionais, fotos, descontos |
| `stock` | ingredientes, ficha técnica, movimentações |
| `orders` | pedidos de balcão e da vitrine, status, cancelamento |
| `tabs` | mesas, comandas, pagamentos parciais, divisão da conta |
| `storefront` | rotas públicas da vitrine |
| `table-qr` | QR fixo de cada mesa, página pública da mesa e chamado do garçom |
| `dashboard` | números agregados no banco |
| `admin` | rotas da equipe MesaFlow: restaurantes (feito). Substitui o script `seed:restaurante` |
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
| 9 | **Comandas e mesas**: cada rodada é um pedido que passa pela cozinha; cancelar item (estoque volta só se a cozinha não começou), transferir rodada, juntar mesas, taxa de serviço de 10% (pode ser tirada), pagamentos parciais com divisão por pessoas, fechar só com a conta paga e reabrir com motivo | dois garçons na mesma mesa mantêm o total certo |
| 9.1 | **QR da mesa e chamado do garçom**: um QR fixo por mesa (token aleatório; trocar invalida o adesivo antigo, permissão `company.manage`); o cliente vê só a comanda aberta da mesa, sem dados internos; "chamar o garçom" com espera de 1 minuto no servidor; o chamado vai para todos que veem as mesas, com faixa em qualquer tela do painel, som e vibração (onde o navegador deixa) | cliente acompanha a mesa pelo celular e o chamado chega ao salão |
| 9.2 | **Equipe e senha**: cadastrar funcionário (nome, CPF, e-mail, permissões), editar permissões, bloquear e desbloquear, e gerar o link de senha que o responsável manda pelo WhatsApp. Ninguém mexe no dono nem no próprio acesso, e só se dá ou tira permissão que a própria pessoa tem. O link sai do Supabase Auth sem enviar e-mail (`generate_link`) | dono cadastra o garçom e o garçom entra sem ajuda técnica |
| 10 | **Dashboard** (tela Início, permissão `reports.view`): vendido no dia, ticket médio, mesas abertas agora, fila da cozinha, vendas por origem, mais vendidos e últimos 7 dias. **(proposta)** Conta como venda o pedido de balcão ou da vitrine não cancelado (pelo dia do pedido) e a comanda fechada no dia (pelo total congelado, com taxa); rodada de mesa não soma sozinha, para a mesa não contar duas vezes. "Hoje" é no fuso de São Paulo | números batem com o cenário de teste (balcão com desconto, cancelado, vitrine, mesa fechada com item cancelado e mesa aberta) |
| 11 | **Admin + cobrança manual**. Parte de restaurantes pronta (cadastro, bloqueio, link do dono). Cobrança (assinaturas e faturas) precisa de tabelas novas: migração só com autorização | cadastro do restaurante até o primeiro pedido sem ajuda técnica |

Cada etapa vira um ou mais commits e é mostrada antes de começar a próxima.

## 6. O que fica fora por enquanto

Delivery com endereço e taxa, Asaas automatizado, divisão da conta por item, app instalável (PWA), várias unidades por restaurante.
