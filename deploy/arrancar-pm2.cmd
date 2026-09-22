@echo off
REM ---------------------------------------------------------------------------
REM  OBSOLETO desde el 22/09/2026: pc-servicios pasa de Windows a Ubuntu. Ahí
REM  el arranque automatico lo resuelve "pm2 startup systemd" (genera un
REM  servicio real), sin tarea programada ni script propio. Ver
REM  docs/02-despliegue.md. Este archivo queda como referencia historica.
REM ---------------------------------------------------------------------------
REM  Arranque de pm2 al encender pc-servicios.
REM
REM  Lo dispara una tarea programada con el desencadenador "Al iniciar el equipo"
REM  y un minuto de retraso, para que SQL Server y la red estén arriba.
REM
REM  No se usa pm2-windows-startup: escribe en la clave Run del registro, que
REM  necesita que alguien inicie sesion. En un servidor que nadie usa como
REM  escritorio, eso es lo mismo que no tener arranque automatico.
REM
REM  `pm2 resurrect` restaura la lista que guardo `pm2 save`.
REM ---------------------------------------------------------------------------

cd /d C:\todohierro

call pm2 resurrect

REM Deja constancia de que la tarea corrio, con fecha. Si el sitio no vuelve
REM despues de un reinicio, esto dice si el problema fue el arranque o el proceso.
echo [%date% %time%] pm2 resurrect ejecutado >> C:\todohierro\logs\arranque.log
