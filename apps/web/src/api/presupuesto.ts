import type {
  Carrito,
  ClienteResumen,
  PrecioProducto,
  PresupuestoGuardado,
  RespuestaCarrito,
  Servicio,
  TipoPrecio,
  Vendedor,
} from '@todohierro/shared';
import { pedir } from './cliente';

/*
 * El usuario nunca viaja en estas peticiones: el API lo toma de la sesión. Si la
 * pantalla lo mandara, el servidor respondería 400.
 */

function conBusqueda(ruta: string, texto: string): string {
  const q = texto.trim();
  return q === '' ? ruta : `${ruta}?${new URLSearchParams({ q }).toString()}`;
}

export const clientePorDefecto = () => pedir<ClienteResumen>('/presupuesto/clientes/por-defecto');
export const buscarClientes = (texto: string) => pedir<ClienteResumen[]>(conBusqueda('/presupuesto/clientes', texto));
export const buscarVendedores = (texto: string) => pedir<Vendedor[]>(conBusqueda('/presupuesto/vendedores', texto));
export const buscarServicios = (texto: string) => pedir<Servicio[]>(conBusqueda('/presupuesto/servicios', texto));

export const leerCarrito = () => pedir<Carrito>('/presupuesto/carrito');

export const precioProducto = (idProducto: number) =>
  pedir<PrecioProducto>(`/presupuesto/productos/${idProducto}/precio`);

/** `precio` sólo para productos con precio manual; si no, el servidor lo rechaza. */
export const agregarProducto = (idProducto: number, cantidad: number, tipoPrecio: TipoPrecio, precio?: number) =>
  pedir<RespuestaCarrito>('/presupuesto/carrito/productos', {
    method: 'POST',
    body: JSON.stringify(precio === undefined ? { idProducto, cantidad, tipoPrecio } : { idProducto, cantidad, tipoPrecio, precio }),
  });

export const agregarServicio = (idServicio: number, cantidad: number, precio: number) =>
  pedir<RespuestaCarrito>('/presupuesto/carrito/servicios', {
    method: 'POST',
    body: JSON.stringify({ idServicio, cantidad, precio }),
  });

export const cambiarTipoPrecio = (tipoPrecio: TipoPrecio) =>
  pedir<Carrito>('/presupuesto/carrito/tipo-precio', { method: 'PUT', body: JSON.stringify({ tipoPrecio }) });

export const quitarRenglon = (nro: number) => pedir<Carrito>(`/presupuesto/carrito/${nro}`, { method: 'DELETE' });

export const limpiarCarrito = () => pedir<Carrito>('/presupuesto/carrito', { method: 'DELETE' });

export const guardarPresupuesto = (idCliente: number, idVendedor: number) =>
  pedir<PresupuestoGuardado>('/presupuesto', { method: 'POST', body: JSON.stringify({ idCliente, idVendedor }) });

export const urlPdf = (idPresupuesto: number) => `/api/presupuesto/${idPresupuesto}/pdf`;
