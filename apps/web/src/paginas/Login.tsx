import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { entrar } from '../api/sesion';

export function Login() {
  const [nick, setNick] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
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
        <div className="relative mb-6">
          <input
            id="clave"
            type={verClave ? 'text' : 'password'}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 pr-12 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950"
          />
          {/* type="button": sin eso, tocar el ojo enviaría el formulario. */}
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={verClave}
            aria-controls="clave"
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {verClave ? <OjoTachado /> : <Ojo />}
          </button>
        </div>

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

function Ojo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OjoTachado() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
