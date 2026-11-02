# MesaFlow: identidade visual (etapa 4)

Status: **aprovado em 2026-11-02**. Os protótipos viraram os componentes de `frontend/src/ui/` (botão, campo, código do restaurante, comanda, etiqueta, aviso, diálogo) e a casca do painel em `frontend/src/features/painel/`. Os tokens ficam em `frontend/src/index.css`.

## Ideia central: a comanda

O objeto que todo restaurante reconhece é a comanda de papel que sai da impressora. Ela é o único elemento ousado do sistema: papel claro, linha de corte tracejada e borda serrilhada embaixo. Aparece onde o conteúdo realmente é uma comanda:

- o pedido na cozinha;
- a conta da mesa;
- o resumo do dia;
- a animação do site.

O resto da interface fica quieto: fundo liso, tipografia forte e cor só onde ela carrega informação.

## Cores

Sempre quentes. Creme no tema claro, preto no tema escuro.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--fundo` | `#fcf3e3` creme | `#000000` preto | fundo da página |
| `--papel` | `#fffbf3` | `#15110d` | comandas, cartões, campos |
| `--tinta` | `#1b130c` | `#fbebd3` | texto principal |
| `--tinta-2` | `#6a5541` | `#b8a48a` | texto de apoio |
| `--laranja` | `#f26a11` | `#ff7a26` | ação principal, item ativo, pedido novo, mesa ocupada |
| `--ambar` (amarelo-alaranjado) | `#ffa51f` | `#ffb43d` | em preparo, mesa que pediu a conta, hora atual |
| `--brasa` (vermelho-alaranjado) | `#ec4a1c` | `#ff5a30` | atrasado, esperando atendimento, observação do item, erro |
| `--feito` | `#1b130c` | `#fbebd3` | pronto e pago (tinta invertida) |
| `--trilho` | `#1b130c` | `#0c0906` | barra lateral do painel |

Regras:

- Texto sobre laranja, âmbar ou brasa é **sempre escuro** (`#1b130c`), nos dois temas. Esse é o principal contraste da marca e evita o "branco sobre laranja" comum.
- Quando a cor é o próprio texto (links, observações), usamos as versões escurecidas `--laranja-texto` e `--brasa-texto`.
- **Nenhum status depende só da cor.** Cada status tem nome escrito e ícone, e o desenho muda entre eles. Por exemplo, a mesa livre tem contorno tracejado, a ocupada tem borda e a que pediu a conta é preenchida. Assim continua legível para quem não distingue cores e quando a tela está em escala de cinza.

### Contraste (WCAG)

| Par | Claro | Escuro |
|---|---|---|
| tinta / fundo | 16,6 | 17,9 |
| tinta-2 / fundo | 6,4 | 8,7 |
| tinta-2 / papel-2 | 5,7 | 7,1 |
| laranja-texto / papel | 5,8 | 9,0 |
| brasa-texto / papel | 6,2 | 7,3 |
| texto escuro / laranja | 6,0 | 7,0 |
| texto escuro / âmbar | 9,3 | 10,4 |
| texto escuro / brasa | 4,9 | 5,9 |
| menu apagado / trilho | 8,0 | 6,9 |
| laranja / trilho | 6,0 | 7,6 |

Todos os pares passam de 4,5:1, o mínimo para texto pequeno. O laranja sobre o creme dá 2,8:1, por isso **nunca é usado como texto**, só como preenchimento ou borda acompanhada de rótulo.

## Tipografia

- **Bricolage Grotesque** (títulos e números). Usa o eixo de largura: estreita (75–85%) e pesada (800) para números de mesa, de pedido e valores. É o que dá a cara de "letreiro de comanda".
- **Manrope** (texto, rótulos, botões), de 400 a 800.
- Escala de 1,25 (`--t-xs` a `--t-6xl`). Números sempre tabulares (`.num`).
- Sem caixa-alta em rótulos e sem fonte monoespaçada.

## Layout

- **Site:** alinhado à esquerda. O título grande divide a tela com a comanda saindo da impressora, que é a única animação do produto (respeita "reduzir movimento"). As quatro áreas (Salão, Balcão, Cozinha, Vitrine) aparecem como lista separada por linha de corte, não como cartões iguais.
- **Painel:**
  - no computador, barra lateral escura com o restaurante e o código no topo;
  - no celular, barra de abas embaixo com Início, Mesas, Balcão, Cozinha e Mais.
- **Mesas:** grade de números grandes, com a comanda da mesa selecionada ao lado (no celular, embaixo).
- **Cozinha:** três colunas (Novos, Em preparo, Prontos). Cada pedido é uma comanda com uma faixa colorida de status.
- **Vitrine:** pensada para o celular. Topo laranja com o nome do restaurante, categorias fixas e a sacola sempre visível embaixo.
- Cantos: 6 px nas comandas, 12 px em campos e botões, 22 px em blocos grandes. Os raios mudam de propósito conforme a hierarquia.

## Decisões para aprovar

1. **Cor de "pronto" e "pago".** Não usamos verde, porque é cor fria. Pronto e pago usam a tinta invertida (preto no claro, creme no escuro) com ícone de ✓. Alternativa: um verde-oliva quente.
2. **Texto escuro sobre o laranja** nos botões, em vez de texto branco.
3. **Barra lateral escura também no tema claro.**
4. **A comanda como elemento de assinatura** (borda serrilhada, linha tracejada).
5. **Planos e preços do site:** os valores na tela são provisórios.
