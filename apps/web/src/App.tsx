import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RutaPrivada } from './componentes/RutaPrivada';
import { Articulos } from './paginas/Articulos';
import { Login } from './paginas/Login';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RutaPrivada />}>
          <Route path="/" element={<Articulos />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
