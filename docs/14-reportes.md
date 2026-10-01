# Reportes de ventas

Dos de los reportes de `frmReporteLibroIva.vb` del escritorio: **Facturación
total** y **Ranking de ventas**. Están en `/reportes` y sólo los ven los usuarios
con `"reportes": true` en el padrón. **Facturación resumida** quedó fuera por
ahora: su reporte da error en la base.

## 1. Quién los ve

Estos reportes muestran toda la facturación del negocio.

- En `usuarios.json`, `"reportes": true` habilita a un usuario. Si falta el
  campo, vale `false`. Cualquier otro valor, como `"si"`, hace fallar la carga
  del padrón. `deploy/crear-usuario.js` lo pregunta al dar de alta.
- El valor viaja en el JWT (`rep`). `ReportesGuard` está aplicado a la clase
  entera `ReportesController` y responde 403 a quien no lo tiene, aunque llame
  al API directo.
- Además rige la habilitación de `usuarioWeb`, igual que en el presupuesto.
- La barra lateral esconde «Reportes» a quien no tiene el permiso. Eso sólo
  avisa; lo que impide el acceso es el guard.

## 2. De dónde salen los datos

Los dos SP son del cliente, sólo leen y no devuelven costo. Leímos sus
definiciones el 30/09/2026. `web_ro` tiene sólo `EXECUTE` sobre ellos
(`db/003-permisos-reportes.sql`).

**Ranking**: `sp_consultaRankingVentas(@desde, @hasta, @cantidad)`.
- Devuelve las mismas columnas que la grilla de `frmReporteRankingVentaCliente`:
  nro, idCliente, ruc, cliente, teléfono, total.
- `@cantidad = 0` trae todos.
- Deja afuera al cliente 47 y a las facturas anuladas.

**Facturación total**: `sp_reporteFacturacionTotalDetalle(@desde, @hasta)`.
- Devuelve **un renglón por producto o servicio** de cada factura activa.
- Repite la columna `idFacturacion`, así que se lee **por posición**.
- En los servicios pone el grupo `SERVICIOS`, **cantidad fija en 3** y subtotal
  igual al precio. La web muestra esa cantidad en blanco.
- La suma coincide con el «TOTAL VENTA» del reporte del escritorio. Los rubros
  del pie del escritorio son los grupos de mercadería (HIERROS, FERRETERIA) más
  cada servicio por su nombre (FLETE, ALQUILER, CORTE…). La web los arma igual
  (`rubroDe` en `packages/shared/src/reportes.ts`).
- `sp_reporteLibroIvaDetalle` **no** es este reporte: es el libro IVA, con
  gravadas, IVA y una fila por tasa.

## 3. Qué muestra la pantalla y por qué así

**Facturación total**:
- Indicadores: total, facturas, ticket promedio y clientes.
- **Columnas por día.** Los días sin venta quedan vacíos; una línea los uniría
  y sugeriría ventas que no hubo.
- **Barras horizontales por rubro, con %.** No se usa torta: HIERROS es el 83 %
  y en una torta los rubros chicos no se leen.
- Barras con los 10 productos que más facturaron.
- La tabla de facturas, con búsqueda y paginada en el servidor.

**Ranking**:
- Barras de los 15 primeros.
- La tabla completa, igual a la del escritorio, con el total.
- «Los primeros N».

Todos los gráficos son de una sola serie: usan un solo color (`--serie-1`,
validado en claro y en oscuro) y no llevan leyenda. El texto nunca va en el
color de la serie. Cada gráfico tiene debajo la tabla con todos los valores.

**Al navegador no van los renglones.** Con un año son unos 120.000. Van sólo
los agregados y la página de facturas que se está viendo. Los agregados se
calculan en `shared` (`resumirFacturacion`, `facturasDe`), así que la pantalla y
el PDF cuentan igual.

## 4. Descargas

- **CSV**: separador `;`, comillas y UTF-8 con BOM, como el `ExportarACsv` del
  escritorio. El BOM es para que Excel no rompa las eñes. Los montos van como
  número, no como texto con puntos, para que Excel los pueda sumar.
  - El de facturación es **detallado**: un renglón por producto o servicio.
- **PDF**: se arma con pdfkit, con el encabezado de los reportes del escritorio.
  - El de facturación trae el resumen por rubro y el listado de facturas.
- El botón «Imprimir» del ranking del escritorio abre `rpt_libroVentaResumido`,
  que es el reporte roto. La web imprime el ranking.

## 5. Límites

- **Rango máximo: 366 días** (`validarRangoFechas`). La regla está en `shared`:
  la pantalla avisa y el servidor impide.
- El resultado de facturación de un mismo período se reutiliza durante un minuto
  (`FACTURACION_CACHE_MS`). Así, paginar, buscar o bajar el CSV no vuelve a
  consultar la base cada vez. Esa caché vive en el proceso: con una sola
  instancia de pm2 alcanza.
