import { useSyncExternalStore } from "react";
import { sessao, type Sessoes, type TipoSessao } from "./sessao";

export function useSessao<T extends TipoSessao>(tipo: T): Sessoes[T] {
  return useSyncExternalStore(sessao.assinar, () => sessao.estado()[tipo]);
}
