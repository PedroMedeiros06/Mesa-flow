import { useState } from "react";

export function Entrar() {
  const [codigo, setCodigo] = useState("48");

  return (
    <div className="entrar">
      <div className="entrar-form">
        <a className="marca" href="/prototipo/inicio">
          <span className="marca-selo" aria-hidden="true" />
          MesaFlow
        </a>
        <form onSubmit={(e) => e.preventDefault()}>
          <div>
            <h1>Entrar no painel</h1>
            <p className="suave" style={{ marginTop: 10 }}>
              Use o código do restaurante, o seu CPF e a sua senha.
            </p>
          </div>

          <div className="campo">
            <label htmlFor="codigo">Código do restaurante</label>
            <div className="codigo">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} aria-hidden="true" data-atual={i === codigo.length ? "" : undefined}>
                  {codigo[i] ?? ""}
                </span>
              ))}
              <input
                id="codigo"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-describedby="codigo-ajuda"
              />
            </div>
            <span className="ajuda" id="codigo-ajuda">
              São 6 números. O dono do restaurante encontra o código em Ajustes.
            </span>
          </div>

          <div className="campo">
            <label htmlFor="cpf">CPF</label>
            <input id="cpf" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" />
          </div>

          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" autoComplete="current-password" />
          </div>

          <button className="btn btn-primario" type="submit">
            Entrar
          </button>
          <a className="entrar-link" href="#esqueci">
            Esqueci minha senha
          </a>
        </form>
      </div>

      <aside className="entrar-lado" aria-hidden="true">
        <blockquote>Sábado, 21h. A mesa 7 pediu a conta e você já sabe o total.</blockquote>
        <div className="ticket">
          <div className="ticket-linha">
            <span className="suave">Comanda</span>
            <span className="suave">1 h 05 aberta</span>
          </div>
          <p style={{ marginTop: 8 }}>
            <span className="numeral">Mesa 7</span>
          </p>
          <hr className="ticket-corte" />
          <div className="ticket-linha">
            <span>Subtotal</span>
            <span className="num">R$ 144,45</span>
          </div>
          <div className="ticket-linha">
            <span>Serviço 10%</span>
            <span className="num">R$ 14,45</span>
          </div>
          <hr className="ticket-corte" />
          <div className="ticket-linha" style={{ fontWeight: 800, fontSize: 20 }}>
            <span>Total</span>
            <span className="num">R$ 158,90</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
