import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Disposicion } from './componentes/Disposicion';
import { RutaPrivada } from './componentes/RutaPrivada';
import { Articulos } from './paginas/Articulos';
import { Login } from './paginas/Login';
import { Presupuesto } from './paginas/Presupuesto';
import { Reportes } from './paginas/Reportes';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RutaPrivada />}>
          <Route element={<Disposicion />}>
            <Route path="/" element={<Articulos />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/reportes" element={<Reportes />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
