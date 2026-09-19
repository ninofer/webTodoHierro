import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITES, formatearAntiguedad } from '@todohierro/shared';
import { buscarArticulos } from '../api/catalogo';
import { quienSoy, salir } from '../api/sesion';
import { TarjetaArticulo } from '../componentes/TarjetaArticulo';

const ESPERA_ANTES_DE_BUSCAR_MS = 220;

export function Articulos() {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const navegar = useNavigate();
  const cache = useQueryClient();

  // Se espera a que deje de tipear: sin esto, cada tecla es una petición.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto), ESPERA_ANTES_DE_BUSCAR_MS);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const sesion = useQuery({ queryKey: ['sesion'], queryFn: quienSoy, retry: false });

  const consulta = useInfiniteQuery({
    queryKey: ['articulos', busqueda],
    queryFn: ({ pageParam }) => buscarArticulos(busqueda, pageParam),
    initialPageParam: 1,
    getNextPageParam: (ultima, todas) => {
      const vistos = todas.reduce((suma, p) => suma + p.datos.length, 0);
      return vistos < ultima.total ? todas.length + 1 : undefined;
    },
    retry: false,
  });

  const cerrarSesion = useMutation({
    mutationFn: salir,
    onSuccess: () => {
      cache.clear();
      navegar('/login', { replace: true });
    },
  });

  const paginas = consulta.data?.pages ?? [];
  const articulos = paginas.flatMap((p) => p.datos);
  const total = paginas[0]?.total ?? 0;
  const antiguedad = paginas[0]?.antiguedadSeg ?? 0;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex-1 text-sm font-semibold">Precios y stock</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {sesion.data?.nombre ?? ''}
          </span>
          <button
            onClick={() => cerrarSesion.mutate()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"
          >
            Salir
          </button>
        </div>

        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={LIMITES.LARGO_MAXIMO_BUSQUEDA}
          placeholder="Buscar por nombre o código"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3.5 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
        />
      </header>

      <p className="min-h-[2.125rem] px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        {consulta.isError
          ? consulta.error.message
          : consulta.isFetching && articulos.length === 0
            ? 'Buscando…'
            : total > 0
              ? `${articulos.length} de ${total} · datos ${formatearAntiguedad(antiguedad)}`
              : ''}
      </p>

      {articulos.length === 0 && !consulta.isFetching && !consulta.isError && (
        <p className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
          Sin resultados. Probá con menos letras, o con el código del artículo.
        </p>
      )}

      <ul className="grid gap-2.5 px-3 pb-6 sm:grid-cols-2">
        {articulos.map((articulo) => (
          <TarjetaArticulo key={`${articulo.id}-${articulo.tipoPrecio}`} articulo={articulo} />
        ))}
      </ul>

      {consulta.hasNextPage && (
        <button
          onClick={() => void consulta.fetchNextPage()}
          disabled={consulta.isFetchingNextPage}
          className="mx-3 mb-8 w-[calc(100%-1.5rem)] rounded-xl border border-slate-300 bg-white p-3.5 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
        >
          {consulta.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  );
}
