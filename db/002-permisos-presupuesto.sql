/*
    002 - Permisos de web_ro para el módulo de presupuestos.

    Hasta acá la web sólo leía, y el login web_ro tenía DENY SELECT sobre todo
    `dbo`. El módulo de presupuestos necesita escribir en `todoHierro`: carga el
    carrito en detFacturacionTmp y guarda cabPresupuesto con sus detalles.

    La escritura NO se habilita sobre las tablas. web_ro recibe EXECUTE sobre los
    procedimientos del cliente que hacen el trabajo, y esos procedimientos escriben
    por encadenamiento de propiedad (son de dbo, igual que las tablas). Por eso
    el DENY INSERT, UPDATE, DELETE sobre `dbo` se agrega y se mantiene: un INSERT
    directo del API falla, el mismo INSERT hecho adentro del SP funciona.

    Lo que cambia y por qué:
      - Se retira el DENY SELECT ON SCHEMA::dbo. Un DENY de esquema le gana a
        cualquier GRANT de objeto: con él puesto, ninguno de los GRANT de abajo
        tendría efecto. Se reemplaza por SELECT objeto por objeto y, donde la
        tabla tiene costos, columna por columna.
      - Nunca se da SELECT sobre las columnas costo, Costo, costoAnterior ni
        comisionCanje, ni sobre v_usuario (tiene las claves cifradas).

    La lista de objetos de este script es la misma que usa el API. La guarda
    apps/api/test/guardas/sp-autorizados.spec.ts compara una contra la otra:
    agregar un objeto de un solo lado la pone en rojo.

    Motor: SQL Server 2008 R2.
*/

USE todoHierro;
GO

IF DB_NAME() <> N'todoHierro'
BEGIN
    DECLARE @msj nvarchar(400);
    SET @msj = N'Abortado: este script es para la base todoHierro y está parado en '
             + DB_NAME() + N'. Cambiá la base en SSMS y volvé a correrlo.';
    RAISERROR(@msj, 16, 1);
    SET NOEXEC ON;
END
GO

IF DATABASE_PRINCIPAL_ID(N'web_ro') IS NULL
BEGIN
    RAISERROR(N'Abortado: no existe el usuario web_ro en esta base. Crealo primero (docs/01-arquitectura.md, punto 3).', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------------------------
   1. La red de seguridad de escritura se mantiene; la de lectura cambia de forma.
   --------------------------------------------------------------------------- */
DENY INSERT, UPDATE, DELETE, ALTER ON SCHEMA::dbo TO web_ro;
REVOKE SELECT ON SCHEMA::dbo FROM web_ro;
GO

/* ---------------------------------------------------------------------------
   2. Procedimientos que el API ejecuta.
   --------------------------------------------------------------------------- */
-- carrito (idConfig 999, separado por idUsuario)
GRANT EXECUTE ON dbo.sp_agregarDetFacturacionTmp_producto_web TO web_ro;
GRANT EXECUTE ON dbo.sp_agregarDetFacturacionTmp_servicio_nuevo_web TO web_ro;
GRANT EXECUTE ON dbo.sp_consultaDetFacturacionTmp_web TO web_ro;
GRANT EXECUTE ON dbo.sp_updDetFacturacionTmp_producto_web TO web_ro;
GRANT EXECUTE ON dbo.sp_eliminarDetFacturacionTmp_web TO web_ro;
GRANT EXECUTE ON dbo.sp_limpiarDetFacturacionTmp_web TO web_ro;
-- guardado y reporte
GRANT EXECUTE ON dbo.sp_guardarPresupuesto_nuevo_web TO web_ro;
GRANT EXECUTE ON dbo.sp_reporteFacturaPresupuestoNuevo TO web_ro;
-- resolución del idStock, como frmStock.facturacionTotal del escritorio
GRANT EXECUTE ON dbo.sp_totalLoteStock TO web_ro;
GRANT EXECUTE ON dbo.sp_precioMercaderia TO web_ro;
GO

/* ---------------------------------------------------------------------------
   3. Lecturas, sólo las columnas que el API nombra.
   --------------------------------------------------------------------------- */
GRANT SELECT ON dbo.usuarioWeb (idUsuario) TO web_ro;
GRANT SELECT ON dbo.configPC (idConfig, idSucursal, idDepositoVenta) TO web_ro;
GRANT SELECT ON dbo.v_cliente (idCliente, ruc, soloRuc, nombre, nombreGrupoCliente, email1, primeroVenta, activo) TO web_ro;
GRANT SELECT ON dbo.v_vendedor (idVendedor, nombre, apellido) TO web_ro;
GRANT SELECT ON dbo.servicio (idServicio, nombreServicio, precio, activo) TO web_ro;
GRANT SELECT ON dbo.stock (idStock, idProducto, idLote, idDeposito, cantidad) TO web_ro;
GRANT SELECT ON dbo.detFacturacionTmp (idConfig, idUsuario, tipoPrecio, precio, precioDescuento, cantidad, subTotal, iva5, iva10) TO web_ro;
GRANT SELECT ON dbo.cabPresupuesto (idPresupuesto, idConfig, totalVenta) TO web_ro;
GO

/* ---------------------------------------------------------------------------
   4. Cómo quedó. Revisar a ojo: no tiene que aparecer ningún GRANT de INSERT,
      UPDATE ni DELETE, y el SELECT sobre el esquema dbo ya no tiene que figurar.
   --------------------------------------------------------------------------- */
SELECT p.state_desc, p.permission_name, p.class_desc,
       CASE p.class WHEN 3 THEN SCHEMA_NAME(p.major_id) ELSE OBJECT_NAME(p.major_id) END AS objeto,
       COL_NAME(p.major_id, p.minor_id) AS columna
FROM sys.database_permissions p
WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID(N'web_ro')
ORDER BY p.class_desc, objeto, columna;
GO
