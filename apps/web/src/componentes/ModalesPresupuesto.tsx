import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import {
  LIMITES,
  formatearGuaranies,
  formatearStock,
  hayFaltanteDeStock,
  validarCantidad,
  validarPrecioManual,
  type Articulo,
  type ClienteResumen,
  type Servicio,
  type TipoItem,
  type Vendedor,
} from '@todohierro/shared';
import { buscarArticulos } from '../api/catalogo';
import { buscarClientes, buscarServicios, buscarVendedores, precioProducto } from '../api/presupuesto';
import { CLASE_BOTON_PRINCIPAL, CLASE_CAMPO, Modal, useDemorado } from './Modal';

/*
 * Los modales del presupuesto, uno por cada formulario que abre frmFacturacionTotal
 * del escritorio: frmBuscarClienteVenta, frmStock + frmItemFacturacionTotal,
 * frmBuscarServicio y frmBuscarVendedor.
 */

function CampoBusqueda({ valor, cambiar, ayuda }: { valor: string; cambiar: (v: string) => void; ayuda: string }) {
  return (
    <input
      value={valor}
      onChange={(e) => cambiar(e.target.value)}
      maxLength={LIMITES.LARGO_MAXIMO_BUSQUEDA}
      placeholder={ayuda}
      autoFocus
      autoComplete="off"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="search"
      className={CLASE_CAMPO + ' mb-3'}
    />
  );
}

function Estado({ cargando, error, vacio, textoVacio }: { cargando: boolean; error: Error | null; vacio: boolean; textoVacio: string }) {
  if (error) return <p className="py-4 text-sm text-red-600 dark:text-red-400">{error.message}</p>;
  if (cargando) return <p className="py-4 text-sm text-slate-500">Buscando…</p>;
  if (vacio) return <p className="py-4 text-sm text-slate-500">{textoVacio}</p>;
  return null;
}

const CLASE_FILA =
  'w-full rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800';

/* ------------------------------------------------------------------ */

export function ModalBuscarCliente({ alElegir, alCerrar }: { alElegir: (c: ClienteResumen) => void; alCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const q = useDemorado(texto);
  const consulta = useQuery({
    queryKey: ['clientes', q],
    queryFn: () => buscarClientes(q),
    enabled: q.trim().length > 0,
  });
  const clientes = consulta.data ?? [];

  return (
    <Modal titulo="Buscar cliente" alCerrar={alCerrar}>
      <CampoBusqueda valor={texto} cambiar={setTexto} ayuda="Nombre, o RUC sin guion" />
      <Estado
        cargando={consulta.isFetching}
        error={consulta.error}
        vacio={q.trim() !== '' && clientes.length === 0}
        textoVacio="No hay clientes con ese nombre o RUC. Si es nuevo, dalo de alta en el sistema de escritorio."
      />
      <ul className="grid gap-2">
        {clientes.map((c) => (
          <li key={c.id}>
            <button type="button" className={CLASE_FILA} onClick={() => alElegir(c)}>
              <p className="font-semibold leading-snug">{c.nombre}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                RUC {c.ruc || '—'}
                {c.grupo && ` · ${c.grupo}`}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function ModalElegirVendedor({
  alElegir,
  alCerrar,
  guardando,
  error,
}: {
  alElegir: (v: Vendedor) => void;
  alCerrar: () => void;
  guardando: boolean;
  error: Error | null;
}) {
  const [texto, setTexto] = useState('');
  const q = useDemorado(texto);
  const consulta = useQuery({ queryKey: ['vendedores', q], queryFn: () => buscarVendedores(q) });
  const vendedores = consulta.data ?? [];

  return (
    <Modal titulo="¿Quién hace el presupuesto?" alCerrar={alCerrar}>
      <CampoBusqueda valor={texto} cambiar={setTexto} ayuda="Nombre o número del vendedor" />
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error.message}</p>}
      {guardando && <p className="mb-3 text-sm text-slate-500">Guardando el presupuesto…</p>}
      <Estado
        cargando={consulta.isFetching}
        error={consulta.error}
        vacio={!consulta.isFetching && vendedores.length === 0}
        textoVacio="No hay vendedores con ese nombre."
      />
      <ul className="grid gap-2">
        {vendedores.map((v) => (
          <li key={v.id}>
            <button type="button" disabled={guardando} className={CLASE_FILA + ' disabled:opacity-60'} onClick={() => alElegir(v)}>
              <span className="font-semibold">{v.nombre}</span>
              <span className="ml-2 text-xs text-slate-500">#{v.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/** "202.400" o "202400" → 202400. Los puntos son separador de miles en es-PY. */
function leerGuaranies(texto: string): number {
  const limpio = texto.replace(/\./g, '').replace(/\s/g, '');
  return limpio === '' ? NaN : Number(limpio.replace(',', '.'));
}

/**
 * Pide la cantidad y, si el producto va con precio manual, también el precio,
 * como frmItemFacturacionTotal. El precio viene propuesto y se puede cambiar.
 * La pantalla avisa con las mismas reglas que el servidor impone
 * (validarCantidad y validarPrecioManual, de shared).
 */
function PedirCantidad({
  tipo,
  titulo,
  detalle,
  stock,
  precioSugerido,
  etiquetaPrecio = 'Precio (Gs)',
  enviando,
  error,
  alConfirmar,
  alVolver,
}: {
  tipo: TipoItem;
  titulo: string;
  detalle: string;
  stock?: number;
  /** Si viene, se pide el precio y se propone este. */
  precioSugerido?: number;
  /** Qué dice arriba del campo del precio. */
  etiquetaPrecio?: string;
  enviando: boolean;
  error: Error | null;
  alConfirmar: (cantidad: number, precio?: number) => void;
  alVolver: () => void;
}) {
  const [texto, setTexto] = useState('1');
  const conPrecio = precioSugerido !== undefined;
  const [textoPrecio, setTextoPrecio] = useState(conPrecio ? formatearGuaranies(precioSugerido) : '');
  const cantidad = Number(texto.replace(',', '.'));
  const precio = leerGuaranies(textoPrecio);
  const problema = validarCantidad(cantidad, tipo);
  const problemaPrecio = conPrecio ? validarPrecioManual(precio) : null;
  const faltante = stock !== undefined && problema === null && hayFaltanteDeStock(cantidad, stock);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (problema === null && problemaPrecio === null) alConfirmar(cantidad, conPrecio ? precio : undefined);
  }

  return (
    <form onSubmit={enviar}>
      <p className="font-semibold leading-snug">{titulo}</p>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>
      {conPrecio && (
        <>
          <label htmlFor="precio" className="mb-1.5 block text-xs text-slate-500">
            {etiquetaPrecio}
          </label>
          <input
            id="precio"
            value={textoPrecio}
            onChange={(e) => setTextoPrecio(e.target.value)}
            inputMode="numeric"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className={CLASE_CAMPO + ' mb-1'}
          />
          {problemaPrecio && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{problemaPrecio}</p>}
          <div className="mb-3" />
        </>
      )}
      <label htmlFor="cantidad" className="mb-1.5 block text-xs text-slate-500">
        Cantidad
      </label>
      <input
        id="cantidad"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        inputMode={tipo === 'servicio' ? 'numeric' : 'decimal'}
        autoFocus={!conPrecio}
        onFocus={(e) => e.currentTarget.select()}
        className={CLASE_CAMPO}
      />
      {texto.trim() !== '' && problema && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problema}</p>}
      {faltante && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Hay {formatearStock(stock ?? 0)} en stock. Se puede presupuestar igual.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error.message}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={alVolver} className="flex-1 rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700">
          Volver
        </button>
        <button
          type="submit"
          disabled={problema !== null || problemaPrecio !== null || enviando}
          className={CLASE_BOTON_PRINCIPAL + ' flex-1'}
        >
          {enviando ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
    </form>
  );
}

export function ModalAgregarProducto({
  alAgregar,
  alCerrar,
  enviando,
  error,
}: {
  alAgregar: (a: Articulo, cantidad: number, precio?: number) => void;
  alCerrar: () => void;
  enviando: boolean;
  error: Error | null;
}) {
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState<Articulo | null>(null);
  const q = useDemorado(texto);
  // Si va con precio manual, y cuál proponer: lo decide sp_precioMercaderia.
  const precio = useQuery({
    queryKey: ['precio-producto', elegido?.id],
    queryFn: () => precioProducto(elegido?.id ?? 0),
    enabled: elegido !== null,
    staleTime: 0,
  });
  const consulta = useQuery({
    queryKey: ['articulos-presupuesto', q],
    queryFn: () => buscarArticulos(q, 1),
    enabled: q.trim().length > 0,
  });
  // El catálogo trae un renglón por lista de precio; acá interesa el artículo.
  const articulos = (consulta.data?.datos ?? []).filter((a, i, todos) => todos.findIndex((b) => b.id === a.id) === i);

  return (
    <Modal titulo="Agregar producto" alCerrar={alCerrar}>
      {elegido && precio.isPending ? (
        <p className="py-4 text-sm text-slate-500">Consultando el precio…</p>
      ) : elegido && precio.isError ? (
        <div>
          <p className="py-4 text-sm text-red-600 dark:text-red-400">{precio.error.message}</p>
          <button type="button" onClick={() => setElegido(null)} className="w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700">
            Volver
          </button>
        </div>
      ) : elegido && precio.data ? (
        <PedirCantidad
          key={elegido.id}
          tipo="producto"
          titulo={elegido.nombre}
          detalle={
            `Cód. ${elegido.codigo} · stock ${formatearStock(elegido.stock)}` +
            (precio.data.precioManual ? '' : ' · el precio lo calcula el sistema')
          }
          stock={elegido.stock}
          precioSugerido={precio.data.precioManual ? precio.data.precioSugerido : undefined}
          etiquetaPrecio="Precio (Gs) · este artículo va con precio manual"
          enviando={enviando}
          error={error}
          alConfirmar={(cantidad, p) => alAgregar(elegido, cantidad, p)}
          alVolver={() => setElegido(null)}
        />
      ) : (
        <>
          <CampoBusqueda valor={texto} cambiar={setTexto} ayuda="Nombre o código del producto" />
          <Estado
            cargando={consulta.isFetching}
            error={consulta.error}
            vacio={q.trim() !== '' && articulos.length === 0}
            textoVacio="Sin resultados. Probá con menos letras o con el código."
          />
          <ul className="grid gap-2">
            {articulos.map((a) => (
              <li key={a.id}>
                <button type="button" className={CLASE_FILA} onClick={() => setElegido(a)}>
                  <p className="font-semibold leading-snug">{a.nombre}</p>
                  <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    Cód. {a.codigo} ·{' '}
                    <span className={a.stock <= 0 ? 'text-red-600 dark:text-red-400' : ''}>stock {formatearStock(a.stock)}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export function ModalAgregarServicio({
  alAgregar,
  alCerrar,
  enviando,
  error,
}: {
  alAgregar: (s: Servicio, cantidad: number, precio: number) => void;
  alCerrar: () => void;
  enviando: boolean;
  error: Error | null;
}) {
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState<Servicio | null>(null);
  const q = useDemorado(texto);
  const consulta = useQuery({ queryKey: ['servicios', q], queryFn: () => buscarServicios(q) });
  const servicios = consulta.data ?? [];

  return (
    <Modal titulo="Agregar servicio" alCerrar={alCerrar}>
      {elegido ? (
        <PedirCantidad
          tipo="servicio"
          titulo={elegido.nombre}
          detalle={`Precio de lista: Gs ${formatearGuaranies(elegido.precio)} por unidad`}
          // Como frmBuscarServicio: el precio del servicio siempre se puede cambiar.
          precioSugerido={elegido.precio}
          enviando={enviando}
          error={error}
          alConfirmar={(cantidad, p) => alAgregar(elegido, cantidad, p ?? elegido.precio)}
          alVolver={() => setElegido(null)}
        />
      ) : (
        <>
          <CampoBusqueda valor={texto} cambiar={setTexto} ayuda="Nombre del servicio" />
          <Estado
            cargando={consulta.isFetching}
            error={consulta.error}
            vacio={!consulta.isFetching && servicios.length === 0}
            textoVacio="No hay servicios con ese nombre."
          />
          <ul className="grid gap-2">
            {servicios.map((s) => (
              <li key={s.id}>
                <button type="button" className={CLASE_FILA} onClick={() => setElegido(s)}>
                  <p className="font-semibold leading-snug">{s.nombre}</p>
                  <p className="text-xs tabular-nums text-slate-500">Gs {formatearGuaranies(s.precio)}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
