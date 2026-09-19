import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { entrar } from '../api/sesion';

export function Login() {
  const [nick, setNick] = useState('');
  const [clave, setClave] = useState('');
  const navegar = useNavigate();
  const cache = useQueryClient();

  const ingreso = useMutation({
    mutationFn: () => entrar(nick, clave),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['sesion'] });
      navegar('/', { replace: true });
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    ingreso.mutate();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-center text-xl font-bold">Todo Hierro</h1>
        <p className="mb-7 mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          Consulta de precios y stock
        </p>

        <label htmlFor="nick" className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400">
          Usuario
        </label>
        <input
          id="nick"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          className="mb-4 w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
        />

        <label htmlFor="clave" className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400">
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="current-password"
          required
          className="mb-6 w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
        />

        <button
          type="submit"
          disabled={ingreso.isPending}
          className="w-full rounded-lg bg-blue-700 p-3.5 font-semibold text-white active:opacity-85 disabled:opacity-60"
        >
          {ingreso.isPending ? 'Entrando…' : 'Ingresar'}
        </button>

        {ingreso.isError && (
          <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
            {ingreso.error.message}
          </p>
        )}
      </form>
    </main>
  );
}
