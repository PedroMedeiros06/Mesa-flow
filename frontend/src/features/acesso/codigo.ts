import { armazemDoNavegador } from "@/lib/sessao";

// O código do restaurante não é segredo e é fácil de esquecer: fica guardado neste aparelho
// depois do primeiro login (ou de criar a senha) e já vem preenchido. CPF e senha ficam com o
// gerenciador de senhas do navegador.
const CHAVE = "mesaflow:codigo-restaurante";

export const codigoGuardado = () => armazemDoNavegador.ler(CHAVE) ?? "";
export const guardarCodigo = (codigo: string) => armazemDoNavegador.gravar(CHAVE, codigo);
