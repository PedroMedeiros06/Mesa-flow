import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_ADDONS,
  MAX_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  moneyToInput,
  parseMoney,
  parseQuantity,
  quantityToInput,
  productInputSchema,
  type Category,
  type IngredientOption,
  type Product,
} from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, CampoArea, Dialogo, Marcador, Seletor } from "@/ui/componentes";
import { Icone } from "@/ui/Icone";
import { apiCardapio } from "./api";

interface AdicionalForm {
  chave: string;
  nome: string;
  preco: string;
  ativo: boolean;
}

interface ItemFicha {
  chave: string;
  ingredienteId: string;
  quantidade: string;
  removivel: boolean;
}

let chaves = 0;
const novaChave = () => `a${++chaves}`;

/** Criar (produto = null) ou editar um produto, com adicionais e fotos. */
export function EditorProduto({
  produto: inicial,
  categorias,
  categoriaInicial,
  aoFechar,
  aoSalvar,
}: {
  produto: Product | null;
  categorias: Category[];
  categoriaInicial?: string;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  // Depois de criar, o editor continua aberto no produto novo para receber fotos.
  const [produto, setProduto] = useState(inicial);
  const [categoriaId, setCategoriaId] = useState(inicial?.categoryId ?? categoriaInicial ?? categorias[0]?.id ?? "");
  const [nome, setNome] = useState(inicial?.name ?? "");
  const [descricao, setDescricao] = useState(inicial?.description ?? "");
  const [preco, setPreco] = useState(inicial ? moneyToInput(inicial.priceCents) : "");
  const [ativo, setAtivo] = useState(inicial?.active ?? true);
  const [adicionais, setAdicionais] = useState<AdicionalForm[]>(
    (inicial?.addons ?? []).map((a) => ({ chave: novaChave(), nome: a.name, preco: moneyToInput(a.priceCents), ativo: a.active })),
  );
  const [ficha, setFicha] = useState<ItemFicha[]>(
    (inicial?.recipe ?? []).map((r) => ({
      chave: novaChave(),
      ingredienteId: r.ingredientId,
      quantidade: quantityToInput(r.quantityMilli),
      removivel: r.removable,
    })),
  );
  // null = ainda carregando (ou falhou): aí a ficha não é enviada e o servidor mantém a atual.
  const [opcoes, setOpcoes] = useState<IngredientOption[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiCardapio.opcoesIngredientes().then(setOpcoes, () => setOpcoes(null));
  }, []);

  function montar() {
    const errosLocais: Record<string, string> = {};
    const priceCents = parseMoney(preco);
    if (priceCents === null) errosLocais.priceCents = preco.trim() ? "Preço inválido. Use, por exemplo, 12,50" : "Informe o preço";
    const addons = adicionais.map((a, i) => {
      const p = parseMoney(a.preco || "0");
      if (p === null) errosLocais[`addons.${i}.priceCents`] = "Preço inválido";
      return { name: a.nome, priceCents: p ?? 0, active: a.ativo };
    });
    const recipe = opcoes
      ? ficha.map((f, i) => {
          const q = parseQuantity(f.quantidade);
          if (q === null || q === 0) errosLocais[`recipe.${i}.quantityMilli`] = f.quantidade.trim() ? "Quantidade inválida" : "Informe a quantidade";
          return { ingredientId: f.ingredienteId, quantityMilli: q ?? 0, removable: f.removivel };
        })
      : undefined;
    const dados = productInputSchema.safeParse({
      categoryId: categoriaId,
      name: nome,
      description: descricao,
      priceCents: priceCents ?? 0,
      active: ativo,
      addons,
      recipe,
    });
    if (!dados.success) {
      for (const i of dados.error.issues) errosLocais[i.path.join(".")] ??= i.message;
    }
    return { dados: dados.success ? dados.data : null, errosLocais };
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const { dados, errosLocais } = montar();
    setErros(errosLocais);
    if (!dados || Object.keys(errosLocais).length) return;
    setErro(null);
    setEnviando(true);
    try {
      if (produto) {
        await apiCardapio.editarProduto(produto.id, dados);
        aoSalvar("Produto salvo.");
      } else {
        setProduto(await apiCardapio.criarProduto(dados));
        setEnviando(false);
        setErro(null);
      }
    } catch (falha) {
      if (falha instanceof ApiErro && falha.issues.length) {
        setErros(Object.fromEntries(falha.issues.map((i) => [i.path, i.message])));
      }
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
      setEnviando(false);
    }
  }

  async function enviarFoto(arquivoEscolhido: File | undefined) {
    if (!arquivoEscolhido || !produto) return;
    if (arquivoEscolhido.size > MAX_IMAGE_BYTES) {
      setErro(`A foto passa de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Envie uma menor.`);
      return;
    }
    setErro(null);
    setEnviandoFoto(true);
    try {
      setProduto(await apiCardapio.enviarFoto(produto.id, arquivoEscolhido));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  async function apagarFoto(fotoId: string) {
    if (!produto) return;
    try {
      setProduto(await apiCardapio.apagarFoto(produto.id, fotoId));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível apagar a foto.");
    }
  }

  async function apagar() {
    if (!produto) return;
    setEnviando(true);
    try {
      await apiCardapio.apagarProduto(produto.id);
      aoSalvar("Produto apagado.");
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível apagar.");
      setConfirmarApagar(false);
      setEnviando(false);
    }
  }

  const mudarFicha = (chave: string, campo: Partial<ItemFicha>) =>
    setFicha((lista) => lista.map((f) => (f.chave === chave ? { ...f, ...campo } : f)));
  const unidadeDe = (id: string) => opcoes?.find((o) => o.id === id)?.unit ?? "";
  const livres = (opcoes ?? []).filter((o) => !ficha.some((f) => f.ingredienteId === o.id));

  const mudarAdicional = (chave: string, campo: Partial<AdicionalForm>) =>
    setAdicionais((lista) => lista.map((a) => (a.chave === chave ? { ...a, ...campo } : a)));

  const recemCriado = produto && !inicial;

  return (
    <Dialogo
      aberto
      largo
      aoFechar={() => (recemCriado ? aoSalvar("Produto criado.") : aoFechar())}
      titulo={produto ? (recemCriado ? "Produto criado" : "Editar produto") : "Novo produto"}
    >
      <form onSubmit={salvar} noValidate className="editor-produto">
        {erro && <Aviso>{erro}</Aviso>}
        {recemCriado && <Aviso tom="info">Produto criado. Agora você pode adicionar fotos.</Aviso>}

        <div className="editor-grade">
          <Seletor rotulo="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} erro={erros.categoryId}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Seletor>
          <Campo
            rotulo="Preço"
            inputMode="decimal"
            placeholder="0,00"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            onBlur={() => {
              const p = parseMoney(preco);
              if (p !== null) setPreco(moneyToInput(p));
            }}
            erro={erros.priceCents}
            ajuda="Em reais, ex.: 42,90"
          />
        </div>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} placeholder="Ex.: Lasanha bolonhesa" />
        <CampoArea
          rotulo="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          erro={erros.description}
          placeholder="O que vem no prato, tamanho, para quantas pessoas"
          maxLength={300}
        />
        <Marcador
          rotulo="Disponível para venda"
          ajuda="Desmarque quando acabar: o produto some da vitrine e do balcão, mas continua salvo."
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
        />

        <fieldset className="editor-bloco">
          <legend>Adicionais</legend>
          <p className="campo-ajuda">Itens que o cliente pode pedir a mais, como queijo extra ou bacon.</p>
          {adicionais.map((a, i) => (
            <div className="adicional" key={a.chave}>
              <Campo
                rotulo={`Adicional ${i + 1}`}
                value={a.nome}
                onChange={(e) => mudarAdicional(a.chave, { nome: e.target.value })}
                erro={erros[`addons.${i}.name`]}
                placeholder="Ex.: Queijo extra"
              />
              <Campo
                rotulo="Preço"
                inputMode="decimal"
                placeholder="0,00"
                value={a.preco}
                onChange={(e) => mudarAdicional(a.chave, { preco: e.target.value })}
                erro={erros[`addons.${i}.priceCents`]}
              />
              <button
                type="button"
                className="icone-btn"
                aria-label={`Remover adicional ${a.nome || i + 1}`}
                onClick={() => setAdicionais((lista) => lista.filter((x) => x.chave !== a.chave))}
              >
                <Icone nome="fechar" />
              </button>
            </div>
          ))}
          {adicionais.length < MAX_ADDONS && (
            <Botao
              variante="claro"
              pequeno
              icone="mais"
              onClick={() => setAdicionais((l) => [...l, { chave: novaChave(), nome: "", preco: "", ativo: true }])}
            >
              Adicionar adicional
            </Botao>
          )}
        </fieldset>

        <fieldset className="editor-bloco">
          <legend>Ficha técnica</legend>
          <p className="campo-ajuda">
            Quanto de cada ingrediente sai do estoque a cada unidade vendida. Marque “cliente pode tirar” para permitir
            pedidos como “sem cebola”.
          </p>
          {erros.recipe && <span className="campo-erro">{erros.recipe}</span>}
          {opcoes === null && <p className="suave">Carregando ingredientes...</p>}
          {opcoes?.length === 0 && (
            <p className="suave">Nenhum ingrediente cadastrado. Cadastre em Estoque para montar a ficha técnica.</p>
          )}
          {opcoes &&
            ficha.map((f, i) => {
              const nome = opcoes.find((o) => o.id === f.ingredienteId)?.name ?? "";
              return (
                <div className="ficha-item" key={f.chave}>
                  <Seletor
                    rotulo={`Ingrediente ${i + 1}`}
                    value={f.ingredienteId}
                    onChange={(e) => mudarFicha(f.chave, { ingredienteId: e.target.value })}
                  >
                    {opcoes
                      .filter((o) => o.id === f.ingredienteId || !ficha.some((x) => x.ingredienteId === o.id))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </Seletor>
                  <Campo
                    rotulo={`Quantidade (${unidadeDe(f.ingredienteId)})`}
                    inputMode="decimal"
                    placeholder="0"
                    value={f.quantidade}
                    onChange={(e) => mudarFicha(f.chave, { quantidade: e.target.value })}
                    erro={erros[`recipe.${i}.quantityMilli`]}
                  />
                  <button
                    type="button"
                    className="icone-btn"
                    aria-label={`Tirar ${nome || "ingrediente"} da ficha`}
                    onClick={() => setFicha((lista) => lista.filter((x) => x.chave !== f.chave))}
                  >
                    <Icone nome="fechar" />
                  </button>
                  <Marcador
                    rotulo="Cliente pode tirar"
                    checked={f.removivel}
                    onChange={(e) => mudarFicha(f.chave, { removivel: e.target.checked })}
                  />
                </div>
              );
            })}
          {opcoes && livres.length > 0 && (
            <Botao
              variante="claro"
              pequeno
              icone="mais"
              onClick={() =>
                setFicha((l) => [...l, { chave: novaChave(), ingredienteId: livres[0]!.id, quantidade: "", removivel: false }])
              }
            >
              Adicionar ingrediente
            </Botao>
          )}
        </fieldset>

        <fieldset className="editor-bloco">
          <legend>Fotos</legend>
          {!produto ? (
            <p className="campo-ajuda">Crie o produto primeiro; depois você adiciona até {MAX_PRODUCT_IMAGES} fotos.</p>
          ) : (
            <>
              <div className="fotos">
                {produto.images.map((f, i) => (
                  <figure key={f.id}>
                    <img src={f.url} alt={`Foto ${i + 1} de ${produto.name}`} />
                    <button type="button" className="icone-btn" aria-label={`Apagar foto ${i + 1}`} onClick={() => apagarFoto(f.id)}>
                      <Icone nome="fechar" />
                    </button>
                  </figure>
                ))}
                {produto.images.length < MAX_PRODUCT_IMAGES && (
                  <label className="foto-nova" aria-busy={enviandoFoto || undefined}>
                    <input
                      ref={arquivo}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="so-leitor"
                      onChange={(e) => enviarFoto(e.target.files?.[0])}
                      disabled={enviandoFoto}
                    />
                    {enviandoFoto ? <span className="giro" aria-hidden="true" /> : <Icone nome="mais" />}
                    {enviandoFoto ? "Enviando..." : "Adicionar foto"}
                  </label>
                )}
              </div>
              <p className="campo-ajuda">JPG, PNG ou WEBP, até 3 MB. A primeira foto aparece na vitrine.</p>
            </>
          )}
        </fieldset>

        {confirmarApagar ? (
          <Aviso>
            Apagar “{produto?.name}” e as fotos dele? Não dá para desfazer.
            <div className="dialogo-acoes" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <Botao variante="claro" pequeno onClick={() => setConfirmarApagar(false)}>
                Manter
              </Botao>
              <Botao variante="perigo" pequeno onClick={apagar} carregando={enviando} textoCarregando="Apagando...">
                Apagar produto
              </Botao>
            </div>
          </Aviso>
        ) : (
          <div className="dialogo-acoes">
            {produto && (
              <Botao variante="claro" onClick={() => setConfirmarApagar(true)} style={{ marginRight: "auto" }}>
                Apagar
              </Botao>
            )}
            <Botao variante="claro" onClick={() => (recemCriado ? aoSalvar("Produto criado.") : aoFechar())}>
              {recemCriado ? "Fechar" : "Cancelar"}
            </Botao>
            <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
              {produto ? "Salvar" : "Criar produto"}
            </Botao>
          </div>
        )}
      </form>
    </Dialogo>
  );
}
