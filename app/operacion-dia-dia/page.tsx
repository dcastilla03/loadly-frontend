'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { FlightEvent, LogEvent, LogEntry, BackendRutaPlanificada, fechaHoraAMinutosDesdeInicio, horaConMinutosDelDia, extraerFecha, useSimulacion, SIM_CONFIG, claveEnvio } from '../simulacion-periodo/useSimulacion';
import { useSimulationContext } from '../SimulationContext';

// ─── helper: forzar español en style OpenFreeMap ───────────────────────────
function forceSpanish(style: any): any {
  function walk(v: any): any {
    if (Array.isArray(v)) {
      if (v.length >= 2 && v[0] === 'get' && typeof v[1] === 'string') {
        if (v[1] === 'name_en' || v[1] === 'name:latin') return ['get', 'name:es'];
        if (v[1] === 'name:nonlatin') return ['get', 'name'];
      }
      if (v[0] === 'case' && Array.isArray(v[1]) && v[1][0] === 'has' && v[1][1] === 'name:nonlatin') {
        return ['coalesce', ['get', 'name:es'], ['get', 'name']];
      }
      return v.map(walk);
    }
    if (v !== null && typeof v === 'object') {
      const r: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) r[k] = walk(val);
      return r;
    }
    return v;
  }
  return walk(style);
}

// ─── helpers SVG / Bézier ───────────────────────────────────────────────────

function getAirplaneSVG(pct: number, isEmpty?: boolean): string {
  if (isEmpty) return '/airplane-blue.svg';
  if (pct < 50) return '/airplane-green.svg';
  if (pct < 80) return '/airplane-orange.svg';
  return '/airplane-red.svg';
}

function getLocationSVG(pct: number): string {
  if (pct === 0) return '/almacen-blue.svg';
  if (pct < 50) return '/almacen-green.svg';
  if (pct < 80) return '/almacen-orange.svg';
  return '/almacen-red.svg';
}

function getWarehouseColorKey(pct: number): 'blue' | 'green' | 'orange' | 'red' {
  if (pct === 0) return 'blue';
  if (pct < 50) return 'green';
  if (pct < 80) return 'orange';
  return 'red';
}

function bezierCurve(
  p0: [number, number],
  p1: [number, number],
  steps: number
): [number, number][] {
  const midLat = (p0[0] + p1[0]) / 2;
  const midLng = (p0[1] + p1[1]) / 2;
  const dist = Math.sqrt(Math.pow(p1[0] - p0[0], 2) + Math.pow(p1[1] - p0[1], 2));
  const offset = dist * 0.15;
  const angle = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  const cp: [number, number] = [
    midLat + Math.cos(angle + Math.PI / 2) * offset,
    midLng - Math.sin(angle + Math.PI / 2) * offset,
  ];
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push([
      mt * mt * p0[0] + 2 * mt * t * cp[0] + t * t * p1[0],
      mt * mt * p0[1] + 2 * mt * t * cp[1] + t * t * p1[1],
    ]);
  }
  return pts;
}

/** Formatea minutos desde el inicio de la simulación como "DD/MM/AAAA HH:MM" (UTC + GMT) */
function formatSimTime(minutos: number, startDate: string | null, startTime: string | null, gmt: number = 0): string {
  if (!startDate) return 'DD/MM/AAAA HH:MM';

  try {
    const [year, month, day] = startDate.split('-').map(Number);
    let hour = 0, minute = 0;
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      hour = h || 0;
      minute = m || 0;
    }
    const ts = Date.UTC(year, month - 1, day, hour, minute) + minutos * 60000 + gmt * 3600000;
    const shifted = new Date(ts);
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = shifted.getUTCFullYear();
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return 'DD/MM/AAAA HH:MM';
  }
}

// ─── Constantes ──────────────────────────────────────────────────────────────
/** Segundos reales por iteración (30s algoritmo + 5s margen) */
const SEGS_POR_ITER = 35;
/** Total de minutos simulados para 5 días */
const TOTAL_MINUTOS_SIM = 5 * 24 * 60; // 7 200

// ─── Componente principal ────────────────────────────────────────────────────
export default function SimulacionPeriodo() {
  const [startDate, setStartDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const hoveredFlightKeyRef = useRef<string | null>(null);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);

  const sim = useSimulacion();
  const simRef = useRef(sim);
  simRef.current = sim;
  const user = typeof window !== 'undefined' ? (() => { try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; } catch { return null; } })() : null;
  useEffect(() => {
    (window as any).debugDiaADia = () => ({
      allLogEvents: simRef.current.allLogEvents.length,
      logEventsRef: logEventsRef.current.length,
      minSim: currentMinSimRef.current,
      clockEnabled: clockEnabledRef.current,
      isRunning: simRef.current.isRunning,
      iteracion: simRef.current.iteracion,
      logs: simRef.current.logs.length,
      localLogs: localLogsRef.current.length,
      flightEvents: flightEventsRef.current.length,
      rutas: rutasPlanificadasRef.current.size,
      K: SIM_CONFIG.K,
      allFlightEvents: simRef.current.allFlightEvents.length,
    });
    return () => { delete (window as any).debugDiaADia; };
  }, []);

  // ── Refs locales (independientes de Periodo) ──
  const flightEventsRef = useRef<FlightEvent[]>([]);
  const airportStateRef = useRef<Map<string, { ocupacion: number; capacidad: number }>>(new Map());
  const cancelledFlightsRef = useRef<Set<string>>(new Set());
  const suppressedTramosRef = useRef<Map<string, { minTramoOrden: number; iteracionIdx: number }>>(new Map());
  const logEventsRef = useRef<LogEvent[]>([]);
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => { });
  const addLogBatchRef = useRef<(entries: Array<{ text: string; color: string; minutosDisparo: number }>) => void>(() => { });
  const [localLogs, setLocalLogs] = useState<Array<{ time: string | null; text: string; color: string }>>([]);
  const localLogsRef = useRef(localLogs);
  localLogsRef.current = localLogs;

  function actualizarOcupacionAlmacen(codigo: string, delta: number) {
    const state = airportStateRef.current.get(codigo);
    if (!state) return;
    state.ocupacion = Math.max(0, state.ocupacion + delta);
    const marker = markersRef.current.find((m: any) => m.airportCode === codigo);
    const actualizar = (mapInst.current as any)?._actualizarIconoAlmacen;
    if (marker && actualizar) {
      const pct = state.capacidad > 0 ? (state.ocupacion / state.capacidad) * 100 : 0;
      actualizar(marker, pct);
    }
  }

  const emptyFlightsAddedRef = useRef<Set<string>>(new Set());
  const [apiFlights, setApiFlights] = useState<any[] | null>(null);
  const canceledLocallyRef = useRef<Set<string>>(new Set());

  function crearEmptyFlightEvent(flight: any, simStartDate: Date): FlightEvent | null {
    const infoOri = aeropuertoInfoRef.current.get(flight.idAeropuertoOrigen);
    const infoDes = aeropuertoInfoRef.current.get(flight.idAeropuertoDestino);
    const origen = infoOri?.codigo;
    const destino = infoDes?.codigo;
    if (!origen || !destino) return null;
    const aOri = sim.aeropuertosRef.current.get(origen);
    const aDes = sim.aeropuertosRef.current.get(destino);
    if (!aOri || !aDes) return null;

    const gmtO = infoOri.gmt;
    const gmtD = infoDes.gmt;
    const [lh, lm] = (flight.horaSalida || '00:00').split(':').map(Number);
    const gmtH = ((lh - gmtO) % 24 + 24) % 24;
    const [lha, lma] = (flight.horaLlegada || '00:00').split(':').map(Number);
    const gmtHa = ((lha - gmtD) % 24 + 24) % 24;

    let saleDate = new Date(simStartDate.getTime());
    saleDate.setUTCHours(gmtH, lm, 0, 0);
    let saleTs = saleDate.getTime();
    const startTs = simStartDate.getTime();
    while (saleTs < startTs) { saleTs += 24 * 60 * 60 * 1000; }
    saleDate = new Date(saleTs);

    let llegaDate = new Date(saleDate);
    llegaDate.setUTCHours(gmtHa, lma, 0, 0);
    let llegaTs = llegaDate.getTime();
    while (llegaTs <= saleTs) { llegaTs += 24 * 60 * 60 * 1000; }
    llegaDate = new Date(llegaTs);

    const minutosInicio = Math.round((saleTs - startTs) / 60000);
    const minutosFin = Math.round((llegaTs - startTs) / 60000);

    if (minutosInicio < 0 || minutosInicio > TOTAL_MINUTOS_SIM) return null;

    const key = `unused-${origen}-${destino}-${String(gmtH).padStart(2, '0')}${String(lm).padStart(2, '0')}`;

    return {
      key,
      tramoOrden: 1,
      origenCode: origen,
      destinoCode: destino,
      planVueloRuta: [origen, destino],
      planVueloTipo: 'Directo',
      latOrigen: aOri.latitud,
      lngOrigen: aOri.longitud,
      latDestino: aDes.latitud,
      lngDestino: aDes.longitud,
      minutosInicio,
      minutosFin,
      maletasVuelo: 0,
      capacidadVuelo: flight.capacidad ?? 0,
      ocupacionAlmacenOrigen: 0,
      capacidadAlmacenOrigen: aOri.capacidad,
      ocupacionAlmacenDestino: 0,
      capacidadAlmacenDestino: aDes.capacidad,
    };
  }
  const currentMinSimRef = useRef<number>(0);
  const clockStateRef = useRef<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const lastFrameTimeRef = useRef<number>(0);
  const clockEnabledRef = useRef<boolean>(false);
  const panelFlightKeyRef = useRef<string | null>(null);
  const calcStartedAtRef = useRef<number>(0);
  const configCountdownRef = useRef<number>(60);
  const stopwatchStartedAtRef = useRef<number | null>(null);

  // ── Sincronizar flightEvents del hook → ref local ──
  useEffect(() => {
    const nuevos = sim.allFlightEvents.filter(e => !flightEventsRef.current.some(f => f.key === e.key));
    if (nuevos.length === 0) return;

    // Construir conjunto de claves de los nuevos
    const nuevosKeys = new Set(nuevos.map(e => e.key));

    // Mantener solo los eventos actuales que no sean reemplazados por los nuevos
    const current = flightEventsRef.current;
    const keep = current.filter(f => {
      // Los vuelos sin uso ('unused-') se mantienen siempre (no se reemplazan)
      if (f.key.startsWith('unused-')) return true;
      // Si está activo o ya completado, lo mantenemos (no se puede reemplazar)
      if (f.active || f.done) return true;
      // Verificar si algún nuevo evento coincide en origen, destino y hora (minutosInicio % 1440)
      const match = nuevos.some(n =>
        n.origenCode === f.origenCode &&
        n.destinoCode === f.destinoCode &&
        (n.minutosInicio % 1440) === (f.minutosInicio % 1440) &&
        !n.key.startsWith('unused-')
      );
      return !match; // Si coincide, se elimina (será reemplazado)
    });

    // Asignar la nueva lista: los que se mantienen + los nuevos
    flightEventsRef.current = [...keep, ...nuevos];
  }, [sim.allFlightEvents]);

  // ── Sincronizar logEvents del hook → ref local ──
  useEffect(() => {
    if (sim.allLogEvents.length === 0) { logEventsRef.current = []; return; }
    const nuevos = sim.allLogEvents.slice(logEventsRef.current.length);
    if (nuevos.length > 0) {
      logEventsRef.current = [...logEventsRef.current, ...nuevos];
      const simStart = sim.simStartDateRef.current;
      if (simStart) {
        const now = Date.now();
        const pendingLogs: { text: string; color: string; minutosDisparo: number }[] = [];
        for (const le of nuevos) {
          const eventTime = simStart.getTime() + le.minutosDisparo * 60000;
          if (now >= eventTime) {
            le.fired = true;
            if (le.idEnvio) {
              const ruta = rutasPlanificadasRef.current.get(le.idEnvio);
              if (ruta) {
                if (le.color === '#22c55e') {
                  actualizarOcupacionAlmacen(ruta.origen, ruta.maletas);
                } else if (le.color === '#3b82f6' && le.tramoOrden !== undefined) {
                  const tramo = (ruta.tramos || []).find(t => t.orden === le.tramoOrden);
                  if (tramo) actualizarOcupacionAlmacen(tramo.origen, -tramo.maletasVuelo);
                } else if (le.color === '#8b5cf6' && le.tramoOrden !== undefined) {
                  const tramo = (ruta.tramos || []).find(t => t.orden === le.tramoOrden);
                  if (tramo) actualizarOcupacionAlmacen(tramo.destino, tramo.maletasVuelo);
                } else if (le.color === '#f59e0b') {
                  actualizarOcupacionAlmacen(ruta.destino, -ruta.maletas);
                }
              }
            }
            pendingLogs.push({ text: le.text, color: le.color, minutosDisparo: le.minutosDisparo });
          } else {
            const delay = eventTime - now;
            setTimeout(() => {
              le.fired = true;
              addLogBatchRef.current([{ text: le.text, color: le.color, minutosDisparo: le.minutosDisparo }]);
            }, delay);
          }
        }
        if (pendingLogs.length > 0) addLogBatchRef.current(pendingLogs);
      }
    }
  }, [sim.allLogEvents]);

  // ── Sincronizar cancelledFlights → ref local ──
  useEffect(() => {
    cancelledFlightsRef.current = sim.cancelledFlights;
  }, [sim.cancelledFlights]);

  // ── Sincronizar suppressedTramos → ref local ──
  useEffect(() => {
    suppressedTramosRef.current = sim.suppressedTramos;
    if (sim.suppressedTramos.size === 0) return;
    sim.suppressedTramos.forEach((info, idEnvio) => {
      for (const fe of flightEventsRef.current) {
        const feIdEnvio = fe.key.split('-')[0];
        if (feIdEnvio !== idEnvio || fe.tramoOrden < info.minTramoOrden || fe.active) continue;
        const m = fe.key.match(/iter(\d+)/);
        if (m && parseInt(m[1]) === info.iteracionIdx) { fe.done = true; }
      }
      for (const le of logEventsRef.current) {
        if (le.idEnvio === idEnvio && le.tramoOrden !== undefined && le.tramoOrden >= info.minTramoOrden) {
          le.fired = true;
        }
      }
    });
  }, [sim.suppressedTramos]);

  // ── Mantener addLogRef ──
  useEffect(() => { addLogRef.current = sim.addLog; }, [sim.addLog]);

  // ── Auto-start (k=1, sin fin, UTC) ──
  const autoStartedRef = useRef(false);
  const ctx = useSimulationContext();
  useEffect(() => {
    if (autoStartedRef.current) return;
    const token = localStorage.getItem('authToken');
    if (!token) return;
    autoStartedRef.current = true;
    // Limpiar estado de Periodo en el contexto compartido
    sessionStorage.removeItem('periodoStartDate');
    sessionStorage.removeItem('periodoStartTime');
    ctx.flightEventsRef.current = [];
    ctx.airportStateRef.current.clear();
    ctx.cancelledFlightsRef.current.clear();
    ctx.suppressedTramosRef.current.clear();
    ctx.emptyFlightsAddedRef.current.clear();
    ctx.canceledLocallyRef.current.clear();
    ctx.currentMinSimRef.current = 0;
    ctx.clockStateRef.current = 'CALCULANDO';
    ctx.clockEnabledRef.current = false;
    ctx.lastFrameTimeRef.current = 0;
    ctx.lastIteracionRef.current = 0;
    // Detener Periodo en el contexto y luego Día a Día, antes de iniciar
    ctx.sim.detener().then(() => sim.detener()).then(() => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      const h = String(now.getUTCHours()).padStart(2, '0');
      const min = String(now.getUTCMinutes()).padStart(2, '0');
      sim.iniciar(`${y}-${m}-${d}`, `${h}:${min}`, 1, true);
    });
  }, []);

  // ── Control de estado del reloj (CALCULANDO → VISUALIZANDO) ──
  useEffect(() => {
    if (sim.isRunning && sim.iteracion === 0) {
      clockEnabledRef.current = false;
      currentMinSimRef.current = 0;
      lastFrameTimeRef.current = 0;
      clockStateRef.current = 'CALCULANDO';
      calcStartedAtRef.current = performance.now();
      configCountdownRef.current = 60;
      flightEventsRef.current = [];
      logEventsRef.current = [];
      cancelledFlightsRef.current = new Set();
      suppressedTramosRef.current = new Map();
    }
    if (sim.isRunning && sim.simStartDateRef.current && !clockEnabledRef.current) {
      clockEnabledRef.current = true;
      clockStateRef.current = 'VISUALIZANDO';
      lastFrameTimeRef.current = performance.now();
      calcStartedAtRef.current = 0;
      configCountdownRef.current = 0;
      if (stopwatchStartedAtRef.current === null) stopwatchStartedAtRef.current = Date.now();
    }
    if (sim.isRunning && sim.iteracion > 0 && stopwatchStartedAtRef.current === null) {
      stopwatchStartedAtRef.current = Date.now();
    }
    if (!sim.isRunning) { clockEnabledRef.current = false; stopwatchStartedAtRef.current = null; }
  }, [sim.isRunning, sim.iteracion]);

  // ── Generar vuelos vacíos (unused) desde el schedule ──
  useEffect(() => {
    if (!apiFlights) return;
    const simStart = sim.simStartDateRef.current;
    if (!simStart) return;

    const activeUsedKeys = new Set<string>();
    const allForKeys = sim.allFlightEvents.length > 0 ? sim.allFlightEvents : flightEventsRef.current;
    for (const fe of allForKeys) {
      if (!fe.key.startsWith('unused-') && !fe.done) {
        const hh = String(Math.floor((fe.minutosInicio % 1440) / 60)).padStart(2, '0');
        const mm = String(fe.minutosInicio % 60).padStart(2, '0');
        activeUsedKeys.add(`${fe.origenCode}-${fe.destinoCode}-${hh}:${mm}`);
      }
    }

    const allUsedKeys = new Set<string>();
    sim.rutasPlanificadasRef.current.forEach(ruta => {
      (ruta.tramos || []).forEach(tramo => {
        const gmtTime = (tramo.sale || '').split(' ')[1] || '00:00';
        allUsedKeys.add(`${tramo.origen}-${tramo.destino}-${gmtTime}`);
      });
    });

    let changed = false;
    emptyFlightsAddedRef.current.forEach(key => {
      const parts = key.split('-');
      if (parts.length >= 4) {
        const timeStr = parts[parts.length - 1];
        const gmtTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
        const usedKey = `${parts[1]}-${parts[2]}-${gmtTime}`;
        if (activeUsedKeys.has(usedKey)) {
          const fe = flightEventsRef.current.find(e => e.key === key);
          if (fe && !fe.done) { fe.done = true; changed = true; }
        }
      }
    });
    if (changed) setRefreshTick(t => t + 1);

    const added: FlightEvent[] = [];
    const removedKeys = new Set<string>();
    for (const flight of apiFlights) {
      if (flight.cancelado) continue;
      const infoOri = aeropuertoInfoRef.current.get(flight.idAeropuertoOrigen);
      const origen = infoOri?.codigo;
      const destino = aeropuertoInfoRef.current.get(flight.idAeropuertoDestino)?.codigo;
      if (!origen || !destino) continue;
      const gmtO = infoOri?.gmt ?? 0;
      const [lh, lm] = (flight.horaSalida || '00:00').split(':').map(Number);
      const gmtH = ((lh - gmtO) % 24 + 24) % 24;
      const gmtTime = `${String(gmtH).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;

      if (allUsedKeys.has(`${origen}-${destino}-${gmtTime}`)) continue;

      const feKey = `unused-${origen}-${destino}-${String(gmtH).padStart(2, '0')}${String(lm).padStart(2, '0')}`;
      const existingFe = flightEventsRef.current.find(e => e.key === feKey);
      if (existingFe) {
        if (!existingFe.done) continue;
        removedKeys.add(feKey);
        emptyFlightsAddedRef.current.delete(feKey);
      }

      const fe = crearEmptyFlightEvent(flight, simStart);
      if (fe) {
        added.push(fe);
        emptyFlightsAddedRef.current.add(feKey);
      }
    }
    if (added.length > 0 || removedKeys.size > 0) {
      flightEventsRef.current = [
        ...flightEventsRef.current.filter(e => !removedKeys.has(e.key)),
        ...added,
      ];
      setRefreshTick(t => t + 1);
    }
  }, [apiFlights, sim.aeropuertos, sim.isRunning]);

  // ── Motor de simulación independiente ──
  useEffect(() => {
    let frameId: number;
    function engineLoop() {
      try {
        const now = performance.now();
        if (clockStateRef.current === 'CALCULANDO' && calcStartedAtRef.current > 0) {
          configCountdownRef.current = Math.max(0, 60 - Math.floor((now - calcStartedAtRef.current) / 1000));
        }
        if (clockEnabledRef.current) {
          const deltaMs = now - (lastFrameTimeRef.current || now);
          lastFrameTimeRef.current = now;
          currentMinSimRef.current += (deltaMs / 1000) * (SIM_CONFIG.K / 60);
        } else {
          lastFrameTimeRef.current = now;
        }
        const minSim = Math.min(7200, currentMinSimRef.current);
        currentMinSimRef.current = minSim;
        const events = flightEventsRef.current;
        const simStart = sim.simStartDateRef.current;
        for (const fe of events) {
          if (fe.done) continue;
          if (!fe.active && minSim >= fe.minutosInicio) {
            const apt = sim.aeropuertosRef.current.get(fe.origenCode);
            const offset = apt?.gmt ?? 0;
            const depDate = simStart ? new Date(simStart.getTime() + fe.minutosInicio * 60000) : new Date();
            const gmtHour = depDate.getHours();
            const gmtMin = depDate.getMinutes();
            const localHour = ((gmtHour + offset) % 24 + 24) % 24;
            const cancelKey = `${fe.origenCode}-${fe.destinoCode}-${String(localHour).padStart(2, '0')}:${String(gmtMin).padStart(2, '0')}`;
            let suprimido = cancelledFlightsRef.current.has(cancelKey);
            if (!suprimido) {
              const supInfo = suppressedTramosRef.current.get(fe.key.split('-')[0]);
              const m = fe.key.match(/iter(\d+)/);
              if (supInfo && fe.tramoOrden >= supInfo.minTramoOrden && m && parseInt(m[1]) === supInfo.iteracionIdx) suprimido = true;
            }
            if (suprimido) { fe.done = true; } else {
              fe.active = true; (fe as any)._activatedThisFrame = true;
            }
          }
          if (fe.active) {
            if ((fe as any)._activatedThisFrame) { (fe as any)._activatedThisFrame = false; } else if (fe.minutosFin - fe.minutosInicio <= 0 || minSim >= fe.minutosFin) {
              fe.done = true; fe.active = false;
              if (!fe.key.startsWith('unused-')) {
                const mod1440 = fe.minutosInicio % 1440;
                for (const p of events) {
                  if (p.key.startsWith('unused-') && p.done && p.origenCode === fe.origenCode && p.destinoCode === fe.destinoCode && (p.minutosInicio % 1440) === mod1440) {
                    const origDur = p.minutosFin - p.minutosInicio;
                    const tod = Math.floor(minSim / 1440) * 1440 + p.minutosInicio % 1440;
                    p.minutosInicio = tod <= minSim ? tod + 1440 : tod;
                    p.minutosFin = p.minutosInicio + origDur;
                    break;
                  }
                }
              }
            }
          }
        }
        const pendingLogs: { text: string; color: string; minutosDisparo: number }[] = [];
        for (const le of logEventsRef.current) {
          if (!le.fired && minSim >= le.minutosDisparo) {
            const info = suppressedTramosRef.current.get(le.idEnvio || '');
            if (le.idEnvio && le.tramoOrden !== undefined && info && le.tramoOrden >= info.minTramoOrden) { le.fired = true; continue; }
            le.fired = true;
            if (le.idEnvio) {
              const ruta = rutasPlanificadasRef.current.get(le.idEnvio);
              if (ruta) {
                if (le.color === '#22c55e') {
                  actualizarOcupacionAlmacen(ruta.origen, ruta.maletas);
                } else if (le.color === '#3b82f6' && le.tramoOrden !== undefined) {
                  const tramo = (ruta.tramos || []).find(t => t.orden === le.tramoOrden);
                  if (tramo) actualizarOcupacionAlmacen(tramo.origen, -tramo.maletasVuelo);
                } else if (le.color === '#8b5cf6' && le.tramoOrden !== undefined) {
                  const tramo = (ruta.tramos || []).find(t => t.orden === le.tramoOrden);
                  if (tramo) actualizarOcupacionAlmacen(tramo.destino, tramo.maletasVuelo);
                } else if (le.color === '#f59e0b') {
                  actualizarOcupacionAlmacen(ruta.destino, -ruta.maletas);
                }
              }
            }
            pendingLogs.push({ text: le.text, color: le.color, minutosDisparo: le.minutosDisparo });
          }
        }
        if (pendingLogs.length > 0) addLogBatchRef.current(pendingLogs);
      } catch (err) { console.error('[engineLoop] Error:', err); }
      frameId = requestAnimationFrame(engineLoop);
    }
    engineLoop();
    return () => cancelAnimationFrame(frameId);
  }, []);

  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [flightPanelOpen, setFlightPanelOpen] = useState(false);
  const [enviosPanelOpen, setEnviosPanelOpen] = useState(false);
  const [almacenesPanelOpen, setAlmacenesPanelOpen] = useState(false);
  const [centroControlOpen, setCentroControlOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showStoppedOverlay, setShowStoppedOverlay] = useState(false);
  const [simMinutos, setSimMinutos] = useState(() => Math.floor(currentMinSimRef.current));
  const [colorFilterOpen, setColorFilterOpen] = useState(true);
  const [activeColors, setActiveColors] = useState<Record<string, boolean>>({ all: true, blue: true, green: true, orange: true, red: true });
  const activeColorsRef = useRef(activeColors);
  activeColorsRef.current = activeColors;
  const [warehouseFilterOpen, setWarehouseFilterOpen] = useState(true);
  const [activeWarehouseColors, setActiveWarehouseColors] = useState<Record<string, boolean>>({ all: true, blue: true, green: true, orange: true, red: true });
  const activeWarehouseColorsRef = useRef(activeWarehouseColors);
  activeWarehouseColorsRef.current = activeWarehouseColors;

  useEffect(() => { lastFrameTimeRef.current = performance.now(); }, []);

  useEffect(() => {
    const filter = activeColorsRef.current;
    flightEventsRef.current.forEach(fe => {
      if (!fe.airplaneImage) return;
      const isEmpty = fe.key.startsWith('unused-');
      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      const bucket = (fe as any)._lastColorBucket ?? (isEmpty ? -1 : (ocupPct < 50 ? 0 : ocupPct < 80 ? 1 : 2));
      const colorKey = bucket === -1 ? 'blue' : bucket === 0 ? 'green' : bucket === 1 ? 'orange' : 'red';
      fe.airplaneImage.style.display = (filter.all || filter[colorKey]) ? '' : 'none';
    });
  }, [activeColors]);

  useEffect(() => {
    const filter = activeWarehouseColorsRef.current;
    markersRef.current.forEach((marker: any) => {
      const state = airportStateRef.current.get(marker.airportCode);
      const pct = state && state.capacidad > 0 ? (state.ocupacion / state.capacidad) * 100 : 0;
      const colorKey = getWarehouseColorKey(pct);
      const visible = filter.all || filter[colorKey];
      const element = typeof marker.getElement === 'function' ? marker.getElement() : marker._icon;
      if (element) element.style.display = visible ? '' : 'none';
    });
  }, [activeWarehouseColors, sim.iteracion]);

  const [gmtOffset, setGmtOffset] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const g = u?.aeropuerto?.gmt;
      if (typeof g === 'number' && !isNaN(g)) return g;
    } catch { }
    return -new Date().getTimezoneOffset() / 60;
  });
  useEffect(() => {
    if (sim.aeropuertos.length === 0) return;
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const codigo = u?.aeropuerto?.codigo || u?.aeropuerto?.abreviatura;
      if (codigo) {
        const apt = sim.aeropuertos.find(a => a.codigo === codigo);
        if (apt && apt.gmt !== gmtOffset) setGmtOffset(apt.gmt);
      }
    } catch { }
  }, [sim.aeropuertos]);
  // ── addLogBatch local: formatea DD/MM/AAAA HH:MM directo como horaActual ──
  useEffect(() => {
    addLogBatchRef.current = (entries) => {
      const formatted = entries.map(e => {
        const now = new Date();
        const local = new Date(now.getTime() + gmtOffset * 3600000);
        const time = `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}/${local.getUTCFullYear()} ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
        let text = e.text;
        const salidaMatch = text.match(/Salida (\d{2}):(\d{2})/);
        if (salidaMatch) {
          const utcH = parseInt(salidaMatch[1]);
          const localH = ((utcH + gmtOffset) % 24 + 24) % 24;
          text = text.replace(salidaMatch[0], `Salida ${String(localH).padStart(2, '0')}:${salidaMatch[2]}`);
        }
        return { time, text, color: e.color };
      });
      setLocalLogs(prev => [...formatted, ...prev].slice(0, 100));
      setRefreshTick(prev => prev + 1);
    };
  }, [gmtOffset]);
  const [horaActual, setHoraActual] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const local = new Date(now.getTime() + gmtOffset * 3600000);
      const dd = String(local.getUTCDate()).padStart(2, '0');
      const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = local.getUTCFullYear();
      const hh = String(local.getUTCHours()).padStart(2, '0');
      const mi = String(local.getUTCMinutes()).padStart(2, '0');
      const ss = String(local.getUTCSeconds()).padStart(2, '0');
      setHoraActual(`${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gmtOffset]);

  const isInitialized = useRef(false);

  // Leer fecha y hora de inicio del query param, o usar hoy por defecto
  useEffect(() => {
    const dateParam = new URLSearchParams(window.location.search).get('startDate');
    const timeParam = new URLSearchParams(window.location.search).get('startTime');
    if (dateParam) {
      setStartDate(dateParam);
    } else {
      const today = new Date();
      setStartDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    }
    if (timeParam) {
      setStartTime(timeParam);
    }
  }, []);

  // sim se obtiene de useSimulacion() local (independiente de Periodo)

  // Cronómetro de tiempo real transcurrido (stopwatch) — se actualiza en el render loop
  const [stopwatch, setStopwatch] = useState('00:00');
  const lastStopwatchLabelRef = useRef('');

  // Detectar estado del sidebar desde localStorage
  useEffect(() => {
    const checkSidebarState = () => {
      const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      setSidebarCollapsed(isCollapsed);
    };

    checkSidebarState();

    const interval = setInterval(checkSidebarState, 500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Actualizar clase CSS del map-container para los paneles laterales
  useEffect(() => {
    const mapContainer = document.querySelector('.map-container') as HTMLElement;
    if (mapContainer) {
      if (flightPanelOpen || enviosPanelOpen || almacenesPanelOpen) {
        mapContainer.classList.add('flight-panel-open');
      } else {
        mapContainer.classList.remove('flight-panel-open');
      }
    }
  }, [flightPanelOpen, enviosPanelOpen, almacenesPanelOpen]);
  const rutasPlanificadasRef = sim.rutasPlanificadasRef;

  // States for flight filters and virtual scroll
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterOrigen, setFilterOrigen] = useState('');
  const [filterDestino, setFilterDestino] = useState('');
  const [filterSemaforo, setFilterSemaforo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState('salida');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [refreshTick, setRefreshTick] = useState(0);
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [cancellingFlights, setCancellingFlights] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const pendingScrollVuelo = useRef<string | null>(null);
  const panelWasOpenRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollPendingRef = useRef(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);


  // States for envio filters
  const [envFilterCodigo, setEnvFilterCodigo] = useState('');
  const [envFilterOrigen, setEnvFilterOrigen] = useState('');
  const [envFilterDestino, setEnvFilterDestino] = useState('');
  const [envSortBy, setEnvSortBy] = useState('salida');
  const [envSortDir, setEnvSortDir] = useState<'asc' | 'desc'>('asc');
  const [envFiltersOpen, setEnvFiltersOpen] = useState(false);
  const [envFilterPosition, setEnvFilterPosition] = useState({ top: 0, left: 0 });
  const envFilterButtonRef = useRef<HTMLButtonElement>(null);

  // States for selected/highlighted cards
  const [selectedVueloKey, setSelectedVueloKey] = useState<string | null>(null);
  const [selectedEnvioKey, setSelectedEnvioKey] = useState<string | null>(null);

  // ── Estados del panel de Almacenes ──────────────────────────────────────────────
  const [scrollTopAlm, setScrollTopAlm] = useState(0);
  const [containerHeightAlm, setContainerHeightAlm] = useState(600);
  const [selectedAlmacen, setSelectedAlmacen] = useState<string | null>(null);
  const [filtrosAlmOpen, setFiltrosAlmOpen] = useState(false);
  const [filterAlmCodigo, setFilterAlmCodigo] = useState('');
  const [filterAlmCiudad, setFilterAlmCiudad] = useState('');
  const [filterAlmPais, setFilterAlmPais] = useState('');
  const [filterAlmContinente, setFilterAlmContinente] = useState('');
  const [filterAlmSemaforo, setFilterAlmSemaforo] = useState('');
  const [sortAlmBy, setSortAlmBy] = useState('codigo');
  const [sortAlmDir, setSortAlmDir] = useState<'asc' | 'desc'>('asc');
  const filterAlmButtonRef = useRef<HTMLButtonElement>(null);
  const [filterAlmPosition, setFilterAlmPosition] = useState({ top: 0, left: 0 });
  const scrollContainerAlmRef = useRef<HTMLDivElement>(null);
  const refrescoAlmRef = useRef(0);
  const [, setRefrescoAlm] = useState(0);

  // ── API: datos de aeropuertos ──
  const aeropuertoInfoRef = useRef<Map<number, { codigo: string; gmt: number }>>(new Map());

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL;
    if (!API) return;
    Promise.all([
      fetch(`${API}/api/planes-vuelo`).then(r => r.json()),
      fetch(`${API}/api/aeropuertos`).then(r => r.json()),
    ]).then(([planesRes, aeroRes]) => {
      if (aeroRes.exito && Array.isArray(aeroRes.datos)) {
        const map = new Map<number, { codigo: string; gmt: number }>();
        aeroRes.datos.forEach((a: any) => map.set(a.idAeropuerto, { codigo: a.codigo, gmt: a.gmt ?? 0 }));
        aeropuertoInfoRef.current = map;
      }
      if (planesRes.exito && Array.isArray(planesRes.datos)) {
        setApiFlights(planesRes.datos);
      }
    }).catch(e => console.error('[apiFlights]', e));
  }, []);

  // ResizeObserver para detectar altura del contenedor de scroll virtual
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Listado global de vuelos: todos desde la API (BD), igual que Periodo.
  const vuelosGlobales = useMemo(() => {
    const simStart = sim.simStartDateRef.current;
    if (!simStart) return [];
    const feList = flightEventsRef.current;
    if (feList.length === 0) return [];
    const gmt = gmtOffset;

    // ← NUEVO: deduplicar por vuelo físico (origen+destino+minutosInicio+minutosFin).
    //   Varios lotes de un mismo envío (o varios envíos distintos) pueden compartir
    //   exactamente el mismo vuelo, y cada uno genera su propio FlightEvent.
    const vuelosUnicos = new Map<string, FlightEvent>();
    for (const fe of feList) {
      if (fe.done) continue;
      const claveVuelo = `${fe.origenCode}|${fe.destinoCode}|${fe.minutosInicio}|${fe.minutosFin}`;
      if (!vuelosUnicos.has(claveVuelo)) {
        vuelosUnicos.set(claveVuelo, fe);
      }
    }

    return Array.from(vuelosUnicos.values()).map(fe => {
        const depDate = new Date(simStart.getTime() + fe.minutosInicio * 60000);
        const arrDate = new Date(simStart.getTime() + fe.minutosFin * 60000);
        const depShifted = new Date(depDate.getTime() + gmt * 3600000);
        const arrShifted = new Date(arrDate.getTime() + gmt * 3600000);
        const depStr = `${String(depShifted.getUTCDate()).padStart(2, '0')}/${String(depShifted.getUTCMonth() + 1).padStart(2, '0')}/${depShifted.getUTCFullYear()} ${String(depShifted.getUTCHours()).padStart(2, '0')}:${String(depShifted.getUTCMinutes()).padStart(2, '0')}`;
        const arrStr = `${String(arrShifted.getUTCDate()).padStart(2, '0')}/${String(arrShifted.getUTCMonth() + 1).padStart(2, '0')}/${arrShifted.getUTCFullYear()} ${String(arrShifted.getUTCHours()).padStart(2, '0')}:${String(arrShifted.getUTCMinutes()).padStart(2, '0')}`;
        return {
          origen: fe.origenCode,
          destino: fe.destinoCode,
          salida: depStr,
          llegada: arrStr,
          minutosInicio: fe.minutosInicio,
        };
      });
  }, [refreshTick, sim.allFlightEvents, gmtOffset]);

  // Unique origins and destinations from the global flight list
  const origenesUnicos = useMemo(() => {
    const set = new Set<string>();
    vuelosGlobales.forEach(v => set.add(v.origen));
    return Array.from(set).sort();
  }, [vuelosGlobales]);

  const destinosUnicos = useMemo(() => {
    const set = new Set<string>();
    vuelosGlobales.forEach(v => set.add(v.destino));
    return Array.from(set).sort();
  }, [vuelosGlobales]);

  // Airport code → city name lookup
  const aeropuertoMap = useMemo(() => {
    const map = new Map<string, string>();
    (sim.aeropuertos || []).forEach(a => map.set(a.codigo, a.ciudad));
    return map;
  }, [sim.aeropuertos]);

  const envOrigenesUnicos = useMemo(() => {
    const set = new Set<string>();
    rutasPlanificadasRef.current.forEach(r => set.add(r.origen));
    return Array.from(set).sort();
  }, [rutasPlanificadasRef, sim.allFlightEvents, sim.iteracion]);

  const envDestinosUnicos = useMemo(() => {
    const set = new Set<string>();
    rutasPlanificadasRef.current.forEach(r => set.add(r.destino));
    return Array.from(set).sort();
  }, [rutasPlanificadasRef, sim.allFlightEvents, sim.iteracion]);

  // Calculate filter popup position
  useEffect(() => {
    if (filtersOpen && filterButtonRef.current) {
      const rect = filterButtonRef.current.getBoundingClientRect();
      setFilterPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [filtersOpen]);

  useEffect(() => {
    if (envFiltersOpen && envFilterButtonRef.current) {
      const rect = envFilterButtonRef.current.getBoundingClientRect();
      setEnvFilterPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [envFiltersOpen]);

  // States for pausing logs
  const [isLogsPaused, setIsLogsPaused] = useState(false);
  const [pausedLogs, setPausedLogs] = useState<LogEntry[]>([]);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [isMapLogsOpen, setIsMapLogsOpen] = useState(false);
  const [isMapLogsPaused, setIsMapLogsPaused] = useState(false);
  const [pausedMapLogs, setPausedMapLogs] = useState<LogEntry[]>([]);
  const mapLogsContainerRef = useRef<HTMLDivElement>(null);
  const [isGlobalIndicatorsOpen, setIsGlobalIndicatorsOpen] = useState(true);
  const [isOcupacionLegendOpen, setIsOcupacionLegendOpen] = useState(false);
  const mapRegistroPanelRef = useRef<HTMLDivElement>(null);
  const ocupacionLegendRef = useRef<HTMLDivElement>(null);
  const globalIndicatorsPanelRef = useRef<HTMLDivElement>(null);

  const parseTime = (t: string) => {
    const p = t.split(' ');
    if (t.includes('/')) return { date: p[0], time: p[1] };
    if (t.startsWith('Día')) return { date: `${p[0]} ${p[1]}`, time: p[2] };
    return { date: t, time: '' };
  };

  const simplifyEnvio = (text: string) => {
    const m1 = text.match(/^(📦 Envío \S+?)[: ]/);
    if (m1) return `${m1[1]} registrado`;
    const m2 = text.match(/^(✅ Envío \S+?) completado/);
    if (m2) return `${m2[1]} completado`;
    return text;
  };

  // Todos los logs según el modo
  const logsPaginados = useMemo(() => {
    const source = isLogsPaused ? pausedLogs : [...localLogs, ...sim.logs];
    return { logs: source, totalCount: source.length };
  }, [isLogsPaused, sim.logs, pausedLogs, localLogs]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    if ((mapRef.current as any)._leaflet_id) return;

    (async () => {
      try {
        const L = require('leaflet');
        require('leaflet/dist/leaflet.css');
        const map = L.map(mapRef.current, {
          zoomControl: false,
          zoomSnap: 0.05,
          zoomDelta: 0.1,
          wheelPxPerZoomLevel: 120,
          maxBounds: [[-85, -180], [85, 180]],
          maxBoundsViscosity: 1.0,
          minZoom: 3,
          maxZoom: 19,
          worldCopyJump: false,
        }).setView([20, 0], 2);
        L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
        const styleUrl = 'https://tiles.openfreemap.org/styles/bright';
        const styleResp = await fetch(styleUrl);
        const styleSpec = await styleResp.json();
        const spanishStyle = forceSpanish(styleSpec);
        require('maplibre-gl/dist/maplibre-gl.css');
        require('@maplibre/maplibre-gl-leaflet');
        L.maplibreGL({
          style: spanishStyle,
          attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        mapInst.current = map;
        setMapReady(true);
      } catch (error) {
        console.error('Error inicializando mapa:', error);
      }
    })();

    return () => {
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
      setMapReady(false);
    };
  }, []);

  // ── Colocar marcadores de aeropuertos ────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || sim.aeropuertos.length === 0) return;
    const L = require('leaflet');

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Inicializar estado de almacenes con capacidad base del aeropuerto
    sim.aeropuertos.forEach(a => {
      if (!airportStateRef.current.has(a.codigo)) {
        airportStateRef.current.set(a.codigo, { ocupacion: 0, capacidad: a.capacidad });
      }
    });

    function crearIconoAlmacen(pct: number) {
      return L.icon({
        iconUrl: getLocationSVG(pct),
        iconSize: [24, 30],
        iconAnchor: [12, 30],
        popupAnchor: [0, -30],
        className: 'almacen-marker',
      });
    }

    function actualizarIconoAlmacen(marker: any, pct: number) {
      marker.setIcon(crearIconoAlmacen(pct));
    }

    sim.aeropuertos.forEach(a => {
      const estadoInicial = airportStateRef.current.get(a.codigo) || { ocupacion: 0, capacidad: a.capacidad };
      const pctInicial = estadoInicial.capacidad > 0 ? (estadoInicial.ocupacion / estadoInicial.capacidad) * 100 : 0;

      const generarPopupHTML = () => {
        const estado = airportStateRef.current.get(a.codigo) || { ocupacion: 0, capacidad: a.capacidad };
        const pct = estado.capacidad > 0 ? Math.min(100, (estado.ocupacion / estado.capacidad) * 100) : 0;
        const color = pct === 0 ? '#3b82f6' : pct < 50 ? '#10b981' : pct < 80 ? '#f97316' : '#ef4444';
        return `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:120px;line-height:1.3;">
            <div style="font-size:11px;font-weight:700;color:#1f2937;">${a.codigo} · ${a.ciudad}</div>
            <div style="display:flex;align-items:center;gap:4px;font-size:10px;line-height:1.2;">
              <span style="font-weight:700;color:${color};">${pct.toFixed(1)}%</span>
              <span style="color:#6b7280;">${estado.ocupacion}/${estado.capacidad} maletas</span>
            </div>
          </div>`;
      };

      const m = L.marker([a.latitud, a.longitud], { icon: crearIconoAlmacen(pctInicial) }).addTo(mapInst.current);
      m.setZIndexOffset(10000);
      m.airportCode = a.codigo;
      m.generarPopupHTML = generarPopupHTML;
      m.bindPopup(generarPopupHTML(), { maxWidth: 300, className: 'warehouse-popup' });
      m.on('popupopen', () => m.setPopupContent(m.generarPopupHTML()));
      markersRef.current.push(m);
    });

    // Exponer actualizarIconoAlmacen para usarlo desde spawnAvion/removeAvion
    (mapInst.current as any)._actualizarIconoAlmacen = actualizarIconoAlmacen;
  }, [sim.aeropuertos, mapReady]);

  // ── Calcular métricas en tiempo real (memoizado para renderizado eficiente) ───
  const metricas = useMemo(() => {
    if (!sim.isRunning || sim.iteracion === 0) {
      return {
        vuelosOperando: 0,
        maletasEnTransito: 0,
        almacenesConCarga: 0,
        ocupacionPromedio: 0,
        tasaCumplimientoSLA: 0,
        entregasExitosas: 0,
        ocupacionAviones: 0,
        maletasEntregadas: 0,
      };
    }

    const activeFlights = flightEventsRef.current.filter(fe => fe.active);
    const completedFlights = flightEventsRef.current.filter(fe => fe.done === true);
    const almacenes = Array.from(airportStateRef.current.values());

    // Vuelos operando
    const vuelosOperando = activeFlights.length;

    // Maletas en tránsito
    const maletasEnTransito = activeFlights.reduce((sum, fe) => sum + fe.maletasVuelo, 0);

    // Almacenes con carga
    const almacenesConCarga = almacenes.filter(a => a.ocupacion > 0).length;

    // Ocupación promedio de almacenes
    const ocupacionPromedio = almacenes.length > 0
      ? almacenes.reduce((sum, a) => sum + (a.capacidad > 0 ? (a.ocupacion / a.capacidad) * 100 : 0), 0) / almacenes.length
      : 0;

    // Ocupación promedio de aviones
    const ocupacionAviones = activeFlights.length > 0
      ? activeFlights.reduce((sum, fe) => sum + (fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0), 0) / activeFlights.length
      : 0;

    // Entregas exitosas
    const entregasExitosas = completedFlights.length;

    const rutasPlanificadas = Array.from(rutasPlanificadasRef.current.values());
    
    // Calcular dinámicamente el cumplimiento de SLA usando LogEvents
    // Los envíos completados tienen un LogEvent con color #f59e0b (naranja)
    // Nota: el evento de completado no siempre tiene idEnvio, así que buscamos
    // por el texto del log que contiene el codigoRastreo de cada ruta
    const enviosCompletadosIds = new Set<string>();

    // Construir mapa de codigoRastreo → idEnvio para búsqueda rápida
    const codigoARuta = new Map<string, BackendRutaPlanificada>();
    rutasPlanificadas.forEach(ruta => {
      const claveRuta = claveEnvio(ruta.idEnvio, ruta.numeroLote);   // ← NUEVO
      const codigo = `${claveRuta}${ruta.idCliente || ''}${ruta.origen}${ruta.destino}`;   // ← antes: ruta.idEnvio
      codigoARuta.set(codigo, ruta);
    });

    logEventsRef.current.forEach(logEvent => {
      if (logEvent.color === '#f59e0b') {
        if (logEvent.idEnvio && logEvent.fired) {
          enviosCompletadosIds.add(logEvent.idEnvio);   // ya es claveRuta, sin cambios
          return;
        }
        const match = logEvent.text.match(/✅ Envío (\S+) completado/);
        if (match) {
          const ruta = codigoARuta.get(match[1]);
          if (ruta && (logEvent.fired || logEvent.minutosDisparo <= currentMinSimRef.current)) {
            enviosCompletadosIds.add(claveEnvio(ruta.idEnvio, ruta.numeroLote));   // ← antes: ruta.idEnvio
          }
        }
      }
    });

    let rutasCumplidas = 0;
    let rutasCompletadas = 0;
    let maletasEntregadas = 0;
    
    rutasPlanificadas.forEach(ruta => {
      // Si el envío aparece en los logs como completado
      if (enviosCompletadosIds.has(claveEnvio(ruta.idEnvio, ruta.numeroLote))) {
        rutasCompletadas++;
        maletasEntregadas += ruta.maletas;
        // Verificar si cumplió el SLA
        if ((ruta.sla || '').toLowerCase() === 'cumplido') {
          rutasCumplidas++;
        }
      }
    });
    
    const tasaCumplimientoSLA = rutasCompletadas > 0
      ? (rutasCumplidas / rutasCompletadas) * 100
      : 0;

    return {
      vuelosOperando,
      maletasEnTransito,
      almacenesConCarga,
      ocupacionPromedio,
      ocupacionAviones,
      tasaCumplimientoSLA,
      entregasExitosas,
      maletasEntregadas,
    };
  }, [sim.isRunning, sim.iteracion, simMinutos, sim.logs.length, localLogs.length,sim.allLogEvents.length,sim.allFlightEvents.length]); // Re-calcula cada vez que simMinutos o logs cambian



  // ── Loop de renderizado en mapa (solo SVG, sin lógica de tiempo) ────────
  // El motor de simulación local gestiona tiempo + ciclo de vida FlightEvents
  useEffect(() => {
    let frameId: number;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let started = false;

    function spawnAvionRender(fe: FlightEvent, map: any) {
      const L = require('leaflet');
      const path = bezierCurve(
        [fe.latOrigen, fe.lngOrigen],
        [fe.latDestino, fe.lngDestino],
        40
      );

      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.style.position = 'absolute';
      svgEl.style.top = '0';
      svgEl.style.left = '0';
      svgEl.style.pointerEvents = 'none';
      svgEl.style.zIndex = '1000';

      const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');

      const isEmpty = fe.key.startsWith('unused-');
      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', getAirplaneSVG(ocupPct, isEmpty));
      img.setAttribute('x', '-15');
      img.setAttribute('y', '-15');
      img.setAttribute('width', '30');
      img.setAttribute('height', '30');
      img.style.pointerEvents = 'auto';
      img.style.cursor = 'pointer';

      grp.appendChild(img);
      svgEl.appendChild(grp);
      map.getPanes().overlayPane.appendChild(svgEl);

      fe.svgElement = svgEl;
      fe.airplaneGroup = grp;
      fe.airplaneImage = img;

      // Click → panel de detalle del avión (tramo de vuelo)
      img.addEventListener('click', (ev: any) => {
        ev.stopPropagation();
        mostrarPanelAvion(fe);
      });

      // Hover → tooltip con código de vuelo y ocupación
      img.addEventListener('mouseenter', () => {
        hoveredFlightKeyRef.current = fe.key;
        const isEmpty = fe.key.startsWith('unused-');
        const ocupPct = isEmpty ? 0 : (fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0);
        const codigo = generarCodigoVuelo(fe.origenCode, fe.destinoCode, extraerHHMM(fe.sale || ''));
        const color = isEmpty ? '#3b82f6' : ocupPct < 50 ? '#10b981' : ocupPct < 80 ? '#f97316' : '#ef4444';
        let tooltip = tooltipElRef.current;
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;background:rgba(255,255,255,0.95);border:1px solid var(--border-color);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:#1f2937;box-shadow:0 2px 8px rgba(0,0,0,0.15);white-space:nowrap;display:none;';
          document.body.appendChild(tooltip);
          tooltipElRef.current = tooltip;
        }
        tooltip.innerHTML = `${codigo} · <span style="color:${color}">${ocupPct.toFixed(1)}%</span>`;
        const rect = img.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = (rect.top - 6) + 'px';
        tooltip.style.transform = 'translate(-50%, -100%)';
        tooltip.style.display = 'block';
      });

      img.addEventListener('mouseleave', () => {
        hoveredFlightKeyRef.current = null;
        if (tooltipElRef.current) {
          tooltipElRef.current.style.display = 'none';
        }
      });

      (fe as any)._path = path;
      (fe as any)._lastColorBucket = -1;
      applyColorFilterToFlight(fe);
    }

    function applyColorFilterToFlight(fe: FlightEvent) {
      if (!fe.airplaneImage) return;
      const filter = activeColorsRef.current;
      const isEmpty = fe.key.startsWith('unused-');
      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      const bucket = (fe as any)._lastColorBucket ?? (isEmpty ? -1 : (ocupPct < 50 ? 0 : ocupPct < 80 ? 1 : 2));
      const colorKey = bucket === -1 ? 'blue' : bucket === 0 ? 'green' : bucket === 1 ? 'orange' : 'red';
      const visible = filter.all || filter[colorKey];
      fe.airplaneImage.style.display = visible ? '' : 'none';
    }

    function removeAvionRender(fe: FlightEvent) {
      if (fe.svgElement) {
        try { fe.svgElement.remove(); } catch (_) { }
        fe.svgElement = undefined;
        fe.airplaneGroup = undefined;
        fe.airplaneImage = undefined;
      }

      if (panelFlightKeyRef.current === fe.key) {
        cerrarPanelAvion(fe.key);
      }

    }

    function updateAvionPosition(fe: FlightEvent, progress: number, map: any) {
      if (!Number.isFinite(progress) || progress < 0) return;
      if (!fe.svgElement || !fe.airplaneGroup || !fe.airplaneImage) return;
      const path: [number, number][] = (fe as any)._path;
      if (!path || path.length < 2) return;

      const zoom = map.getZoom();
      const size = map.getSize();
      const margin = 1000;

      const exact = progress * (path.length - 1);
      const idx = Math.min(Math.floor(exact), path.length - 2);
      const frac = exact - idx;
      const nextIdx = idx + 1;
      const [lat, lng] = [
        path[idx][0] + (path[nextIdx][0] - path[idx][0]) * frac,
        path[idx][1] + (path[nextIdx][1] - path[idx][1]) * frac,
      ];
      const [nlat, nlng] = path[nextIdx];

      const cosLat = Math.cos(lat * Math.PI / 180);
      const angle = Math.atan2(-(nlat - lat), (nlng - lng) * cosLat) * (180 / Math.PI);

      const airplaneSize = Math.max(16, 18 + (zoom - 2) * 2);
      const offset = airplaneSize / 2;

      const pt = map.latLngToLayerPoint([lat, lng]);

      fe.airplaneImage.setAttribute('width', airplaneSize.toString());
      fe.airplaneImage.setAttribute('height', airplaneSize.toString());
      fe.airplaneImage.setAttribute('x', (-offset).toString());
      fe.airplaneImage.setAttribute('y', (-offset).toString());

      fe.svgElement.setAttribute('width', (size.x + margin * 2).toString());
      fe.svgElement.setAttribute('height', (size.y + margin * 2).toString());
      fe.svgElement.style.left = (-margin) + 'px';
      fe.svgElement.style.top = (-margin) + 'px';

      fe.airplaneGroup.setAttribute(
        'transform',
        `translate(${pt.x + margin},${pt.y + margin}) rotate(${angle} 0 0)`
      );

      // Actualizar color si cambió
      const isEmpty = fe.key.startsWith('unused-');
      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      const bucket = isEmpty ? -1 : (ocupPct < 50 ? 0 : ocupPct < 80 ? 1 : 2);
      if ((fe as any)._lastColorBucket !== bucket) {
        fe.airplaneImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', getAirplaneSVG(ocupPct, isEmpty));
        (fe as any)._lastColorBucket = bucket;
        applyColorFilterToFlight(fe);
      }

      // Reposicionar tooltip si este vuelo está siendo hovereado
      if (hoveredFlightKeyRef.current === fe.key && tooltipElRef.current) {
        const r = fe.airplaneImage.getBoundingClientRect();
        tooltipElRef.current.style.left = (r.left + r.width / 2) + 'px';
        tooltipElRef.current.style.top = (r.top - 6) + 'px';
      }
    }

    function startLoop() {
      if (started) return;
      const map = mapInst.current;
      if (!map) return;
      started = true;

      function renderLoop() {
        const map = mapInst.current;
        if (!map) { frameId = requestAnimationFrame(renderLoop); return; }

        try {
          const minSim = Math.min(TOTAL_MINUTOS_SIM, currentMinSimRef.current);
          setSimMinutos(Math.floor(minSim));

          // Actualizar stopwatch cada frame
          if (clockEnabledRef.current && stopwatchStartedAtRef.current === null) {
            stopwatchStartedAtRef.current = Date.now();
          }
          if (clockEnabledRef.current && stopwatchStartedAtRef.current != null) {
            const elapsedSec = Math.floor((Date.now() - stopwatchStartedAtRef.current) / 1000);
            const label = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`;
            if (label !== lastStopwatchLabelRef.current) {
              lastStopwatchLabelRef.current = label;
              setStopwatch(label);
            }
          } else {
            if (lastStopwatchLabelRef.current !== '') {
              lastStopwatchLabelRef.current = '';
              setStopwatch('00:00');
            }
          }

          const events = flightEventsRef.current;

          for (const fe of events) {
            if (fe.done) {
              if (fe.svgElement) removeAvionRender(fe);
              continue;
            }

            if (fe.active && !fe.svgElement) {
              // No re-spawnear si el vuelo ya llegó (rawProgress >= 1)
              const dur = fe.minutosFin - fe.minutosInicio;
              const raw = dur > 0 ? (minSim - fe.minutosInicio) / dur : 1;
              if (Number.isFinite(raw) && raw < 1) {
                spawnAvionRender(fe, map);
              }
            }

            if (fe.active && fe.svgElement) {
              const duracion = fe.minutosFin - fe.minutosInicio;
              if (!Number.isFinite(duracion) || duracion <= 0) {
                removeAvionRender(fe);
                continue;
              }
              const rawProgress = (minSim - fe.minutosInicio) / duracion;
              if (!Number.isFinite(rawProgress) || rawProgress >= 1 || rawProgress < 0) {
                removeAvionRender(fe);
              } else {
                updateAvionPosition(fe, rawProgress, map);
              }
            }
          }
        } catch (err) {
          console.error('[renderLoop] Error:', err);
        }

        frameId = requestAnimationFrame(renderLoop);
      }

      map.on('move zoom moveend zoomend', () => {
        const map = mapInst.current;
        if (!map) return;
        flightEventsRef.current.filter(fe => fe.active && !fe.done && fe.svgElement).forEach(fe => {
          const minSim = Math.min(TOTAL_MINUTOS_SIM, currentMinSimRef.current);
          const duracion = fe.minutosFin - fe.minutosInicio;
          if (duracion > 0) {
            const progress = Math.max(0, Math.min(1, (minSim - fe.minutosInicio) / duracion));
            updateAvionPosition(fe, progress, map);
          }
        });
      });

      renderLoop();
    }

    startLoop();
    if (!started) {
      checkInterval = setInterval(() => {
        startLoop();
        if (started && checkInterval) { clearInterval(checkInterval); checkInterval = null; }
      }, 200);
    }

    return () => {
      cancelAnimationFrame(frameId);
      if (checkInterval) clearInterval(checkInterval);
      // Limpiar referencias SVG para que al re-montar se vuelvan a crear
      for (const fe of flightEventsRef.current) {
        fe.svgElement = undefined;
        fe.airplaneGroup = undefined;
        fe.airplaneImage = undefined;
      }
    };
  }, []);

  // ── Panel de búsqueda de envíos ───────────────────────────────────────────
  function cerrarPanelBusqueda() {
    const panel = document.getElementById('shipmentSearchPanel');
    if (panel) panel.remove();
    setSearchPanelOpen(false);
  }

  function mostrarPanelBusqueda() {
    if (searchPanelOpen) {
      cerrarPanelBusqueda();
      return;
    }

    let panel = document.getElementById('shipmentSearchPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'shipmentSearchPanel';
      panel.style.cssText = `
        position:absolute;left:12px;bottom:270px;width:280px;
        background:white;border-radius:10px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:12px;z-index:999996;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        pointer-events:auto;
      `;
      // Append to map container instead of body
      const mapContainer = mapRef.current;
      if (mapContainer) {
        mapContainer.appendChild(panel);
      } else {
        document.body.appendChild(panel);
      }
    }

    setSearchPanelOpen(true);

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;font-size:14px;color:#1f2937;">🔍 Buscar envío</h3>
        <button id="closeSearchPanel" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6b7280;">×</button>
      </div>
      <div style="margin-bottom:8px;">
        <input 
          type="text" 
          id="shipmentSearchInput"
          placeholder="Código de rastreo"
          style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;"
          onkeypress="if(event.key === 'Enter') document.getElementById('searchShipmentBtn').click()"
        />
      </div>
      <button 
        id="searchShipmentBtn"
        style="width:100%;padding:8px;background:var(--accent-blue);color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;"
      >
        Buscar
      </button>
    `;

    document.getElementById('closeSearchPanel')?.addEventListener('click', cerrarPanelBusqueda);
    document.getElementById('searchShipmentBtn')?.addEventListener('click', buscarEnvio);
  }

  function buscarEnvio() {
    const input = document.getElementById('shipmentSearchInput') as HTMLInputElement;
    const codigoBusqueda = input?.value.trim();

    if (!codigoBusqueda) {
      mostrarNotificacion('Por favor ingrese un código de rastreo', '#f97316');
      return;
    }

    // Buscar por código único de envío en LogEvents (tienen el código correcto)
    // Extraer el código único del texto del LogEvent usando regex
    let matchedIdEnvio: string | undefined;
    for (const le of sim.allLogEvents) {
      if (le.idEnvio && le.text.startsWith('📦 Envío')) {
        // Extraer código único del texto: "📦 Envío XXXXXX: ..."
        const match = le.text.match(/📦 Envío ([^:]+):/);
        if (match) {
          const codigoExtraido = match[1];
          if (codigoExtraido === codigoBusqueda) {
            matchedIdEnvio = le.idEnvio;
            break;
          }
        }
      }
    }

    if (!matchedIdEnvio) {
      mostrarNotificacion('El envío no está registrado actualmente', '#ef4444');
      return;
    }

    // Buscar flightEvent asociado al idEnvio
    const flightEvent = flightEventsRef.current.find(fe => fe.key.startsWith(matchedIdEnvio));

    if (!flightEvent) {
      mostrarNotificacion('El envío no tiene vuelos disponibles', '#ef4444');
      return;
    }

    // Cerrar panel de búsqueda
    cerrarPanelBusqueda();

    // Mostrar panel de detalles del envío (solo desde búsqueda)
    mostrarPanelEnvio(flightEvent, codigoBusqueda);
  }

  function handleDetener() {
    sim.detener();
    flightEventsRef.current.filter(fe => fe.active).forEach(fe => {
      if (fe.svgElement) { try { fe.svgElement.remove(); } catch (_) { } fe.svgElement = undefined; fe.airplaneGroup = undefined; fe.airplaneImage = undefined; }
      fe.active = false;
      fe.done = true;
    });
    setShowStoppedOverlay(true);
    setStartDate('');
  }

  function handleNuevaSimulacion() {
    setShowStoppedOverlay(false);
    setStartDate('');
    isInitialized.current = false;

    // Reset clock state
    clockEnabledRef.current = false;
    currentMinSimRef.current = 0;
    lastFrameTimeRef.current = 0;
    clockStateRef.current = 'CALCULANDO';
    setSimMinutos(0);

    // Remove all airplanes from the map
    flightEventsRef.current.forEach(fe => {
      if (fe.svgElement) {
        try { fe.svgElement.remove(); } catch (_) { }
        fe.svgElement = undefined;
        fe.airplaneGroup = undefined;
        fe.airplaneImage = undefined;
      }
    });

    // Reset flight events ref
    flightEventsRef.current = [];

    // Reset cancellation data refs
    cancelledFlightsRef.current = new Set();
    suppressedTramosRef.current = new Map();
    emptyFlightsAddedRef.current = new Set();
  }

  function mostrarNotificacion(mensaje: string, color: string) {
    const notif = document.createElement('div');
    notif.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:${color};color:white;padding:12px 24px;border-radius:8px;
      font-size:14px;font-weight:600;z-index:100001;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      animation:slideIn 0.3s ease-out;
    `;
    notif.textContent = mensaje;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => notif.remove(), 300);
    }, 3000);

    // Add animations if not already present
    if (!document.getElementById('notifAnimations')) {
      const style = document.createElement('style');
      style.id = 'notifAnimations';
      style.textContent = `
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideOut {
          from { opacity: 1; transform: translateX(-50%) translateY(0); }
          to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Generar código de vuelo: IATA origen + IATA destino + HHMM
  const generarCodigoVuelo = (origenCodigo: string, destinoCodigo: string, horaSalida: string): string => {
    // horaSalida formato "HH:MM"
    const [hh, mm] = horaSalida.split(':').map(s => s.replace(/\D/g, '')); // Eliminar caracteres no numéricos
    return `${origenCodigo}${destinoCodigo}${hh}${mm}`;
  };

  // Extrae solo HH:mm de cualquier formato ("HH:mm" o "DD/MM/AAAA HH:MM")
  const extraerHHMM = (timeStr: string): string => {
    if (!timeStr) return '00:00';
    const parts = timeStr.split(' ');
    const timePart = parts[parts.length - 1] || '00:00';
    return timePart.substring(0, 5);
  };

  // Cancela un vuelo llamando al backend
  const cancelarVuelo = async (vuelo: any) => {
    const origen = vuelo.origen;
    const destino = vuelo.destino;
    const minutosInicio = vuelo.minutosInicio;

    // Obtener GMT del aeropuerto de origen
    const aeropuertoOrigen = sim.aeropuertosRef.current.get(origen);
    const gmtOrigen = aeropuertoOrigen?.gmt ?? 0;

    // Hora local del origen: minutosInicio + gmtOrigen * 60 (en minutos)
    const minutosLocal = minutosInicio + gmtOrigen * 60;
    const minutosDelDia = ((minutosLocal % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = String(Math.floor(minutosDelDia / 60)).padStart(2, '0');
    const mm = String(minutosDelDia % 60).padStart(2, '0');
    const salidaHHMM = extraerHHMM(vuelo.salida);
    const claveVuelo = generarCodigoVuelo(vuelo.origen, vuelo.destino, salidaHHMM);


    // 2. Calcular reloj simulado en UTC (GMT+0)
    const simStart = sim.simStartDateRef.current;
    if (!simStart) {
        // manejar error
        return;
    }
    const relojDate = new Date(simStart.getTime() + Math.floor(currentMinSimRef.current) * 60000);
    const y = String(relojDate.getUTCFullYear());
    const M = String(relojDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(relojDate.getUTCDate()).padStart(2, '0');
    const h = String(relojDate.getUTCHours()).padStart(2, '0');
    const m = String(relojDate.getUTCMinutes()).padStart(2, '0');
    const reloj = `${y}${M}${d}-${h}-${m}`;
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const url = `${API_URL}/api/simulacion/vuelos/cancelar?claveVuelo=${encodeURIComponent(claveVuelo)}&relojSimuladoActual=${encodeURIComponent(reloj)}`;
      console.log('[cancelarVuelo] URL:', url);
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        const msg = await res.text();
        sim.addLog(`✅ Cancelación exitosa: ${msg}`, '#22c55e');
        // Persistir cancelación local si el vuelo no está en el SSE
        if (!sim.cancelledFlights.has(claveVuelo)) {
          canceledLocallyRef.current = new Set(canceledLocallyRef.current).add(claveVuelo);
        }
      } else {
        sim.addLog(`❌ Error al cancelar vuelo`, '#ef4444');
      }
    } catch (e) {
      console.error('[cancelarVuelo]', e);
      sim.addLog(`❌ Error de conexión al cancelar vuelo`, '#ef4444');
    } finally {
      // Remover del Set independientemente del resultado
      setCancellingFlights(prev => { const newSet = new Set(prev); newSet.delete(claveVuelo); return newSet; });
    }
  };

  // ── Helper: hacer un panel arrastrable dentro del mapa ──────────────────────
  function makeDraggable(panel: HTMLElement, defaultRight: number, defaultTop: number) {
    const container = mapRef.current;
    if (!container) return;

    // Posición de reset
    const resetPosition = () => {
      panel.style.right = defaultRight + 'px';
      panel.style.top = defaultTop + 'px';
      panel.style.left = '';
    };

    // Exponer función de reset para el botón inline onclick
    (panel as any)._resetPosition = resetPosition;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTopPx = 0;

    const onMouseDown = (e: MouseEvent) => {
      // Solo iniciar drag si el click es en el handle o en el panel fuera de botones
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      const handle = panel.querySelector('.panel-drag-handle');
      if (handle && !handle.contains(target)) return;

      isDragging = true;
      panel.style.cursor = 'grabbing';

      const containerRect = container.getBoundingClientRect();
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left - containerRect.left;
      startTopPx = rect.top - containerRect.top;

      // Convertir de right/top a left/top para facilitar el drag
      panel.style.left = startLeft + 'px';
      panel.style.right = '';
      panel.style.top = startTopPx + 'px';

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const containerRect = container.getBoundingClientRect();
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;

      let newLeft = startLeft + (e.clientX - startX);
      let newTop = startTopPx + (e.clientY - startY);

      // Restringir dentro del mapa
      newLeft = Math.max(0, Math.min(newLeft, containerRect.width - panelW));
      newTop = Math.max(0, Math.min(newTop, containerRect.height - panelH));

      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        panel.style.cursor = '';
      }
    };

    panel.addEventListener('mousedown', onMouseDown as any);
    document.addEventListener('mousemove', onMouseMove as any);
    document.addEventListener('mouseup', onMouseUp);

    // Cleanup al remover el panel
    const observer = new MutationObserver(() => {
      if (!document.contains(panel)) {
        panel.removeEventListener('mousedown', onMouseDown as any);
        document.removeEventListener('mousemove', onMouseMove as any);
        document.removeEventListener('mouseup', onMouseUp);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Helper: hacer un panel flotante arrastrable (se desprende del flujo) ─────────
  function makeDraggableFloating(panel: HTMLElement, container: HTMLElement) {
    const DRAG_THRESHOLD = 4;
    let pendingDrag = false;
    let isDragging = false;
    let isDetached = false;
    let downX = 0;
    let downY = 0;
    let startLeft = 0;
    let startTop = 0;

    const detach = () => {
      if (isDetached) return;
      const rect = panel.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = '';
      panel.style.margin = '0';
      panel.style.zIndex = '999999';
      startLeft = rect.left;
      startTop = rect.top;
      isDetached = true;
    };

    const resetPosition = () => {
      panel.style.position = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.margin = '';
      panel.style.zIndex = '';
      isDetached = false;
    };

    (panel as any)._resetPosition = resetPosition;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      pendingDrag = true;
      isDragging = false;
      downX = e.clientX;
      downY = e.clientY;
      if (isDetached) {
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
      }
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!pendingDrag) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        isDragging = true;
        panel.style.cursor = 'grabbing';
        detach();
      }
      const containerRect = container.getBoundingClientRect();
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      newLeft = Math.max(containerRect.left, Math.min(newLeft, containerRect.right - panelW));
      newTop = Math.max(containerRect.top, Math.min(newTop, containerRect.bottom - panelH));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      pendingDrag = false;
      if (isDragging) {
        isDragging = false;
        panel.style.cursor = '';
      }
    };

    panel.addEventListener('mousedown', onMouseDown as any);
    document.addEventListener('mousemove', onMouseMove as any);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      panel.removeEventListener('mousedown', onMouseDown as any);
      document.removeEventListener('mousemove', onMouseMove as any);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  // ── Panel de Detalle del Avión (tramo de vuelo — se abre al hacer clic en el mapa) ──
  function cerrarPanelAvion(feKey?: string) {
    if (feKey && panelFlightKeyRef.current !== feKey) return;
    const panel = document.getElementById('airplaneFlightPanel');
    if (panel) panel.remove();
    panelFlightKeyRef.current = null;
    setSelectedVueloKey(null);
  }

  function mostrarPanelAvion(fe: FlightEvent, autoScroll = true) {
    // Cerrar panel de envío si estuviera abierto
    const panelEnvio = document.getElementById('airplaneDetailsPanel');
    if (panelEnvio) panelEnvio.remove();

    let panel = document.getElementById('airplaneFlightPanel');
    const isNew = !panel;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'airplaneFlightPanel';
      panel.style.cssText = `
        position:absolute;right:12px;top:170px;width:300px;
        background:white;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:18px;z-index:10001;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        max-height:60vh;overflow-y:auto;pointer-events:auto;
      `;
      if (mapRef.current) mapRef.current.appendChild(panel); else document.body.appendChild(panel);
      makeDraggable(panel, 12, 170);
    }

    panelFlightKeyRef.current = fe.key;

    // Fallback: si capacidadVuelo es 0 y no es vuelo sin uso, buscar en SSE
    if (fe.capacidadVuelo === 0 && !fe.key.startsWith('unused-')) {
      for (const ruta of rutasPlanificadasRef.current.values()) {
        const tramo = (ruta.tramos || []).find(t => t.origen === fe.origenCode && t.destino === fe.destinoCode);
        if (tramo && (tramo.capacidadVuelo > 0 || tramo.maletasVuelo > 0)) {
          fe.capacidadVuelo = tramo.capacidadVuelo ?? 0;
          fe.maletasVuelo = tramo.maletasVuelo ?? 0;
          break;
        }
      }
    }

    // Resolución de aeropuertos
    const aeropuertoOrigen = sim.aeropuertos.find(a => a.codigo === fe.origenCode);
    const aeropuertoDestino = sim.aeropuertos.find(a => a.codigo === fe.destinoCode);

    // Calcular horarios en GMT (consistente con vuelosGlobales y el backend)
    const simStartDate = sim.simStartDateRef.current;
    if (!simStartDate) return;
    let startDateStr = startDate;
    startDateStr = `${simStartDate.getFullYear()}-${String(simStartDate.getMonth() + 1).padStart(2, '0')}-${String(simStartDate.getDate()).padStart(2, '0')}`;
    const depDate = new Date(simStartDate.getTime() + fe.minutosInicio * 60000);
    const arrDate = new Date(simStartDate.getTime() + fe.minutosFin * 60000);
    const gmt = gmtOffset;
    const depShifted = new Date(depDate.getTime() + gmt * 3600000);
    const arrShifted = new Date(arrDate.getTime() + gmt * 3600000);
    const depHH = String(depShifted.getUTCHours()).padStart(2, '0');
    const depMi = String(depShifted.getUTCMinutes()).padStart(2, '0');
    const arrHH = String(arrShifted.getUTCHours()).padStart(2, '0');
    const arrMi = String(arrShifted.getUTCMinutes()).padStart(2, '0');
    const depDD = String(depShifted.getUTCDate()).padStart(2, '0');
    const depMM = String(depShifted.getUTCMonth() + 1).padStart(2, '0');
    const depYYYY = depShifted.getUTCFullYear();
    const arrDD = String(arrShifted.getUTCDate()).padStart(2, '0');
    const arrMM = String(arrShifted.getUTCMonth() + 1).padStart(2, '0');
    const arrYYYY = arrShifted.getUTCFullYear();
    const horaSalida = `${depDD}/${depMM}/${depYYYY} ${depHH}:${depMi}`;
    const horaLlegada = `${arrDD}/${arrMM}/${arrYYYY} ${arrHH}:${arrMi}`;

    // Calcular duración en horas y minutos
    const duracionMin = fe.minutosFin - fe.minutosInicio;
    const durH = Math.floor(duracionMin / 60);
    const durM = duracionMin % 60;
    const duracionLabel = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`;

    const isEmptyFlight = fe.key.startsWith('unused-');
    const salidaHHMM = horaSalida.split(' ')[1] || '00:00';
    const codigoVueloPanel = generarCodigoVuelo(fe.origenCode, fe.destinoCode, salidaHHMM);

    if (autoScroll) {
      panelWasOpenRef.current = flightPanelOpen;
      setFlightPanelOpen(true);
      setSelectedEnvioKey(null);
      setSelectedVueloKey(codigoVueloPanel);
      pendingScrollVuelo.current = codigoVueloPanel;
      setScrollTrigger(t => t + 1);
    }

    // Total de maletas en este vuelo (suma de todos los envíos que comparten el mismo tramo)
    let totalMaletasVuelo = 0;
    // Buscar envíos relacionados usando la fuente viva del motor como respaldo
    const sourceEvents = sim.allFlightEvents.length > 0 ? sim.allFlightEvents : flightEventsRef.current;
    const enviosRelacionados: { codigoRastreo: string; idEnvio: string; label: string; maletas: number; loteLabel: string }[] = [];
    if (!isEmptyFlight) {
      const flightTimeMod = ((fe.minutosInicio % 1440) + 1440) % 1440;
      console.log(`[DEBUG ENVIOS] fe.key=${fe.key} origen=${fe.origenCode} dest=${fe.destinoCode} flightTimeMod=${flightTimeMod} fe.minutosInicio=${fe.minutosInicio} allEvents=${sim.allFlightEvents.length} refEvents=${flightEventsRef.current.length}`);
      const mismosVuelos = sourceEvents.filter(e =>
        !e.key.startsWith('card-') &&
        !e.key.startsWith('unused-') &&
        e.origenCode === fe.origenCode &&
        e.destinoCode === fe.destinoCode &&
        (((e.minutosInicio % 1440) + 1440) % 1440) === flightTimeMod
      );
      console.log(`[DEBUG ENVIOS RESULT] mismosVuelos=${mismosVuelos.length}`, mismosVuelos.map(e => ({ key: e.key, mod: ((e.minutosInicio % 1440) + 1440) % 1440 })));
      const codigosVistos = new Set<string>();
      for (const ev of mismosVuelos) {
        const eId = ev.key.split('-')[0];
        if (!codigosVistos.has(eId)) {
          codigosVistos.add(eId);
          totalMaletasVuelo += ev.maletasVuelo;
          const rutaInfo = rutasPlanificadasRef.current.get(eId);
          const loteLabel = rutaInfo?.numeroLote
            ? ` · Lote ${rutaInfo.numeroLote}/${sim.totalLotesRef.current.get(rutaInfo.idEnvio) ?? '?'}`
            : '';
          enviosRelacionados.push({
            codigoRastreo: `${eId}${rutaInfo?.idCliente || ''}${ev.origenCode}${ev.destinoCode}`,
            idEnvio: eId,
            label: `${ev.origenCode} → ${ev.destinoCode}`,
            maletas: ev.maletasVuelo,
            loteLabel
          });
        }
      }
    }

    console.log(`[DEBUG ENVIOS FINAL] relacionados=${enviosRelacionados.length} fe.key=${fe.key} isEmpty=${isEmptyFlight}`);
    panel.innerHTML = `
      <div class="panel-drag-handle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;cursor:grab;user-select:none;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${isEmptyFlight ? '<div style="width:12px;height:12px;border-radius:50%;background:#2563eb;flex-shrink:0;"></div>' : ''}
          <div>
            <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Detalle del viaje</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${codigoVueloPanel}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button id="resetAvionPanel" title="Volver a posición original" style="background:none;border:1px solid #d1d5db;border-radius:5px;font-size:12px;cursor:pointer;color:#6b7280;padding:2px 6px;line-height:1.4;" onclick="(function(){var p=document.getElementById('airplaneFlightPanel');if(p&&p._resetPosition)p._resetPosition();})()">⌖</button>
          <button id="closeAvionPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
        </div>
      </div>
      ${isEmptyFlight ? '<div style="background:#eff6ff;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:11px;color:#2563eb;font-weight:600;">Vuelo sin uso — No transporta maletas</div>' : ''}

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">HORARIOS</div>
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:9px;color:#6b7280;font-weight:600;margin-bottom:2px;">Hora de salida</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;white-space:nowrap;">${depDD}/${depMM}/${depYYYY}</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;white-space:nowrap;">${depHH}:${depMi}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;color:#6b7280;font-weight:600;margin-bottom:2px;">Hora de llegada</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;white-space:nowrap;">${arrDD}/${arrMM}/${arrYYYY}</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;white-space:nowrap;">${arrHH}:${arrMi}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;color:#6b7280;font-weight:600;margin-bottom:2px;">Duración</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;">${duracionLabel}</div>
          </div>
        </div>
      </div>
      ${enviosRelacionados.length > 0 ? `
      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">📦 ENVÍOS RELACIONADOS</div>
        <div style="max-height:${enviosRelacionados.length > 3 ? '120px' : 'auto'};overflow-y:auto;">
        ${enviosRelacionados.map((env, i) => `
        <div id="relEnvio_${i}" data-codigo="${env.codigoRastreo}" style="padding:6px 8px;background:white;border-radius:6px;cursor:pointer;margin-bottom:4px;border:1px solid var(--border-color,#e5e7eb);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:600;color:var(--accent-blue,#2563eb);">${env.codigoRastreo}<span style="font-size:10px;font-weight:500;color:#9333ea;">${env.loteLabel}</span></span>
          <span style="font-size:10px;color:#6b7280;">${env.maletas} maletas</span>
        </div>`).join('')}
        </div>
      </div>
      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">🎒 MALETAS (${isEmptyFlight ? '0 / ' + fe.capacidadVuelo : totalMaletasVuelo + ' / ' + fe.capacidadVuelo} maletas)</div>
        <div style="max-height:${enviosRelacionados.reduce((sum, env) => sum + env.maletas, 0) > 3 ? '80px' : 'auto'};overflow-y:auto;">
        ${enviosRelacionados.map(env => Array.from({ length: env.maletas }, (_, i) => `
        <div style="padding:4px 8px;background:white;border-radius:4px;margin-bottom:2px;font-size:11px;color:#1f2937;font-family:monospace;">${env.codigoRastreo}${i + 1}</div>`).join('')).join('')}
        </div>
      </div>` : ''}
    `;

    // Agregar listeners para envíos relacionados
    enviosRelacionados.forEach((env, i) => {
      const el = document.getElementById(`relEnvio_${i}`);
      if (el) {
        el.addEventListener('click', () => {
          const envioFe = flightEventsRef.current.find(e => e.key.startsWith(env.idEnvio));
          if (envioFe) mostrarPanelEnvio(envioFe, env.codigoRastreo, env.idEnvio);
        });
      }
    });

    document.getElementById('closeAvionPanel')?.addEventListener('click', () => {
      cerrarPanelAvion(fe.key);
    });
  }

  // ── Panel de Detalle del Envío (se abre SOLO desde la búsqueda) ───────────
  function cerrarPanelEnvio() {
    const panel = document.getElementById('airplaneDetailsPanel');
    if (panel) panel.remove();
    setSelectedEnvioKey(null);
  }

  function mostrarPanelEnvio(fe: FlightEvent, codigoUnicoForzado?: string, idEnvioForzado?: string) {
    cerrarPanelAvion();

    let panel = document.getElementById('airplaneDetailsPanel');
    const isNewPanel = !panel;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'airplaneDetailsPanel';
      panel.style.cssText = `
        position:absolute;right:12px;top:170px;width:300px;
        background:white;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:18px;z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        max-height:70vh;overflow-y:auto;pointer-events:auto;
      `;
      if (mapRef.current) mapRef.current.appendChild(panel); else document.body.appendChild(panel);
      makeDraggable(panel, 12, 170);
    }

    const codigoEnvio = fe.key.split('-')[0];
    // Usar idEnvioForzado si se proporciona (desde envíos relacionados), si no usar codigoEnvio
    const idEnvioABuscar = idEnvioForzado || codigoEnvio;
    // Usar rutasPorCodigoUnicoRef si se proporciona código forzado (desde búsqueda)
    // Si no, usar rutasPlanificadasRef (para otros casos)
    let rutaCompleta;
    if (codigoUnicoForzado) {
      rutaCompleta = sim.rutasPorCodigoUnicoRef.current.get(codigoUnicoForzado);
      if (!rutaCompleta) {
        rutaCompleta = rutasPlanificadasRef.current.get(idEnvioABuscar);
      }
    } else {
      rutaCompleta = rutasPlanificadasRef.current.get(idEnvioABuscar);
    }

    // ── Estado para refresh dinámico del Monitoreo ──
    let refreshInterval: number | null = null;
    let currentView: 'plan' | 'monitoreo' = 'plan';
    const getLatestFe = () => {
      const envios = flightEventsRef.current.filter(f => f.key.startsWith(codigoEnvio));
      return envios.find(f => f.active) || envios[envios.length - 1] || fe;
    };

    // Usar código forzado si se proporciona (desde búsqueda), si no calcular desde ruta
    const codigoRastreo = codigoUnicoForzado || `${codigoEnvio}${rutaCompleta?.idCliente || ''}${rutaCompleta?.origen || ''}${rutaCompleta?.destino || ''}`;

    const loteLabel = rutaCompleta?.numeroLote
      ? ` · Lote ${rutaCompleta.numeroLote}/${sim.totalLotesRef.current.get(rutaCompleta.idEnvio) ?? '?'}`
      : '';

    if (!rutaCompleta) {
      panel.innerHTML = `
        <div class="panel-drag-handle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;cursor:grab;user-select:none;">
          <div>
            <h3 style="margin:0;font-size:16px;color:#1f2937;">📦 Plan de viaje</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Código único de envío: ${codigoRastreo}<span style="color:#9333ea;font-weight:600;">${loteLabel}</span></div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button onclick="(function(){var p=document.getElementById('airplaneDetailsPanel');if(p&&p._resetPosition)p._resetPosition();})();" title="Volver a posición original" style="background:none;border:1px solid #d1d5db;border-radius:5px;font-size:12px;cursor:pointer;color:#6b7280;padding:2px 6px;line-height:1.4;">⌖</button>
            <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
          </div>
        </div>
        <div style="background:#fef3c7;padding:12px;border-radius:8px;color:#92400e;font-size:13px;">
          Información de ruta no disponible
        </div>
      `;
      document.getElementById('closeFEPanel')?.addEventListener('click', () => cerrarPanelEnvio());
      return;
    }

    const rc = rutaCompleta!;

    const aeropuertoOrigen = sim.aeropuertos.find(a => a.codigo === rc.origen);
    const aeropuertoDestino = sim.aeropuertos.find(a => a.codigo === rc.destino);
    const ubicacionOrigen = aeropuertoOrigen ? `${aeropuertoOrigen.ciudad}, ${aeropuertoOrigen.pais}` : rc.origen;
    const ubicacionDestino = aeropuertoDestino ? `${aeropuertoDestino.ciudad}, ${aeropuertoDestino.pais}` : rc.destino;

    const getUbicacion = (codigo: string) => {
      const ap = sim.aeropuertos.find(a => a.codigo === codigo);
      return ap ? `${ap.ciudad}, ${ap.pais}` : codigo;
    };

    const tipoRuta = (rc.tramos?.length ?? 0) <= 1 ? 'Directo' : 'Con Escala';

    const formatDateTime = (date: Date, gmt: number = 0) => {
      const shifted = new Date(date.getTime() + gmt * 3600000);
      const d = String(shifted.getUTCDate()).padStart(2, '0');
      const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const y = shifted.getUTCFullYear();
      const hh = String(shifted.getUTCHours()).padStart(2, '0');
      const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
      return `${d}/${m}/${y} ${hh}:${mm}`;
    };

    const parseDateStr = (dateStr: string): number => {
      if (!dateStr) return Date.now();
      let y: number, m: number, d: number, h = 0, mi = 0;
      if (dateStr.includes('-')) {
        const [dp, tp] = dateStr.split(' ');
        [y, m, d] = dp.split('-').map(Number);
        if (tp) { [h, mi] = tp.split(':').map(Number); }
      } else {
        const p = dateStr.split(' ');
        [d, m, y] = p[0].split('/').map(Number);
        if (p[1]) { [h, mi] = p[1].split(':').map(Number); }
      }
      return Date.UTC(y, m - 1, d, h, mi);
    };

    // ── Build Plan de Viaje tramos ──
    const tramosVisual = rc.tramos?.map((tramo, index) => {
      const aOrigen = sim.aeropuertos.find(a => a.codigo === tramo.origen);
      const aDestino = sim.aeropuertos.find(a => a.codigo === tramo.destino);
      const isLast = index === (rc.tramos?.length ?? 0) - 1;
      let cursorTs = rc.fechaRegistro ? parseDateStr(rc.fechaRegistro) : (sim.simStartDateRef.current?.getTime() || Date.now());
      const saleTime = (tramo.sale || '').split(' ')[1] || '00:00';
      const saleP = saleTime.split(':').map(Number);
      let saleTs = new Date(cursorTs).setUTCHours(saleP[0], saleP[1], 0, 0);
      if (saleTs < cursorTs) saleTs += 86400000;
      const llegaTime = (tramo.llega || '').split(' ')[1] || '00:00';
      const llegaP = llegaTime.split(':').map(Number);
      let llegaTs = new Date(saleTs).setUTCHours(llegaP[0], llegaP[1], 0, 0);
      if (llegaTs < saleTs) llegaTs += 86400000;
      const saleD = formatDateTime(new Date(saleTs), gmtOffset);
      const llegaD = formatDateTime(new Date(llegaTs), gmtOffset);
      return `
        <div style="background:#f9fafb;padding:8px 12px;border-radius:8px;margin-bottom:${isLast ? '0' : '8px'};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Tramo ${tramo.orden}</span>
              <span style="font-size:11px;color:#1f2937;font-weight:600;font-family:monospace;">${tramo.origen} → ${tramo.destino}</span>
            </div>
            <button id="gotoTramo_${codigoEnvio}_${index}" style="background:#2563eb;border:none;color:white;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;cursor:pointer;">✈ Ir</button>
          </div>
        </div>`;
    }).join('') || '';

    // ── Views ──
    function generarVistaPlanViaje() {
      return `
        <div class="panel-drag-handle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;cursor:grab;user-select:none;">
          <div>
            <h3 style="margin:0;font-size:16px;color:#1f2937;">📦 Plan de viaje${loteLabel ? `<span style="font-size:12px;color:#9333ea;font-weight:600;">${loteLabel}</span>` : ''}</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${codigoRastreo}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button onclick="(function(){var p=document.getElementById('airplaneDetailsPanel');if(p&&p._resetPosition)p._resetPosition();})();" title="Volver a posición original" style="background:none;border:1px solid #d1d5db;border-radius:5px;font-size:12px;cursor:pointer;color:#6b7280;padding:2px 6px;line-height:1.4;">⌖</button>
            <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
          </div>
        </div>
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:11px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">DETALLES DE ENVÍO</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Registro</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRegistro ? formatDateTime(new Date(parseDateStr(rc.fechaRegistro)), gmtOffset) : '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Recojo</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRecojo ? formatDateTime(new Date(parseDateStr(rc.fechaRecojo)), gmtOffset) : '-'}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Tiempo</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.duracion || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">SLA</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.sla || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">👥 Cliente</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.idCliente || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Maletas</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.maletas}</div></div>
          </div>
        </div>
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:11px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">RUTA</div>
          ${tramosVisual}
        </div>
        <button id="monitoreoBtn" style="width:100%;padding:9px;font-size:12px;background:#2564eb;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">📡 Monitoreo</button>
      `;
    }

    function generarTimelineMonitoreo() {
      const latestFe = getLatestFe();
      const tramos = rc.tramos || [];
      const tramoActual = latestFe.tramoOrden;

      // Construir nodos de aeropuertos (sin sale/llega aún)
      const aeropuertosRuta: { codigo: string; nombre: string; state: 'done' | 'active' | 'pending'; sale?: string; llega?: string }[] = [];
      aeropuertosRuta.push({ codigo: rc.origen, nombre: getUbicacion(rc.origen), state: 'pending' });
      tramos.forEach(tramo => {
        const last = aeropuertosRuta[aeropuertosRuta.length - 1];
        if (last.codigo !== tramo.destino) {
          aeropuertosRuta.push({ codigo: tramo.destino, nombre: getUbicacion(tramo.destino), state: 'pending' });
        }
      });

      // Asignar Sale/Llega según posición:
      // 1er aeropuerto → Sale del tramo 1
      // Aeropuerto intermedio → Llega del tramo anterior + Sale del tramo siguiente
      // Último aeropuerto → Llega del último tramo
      tramos.forEach((tramo, idx) => {
        const saleTime = (tramo.sale || '').split(' ')[1] || '';
        const llegaTime = (tramo.llega || '').split(' ')[1] || '';
        const _fmtLocal = (t: string) => {
          if (!t) return t;
          const p = t.split(':').map(Number);
          if (p.length < 2) return t;
          const h = ((p[0] + gmtOffset) % 24 + 24) % 24;
          return `${String(h).padStart(2, '0')}:${String(p[1]).padStart(2, '0')}`;
        };
        // El origen de este tramo recibe su Sale (sobrescribe si es intermedio con Sale previo)
        if (aeropuertosRuta[idx]) aeropuertosRuta[idx].sale = _fmtLocal(saleTime);
        // El destino de este tramo recibe su Llega
        if (aeropuertosRuta[idx + 1]) aeropuertosRuta[idx + 1].llega = _fmtLocal(llegaTime);
      });

      // Marcar según estado del vuelo
      if (tramoActual && tramoActual > 0) {
        const originIdx = tramoActual - 1;
        const destIdx = tramoActual;
        if (latestFe?.done) {
          // Llegó al destino (layover o final): solo el aeropuerto actual
          if (aeropuertosRuta[destIdx]) aeropuertosRuta[destIdx].state = 'active';
        } else {
          // En vuelo: origen + destino del tramo activo
          if (aeropuertosRuta[originIdx]) aeropuertosRuta[originIdx].state = 'active';
          if (aeropuertosRuta[destIdx]) aeropuertosRuta[destIdx].state = 'active';
        }
      } else {
        // Sin vuelo iniciado: solo el origen
        aeropuertosRuta[0].state = 'active';
      }

      const timelineHtml = aeropuertosRuta.map((ap, i) => {
        const isLast = i === aeropuertosRuta.length - 1;
        const colors = ap.state === 'done' ? { dot: '#16a34a', bg: 'rgba(34,197,94,0.12)', border: '#16a34a', label: '#16a34a', line: '#16a34a' }
          : ap.state === 'active' ? { dot: '#2564eb', bg: 'rgba(37,100,235,0.1)', border: '#2564eb', label: '#2564eb', line: '#2564eb' }
            : { dot: '#d1d5db', bg: '#f9fafb', border: '#e5e7eb', label: '#9ca3af', line: '#d1d5db' };
        const saleStr = ap.sale ? `<span style="font-size:9px;color:#16a34a;font-weight:600;margin-left:auto;">Sale ${ap.sale}</span>` : '';
        const llegaStr = ap.llega ? `<span style="font-size:9px;color:#2564eb;font-weight:600;margin-left:6px;">Llega ${ap.llega}</span>` : '';
        return `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${colors.bg};border:1px solid ${colors.border};width:100%;box-sizing:border-box;">
              <div style="width:12px;height:12px;border-radius:50%;background:${colors.dot};flex-shrink:0;${ap.state === 'active' ? 'box-shadow:0 0 0 3px rgba(37,100,235,0.2);' : ''}"></div>
              <div style="flex:1;display:flex;align-items:center;gap:6px;">
                <div>
                  <div style="font-size:11px;color:#1f2937;font-weight:700;">${ap.nombre}</div>
                  <div style="font-size:10px;color:${colors.label};font-weight:600;">${ap.codigo}${ap.state === 'active' ? ' ● Actual' : ''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:2px;margin-left:auto;">${llegaStr}${saleStr}</div>
              </div>
            </div>
            ${!isLast ? `<div style="width:2px;height:20px;background:${colors.line};margin:2px 0;border-radius:1px;"></div>` : ''}
          </div>`;
      }).join('');

      return { timelineHtml, aeropuertosRuta };
    }

    function generarVistaMonitoreo() {
      const latestFe = getLatestFe();
      const { timelineHtml } = generarTimelineMonitoreo();

      const restMin = Math.max(0, Math.floor(latestFe.minutosFin - currentMinSimRef.current));
      const restHH = Math.floor(restMin / 60);
      const restMM = restMin % 60;
      const tiempoRestante = restMin > 0 ? `${restHH}h ${restMM}m` : 'Completado';
      const trBg = restMin > 0 ? 'rgba(37,100,235,0.08)' : 'rgba(34,197,94,0.1)';
      const trColor = restMin > 0 ? '#1f2937' : '#16a34a';

      return `
        <div class="panel-drag-handle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;cursor:grab;user-select:none;">
          <h3 style="margin:0;font-size:16px;color:#1f2937;">📡 Monitoreo de envío</h3>
          <div style="display:flex;align-items:center;gap:4px;">
            <button onclick="(function(){var p=document.getElementById('airplaneDetailsPanel');if(p&&p._resetPosition)p._resetPosition();})();" title="Volver a posición original" style="background:none;border:1px solid #d1d5db;border-radius:5px;font-size:12px;cursor:pointer;color:#6b7280;padding:2px 6px;line-height:1.4;">⌖</button>
            <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
          </div>
        </div>
        <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Código Único de Envío</div>
          <div style="font-size:13px;color:#1f2937;font-weight:700;">${codigoRastreo}<span style="font-size:11px;color:#9333ea;font-weight:600;">${loteLabel}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div style="background:#eef2ff;padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Origen</div>
            <div style="font-size:13px;color:#1f2937;font-weight:800;">${rc.origen}</div>
            <div style="font-size:10px;color:#6b7280;font-weight:500;">${ubicacionOrigen}</div>
          </div>
          <div style="background:#fef3c7;padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Destino</div>
            <div style="font-size:13px;color:#1f2937;font-weight:800;">${rc.destino}</div>
            <div style="font-size:10px;color:#6b7280;font-weight:500;">${ubicacionDestino}</div>
          </div>
        </div>
        <div style="background:#f3f4f6;padding:8px 12px;border-radius:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:#6b7280;font-weight:600;">Tipo de Ruta</span>
          <span style="font-size:12px;padding:3px 10px;border-radius:999px;background:${tipoRuta === 'Directo' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'};color:${tipoRuta === 'Directo' ? '#16a34a' : '#d97706'};font-weight:700;">${tipoRuta}</span>
        </div>
        <div id="monitoreo-content-${codigoEnvio}">
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">Ruta Planificada</div>
          ${timelineHtml}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Plazo de Entrega</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;">${rc.sla || '-'}</div>
          </div>
          <div style="background:${trBg};padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Tiempo Restante</div>
            <div style="font-size:12px;color:${trColor};font-weight:700;">${tiempoRestante}</div>
          </div>
        </div>
        </div>
        <button id="backToPlanBtn" style="width:100%;padding:9px;font-size:12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-weight:600;color:var(--text-primary);">← Volver al Plan de Viaje</button>
      `;
    }

    function refreshMonitoreoContent() {
      if (currentView !== 'monitoreo') return;
      const container = document.getElementById(`monitoreo-content-${codigoEnvio}`);
      if (!container) return;

      const latestFe = getLatestFe();
      const { timelineHtml } = generarTimelineMonitoreo();

      const restMin = Math.max(0, Math.floor(latestFe.minutosFin - currentMinSimRef.current));
      const restHH = Math.floor(restMin / 60);
      const restMM = restMin % 60;
      const tiempoRestante = restMin > 0 ? `${restHH}h ${restMM}m` : 'Completado';
      const trBg = restMin > 0 ? 'rgba(37,100,235,0.08)' : 'rgba(34,197,94,0.1)';
      const trColor = restMin > 0 ? '#1f2937' : '#16a34a';

      container.innerHTML = `
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">Ruta Planificada</div>
          ${timelineHtml}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Plazo de Entrega</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;">${rc.sla || '-'}</div>
          </div>
          <div style="background:${trBg};padding:10px;border-radius:8px;">
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Tiempo Restante</div>
            <div style="font-size:12px;color:${trColor};font-weight:700;">${tiempoRestante}</div>
          </div>
        </div>
      `;
    }

    // ── Transition between views ──
    function transitarA(html: string) {
      const p = panel!;
      p.style.transition = 'opacity 0.15s ease, transform 0.2s ease';
      p.style.opacity = '0';
      p.style.transform = 'translateX(-12px)';
      setTimeout(() => {
        p.innerHTML = html;
        p.style.opacity = '1';
        p.style.transform = 'translateX(0)';
        document.getElementById('closeFEPanel')?.addEventListener('click', () => {
          if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
          cerrarPanelEnvio();
        });
        document.getElementById('monitoreoBtn')?.addEventListener('click', () => {
          currentView = 'monitoreo';
          transitarA(generarVistaMonitoreo());
          setTimeout(() => {
            if (currentView === 'monitoreo') {
              refreshMonitoreoContent();
              if (refreshInterval) clearInterval(refreshInterval);
              refreshInterval = window.setInterval(refreshMonitoreoContent, 1000);
            }
          }, 250);
        });
        document.getElementById('backToPlanBtn')?.addEventListener('click', () => {
          currentView = 'plan';
          if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
          transitarA(generarVistaPlanViaje());
        });
        (rc.tramos || []).forEach((tramo, idx) => {
          const btn = document.getElementById(`gotoTramo_${codigoEnvio}_${idx}`);
          if (btn) {
            btn.addEventListener('click', () => {
              const feTramo = flightEventsRef.current.find(f =>
                f.key.startsWith(codigoEnvio + '-') &&
                f.origenCode === tramo.origen &&
                f.destinoCode === tramo.destino
              );
              if (feTramo) { cerrarPanelEnvio(); mostrarPanelAvion(feTramo); }
            });
          }
        });
      }, 200);
    }

    transitarA(generarVistaPlanViaje());
  }

  // ── Barra de progreso del cronómetro ─────────────────────────────────────
  const pct = Math.round(sim.progreso);
  const simStartDateObj = sim.simStartDateRef.current;
  const simDateStr = simStartDateObj ? `${simStartDateObj.getUTCFullYear()}-${String(simStartDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(simStartDateObj.getUTCDate()).padStart(2, '0')}` : null;
  const simTimeStr = simStartDateObj ? `${String(simStartDateObj.getUTCHours()).padStart(2, '0')}:${String(simStartDateObj.getUTCMinutes()).padStart(2, '0')}` : null;
  const simTimeLabel = formatSimTime(simMinutos, simDateStr, simTimeStr, gmtOffset);

  // ── Filtros + Virtual Scroll para el panel de vuelos ──────────────────────
  const ITEM_HEIGHT = 90;
  const OVERSCAN = 5;

  const vuelosFiltrados = useMemo(() => {
    const simStart = sim.simStartDateRef.current;
    const feRef = flightEventsRef.current;

    const getOcup = (v: typeof vuelosGlobales[0]) => {
      if (!simStart) return 0;
      // Usamos sim.allFlightEvents en lugar de flightEventsRef.current
      const fe = sim.allFlightEvents.find((e: FlightEvent) =>
        e.origenCode === v.origen &&
        e.destinoCode === v.destino &&
        (e.minutosInicio % 1440) === (v.minutosInicio % 1440) &&
        !e.done
      );
      if (!fe) return 0;
      if (fe.key.startsWith('unused-')) return 0;
      if (fe.capacidadVuelo > 0) {
        return (fe.maletasVuelo / fe.capacidadVuelo) * 100;
      }
      return 0;
    };

    const sorted = vuelosGlobales.filter(vuelo => {
      const codigoVuelo = generarCodigoVuelo(vuelo.origen, vuelo.destino, extraerHHMM(vuelo.salida));
      const matchCodigo = filterCodigo === '' || codigoVuelo.toLowerCase().includes(filterCodigo.toLowerCase());
      const matchOrigen = filterOrigen === '' || vuelo.origen.toLowerCase().includes(filterOrigen.toLowerCase());
      const matchDestino = filterDestino === '' || vuelo.destino.toLowerCase().includes(filterDestino.toLowerCase());
      let matchSemaforo = true;
      if (filterSemaforo) {
        const pct = getOcup(vuelo);
        if (pct < 0) { matchSemaforo = false; }
        else if (filterSemaforo === 'azul') matchSemaforo = pct === 0;
        else if (filterSemaforo === 'verde') matchSemaforo = pct > 0 && pct < 50;
        else if (filterSemaforo === 'naranja') matchSemaforo = pct >= 50 && pct < 80;
        else if (filterSemaforo === 'rojo') matchSemaforo = pct >= 80;
      }
      return matchCodigo && matchOrigen && matchDestino && matchSemaforo;
    });

    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'salida') {
        cmp = a.salida.localeCompare(b.salida);
      } else if (sortBy === 'llegada') {
        cmp = a.llegada.localeCompare(b.llegada);
      } else if (sortBy === 'origen') {
        cmp = a.origen.localeCompare(b.origen);
      } else if (sortBy === 'destino') {
        cmp = a.destino.localeCompare(b.destino);
      } else if (sortBy === 'ocupacion') {
        cmp = getOcup(a) - getOcup(b);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [vuelosGlobales, filterCodigo, filterOrigen, filterDestino, filterSemaforo, sortBy, sortDir, sim.simStartDateRef, flightEventsRef, refreshTick, sim.allFlightEvents, sim.iteracion]);

  // ── Filter + Sort para Envíos Planificados ──────────────────────────────────
  const enviosFiltrados = useMemo(() => {
    const arr = Array.from(rutasPlanificadasRef.current.entries()).map(([idEnvio, ruta]) => {
      const codigoRastreo = `${idEnvio}${ruta.idCliente || ''}${ruta.origen}${ruta.destino}`;
      const loteLabel = ruta.numeroLote
        ? ` · Lote ${ruta.numeroLote}/${sim.totalLotesRef.current.get(ruta.idEnvio) ?? '?'}`
        : '';
      const primerTramo = (ruta.tramos || [])[0];
      const ultimoTramo = (ruta.tramos || [])[ruta.tramos.length - 1];
      const horaSalida = primerTramo ? primerTramo.sale : '';
      const horaLlegada = ultimoTramo ? ultimoTramo.llega : '';
      return { idEnvio, ruta, codigoRastreo, loteLabel, horaSalida, horaLlegada };
    });

    const filtered = arr.filter(item => {
      const matchCodigo = envFilterCodigo === '' || item.codigoRastreo.toLowerCase().includes(envFilterCodigo.toLowerCase());
      const matchOrigen = envFilterOrigen === '' || item.ruta.origen.toLowerCase().includes(envFilterOrigen.toLowerCase());
      const matchDestino = envFilterDestino === '' || item.ruta.destino.toLowerCase().includes(envFilterDestino.toLowerCase());
      return matchCodigo && matchOrigen && matchDestino;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (envSortBy === 'salida') {
        cmp = a.horaSalida.localeCompare(b.horaSalida);
      } else if (envSortBy === 'llegada') {
        cmp = a.horaLlegada.localeCompare(b.horaLlegada);
      } else if (envSortBy === 'origen') {
        cmp = a.ruta.origen.localeCompare(b.ruta.origen);
      } else if (envSortBy === 'destino') {
        cmp = a.ruta.destino.localeCompare(b.ruta.destino);
      } else if (envSortBy === 'ocupacion') {
        cmp = a.ruta.maletas - b.ruta.maletas;
      }
      return envSortDir === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [rutasPlanificadasRef, envFilterCodigo, envFilterOrigen, envFilterDestino, envSortBy, envSortDir, sim.allFlightEvents, sim.iteracion]);

  // ── Datos derivados de Almacenes ────────────────────────────────────────────
  const almacenesData = useMemo(() => {
    const feRef = flightEventsRef.current;
    const rutasMap = rutasPlanificadasRef.current;

    const salientesPorOrigen = new Map<string, { envios: Set<string>; maletas: number }>();
    const entrantesPorDestino = new Map<string, { envios: Set<string>; maletas: number }>();

    for (const ruta of rutasMap.values()) {
      for (const tramo of ruta.tramos || []) {
        let s = salientesPorOrigen.get(tramo.origen);
        if (!s) { s = { envios: new Set(), maletas: 0 }; salientesPorOrigen.set(tramo.origen, s); }
        s.envios.add(ruta.idEnvio);
        s.maletas += tramo.maletasVuelo;

        let e = entrantesPorDestino.get(tramo.destino);
        if (!e) { e = { envios: new Set(), maletas: 0 }; entrantesPorDestino.set(tramo.destino, e); }
        e.envios.add(ruta.idEnvio);
        e.maletas += tramo.maletasVuelo;
      }
    }

    const transitoPorDestino = new Map<string, { vuelos: number; maletas: number }>();
    for (const fe of feRef) {
      if (fe.active && !fe.done && fe.destinoCode && !fe.key.startsWith('unused-') && fe.maletasVuelo > 0) {
        const prev = transitoPorDestino.get(fe.destinoCode) || { vuelos: 0, maletas: 0 };
        prev.vuelos++;
        prev.maletas += fe.maletasVuelo;
        transitoPorDestino.set(fe.destinoCode, prev);
      }
    }

    return sim.aeropuertos.map(a => {
      const state = airportStateRef.current.get(a.codigo) || { ocupacion: 0, capacidad: a.capacidad };
      const pct = state.capacidad > 0 ? (state.ocupacion / state.capacidad) * 100 : 0;
      const rawSal = salientesPorOrigen.get(a.codigo);
      const rawEnt = entrantesPorDestino.get(a.codigo);
      const sal = { envios: rawSal?.envios.size ?? 0, maletas: rawSal?.maletas ?? 0 };
      const ent = { envios: rawEnt?.envios.size ?? 0, maletas: rawEnt?.maletas ?? 0 };
      const tra = transitoPorDestino.get(a.codigo) || { vuelos: 0, maletas: 0 };
      return {
        codigo: a.codigo,
        ciudad: a.ciudad,
        pais: a.pais,
        continente: a.continente || '',
        capacidad: state.capacidad,
        ocupacion: state.ocupacion,
        pct,
        salientes: sal,
        entrantes: ent,
        transito: tra,
      };
    });
  }, [sim.aeropuertos, flightEventsRef, rutasPlanificadasRef, refreshTick, sim.allFlightEvents, simMinutos]);

  const ITEM_HEIGHT_ALM = 100;
  const OVERSCAN_ALM = 5;
  const almacenesFiltrados = useMemo(() => {
    let list = almacenesData;
    if (filterAlmCodigo) {
      const q = filterAlmCodigo.toLowerCase();
      list = list.filter(a => a.codigo.toLowerCase().includes(q));
    }
    if (filterAlmCiudad) {
      const q = filterAlmCiudad.toLowerCase();
      list = list.filter(a => a.ciudad.toLowerCase().includes(q));
    }
    if (filterAlmPais) {
      const q = filterAlmPais.toLowerCase();
      list = list.filter(a => a.pais.toLowerCase().includes(q));
    }
    if (filterAlmContinente) {
      list = list.filter(a => a.continente === filterAlmContinente);
    }
    if (filterAlmSemaforo) {
      list = list.filter(a => {
        const pct = a.pct;
        if (filterAlmSemaforo === 'azul') return pct === 0;
        if (filterAlmSemaforo === 'verde') return pct > 0 && pct < 50;
        if (filterAlmSemaforo === 'naranja') return pct >= 50 && pct < 80;
        if (filterAlmSemaforo === 'rojo') return pct >= 80;
        return true;
      });
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortAlmBy === 'codigo') cmp = a.codigo.localeCompare(b.codigo);
      else if (sortAlmBy === 'ciudad') cmp = a.ciudad.localeCompare(b.ciudad);
      else if (sortAlmBy === 'pais') cmp = a.pais.localeCompare(b.pais);
      else if (sortAlmBy === 'continente') cmp = a.continente.localeCompare(b.continente);
      else if (sortAlmBy === 'ocupacion') cmp = a.pct - b.pct;
      else if (sortAlmBy === 'stock') cmp = a.ocupacion - b.ocupacion;
      else if (sortAlmBy === 'entrantes') cmp = a.entrantes.maletas - b.entrantes.maletas;
      else if (sortAlmBy === 'salientes') cmp = a.salientes.maletas - b.salientes.maletas;
      else if (sortAlmBy === 'transito') cmp = a.transito.maletas - b.transito.maletas;
      return sortAlmDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [almacenesData, filterAlmCodigo, filterAlmPais, filterAlmContinente, filterAlmSemaforo, sortAlmBy, sortAlmDir]);

  const totalHeightAlm = almacenesFiltrados.length * ITEM_HEIGHT_ALM;
  const startIdxAlm = Math.max(0, Math.floor(scrollTopAlm / ITEM_HEIGHT_ALM) - OVERSCAN_ALM);
  const endIdxAlm = Math.min(almacenesFiltrados.length, Math.ceil((scrollTopAlm + containerHeightAlm) / ITEM_HEIGHT_ALM) + OVERSCAN_ALM);
  const visibleAlmacenes = almacenesFiltrados.slice(startIdxAlm, endIdxAlm);
  const offsetYAlm = startIdxAlm * ITEM_HEIGHT_ALM;

  const totalHeight = vuelosFiltrados.length * ITEM_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(vuelosFiltrados.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  const visibleVuelos = vuelosFiltrados.slice(startIdx, endIdx);
  const offsetY = startIdx * ITEM_HEIGHT;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    autoScrollPendingRef.current = false;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, []);

  // Efecto: hacer scroll cuando se selecciona un avión
  useEffect(() => {
    if (!pendingScrollVuelo.current) return;
    const codigo = pendingScrollVuelo.current;
    pendingScrollVuelo.current = null;

    const idx = vuelosFiltrados.findIndex(v =>
      generarCodigoVuelo(v.origen, v.destino, extraerHHMM(v.salida)) === codigo
    );
    if (idx < 0) return;
    const targetScrollTop = idx * ITEM_HEIGHT;

    setScrollTop(targetScrollTop);
    autoScrollPendingRef.current = true;

    const delay = panelWasOpenRef.current ? 0 : 420;
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      if (!autoScrollPendingRef.current) return;
      autoScrollPendingRef.current = false;
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = targetScrollTop;
    }, delay);

    return () => {
      autoScrollPendingRef.current = false;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [scrollTrigger]);

  // Hacer arrastrable el panel de Indicadores globales
  useEffect(() => {
    if (!mapRef.current) return;
    const cleanups: Array<() => void> = [];
    if (globalIndicatorsPanelRef.current) cleanups.push(makeDraggableFloating(globalIndicatorsPanelRef.current, mapRef.current));
    return () => cleanups.forEach(fn => fn());
  }, []);

  return (
    <div className="main-wrapper">
      <div className="map-container" style={{ display: 'flex', width: '100%', height: '100vh' }}>
        <div className="card map-card" style={{ padding: 0, overflow: 'visible', height: '100vh', display: 'flex', flexDirection: 'column', flex: 1, margin: 0, borderRadius: 0, position: 'relative', transition: 'flex 0.35s ease' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

          {/* Simulation Stopped Overlay */}
          {showStoppedOverlay && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              zIndex: 9999999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                maxWidth: '400px',
                width: '90%',
                padding: '32px',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '16px' }}>⏹️</div>
                <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#1f2937', fontWeight: 700 }}>
                  La simulación fue detenida
                </h2>
                <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#6b7280' }}>
                  La simulación se ha detenido correctamente. Puedes iniciar una nueva simulación o reanudar la actual (próximamente).
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    disabled
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: 600,
                      backgroundColor: '#d1d5db',
                      color: '#6b7280',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'not-allowed'
                    }}
                  >
                    Reanudar
                  </button>
                  <button
                    onClick={handleNuevaSimulacion}
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: 600,
                      backgroundColor: 'var(--accent-blue)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Nueva Simulación
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtro de colores de aviones — Superior Izquierda */}
          <div style={{ position: 'absolute', top: 12, left: 55, pointerEvents: 'none', zIndex: 999999 }}>
            <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              <div onClick={() => setColorFilterOpen(!colorFilterOpen)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flexShrink: 0, userSelect: 'none' }}>
                <img src="/airplane.svg" style={{ width: 18, height: 18, filter: 'brightness(0.6)' }} alt="" />
              </div>
              <div style={{ overflow: 'hidden', transition: 'max-width 0.3s ease, opacity 0.2s ease', maxWidth: colorFilterOpen ? 400 : 0, opacity: colorFilterOpen ? 1 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px 3px 0', whiteSpace: 'nowrap' }}>
                  {(['blue', 'green', 'orange', 'red'] as const).map(color => {
                    const colorMap: Record<string, string> = { blue: '#3b82f6', green: '#22c55e', orange: '#f97316', red: '#ef4444' };
                    return (
                      <div key={color} onClick={() => {
                        const next = { ...activeColors, [color]: !activeColors[color] };
                        if (!next[color]) next.all = false;
                        else if (next.blue && next.green && next.orange && next.red) next.all = true;
                        setActiveColors(next);
                      }} style={{ width: 20, height: 20, borderRadius: 3, backgroundColor: colorMap[color], cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: activeColors[color] ? 1 : 0.4, transition: 'opacity 0.15s', flexShrink: 0 }}>
                      </div>
                    );
                  })}
                  <div style={{ width: 1, height: 20, backgroundColor: 'var(--border-color)', margin: '0 2px', flexShrink: 0 }} />
                  <div onClick={() => {
                    const all = !activeColors.all;
                    setActiveColors({ all, blue: all, green: all, orange: all, red: all });
                  }} style={{ padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: activeColors.all ? '#111827' : '#9ca3af', backgroundColor: activeColors.all ? 'rgba(0,0,0,0.06)' : 'transparent', userSelect: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {activeColors.all ? '✓' : '○'} Todos
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filtro de colores de almacenes — Superior Izquierda */}
          <div style={{ position: 'absolute', top: 52, left: 55, pointerEvents: 'none', zIndex: 999999 }}>
            <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              <div onClick={() => setWarehouseFilterOpen(!warehouseFilterOpen)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flexShrink: 0, userSelect: 'none' }}>
                <img src="/almacen.svg" style={{ width: 18, height: 18, filter: 'brightness(0.6)' }} alt="" />
              </div>
              <div style={{ overflow: 'hidden', transition: 'max-width 0.3s ease, opacity 0.2s ease', maxWidth: warehouseFilterOpen ? 400 : 0, opacity: warehouseFilterOpen ? 1 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px 3px 0', whiteSpace: 'nowrap' }}>
                  {(['blue', 'green', 'orange', 'red'] as const).map(color => {
                    const colorMap: Record<string, string> = { blue: '#3b82f6', green: '#22c55e', orange: '#f97316', red: '#ef4444' };
                    return (
                      <div key={color} onClick={() => {
                        const next = { ...activeWarehouseColors, [color]: !activeWarehouseColors[color] };
                        if (!next[color]) next.all = false;
                        else if (next.blue && next.green && next.orange && next.red) next.all = true;
                        setActiveWarehouseColors(next);
                      }} style={{ width: 20, height: 20, borderRadius: 3, backgroundColor: colorMap[color], cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: activeWarehouseColors[color] ? 1 : 0.4, transition: 'opacity 0.15s', flexShrink: 0 }}>
                      </div>
                    );
                  })}
                  <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-color)', margin: '0 2px', flexShrink: 0 }} />
                  <div onClick={() => {
                    const all = !activeWarehouseColors.all;
                    setActiveWarehouseColors({ all, blue: all, green: all, orange: all, red: all });
                  }} style={{ padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: activeWarehouseColors.all ? '#111827' : '#9ca3af', backgroundColor: activeWarehouseColors.all ? 'rgba(0,0,0,0.06)' : 'transparent', userSelect: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {activeWarehouseColors.all ? '✓' : '○'} Todos
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel de Control — Superior Derecha */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, alignItems: 'flex-start', pointerEvents: 'none', zIndex: 999999 }}>
            <div style={{ pointerEvents: 'auto', padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.92)', border: '1px solid var(--border-color)', borderRadius: 10, boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Operación Día a Día
                  <span className="led-active" style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }} />
                </h1>
                <div style={{ height: 14, width: 1, backgroundColor: 'var(--border-color)' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{horaActual}</div>
              </div>
            </div>
            <style>{`
              .led-off { background-color: rgba(107, 114, 128, 0.3); border: 1px solid rgba(107, 114, 128, 0.5); box-shadow: none; }
              @keyframes led-blink { 0%,100% { opacity:1; box-shadow:0 0 6px rgba(239,68,68,0.8); } 50% { opacity:0.4; box-shadow:0 0 2px rgba(239,68,68,0.2); } }
              .led-active { background-color: #ef4444; border: 1px solid #b91c1c; animation: led-blink 1.2s ease-in-out infinite; }
              .almacen-marker { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25)); }
              .warehouse-popup .leaflet-popup-content-wrapper { padding: 6px 8px !important; border-radius: 6px; }
              .warehouse-popup .leaflet-popup-content { margin: 0 !important; }
              .warehouse-popup .leaflet-popup-tip-container { display: none; }
            `}</style>

            <div style={{ pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.92)', border: '1px solid var(--border-color)', borderRadius: 10, boxShadow: 'var(--shadow)', overflow: 'hidden', width: 110 }}>
              <div onClick={() => setCentroControlOpen(!centroControlOpen)} style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, userSelect: 'none', fontSize: 11, fontWeight: 700, color: '#374151' }}>
                <span style={{ width: 10, textAlign: 'center' }}>{centroControlOpen ? '▼' : '▶'}</span>
                <svg width="13" height="13" viewBox="0 0 512 512" fill="#374151" style={{ flexShrink: 0 }}><g transform="translate(0,512) scale(0.1,-0.1)"><path d="M2076 5013c-13-60-43-184-66-278l-41-170-109-42-108-43-235 145c-129 80-239 145-244 145-4 0-152-144-327-319-214-214-317-324-313-334 3-8 67-115 143-238 76-123 138-231 137-239-1-22-73-193-87-206-6-6-112-35-236-63-124-29-244-57-267-63l-43-10 0-459c0-427 1-458 18-463 9-2 125-30 257-61 252-58 285-68 285-84 0-6 18-53 40-104l40-94-148-242-149-242 126-122c352-341 319-313 329-286 128 335 344 592 637 756 64 36 132 67 201 93l26 10-89 93c-170 176-257 360-284 602-32 281 69 575 268 785 199 210 451 320 733 320 710 0 1199-722 934-1378-49-123-116-225-217-329-76-79-87-94-71-99 360-126 673-428 819-788 21-53 42-95 45-94 9 4 405 429 408 439 2 4-62 115-143 245l-146 237 41 94c22 51 40 98 40 103 0 15 12 19 272 81 139 33 261 62 271 65 16 5 17 36 17 464l0 458-177 42c-98 23-220 52-271 64-50 12-96 26-101 32-12 12-83 185-84 204-1 8 61 116 137 239 76 123 140 230 143 238 4 10-99 120-313 334-175 175-322 319-326 319-5 0-114-65-244-145l-236-146-109 43-108 43-41 170c-23 94-53 218-66 278l-26 107-458 0-458 0-26-107z" /><path d="M2445 3486c-141-28-245-80-347-175-146-135-217-288-226-487-9-211 52-368 203-520 78-79 103-98 185-137 122-58 181-72 310-72 128 0 188 14 305 70 174 84 297 222 361 407 38 108 44 272 15 388-34 138-82 221-186 326-73 74-106 98-175 132-47 23-112 49-145 57-87 22-218 27-300 11z" /><path d="M2196 1755c-104-22-191-53-296-106-287-147-483-398-567-724-25-98-26-110-30-512l-5-413 1271 0 1271 0 0 353c0 370-7 474-40 598-85 324-334 613-635 735-181 74-204 78-570 80-252 2-346 0-399-11z" /></g></svg>
                Control
              </div>
              <div style={{ overflow: 'hidden', transition: 'max-height 0.25s ease, opacity 0.2s ease', maxHeight: centroControlOpen ? 100 : 0, opacity: centroControlOpen ? 1 : 0 }}>
                <div style={{ padding: '0 8px 6px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch' }}>
                  <button onClick={() => { setFlightPanelOpen(!flightPanelOpen); if (!flightPanelOpen) { setAlmacenesPanelOpen(false); setEnviosPanelOpen(false); } }}
                    style={{ padding: '5px 10px', fontSize: 11, backgroundColor: flightPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                    ✈️ Vuelos
                  </button>
                  <button onClick={() => { setEnviosPanelOpen(!enviosPanelOpen); if (!enviosPanelOpen) { setFlightPanelOpen(false); setAlmacenesPanelOpen(false); } }}
                    style={{ padding: '5px 10px', fontSize: 11, backgroundColor: enviosPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                    📦 Envíos
                  </button>
                  <button onClick={() => { setAlmacenesPanelOpen(!almacenesPanelOpen); if (!almacenesPanelOpen) { setFlightPanelOpen(false); setEnviosPanelOpen(false); } }}
                    style={{ padding: '5px 10px', fontSize: 11, backgroundColor: almacenesPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                    🏭 Almacenes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bloque de 3 paneles: Ocupación (abajo) → Registro → Indicadores (arriba) */}
          <div style={{ position: 'absolute', bottom: 20, left: 12, display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-start', gap: 8, zIndex: 999997 }}>

            {/* Ocupación — abajo */}
            <div ref={ocupacionLegendRef} style={{ backgroundColor: 'rgba(255,255,255,0.92)', padding: '10px 14px', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: isOcupacionLegendOpen ? 220 : 200 }}>
              <div
                onClick={() => setIsOcupacionLegendOpen(!isOcupacionLegendOpen)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151'}}>🛩️ Nivel de Ocupación</span>
                <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 6 }}>{isOcupacionLegendOpen ? '▲' : '▼'}</span>
              </div>
              {isOcupacionLegendOpen && (
                <div style={{ marginTop: 6 }}>
                  {[
                    { color: '#2563eb', label: '0% — Vacío' },
                    { color: '#10b981', label: '< 50% — Bajo' },
                    { color: '#f97316', label: '50–80% — Medio' },
                    { color: '#ef4444', label: '> 80% — Alto' },
                  ].map(({ color, label }) => (
                    <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
                      <span style={{ fontSize: 10, color: '#374151' }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Registro de Eventos — medio */}
            <div ref={mapRegistroPanelRef} style={{ width: isMapLogsOpen ? 300 : 200, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', overflow: 'hidden', transition: 'width 0.2s ease' }}>
              <div
                onClick={() => { if (!isMapLogsOpen) setIsMapLogsOpen(true); }}
                style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📋 Registro de Eventos</span>
                {isMapLogsOpen ? (
                  <button onClick={(e) => { e.stopPropagation(); setIsMapLogsOpen(false); }} style={{ background: 'none', border: 'none', fontSize: 11, cursor: 'pointer', color: '#6b7280', padding: '0 0 0 8px', lineHeight: 1 }}>▲</button>
                ) : (
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>{[...localLogs, ...sim.logs].length >= 100 ? '+100' : [...localLogs, ...sim.logs].length} ▼</span>
                )}
              </div>
              {isMapLogsOpen && (
                <div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', borderTop: '1px solid #e5e7eb', padding: '8px 14px' }} ref={mapLogsContainerRef}
                    onWheel={(e) => { e.stopPropagation(); if (!isMapLogsPaused) { setPausedMapLogs([...localLogs, ...sim.logs]); setIsMapLogsPaused(true); } }}
                    onTouchMove={(e) => { e.stopPropagation(); if (!isMapLogsPaused) { setPausedMapLogs([...localLogs, ...sim.logs]); setIsMapLogsPaused(true); } }}
                  >
                    {(isMapLogsPaused ? pausedMapLogs : [...localLogs, ...sim.logs]).length === 0 ? (
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>Inicia la simulación para ver eventos...</p>
                    ) : (
                      (isMapLogsPaused ? pausedMapLogs : [...localLogs, ...sim.logs]).map((log, i) => {
                        const parsed = log.time ? parseTime(log.time) : null;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                            {parsed ? (
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', minWidth: 48, flexShrink: 0, textAlign: 'center', lineHeight: 1.3 }}>
                                <div>{parsed.date}</div>
                                <div>{parsed.time}</div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', minWidth: 48, flexShrink: 0 }}>-</span>
                            )}
                            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: log.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#374151' }}>{simplifyEnvio(log.text)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {isMapLogsPaused && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 14px', borderTop: '1px solid #e5e7eb' }}>
                      <button
                        onClick={() => { setIsMapLogsPaused(false); if (mapLogsContainerRef.current) mapLogsContainerRef.current.scrollTop = 0; }}
                        style={{
                          padding: '6px 14px', fontSize: 11, backgroundColor: '#2563eb', color: 'white',
                          border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 600,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 4
                        }}
                      >
                        ▶ Reanudar flujo en vivo
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Indicadores globales — arriba */}
            <div ref={globalIndicatorsPanelRef} style={{ width: isGlobalIndicatorsOpen ? 250 : 200, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', overflow: 'hidden', transition: 'width 0.2s ease' }}>
              <div
                onClick={() => setIsGlobalIndicatorsOpen(!isGlobalIndicatorsOpen)}
                style={{ padding: '6px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📊 Indicadores globales</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button onClick={(e) => { e.stopPropagation(); const p = globalIndicatorsPanelRef.current as any; if (p && p._resetPosition) p._resetPosition(); }}
                    title="Volver a posición original"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: 0, lineHeight: 1 }}>
                    ⌖
                  </button>
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 2 }}>{isGlobalIndicatorsOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {isGlobalIndicatorsOpen && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '4px 10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[{ label: 'Ocupación Almacenes', value: `${metricas.ocupacionPromedio.toFixed(1)}%`, sv: metricas.ocupacionPromedio },
                    { label: 'Tasa cumplimiento SLA', value: `${metricas.tasaCumplimientoSLA.toFixed(1)}%` },
                    { label: 'Ocupación de Aviones', value: `${metricas.ocupacionAviones.toFixed(1)}%`, sv: metricas.ocupacionAviones },
                    { label: 'Maletas entregadas', value: metricas.maletasEntregadas.toLocaleString() },
                    ].map(m => {
                      const sc = m.sv !== undefined ? (m.sv < 50 ? '#22c55e' : m.sv < 80 ? '#f97316' : '#ef4444') : undefined;
                      return (
                        <div key={m.label} style={{ padding: '3px 6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 6, borderLeft: sc ? `3px solid ${sc}` : undefined }}>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: sc || 'var(--accent-blue)' }}>{m.value}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Panel Lateral Compartido — Vuelos / Envíos / Almacenes */}
        <div style={{
          width: (flightPanelOpen || enviosPanelOpen || almacenesPanelOpen) ? '280px' : '0',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          zIndex: 999997,
          transition: 'width 0.35s ease',
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.98)',
          boxShadow: (flightPanelOpen || enviosPanelOpen || almacenesPanelOpen) ? '-4px 0 20px rgba(0,0,0,0.10)' : 'none',
        }}>

          {/* Vuelos Disponibles */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: flightPanelOpen ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Vuelos Disponibles
                </h3>
                <button
                  onClick={() => setFlightPanelOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Total: {vuelosGlobales.length} vuelos
              </div>
              <button
                ref={filterButtonRef}
                onClick={() => setFiltersOpen(!filtersOpen)}
                style={{
                  marginTop: '12px', padding: '8px 12px', fontSize: '12px',
                  backgroundColor: 'var(--accent-blue)', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: 600, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px'
                }}
              >
                🔽 Filtrar
              </button>
              {filtersOpen && (
                <div style={{
                  position: 'fixed', top: filterPosition.top, left: filterPosition.left,
                  backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999999,
                  padding: '14px', minWidth: '220px',
                  animation: 'fadeIn 0.15s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Filtros</span>
                    <button onClick={() => { setFilterCodigo(''); setFilterOrigen(''); setFilterDestino(''); setFilterSemaforo(''); setSortBy('salida'); setSortDir('asc'); }}
                      style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
                      ✕ Borrar
                    </button>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Código</label>
                    <input type="text" placeholder="LAX-JFK" value={filterCodigo}
                      onChange={(e) => setFilterCodigo(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Origen</label>
                    <select value={filterOrigen} onChange={(e) => setFilterOrigen(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {origenesUnicos.map(og => (
                        <option key={og} value={og}>{og}{aeropuertoMap.has(og) ? ` - ${aeropuertoMap.get(og)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Destino</label>
                    <select value={filterDestino} onChange={(e) => setFilterDestino(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {destinosUnicos.map(dest => (
                        <option key={dest} value={dest}>{dest}{aeropuertoMap.has(dest) ? ` - ${aeropuertoMap.get(dest)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Ordenar por</label>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="salida">Hora de salida</option>
                      <option value="llegada">Hora de llegada</option>
                      <option value="origen">Origen</option>
                      <option value="destino">Destino</option>
                      <option value="ocupacion">Nivel de ocupación</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSortDir('asc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: sortDir === 'asc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: sortDir === 'asc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↑ Asc</button>
                    <button onClick={() => setSortDir('desc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: sortDir === 'desc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: sortDir === 'desc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↓ Desc</button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Semáforo</label>
                    <select value={filterSemaforo} onChange={e => setFilterSemaforo(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5,
                        outline: 'none', cursor: 'pointer',
                        color: filterSemaforo === 'azul' ? '#6366f1' : filterSemaforo === 'verde' ? '#22c55e' : filterSemaforo === 'naranja' ? '#f97316' : filterSemaforo === 'rojo' ? '#ef4444' : 'var(--text-primary)',
                        fontWeight: filterSemaforo ? 600 : 400,
                      }}>
                      <option value="">Todos</option>
                      <option value="azul" style={{ color: '#6366f1' }}>Vacío</option>
                      <option value="verde" style={{ color: '#22c55e' }}>Bajo</option>
                      <option value="naranja" style={{ color: '#f97316' }}>Medio</option>
                      <option value="rojo" style={{ color: '#ef4444' }}>Alto</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            {/* Virtual Scroll Container */}
            <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
              {vuelosFiltrados.length === 0 ? <div /> : (
                <div style={{ height: totalHeight, paddingTop: offsetY, boxSizing: 'border-box' }}>
                  {visibleVuelos.map((vuelo, i) => {
                    const realIdx = startIdx + i;
                    const salidaHHMM = extraerHHMM(vuelo.salida);
                    const llegadaHHMM = extraerHHMM(vuelo.llegada);
                    const aO = sim.aeropuertosRef.current.get(vuelo.origen);
                    const aD = sim.aeropuertosRef.current.get(vuelo.destino);
                    const cOri = aO ? `${aO.ciudad}` : vuelo.origen;
                    const cDes = aD ? `${aD.ciudad}` : vuelo.destino;
                    const claveVuelo = generarCodigoVuelo(vuelo.origen, vuelo.destino, salidaHHMM);
                    const esCancelado = sim.cancelledFlights.has(claveVuelo) || canceledLocallyRef.current.has(claveVuelo);
                    const esCancelling = cancellingFlights.has(claveVuelo);
                    // Buscar FlightEvent activo para obtener ocupación y detectar sin uso
                    let pctOcupacion = 0;
                    let ocupColor = '#2563eb';
                    let esSinUso = false;
                    if (sim.simStartDateRef.current) {
                      const minInicio = vuelo.minutosInicio;
                      let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done && !e.key.startsWith('unused-'));
                      if (!fe) fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done);
                      esSinUso = !fe || fe.key.startsWith('unused-');
                      if (fe && !esSinUso) {
                        if (fe.capacidadVuelo > 0) {
                          pctOcupacion = (fe.maletasVuelo / fe.capacidadVuelo) * 100;
                        } else {
                          pctOcupacion = 0;
                        } 
                      } else if (esSinUso){
                        pctOcupacion = 0;
                      }

                      if (esSinUso) {
                        ocupColor = '#2563eb';
                      } else if (pctOcupacion < 50) {
                        ocupColor = '#22c55e';
                      } else if (pctOcupacion < 80) {
                        ocupColor = '#f97316';
                      } else {
                        ocupColor = '#ef4444';
                      }
                    }
                    return (
                      <div
                        key={`${vuelo.origen}-${vuelo.destino}-${salidaHHMM}-${realIdx}`}
                        onClick={() => {
                          const simStart = sim.simStartDateRef.current;
                          if (!simStart || esCancelado || esCancelling) return;
                          if (selectedVueloKey === claveVuelo) { setSelectedVueloKey(null); cerrarPanelAvion(); return; }
                          const minInicio = vuelo.minutosInicio;
                          let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.key.startsWith('unused-'));
                          console.log(`[DEBUG VUELOS] vuelo=${vuelo.origen}→${vuelo.destino} salida=${salidaHHMM} minInicio=${minInicio}`, fe ? `feKey=${fe.key} capac=${fe.capacidadVuelo}` : 'SIN FE (card)');
                          console.log(`[DEBUG VUELOS] rutasPlanificadas=${rutasPlanificadasRef.current.size} flightEvents=${flightEventsRef.current.length}`);
                          if (fe) {
                            const envId = fe.key.split('-')[0];
                            const ruta = rutasPlanificadasRef.current.get(envId);
                            const tramo = ruta?.tramos?.find(t => t.origen === vuelo.origen && t.destino === vuelo.destino);
                            console.log(`[DEBUG VUELOS] envioId=${envId} ruta=${!!ruta} tramo=${!!tramo} sale=${tramo?.sale}`);
                            if (tramo) {
                              let matchCount = 0;
                              for (const [, r] of rutasPlanificadasRef.current.entries()) {
                                const t = (r.tramos || []).find(t2 => t2.origen === vuelo.origen && t2.destino === vuelo.destino && t2.sale === tramo.sale);
                                if (t) matchCount++;
                              }
                              console.log(`[DEBUG VUELOS] enviosRelacionadosQueCoinciden=${matchCount}`);
                            }
                          }
                          if (!fe) {
                            const aOri2 = sim.aeropuertosRef.current.get(vuelo.origen);
                            const aDes2 = sim.aeropuertosRef.current.get(vuelo.destino);
                            if (aOri2 && aDes2) {
                              fe = {
                                key: `card-${vuelo.origen}-${vuelo.destino}-${salidaHHMM.replace(':', '')}`,
                                tramoOrden: 1, origenCode: vuelo.origen, destinoCode: vuelo.destino,
                                planVueloRuta: [vuelo.origen, vuelo.destino], planVueloTipo: 'Directo',
                                latOrigen: aOri2.latitud, lngOrigen: aOri2.longitud,
                                latDestino: aDes2.latitud, lngDestino: aDes2.longitud,
                                minutosInicio: minInicio, minutosFin: minInicio + 120,
                                maletasVuelo: 0, capacidadVuelo: 0,
                                ocupacionAlmacenOrigen: 0, capacidadAlmacenOrigen: aOri2.capacidad,
                                ocupacionAlmacenDestino: 0, capacidadAlmacenDestino: aDes2.capacidad,
                              };
                            }
                          }
                          if (fe) { setSelectedVueloKey(claveVuelo); setSelectedEnvioKey(null); mostrarPanelAvion(fe, false); }
                        }}
                        style={{
                          backgroundColor: esCancelado ? 'rgba(220,53,69,0.05)' : 'var(--bg-tertiary)',
                          border: selectedVueloKey === claveVuelo ? '2px solid var(--accent-blue)' : `1px solid ${esCancelado ? 'rgba(220,53,69,0.3)' : 'var(--border-color)'}`,
                          borderRadius: '6px', padding: '8px', marginBottom: '6px',
                          cursor: esCancelado || esCancelling ? 'default' : 'pointer',
                          opacity: esCancelado ? 0.6 : (esCancelling ? 0.4 : 1),
                          pointerEvents: esCancelling ? 'none' : 'auto',
                          height: 'auto', boxSizing: 'border-box',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: esCancelado ? 'var(--danger-red)' : 'var(--accent-blue)' }}>
                            {claveVuelo}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {esCancelado && (
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: 'rgba(220,53,69,0.1)', color: 'var(--danger-red)' }}>
                                Cancelado
                              </span>
                            )}
                            {!esCancelado && !esCancelling && (
                              <button
                                onClick={(e) => { e.stopPropagation(); cancelarVuelo(vuelo); }}
                                style={{
                                  padding: '2px 6px', fontSize: '10px',
                                  backgroundColor: 'rgba(220, 53, 69, 0.1)', color: 'var(--danger-red)',
                                  border: '1px solid rgba(220, 53, 69, 0.3)', borderRadius: '4px',
                                  cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
                                }}
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 400 }}>
                            {cOri} → {cDes}
                          </span>
                          {!esCancelado && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: ocupColor }}>
                              {`Ocup. ${(esSinUso ? 0 : pctOcupacion).toFixed(1)}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Envíos Planificados Panel (overlays on top of Vuelos panel) */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: enviosPanelOpen ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.98)',
            zIndex: 1,
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Envíos Planificados
                </h3>
                <button
                  onClick={() => setEnviosPanelOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Total: {rutasPlanificadasRef.current.size} envíos
              </div>
              <button
                ref={envFilterButtonRef}
                onClick={() => setEnvFiltersOpen(!envFiltersOpen)}
                style={{
                  marginTop: '12px', padding: '8px 12px', fontSize: '12px',
                  backgroundColor: 'var(--accent-blue)', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: 600, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px'
                }}
              >
                🔽 Filtrar
              </button>
              {envFiltersOpen && (
                <div style={{
                  position: 'fixed', top: envFilterPosition.top, left: envFilterPosition.left,
                  backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999999,
                  padding: '14px', minWidth: '220px',
                  animation: 'fadeIn 0.15s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Filtros</span>
                    <button onClick={() => { setEnvFilterCodigo(''); setEnvFilterOrigen(''); setEnvFilterDestino(''); setEnvSortBy('salida'); setEnvSortDir('asc'); }}
                      style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
                      ✕ Borrar
                    </button>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Código</label>
                    <input type="text" placeholder="LAX-JFK" value={envFilterCodigo}
                      onChange={(e) => setEnvFilterCodigo(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Origen</label>
                    <select value={envFilterOrigen} onChange={(e) => setEnvFilterOrigen(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {envOrigenesUnicos.map(og => (
                        <option key={og} value={og}>{og}{aeropuertoMap.has(og) ? ` - ${aeropuertoMap.get(og)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Destino</label>
                    <select value={envFilterDestino} onChange={(e) => setEnvFilterDestino(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {envDestinosUnicos.map(dest => (
                        <option key={dest} value={dest}>{dest}{aeropuertoMap.has(dest) ? ` - ${aeropuertoMap.get(dest)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Ordenar por</label>
                    <select value={envSortBy} onChange={(e) => setEnvSortBy(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="salida">Hora de salida</option>
                      <option value="llegada">Hora de llegada</option>
                      <option value="origen">Origen</option>
                      <option value="destino">Destino</option>
                      <option value="ocupacion">Ocupación</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEnvSortDir('asc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: envSortDir === 'asc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: envSortDir === 'asc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↑ Asc</button>
                    <button onClick={() => setEnvSortDir('desc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: envSortDir === 'desc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: envSortDir === 'desc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↓ Desc</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {enviosFiltrados.length === 0 ? <div /> : (
                enviosFiltrados.slice().reverse().map(({ idEnvio, ruta }) => {
                  const tipoRuta = (ruta.tramos?.length ?? 0) <= 1 ? 'Directo' : 'En escala';
                  const aOri = sim.aeropuertos.find((a: any) => a.codigo === ruta.origen);
                  const aDes = sim.aeropuertos.find((a: any) => a.codigo === ruta.destino);
                  const ciudadOrigen = aOri ? `${aOri.ciudad}` : ruta.origen;
                  const ciudadDestino = aDes ? `${aDes.ciudad}` : ruta.destino;
                  const codigoRastreo = `${idEnvio}${ruta.idCliente || ''}${ruta.origen}${ruta.destino}`;
                  const loteLabel = ruta.numeroLote
                    ? ` · Lote ${ruta.numeroLote}/${sim.totalLotesRef.current.get(ruta.idEnvio) ?? '?'}`
                    : '';
                  return (
                    <div
                      key={idEnvio}
                      onClick={() => {
                        const envioFe = flightEventsRef.current.find(e => e.key.startsWith(idEnvio + '-'));
                        if (envioFe) { setSelectedEnvioKey(idEnvio); setSelectedVueloKey(null); mostrarPanelEnvio(envioFe); }
                      }}
                      style={{
                        padding: '6px 10px', backgroundColor: 'var(--bg-tertiary)',
                        border: selectedEnvioKey === idEnvio ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                        borderRadius: '6px', marginBottom: '6px', cursor: 'pointer',
                      }}
                    >
                      <div style={{ marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)' }}>{codigoRastreo}</span>
                        {loteLabel && <span style={{ fontSize: '11px', fontWeight: 600, color: '#9333ea' }}>{loteLabel}</span>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#374151', fontWeight: 400 }}>
                          {ciudadOrigen} → {ciudadDestino}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: tipoRuta === 'Directo' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                          color: tipoRuta === 'Directo' ? '#16a34a' : '#d97706',
                          flexShrink: 0,
                          marginLeft: '8px',
                          whiteSpace: 'nowrap'
                        }}>
                          {tipoRuta}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Almacenes Panel (overlays on top of Vuelos/Envíos panel) */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: almacenesPanelOpen ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.98)',
            zIndex: 2,
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Almacenes
                </h3>
                <button
                  onClick={() => setAlmacenesPanelOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Total: {almacenesFiltrados.length} almacenes
              </div>
              <button
                ref={filterAlmButtonRef}
                onClick={() => { setFiltrosAlmOpen(!filtrosAlmOpen); if (filterAlmButtonRef.current) { const r = filterAlmButtonRef.current.getBoundingClientRect(); setFilterAlmPosition({ top: r.bottom + 4, left: r.left }); } }}
                style={{
                  marginTop: '12px', padding: '8px 12px', fontSize: '12px',
                  backgroundColor: 'var(--accent-blue)', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: 600, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px'
                }}
              >
                🔽 Filtrar
              </button>
            </div>

            {filtrosAlmOpen && (
              <div style={{
                position: 'fixed', top: filterAlmPosition.top, left: filterAlmPosition.left,
                backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999999,
                padding: '14px', minWidth: '220px',
                animation: 'fadeIn 0.15s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Filtros</span>
                  <button onClick={() => { setFilterAlmCodigo(''); setFilterAlmContinente(''); setFilterAlmSemaforo(''); setSortAlmBy('codigo'); setSortAlmDir('asc'); }}
                    style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
                    ✕ Borrar
                  </button>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Código</label>
                  <select value={filterAlmCodigo} onChange={e => setFilterAlmCodigo(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="">Todos</option>
                    {sim.aeropuertos.map(a => (
                      <option key={a.codigo} value={a.codigo}>{a.codigo}{a.ciudad ? ` - ${a.ciudad}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Continente</label>
                  <select value={filterAlmContinente} onChange={e => setFilterAlmContinente(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="">Todos</option>
                    {[...new Set(sim.aeropuertos.map(a => a.continente).filter(Boolean))].sort().map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Ordenar por</label>
                  <select value={sortAlmBy} onChange={e => setSortAlmBy(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none' }}>
                    <option value="codigo">Código</option>
                    <option value="ciudad">Ciudad</option>
                    <option value="pais">País</option>
                    <option value="continente">Continente</option>
                    <option value="ocupacion">Ocupación</option>
                    <option value="stock">Stock</option>
                    <option value="entrantes">Entrantes</option>
                    <option value="salientes">Salientes</option>
                    <option value="transito">En tránsito</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setSortAlmDir('asc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: sortAlmDir === 'asc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: sortAlmDir === 'asc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↑ Asc</button>
                  <button onClick={() => setSortAlmDir('desc')} style={{ flex: 1, padding: '4px 0', fontSize: 11, backgroundColor: sortAlmDir === 'desc' ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: sortAlmDir === 'desc' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>↓ Desc</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Semáforo</label>
                  <select value={filterAlmSemaforo} onChange={e => setFilterAlmSemaforo(e.target.value)}
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5,
                      outline: 'none', cursor: 'pointer',
                      color: filterAlmSemaforo === 'azul' ? '#6366f1' : filterAlmSemaforo === 'verde' ? '#22c55e' : filterAlmSemaforo === 'naranja' ? '#f97316' : filterAlmSemaforo === 'rojo' ? '#ef4444' : 'var(--text-primary)',
                      fontWeight: filterAlmSemaforo ? 600 : 400,
                    }}>
                    <option value="">Todos</option>
                    <option value="azul" style={{ color: '#6366f1' }}>Vacío</option>
                    <option value="verde" style={{ color: '#22c55e' }}>Bajo</option>
                    <option value="naranja" style={{ color: '#f97316' }}>Medio</option>
                    <option value="rojo" style={{ color: '#ef4444' }}>Alto</option>
                  </select>
                </div>
              </div>
            )}

            <div ref={scrollContainerAlmRef} style={{ flex: 1, overflowY: 'auto', padding: '12px' }}
              onScroll={(e) => { setScrollTopAlm(e.currentTarget.scrollTop); if (scrollContainerAlmRef.current) { setContainerHeightAlm(scrollContainerAlmRef.current.clientHeight); } }}
            >
              {almacenesFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                  <span>⏳ Esperando datos de almacenes...</span>
                </div>
              ) : (
                <div style={{ height: totalHeightAlm, paddingTop: offsetYAlm, boxSizing: 'border-box' }}>
                  {visibleAlmacenes.map((alm, i) => {
                    const estadoColor = alm.pct === 0 ? '#6366f1' : alm.pct < 50 ? '#22c55e' : alm.pct < 80 ? '#f97316' : '#ef4444';
                    return (
                      <div
                        key={alm.codigo}
                        onClick={() => setSelectedAlmacen(selectedAlmacen === alm.codigo ? null : alm.codigo)}
                        style={{
                          padding: '10px',
                          marginBottom: '8px',
                          backgroundColor: selectedAlmacen === alm.codigo ? 'rgba(59,130,246,0.06)' : 'var(--bg-tertiary)',
                          border: `1px solid ${selectedAlmacen === alm.codigo ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{alm.codigo}</span>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>{alm.ciudad}, {alm.pais}{alm.continente ? ` · ${alm.continente}` : ''}</div>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: estadoColor }}>{alm.pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ marginTop: '6px', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', backgroundColor: estadoColor, width: `${Math.min(100, alm.pct)}%`, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '8px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                          <span>📦 Stock: <strong style={{ color: 'var(--text-primary)' }}>{alm.ocupacion}/{alm.capacidad}</strong></span>
                          <span style={{ textAlign: 'right' }}>📥 Entran: <strong style={{ color: '#2563eb' }}>{alm.entrantes.envios} envíos</strong> ({alm.entrantes.maletas} maletas)</span>
                          <span>📤 Salen: <strong style={{ color: '#d97706' }}>{alm.salientes.envios} envíos</strong> ({alm.salientes.maletas} maletas)</span>
                          <span style={{ textAlign: 'right' }}>✈️ Tránsito: <strong style={{ color: '#059669' }}>{alm.transito.maletas}</strong></span>
                        </div>
                        {selectedAlmacen === alm.codigo && (
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>📋 Envíos</div>
                            {(() => {
                              const rutas = Array.from(rutasPlanificadasRef.current.values());
                              const salientes = rutas.filter(r => (r.tramos || []).some(t => t.origen === alm.codigo));
                              const entrantes = rutas.filter(r => (r.tramos || []).some(t => t.destino === alm.codigo));
                              const enTransito = flightEventsRef.current.filter(fe => fe.destinoCode === alm.codigo && fe.active && !fe.done && !fe.key.startsWith('unused-') && fe.maletasVuelo > 0);
                              return (
                                <>
                                  {salientes.length > 0 && (
                                    <div style={{ marginBottom: '4px' }}>
                                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#d97706' }}>📤 Salen ({salientes.length}):</span>
                                      {salientes.slice(0, 3).map(r => {
                                        const tramo = (r.tramos || []).find(t => t.origen === alm.codigo);
                                        const claveR = claveEnvio(r.idEnvio, r.numeroLote);
                                        const codUnico = `${r.idEnvio}${r.idCliente || ''}${r.origen}${r.destino}`;
                                        const loteLabel = r.numeroLote ? ` · L${r.numeroLote}/${sim.totalLotesRef.current.get(r.idEnvio) ?? '?'}` : '';
                                        return (
                                          <div key={claveR} style={{ fontSize: '9px', color: 'var(--text-secondary)', paddingLeft: '12px' }}>
                                            {codUnico} → {r.destino} (tramo {tramo?.orden}: {tramo?.origen}→{tramo?.destino}, {tramo?.maletasVuelo} maletas)
                                          </div>
                                        );  
                                      })}
                                      {salientes.length > 3 && <div style={{ fontSize: '8px', color: 'var(--text-muted)', paddingLeft: '12px' }}>... y {salientes.length - 3} más</div>}
                                    </div>
                                  )}
                                  {entrantes.length > 0 && (
                                    <div style={{ marginBottom: '4px' }}>
                                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#2563eb' }}>📥 Entran ({entrantes.length}):</span>
                                      {entrantes.slice(0, 3).map(r => {
                                        const tramo = (r.tramos || []).find(t => t.destino === alm.codigo);
                                        const codUnico = `${r.idEnvio}${r.idCliente || ''}${r.origen}${r.destino}`;
                                        return (
                                          <div key={r.idEnvio} style={{ fontSize: '9px', color: 'var(--text-secondary)', paddingLeft: '12px' }}>
                                            {tramo?.origen} → {codUnico} (tramo {tramo?.orden}: {tramo?.origen}→{tramo?.destino}, {tramo?.maletasVuelo} maletas)
                                          </div>
                                        );
                                      })}
                                      {entrantes.length > 3 && <div style={{ fontSize: '8px', color: 'var(--text-muted)', paddingLeft: '12px' }}>... y {entrantes.length - 3} más</div>}
                                    </div>
                                  )}
                                  {enTransito.length > 0 && (
                                    <div>
                                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#059669' }}>✈️ En tránsito ({enTransito.length}):</span>
                                      {enTransito.filter(fe => fe.maletasVuelo > 0).map(fe => (
                                        <div key={fe.key} style={{ fontSize: '9px', color: 'var(--text-secondary)', paddingLeft: '12px' }}>
                                          {fe.origenCode} → ({fe.maletasVuelo} maletas)
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {salientes.length === 0 && entrantes.length === 0 && enTransito.length === 0 && (
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Sin envíos</div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="stat-card">
      <h3 style={{ fontSize: 13, margin: '0 0 8px 0' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color }}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, semaphoreValue }: { label: string; value: string; semaphoreValue?: number }) {
  const semColor = semaphoreValue !== undefined
    ? semaphoreValue < 50 ? '#22c55e' : semaphoreValue < 80 ? '#f97316' : '#ef4444'
    : undefined;
  return (
    <div style={{
      padding: 12,
      backgroundColor: 'var(--bg-tertiary)',
      borderRadius: 6,
      borderLeft: semColor ? `4px solid ${semColor}` : undefined,
      transition: 'border-color 0.3s',
    }}>
      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: 11 }}>{label}</small>
      <div style={{ fontSize: 20, fontWeight: 700, color: semColor || 'var(--accent-blue)', marginTop: 6 }}>{value}</div>
    </div>
  );
}
