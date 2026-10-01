import { useEffect, useState, type ReactNode } from 'react';

/**
 * Ventana sobre la pantalla, como los formularios que abre frmFacturacionTotal
 * (frmBuscarClienteVenta, frmStock, frmBuscarVendedor). En el celular ocupa toda
 * la altura; en pantallas grandes, un recuadro centrado.
 */
export function Modal({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const conTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', conTecla);
    return () => window.removeEventListener('keydown', conTecla);
  }, [alCerrar]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={alCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-dvh w-full flex-col bg-white sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3 dark:border-slate-800">
          <h2 className="flex-1 font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"
          >
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Devuelve el texto después de que el usuario deja de tipear: una petición, no una por tecla. */
export function useDemorado(texto: string, ms = 250): string {
  const [valor, setValor] = useState(texto);
  useEffect(() => {
    const t = setTimeout(() => setValor(texto), ms);
    return () => clearTimeout(t);
  }, [texto, ms]);
  return valor;
}

export const CLASE_CAMPO =
  'w-full rounded-xl border border-slate-300 bg-slate-50 p-3.5 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950';

export const CLASE_BOTON_PRINCIPAL =
  'rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white active:opacity-85 disabled:opacity-60';

export const CLASE_BOTON_SECUNDARIO =
  'rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60';
