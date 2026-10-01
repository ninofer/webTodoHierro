import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  TIPO_PRECIO,
  formatearGuaranies,
  formatearStock,
  type Carrito,
  type ClienteResumen,
  type RespuestaCarrito,
  type TipoPrecio,
} from '@todohierro/shared';
import {
  agregarProducto,
  agregarServicio,
  cambiarTipoPrecio,
  clientePorDefecto,
  guardarPresupuesto,
  leerCarrito,
  limpiarCarrito,
  quitarRenglon,
  urlPdf,
} from '../api/presupuesto';
import { BotonMenu } from '../componentes/Disposicion';
import { CLASE_BOTON_PRINCIPAL, CLASE_BOTON_SECUNDARIO } from '../componentes/Modal';
import {
  ModalAgregarProducto,
  ModalAgregarServicio,
  ModalBuscarCliente,
  ModalElegirVendedor,
} from '../componentes/ModalesPresupuesto';

type ModalAbierto = 'cliente' | 'producto' | 'servicio' | 'vendedor' | null;

/**
 * El presupuesto, como frmFacturacionTotal del escritorio.
 *
 * El carrito vive en la base (detFacturacionTmp), no en el navegador: precio, IVA
 * y totales son los que calculan los SP del cliente. Esta pantalla muestra lo que
 * la base devuelve después de cada acción.
 */
export function Presupuesto() {
  const cache = useQueryClient();
  const [modal, setModal] = useState<ModalAbierto>(null);
  const [clienteElegido, setClienteElegido] = useState<ClienteResumen | null>(null);
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>(TIPO_PRECIO.MINORISTA);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);

  const porDefecto = useQuery({ queryKey: ['cliente-por-defecto'], queryFn: clientePorDefecto, staleTime: Infinity });
  const carrito = useQuery({ queryKey: ['carrito'], queryFn: leerCarrito });
  const cliente = clienteElegido ?? porDefecto.data ?? null;
  const items = carrito.data?.items ?? [];
  const totales = carrito.data?.totales;

  // Como sumarTotal() del escritorio: si el carrito ya tiene renglones, el tipo de
  // precio es el de los renglones.
  useEffect(() => {
    if (totales && items.length > 0) setTipoPrecio(totales.tipoPrecio);
  }, [totales, items.length]);

  const ponerCarrito = (c: Carrito) => cache.setQueryData(['carrito'], c);
  const conAviso = (r: RespuestaCarrito) => {
    ponerCarrito(r.carrito);
    setAviso(r.aviso ?? null);
    setModal(null);
  };

  const producto = useMutation({
    mutationFn: (v: { id: number; cantidad: number; precio?: number }) =>
      agregarProducto(v.id, v.cantidad, tipoPrecio, v.precio),
    onSuccess: conAviso,
  });
  const servicio = useMutation({
    mutationFn: (v: { id: number; cantidad: number; precio: number }) => agregarServicio(v.id, v.cantidad, v.precio),
    onSuccess: conAviso,
  });
  const tipo = useMutation({ mutationFn: cambiarTipoPrecio, onSuccess: ponerCarrito });
  const quitar = useMutation({ mutationFn: quitarRenglon, onSuccess: ponerCarrito });
  const limpiar = useMutation({ mutationFn: limpiarCarrito, onSuccess: ponerCarrito });

  const guardar = useMutation({
    mutationFn: (v: { idVendedor: number; ventana: Window | null }) =>
      guardarPresupuesto(cliente?.id ?? 0, v.idVendedor).then((r) => ({ ...r, ventana: v.ventana })),
    onSuccess: ({ idPresupuesto, ventana }) => {
      // La pestaña se abrió al tocar el vendedor: abrirla recién ahora, después de
      // la espera, la bloquearía el navegador como ventana emergente.
      if (ventana) ventana.location.href = urlPdf(idPresupuesto);
      setGuardado(idPresupuesto);
      setModal(null);
      setAviso(null);
      setClienteElegido(null);
      setTipoPrecio(TIPO_PRECIO.MINORISTA);
      void cache.invalidateQueries({ queryKey: ['carrito'] });
    },
    onError: (_e, v) => v.ventana?.close(),
  });

  function elegirTipo(nuevo: TipoPrecio) {
    setTipoPrecio(nuevo);
    if (items.some((i) => !i.esServicio)) tipo.mutate(nuevo);
  }

  function pedirPresupuesto() {
    setGuardado(null);
    if (!window.confirm('¿Desea cargar estos ítems al presupuesto?')) return;
    guardar.reset();
    setModal('vendedor');
  }

  const errorDeAccion = tipo.error ?? quitar.error ?? limpiar.error;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-28">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BotonMenu />
          <span className="flex-1 text-sm font-semibold">Presupuesto</span>
        </div>
      </header>

      {guardado !== null && (
        <div className="mx-3 mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Presupuesto <strong>Nº {formatearGuaranies(guardado)}</strong> guardado. Desde el escritorio se encuentra con «Buscar presupuesto».{' '}
          <a href={urlPdf(guardado)} target="_blank" rel="noreferrer" className="font-semibold underline">
            Ver el PDF
          </a>
        </div>
      )}

      {/* Cliente y tipo de precio */}
      <section className="mx-3 mt-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Cliente</p>
            <p className="truncate font-semibold">
              {cliente?.nombre ?? (porDefecto.isPending ? 'Cargando…' : 'Sin cliente: elegí uno')}
            </p>
            {cliente && <p className="text-xs text-slate-500">RUC {cliente.ruc || '—'}</p>}
            {porDefecto.isError && !clienteElegido && (
              <p className="text-xs text-red-600 dark:text-red-400">{porDefecto.error.message}</p>
            )}
          </div>
          <button type="button" onClick={() => setModal('cliente')} className={CLASE_BOTON_SECUNDARIO}>
            Cliente
          </button>
        </div>

        <fieldset className="mt-4 grid grid-cols-2 gap-2">
          <legend className="sr-only">Tipo de precio</legend>
          {[
            { valor: TIPO_PRECIO.MINORISTA, texto: 'Minorista' },
            { valor: TIPO_PRECIO.MAYORISTA, texto: 'Mayorista' },
          ].map((op) => (
            <label
              key={op.valor}
              className={
                'flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ' +
                (tipoPrecio === op.valor
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400')
              }
            >
              <input
                type="radio"
                name="tipoPrecio"
                className="sr-only"
                checked={tipoPrecio === op.valor}
                disabled={tipo.isPending}
                onChange={() => elegirTipo(op.valor)}
              />
              {op.texto}
            </label>
          ))}
        </fieldset>
      </section>

      {/* Agregar */}
      <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { producto.reset(); setModal('producto'); }} className={CLASE_BOTON_SECUNDARIO}>
          + Producto
        </button>
        <button type="button" onClick={() => { servicio.reset(); setModal('servicio'); }} className={CLASE_BOTON_SECUNDARIO}>
          + Servicio
        </button>
      </div>

      {aviso && (
        <p className="mx-3 mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{aviso}</p>
      )}
      {errorDeAccion && (
        <p className="mx-3 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{errorDeAccion.message}</p>
      )}

      {/* Renglones */}
      <section className="mx-3 mt-3">
        {carrito.isError && <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">{carrito.error.message}</p>}
        {carrito.isPending && <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>}
        {!carrito.isPending && !carrito.isError && items.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            El presupuesto está vacío. Agregá productos o servicios.
          </p>
        )}

        <ul className="grid gap-2">
          {items.map((i) => (
            <li
              key={i.nro}
              className={
                'rounded-xl border bg-white p-3 dark:bg-slate-900 ' +
                (i.tieneError ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950' : 'border-slate-200 dark:border-slate-800')
              }
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{i.descripcion}</p>
                  <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    Cód. {i.codigo} · {i.nombreTipoPrecio}
                    {i.tieneError && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">· sin stock</span>}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Quitar ${i.descripcion}`}
                  disabled={quitar.isPending}
                  onClick={() => quitar.mutate(i.nro)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400"
                >
                  Quitar
                </button>
              </div>
              <div className="mt-2 flex items-baseline justify-between text-sm tabular-nums">
                <span className="text-slate-600 dark:text-slate-300">
                  {formatearStock(i.cantidad)} × Gs {formatearGuaranies(i.precio)}
                </span>
                <span className="font-bold">Gs {formatearGuaranies(i.exenta + i.gravada5 + i.gravada10)}</span>
              </div>
            </li>
          ))}
        </ul>

        {items.length > 0 && totales && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-slate-500">IVA 5%</dt>
            <dd className="text-right">Gs {formatearGuaranies(totales.iva5)}</dd>
            <dt className="text-slate-500">IVA 10%</dt>
            <dd className="text-right">Gs {formatearGuaranies(totales.iva10)}</dd>
            <dt className="text-slate-500">Total IVA</dt>
            <dd className="text-right">Gs {formatearGuaranies(totales.totalIva)}</dd>
            <dt className="mt-1 text-base font-semibold">Total</dt>
            <dd className="mt-1 text-right text-xl font-bold">Gs {formatearGuaranies(totales.total)}</dd>
          </dl>
        )}

        {items.length > 0 && (
          <button
            type="button"
            disabled={limpiar.isPending}
            onClick={() => {
              if (window.confirm('¿Desea limpiar el presupuesto?')) limpiar.mutate();
            }}
            className="mt-3 w-full rounded-xl p-3 text-sm text-red-700 disabled:opacity-60 dark:text-red-400"
          >
            Limpiar presupuesto
          </button>
        )}
      </section>

      {/* Acción principal, fija abajo para el pulgar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t md:left-56 border-slate-200 bg-white px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            disabled={items.length === 0 || !cliente || guardar.isPending}
            onClick={pedirPresupuesto}
            className={CLASE_BOTON_PRINCIPAL + ' w-full'}
          >
            {items.length === 0 ? 'Agregá ítems para presupuestar' : !cliente ? 'Elegí un cliente' : 'Presupuesto'}
          </button>
        </div>
      </div>

      {modal === 'cliente' && (
        <ModalBuscarCliente
          alCerrar={() => setModal(null)}
          alElegir={(c) => {
            setClienteElegido(c);
            setModal(null);
          }}
        />
      )}
      {modal === 'producto' && (
        <ModalAgregarProducto
          alCerrar={() => setModal(null)}
          enviando={producto.isPending}
          error={producto.error}
          alAgregar={(a, cantidad, precio) => producto.mutate({ id: a.id, cantidad, precio })}
        />
      )}
      {modal === 'servicio' && (
        <ModalAgregarServicio
          alCerrar={() => setModal(null)}
          enviando={servicio.isPending}
          error={servicio.error}
          alAgregar={(s, cantidad, precio) => servicio.mutate({ id: s.id, cantidad, precio })}
        />
      )}
      {modal === 'vendedor' && (
        <ModalElegirVendedor
          alCerrar={() => setModal(null)}
          guardando={guardar.isPending}
          error={guardar.error}
          alElegir={(v) => guardar.mutate({ idVendedor: v.id, ventana: window.open('', '_blank') })}
        />
      )}
    </div>
  );
}
