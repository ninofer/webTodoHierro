import { formatearAntiguedad, formatearStock } from '@todohierro/shared';

describe('regla: formato de stock', () => {
  it('sin decimales cuando la cantidad es entera', () => {
    // La columna es numeric(9,4) pero casi todo se maneja en unidades:
    // "494,0000" ensucia la pantalla sin agregar nada.
    expect(formatearStock(494)).not.toContain(',');
  });

  it('con decimales cuando existen', () => {
    expect(formatearStock(12.5)).toContain(',');
  });
});

describe('regla: antigüedad del dato', () => {
  it('segundos, minutos y horas según corresponda', () => {
    expect(formatearAntiguedad(30)).toBe('hace 30 s');
    expect(formatearAntiguedad(600)).toBe('hace 10 min');
    expect(formatearAntiguedad(7200)).toBe('hace 2 h');
  });
});
