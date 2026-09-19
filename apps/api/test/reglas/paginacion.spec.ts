import { LIMITES, filasASaltear, normalizarPagina, normalizarTamano } from '@todohierro/shared';

describe('regla: paginación', () => {
  it('lo que no es un entero válido cae en la página 1', () => {
    // Un NaN propagado hasta el salteo devuelve cero filas y parece un problema
    // de datos, no de parámetros.
    expect(normalizarPagina(undefined)).toBe(1);
    expect(normalizarPagina('abc')).toBe(1);
    expect(normalizarPagina(-3)).toBe(1);
    expect(normalizarPagina(0)).toBe(1);
  });

  it('el tamaño de página nunca supera el tope duro', () => {
    expect(normalizarTamano(5000)).toBe(LIMITES.TAMANO_PAGINA_MAXIMO);
    expect(normalizarTamano('10')).toBe(10);
    expect(normalizarTamano(undefined)).toBe(LIMITES.TAMANO_PAGINA_POR_DEFECTO);
  });

  it('el salteo arranca en cero para la primera página', () => {
    expect(filasASaltear(1, 25)).toBe(0);
    expect(filasASaltear(3, 25)).toBe(50);
  });
});
