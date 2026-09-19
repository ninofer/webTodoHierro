import { LIMITES, modoDeBusqueda, normalizarBusqueda } from '@todohierro/shared';

/**
 * El criterio de búsqueda replica frmConsultaPrecio.vb del sistema de escritorio.
 * Si esto cambia, la web deja de comportarse como el sistema que los usuarios ya
 * conocen.
 */
describe('regla: modo de búsqueda', () => {
  it('sin texto, no filtra', () => {
    expect(modoDeBusqueda('')).toBe('todos');
    expect(modoDeBusqueda('   ')).toBe('todos');
  });

  it('un texto que no empieza con número se busca por nombre', () => {
    expect(modoDeBusqueda('CHAPA')).toBe('nombre');
    expect(modoDeBusqueda('caño negro')).toBe('nombre');
  });

  it('hasta seis caracteres empezando con número, se busca por código', () => {
    expect(modoDeBusqueda('1')).toBe('codigo');
    expect(modoDeBusqueda('176')).toBe('codigo');
    expect(modoDeBusqueda('123456')).toBe('codigo');
  });

  it('más de seis caracteres empezando con número, se busca por código de barras', () => {
    expect(modoDeBusqueda('1234567')).toBe('barra');
    expect(modoDeBusqueda('7790001234567')).toBe('barra');
  });

  it('mira el primer carácter, no si todo el texto es numérico', () => {
    // El VB hace `IsNumeric(txtBuscar.Text.Substring(0, 1))`. "176A" va por
    // código, no por nombre. Está replicado a propósito.
    expect(modoDeBusqueda('176A')).toBe('codigo');
  });

  it('los espacios de los costados no cambian el modo', () => {
    expect(modoDeBusqueda('  176  ')).toBe('codigo');
  });
});

describe('regla: normalización del texto buscado', () => {
  it('recorta al largo máximo', () => {
    const largo = 'A'.repeat(LIMITES.LARGO_MAXIMO_BUSQUEDA + 20);
    expect(normalizarBusqueda(largo)).toHaveLength(LIMITES.LARGO_MAXIMO_BUSQUEDA);
  });
});
