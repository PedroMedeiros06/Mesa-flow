import { useRef, useState } from "react";
import { UFS } from "@mesaflow/shared";
import { Campo, Seletor } from "@/ui/componentes";

export interface Endereco {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export const enderecoVazio: Endereco = { cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

const mascaraCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

interface ViaCep {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

/**
 * Campos de endereço. Com o CEP completo, busca rua, bairro, cidade e estado no ViaCEP (serviço
 * público dos Correios) e leva o foco para o número. Se o ViaCEP falhar, dá para digitar tudo à mão.
 */
export function CamposEndereco({
  valor,
  aoMudar,
  erros,
}: {
  valor: Endereco;
  aoMudar: (e: Endereco) => void;
  /** Erros por campo: cep, street, number... */
  erros: Partial<Record<keyof Endereco, string>>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const numero = useRef<HTMLInputElement>(null);
  const ultimaBusca = useRef("");

  const mudar = (campo: keyof Endereco, v: string) => aoMudar({ ...valor, [campo]: v });

  async function buscarCep(mascarado: string) {
    const cep = mascarado.replace(/\D/g, "");
    if (cep.length !== 8 || cep === ultimaBusca.current) return;
    ultimaBusca.current = cep;
    setBuscando(true);
    setAviso(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = (await res.json()) as ViaCep;
      if (!res.ok || d.erro) {
        setAviso("CEP não encontrado. Confira o número ou preencha o endereço à mão.");
        return;
      }
      aoMudar({
        ...valor,
        cep: mascarado,
        street: d.logradouro || valor.street,
        district: d.bairro || valor.district,
        city: d.localidade || valor.city,
        state: d.uf || valor.state,
      });
      numero.current?.focus();
    } catch {
      setAviso("Não deu para buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <fieldset className="endereco">
      <legend>Endereço do restaurante</legend>
      <div className="endereco-linha endereco-cep">
        <Campo
          rotulo="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={valor.cep}
          onChange={(e) => {
            const m = mascaraCep(e.target.value);
            mudar("cep", m);
            void buscarCep(m);
          }}
          erro={erros.cep}
          ajuda={buscando ? "Buscando endereço..." : (aviso ?? "Com o CEP, a rua, o bairro e a cidade são preenchidos sozinhos.")}
        />
      </div>
      <div className="endereco-linha endereco-rua">
        <Campo rotulo="Rua" autoComplete="address-line1" value={valor.street} onChange={(e) => mudar("street", e.target.value)} erro={erros.street} maxLength={120} />
        <Campo
          ref={numero}
          rotulo="Número"
          value={valor.number}
          onChange={(e) => mudar("number", e.target.value)}
          erro={erros.number}
          maxLength={20}
          placeholder="ou S/N"
        />
      </div>
      <Campo
        rotulo="Complemento (opcional)"
        autoComplete="address-line2"
        value={valor.complement}
        onChange={(e) => mudar("complement", e.target.value)}
        erro={erros.complement}
        maxLength={80}
        placeholder="Loja, sala, bloco"
      />
      <div className="endereco-linha endereco-cidade">
        <Campo rotulo="Bairro" value={valor.district} onChange={(e) => mudar("district", e.target.value)} erro={erros.district} maxLength={80} />
        <Campo rotulo="Cidade" autoComplete="address-level2" value={valor.city} onChange={(e) => mudar("city", e.target.value)} erro={erros.city} maxLength={80} />
        <Seletor rotulo="Estado" value={valor.state} onChange={(e) => mudar("state", e.target.value)} erro={erros.state}>
          <option value="">UF</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Seletor>
      </div>
    </fieldset>
  );
}

/** "Avenida Paulista, 1000, Loja 2 · Bela Vista, São Paulo/SP" */
export function enderecoEmLinha(e: Endereco): string {
  const rua = [e.street, e.number, e.complement].filter(Boolean).join(", ");
  return `${rua} · ${e.district}, ${e.city}/${e.state}`;
}
