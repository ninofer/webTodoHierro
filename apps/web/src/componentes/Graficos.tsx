import { useState } from 'react';
import { fechaLocal, formatearGuaranies } from '@todohierro/shared';

/*
 * Los dos gráficos de los reportes. Son de una sola serie: un solo color
 * (--serie-1), sin leyenda (el título dice qué se grafica) y el texto siempre en
 * los grises de texto, nunca en el color de la serie.
 *
 * Marcas finas: barras de 12px con el extremo del dato redondeado 4px y el de la
 * base recto; grilla de 1px, recesiva. La tabla de debajo de cada gráfico es la
 * vista accesible con todos los valores.
 */

/** 1.302.095.800 → «1.302 M»; para los ejes, donde no entra la cifra entera. */
export function compacto(monto: number): string {
  if (Math.abs(monto) >= 1e6) return formatearGuaranies(Math.round(monto / 1e6)) + ' M';
  if (Math.abs(monto) >= 1e3) return formatearGuaranies(Math.round(monto / 1e3)) + ' mil';
  return formatearGuaranies(monto);
}

/** El próximo número «redondo» (1, 2, 2,5, 5 × 10ⁿ) mayor o igual que `v`. */
function techoRedondo(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((f) => f * p >= v) ?? 10) * p;
}

/* ------------------------------------------------------------------ */

export function BarrasHorizontales({
  datos,
  detalle,
}: {
  datos: Array<{ rotulo: string; total: number }>;
  /** Texto chico junto al monto, por ejemplo el porcentaje. */
  detalle?: (i: number) => string;
}) {
  const maximo = Math.max(...datos.map((d) => d.total), 0);
  if (datos.length === 0) return <p className="py-6 text-center text-sm text-slate-500">Sin datos en el período.</p>;

  return (
    <ul className="space-y-3">
      {datos.map((d, i) => (
        <li key={d.rotulo} title={`${d.rotulo}: Gs ${formatearGuaranies(d.total)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{d.rotulo}</span>
            <span className="shrink-0 tabular-nums text-slate-900 dark:text-slate-100">
              Gs {formatearGuaranies(d.total)}
              {detalle && <span className="ml-1.5 text-slate-500 dark:text-slate-400">{detalle(i)}</span>}
            </span>
          </div>
          <div className="h-3">
            <div
              className="h-3 rounded-r"
              style={{
                width: `${maximo === 0 ? 0 : Math.max((d.total / maximo) * 100, 0.5)}%`,
                background: 'var(--serie-1)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

const ALTO = 180;
const MARGEN_IZQ = 48;
const MARGEN_ABAJO = 22;
const ANCHO_MAXIMO_COLUMNA = 24;

/**
 * Una columna por día. Columnas y no línea: los días sin venta (domingos) son
 * huecos, y una línea los uniría sugiriendo ventas que no hubo.
 */
export function ColumnasPorDia({ datos }: { datos: Array<{ fecha: string; total: number }> }) {
  const [activo, setActivo] = useState<number | null>(null);
  const ancho = 640;
  const areaAncho = ancho - MARGEN_IZQ;
  const areaAlto = ALTO - MARGEN_ABAJO;
  const techo = techoRedondo(Math.max(...datos.map((d) => d.total), 0));
  const ranura = areaAncho / Math.max(datos.length, 1);
  const columna = Math.min(ANCHO_MAXIMO_COLUMNA, ranura * 0.7);
  // Con muchos días no entran todas las etiquetas: una de cada `paso`.
  const paso = Math.max(1, Math.ceil(datos.length / 12));
  const y = (v: number) => areaAlto - (v / techo) * (areaAlto - 8);
  const d = activo === null ? null : datos[activo];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${ancho} ${ALTO}`} className="h-auto w-full" role="img" aria-label="Ventas por día">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={MARGEN_IZQ} x2={ancho} y1={y(techo * f)} y2={y(techo * f)} stroke="var(--grilla)" strokeWidth={1} />
            <text x={MARGEN_IZQ - 6} y={y(techo * f) + 3} textAnchor="end" fontSize={10} className="fill-slate-500 dark:fill-slate-400">
              {compacto(techo * f)}
            </text>
          </g>
        ))}
        {datos.map((dia, i) => {
          const x = MARGEN_IZQ + i * ranura + (ranura - columna) / 2;
          const alto = areaAlto - y(dia.total);
          const r = Math.min(4, alto, columna / 2);
          const arriba = areaAlto - alto;
          return (
            <g key={dia.fecha}>
              {alto > 0 && (
                // Extremo del dato redondeado, base recta.
                <path
                  d={`M${x},${areaAlto} V${arriba + r} Q${x},${arriba} ${x + r},${arriba} H${x + columna - r} Q${x + columna},${arriba} ${x + columna},${arriba + r} V${areaAlto} Z`}
                  fill="var(--serie-1)"
                  opacity={activo === null || activo === i ? 1 : 0.45}
                />
              )}
              {i % paso === 0 && (
                <text x={x + columna / 2} y={ALTO - 6} textAnchor="middle" fontSize={10} className="fill-slate-500 dark:fill-slate-400">
                  {dia.fecha.slice(8, 10)}
                </text>
              )}
              {/* La zona sensible es la ranura entera, no sólo la columna. */}
              <rect
                x={MARGEN_IZQ + i * ranura}
                y={0}
                width={ranura}
                height={areaAlto}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onClick={() => setActivo(activo === i ? null : i)}
              >
                <title>{`${fechaLocal(dia.fecha)}: Gs ${formatearGuaranies(dia.total)}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={MARGEN_IZQ} x2={ancho} y1={areaAlto} y2={areaAlto} stroke="var(--grilla)" strokeWidth={1} />
      </svg>
      {d && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-slate-500 dark:text-slate-400">{fechaLocal(d.fecha)}</p>
          <p className="font-semibold tabular-nums">Gs {formatearGuaranies(d.total)}</p>
        </div>
      )}
    </div>
  );
}
