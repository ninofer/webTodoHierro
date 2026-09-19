import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SesionVencida } from './api/cliente';
import './estilos.css';

const cache = new QueryClient({
  defaultOptions: {
    queries: {
      // Una sesión vencida no se arregla reintentando: se arregla volviendo a
      // entrar. Reintentar sólo retrasa el momento en que el usuario se entera.
      retry: (intentos, error) => !(error instanceof SesionVencida) && intentos < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento #raiz en index.html');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
