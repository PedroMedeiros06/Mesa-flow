import { useState, type FormEvent } from "react";
import { categoryInputSchema, type Category } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, Dialogo, Marcador } from "@/ui/componentes";
import { apiCardapio } from "./api";

/** Criar (categoria = null) ou editar uma categoria. */
export function EditorCategoria({
  categoria,
  aoFechar,
  aoSalvar,
}: {
  categoria: Category | null;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState(categoria?.name ?? "");
  const [ativa, setAtiva] = useState(categoria?.active ?? true);
  const [erroNome, setErroNome] = useState<string>();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const dados = categoryInputSchema.safeParse({ name: nome, active: ativa });
    if (!dados.success) {
      setErroNome(dados.error.issues[0]?.message);
      return;
    }
    setErroNome(undefined);
    setErro(null);
    setEnviando(true);
    try {
      if (categoria) await apiCardapio.editarCategoria(categoria.id, dados.data);
      else await apiCardapio.criarCategoria(dados.data);
      aoSalvar(categoria ? "Categoria salva." : "Categoria criada.");
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
      setEnviando(false);
    }
  }

  async function apagar() {
    if (!categoria) return;
    setEnviando(true);
    try {
      await apiCardapio.apagarCategoria(categoria.id);
      aoSalvar("Categoria apagada.");
    } catch (falha) {
      setConfirmarApagar(false);
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível apagar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={categoria ? "Editar categoria" : "Nova categoria"}>
      <form onSubmit={salvar} noValidate style={{ display: "grid", gap: 16 }}>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Nome"
          placeholder="Ex.: Massas, Bebidas, Sobremesas"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          erro={erroNome}
          autoFocus
        />
        <Marcador
          rotulo="Mostrar no cardápio"
          ajuda="Desmarque para esconder a categoria inteira sem apagar os produtos."
          checked={ativa}
          onChange={(e) => setAtiva(e.target.checked)}
        />
        {confirmarApagar ? (
          <Aviso>
            Apagar a categoria “{categoria?.name}”? Não dá para desfazer.
            <div className="dialogo-acoes" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <Botao variante="claro" pequeno onClick={() => setConfirmarApagar(false)}>
                Manter
              </Botao>
              <Botao variante="perigo" pequeno onClick={apagar} carregando={enviando} textoCarregando="Apagando...">
                Apagar categoria
              </Botao>
            </div>
          </Aviso>
        ) : (
          <div className="dialogo-acoes">
            {categoria && (
              <Botao variante="claro" onClick={() => setConfirmarApagar(true)} style={{ marginRight: "auto" }}>
                Apagar
              </Botao>
            )}
            <Botao variante="claro" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={enviando} textoCarregando="Salvando...">
              {categoria ? "Salvar" : "Criar categoria"}
            </Botao>
          </div>
        )}
      </form>
    </Dialogo>
  );
}
