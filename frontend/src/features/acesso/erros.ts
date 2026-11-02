export type ErrosCampos<C extends string> = Partial<Record<C, string>>;

/** Agrupa os erros de validação (do zod ou da API) pelo nome do campo; fica a primeira mensagem de cada. */
export function errosPorCampo<C extends string>(issues: { path: string; message: string }[]): ErrosCampos<C> {
  const erros: ErrosCampos<C> = {};
  for (const { path, message } of issues) {
    const campo = path.split(".")[0] as C;
    erros[campo] ??= message;
  }
  return erros;
}
