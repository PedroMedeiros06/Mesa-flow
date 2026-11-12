import { Link } from "react-router";
import { Aviso, Marca } from "@/ui/componentes";
import "./acesso.css";

// Sem servidor de e-mail próprio ainda: o link de senha nova sai da tela Equipe, gerado pelo responsável.
export function EsqueciSenha() {
  return (
    <div className="entrar entrar-unica">
      <div className="entrar-form">
        <Marca />
        <div className="entrar-caixa">
          <h1>Esqueci minha senha</h1>
          <Aviso tom="info">
            Peça ao dono ou a quem cuida da equipe um link de senha nova. Ele gera o link na tela Equipe e manda para
            você pelo WhatsApp.
          </Aviso>
          <Link className="entrar-link" to="/entrar">
            Voltar para entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
