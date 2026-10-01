import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  fechaLocal,
  formatearGuaranies,
  mesEnCurso,
  validarCantidadRanking,
  validarRangoFechas,
} from '@todohierro/shared';
import { quienSoy } from '../api/sesion';
import { leerFacturacion, leerRanking, urlFacturacion, urlRanking } from '../api/reportes';
import { BotonMenu } from '../componentes/Disposicion';
import { BarrasHorizontales, ColumnasPorDia } from '../componentes/Graficos';
import { CLASE_BOTON_PRINCIPAL, CLASE_CAMPO, useDemorado } from '../componentes/Modal';

type Pestana = 'facturacion' | 'ranking';

/**
 * Los reportes de ventas: Facturación total y Ranking, de frmReporteLibroIva.
 *
 * Esta pantalla no decide quién los ve: esconderla sólo avisa. El que impide es
 * el ReportesGuard del API, que responde 403 aunque se llame directo.
 */
export function Reportes() {
  const sesion = useQuery({ queryKey: ['sesion'], queryFn: quienSoy, retry: false, staleTime: 5 * 60 * 1000 });
  const [pestana, setPestana] = useState<Pestana>('facturacion');
  const [rango, setRango] = useState(() => mesEnCurso(new Date()));

  return (
    <div className="mx-auto min-h-dvh max-w-4xl pb-10">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BotonMenu />
          <span className="flex-1 text-sm font-semibold">Reportes</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="tablist">
          {(
            [
              ['facturacion', 'Facturación total'],
              ['ranking', 'Ranking de ventas'],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={
                'rounded-lg px-3 py-2 font-medium ' +
                (pestana === id ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500 dark:text-slate-400')
              }
            >
              {texto}
            </button>
          ))}
        </div>
      </header>

      {sesion.data && !sesion.data.reportes ? (
        <p className="m-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Tu usuario no tiene permiso para ver reportes. Pedile al administrador que te habilite «reportes».
        </p>
      ) : (
        <>
          <SelectorRango rango={rango} alCambiar={setRango} />
          {pestana === 'facturacion' ? <Facturacion {...rango} /> : <Ranking {...rango} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SelectorRango({
  rango,
  alCambiar,
}: {
  rango: { desde: string; hasta: string };
  alCambiar: (r: { desde: string; hasta: string }) => void;
}) {
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);
  // La pantalla avisa con la misma regla que el servidor impone.
  const problema = validarRangoFechas(desde, hasta);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (problema === null) alCambiar({ desde, hasta });
  }

  return (
    <form onSubmit={enviar} className="mx-3 mt-3 flex flex-wrap items-end gap-2">
      <label className="min-w-[9rem] flex-1 text-xs text-slate-500">
        Desde
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_CAMPO + ' mt-1 py-2.5'} />
      </label>
      <label className="min-w-[9rem] flex-1 text-xs text-slate-500">
        Hasta
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CLASE_CAMPO + ' mt-1 py-2.5'} />
      </label>
      <button type="submit" disabled={problema !== null} className={CLASE_BOTON_PRINCIPAL + ' py-2.5'}>
        Consultar
      </button>
      {problema && <p className="w-full text-sm text-red-600 dark:text-red-400">{problema}</p>}
    </form>
  );
}

function Tarjeta({ titulo, children, acciones }: { titulo: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="mx-3 mt-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function Descargas({ csv, pdf }: { csv: string; pdf: string }) {
  const clase = 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300';
  return (
    <div className="flex gap-2">
      <a href={csv} className={clase}>
        Exportar CSV
      </a>
      <a href={pdf} target="_blank" rel="noreferrer" className={clase}>
        Imprimir PDF
      </a>
    </div>
  );
}

function Estado({ cargando, error }: { cargando: boolean; error: Error | null }) {
  if (error) return <p className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error.message}</p>;
  if (cargando) return <p className="p-8 text-center text-sm text-slate-500">Consultando la base…</p>;
  return null;
}

/* ------------------------------------------------------------------ */

function Facturacion({ desde, hasta }: { desde: string; hasta: string }) {
  const [pagina, setPagina] = useState(1);
  const [texto, setTexto] = useState('');
  const q = useDemorado(texto);
  const consulta = useQuery({
    queryKey: ['reporte-facturacion', desde, hasta, pagina, q],
    queryFn: () => leerFacturacion(desde, hasta, pagina, q),
    placeholderData: keepPreviousData,
  });
  const r = consulta.data;
  const paginas = r ? Math.max(1, Math.ceil(r.totalFacturas / r.tamano)) : 1;

  return (
    <>
      <Estado cargando={consulta.isPending} error={consulta.error} />
      {r && (
        <>
          <div className="mx-3 mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Indicador titulo="Total venta" valor={'Gs ' + formatearGuaranies(r.resumen.total)} />
            <Indicador titulo="Facturas" valor={formatearGuaranies(r.resumen.cantidadFacturas)} />
            <Indicador titulo="Ticket promedio" valor={'Gs ' + formatearGuaranies(r.resumen.ticketPromedio)} />
            <Indicador titulo="Clientes" valor={formatearGuaranies(r.resumen.cantidadClientes)} />
          </div>

          <Tarjeta titulo="Venta por día" acciones={<Descargas csv={urlFacturacion('csv', desde, hasta)} pdf={urlFacturacion('pdf', desde, hasta)} />}>
            <ColumnasPorDia datos={r.resumen.porDia} />
          </Tarjeta>

          <div className="md:grid md:grid-cols-2">
            <Tarjeta titulo="Por rubro">
              <BarrasHorizontales
                datos={r.resumen.porRubro}
                detalle={(i) => (r.resumen.porRubro[i]?.porcentaje ?? 0).toFixed(1).replace('.', ',') + ' %'}
              />
            </Tarjeta>
            <Tarjeta titulo="Los 10 productos que más facturaron">
              <BarrasHorizontales datos={r.resumen.topProductos} />
            </Tarjeta>
          </div>

          <Tarjeta titulo={`Facturas (${formatearGuaranies(r.totalFacturas)})`}>
            <input
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPagina(1);
              }}
              placeholder="Buscar por cliente, RUC o número de factura"
              className={CLASE_CAMPO + ' mb-3 py-2.5'}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Factura</th>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="hidden py-2 pr-3 font-medium sm:table-cell">RUC</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {r.facturas.map((f) => (
                    <tr key={f.idFacturacion}>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{fechaLocal(f.fecha)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{f.factura}</td>
                      <td className="max-w-[12rem] truncate py-2 pr-3">{f.cliente}</td>
                      <td className="hidden whitespace-nowrap py-2 pr-3 tabular-nums sm:table-cell">{f.ruc}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums">{formatearGuaranies(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.facturas.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No hay facturas que coincidan.</p>}
            <div className="mt-3 flex items-center justify-between text-sm">
              <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">
                Anterior
              </button>
              <span className="text-xs text-slate-500">
                Página {r.pagina} de {paginas}
              </span>
              <button type="button" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">
                Siguiente
              </button>
            </div>
          </Tarjeta>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Cuántos clientes entran en el gráfico; la tabla los muestra todos. */
const RANKING_EN_GRAFICO = 15;

function Ranking({ desde, hasta }: { desde: string; hasta: string }) {
  const [textoCantidad, setTextoCantidad] = useState('20');
  const [cantidad, setCantidad] = useState(20);
  const numero = Number(textoCantidad === '' ? 0 : textoCantidad);
  const problema = validarCantidadRanking(numero);
  const consulta = useQuery({
    queryKey: ['reporte-ranking', desde, hasta, cantidad],
    queryFn: () => leerRanking(desde, hasta, cantidad),
  });
  const r = consulta.data;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (problema === null) setCantidad(numero);
        }}
        className="mx-3 mt-3 flex items-end gap-2"
      >
        <label className="w-32 text-xs text-slate-500">
          Los primeros (0 = todos)
          <input value={textoCantidad} onChange={(e) => setTextoCantidad(e.target.value)} inputMode="numeric" className={CLASE_CAMPO + ' mt-1 py-2.5'} />
        </label>
        <button type="submit" disabled={problema !== null} className={CLASE_BOTON_PRINCIPAL + ' py-2.5'}>
          Consultar
        </button>
      </form>
      {problema && <p className="mx-3 mt-2 text-sm text-red-600 dark:text-red-400">{problema}</p>}

      <Estado cargando={consulta.isPending} error={consulta.error} />
      {r && (
        <>
          <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
            <Indicador titulo="Total del ranking" valor={'Gs ' + formatearGuaranies(r.total)} />
            <Indicador titulo="Clientes" valor={formatearGuaranies(r.filas.length)} />
          </div>

          <Tarjeta
            titulo={r.filas.length > RANKING_EN_GRAFICO ? `Los ${RANKING_EN_GRAFICO} primeros` : 'Clientes'}
            acciones={<Descargas csv={urlRanking('csv', desde, hasta, cantidad)} pdf={urlRanking('pdf', desde, hasta, cantidad)} />}
          >
            <BarrasHorizontales datos={r.filas.slice(0, RANKING_EN_GRAFICO).map((f) => ({ rotulo: `${f.nro}. ${f.cliente}`, total: f.total }))} />
          </Tarjeta>

          <Tarjeta titulo="Ranking">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Nro.</th>
                    <th className="hidden py-2 pr-3 font-medium sm:table-cell">Id Cliente</th>
                    <th className="py-2 pr-3 font-medium">RUC</th>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="hidden py-2 pr-3 font-medium md:table-cell">Teléfono</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {r.filas.map((f) => (
                    <tr key={f.idCliente}>
                      <td className="py-2 pr-3 tabular-nums">{f.nro}</td>
                      <td className="hidden py-2 pr-3 tabular-nums sm:table-cell">{f.idCliente}</td>
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{f.ruc}</td>
                      <td className="max-w-[12rem] truncate py-2 pr-3">{f.cliente}</td>
                      <td className="hidden whitespace-nowrap py-2 pr-3 md:table-cell">{f.telefono}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums">{formatearGuaranies(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
                    <td colSpan={2} className="py-2">
                      TOTAL
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden md:table-cell" />
                    <td className="hidden md:table-cell" />
                    <td className="py-2 text-right tabular-nums">{formatearGuaranies(r.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
    </>
  );
}
