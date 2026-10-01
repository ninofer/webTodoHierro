/*
    003 - Permisos de web_ro para los reportes de ventas.

    Los dos SP son del cliente, sólo leen y no devuelven costo (se leyó su
    definición el 30/09/2026):
      - sp_consultaRankingVentas: el ranking de clientes por monto facturado.
      - sp_reporteFacturacionTotalDetalle: los renglones de productos y servicios
        de las facturas activas del período.

    Sólo EXECUTE: web_ro no recibe SELECT sobre cabFacturacion ni sobre los
    detalles. Los SP leen por encadenamiento de propiedad.

    La guarda sp-autorizados suma los GRANT de todos los scripts: si el API deja
    de llamar alguno de estos SP, el permiso queda sobrante y la guarda falla.

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

GRANT EXECUTE ON dbo.sp_consultaRankingVentas TO web_ro;
GRANT EXECUTE ON dbo.sp_reporteFacturacionTotalDetalle TO web_ro;
GO

/* Tiene que devolver las dos filas, con GRANT EXECUTE. */
SELECT p.state_desc, p.permission_name, OBJECT_NAME(p.major_id) AS objeto
FROM sys.database_permissions p
WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID(N'web_ro')
  AND p.major_id IN (OBJECT_ID(N'dbo.sp_consultaRankingVentas'), OBJECT_ID(N'dbo.sp_reporteFacturacionTotalDetalle'));
GO
