import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { adminLoginSchema } from "@mesaflow/shared";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, Marca } from "@/ui/componentes";
import { errosPorCampo, type ErrosCampos } from "./erros";
import "./acesso.css";

type CampoLogin = "email" | "password";

export function EntrarAdmin() {
  const atual = useSessao("admin");
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<ErrosCampos<CampoLogin>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (atual) return <Navigate to="/admin" replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    const dados = { email: email.trim(), password: senha };
    const valido = adminLoginSchema.safeParse(dados);
    if (!valido.success) {
      setErros(errosPorCampo<CampoLogin>(valido.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await sessao.entrarAdmin(dados);
      navegar("/admin", { replace: true });
    } catch (erro) {
      setErroGeral(erro instanceof ApiErro ? erro.message : "Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrar entrar-unica">
      <div className="entrar-form">
        <Marca />
        <form onSubmit={entrar} noValidate>
          <div>
            <h1>Equipe MesaFlow</h1>
            <p className="suave" style={{ marginTop: 10 }}>
              Área de administração da plataforma.
            </p>
          </div>
          {erroGeral && <Aviso>{erroGeral}</Aviso>}
          <Campo
            rotulo="E-mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            erro={erros.email}
          />
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={erros.password}
          />
          <Botao type="submit" largo carregando={enviando} textoCarregando="Entrando...">
            Entrar
          </Botao>
        </form>
      </div>
    </div>
  );
}
