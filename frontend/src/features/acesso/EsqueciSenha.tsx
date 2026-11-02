import { Link } from "react-router";
import { Aviso, Marca } from "@/ui/componentes";
import "./acesso.css";

// A recuperação por e-mail entra junto com o convite da equipe (etapa 11).
export function EsqueciSenha() {
  return (
    <div className="entrar entrar-unica">
      <div className="entrar-form">
        <Marca />
        <div className="entrar-caixa">
          <h1>Esqueci minha senha</h1>
          <Aviso tom="info">
            A troca de senha por e-mail ainda está sendo preparada. Por enquanto, peça ao dono do restaurante para
            redefinir o seu acesso.
          </Aviso>
          <Link className="entrar-link" to="/entrar">
            Voltar para entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
