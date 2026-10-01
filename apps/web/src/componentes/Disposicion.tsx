import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { quienSoy, salir } from '../api/sesion';

/*
 * La barra lateral de todas las pantallas con sesión.
 *
 * En pantallas anchas queda fija a la izquierda. En el celular no hay lugar: se
 * abre con el botón ☰ que cada pantalla pone en su encabezado (BotonMenu) y se
 * cierra al elegir una opción o tocar afuera.
 *
 * Esconder «Reportes» a quien no tiene permiso sólo avisa. El que impide es el
 * ReportesGuard del API.
 */

const MenuContexto = createContext<() => void>(() => undefined);

/** El botón ☰ del encabezado de cada pantalla. En pantallas anchas no se muestra. */
export function BotonMenu() {
  const abrir = useContext(MenuContexto);
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Abrir el menú"
      className="-ml-1 rounded-lg p-2 text-slate-600 md:hidden dark:text-slate-300"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

interface Opcion {
  a: string;
  texto: string;
  icono: ReactNode;
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const OPCIONES: Opcion[] = [
  {
    a: '/',
    texto: 'Precios y stock',
    icono: <path {...trazo} d="M20 12V7l-8-4-8 4v10l8 4 3-1.5M4 7l8 4 8-4M12 11v10" />,
  },
  {
    a: '/presupuesto',
    texto: 'Presupuesto',
    icono: <path {...trazo} d="M9 3h6l4 4v14H5V3h4Zm0 6h6m-6 4h6m-6 4h3" />,
  },
];

const OPCION_REPORTES: Opcion = {
  a: '/reportes',
  texto: 'Reportes',
  icono: <path {...trazo} d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
};

export function Disposicion() {
  const [abierto, setAbierto] = useState(false);
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const cache = useQueryClient();
  const sesion = useQuery({ queryKey: ['sesion'], queryFn: quienSoy, retry: false, staleTime: 5 * 60 * 1000 });

  // Elegir una opción en el celular cierra el panel.
  useEffect(() => setAbierto(false), [ubicacion.pathname]);

  const cerrarSesion = useMutation({
    mutationFn: salir,
    onSuccess: () => {
      cache.clear();
      navegar('/login', { replace: true });
    },
  });

  const opciones = sesion.data?.reportes ? [...OPCIONES, OPCION_REPORTES] : OPCIONES;

  const barra = (
    <nav aria-label="Secciones" className="flex h-full flex-col bg-white dark:bg-slate-900">
      <div className="px-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <p className="text-lg font-bold">Todo Hierro</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Portal interno</p>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {opciones.map((o) => (
          <li key={o.a}>
            <NavLink
              to={o.a}
              end={o.a === '/'}
              className={({ isActive }) =>
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ' +
                (isActive
                  ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
              }
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                {o.icono}
              </svg>
              {o.texto}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 dark:border-slate-800">
        <p className="truncate text-sm font-medium">{sesion.data?.nombre ?? ''}</p>
        <button
          type="button"
          onClick={() => cerrarSesion.mutate()}
          disabled={cerrarSesion.isPending}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400"
        >
          Salir
        </button>
      </div>
    </nav>
  );

  return (
    <MenuContexto.Provider value={() => setAbierto(true)}>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 border-r border-slate-200 md:block dark:border-slate-800">
        {barra}
      </aside>

      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[80vw] shadow-xl">{barra}</div>
        </div>
      )}

      <div className="md:pl-56">
        <Outlet />
      </div>
    </MenuContexto.Provider>
  );
}
