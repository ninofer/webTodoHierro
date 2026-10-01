# El módulo de presupuestos

La web hace presupuestos igual que el escritorio (`frmFacturacionTotal` →
`btnPresupuesto` → `frmBuscarVendedor.guardarPresupuesto` → `rpt_presupuestoNuevo`).
El presupuesto queda en `todoHierro` (`cabPresupuesto`, `detPresupuestoProducto`,
`detPresupuestoServicio`). Desde el escritorio se encuentra con «Buscar
presupuesto» y se factura como cualquier otro.

Es **la única parte del portal que escribe en la base del cliente**, y lo hace
de una sola forma: ejecutando procedimientos del cliente.

## 1. Cómo se escribe sin darle escritura a nadie

| Pieza | Quién la mantiene | Qué hace |
|---|---|---|
| Los SP `dbo.sp_..._web` | El cliente, como el resto de su sistema. No están en este repositorio | Todo INSERT, UPDATE y DELETE |
| `db/002-permisos-presupuesto.sql` | Este repositorio | `EXECUTE` sobre esos SP y `SELECT` columna por columna sobre lo que el API lee |
| `presupuesto.repositorio.ts` | Este repositorio | El único lugar del API que habla con la base. Llama a los SP con `.execute('dbo.x')` |

`web_ro` tiene `DENY INSERT, UPDATE, DELETE, ALTER` sobre `dbo`. Un INSERT
directo del API falla. El mismo INSERT, hecho adentro de un SP del cliente,
funciona por **encadenamiento de propiedad**: el SP y la tabla son del mismo
dueño (`dbo`), así que SQL Server no vuelve a mirar permisos adentro.

Antes de este módulo, `web_ro` tenía también `DENY SELECT ON SCHEMA::dbo`. Un
DENY de esquema le gana a cualquier GRANT de objeto, así que hubo que retirarlo.
En su lugar van `GRANT SELECT` puntuales, **columna por columna** donde la tabla
tiene costos (`stock`, `servicio`, `detFacturacionTmp`). Queda un riesgo: si
alguien agrega `web_ro` a `db_datareader`, pasa a leer todo `dbo`. No agregarlo a
ningún rol.

La guarda `sp-autorizados` compara la lista de `db/002` con la del código, en los
dos sentidos. Si el API llama a algo sin permiso, o queda un permiso que nadie
usa, la guarda falla.

## 2. El carrito: idConfig 999 + idUsuario

El escritorio separa el carrito por PC, con `detFacturacionTmp.idConfig`. La web
usa una sola fila de `configPC`, **999 «WEB»** (sucursal 1, depósito de venta 1),
que comparten todos sus usuarios. Lo que separa el carrito de cada uno es la
columna `idUsuario`, que el cliente agregó a `detFacturacionTmp`.

Por eso cada operación lleva los dos, y la guarda
`presupuesto-siempre-con-usuario` lo comprueba método por método. El primer
borrador de `sp_guardarPresupuesto_nuevo_web` borraba el carrito filtrando sólo
por `idConfig`: al guardar un presupuesto se vaciaban los carritos de todos. Se
corrigió en la base el 29/09/2026.

El `idUsuario` sale **del JWT**, nunca del navegador. Los DTO no lo aceptan
(`presupuesto-identidad`).

## 3. Qué SP se usa en cada paso

| Paso | Escritorio | Web |
|---|---|---|
| Agregar producto | `sp_agregarDetFacturacionTmp_producto` | `sp_agregarDetFacturacionTmp_producto_web` |
| Agregar servicio | `sp_agregarDetFacturacionTmp_servicio_nuevo` | `sp_agregarDetFacturacionTmp_servicio_nuevo_web` |
| Ver el detalle | `sp_consultaDetFacturacionTmp` | `sp_consultaDetFacturacionTmp_web` (columnas sin nombre: se leen por posición) |
| Totales | `sumarTotal()`, SQL suelto | La misma suma, con `idConfig` e `idUsuario` |
| Minorista / mayorista | `sp_updDetFacturacionTmp_producto` | `sp_updDetFacturacionTmp_producto_web` |
| Quitar un renglón | `delete` suelto en el VB | `sp_eliminarDetFacturacionTmp_web` |
| Limpiar | `delete` suelto en el VB | `sp_limpiarDetFacturacionTmp_web` |
| Guardar | `sp_guardarPresupuesto_nuevo` | `sp_guardarPresupuesto_nuevo_web` |
| Número del presupuesto | `max(idPresupuesto) where idConfig` | Igual, con idConfig 999 |
| PDF | `rpt_presupuestoNuevo` | `sp_reporteFacturaPresupuestoNuevo` + pdfkit |

**El idStock** se resuelve igual que `frmStock.facturacionTotal`: depósito de
venta de `configPC`, `sp_totalLoteStock` y la tabla `stock`.

**El número del presupuesto** se lee con `max()` sobre el 999, por decisión del
cliente. Como todos comparten el 999, el API guarda de a uno por vez (`Candado`).
Eso sólo alcanza con **una instancia** de pm2. Adentro del SP, el `max()` es por
`idSucursal`: si una PC del escritorio guarda en el mismo instante, los ítems
podrían ir a parar al presupuesto equivocado. El cliente lo acepta porque hay
poca concurrencia.

## 4. Lo que la web rechaza y manda al escritorio

- **Más de un lote**, o un único lote que está en otro depósito. En el escritorio
  esto abre `frmLote`, cuya rama de facturación está comentada: tampoco lo
  resuelve.
- **Cantidad inválida**: cero, negativa, más de 4 decimales en un producto o
  decimales en un servicio. En el escritorio, el parámetro del servicio es entero
  y los decimales se pierden sin aviso.

Si se pide más de lo que hay en stock, **se avisa pero se carga igual**, como en
el escritorio.

**El precio de un servicio** se puede cambiar siempre, como en
`frmBuscarServicio`. La pantalla propone el de la tabla `servicio` y manda el que
quedó escrito, con la misma regla que el precio manual (`validarPrecioManual`).

**Precio manual**, como `frmItemFacturacionTotal`. Si la columna 7 de
`sp_precioMercaderia` vale 1, la ventana de cantidad pide también el precio y lo
propone con el mayorista (columna 2, igual que `frmStock.vb:150`). El precio
viaja al SP con `@tienePrecio = 1`. El servidor lo exige para esos productos y lo
rechaza para los demás: el precio de un producto normal lo calcula el SP, nunca
el navegador. De `sp_precioMercaderia` se leen **sólo** las columnas 2 y 7; la 1
es el costo (`presupuesto-sin-costo`).

En el escritorio, el precio escrito se toma recién al apretar Enter en el campo
(`txtPrecioMayorista_KeyPress`): si se pasa directo a Agregar, viaja 0. La web
manda siempre el precio que se ve en pantalla.

Quedan fuera de la primera versión: descuento, crédito (siempre contado),
alta de clientes con consulta a la DNIT, y recargar un
presupuesto.

## 5. Quién puede usarlo

La clave es la del padrón de la web (`usuarios.json`, argon2). Cada usuario lleva
su `idUsuario` del escritorio, que `deploy/crear-usuario.js` pide al darlo de
alta. Además, ese `idUsuario` tiene que estar en la tabla `usuarioWeb`, que
administra el sistema del cliente. Se comprueba al entrar y antes de cada
operación, con una caché de un minuto.

`sp_usuarioPassWeb` no se usa: ver `docs/01-arquitectura.md`, punto 6.

## 6. Problemas del cliente que la web hereda

Vienen de los SP y la web no los corrige. Si se corrigen, es en la base.

- **`sp_reporteFacturaPresupuestoNuevo`** devuelve los servicios con cantidad 1 y
  subtotal igual al precio, sin importar la cantidad cargada. En el PDF, un
  servicio con cantidad mayor a 1 se ve mal. El total sale de `cabPresupuesto` y
  es correcto.
- **`sp_updDetFacturacionTmp_producto_web`** recalcula el precio sólo con
  `porcentajeCosto`. Un producto con precio por constante o por utilidad podría
  quedar en 0 al cambiar de minorista a mayorista. Hay que comprobarlo en la
  prueba de punta a punta.
- **`sp_agregarDetFacturacionTmp_*_web`** numera los renglones con
  `max(nro)+1` sobre el 999, sin mirar el usuario. Los números son únicos entre
  todos los usuarios, y no se pisan porque quitar un renglón filtra también por
  `idUsuario`.

## 7. El PDF

Copia el diseño de `rpt_presupuestoNuevo`. El modelo es `presupuestoEjemplo.pdf`
en la raíz, que está en `.gitignore` porque tiene datos de un cliente. Lo que el
reporte de Crystal tiene escrito en el diseño (el encabezado de la empresa y la
leyenda «Válido hasta el término de la jornada…») está escrito en
`presupuesto-pdf.ts`.

La web sólo imprime presupuestos del 999: los del escritorio se imprimen desde
el escritorio.
