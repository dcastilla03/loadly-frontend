'use client';
import { useState, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

export interface AeropuertoSim { codigo: string; ciudad: string; pais: string; latitud: number; longitud: number; continente: string; capacidad: number; }
export interface Stats { enviosProcesados: number; planificados: number; sinRuta: number; inalcanzables: number; enviosEnEspera: number; fitnessPromedio: number; totalMaletasPlanificadas: number; }
export interface Colapso { tipoError: string; idEnvioCausante: string; rutaCausante: string; maletasCausantes: number; detalle: string; }
export interface Resumen { totalEnviosPlanificados: number; totalMaletasPlanificadas: number; consumoPromedioSLA: number; ocupacionPromedioVuelos: number; ocupacionPromedioAlmacenes: number; funcionObjetivo: number; tiempoEjecucionRealSegundos: number; colapsoDetectado: boolean; }
export interface LogEntry { time: string | null; text: string; color: string; }

/** Un tramo de vuelo listo para ser animado por el cronómetro simulado */
export interface FlightEvent {
  key: string;                      // identificador único del tramo
  tramoOrden: number;
  origenCode: string;
  destinoCode: string;
  planVueloRuta: string[];
  planVueloTipo: 'Directo' | 'Por escalas';
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

/** Evento de log temporizado — se dispara cuando el cronómetro simulado alcanza minutosDisparo */
export interface LogEvent {
  minutosDisparo: number;  // minutos desde el inicio de la simulación
  text: string;
  color: string;
  fired?: boolean;         // gestionado por el loop de animación en page.tsx
  updatePopupCode?: string;
  updatePopupOcupacion?: number;
  updatePopupCapacidad?: number;
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

/** Extrae la fecha de una cadena formato "yyyy-MM-dd HH:mm" o "DD/MM/YYYY HH:MM" */
function extraerFecha(fechaStr: string): Date {
  if (fechaStr.includes('-')) {
    // Formato "yyyy-MM-dd HH:mm"
    const [datePart, timePart] = fechaStr.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, min] = timePart?.split(':').map(Number) || [0, 0];
    return new Date(year, month - 1, day, hour, min, 0, 0);
  } else {
    // Formato "DD/MM/YYYY HH:MM"
    const parts = fechaStr.split(' ');
    const [day, month, year] = parts[0].split('/').map(Number);
    const [hour, min] = parts[1]?.split(':').map(Number) || [0, 0];
    return new Date(year, month - 1, day, hour, min, 0, 0);
  }
}

/** Convierte "HH:MM:SS" o "HH:MM" a minutos del día */
function horaConMinutosDelDia(horaStr: string): number {
  const parts = horaStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

/** Convierte "YYYY-MM-DD HH:MM" a minutos desde el inicio de la simulación */
function fechaHoraAMinutosDesdeInicio(fechaHoraStr: string, simStartDate: Date): number {
  const fecha = extraerFecha(fechaHoraStr);
  return Math.round((fecha.getTime() - simStartDate.getTime()) / 60000);
}




function rutaAFlightEvents(
  ruta: BackendRutaPlanificada,
  limiteLectura: string,
  aeropuertos: Map<string, AeropuertoSim>,
  simStartDate: Date,
  iteracionIdx: number
): FlightEvent[] {
  const events: FlightEvent[] = [];

  let cursorDate = extraerFecha(ruta.fechaRegistro);
  const rutaCompleta = [ruta.origen, ...(ruta.tramos ?? []).map(tramo => tramo.destino)].filter((codigo, index, lista) => index === 0 || codigo !== lista[index - 1]);
  const planVueloTipo: 'Directo' | 'Por escalas' = (ruta.tramos?.length ?? 0) <= 1 ? 'Directo' : 'Por escalas';

  for (const tramo of ruta.tramos ?? []) {
    const aOrigen = aeropuertos.get(tramo.origen);
    const aDestino = aeropuertos.get(tramo.destino);
    if (!aOrigen || !aDestino) continue;

    const saleParts = tramo.sale.split(':').map(Number);
    let saleDate = new Date(cursorDate);
    saleDate.setHours(saleParts[0], saleParts[1], 0, 0);
    if (saleDate.getTime() < cursorDate.getTime()) {
      saleDate.setDate(saleDate.getDate() + 1);
    }

    const llegaParts = tramo.llega.split(':').map(Number);
    let llegaDate = new Date(saleDate);
    llegaDate.setHours(llegaParts[0], llegaParts[1], 0, 0);
    if (llegaDate.getTime() < saleDate.getTime()) {
      llegaDate.setDate(llegaDate.getDate() + 1);
    }

    const minutosInicio = Math.round((saleDate.getTime() - simStartDate.getTime()) / 60000);
    const minutosFin = Math.round((llegaDate.getTime() - simStartDate.getTime()) / 60000);
    
    cursorDate = llegaDate;

    const key = `${ruta.idEnvio}-${ruta.idCliente || 'x'}-iter${iteracionIdx}-tramo${tramo.orden}`;

    events.push({
      key,
      tramoOrden: tramo.orden,
      origenCode: tramo.origen,
      destinoCode: tramo.destino,
      planVueloRuta: rutaCompleta,
      planVueloTipo,
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

/**
 * Construye los LogEvents temporizados para una ruta planificada.
 * Cada evento lleva minutosDisparo = tiempo simulado en que debe aparecer.
 */
function buildLogEvents(
  ruta: BackendRutaPlanificada,
  limiteLectura: string,
  simStartDate: Date
): LogEvent[] {
  const events: LogEvent[] = [];
  const tramos = ruta.tramos ?? [];
  const totalTramos = tramos.length;

  // ── Evento 1: Envío registrado (a la hora de fechaRegistro) ─────────────
  const minutosRegistro = ruta.fechaRegistro
    ? fechaHoraAMinutosDesdeInicio(ruta.fechaRegistro, simStartDate)
    : 0;
  const esDirecto = totalTramos <= 1;
  
  // Extraer solo la hora de tramo.sale
  const salidaTexto = totalTramos > 0 ? ` · Salida ${tramos[0].sale.split(':').slice(0, 2).join(':')}` : '';
  
  const codigoRastreo = (ruta.idEnvio.slice(-7) + (ruta.idCliente || '').slice(-5)).padStart(12, '0');
  const textRegistro = esDirecto
    ? `📦 Envío ${codigoRastreo}: ${ruta.maletas} maleta${ruta.maletas !== 1 ? 's' : ''} · ${ruta.origen} → ${ruta.destino} · Directo${salidaTexto}`
    : `📦 Envío ${codigoRastreo}: ${ruta.maletas} maleta${ruta.maletas !== 1 ? 's' : ''} · ${ruta.origen} → ${ruta.destino} · Escalas: ${tramos.slice(0, -1).map(t => t.destino).join(', ')}${salidaTexto}`;
  events.push({ 
    minutosDisparo: minutosRegistro, 
    text: textRegistro, 
    color: '#22c55e',
    updatePopupCode: ruta.origen,
    updatePopupOcupacion: ruta.ocupacionAlmacenRegistro,
    updatePopupCapacidad: ruta.capacidadAlmacenRegistro
  });

  // ── Eventos 2 & 3: Salida y llegada por cada tramo ───────────────────────
  let cursorDate = extraerFecha(ruta.fechaRegistro);
  
  for (const tramo of tramos) {
    const saleParts = tramo.sale.split(':').map(Number);
    let saleDate = new Date(cursorDate);
    saleDate.setHours(saleParts[0], saleParts[1], 0, 0);
    if (saleDate.getTime() < cursorDate.getTime()) {
      saleDate.setDate(saleDate.getDate() + 1);
    }

    const llegaParts = tramo.llega.split(':').map(Number);
    let llegaDate = new Date(saleDate);
    llegaDate.setHours(llegaParts[0], llegaParts[1], 0, 0);
    if (llegaDate.getTime() < saleDate.getTime()) {
      llegaDate.setDate(llegaDate.getDate() + 1);
    }

    const minutosInicio = Math.round((saleDate.getTime() - simStartDate.getTime()) / 60000);
    const minutosFin = Math.round((llegaDate.getTime() - simStartDate.getTime()) / 60000);
    
    cursorDate = llegaDate;

    const textSalida = totalTramos > 1
      ? `✈️ Sale avión de ${tramo.origen} → ${tramo.destino} (Tramo ${tramo.orden}/${totalTramos})`
      : `✈️ Sale avión de ${tramo.origen} → ${tramo.destino}`;
    events.push({ minutosDisparo: minutosInicio, text: textSalida, color: '#3b82f6' });
    events.push({ minutosDisparo: minutosFin,    text: `🛬 Llega avión a ${tramo.destino} (desde ${tramo.origen})`, color: '#8b5cf6' });
  }

  // ── Evento 4: Envío completado (a la hora de fechaRecojo) ───────────────
  if (ruta.fechaRecojo) {
    const minutosRecojo = fechaHoraAMinutosDesdeInicio(ruta.fechaRecojo, simStartDate);
    const codigoRastreo = (ruta.idEnvio.slice(-7) + (ruta.idCliente || '').slice(-5)).padStart(12, '0');
    events.push({
      minutosDisparo: minutosRecojo,
      text: `✅ Envío ${codigoRastreo} completado satisfactoriamente · ${ruta.origen} → ${ruta.destino}`,
      color: '#f59e0b',
    });
  }

  return events;
}

export const SIM_CONFIG = {
  Sa: 2, // Minutos
  Ta: 60, // Segundos
  K: 120, // Aceleración
};

export function useSimulacion(startDate?: string, startTime?: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [aeropuertos, setAeropuertos] = useState<AeropuertoSim[]>([]);
  const [allFlightEvents, setAllFlightEvents] = useState<FlightEvent[]>([]);
  const [allLogEvents,    setAllLogEvents]    = useState<LogEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [colapso, setColapso] = useState<Colapso | null>(null);
  const [iteracion, setIteracion] = useState(0);
  const [totalIter, setTotalIter] = useState(20);
  const [reloj, setReloj] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalPlanificados, setTotalPlanificados] = useState(0);
  const [totalMaletas, setTotalMaletas] = useState(0);

  // Fecha de inicio de la simulación (para calcular minutos relativos)
  const simStartDateRef = useRef<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const aeropuertosRef = useRef<Map<string, AeropuertoSim>>(new Map());
  const iteracionIdxRef = useRef(0);
  const rutasPlanificadasRef = useRef<Map<string, BackendRutaPlanificada>>(new Map());

  // Tiempo real en que comenzó la animación del cronómetro
  const realStartTimeRef = useRef<number | null>(null);

  const addLog = useCallback((text: string, color: string, minutosSimulados?: number | null) => {
    // Si minutosSimulados es undefined/null, no mostrar hora (eventos antes del cronómetro)
    let t: string | null = null;
    if (typeof minutosSimulados === 'number') {
      // Convertir minutos simulados a formato "Día X — HH:MM" considerando la hora de inicio
      const simStart = simStartDateRef.current;
      if (simStart) {
        const totalMinutos = simStart.getHours() * 60 + simStart.getMinutes() + minutosSimulados;
        const dia = Math.floor(totalMinutos / (24 * 60)) + 1;
        const minDelDia = totalMinutos % (24 * 60);
        const hh = String(Math.floor(minDelDia / 60)).padStart(2, '0');
        const mm = String(minDelDia % 60).padStart(2, '0');
        t = `Día ${dia} ${hh}:${mm}`;
      } else {
        // Fallback si no hay fecha de inicio
        const dia = Math.floor(minutosSimulados / (24 * 60)) + 1;
        const minDelDia = minutosSimulados % (24 * 60);
        const hh = String(Math.floor(minDelDia / 60)).padStart(2, '0');
        const mm = String(minDelDia % 60).padStart(2, '0');
        t = `Día ${dia} ${hh}:${mm}`;
      }
    }
    setLogs(prev => [{ time: t, text, color }, ...prev].slice(0, 100));
  }, []);

  const addLogBatch = useCallback((entries: Array<{ text: string; color: string; minutosDisparo: number }>) => {
    setLogs(prev => {
      let updated = [...prev];
      const simStart = simStartDateRef.current;
      for (const entry of entries) {
        let t: string | null = null;
        if (typeof entry.minutosDisparo === 'number') {
          if (simStart) {
            const totalMinutos = simStart.getHours() * 60 + simStart.getMinutes() + entry.minutosDisparo;
            const dia = Math.floor(totalMinutos / (24 * 60)) + 1;
            const minDelDia = totalMinutos % (24 * 60);
            const hh = String(Math.floor(minDelDia / 60)).padStart(2, '0');
            const mm = String(minDelDia % 60).padStart(2, '0');
            t = `Día ${dia} ${hh}:${mm}`;
          } else {
            // Fallback si no hay fecha de inicio
            const dia = Math.floor(entry.minutosDisparo / (24 * 60)) + 1;
            const minDelDia = entry.minutosDisparo % (24 * 60);
            const hh = String(Math.floor(minDelDia / 60)).padStart(2, '0');
            const mm = String(minDelDia % 60).padStart(2, '0');
            t = `Día ${dia} ${hh}:${mm}`;
          }
        }
        updated = [{ time: t, text: entry.text, color: entry.color }, ...updated];
      }
      return updated.slice(0, 100);
    });
  }, []);

  const iniciar = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setIsRunning(true);
    setAllFlightEvents([]);
    setAllLogEvents([]);
    setStats(null); setResumen(null); setColapso(null);
    setIteracion(0); setLogs([]); setTotalPlanificados(0); setTotalMaletas(0);
    iteracionIdxRef.current = 0;
    realStartTimeRef.current = performance.now();

    // Cargar aeropuertos si aún no están disponibles
    if (aeropuertosRef.current.size === 0) {
      (async () => {
        try {
          const res = await fetch(`${API}/api/aeropuertos`);
          if (res.ok) {
            const response = await res.json();
            const data = response.datos || [];
            const mapeados: AeropuertoSim[] = (Array.isArray(data) ? data : []).map((a: any) => ({
              codigo: a.codigo,
              ciudad: a.ciudad,
              pais: a.pais,
              latitud: a.latitud,
              longitud: a.longitud,
              continente: a.continente || '',
              capacidad: a.capacidad || 500,
            }));
            setAeropuertos(mapeados);
            aeropuertosRef.current = new Map(mapeados.map((a) => [a.codigo, a]));
            addLog(`🌐 Aeropuertos cargados: ${mapeados.length}`, '#6366f1', null);
          } else {
            addLog(`❌ Error cargando aeropuertos (Status ${res.status})`, '#ef4444', null);
          }
        } catch (err) {
          console.error('Error cargando aeropuertos:', err);
          addLog(`❌ Error cargando aeropuertos`, '#ef4444', null);
        }
      })();
    } else {
      addLog(`🌐 Aeropuertos cargados: ${aeropuertosRef.current.size}`, '#6366f1', null);
    }

    addLog('✅ Simulación iniciada — Período 5 días', '#22c55e', null);

    // Calcular fechas de inicio y fin
    let inicio = '20270102-00-00';
    let fin = '20270107-00-00';
    let simStart = new Date(2027, 0, 2, 0, 0, 0, 0);

    if (startDate) {
      const [year, month, day] = startDate.split('-');
      
      // Parse startTime (formato HH:MM)
      let hour = 0, minute = 0;
      if (startTime) {
        const [h, m] = startTime.split(':').map(Number);
        hour = h || 0;
        minute = m || 0;
      }
      
      const startFormatted = `${year}${month}${day}-${String(hour).padStart(2, '0')}-${String(minute).padStart(2, '0')}`;
      const startDateObj = new Date(Number(year), Number(month) - 1, Number(day), hour, minute, 0, 0);
      simStart = startDateObj;

      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + 5);
      const endYear = endDateObj.getFullYear();
      const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getDate()).padStart(2, '0');
      inicio = startFormatted;
      fin = `${endYear}${endMonth}${endDay}-${String(endDateObj.getHours()).padStart(2, '0')}-${String(endDateObj.getMinutes()).padStart(2, '0')}`;
    }

    simStartDateRef.current = simStart;

    const url = `${API}/api/simulacion/periodo/iniciar?inicioStr=${inicio}&finStr=${fin}&taSegundos=${SIM_CONFIG.Ta}&sa=${SIM_CONFIG.Sa}&k=${SIM_CONFIG.K}&tamano=10`;
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
        addLog(`🌐 Aeropuertos cargados: ${d.aeropuertos?.length || 0}`, '#6366f1', null);

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
          const nuevosFlightEvents: FlightEvent[] = [];
          const nuevosLogEvents: LogEvent[] = [];

          d.rutasPlanificadas.forEach(ruta => {
            // Store complete route data for panel display
            rutasPlanificadasRef.current.set(ruta.idEnvio, ruta);
            nuevosFlightEvents.push(...rutaAFlightEvents(ruta, limLectura, aeropuertosRef.current, simStart, iterIdx));
            nuevosLogEvents.push(...buildLogEvents(ruta, limLectura, simStart));
          });

          if (nuevosFlightEvents.length > 0) {
            console.log(`[ITER ${iterIdx}] ${nuevosFlightEvents.length} flight events añadidos al cronómetro`);
            setAllFlightEvents(prev => [...prev, ...nuevosFlightEvents]);
          }
          if (nuevosLogEvents.length > 0) {
            setAllLogEvents(prev => [...prev, ...nuevosLogEvents]);
          }
        }

      } else if (tipo === 'COLAPSO') {
        if (d.colapso) { setColapso(d.colapso); addLog(`⚠️ COLAPSO: ${d.colapso.tipoError}`, '#ef4444'); }

      } else if (tipo === 'RESUMEN_FINAL') {
        if (d.resumenFinal) setResumen(d.resumenFinal);
        setIsRunning(false);
        addLog('🏁 Simulación finalizada correctamente', '#22c55e');
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

  const detener = useCallback(async () => {
    try {
      await fetch(`${API}/api/simulacion/periodo/detener`, { method: 'POST' });
    } catch (error) {
      console.error('Error al detener simulación:', error);
    }
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setIsRunning(false); addLog('Simulación detenida manualmente', '#f97316');
  }, [addLog]);

  const totalIterSeguro = Number.isFinite(totalIter) && totalIter > 0 ? totalIter : 20;
  const progreso = totalIterSeguro > 0 ? (iteracion / totalIterSeguro) * 100 : 0;
  const diaActual = Math.min(5, Math.floor(iteracion / (totalIterSeguro / 5)) + 1);

  return {
    isRunning, aeropuertos, allFlightEvents, allLogEvents, stats, resumen, colapso,
    iteracion, totalIter: totalIterSeguro, reloj, logs,
    totalPlanificados, totalMaletas, progreso, diaActual,
    iniciar, detener, addLog, addLogBatch,
    realStartTimeRef,
    simStartDateRef,
    rutasPlanificadasRef,
  };
}
