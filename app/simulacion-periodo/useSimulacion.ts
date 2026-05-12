'use client';
import { useState, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface AeropuertoSim { codigo: string; ciudad: string; pais: string; latitud: number; longitud: number; continente: string; capacidad: number; }
export interface VueloPlan { origen: string; destino: string; horaSalida: string; horaLlegada: string; capacidad: number; latOrigen: number; lngOrigen: number; latDestino: number; lngDestino: number; }
export interface RutaPlan { idEnvio: string; aeropuertoOrigen: string; aeropuertoDestino: string; cantidadMaletas: number; tiempoTotalMinutos: number; estado: string; fitness: number; vuelos: VueloPlan[]; }
export interface Stats { enviosProcesados: number; planificados: number; sinRuta: number; inalcanzables: number; enviosEnEspera: number; fitnessPromedio: number; totalMaletasPlanificadas: number; }
export interface Colapso { tipoError: string; idEnvioCausante: string; rutaCausante: string; maletasCausantes: number; detalle: string; }
export interface Resumen { totalEnviosPlanificados: number; totalMaletasPlanificadas: number; consumoPromedioSLA: number; ocupacionPromedioVuelos: number; ocupacionPromedioAlmacenes: number; funcionObjetivo: number; tiempoEjecucionRealSegundos: number; colapsoDetectado: boolean; }
export interface SimEvent { tipo: string; relojSimulado: string; limiteLectura: string; iteracionActual: number; totalIteracionesEstimadas: number; aeropuertos?: AeropuertoSim[]; rutasPlanificadas?: RutaPlan[]; estadisticas?: Stats; colapso?: Colapso; resumenFinal?: Resumen; }
export interface LogEntry { time: string; text: string; color: string; }

export function useSimulacion(startDate?: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [aeropuertos, setAeropuertos] = useState<AeropuertoSim[]>([]);
  const [allRutas, setAllRutas] = useState<RutaPlan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [colapso, setColapso] = useState<Colapso | null>(null);
  const [iteracion, setIteracion] = useState(0);
  const [totalIter, setTotalIter] = useState(120);
  const [reloj, setReloj] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalPlanificados, setTotalPlanificados] = useState(0);
  const [totalMaletas, setTotalMaletas] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const addLog = useCallback((text: string, color: string) => {
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setLogs(prev => [{ time: t, text, color }, ...prev].slice(0, 100));
  }, []);

  const iniciar = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setIsRunning(true); setAllRutas([]); setStats(null); setResumen(null); setColapso(null);
    setIteracion(0); setLogs([]); setTotalPlanificados(0); setTotalMaletas(0);
    addLog('Simulación iniciada: Período 5 días (GA)', '#22c55e');

    // Calcular fechas: inicio y fin (5 días después)
    let inicio = '20270102-00-00';
    let fin = '20270107-00-00';
    
    if (startDate) {
      // Convertir YYYY-MM-DD a YYYYMMDD
      const [year, month, day] = startDate.split('-');
      const startFormatted = `${year}${month}${day}-00-00`;
      
      // Calcular fecha final (5 días después)
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + 5);
      
      const endYear = endDateObj.getFullYear();
      const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getDate()).padStart(2, '0');
      const endFormatted = `${endYear}${endMonth}${endDay}-00-00`;
      
      inicio = startFormatted;
      fin = endFormatted;
    }

    const url = `${API}/api/simulacion/periodo/stream?inicio=${inicio}&fin=${fin}&ta=30&sa=10&k=6&tamano=10`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('INICIO', (e: MessageEvent) => {
      const d: SimEvent = JSON.parse(e.data);
      if (d.aeropuertos) setAeropuertos(d.aeropuertos);
      setTotalIter(d.totalIteracionesEstimadas);
      setReloj(d.relojSimulado);
      addLog(`Aeropuertos cargados: ${d.aeropuertos?.length || 0}`, '#22c55e');
    });

    es.addEventListener('ITERACION', (e: MessageEvent) => {
      const d: SimEvent = JSON.parse(e.data);
      setIteracion(d.iteracionActual);
      setTotalIter(d.totalIteracionesEstimadas);
      setReloj(d.relojSimulado);
      if (d.estadisticas) {
        setStats(d.estadisticas);
        if (d.estadisticas.planificados > 0) {
          setTotalPlanificados(prev => prev + d.estadisticas!.planificados);
          setTotalMaletas(prev => prev + d.estadisticas!.totalMaletasPlanificadas);
        }
      }
      if (d.rutasPlanificadas && d.rutasPlanificadas.length > 0) {
        const planificadas = d.rutasPlanificadas.filter(r => r.estado === 'PLANIFICADA' && r.vuelos.length > 0);
        console.log("[ITERACION HOOK] Rutas recibidas:", d.rutasPlanificadas.length, "| Rutas filtradas:", planificadas.length);
        if (planificadas.length > 0) {
          setAllRutas(prev => [...prev, ...planificadas]);
          addLog(`Iter ${d.iteracionActual}: ${planificadas.length} rutas planificadas (${planificadas.reduce((s,r)=>s+r.cantidadMaletas,0)} maletas)`, '#22c55e');
        }
      }
    });

    es.addEventListener('COLAPSO', (e: MessageEvent) => {
      const d: SimEvent = JSON.parse(e.data);
      if (d.colapso) { setColapso(d.colapso); addLog(`COLAPSO: ${d.colapso.tipoError}`, '#ef4444'); }
    });

    es.addEventListener('RESUMEN_FINAL', (e: MessageEvent) => {
      const d: SimEvent = JSON.parse(e.data);
      if (d.resumenFinal) setResumen(d.resumenFinal);
      setIsRunning(false);
      addLog('Simulación finalizada', '#22c55e');
      es.close();
    });

    es.onerror = () => { addLog('Error de conexión SSE', '#ef4444'); setIsRunning(false); es.close(); };
  }, [addLog, startDate]);

  const detener = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setIsRunning(false); addLog('Simulación detenida manualmente', '#f97316');
  }, [addLog]);

  const progreso = totalIter > 0 ? (iteracion / totalIter) * 100 : 0;
  const diaActual = Math.min(5, Math.floor(iteracion / (totalIter / 5)) + 1);

  return { isRunning, aeropuertos, allRutas, stats, resumen, colapso, iteracion, totalIter, reloj, logs, totalPlanificados, totalMaletas, progreso, diaActual, iniciar, detener };
}
