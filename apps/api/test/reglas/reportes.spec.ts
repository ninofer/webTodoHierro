import {
  RANGO_MAXIMO_DIAS,
  facturasDe,
  mesEnCurso,
  resumirFacturacion,
  validarCantidadRanking,
  validarRangoFechas,
  type RenglonFacturacion,
} from '@todohierro/shared';

const base: Omit<RenglonFacturacion, 'idFacturacion' | 'fecha' | 'codigo' | 'descripcion' | 'grupo' | 'esServicio' | 'subtotal'> = {
  factura: '',
  ruc: '1-1',
  cliente: 'CLIENTE',
  precio: 0,
  cantidad: 1,
};

function renglon(p: Partial<RenglonFacturacion> & Pick<RenglonFacturacion, 'idFacturacion' | 'fecha' | 'subtotal'>): RenglonFacturacion {
  return {
    ...base,
    codigo: '1',
    descripcion: 'CAÑO',
    grupo: 'HIERROS',
    esServicio: false,
    factura: '001-001-' + p.idFacturacion,
    ...p,
  };
}

// Tres facturas en tres días, con un domingo sin ventas en el medio.
const RENGLONES: RenglonFacturacion[] = [
  renglon({ idFacturacion: 1, fecha: '2026-09-05', codigo: '320', descripcion: 'ANGULO 2 X 1/8', subtotal: 900 }),
  renglon({ idFacturacion: 1, fecha: '2026-09-05', codigo: '12', descripcion: 'TORNILLO', grupo: 'FERRETERIA', subtotal: 100 }),
  // Los servicios vienen del SP con el grupo 'SERVICIOS' y una cantidad inventada.
  renglon({ idFacturacion: 1, fecha: '2026-09-05', codigo: '7', descripcion: 'CORTE', grupo: 'SERVICIOS', esServicio: true, cantidad: null, subtotal: 50 }),
  renglon({ idFacturacion: 2, fecha: '2026-09-07', codigo: '320', descripcion: 'ANGULO 2 X 1/8', subtotal: 600, cliente: 'OTRO', ruc: '2-2' }),
  renglon({ idFacturacion: 3, fecha: '2026-09-07', codigo: '8', descripcion: 'FLETE', grupo: 'SERVICIOS', esServicio: true, cantidad: null, subtotal: 350 }),
];

describe('regla: rango de fechas de un reporte', () => {
  it('acepta un rango normal y un año exacto', () => {
    expect(validarRangoFechas('2026-09-01', '2026-09-29')).toBeNull();
    expect(validarRangoFechas('2025-10-01', '2026-09-30')).toBeNull();
  });

  it('rechaza formato inválido y fechas que no existen, nombrando lo recibido', () => {
    expect(validarRangoFechas('01/09/2026', '2026-09-29')).toContain('01/09/2026');
    // 30 de febrero: Date lo corre al 2 de marzo sin avisar.
    expect(validarRangoFechas('2026-02-30', '2026-03-10')).toContain('2026-02-30');
  });

  it('rechaza desde posterior a hasta, diciendo que se inviertan', () => {
    expect(validarRangoFechas('2026-09-30', '2026-09-01')).toMatch(/30\/09\/2026.*01\/09\/2026.*Invertilas/);
  });

  it('el tope de días sale de la constante, no de un número suelto', () => {
    const desde = '2026-01-01';
    const hastaEnElTope = new Date(Date.UTC(2026, 0, RANGO_MAXIMO_DIAS)).toISOString().slice(0, 10);
    const hastaPasado = new Date(Date.UTC(2026, 0, RANGO_MAXIMO_DIAS + 1)).toISOString().slice(0, 10);
    expect(validarRangoFechas(desde, hastaEnElTope)).toBeNull();
    expect(validarRangoFechas(desde, hastaPasado)).toContain(String(RANGO_MAXIMO_DIAS));
  });

  it('el mes en curso va del día 1 a hoy', () => {
    expect(mesEnCurso(new Date(2026, 8, 30))).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });
});

describe('regla: resumen de la facturación', () => {
  const r = resumirFacturacion(RENGLONES, '2026-09-05', '2026-09-07');

  it('los totales suman todos los renglones, servicios incluidos', () => {
    // Como el «TOTAL VENTA» del escritorio: mercaderías más servicios.
    expect(r.total).toBe(2000);
    expect(r.cantidadFacturas).toBe(3);
    expect(r.cantidadClientes).toBe(2);
    expect(r.ticketPromedio).toBe(667);
  });

  it('los rubros son los grupos, y los servicios cada uno por su nombre', () => {
    expect(r.porRubro.map((x) => [x.rotulo, x.total])).toEqual([
      ['HIERROS', 1500],
      ['FLETE', 350],
      ['FERRETERIA', 100],
      ['CORTE', 50],
    ]);
    // Lo que NO tiene que aparecer: 'SERVICIOS' como un solo rubro, que el
    // reporte del escritorio no muestra.
    expect(r.porRubro.map((x) => x.rotulo)).not.toContain('SERVICIOS');
    expect(r.porRubro.reduce((s, x) => s + x.porcentaje, 0)).toBeCloseTo(100);
  });

  it('todos los días del rango aparecen, también los que no tuvieron venta', () => {
    expect(r.porDia).toEqual([
      { fecha: '2026-09-05', total: 1050 },
      { fecha: '2026-09-06', total: 0 },
      { fecha: '2026-09-07', total: 950 },
    ]);
  });

  it('el top de productos no incluye servicios', () => {
    expect(r.topProductos.map((x) => x.rotulo)).toEqual(['320 · ANGULO 2 X 1/8', '12 · TORNILLO']);
  });

  it('las facturas suman sus renglones y salen por fecha', () => {
    expect(facturasDe(RENGLONES).map((f) => [f.idFacturacion, f.total])).toEqual([
      [1, 1050],
      [2, 600],
      [3, 350],
    ]);
  });
});

describe('regla: «los primeros N» del ranking', () => {
  it('0 es todos; negativos, decimales y más de 9999 se rechazan', () => {
    expect(validarCantidadRanking(0)).toBeNull();
    expect(validarCantidadRanking(20)).toBeNull();
    expect(validarCantidadRanking(-1)).toContain('-1');
    expect(validarCantidadRanking(2.5)).not.toBeNull();
    expect(validarCantidadRanking(10000)).not.toBeNull();
  });
});
