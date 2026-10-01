import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { UsuarioSesion } from '@todohierro/shared';
import type { HabilitacionService } from '../../src/auth/habilitacion.service';
import { ReportesGuard } from '../../src/auth/reportes.guard';
import { aCsv } from '../../src/reportes/csv';
import { ReportesController } from '../../src/reportes/reportes.controller';
import { ReportesRepositorio } from '../../src/reportes/reportes.repositorio';
import { FACTURACION_CACHE_MS, ReportesService } from '../../src/reportes/reportes.service';
import type { SqlService } from '../../src/sql/sql.service';

/**
 * Los reportes: quién los ve, qué se le pide a la base y qué se entrega.
 *
 * - Toda ruta de reportes pasa por ReportesGuard (a nivel de clase).
 * - Un rango inválido o sin habilitación no llega a la base.
 * - El mismo período pedido varias veces seguidas (paginar, buscar, bajar el
 *   CSV) consulta la base una sola vez por minuto.
 * - El SP de facturación se lee por posición y los servicios no inventan cantidad.
 * - El CSV abre bien en Excel: BOM, punto y coma, comillas.
 */

const ANA: UsuarioSesion = { idUsuario: 7, nick: 'ana', nombre: 'Ana', reportes: true };

function servicio(repo: Partial<ReportesRepositorio>, habilitado = true) {
  const llamadas = { facturacion: 0, ranking: 0 };
  const falso = {
    facturacion: async (...a: unknown[]) => {
      llamadas.facturacion++;
      return (repo.facturacion as (...x: unknown[]) => Promise<unknown>)?.(...a) ?? [];
    },
    ranking: async (...a: unknown[]) => {
      llamadas.ranking++;
      return (repo.ranking as (...x: unknown[]) => Promise<unknown>)?.(...a) ?? [];
    },
  } as unknown as ReportesRepositorio;
  const habilitacion = {
    exigir: async () => {
      if (!habilitado) throw new ForbiddenException('no habilitado');
    },
  } as unknown as HabilitacionService;
  return { s: new ReportesService(falso, habilitacion), llamadas };
}

describe('guarda: reportes-protegidos', () => {
  it('el controlador de reportes entero está detrás de ReportesGuard', () => {
    const guards = (Reflect.getMetadata('__guards__', ReportesController) ?? []) as unknown[];
    expect(guards).toContain(ReportesGuard);
  });
});

describe('guarda: reportes-servicio', () => {
  it('un rango inválido no llega a la base, y el mensaje nombra las fechas', async () => {
    const { s, llamadas } = servicio({});
    await expect(s.facturacion(ANA, '2026-09-30', '2026-09-01', 1, '')).rejects.toThrow(BadRequestException);
    await expect(s.ranking(ANA, '2024-01-01', '2026-09-01', 0)).rejects.toThrow(/días/);
    expect(llamadas).toEqual({ facturacion: 0, ranking: 0 });
  });

  it('«los primeros N» inválido no llega a la base', async () => {
    const { s, llamadas } = servicio({});
    await expect(s.ranking(ANA, '2026-09-01', '2026-09-29', -3)).rejects.toThrow(BadRequestException);
    expect(llamadas.ranking).toBe(0);
  });

  it('sin habilitación en usuarioWeb no se consulta nada', async () => {
    const { s, llamadas } = servicio({}, false);
    await expect(s.facturacion(ANA, '2026-09-01', '2026-09-29', 1, '')).rejects.toThrow(ForbiddenException);
    await expect(s.ranking(ANA, '2026-09-01', '2026-09-29', 0)).rejects.toThrow(ForbiddenException);
    expect(llamadas).toEqual({ facturacion: 0, ranking: 0 });
  });

  it('el mismo período se consulta una vez por minuto', async () => {
    const { s, llamadas } = servicio({});
    const t0 = 1_000_000;
    await s.facturacion(ANA, '2026-09-01', '2026-09-29', 1, '', t0);
    await s.facturacion(ANA, '2026-09-01', '2026-09-29', 2, 'PEREZ', t0 + 1000);
    await s.facturacion(ANA, '2026-09-01', '2026-09-29', 1, '', t0 + FACTURACION_CACHE_MS - 1);
    expect(llamadas.facturacion).toBe(1);
    await s.facturacion(ANA, '2026-09-01', '2026-09-29', 1, '', t0 + FACTURACION_CACHE_MS);
    expect(llamadas.facturacion).toBe(2);
    // Otro período es otra consulta.
    await s.facturacion(ANA, '2026-08-01', '2026-08-31', 1, '', t0 + FACTURACION_CACHE_MS);
    expect(llamadas.facturacion).toBe(3);
  });

  it('la búsqueda y la página se aplican sobre las facturas, no sobre los renglones', async () => {
    const renglon = (id: number, cliente: string, subtotal: number) => ({
      idFacturacion: id, fecha: '2026-09-02', factura: `001-001-${id}`, ruc: `${id}-1`, cliente,
      codigo: '1', descripcion: 'X', grupo: 'HIERROS', esServicio: false, precio: 1, cantidad: 1, subtotal,
    });
    const { s } = servicio({
      facturacion: async () => [renglon(1, 'JUAN PEREZ', 10), renglon(1, 'JUAN PEREZ', 5), renglon(2, 'ANA LOPEZ', 7)],
    });
    const r = await s.facturacion(ANA, '2026-09-01', '2026-09-29', 1, 'perez');
    expect(r.totalFacturas).toBe(1);
    expect(r.facturas[0]?.total).toBe(15);
    // El resumen es del período, no de lo que se buscó.
    expect(r.resumen.total).toBe(22);
  });
});

describe('guarda: reportes-lectura', () => {
  it('el SP de facturación se lee por posición; en los servicios la cantidad es null', async () => {
    const fila = (grupo: string, cantidad: number) => [
      'TITULO', '01/09/2026', '29/09/2026', '1071698-0', 'JULIO', '09/09/2026', 91267, '001-001-9155',
      new Date(), 260947, 91267, '320', 'ANGULO', 1, grupo, 113800, cantidad, 910400,
    ];
    const peticion = {
      arrayRowMode: false,
      input() { return this; },
      execute: async () => ({ recordsets: [[fila('HIERROS', 8), fila('SERVICIOS', 3)]] }),
    };
    const repo = new ReportesRepositorio({ peticion: () => peticion } as unknown as SqlService);
    const [producto, servicioR] = await repo.facturacion(new Date(), new Date());
    expect(producto).toMatchObject({ idFacturacion: 91267, fecha: '2026-09-09', cantidad: 8, subtotal: 910400, esServicio: false });
    // El 3 que el SP pone en los servicios no es una cantidad: no se muestra.
    expect(servicioR).toMatchObject({ esServicio: true, cantidad: null });
  });

  it('el CSV lleva BOM, punto y coma y comillas escapadas', () => {
    const csv = aCsv(['Cliente', 'Total'], [['PEÑA "EL" SA', 1500]]).toString('utf8');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Cliente";"Total"');
    expect(csv).toContain('"PEÑA ""EL"" SA";"1500"');
  });
});
