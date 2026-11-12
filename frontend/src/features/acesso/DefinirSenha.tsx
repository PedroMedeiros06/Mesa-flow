import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { passwordSchema, type SetPasswordResult } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { Aviso, Botao, Campo, classeBotao, Marca } from "@/ui/componentes";
import { definirSenha } from "../equipe/api";
import "./acesso.css";

/**
 * /senha?token=...: quem foi adicionado à equipe cria a senha aqui, e quem esqueceu troca.
 * O link é gerado na tela Equipe e enviado pelo responsável (WhatsApp, por exemplo).
 */
export function DefinirSenha() {
  const [busca] = useSearchParams();
  const token = busca.get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erros, setErros] = useState<{ senha?: string; repetir?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<SetPasswordResult | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const valida = passwordSchema.safeParse(senha);
    const novos = {
      senha: valida.success ? undefined : valida.error.issues[0]?.message,
      repetir: valida.success && senha !== repetir ? "As senhas não conferem" : undefined,
    };
    setErros(novos);
    if (novos.senha || novos.repetir) return;
    setEnviando(true);
    try {
      setPronto(await definirSenha({ token, password: senha }));
    } catch (falha) {
      setErro(falha instanceof ApiErro ? falha.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrar entrar-unica">
      <div className="entrar-form">
        <Marca />
        {pronto ? (
          <div className="entrar-caixa" role="status">
            <h1>Senha criada</h1>
            <p>
              Pronto, {pronto.name.split(" ")[0]}. Para entrar no painel de {pronto.companyName}, use:
            </p>
            <p className="senha-codigo">
              Código do restaurante <strong className="numeral">{pronto.companyCode}</strong>
            </p>
            <p className="suave">o seu CPF e a senha que você acabou de criar.</p>
            <Link className={classeBotao("primario", { largo: true })} to="/entrar">
              Entrar no painel
            </Link>
          </div>
        ) : !token ? (
          <div className="entrar-caixa">
            <h1>Link incompleto</h1>
            <Aviso>Abra o link inteiro que você recebeu, ou peça um link novo ao responsável pela equipe.</Aviso>
            <Link className="entrar-link" to="/entrar">
              Voltar para entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={salvar} noValidate>
            <div>
              <h1>Crie a sua senha</h1>
              <p className="suave" style={{ marginTop: 10 }}>
                Mínimo de 8 caracteres. Ela é só sua: ninguém do restaurante fica sabendo.
              </p>
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            <Campo
              rotulo="Senha nova"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              erro={erros.senha}
              autoFocus
            />
            <Campo
              rotulo="Repita a senha"
              type="password"
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              erro={erros.repetir}
            />
            <Botao type="submit" largo carregando={enviando} textoCarregando="Salvando...">
              Salvar senha
            </Botao>
          </form>
        )}
      </div>
    </div>
  );
}
