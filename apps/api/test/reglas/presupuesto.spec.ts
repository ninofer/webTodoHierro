import {
  LIMITES_CANTIDAD,
  PRECIO_MANUAL_MAXIMO,
  TIPO_PRECIO,
  esTipoPrecio,
  hayFaltanteDeStock,
  validarCantidad,
  validarPrecioManual,
} from '@todohierro/shared';

describe('regla: cantidad de un renglón del presupuesto', () => {
  it('acepta cantidades positivas dentro del límite', () => {
    expect(validarCantidad(1, 'producto')).toBeNull();
    expect(validarCantidad(2.5, 'producto')).toBeNull();
    expect(validarCantidad(3, 'servicio')).toBeNull();
  });

  it('rechaza cero, negativos y lo que no es número, nombrando el valor', () => {
    expect(validarCantidad(0, 'producto')).toContain('0');
    expect(validarCantidad(-1, 'producto')).toContain('-1');
    expect(validarCantidad('abc', 'producto')).toContain('abc');
    expect(validarCantidad(NaN, 'servicio')).not.toBeNull();
  });

  it('el tope sale del tipo del parámetro del SP, no de un número suelto', () => {
    const tope = LIMITES_CANTIDAD.servicio.maximo;
    expect(validarCantidad(tope, 'servicio')).toBeNull();
    expect(validarCantidad(tope + 1, 'servicio')).toContain(String(tope));
  });

  it('un servicio no admite decimales; un producto admite hasta 4', () => {
    // En el escritorio el parámetro del servicio es Integer y 2,5 se redondea
    // sin aviso. Acá se rechaza para que el total no cambie por debajo.
    expect(validarCantidad(2.5, 'servicio')).toContain('entera');
    expect(validarCantidad(1.2345, 'producto')).toBeNull();
    expect(validarCantidad(1.23456, 'producto')).toContain('4 decimales');
  });
});

describe('regla: precio manual', () => {
  it('acepta un precio entero positivo dentro del tope', () => {
    expect(validarPrecioManual(202400)).toBeNull();
    expect(validarPrecioManual(PRECIO_MANUAL_MAXIMO)).toBeNull();
  });

  it('rechaza cero, negativos, decimales y lo que no es número, nombrando el valor', () => {
    expect(validarPrecioManual(0)).toContain('0');
    expect(validarPrecioManual(-5)).toContain('-5');
    // Guaraníes no tiene centavos: lo que se ve tiene que ser lo que queda.
    expect(validarPrecioManual(1500.5)).toContain('1500.5');
    expect(validarPrecioManual('mil')).toContain('mil');
  });

  it('el tope frena un cero de más', () => {
    expect(validarPrecioManual(PRECIO_MANUAL_MAXIMO + 1)).toContain(String(PRECIO_MANUAL_MAXIMO));
  });
});

describe('regla: faltante de stock', () => {
  it('avisa sólo cuando se pide más de lo que hay', () => {
    expect(hayFaltanteDeStock(5, 4)).toBe(true);
    // Pedir exactamente lo que hay no es faltante.
    expect(hayFaltanteDeStock(4, 4)).toBe(false);
    expect(hayFaltanteDeStock(1, 10)).toBe(false);
  });
});

describe('regla: tipo de precio', () => {
  it('sólo minorista (1) y mayorista (2), los números de detFacturacionTmp', () => {
    expect(esTipoPrecio(TIPO_PRECIO.MINORISTA)).toBe(true);
    expect(esTipoPrecio(TIPO_PRECIO.MAYORISTA)).toBe(true);
    expect(esTipoPrecio(3)).toBe(false);
    expect(esTipoPrecio('1')).toBe(false);
  });
});
