/** Notas de [atraso em segundos, frequência em Hz]. */
type Notas = readonly (readonly [number, number])[];

/** Pedido novo na cozinha: dois toques subindo. */
export const BIPE_PEDIDO: Notas = [
  [0, 880],
  [0.18, 1175],
];

/** Mesa chamando o garçom: três toques, para não confundir com o da cozinha. */
export const BIPE_CHAMADO: Notas = [
  [0, 1175],
  [0.2, 1175],
  [0.4, 1568],
];

/** Bipe curto gerado na hora (sem arquivo de áudio). */
export function bipar(ctx: AudioContext, notas: Notas = BIPE_PEDIDO) {
  for (const [atraso, freq] of notas) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
    ganho.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + atraso + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + 0.16);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(ctx.currentTime + atraso);
    osc.stop(ctx.currentTime + atraso + 0.18);
  }
}

/** Vibra o celular, onde o navegador deixa (o Safari do iPhone não deixa; e só depois de um toque na página). */
export function vibrar(padrao: number[] = [200, 100, 200]) {
  if ("vibrate" in navigator && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(padrao);
}
