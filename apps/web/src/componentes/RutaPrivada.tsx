import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router-dom';
import { quienSoy } from '../api/sesion';

/**
 * Deja pasar sólo con sesión viva.
 *
 * Esto **avisa**, no protege: quien quiera los datos llama al API directamente.
 * Quien impide es el guard global del servidor. Acá se evita mostrar una
 * pantalla vacía y mandar al login antes de que el usuario se confunda.
 */
export function RutaPrivada() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['sesion'],
    queryFn: quienSoy,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Cargando…
      </p>
    );
  }

  if (isError || !data) return <Navigate to="/login" replace />;

  return <Outlet />;
}
