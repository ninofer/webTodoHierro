/**
 * Configuración de pm2 para pc-servicios.
 *
 * Tras tocar el .env:  pm2 restart todohierro-api --update-env
 * Sin --update-env, pm2 le pasa las variables viejas al proceso nuevo.
 *
 * Si se agrega o saca un proceso de esta lista, hay que volver a hacer
 * `pm2 save`. Si no, el próximo reinicio restaura la lista anterior — y no avisa.
 */
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'todohierro-api',
      script: 'apps/api/dist/main.js',
      // __dirname es la carpeta donde vive este archivo, o sea la raíz del
      // proyecto. Así sirve sin importar dónde esté clonado el repositorio —
      // antes tenía "C:\\todohierro" fijo, válido sólo en la instalación
      // anterior sobre Windows/IIS.
      cwd: __dirname,

      /*
        Una sola instancia, en modo fork, a propósito.

        El worker que recarga la caché del catálogo vive dentro de este proceso
        (@nestjs/schedule). Con dos instancias habría dos cachés recargando por
        separado contra el servidor del cliente, que es producción viva.

        Escalar a varios procesos exige primero sacar el worker afuera.
      */
      instances: 1,
      exec_mode: 'fork',

      max_memory_restart: '1G',

      out_file: path.join(__dirname, 'logs', 'api-out.log'),
      error_file: path.join(__dirname, 'logs', 'api-error.log'),
      time: true,

      env: {
        NODE_ENV: 'production',
        /*
          SQL Server 2008 R2 cifra el paquete de login con TLS 1.0 siempre, aun
          con `encrypt: false` en la cadena de conexión. Node 20+ lo rechaza, y
          el error que devuelve no menciona TLS por ningún lado.

          Va como bandera del proceso porque cuando el código corre, OpenSSL ya
          está inicializado y no se puede cambiar desde adentro.

          Efecto lateral a tener presente: baja el mínimo de TLS de TODAS las
          conexiones salientes del proceso, no sólo la de SQL.
        */
        NODE_OPTIONS: '--tls-min-v1.0',
      },
    },
  ],
};
