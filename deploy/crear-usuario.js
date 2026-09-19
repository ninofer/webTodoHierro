/**
 * Alta de un usuario del portal.
 *
 *   node deploy/crear-usuario.js
 *
 * Escribe en el archivo que indica USUARIOS_ARCHIVO del .env. Ese archivo NO se
 * commitea: está en .gitignore y contiene los hashes del padrón.
 *
 * La contraseña la escribe el usuario en su consola. No viaja por el chat.
 */
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { createInterface } = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const argon2 = require('argon2');

function rutaDelPadron() {
  const desdeEntorno = process.env.USUARIOS_ARCHIVO;
  if (desdeEntorno && desdeEntorno.trim() !== '') return desdeEntorno.trim();

  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const linea = env.split(/\r?\n/).find((l) => l.startsWith('USUARIOS_ARCHIVO='));
  if (linea) return linea.slice('USUARIOS_ARCHIVO='.length).trim();

  throw new Error(
    'No se pudo determinar dónde está el padrón. Definí USUARIOS_ARCHIVO en el .env ' +
      'de la raíz, o pasala como variable de entorno antes de correr este script.',
  );
}

async function principal() {
  const ruta = rutaDelPadron();
  const consola = createInterface({ input: stdin, output: stdout });

  const nick = (await consola.question('Usuario     : ')).trim().toLowerCase();
  const clave = await consola.question('Contrasena  : ');
  const nombre = (await consola.question('Nombre real : ')).trim();
  consola.close();

  if (nick.length < 3) throw new Error('El usuario necesita al menos 3 caracteres.');
  if (clave.length < 10) throw new Error('La contraseña necesita al menos 10 caracteres.');
  if (nombre.length === 0) throw new Error('Falta el nombre real, que es lo que se muestra en pantalla.');

  const padron = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : [];
  if (padron.some((u) => u.nick === nick)) {
    throw new Error(`El usuario "${nick}" ya existe en ${ruta}. Borralo del archivo si querés recrearlo.`);
  }

  padron.push({
    nick,
    nombre,
    hash: await argon2.hash(clave, { type: argon2.argon2id }),
    alta: new Date().toISOString(),
  });

  writeFileSync(ruta, JSON.stringify(padron, null, 2), 'utf8');
  console.log(`Usuario "${nick}" creado en ${ruta}. Total en el padrón: ${padron.length}`);
  console.log('El API relee el padrón al reiniciar: pm2 restart todohierro-api');
}

principal().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
