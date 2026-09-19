# Arquitectura y decisiones

Portal web de consulta sobre el sistema de gestión de Todo Hierro (Encarnación).
Estado: prueba de concepto validada el 17/09/2026, en construcción.

---

## 1. El problema

Todo Hierro opera con un sistema de escritorio en VB.NET 2010 contra SQL Server
2008 R2, alojado en una PC de escritorio con Windows Server 2012 R2, en su local
de Encarnación. Los dueños quieren consultar precios, stock y algunos reportes
desde el celular, sin tocar ese sistema.

Dos capas del cliente están sin soporte: el motor de base de datos desde julio de
2019, y el sistema operativo desde octubre de 2023. El portal no crea ese riesgo,
pero lo vuelve más visible, y el diseño asume que esas máquinas no se pueden
endurecer más de lo que están.

## 2. La topología

```
Celular ─▶ Cloudflare (WAF + TLS) ─▶ IIS en pc-servicios ─▶ API Node (127.0.0.1)
                                                                   │
                                                            Mikrotik (OpenVPN)
                                                                   │
                                                      SQL Server 2008 R2 (Encarnación)
```

- **Cloudflare** termina el TLS público, aplica WAF y límite de tasa.
- **IIS** sirve `apps/web/dist` y hace proxy inverso de `/api` al proceso Node.
- **El API** escucha sólo en `127.0.0.1`: nadie de la red puede saltear IIS.
- **El Mikrotik** termina la VPN. `pc-servicios` no tiene cliente VPN instalado,
  sólo una ruta.
- **El servidor de Todo Hierro** es un cliente más de esa VPN: sale hacia
  TREEKINGS y no abre ningún puerto.

### Las reglas del Mikrotik, que sostienen el modelo

| Regla | Motivo |
|---|---|
| Permitir sólo `pc-servicios` → SQL de Todo Hierro, puerto 1433 | Un único origen, destino y puerto |
| Bloquear todo tráfico iniciado desde Todo Hierro hacia el cluster | Impide que un compromiso de su servidor alcance la infraestructura propia |
| Reglas con estado, nunca ruta abierta en ambos sentidos | La conexión la inicia siempre el lado de TREEKINGS |
| Aislar a Todo Hierro del resto de los clientes de la VPN | Que las redes de distintos clientes no se vean entre sí |
| Registrar los intentos bloqueados desde ese peer | Detectar actividad anómala a tiempo |

La segunda es la que sostiene todo. Con tráfico bidireccional se vuelve al
problema original: una máquina sin parches con ruta hacia producción.

## 3. La frontera en la base

El API entra con el login `web_ro`, creado para este proyecto:

```sql
GRANT SELECT  ON SCHEMA::web TO web_ro;
GRANT EXECUTE ON SCHEMA::web TO web_ro;
DENY  INSERT, UPDATE, DELETE, ALTER ON SCHEMA::web TO web_ro;
DENY  SELECT ON SCHEMA::dbo TO web_ro;
```

`web_ro` no pertenece a ningún rol de servidor ni de base más allá de `public`.
Verificado: lee `web.vw_articulos` y falla al intentar `SELECT` sobre
`dbo.producto`.

El `DENY` sobre `dbo` es la red de seguridad contra el futuro: aunque alguien
agregue ese usuario a `db_datareader` por error, el `DENY` le gana al `GRANT`.

**Lo que nunca cruza**: `costo`, `costoAnterior`, `precio2` y `comisionCanje`.
El costo de compra es el dato más sensible de esa base y ninguna pantalla lo
necesita.

## 4. De dónde sale el precio

El precio no está guardado en `producto` — esas columnas están en cero. Lo calcula
la función `dbo.funPrecioMercaderia(idProducto, tipo)`, y la vista
`dbo.v_stockPrecio` la usa en un `UNION` de cuatro ramas, una por tipo de precio,
según si el producto tiene stock y qué constantes tiene su tipo de producto.

`web.vw_articulos` se apoya en esa vista. **No se replica la fórmula**: así la web
muestra siempre exactamente el mismo precio que el sistema de escritorio, sin
posibilidad de que difieran.

El costo es que la vista llama una función escalar por fila, y SQL Server 2008 R2
no puede insertarla en línea. De ahí la caché.

## 5. La caché

Medido el 17/09/2026: recorrer la vista entera cuesta 321 ms de servidor; una
búsqueda por nombre, entre 384 y 634 ms de punta a punta. Con caché en memoria:
**1 ms**.

El catálogo son 1.434 filas, unos cientos de kilobytes. El worker lo recarga
entero cada dos minutos y las búsquedas y la paginación se resuelven en memoria.
El servidor del cliente pasa de recibir una consulta por tecla a una cada dos
minutos.

Cada respuesta lleva la antigüedad del dato, y la pantalla la muestra. Eso evita
discusiones cuando el número de la web y el del mostrador difieren por un minuto.

**Consecuencia operativa**: el worker vive dentro del proceso del API, así que
pm2 corre **una sola instancia** en `exec_mode: fork`. Con dos, habría dos cachés
recargando por separado.

## 6. La autenticación

El sistema de escritorio valida con `sp_claveUsuarioNick`, que compara contra
contraseñas **cifradas con un certificado de SQL Server** — cifrado reversible, no
hash.

El portal **no reusa esas credenciales**, por dos razones. La primera es que el
portal está en internet y el sistema de escritorio en una LAN: compartir
contraseña significa que una filtración del portal entrega también el sistema de
gestión, con sus permisos de escritura. La segunda es práctica: validar contra ese
procedimiento exigiría `EXECUTE` sobre un objeto de `dbo`, justo lo que el diseño
deniega.

El padrón del portal vive en `pc-servicios`, con hash argon2. Son pocos usuarios
—los dueños— así que el costo es una contraseña distinta, que además es deseable.

## 7. Lo que se toma del sistema de escritorio

La búsqueda replica el criterio de `frmConsultaPrecio.vb`:

| Lo que se escribe | Cómo se busca |
|---|---|
| No empieza con número | `nombre LIKE 'texto%'` |
| Numérico, hasta 6 caracteres | `codigo LIKE 'texto%'` |
| Numérico, más largo | `codigo_barra LIKE 'texto%'` |

Esa regla la deciden la pantalla y el servidor, así que vive en
`packages/shared`.

El formulario original arma el SQL concatenando el texto del buscador. En una
aplicación de escritorio en LAN el riesgo está acotado; en una web publicada sería
una inyección de manual. **Ese patrón no se porta.**

Dato para el diseño: sólo 141 de 1.435 productos tienen código de barras cargado.
No sirve como campo de búsqueda principal.

## 8. Decisiones tomadas y por qué

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| OpenVPN terminada en el Mikrotik | Conector HTTPS en el local del cliente | Reusa infraestructura en producción, operada por el equipo. La VPN no toca `pc-servicios` |
| Consulta en vivo con caché | Réplica de la base al cluster | Los datos del cliente no salen de su servidor más allá de lo consultado |
| Caché en el API | Optimizar `v_stockPrecio` | El sistema de escritorio necesita esa vista tal como está |
| Padrón propio con argon2 | Reusar `sp_claveUsuarioNick` | Ver punto 6 |
| Vistas en esquema `web` | Consultar `dbo` directo | Permite el `DENY` sobre `dbo` y desacopla del esquema heredado |

## 9. El riesgo asumido

Sin un conector intermedio, lo que cruza el enlace es el protocolo TDS completo
contra un motor sin parches, en vez de un puñado de rutas JSON. La defensa
descansa enteramente en el login de solo lectura y en las reglas del Mikrotik.

Es un riesgo acotado y consciente, adecuado para este cliente. Para uno con datos
más sensibles, o cuando la cartera crezca y el Mikrotik sea la única frontera de
diez redes, conviene volver al conector por cliente.

## 10. Pendientes

- Los reportes (Facturación Total, Resumen de Servicios, Ranking de Ventas) salen
  hoy de Crystal Reports. El SQL de los dos primeros está embebido en los `.rpt`
  y hay que extraerlo; el tercero ya sale de `sp_consultaRankingVentas`.
- Definir cuándo se abre el portal a clientes finales. El modelo de permisos se
  diseña contemplándolos desde ahora; la protección contra extracción del
  catálogo se activa cuando corresponda.
- Recomendar por escrito al cliente la migración del motor y del sistema
  operativo. El portal no crea ese riesgo pero lo vuelve visible.
