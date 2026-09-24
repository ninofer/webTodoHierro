import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  compararCodigos,
  filasASaltear,
  modoDeBusqueda,
  normalizarBusqueda,
  type Articulo,
  type ModoBusqueda,
  type RespuestaArticulos,
} from '@todohierro/shared';
import { CatalogoRepositorio } from './catalogo.repositorio';

/** Artículo con sus campos de búsqueda ya en mayúsculas, para no recalcularlos por tecla. */
interface ArticuloIndexado extends Articulo {
  _nombre: string;
  _codigo: string;
  _codigoBarra: string;
}

/**
 * Caché del catálogo completo.
 *
 * El worker vive dentro de este proceso. Por eso pm2 corre UNA sola instancia en
 * exec_mode fork: con dos, habría dos cachés recargando por separado contra el
 * servidor del cliente, que es producción viva.
 */
@Injectable()
export class CatalogoService implements OnModuleInit {
  private readonly log = new Logger(CatalogoService.name);

  private articulos: ArticuloIndexado[] = [];
  private cargadoEn: number | null = null;
  private cargando = false;
  private ultimoError: string | null = null;
  private ultimaCargaMs: number | null = null;

  constructor(
    private readonly repositorio: CatalogoRepositorio,
    private readonly config: ConfigService,
    private readonly planificador: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recargar();

    const refrescoMs = Number(this.config.get<string>('CACHE_REFRESCO_MS') ?? 120000);
    const intervalo = setInterval(() => void this.recargar(), refrescoMs);
    this.planificador.addInterval('recarga-catalogo', intervalo);
  }

  /**
   * Trae el catálogo entero y reemplaza la caché.
   *
   * Si falla, la caché anterior se conserva: servir datos de hace cinco minutos
   * con la antigüedad a la vista es mejor que una pantalla vacía. El primer
   * arranque es la excepción, ahí no hay nada que conservar y `buscar` responde
   * 503.
   */
  async recargar(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    const desde = Date.now();

    try {
      const articulos = await this.repositorio.traerCatalogoCompleto();

      const indexados: ArticuloIndexado[] = articulos.map((a) => ({
        ...a,
        _nombre: a.nombre.toUpperCase(),
        _codigo: a.codigo.toUpperCase(),
        _codigoBarra: a.codigoBarra.toUpperCase(),
      }));

      // Se ordena una sola vez al cargar: filtrar conserva el orden, así que
      // cualquier búsqueda ("caño", un código, todo) sale por código ascendente.
      indexados.sort(
        (a, b) => compararCodigos(a.codigo, b.codigo) || a.tipoPrecio - b.tipoPrecio,
      );

      this.articulos = indexados;
      this.cargadoEn = Date.now();
      this.ultimoError = null;
      this.ultimaCargaMs = Date.now() - desde;
      this.log.log(`Catálogo recargado: ${indexados.length} filas en ${this.ultimaCargaMs} ms`);
    } catch (error) {
      this.ultimoError = error instanceof Error ? error.message : String(error);
      this.log.error(`Falló la recarga del catálogo: ${this.ultimoError}`);
    } finally {
      this.cargando = false;
    }
  }

  /** Segundos desde la última carga exitosa, o null si nunca hubo una. */
  antiguedadSeg(): number | null {
    if (this.cargadoEn === null) return null;
    return Math.round((Date.now() - this.cargadoEn) / 1000);
  }

  estado() {
    return {
      ok: this.articulos.length > 0,
      filas: this.articulos.length,
      antiguedadSeg: this.antiguedadSeg(),
      ultimaCargaMs: this.ultimaCargaMs,
      errorUltimaRecarga: this.ultimoError,
    };
  }

  buscar(texto: string, pagina: number, tamano: number): RespuestaArticulos {
    if (this.articulos.length === 0) {
      throw new ServiceUnavailableException(
        'El catálogo todavía no está disponible. Reintentá en un minuto; ' +
          'si sigue igual, revisá el enlace con el servidor del cliente.',
      );
    }

    const limpio = normalizarBusqueda(texto);
    const modo: ModoBusqueda = modoDeBusqueda(limpio);
    const aguja = limpio.toUpperCase();

    const filtrados = this.filtrar(modo, aguja);
    const desde = filasASaltear(pagina, tamano);

    return {
      modo,
      pagina,
      tamano,
      total: filtrados.length,
      antiguedadSeg: this.antiguedadSeg() ?? 0,
      datos: filtrados.slice(desde, desde + tamano).map(desindexar),
    };
  }

  private filtrar(modo: ModoBusqueda, aguja: string): ArticuloIndexado[] {
    switch (modo) {
      case 'nombre':
        // LIKE '%texto%', no 'texto%' como el sistema de escritorio: "CAÑO" tiene
        // que traer también "TUBO CAÑO ..." y "CODO P/CAÑO ...". Pedido del dueño.
        return this.articulos.filter((a) => a._nombre.includes(aguja));
      case 'codigo':
        return this.articulos.filter((a) => a._codigo.startsWith(aguja));
      case 'barra':
        return this.articulos.filter((a) => a._codigoBarra.startsWith(aguja));
      case 'todos':
        return this.articulos;
    }
  }
}

/** Saca los campos internos de indexación antes de que el artículo salga del API. */
function desindexar(articulo: ArticuloIndexado): Articulo {
  const { _nombre, _codigo, _codigoBarra, ...limpio } = articulo;
  return limpio;
}
