/*
    001 - Esquema web: la única superficie que este proyecto crea en producción.

    Regla del repositorio: a la base del cliente se la lee, nunca se le escribe.
    Este script es la excepción documentada, y sólo crea objetos de lectura en el
    esquema `web`. Ninguna otra cosa del repositorio toca esta base.

    Lo que NO está acá y se corre a mano, una sola vez:
      CREATE LOGIN web_ro WITH PASSWORD = '...'
    La contraseña no se commitea. Ver docs/01-arquitectura.md, punto 3.

    Motor: SQL Server 2008 R2. No hay DROP VIEW IF EXISTS (2016+) ni THROW (2012+).
*/

USE todoHierro;
GO

/* En qué base estamos parados. Un script correcto en la base equivocada es un
   error que no avisa. */
IF DB_NAME() <> N'todoHierro'
BEGIN
    DECLARE @msj nvarchar(400);
    SET @msj = N'Abortado: este script es para la base todoHierro y está parado en '
             + DB_NAME() + N'. Cambiá la base en SSMS y volvé a correrlo.';
    RAISERROR(@msj, 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------------------------
   El esquema web. Es la frontera: el login web_ro tiene GRANT sobre `web` y
   DENY SELECT sobre `dbo`, así que sólo ve lo que acá se publique.
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'web')
BEGIN
    EXEC(N'CREATE SCHEMA web AUTHORIZATION dbo');
    PRINT N'Esquema web creado.';
END
ELSE
    PRINT N'Esquema web ya existía.';
GO

/* ---------------------------------------------------------------------------
   Catálogo de artículos.

   Se apoya en dbo.v_stockPrecio, que calcula el precio con
   dbo.funPrecioMercaderia. No se replica esa fórmula: así la web muestra siempre
   el mismo precio que el sistema de escritorio.

   Lo que deliberadamente NO expone: costo, costoAnterior, precio2 y
   comisionCanje. El costo de compra es el dato más sensible de esta base y
   ninguna pantalla lo necesita.
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'web.vw_articulos', N'V') IS NOT NULL
    DROP VIEW web.vw_articulos;
GO

CREATE VIEW web.vw_articulos AS
SELECT
    v.idProducto                 AS id,
    LTRIM(RTRIM(v.codigo))       AS codigo,
    LTRIM(RTRIM(p.codigoBarra))  AS codigo_barra,
    v.nombreProducto             AS nombre,
    v.tipo                       AS tipo_precio,
    v.precio                     AS precio,
    ISNULL(v.stock, 0)           AS stock,
    v.peso                       AS peso,
    p.idMarca                    AS id_marca,
    p.idGrupoProducto            AS id_grupo,
    p.fechaMod                   AS actualizado
FROM dbo.v_stockPrecio v
INNER JOIN dbo.producto p ON p.idProducto = v.idProducto
WHERE p.activo = 1;
GO

PRINT N'Vista web.vw_articulos creada.';
PRINT N'Este script sólo creó objetos de lectura en el esquema web. No escribió ningún dato.';
GO

SET NOEXEC OFF;
GO
