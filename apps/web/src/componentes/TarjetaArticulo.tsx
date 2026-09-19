import {
  formatearGuaranies,
  formatearPeso,
  formatearStock,
  type Articulo,
} from '@todohierro/shared';

/**
 * Un artículo en la lista.
 *
 * Tarjeta y no fila de tabla: la pantalla se usa en el celular, donde una tabla
 * de cinco columnas obliga a desplazar en horizontal para leer el precio, que es
 * justamente el dato que se viene a buscar.
 *
 * Muestra lo mismo que el ListView de frmConsultaPrecio.vb —código, nombre,
 * precio, stock y peso— menos el IdProducto, que es interno y al usuario no le
 * dice nada.
 */
export function TarjetaArticulo({ articulo }: { articulo: Articulo }) {
  const sinStock = articulo.stock <= 0;
  const peso = formatearPeso(articulo.peso);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 font-semibold leading-snug">{articulo.nombre}</p>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          Cód. {articulo.codigo}
          {peso !== '' && <span className="ml-2">· {peso}</span>}
        </span>
        <span
          className={
            sinStock
              ? 'text-sm tabular-nums text-red-600 dark:text-red-400'
              : 'text-sm tabular-nums text-emerald-700 dark:text-emerald-400'
          }
        >
          Stock {formatearStock(articulo.stock)}
        </span>
      </div>

      <p className="mt-1 text-xl font-bold tabular-nums">
        Gs {formatearGuaranies(articulo.precio)}
      </p>
    </li>
  );
}
