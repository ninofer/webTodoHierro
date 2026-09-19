# El método — lo que se copia a otro proyecto

Este documento es **portable a propósito**. Los ejemplos son de NetJoin; las
reglas no tienen nada de facturación paraguaya y valen en cualquier proyecto con
una base de datos y una pantalla.

Si otro proyecto quiere «la misma lógica», esto es lo que tiene que copiar —
junto con `CLAUDE.md` de la raíz, que es la versión corta y operativa.

> **Lo que NO se copia**: el modelo multiempresa, la replicación de maestros, el
> Manual Técnico de la DNIT, el esquema heredado. Eso es de este negocio y está
> en `docs/01` a `docs/11`.

---

## 1. Las reglas de trabajo

Son cinco, y no son de estilo: cada una se ganó perdiendo tiempo.

**Una tarea por vez, numerada, con un solo bloque de comandos.** Si algo falla a
mitad de una lista de ocho pasos, se pierde el hilo de dónde quedó todo. Se
entrega «Tarea 2 de 4», se espera el resultado, y recién ahí la siguiente.

**Cada bloque dice DÓNDE se corre.** `▶ EN EL SERVIDOR`, `▶ EN TU MÁQUINA`,
`▶ EN SSMS`. Un comando correcto ejecutado en la máquina equivocada es un error
que no avisa: acá una vez un `git status` corrido en el servidor devolvió «not a
git repository» y pareció un problema del repositorio.

**Explicar antes de hacer.** Sobre todo cuando el trabajo toca datos o dinero. La
explicación no es cortesía: es donde aparecen los desacuerdos, y salen mucho más
baratos antes que después. De las últimas cuatro veces que expliqué primero, dos
terminaron con el diseño cambiado por quien conoce el negocio.

**Contestar lo que se preguntó.** Una respuesta que además trae tres temas
nuevos obliga a leerla entera para encontrar el dato.

**Nada está hecho hasta verlo verde.** Ni «debería andar», ni «lo compilé
mentalmente». El número de pruebas que pasan se dice y se compara.

---

## 2. La disciplina que sostiene todo

> **Una guarda que nunca se disparó no es una guarda.**

Es la regla más importante del proyecto, y la única forma de saber si se cumple
es **romper a propósito lo que la guarda vigila, ver que falla, y restaurar**.

### Verificación por mutación, en tres pasos

1. Se guarda una copia del archivo.
2. Se introduce **el error real que la prueba dice evitar** — no uno cualquiera.
3. Se corre la prueba. Si pasa en verde, **la prueba estaba mal, no el código**.

Suena a exceso hasta la primera vez que lo hacés. En este proyecto encontró, en
una sola jornada:

- una prueba que verificaba que un componente **estaba definido**, no que
  estuviera **usado**: sacarlo de la pantalla la dejaba en verde;
- una prueba que buscaba `.enviar(` y también daba por bueno el envío de correo,
  que es otra cosa;
- una prueba que comprobaba el **mensaje** de un corte en vez de la **condición**:
  cambiar `if (!aprobada)` por `if (false)` pasaba;
- una prueba centinela que vigilaba una tabla **que no existe** — habría estado
  en verde para siempre, que es exactamente el olvido que venía a evitar.

### Tres trampas al escribir la prueba

**Comprobar que el código existe no comprueba que se ejecuta.** Si la prueba lee
un archivo entero, cualquier mención en cualquier lugar la satisface. Se acota el
trozo: el cuerpo de una función, el bloque entre dos marcas, el `INSERT` de una
tabla y no el de su vecina.

**Comprobar lo que NO tiene que estar.** Muchos errores no son omisiones, son
agregados: una columna de más que vuelve dos tablas a ser la misma, una lista que
viaja cuando no corresponde. `expect(x).not.toContain(...)` con un comentario que
diga por qué.

**No contar contra un número escrito a mano.** Una prueba que exigía «2 filtros»
falló el día que apareció una tercera consulta legítima. Subir el número a mano
convierte la prueba en un contador que alguien actualiza sin mirar. La regla real
era «toda consulta que entre a esta tabla filtra las anuladas», y así escrita
crece sola:

```ts
const entradas = SQL.match(/JOIN dbo\.cabNotaDebito cnd/g) ?? [];
const filtros  = SQL.match(/ISNULL\(cnd\.activo, 1\) = 1/g) ?? [];
expect(`${filtros.length} de ${entradas.length}`).toBe(`${entradas.length} de ${entradas.length}`);
```

---

## 3. Los modos de fallar que se repiten

### El más caro: no falla, entra, y significa otra cosa

La tabla de países del sistema viejo tenía a Paraguay en el **1**. La del sistema
nuevo usa la lista oficial, donde el 1 es **Macedonia del Norte** y Paraguay es
el **108**. Se copiaron 112 personas y **no falló nada**: el id 1 existe en el
destino.

El único síntoma apareció tres pasos más lejos, como «la replicación no anda».

> **Regla**: cuando se leen datos de un origen y se escriben en otro, los ids de
> catálogo **se traducen por su código, nunca se copian**. Y el informe que
> valida la carga tiene que preguntar si hay **pareja por código**, no si el id
> existe del otro lado. **Existir no es ser el mismo.**

Esa misma familia se repitió tres veces más en el proyecto.

### El 0 en una clave foránea

El 0 es lo que uno escribe cuando piensa «esto acá no aplica». En una columna
suelta es discutible; en una con clave foránea es un INSERT que la base rechaza
**siempre**, y no lo ve el compilador ni las pruebas: lo ve el usuario al apretar
Guardar, con un mensaje que nombra una restricción y no habla de lo que estaba
haciendo.

### El literal inventado que no rompe nada

Tres pantallas escribían `className="entrada"`. Esa clase no existe ni existió
nunca. TypeScript no dice nada —es un string—, el framework de estilos descarta
en silencio lo que no reconoce, la compilación pasa y las pruebas también. El
resultado fueron campos sin recuadro y sin fondo, y la única prueba que existía
era **alguien abriendo la pantalla y mirándola**.

> **Regla**: todo identificador que viaja como texto —clases, nombres de columna,
> claves de traducción, rutas— tiene que poder verificarse contra su fuente.

### El error de compilación que se lleva el lote entero

En SQL Server, un `PRINT` con una subconsulta adentro o una columna que ya no
existe no fallan en esa línea: **se cae el lote completo**, que puede empezar
cincuenta líneas antes. El script sigue con el lote siguiente, imprime sus
mensajes finales y **parece haber terminado bien**.

### El estado que miente

`PRINT` también fija `@@ROWCOUNT`. Un `PRINT ''` de separación entre el `INSERT`
y el `PRINT` que informa cuántas filas entraron lo deja en 0 — y «0 filas» se lee
como «ya estaba todo cargado». No falla, no avisa, y lo que informa es
perfectamente creíble.

> **Regla**: el estado que una sentencia deja se guarda en la sentencia
> **inmediatamente siguiente**, o no se usa.

### El paso manual adentro de un script que se corre tres veces

Un script tenía tres `DECLARE` con el código de la empresa y un comentario que
decía «ajustar antes de ejecutar». No se ajustó, y una base quedó declarándose
como otra empresa. **Un paso manual en algo que se repite no es una precaución,
es una trampa**: el dato tiene que deducirse de dónde está corriendo.

### La regla que vive en la pantalla

Cualquier regla que sólo esté en la interfaz se rompe el día que alguien llame al
API por otro camino — y ese día no hay nadie mirando. La pantalla **avisa**; el
servidor **impide**; y cuando se puede, la base **garantiza** (`NOT NULL`, clave
foránea, `CHECK`).

Corolario incómodo: **no debilites una regla de la base para que entre algo que
no pertenece ahí.** Si una columna es `NOT NULL` y tu caso nuevo no tiene ese
dato, el problema es que el caso nuevo va en otra tabla.

### Los dos redondeos

La suma de dos redondeos no siempre es el redondeo de la suma. Si un renglón se
parte en dos filas, el total se calcula **sobre las filas que se guardan**, no
sobre lo que se veía antes de partir. Y la fórmula vive en **un solo lugar** que
usan la pantalla y el servidor: con una copia en cada lado, la pantalla muestra
un total y el documento declara otro, con diferencia de centavos, en una de cada
varias operaciones.

### La guarda que mira una carpeta de tres

Una regla se arregló en 41 archivos de una carpeta. Otra carpeta tenía el mismo
defecto y nadie la miró — y se cobró una corrida de un script contra producción.
**Cuando una regla se rompe una vez, la prueba que la vigila barre todo el
repositorio, no la carpeta donde apareció.**

---

## 4. Los patrones que valen en cualquier proyecto

**Un solo lugar para lo que dos lados deciden.** Cálculos, validaciones,
formatos: van a un paquete compartido que importan la pantalla y el servidor. No
es reutilización por elegancia — es que dos copias empiezan iguales y se separan
en el primer arreglo.

**Cortar antes de consumir algo irreversible.** Un número de comprobante, un
descuento de stock, un correo enviado. Todas las validaciones van **antes** de
tomar el recurso; si una falla después, queda un número quemado y una operación
que rehacer.

**Reservar bajo bloqueo, y con la cantidad esperada en el `WHERE`.** El patrón
`leer, sumar uno, escribir` sin bloqueo entrega el mismo número a dos personas.
Y el `UPDATE ... WHERE valor = @loQueLeí` convierte una condición de carrera
silenciosa en un error visible.

**Releer adentro de la transacción.** Lo que mostró la pantalla puede tener
minutos. Lo que decide es lo que se lee con la transacción abierta — y con la
**misma consulta** que alimentó la pantalla, no con una parecida.

**`OUTPUT INSERTED` y no `MAX(id)`.** Leer el máximo después de insertar devuelve
el id de otro cuando hay dos operaciones a la vez, y le carga los hijos al
documento equivocado.

**El mensaje de error dice qué hacer.** «Cantidad inválida» obliga a adivinar.
«De *Teclado USB* quedan 3 por devolver y se están pidiendo 5» no.

**Una migración aplicada no se edita.** Lo que corrige una migración que ya
corrió es **otra migración**. Editarla deja bases distintas entre sí según cuándo
se corrieron.

**Leer el esquema antes de escribir la consulta.** Dos veces inventé una columna
de fecha que no existía. Lo atrapó una prueba que compara cada `alias.columna`
del código contra el esquema real — y la salida correcta no fue inventar la
columna, fue **cambiar el criterio**.

**Los informes sólo leen, y lo dicen al terminar.** Que un script no escriba es
una cosa; que quien lo corrió lo pueda confirmar mirando la salida, otra. Y si
corren contra una base en producción, van en lectura sucia: frenar una operación
real para contar filas cuesta más que el número exacto.

---

## 5. El catálogo de guardas

Estas son transversales —barren el repositorio entero— y se copian a otro
proyecto casi tal cual. Cada una nació de un error que ya había pasado.

| Guarda | Qué vigila |
|---|---|
| `lectura-de-produccion` | Ningún script escribe en la base de producción. Barre `db/` entero |
| `guarda-migraciones` | Toda migración comprueba en qué base está parada, y frena de verdad |
| `claves-foraneas-en-cero` | Ningún `INSERT` le pone 0 a una columna con clave foránea |
| `clases-css-existen` | Toda clase escrita en la web existe en la hoja de estilos o es del framework |
| `columnas-del-api-existen` | Cada `alias.columna` del SQL del API existe en el esquema |
| `columnas-existen` | Lo mismo para los scripts de base de datos |
| `copias-produccion` | Reglas para todo script que copie datos desde producción |
| `login-sin-inyeccion` | Lista auditada de dónde entra un valor a una consulta |
| `sql-compatibilidad` | Nada que el motor de producción no entienda |
| `lotes-sql` / `sql-comentarios` | Cada lote declara sus variables; comentarios balanceados; codificación |
| `migracion-en-las-tres` | Un script que carga en una base carga en todas |
| `pais-no-es-un-numero` | Ninguna entidad de catálogo se identifica por su id |
| `env-documentado` | Toda variable de entorno que el código lee está documentada |
| `botones-del-proyecto` | Los controles son los mismos en todas las pantallas |
| `dialogos-entran-en-la-pantalla` | Ningún diálogo deja sus botones fuera de la ventana |
| `foco-con-enter` | Enter pasa al campo siguiente, en todas las pantallas |
| `comandos-copiables` | Los comandos que el sistema le muestra al usuario se pueden pegar |
| `pruebas-multiplataforma` | Las pruebas dicen lo mismo en Windows y en Linux |

Las de interfaz parecen menores y no lo son: son las que evitan que **la única
prueba sea alguien abriendo la pantalla**.

---

## 6. Cómo se instala esto en un proyecto nuevo

1. **Copiar `CLAUDE.md`** a la raíz y ajustar los nombres. Es lo que hace que
   cualquier asistente trabaje con estas reglas sin que se las repitan.
2. **Copiar este documento** a `docs/`.
3. **Las tres guardas del primer día**, que son las que más temprano se pagan
   solas: que nada escriba en producción, que las columnas nombradas existan, y
   que las clases de estilo existan.
4. **La primera vez que aparezca un error que no falla** —de los del punto 3—
   escribir la guarda **en la misma entrega en que se lo arregla**, y romperla a
   propósito antes de darla por buena.
5. **Un documento por incidente**: qué pasó, por qué no se vio, qué guarda quedó.
   Son los que más se releen.

El orden importa: las guardas se escriben cuando el error ya pasó, no antes. Una
lista de reglas inventadas de cero envejece sin haber atrapado nada.

---

## 7. Lo que este método cuesta

Para que la decisión de copiarlo sea informada:

- **Escribir la guarda y romperla lleva más tiempo que arreglar el error.** Se
  paga la segunda vez que ese error intenta volver — y en este proyecto volvió,
  en las dos guardas que barrían una carpeta de menos.
- **Los comentarios largos envejecen.** Acá se sostienen porque cuentan el error
  que originó la decisión, y ese hecho no cambia. Un comentario que describe lo
  que hace la línea de abajo sí envejece, y no se escribe.
- **Una tarea por vez es más lento de escribir y más rápido de terminar.** No hay
  forma de saberlo hasta que una tarea de ocho pasos falla en el cuarto.
