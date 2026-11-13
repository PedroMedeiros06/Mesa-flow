import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { Icone, type NomeIcone } from "./Icone";

/* ---------- marca ---------- */

export function Marca({ para = "/", className }: { para?: string; className?: string }) {
  return (
    <Link className={`marca ${className ?? ""}`} to={para}>
      <span className="marca-selo" aria-hidden="true" />
      MesaFlow
    </Link>
  );
}

/* ---------- botão ---------- */

export type VarianteBotao = "primario" | "contorno" | "claro" | "perigo";

/** Classes do botão, para usar também em <Link>. */
export function classeBotao(variante: VarianteBotao = "primario", opcoes: { pequeno?: boolean; largo?: boolean } = {}) {
  return ["btn", `btn-${variante}`, opcoes.pequeno && "btn-sm", opcoes.largo && "btn-largo"].filter(Boolean).join(" ");
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  pequeno?: boolean;
  largo?: boolean;
  icone?: NomeIcone;
  /** Mostra o giro, bloqueia novos cliques e troca o texto (ex.: "Entrando..."). */
  carregando?: boolean;
  textoCarregando?: string;
}

export function Botao({
  variante,
  pequeno,
  largo,
  icone,
  carregando,
  textoCarregando,
  children,
  className,
  type = "button",
  disabled,
  ...resto
}: BotaoProps) {
  return (
    <button
      type={type}
      className={`${classeBotao(variante, { pequeno, largo })} ${className ?? ""}`}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? <span className="giro" aria-hidden="true" /> : icone && <Icone nome={icone} />}
      {carregando && textoCarregando ? textoCarregando : children}
    </button>
  );
}

/* ---------- campo ---------- */

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  /** React 19: ref é uma prop comum e chega ao <input> pelo resto. */
  ref?: Ref<HTMLInputElement>;
  rotulo: string;
  ajuda?: ReactNode;
  erro?: string;
}

export function Campo({ rotulo, ajuda, erro, id, ...resto }: CampoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const descricao = [ajuda && `${idCampo}-ajuda`, erro && `${idCampo}-erro`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="campo">
      <label htmlFor={idCampo}>{rotulo}</label>
      <input id={idCampo} aria-invalid={erro ? true : undefined} aria-describedby={descricao} {...resto} />
      {ajuda && (
        <span className="campo-ajuda" id={`${idCampo}-ajuda`}>
          {ajuda}
        </span>
      )}
      {erro && (
        <span className="campo-erro" id={`${idCampo}-erro`}>
          {erro}
        </span>
      )}
    </div>
  );
}

function descricaoDe(id: string, ajuda?: ReactNode, erro?: string) {
  return [ajuda && `${id}-ajuda`, erro && `${id}-erro`].filter(Boolean).join(" ") || undefined;
}

function Rodape({ id, ajuda, erro }: { id: string; ajuda?: ReactNode; erro?: string }) {
  return (
    <>
      {ajuda && (
        <span className="campo-ajuda" id={`${id}-ajuda`}>
          {ajuda}
        </span>
      )}
      {erro && (
        <span className="campo-erro" id={`${id}-erro`}>
          {erro}
        </span>
      )}
    </>
  );
}

export function CampoArea({
  rotulo,
  ajuda,
  erro,
  ...resto
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; ajuda?: ReactNode; erro?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <textarea id={id} aria-invalid={erro ? true : undefined} aria-describedby={descricaoDe(id, ajuda, erro)} {...resto} />
      <Rodape id={id} ajuda={ajuda} erro={erro} />
    </div>
  );
}

export function Seletor({
  rotulo,
  ajuda,
  erro,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; ajuda?: ReactNode; erro?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} aria-invalid={erro ? true : undefined} aria-describedby={descricaoDe(id, ajuda, erro)} {...resto}>
        {children}
      </select>
      <Rodape id={id} ajuda={ajuda} erro={erro} />
    </div>
  );
}

/** Caixa de marcar com o texto clicável ao lado. */
export function Marcador({
  rotulo,
  ajuda,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { rotulo: string; ajuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="marcador">
      <input id={id} type="checkbox" aria-describedby={ajuda ? `${id}-ajuda` : undefined} {...resto} />
      <label htmlFor={id}>
        {rotulo}
        {ajuda && (
          <span className="campo-ajuda" id={`${id}-ajuda`}>
            {ajuda}
          </span>
        )}
      </label>
    </div>
  );
}

/** Código do restaurante: 6 caixas, um campo de verdade por baixo. */
export function CampoCodigo({
  valor,
  aoMudar,
  erro,
  ajuda,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
  ajuda?: ReactNode;
}) {
  const id = useId();
  const descricao = [ajuda && `${id}-ajuda`, erro && `${id}-erro`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="campo">
      <label htmlFor={id}>Código do restaurante</label>
      <div className="codigo" data-invalido={erro ? "" : undefined}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} aria-hidden="true" data-atual={i === Math.min(valor.length, 5) ? "" : undefined}>
            {valor[i] ?? ""}
          </span>
        ))}
        <input
          id={id}
          name="codigo"
          inputMode="numeric"
          autoComplete="organization"
          maxLength={6}
          value={valor}
          onChange={(e) => aoMudar(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
        />
      </div>
      {ajuda && (
        <span className="campo-ajuda" id={`${id}-ajuda`}>
          {ajuda}
        </span>
      )}
      {erro && (
        <span className="campo-erro" id={`${id}-erro`}>
          {erro}
        </span>
      )}
    </div>
  );
}

/* ---------- comanda ---------- */

export function Comanda({
  como: Tag = "div",
  className,
  children,
  ...resto
}: {
  como?: "div" | "aside" | "article" | "section";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Tag className={`comanda ${className ?? ""}`} {...resto}>
      {children}
    </Tag>
  );
}

export function CorteComanda() {
  return <hr className="comanda-corte" />;
}

/* ---------- etiqueta e aviso ---------- */

export type TomEtiqueta = "laranja" | "ambar" | "brasa" | "feito" | "neutra";

/** Status sempre com texto e, de preferência, ícone: a cor sozinha não basta. */
export function Etiqueta({ tom, icone, children }: { tom: TomEtiqueta; icone?: NomeIcone; children: ReactNode }) {
  return (
    <span className={`etiqueta e-${tom}`}>
      {icone && <Icone nome={icone} tamanho={14} />}
      {children}
    </span>
  );
}

export function Aviso({ tom = "erro", children }: { tom?: "erro" | "info"; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tom}`} role={tom === "erro" ? "alert" : "status"}>
      <Icone nome={tom === "erro" ? "alerta" : "relogio"} tamanho={18} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- diálogo ---------- */

export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  children,
  acoes,
  largo,
}: {
  largo?: boolean;
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children?: ReactNode;
  acoes?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={`dialogo ${largo ? "dialogo-largo" : ""}`}
      aria-labelledby={idTitulo}
      onClose={aoFechar}
      onClick={(e) => {
        // clique no fundo escuro fecha
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div className="dialogo-corpo">
        <h2 id={idTitulo}>{titulo}</h2>
        {children}
        {acoes && <div className="dialogo-acoes">{acoes}</div>}
      </div>
    </dialog>
  );
}
