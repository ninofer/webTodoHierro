import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

/**
 * Marca una ruta como accesible sin sesión.
 *
 * El guard JWT es global: lo normal es requerir sesión, y la excepción se
 * declara. Al revés —proteger ruta por ruta— la que se olvida queda abierta y
 * nadie se entera.
 */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
