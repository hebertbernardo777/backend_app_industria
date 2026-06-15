export const STATUS_ETIQUETA = {
  VALIDA: "V",
  CANCELADA: "C",
  RETRABALHADA: "R",
  CARREGADA: "G",
  DEVOLVIDA: "D",
} as const;

export type StatusEtiqueta =
  (typeof STATUS_ETIQUETA)[keyof typeof STATUS_ETIQUETA];

export function isStatusEtiqueta(value: any): value is StatusEtiqueta {
  return Object.values(STATUS_ETIQUETA).includes(value);
}