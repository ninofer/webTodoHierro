/**
 * El contrato entre el API y la web.
 *
 * Los nombres van en camelCase aunque la vista `web.vw_articulos` use snake_case:
 * la traducción ocurre una sola vez, en el repositorio del API. Así el esquema
 * heredado no se filtra hasta la pantalla.
 */

/** Por qué campo se está buscando. */
export type ModoBusqueda = 'todos' | 'nombre' | 'codigo' | 'barra';

/** Un artículo del catálogo, tal como lo devuelve el API. */
export interface Articulo {
  id: number;
  codigo: string;
  codigoBarra: string;
  nombre: string;
  /** Lista de precio de la que salió este renglón (docs/01-arquitectura.md, punto 4). */
  tipoPrecio: number;
  /** En guaraníes, sin decimales. */
  precio: number;
  stock: number;
  peso: number;
  /** Fecha de última modificación del producto, en ISO 8601. */
  actualizado: string;
}

/** Respuesta paginada del catálogo. */
export interface RespuestaArticulos {
  modo: ModoBusqueda;
  pagina: number;
  tamano: number;
  /** Cantidad de filas que cumplen el filtro, no las de esta página. */
  total: number;
  /**
   * Segundos transcurridos desde que se cargó la caché del catálogo.
   * La pantalla lo muestra: evita discusiones cuando el número de la web y el
   * del mostrador difieren por un minuto.
   */
  antiguedadSeg: number;
  datos: Articulo[];
}

/** Usuario del portal, tal como viaja en el token. */
export interface UsuarioSesion {
  /**
   * Usuario del sistema de escritorio (`v_usuario.idUsuario`). Es con el que la
   * base separa el carrito de cada uno en `detFacturacionTmp` y el que queda como
   * autor del presupuesto. Sale del padrón, nunca del navegador.
   */
  idUsuario: number;
  nick: string;
  nombre: string;
  /**
   * Puede ver los reportes de ventas. Es toda la facturación del negocio: por
   * defecto no, y se habilita usuario por usuario en el padrón.
   */
  reportes: boolean;
}
