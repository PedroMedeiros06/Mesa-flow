import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { restaurantLoginSchema } from "@mesaflow/shared";
import { mascaraCpf } from "@/lib/formato";
import { ApiErro } from "@/lib/http";
import { sessao } from "@/lib/sessao";
import { useSessao } from "@/lib/useSessao";
import { Aviso, Botao, Campo, CampoCodigo, Comanda, CorteComanda, Marca } from "@/ui/componentes";
import { codigoGuardado, guardarCodigo } from "./codigo";
import { errosPorCampo, type ErrosCampos } from "./erros";
import "./acesso.css";

type CampoLogin = "companyCode" | "cpf" | "password";


export function Entrar() {
  const atual = useSessao("membro");
  const navegar = useNavigate();
  const local = useLocation();
  const estado = local.state as { de?: string; motivo?: string } | null;
  const destino = estado?.de ?? "/app";

  const [codigo, setCodigo] = useState(codigoGuardado);
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<ErrosCampos<CampoLogin>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(estado?.motivo ?? null);
  const [enviando, setEnviando] = useState(false);

  if (atual) return <Navigate to={destino} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    const dados = { companyCode: codigo, cpf, password: senha };
    const valido = restaurantLoginSchema.safeParse(dados);
    if (!valido.success) {
      setErros(errosPorCampo<CampoLogin>(valido.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await sessao.entrarRestaurante(dados);
      guardarCodigo(valido.data.companyCode);
      navegar(destino, { replace: true });
    } catch (erro) {
      if (erro instanceof ApiErro && erro.issues.length) setErros(errosPorCampo<CampoLogin>(erro.issues));
      setErroGeral(erro instanceof ApiErro ? erro.message : "Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrar">
      <div className="entrar-form">
        <Marca />
        <form onSubmit={entrar} noValidate>
          <div>
            <h1>Entrar no painel</h1>
            <p className="suave" style={{ marginTop: 10 }}>
              Use o código do restaurante, o seu CPF e a sua senha.
            </p>
          </div>

          {erroGeral && <Aviso>{erroGeral}</Aviso>}

          <CampoCodigo
            valor={codigo}
            aoMudar={setCodigo}
            erro={erros.companyCode}
            ajuda="São 6 números. O dono do restaurante recebe o código no cadastro."
          />
          <Campo
            rotulo="CPF"
            name="cpf"
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            erro={erros.cpf}
          />
          <Campo
            rotulo="Senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={erros.password}
          />

          <Botao type="submit" largo carregando={enviando} textoCarregando="Entrando...">
            Entrar
          </Botao>
          <Link className="entrar-link" to="/esqueci-senha">
            Esqueci minha senha
          </Link>
        </form>
      </div>

      <aside className="entrar-lado" aria-hidden="true">
        <blockquote>Sábado, 21h. A mesa 7 pediu a conta e você já sabe o total.</blockquote>
        <Comanda>
          <div className="comanda-linha">
            <span className="suave">Comanda</span>
            <span className="suave">1 h 05 aberta</span>
          </div>
          <p style={{ marginTop: 8 }}>
            <span className="numeral">Mesa 7</span>
          </p>
          <CorteComanda />
          <div className="comanda-linha">
            <span>Subtotal</span>
            <span className="num">R$ 144,45</span>
          </div>
          <div className="comanda-linha">
            <span>Serviço 10%</span>
            <span className="num">R$ 14,45</span>
          </div>
          <CorteComanda />
          <div className="comanda-linha" style={{ fontWeight: 800, fontSize: 20 }}>
            <span>Total</span>
            <span className="num">R$ 158,90</span>
          </div>
        </Comanda>
      </aside>
    </div>
  );
}
