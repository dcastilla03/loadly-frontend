'use client';
import { useState, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface AeropuertoSim { codigo: string; ciudad: string; pais: string; latitud: number; longitud: number; continente: string; capacidad: number; }
export interface Stats { enviosProcesados: number; planificados: number; sinRuta: number; inalcanzables: number; enviosEnEspera: number; fitnessPromedio: number; totalMaletasPlanificadas: number; }
export interface Colapso { tipoError: string; idEnvioCausante: string; rutaCausante: string; maletasCausantes: number; detalle: string; }
export interface Resumen { totalEnviosPlanificados: number; totalMaletasPlanificadas: number; consumoPromedioSLA: number; ocupacionPromedioVuelos: number; ocupacionPromedioAlmacenes: number; funcionObjetivo: number; tiempoEjecucionRealSegundos: number; colapsoDetectado: boolean; }
export interface LogEntry { time: string; text: string; color: string; }

/** Un tramo de vuelo listo para ser animado por el cronómetro simulado */
export interface FlightEvent {
  key: string;                      // identificador único del tramo
  tramoOrden: number;
  origenCode: string;
  destinoCode: string;
  latOrigen: number;
  lngOrigen: number;
  latDestino: number;
  lngDestino: number;
  minutosInicio: number;            // minutos desde el inicio de la simulación (tiempo simulado)
  minutosFin: number;
  maletasVuelo: number;
  capacidadVuelo: number;
  ocupacionAlmacenOrigen: number;
  capacidadAlmacenOrigen: number;
  ocupacionAlmacenDestino: number;
  capacidadAlmacenDestino: number;
  // campos de runtime (la página los gestiona)
  active?: boolean;
  done?: boolean;
  svgElement?: any;
  airplaneGroup?: any;
  airplaneImage?: any;
}

interface BackendAeropuerto {
  codigo: string;
  ciudad: string;
  pais: string;
  latitud: number;
  longitud: number;
  continente: string;
  capacidad: number;
}

interface BackendVueloPlanificado {
  orden: number;
  origen: string;
  destino: string;
  sale: string;   // "HH:MM"
  llega: string;  // "HH:MM"
  maletasVuelo: number;
  capacidadVuelo: number;
  ocupacionAlmacenOrigen: number;
  capacidadAlmacenOrigen: number;
  ocupacionAlmacenDestino: number;
  capacidadAlmacenDestino: number;
}

interface BackendRutaPlanificada {
  idEnvio: string;
  idCliente?: string;
  origen: string;
  destino: string;
  maletas: number;
  fechaRegistro: string;  // "DD/MM/YYYY HH:MM"
  fechaRecojo?: string;
  ocupacionAlmacenRegistro?: number;
  capacidadAlmacenRegistro?: number;
  ocupacionAlmacenRecojo?: number;
  capacidadAlmacenRecojo?: number;
  duracion: string;
  sla: string;
  tramos: BackendVueloPlanificado[];
}

interface BackendSimEvent {
  tipo: string;
  relojSimulado: string;   // "YYYY-MM-DD HH:MM"
  limiteLectura?: string;  // "YYYY-MM-DD HH:MM"
  totalIteracionesEstimadas?: number;
  aeropuertos?: BackendAeropuerto[];
  estadisticas?: Stats;
  rutasPlanificadas?: BackendRutaPlanificada[];
  colapso?: Colapso;
  resumenFinal?: Resumen;
}

/** Convierte "HH:MM" a minutos del día */
function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Convierte "YYYY-MM-DD HH:MM" a minutos desde el inicio de la simulación */
function fechaHoraAMinutosDesdeInicio(fechaHoraStr: string, simStartDate: Date): number {
  // formato esperado: "2026-01-01 03:20"
  const [datePart, timePart] = fechaHoraStr.split(' ');
  if (!datePart || !timePart) return 0;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, min] = timePart.split(':').map(Number);
  const fecha = new Date(year, month - 1, day, hour, min, 0, 0);
  return Math.round((fecha.getTime() - simStartDate.getTime()) / 60000);
}

/**
 * Para un tramo cuya hora de salida es "sale" (HH:MM) y el día de referencia
 * proviene de limiteLectura, calcula los minutos absolutos desde el inicio
 * de la simulación. Si llega < sale → llega es al día siguiente.
 */
function calcularMinutosTramo(
  sale: string,
  llega: string,
  limiteLectura: string,  // "YYYY-MM-DD HH:MM"
  simStartDate: Date
): { minutosInicio: number; minutosFin: number } {
  // Extraer solo la fecha de limiteLectura
  const [limFecha] = limiteLectura.split(' ');
  const [limYear, limMonth, limDay] = limFecha.split('-').map(Number);

  const saleMin = horaAMinutos(sale);
  const llegaMin = horaAMinutos(llega);

  // Día base: mismo que limiteLectura
  const baseFechaSalida = new Date(limYear, limMonth - 1, limDay, 0, 0, 0, 0);

  // Hora de salida: si saleMin >= hora de limiteLectura → mismo día, sino día siguiente
  const limHoraMin = horaAMinutos(limiteLectura.split(' ')[1] || '00:00');
  let salidaFecha = new Date(baseFechaSalida);
  if (saleMin < limHoraMin) {
    // La salida está después de la medianoche del día de limiteLectura → +1 día
    salidaFecha = new Date(baseFechaSalida.getTime() + 24 * 60 * 60 * 1000);
  }

  const minutosInicio = Math.round(
    (salidaFecha.getTime() + saleMin * 60000 - simStartDate.getTime()) / 60000
  );

  // Hora de llegada: si llega < sale → día siguiente al de salida
  let llegaOffsetDias = 0;
  if (llegaMin < saleMin) llegaOffsetDias = 1;
  const llegadaFecha = new Date(salidaFecha.getTime() + llegaOffsetDias * 24 * 60 * 60 * 1000);
  const minutosFin = Math.round(
    (llegadaFecha.getTime() + llegaMin * 60000 - simStartDate.getTime()) / 60000
  );

  return { minutosInicio, minutosFin };
}

/**
 * Convierte una ruta del backend a un array de FlightEvents (uno por tramo).
 * Retorna [] si faltan aeropuertos en el mapa.
 */
function rutaAFlightEvents(
  ruta: BackendRutaPlanificada,
  limiteLectura: string,
  aeropuertos: Map<string, AeropuertoSim>,
  simStartDate: Date,
  iteracionIdx: number
): FlightEvent[] {
  const events: FlightEvent[] = [];

  for (const tramo of ruta.tramos ?? []) {
    const aOrigen = aeropuertos.get(tramo.origen);
    const aDestino = aeropuertos.get(tramo.destino);
    if (!aOrigen || !aDestino) continue;

    const { minutosInicio, minutosFin } = calcularMinutosTramo(
      tramo.sale, tramo.llega, limiteLectura, simStartDate
    );

    const key = `${ruta.idEnvio}-${ruta.idCliente || 'x'}-iter${iteracionIdx}-tramo${tramo.orden}`;

    events.push({
      key,
      tramoOrden: tramo.orden,
      origenCode: tramo.origen,
      destinoCode: tramo.destino,
      latOrigen: aOrigen.latitud,
      lngOrigen: aOrigen.longitud,
      latDestino: aDestino.latitud,
      lngDestino: aDestino.longitud,
      minutosInicio,
      minutosFin,
      maletasVuelo: tramo.maletasVuelo,
      capacidadVuelo: tramo.capacidadVuelo,
      ocupacionAlmacenOrigen: tramo.ocupacionAlmacenOrigen,
      capacidadAlmacenOrigen: tramo.capacidadAlmacenOrigen,
      ocupacionAlmacenDestino: tramo.ocupacionAlmacenDestino,
      capacidadAlmacenDestino: tramo.capacidadAlmacenDestino,
      active: false,
      done: false,
    });
  }

  return events;
}

export function useSimulacion(startDate?: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [aeropuertos, setAeropuertos] = useState<AeropuertoSim[]>([]);
  const [allFlightEvents, setAllFlightEvents] = useState<FlightEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [colapso, setColapso] = useState<Colapso | null>(null);
  const [iteracion, setIteracion] = useState(0);
  const [totalIter, setTotalIter] = useState(120);
  const [reloj, setReloj] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalPlanificados, setTotalPlanificados] = useState(0);
  const [totalMaletas, setTotalMaletas] = useState(0);

  // Fecha de inicio de la simulación (para calcular minutos relativos)
  const simStartDateRef = useRef<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const aeropuertosRef = useRef<Map<string, AeropuertoSim>>(new Map());
  const iteracionIdxRef = useRef(0);

  // Tiempo real en que comenzó la animación del cronómetro
  const realStartTimeRef = useRef<number | null>(null);

  const addLog = useCallback((text: string, color: string) => {
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setLogs(prev => [{ time: t, text, color }, ...prev].slice(0, 100));
  }, []);

  const iniciar = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setIsRunning(true);
    setAllFlightEvents([]);
    setStats(null); setResumen(null); setColapso(null);
    setIteracion(0); setLogs([]); setTotalPlanificados(0); setTotalMaletas(0);
    iteracionIdxRef.current = 0;
    realStartTimeRef.current = performance.now();
    addLog('Simulación iniciada: Período 5 días (GA)', '#22c55e');

    // Calcular fechas de inicio y fin
    let inicio = '20270102-00-00';
    let fin = '20270107-00-00';
    let simStart = new Date(2027, 0, 2, 0, 0, 0, 0);

    if (startDate) {
      const [year, month, day] = startDate.split('-');
      const startFormatted = `${year}${month}${day}-00-00`;
      const startDateObj = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
      simStart = startDateObj;

      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + 5);
      const endYear = endDateObj.getFullYear();
      const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getDate()).padStart(2, '0');
      inicio = startFormatted;
      fin = `${endYear}${endMonth}${endDay}-00-00`;
    }

    simStartDateRef.current = simStart;

    const url = `${API}/api/simulacion/periodo/iniciar?inicioStr=${inicio}&finStr=${fin}&taSegundos=30&sa=10&k=6&tamano=10`;
    const es = new EventSource(url);
    esRef.current = es;

    // El backend envía: data:{...} sin línea event: previa
    // → todos los mensajes llegan como evento 'message' estándar.
    // Despachamos por d.tipo en un único handler.
    const procesarMensaje = (d: BackendSimEvent) => {
      const tipo = (d.tipo || '').toUpperCase();
      console.log('[SSE] tipo recibido:', tipo, '| reloj:', d.relojSimulado);

      if (tipo === 'INICIO') {
        if (d.aeropuertos && d.aeropuertos.length > 0) {
          const mapeados: AeropuertoSim[] = d.aeropuertos.map((a) => ({
            codigo: a.codigo, ciudad: a.ciudad, pais: a.pais,
            latitud: a.latitud, longitud: a.longitud,
            continente: a.continente, capacidad: a.capacidad,
          }));
          setAeropuertos(mapeados);
          aeropuertosRef.current = new Map(mapeados.map((a) => [a.codigo, a]));
        }
        if (typeof d.totalIteracionesEstimadas === 'number' && d.totalIteracionesEstimadas > 0) {
          setTotalIter(d.totalIteracionesEstimadas);
        }
        if (d.relojSimulado) setReloj(d.relojSimulado);
        addLog(`Aeropuertos cargados: ${d.aeropuertos?.length || 0}`, '#22c55e');

      } else if (tipo === 'ITERACION') {
        const iterIdx = iteracionIdxRef.current++;
        setIteracion(iterIdx + 1);

        if (d.relojSimulado) setReloj(d.relojSimulado);
        if (typeof d.totalIteracionesEstimadas === 'number' && d.totalIteracionesEstimadas > 0) {
          setTotalIter(d.totalIteracionesEstimadas);
        }
        if (d.estadisticas) {
          setStats(d.estadisticas);
          if (d.estadisticas.planificados > 0) {
            setTotalPlanificados(prev => prev + d.estadisticas!.planificados);
            setTotalMaletas(prev => prev + d.estadisticas!.totalMaletasPlanificadas);
          }
        }

        const limLectura = d.limiteLectura || d.relojSimulado || '';
        const simStart = simStartDateRef.current;

        if (d.rutasPlanificadas && d.rutasPlanificadas.length > 0 && simStart && limLectura) {
          const nuevosEventos: FlightEvent[] = [];
          d.rutasPlanificadas.forEach(ruta => {
            const eventos = rutaAFlightEvents(ruta, limLectura, aeropuertosRef.current, simStart, iterIdx);
            nuevosEventos.push(...eventos);
          });

          if (nuevosEventos.length > 0) {
            console.log(`[ITER ${iterIdx}] ${nuevosEventos.length} flight events añadidos al cronómetro`);
            setAllFlightEvents(prev => [...prev, ...nuevosEventos]);
            addLog(`Iter ${iterIdx + 1}: ${d.rutasPlanificadas.length} rutas → ${nuevosEventos.length} tramos en cola`, '#22c55e');
          }
        }

      } else if (tipo === 'COLAPSO') {
        if (d.colapso) { setColapso(d.colapso); addLog(`COLAPSO: ${d.colapso.tipoError}`, '#ef4444'); }

      } else if (tipo === 'RESUMEN_FINAL') {
        if (d.resumenFinal) setResumen(d.resumenFinal);
        setIsRunning(false);
        addLog('Simulación finalizada', '#22c55e');
        es.close();
      }
    };

    // Escuchar evento genérico 'message' (sin event: header en el SSE)
    es.onmessage = (e: MessageEvent) => {
      try {
        const d: BackendSimEvent = JSON.parse(e.data);
        procesarMensaje(d);
      } catch (err) {
        console.warn('[SSE] Error parseando mensaje:', e.data, err);
      }
    };

    // También intentar escuchar los tipos nombrados por si el backend los usa
    // (no hace daño tenerlos como fallback)
    ['INICIO', 'ITERACION', 'COLAPSO', 'RESUMEN_FINAL'].forEach(tipo => {
      es.addEventListener(tipo, (e: MessageEvent) => {
        try {
          const d: BackendSimEvent = JSON.parse(e.data);
          if (!d.tipo) d.tipo = tipo; // asegurar que tipo esté presente
          procesarMensaje(d);
        } catch (err) {
          console.warn(`[SSE] Error parseando evento ${tipo}:`, err);
        }
      });
    });

    es.onerror = (err) => {
      console.error('[SSE] Error de conexión:', err);
      addLog('Error de conexión SSE', '#ef4444');
      setIsRunning(false);
      es.close();
    };
  }, [addLog, startDate]);

  const detener = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setIsRunning(false); addLog('Simulación detenida manualmente', '#f97316');
  }, [addLog]);

  const totalIterSeguro = Number.isFinite(totalIter) && totalIter > 0 ? totalIter : 120;
  const progreso = totalIterSeguro > 0 ? (iteracion / totalIterSeguro) * 100 : 0;
  const diaActual = Math.min(5, Math.floor(iteracion / (totalIterSeguro / 5)) + 1);

  return {
    isRunning, aeropuertos, allFlightEvents, stats, resumen, colapso,
    iteracion, totalIter: totalIterSeguro, reloj, logs,
    totalPlanificados, totalMaletas, progreso, diaActual,
    iniciar, detener,
    realStartTimeRef,
    simStartDateRef,
  };
}
