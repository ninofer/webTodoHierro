@echo off
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
