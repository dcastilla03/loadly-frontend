'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { FlightEvent, LogEvent, LogEntry, fechaHoraAMinutosDesdeInicio, horaConMinutosDelDia, extraerFecha, useSimulacion, SIM_CONFIG } from '../simulacion-periodo/useSimulacion';

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

  const sim = useSimulacion();
  const user = typeof window !== 'undefined' ? (() => { try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; } catch { return null; } })() : null;

  // ── Refs locales (independientes de Periodo) ──
  const flightEventsRef = useRef<FlightEvent[]>([]);
  const airportStateRef = useRef<Map<string, { ocupacion: number; capacidad: number }>>(new Map());
  const cancelledFlightsRef = useRef<Set<string>>(new Set());
  const suppressedTramosRef = useRef<Map<string, { minTramoOrden: number; iteracionIdx: number }>>(new Map());
  const logEventsRef = useRef<LogEvent[]>([]);
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => {});
  const addLogBatchRef = useRef<(entries: Array<{ text: string; color: string; minutosDisparo: number }>) => void>(() => {});
  const [localLogs, setLocalLogs] = useState<Array<{ time: string | null; text: string; color: string }>>([]);

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
  const canceledLocallyRef = useRef<Set<string>>(new Set());
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
    const existingKeys = new Set(flightEventsRef.current.map(e => e.key));
    const nuevos = sim.allFlightEvents.filter(e => !existingKeys.has(e.key));
    if (nuevos.length > 0) {
      flightEventsRef.current = [...flightEventsRef.current, ...nuevos];
    }
  }, [sim.allFlightEvents]);

  // ── Sincronizar logEvents del hook → ref local ──
  useEffect(() => {
    if (sim.allLogEvents.length === 0) { logEventsRef.current = []; return; }
    const nuevos = sim.allLogEvents.slice(logEventsRef.current.length);
    if (nuevos.length > 0) {
      logEventsRef.current = [...logEventsRef.current, ...nuevos];
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
  useEffect(() => {
    if (autoStartedRef.current) return;
    const token = localStorage.getItem('authToken');
    if (!token) return;
    autoStartedRef.current = true;
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    sim.iniciar(`${y}-${m}-${d}`, `${h}:${min}`, 1, true);
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
    if (sim.iteracion > 0 && !clockEnabledRef.current) {
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
            const cancelKey = `${fe.origenCode}-${fe.destinoCode}-${String(localHour).padStart(2,'0')}:${String(gmtMin).padStart(2,'0')}`;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showStoppedOverlay, setShowStoppedOverlay] = useState(false);
  const [simMinutos, setSimMinutos] = useState(() => Math.floor(currentMinSimRef.current));

  useEffect(() => { lastFrameTimeRef.current = performance.now(); }, []);

  const [gmtOffset, setGmtOffset] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const g = u?.aeropuerto?.gmt;
      return typeof g === 'number' && !isNaN(g) ? g : 0;
    } catch { return 0; }
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
    } catch {}
  }, [sim.aeropuertos]);
  // ── addLogBatch local: formatea DD/MM/AAAA HH:MM directo ──
  useEffect(() => {
    addLogBatchRef.current = (entries) => {
      const formatted = entries.map(e => {
        const simStart = sim.simStartDateRef.current;
        let time: string | null = null;
        if (simStart && typeof e.minutosDisparo === 'number') {
          const d = new Date(simStart.getTime() + e.minutosDisparo * 60000 + gmtOffset * 3600000);
          time = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        }
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

  // ── Estados del panel de Almacenes ──────────────────────────────────────────────
  const [scrollTopAlm, setScrollTopAlm] = useState(0);
  const [containerHeightAlm, setContainerHeightAlm] = useState(600);
  const [selectedAlmacen, setSelectedAlmacen] = useState<string | null>(null);
  const [filtrosAlmOpen, setFiltrosAlmOpen] = useState(false);
  const [filterAlmCodigo, setFilterAlmCodigo] = useState('');
  const [filterAlmCiudad, setFilterAlmCiudad] = useState('');
  const [filterAlmPais, setFilterAlmPais] = useState('');
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
    fetch(`${API}/api/aeropuertos`)
      .then(r => r.json())
      .then(aeroRes => {
        if (aeroRes.exito && Array.isArray(aeroRes.datos)) {
          const map = new Map<number, { codigo: string; gmt: number }>();
          aeroRes.datos.forEach((a: any) => map.set(a.idAeropuerto, { codigo: a.codigo, gmt: a.gmt ?? 0 }));
          aeropuertoInfoRef.current = map;
        }
      }).catch(e => console.error('[aeropuertos]', e));
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

  // Listado global de vuelos: todos los vuelos desde la API (BD),
  // sin dependencia temporal ni deduplicación.
  // Convierte horaSalida (local) → GMT para compatibilidad con getClaveVuelo.
  const vuelosGlobales = useMemo(() => {
    const map = new Map<string, { origen: string; destino: string; salida: string; llegada: string }>();
    const simStart = sim.simStartDateRef.current;
    const eventos = sim.allFlightEvents;
    for (const fe of eventos) {
      if (fe.key.startsWith('unused-') || fe.key.startsWith('card-') || fe.done) continue;
      const clave = `${fe.origenCode}-${fe.destinoCode}-${fe.minutosInicio}`;
      if (map.has(clave)) continue;
      const depDate = simStart ? new Date(simStart.getTime() + fe.minutosInicio * 60000) : new Date();
      const arrDate = simStart ? new Date(simStart.getTime() + fe.minutosFin * 60000) : new Date();
      const depSh = new Date(depDate.getTime() + gmtOffset * 3600000);
      const arrSh = new Date(arrDate.getTime() + gmtOffset * 3600000);
      map.set(clave, {
        origen: fe.origenCode,
        destino: fe.destinoCode,
        salida: `${String(depSh.getUTCHours()).padStart(2, '0')}:${String(depSh.getUTCMinutes()).padStart(2, '0')}`,
        llegada: `${String(arrSh.getUTCHours()).padStart(2, '0')}:${String(arrSh.getUTCMinutes()).padStart(2, '0')}`,
      });
    }
    return Array.from(map.values());
  }, [sim.allFlightEvents, gmtOffset]);

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

  // States for pausing logs
  const [isLogsPaused, setIsLogsPaused] = useState(false);
  const [pausedLogs, setPausedLogs] = useState<LogEntry[]>([]);
  const logsContainerRef = useRef<HTMLDivElement>(null);

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
        const color = pct < 50 ? '#10b981' : pct < 80 ? '#f97316' : '#ef4444';
        return `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:220px;">
            <div style="font-size:16px;font-weight:700;color:#1f2937;margin-bottom:8px;"><b>${a.codigo}</b></div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${a.ciudad}, ${a.pais}</div>
            <div style="background:#f3f4f6;padding:10px;border-radius:6px;margin-bottom:10px;">
              <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:600;text-transform:uppercase;">Ocupación del Almacén</div>
              <div style="height:8px;background:#d1d5db;border-radius:4px;overflow:hidden;margin-bottom:6px;">
                <div style="height:100%;background:${color};width:${pct}%;transition:width 0.3s;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:#1f2937;">${estado.ocupacion} / ${estado.capacidad} maletas</span>
                <span style="font-size:11px;font-weight:600;color:${color};">${Math.round(pct)}%</span>
              </div>
            </div>
            <div style="font-size:10px;color:#9ca3af;padding-top:8px;border-top:1px solid #e5e7eb;">
              <div>Tipo: ${a.capacidad > 7000 ? '⭐ Grande' : a.capacidad > 4000 ? '⭐⭐ Mediano' : '⭐⭐⭐ Pequeño'}</div>
            </div>
          </div>`;
      };

      const m = L.marker([a.latitud, a.longitud], { icon: crearIconoAlmacen(pctInicial) }).addTo(mapInst.current);
      m.setZIndexOffset(10000);
      m.airportCode = a.codigo;
      m.generarPopupHTML = generarPopupHTML;
      m.bindPopup(generarPopupHTML(), { maxWidth: 300 });
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
        tiempoPromedio: 0,
        entregasExitosas: 0,
        ocupacionAviones: 0,
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

    // Tiempo promedio de envío
    const tiempoPromedio = completedFlights.length > 0
      ? completedFlights.reduce((sum, fe) => sum + (fe.minutosFin - fe.minutosInicio), 0) / completedFlights.length
      : 0;

    return {
      vuelosOperando,
      maletasEnTransito,
      almacenesConCarga,
      ocupacionPromedio,
      ocupacionAviones,
      tiempoPromedio,
      entregasExitosas,
    };
  }, [sim.isRunning, sim.iteracion, simMinutos]); // Re-calcula cada vez que simMinutos cambia



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

      (fe as any)._path = path;
      (fe as any)._lastColorBucket = -1;
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

  // Obtiene la clave de vuelo que espera el backend (ORIGEN-DESTINO-HH:MM hora LOCAL)
  // Usa vuelo.horaSalida (local original de la API) directamente, evitando doble conversión GMT.
  const getCancelKey = (vuelo: any): string => {
    const [h, m] = (vuelo.horaSalida || '00:00').split(':').map(Number);
    return `${vuelo.origen}-${vuelo.destino}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Cancela un vuelo llamando al backend
  const cancelarVuelo = async (vuelo: any) => {
    const claveVuelo = getCancelKey(vuelo);
    console.log('[cancelarVuelo] Enviando claveVuelo:', claveVuelo, 'vuelo:', vuelo);

    // Agregar al Set de vuelos cancelándose para bloquear visualmente
    setCancellingFlights(prev => new Set(prev).add(claveVuelo));

    // Usar tiempo actual del cronómetro (local, como se muestra en pantalla)
    const simStart = sim.simStartDateRef.current;
    if (!simStart) { console.warn('[cancelarVuelo] simStartDateRef.current es null', vuelo); setCancellingFlights(prev => { const newSet = new Set(prev); newSet.delete(claveVuelo); return newSet; }); return; }
    const relojDate = new Date(simStart.getTime() + Math.floor(currentMinSimRef.current) * 60000);
    const y = relojDate.getFullYear();
    const M = String(relojDate.getMonth() + 1).padStart(2, '0');
    const d = String(relojDate.getDate()).padStart(2, '0');
    const h = String(relojDate.getHours()).padStart(2, '0');
    const m = String(relojDate.getMinutes()).padStart(2, '0');
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

  // ── Panel de Detalle del Avión (tramo de vuelo — se abre al hacer clic en el mapa) ──
  function cerrarPanelAvion(feKey?: string) {
    if (feKey && panelFlightKeyRef.current !== feKey) return;
    const panel = document.getElementById('airplaneFlightPanel');
    if (panel) panel.remove();
    panelFlightKeyRef.current = null;
  }

  function mostrarPanelAvion(fe: FlightEvent) {
    // Cerrar panel de envío si estuviera abierto
    const panelEnvio = document.getElementById('airplaneDetailsPanel');
    if (panelEnvio) panelEnvio.remove();

    let panel = document.getElementById('airplaneFlightPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'airplaneFlightPanel';
      panel.style.cssText = `
        position:absolute;right:12px;top:170px;width:340px;
        background:white;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:18px;z-index:10001;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        max-height:60vh;overflow-y:auto;pointer-events:auto;
      `;
      if (mapRef.current) mapRef.current.appendChild(panel); else document.body.appendChild(panel);
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

    // Total de maletas en este vuelo (suma de todos los envíos que comparten el mismo tramo)
    let totalMaletasVuelo = 0;
    // Buscar envíos relacionados (mismo vuelo) desde los datos de ruta planificada
    const enviosRelacionados: { codigoRastreo: string; idEnvio: string; label: string }[] = [];
    console.log(`[DEBUG PANEL ENTRY] isEmpty=${isEmptyFlight} isCard=${fe.key.startsWith('card-')} fe.key=${fe.key} routes=${rutasPlanificadasRef.current.size}`);
    if (!isEmptyFlight && !fe.key.startsWith('card-')) {
      const envioId = fe.key.split('-')[0];
      const rutaClickeada = rutasPlanificadasRef.current.get(envioId);
      console.log(`[DEBUG PANEL ENTRY] envioId=${envioId} rutaClickeada=${!!rutaClickeada} tramos=${rutaClickeada?.tramos?.length}`);
      if (rutaClickeada && rutaClickeada.tramos) {
        const tramoClickeado = rutaClickeada.tramos.find(
          t => t.origen === fe.origenCode && t.destino === fe.destinoCode
        );
        if (tramoClickeado) {
          const saleTarget = tramoClickeado.sale;
          const codigosVistos = new Set<string>();
          for (const [idEnvio, ruta] of rutasPlanificadasRef.current.entries()) {
            const coincidencia = (ruta.tramos || []).find(
              t => t.origen === fe.origenCode && t.destino === fe.destinoCode && t.sale === saleTarget
            );
            if (coincidencia && !codigosVistos.has(idEnvio)) {
              codigosVistos.add(idEnvio);
              totalMaletasVuelo += coincidencia.maletasVuelo;
              enviosRelacionados.push({
                codigoRastreo: `${idEnvio}${ruta.idCliente || ''}${ruta.origen}${ruta.destino}`,
                idEnvio,
                label: `${ruta.origen} → ${ruta.destino}${(ruta.tramos?.length ?? 0) > 1 ? ` (${ruta.tramos.length} tramos)` : ''}`
              });
            }
          }
        }
      }
    }
    console.log(`[DEBUG PANEL] fe=${fe.origenCode}→${fe.destinoCode} minInicio=${fe.minutosInicio} totalMaletas=${totalMaletasVuelo} relacionados=${enviosRelacionados.length}`);

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${isEmptyFlight ? '<div style="width:12px;height:12px;border-radius:50%;background:#2563eb;flex-shrink:0;"></div>' : ''}
          <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Detalle del viaje</h3>
          <span style="font-size:11px;font-weight:700;color:var(--accent-blue,#2563eb);background:#eef2ff;padding:3px 8px;border-radius:6px;margin-left:4px;">${codigoVueloPanel}</span>
        </div>
        <button id="closeAvionPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
      </div>
      ${isEmptyFlight ? '<div style="background:#eff6ff;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:11px;color:#2563eb;font-weight:600;">Vuelo sin uso — No transporta maletas</div>' : ''}

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:11px;color:#6b7280;">TRAMO</div>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
            <span style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Origen</span>
            <span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">
              <span>${fe.origenCode}</span>
              <span style="font-size:9px;font-weight:500;color:#6b7280;margin-top:1px;">${aeropuertoOrigen ? `${aeropuertoOrigen.ciudad}, ${aeropuertoOrigen.pais}` : ''}</span>
            </span>
          </span>
          <span style="color:#9ca3af;font-size:18px;font-weight:800;margin-top:18px;">→</span>
          <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
            <span style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Destino</span>
            <span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#fef3c7;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">
              <span>${fe.destinoCode}</span>
              <span style="font-size:9px;font-weight:500;color:#6b7280;margin-top:1px;">${aeropuertoDestino ? `${aeropuertoDestino.ciudad}, ${aeropuertoDestino.pais}` : ''}</span>
            </span>
          </span>
        </div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">HORARIOS</div>
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:9px;color:#6b7280;font-weight:600;margin-bottom:2px;">Hora de salida</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;">${horaSalida}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;color:#6b7280;font-weight:600;margin-bottom:2px;">Hora de llegada</div>
            <div style="font-size:12px;color:#1f2937;font-weight:700;">${horaLlegada}</div>
          </div>
        </div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">MALETAS</div>
        <div style="font-size:12px;color:#1f2937;font-weight:700;">${isEmptyFlight ? '0 / ' + fe.capacidadVuelo + ' maletas (vuelo vacío)' : totalMaletasVuelo + ' / ' + fe.capacidadVuelo + ' maletas'}</div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">DURACIÓN DEL TRAMO</div>
        <div style="font-size:14px;color:#1f2937;font-weight:700;">${duracionLabel}</div>
      </div>
      ${enviosRelacionados.length > 0 ? `
      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">ENVÍOS RELACIONADOS</div>
        ${enviosRelacionados.map((env, i) => `
        <div id="relEnvio_${i}" data-codigo="${env.codigoRastreo}" style="padding:6px 8px;background:white;border-radius:6px;cursor:pointer;margin-bottom:4px;border:1px solid var(--border-color,#e5e7eb);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:600;color:var(--accent-blue,#2563eb);">${env.codigoRastreo}</span>
          <span style="font-size:10px;color:#6b7280;">${env.label}</span>
        </div>`).join('')}
      </div>` : ''}
    `;

    // Agregar listeners para envíos relacionados
    enviosRelacionados.forEach((env, i) => {
      const el = document.getElementById(`relEnvio_${i}`);
      if (el) {
        el.addEventListener('click', () => {
          const envioFe = flightEventsRef.current.find(e => e.key.startsWith(env.idEnvio));
          if (envioFe) mostrarPanelEnvio(envioFe);
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
  }

  function mostrarPanelEnvio(fe: FlightEvent, codigoUnicoForzado?: string) {
    cerrarPanelAvion();

    let panel = document.getElementById('airplaneDetailsPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'airplaneDetailsPanel';
      panel.style.cssText = `
        position:absolute;right:12px;top:170px;width:340px;
        background:white;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:18px;z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        max-height:70vh;overflow-y:auto;pointer-events:auto;
      `;
      if (mapRef.current) mapRef.current.appendChild(panel); else document.body.appendChild(panel);
    }

    const codigoEnvio = fe.key.split('-')[0];
    // Usar rutasPorCodigoUnicoRef si se proporciona código forzado (desde búsqueda)
    // Si no, usar rutasPlanificadasRef (para otros casos)
    const rutaCompleta = codigoUnicoForzado
      ? sim.rutasPorCodigoUnicoRef.current.get(codigoUnicoForzado)
      : rutasPlanificadasRef.current.get(codigoEnvio);

    // ── Estado para refresh dinámico del Monitoreo ──
    let refreshInterval: number | null = null;
    let currentView: 'plan' | 'monitoreo' = 'plan';
    const getLatestFe = () => {
      const envios = flightEventsRef.current.filter(f => f.key.startsWith(codigoEnvio));
      return envios.find(f => f.active) || envios[envios.length - 1] || fe;
    };

    // Usar código forzado si se proporciona (desde búsqueda), si no calcular desde ruta
    const codigoRastreo = codigoUnicoForzado || `${codigoEnvio}${rutaCompleta?.idCliente || ''}${rutaCompleta?.origen || ''}${rutaCompleta?.destino || ''}`;

    if (!rutaCompleta) {
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Plan de viaje</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Código único de envío: ${codigoRastreo}</div>
          </div>
          <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
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
        <div style="background:#f9fafb;padding:12px;border-radius:10px;margin-bottom:${isLast ? '0' : '12px'};position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Tramo ${tramo.orden}</span>
          </div>
          <div style="display:flex;align-items:flex-start;justify-content:center;gap:6px;margin-bottom:8px;">
            <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;flex:1;">
              <span style="font-size:9px;color:#6b7280;font-weight:600;">Origen</span>
              <span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">
                <span>${tramo.origen}</span>
                <span style="font-size:9px;font-weight:500;color:#6b7280;margin-top:1px;">${aOrigen ? `${aOrigen.ciudad}, ${aOrigen.pais}` : ''}</span>
              </span>
            </span>
            <span style="color:#9ca3af;font-size:18px;font-weight:800;margin-top:18px;flex-shrink:0;">✈</span>
            <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;flex:1;">
              <span style="font-size:9px;color:#6b7280;font-weight:600;">Destino</span>
              <span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#fef3c7;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">
                <span>${tramo.destino}</span>
                <span style="font-size:9px;font-weight:500;color:#6b7280;margin-top:1px;">${aDestino ? `${aDestino.ciudad}, ${aDestino.pais}` : ''}</span>
              </span>
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div style="flex:1;background:white;padding:8px;border-radius:6px;"><div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Sale</div><div style="font-size:12px;color:#1f2937;font-weight:700;">${saleD}</div></div>
            <div style="flex:1;background:white;padding:8px;border-radius:6px;"><div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Llega</div><div style="font-size:12px;color:#1f2937;font-weight:700;">${llegaD}</div></div>
          </div>
          ${!isLast ? '<div style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);z-index:1;"><div style="width:2px;height:12px;background:#d1d5db;margin:0 auto;"></div><div style="width:8px;height:8px;background:#d1d5db;border-radius:50%;margin:-6px auto 0;"></div></div>' : ''}
        </div>`;
    }).join('') || '';

    // ── Views ──
    function generarVistaPlanViaje() {
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Plan de viaje</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Código único de envío: ${codigoRastreo}</div>
          </div>
          <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
        </div>
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:11px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">PLAN DE VIAJE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Registro</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRegistro ? formatDateTime(new Date(parseDateStr(rc.fechaRegistro)), gmtOffset) : '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Recojo</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRecojo ? formatDateTime(new Date(parseDateStr(rc.fechaRecojo)), gmtOffset) : '-'}</div></div>
          </div>
          <div style="margin-bottom:8px;"><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Ruta</div><div style="font-size:12px;color:#1f2937;font-weight:700;">${ubicacionOrigen} → ${ubicacionDestino}</div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Tiempo</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.duracion || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">SLA</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.sla || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">👥 Cliente</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.idCliente || '-'}</div></div>
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;"><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Maletas</div><div style="font-size:12px;color:#1f2937;font-weight:700;">${rc.maletas}</div></div>
        </div>
        <div style="background:#f3f4f6;padding:12px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:11px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">TRAMOS</div>
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="margin:0;font-size:16px;color:#1f2937;">📡 Monitoreo de envío</h3>
          <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
        </div>
        <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
          <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Código Único de Envío</div>
          <div style="font-size:13px;color:#1f2937;font-weight:700;">${codigoRastreo}</div>
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
    const sorted = vuelosGlobales.filter(vuelo => {
      const codigoVuelo = generarCodigoVuelo(vuelo.origen, vuelo.destino, extraerHHMM(vuelo.salida));
      const matchCodigo = filterCodigo === '' || codigoVuelo.toLowerCase().includes(filterCodigo.toLowerCase());
      const matchOrigen = filterOrigen === '' || vuelo.origen.toLowerCase().includes(filterOrigen.toLowerCase());
      const matchDestino = filterDestino === '' || vuelo.destino.toLowerCase().includes(filterDestino.toLowerCase());
      return matchCodigo && matchOrigen && matchDestino;
    });

    const simStart = sim.simStartDateRef.current;
    const feRef = flightEventsRef.current;

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
        const getOcup = (v: typeof a) => {
          if (!simStart) return -1;
          const [hh, mm] = extraerHHMM(v.salida).split(':').map(Number);
          let d = new Date(simStart); d.setHours(hh, mm, 0, 0);
          while (d.getTime() < simStart.getTime()) d.setDate(d.getDate() + 1);
          const minInicio = Math.round((d.getTime() - simStart.getTime()) / 60000);
          const fe = feRef.find((e: any) => e.origenCode === v.origen && e.destinoCode === v.destino && (e.minutosInicio % 1440) === (minInicio % 1440));
          if (!fe || fe.key.startsWith('unused-')) return -1;
          if (fe.capacidadVuelo > 0) return (fe.maletasVuelo / fe.capacidadVuelo) * 100;
          return 0;
        };
        cmp = getOcup(a) - getOcup(b);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [vuelosGlobales, filterCodigo, filterOrigen, filterDestino, sortBy, sortDir, sim.simStartDateRef, flightEventsRef, refreshTick, sim.allFlightEvents, sim.iteracion]);

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
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortAlmBy === 'codigo') cmp = a.codigo.localeCompare(b.codigo);
      else if (sortAlmBy === 'ciudad') cmp = a.ciudad.localeCompare(b.ciudad);
      else if (sortAlmBy === 'pais') cmp = a.pais.localeCompare(b.pais);
      else if (sortAlmBy === 'ocupacion') cmp = a.pct - b.pct;
      else if (sortAlmBy === 'stock') cmp = a.ocupacion - b.ocupacion;
      else if (sortAlmBy === 'entrantes') cmp = a.entrantes.maletas - b.entrantes.maletas;
      else if (sortAlmBy === 'salientes') cmp = a.salientes.maletas - b.salientes.maletas;
      else if (sortAlmBy === 'transito') cmp = a.transito.maletas - b.transito.maletas;
      return sortAlmDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [almacenesData, filterAlmCodigo, filterAlmPais, sortAlmBy, sortAlmDir]);

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

          {/* Panel de Control — Centro Superior */}
          <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
            <div style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 0, padding: '10px 14px', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', border: '1px solid var(--border-color)', borderRadius: 10, boxShadow: 'var(--shadow)' }}>
                <h1 style={{ marginBottom: 0, fontSize: 18, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Operación Día a Día
                  <span className="led-active" style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
                  <style>{`
                  /* LED apagado (inicial) */
                  .led-off {
                    background-color: rgba(107, 114, 128, 0.3);
                    border: 1px solid rgba(107, 114, 128, 0.5);
                    box-shadow: none;
                  }
                  
                  /* LED activo - Rojo parpadeando */
                  @keyframes led-blink {
                    0%, 100% { 
                      opacity: 1; 
                      box-shadow: 0 0 6px rgba(239, 68, 68, 0.8); 
                    }
                    50% { 
                      opacity: 0.4; 
                      box-shadow: 0 0 2px rgba(239, 68, 68, 0.2); 
                    }
                  }
                  .led-active {
                    background-color: #ef4444;
                    border: 1px solid #b91c1c;
                    animation: led-blink 1.2s ease-in-out infinite;
                  }
                  .almacen-marker {
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
                  }
                `}</style>
                </h1>
                <div style={{ height: 20, width: 1, backgroundColor: 'var(--border-color)' }} />

                <div>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Tiempo Actual — {user?.aeropuerto?.ciudad}, {user?.aeropuerto?.pais}</small>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', marginTop: 2, whiteSpace: 'nowrap' }}>{horaActual}</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={mostrarPanelBusqueda}
                    style={{ padding: '7px 12px', fontSize: 11, backgroundColor: '#8b5cf6', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                    🔍 Buscar envío
                  </button>
                  <button onClick={() => { setFlightPanelOpen(!flightPanelOpen); if (!flightPanelOpen) { setAlmacenesPanelOpen(false); setEnviosPanelOpen(false); } }}
                    style={{ padding: '7px 12px', fontSize: 11, backgroundColor: flightPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                    ✈️ Vuelos
                  </button>
                  <button onClick={() => { setEnviosPanelOpen(!enviosPanelOpen); if (!enviosPanelOpen) { setFlightPanelOpen(false); setAlmacenesPanelOpen(false); } }}
                    style={{ padding: '7px 12px', fontSize: 11, backgroundColor: enviosPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                    📦 Envíos
                  </button>
                  <button onClick={() => { setAlmacenesPanelOpen(!almacenesPanelOpen); if (!almacenesPanelOpen) { setFlightPanelOpen(false); setEnviosPanelOpen(false); } }}
                    style={{ padding: '7px 12px', fontSize: 11, backgroundColor: almacenesPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                    🏭 Almacenes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Leyenda de colores */}
          <div style={{ position: 'absolute', bottom: 25, left: 12, backgroundColor: 'rgba(255,255,255,0.92)', padding: '10px 14px', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', zIndex: 999997 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase' }}>Ocupación de Vuelos</div>
            {[
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

          {/* Botón scroll hacia estadísticas */}
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999999 }}>
            <button onClick={() => document.getElementById('statsSection')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: 'var(--accent-blue)', border: 'none', color: 'white', width: 50, height: 50, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 12px rgba(37,100,235,0.3)' }}>
              <img src="/down.svg" alt="↓" style={{ width: 28, height: 28 }} />
            </button>
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
                    <button onClick={() => { setFilterCodigo(''); setFilterOrigen(''); setFilterDestino(''); setSortBy('salida'); setSortDir('asc'); }}
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
                </div>
              )}
            </div>
            {/* Virtual Scroll Container */}
            <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
              {vuelosFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                  <span>⏳ Esperando planificación del GA...</span>
                </div>
              ) : (
                <div style={{ height: totalHeight, paddingTop: offsetY, boxSizing: 'border-box' }}>
                  {visibleVuelos.map((vuelo, i) => {
                    const realIdx = startIdx + i;
                    const salidaHHMM = extraerHHMM(vuelo.salida);
                    const llegadaHHMM = extraerHHMM(vuelo.llegada);
                    const codigoVuelo = generarCodigoVuelo(vuelo.origen, vuelo.destino, salidaHHMM);
                    const claveVuelo = getCancelKey(vuelo);
                    const esCancelado = sim.cancelledFlights.has(claveVuelo) || canceledLocallyRef.current.has(claveVuelo);
                    const esCancelling = cancellingFlights.has(claveVuelo);
                    // Buscar FlightEvent activo para obtener ocupación y detectar sin uso
                    let pctOcupacion = -1;
                    let ocupColor = '';
                    let esSinUso = false;
                    const simStartOcc = sim.simStartDateRef.current;
                    if (simStartOcc) {
                      const [gmtHour, gmtMin] = salidaHHMM.split(':').map(Number);
                      let d = new Date(simStartOcc); d.setHours(gmtHour, gmtMin, 0, 0);
                      while (d.getTime() < simStartOcc.getTime()) d.setDate(d.getDate() + 1);
                      const minInicio = Math.round((d.getTime() - simStartOcc.getTime()) / 60000);
                      let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done && !e.key.startsWith('unused-'));
                      if (!fe) fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done);
                      esSinUso = !fe || fe.key.startsWith('unused-');
                      if (fe && !esSinUso && currentMinSimRef.current >= fe.minutosInicio && currentMinSimRef.current < fe.minutosFin) {
                        if (fe.capacidadVuelo > 0) {
                          pctOcupacion = (fe.maletasVuelo / fe.capacidadVuelo) * 100;
                          ocupColor = pctOcupacion < 50 ? '#22c55e' : pctOcupacion < 80 ? '#f97316' : '#ef4444';
                        } else {
                          pctOcupacion = 0;
                          ocupColor = '#2563eb';
                        }
                      }
                    }
                    return (
                      <div
                        key={`${vuelo.origen}-${vuelo.destino}-${salidaHHMM}-${realIdx}`}
                        onClick={() => {
                          const simStart = sim.simStartDateRef.current;
                          if (!simStart || esCancelado || esCancelling) return;
                          const [gmtHour, gmtMin] = salidaHHMM.split(':').map(Number);
                          let d = new Date(simStart); d.setHours(gmtHour, gmtMin, 0, 0);
                          while (d.getTime() < simStart.getTime()) d.setDate(d.getDate() + 1);
                          const minInicio = Math.round((d.getTime() - simStart.getTime()) / 60000);
                          let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done && !e.key.startsWith('unused-'));
                          if (!fe) fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && (e.minutosInicio % 1440) === (minInicio % 1440) && !e.done);
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
                          if (fe) mostrarPanelAvion(fe);
                        }}
                        style={{
                          backgroundColor: esCancelado ? 'rgba(220,53,69,0.05)' : 'var(--bg-tertiary)',
                          border: `1px solid ${esCancelado ? 'rgba(220,53,69,0.3)' : 'var(--border-color)'}`,
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
                            {codigoVuelo}
                          </div>
                          {esCancelado && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: 'rgba(220,53,69,0.1)', color: 'var(--danger-red)' }}>
                              Cancelado
                            </span>
                          )}
                          {esSinUso && !esCancelado && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
                              Sin uso
                            </span>
                          )}
                          {!esSinUso && !esCancelado && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                              En uso
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 500 }}>
                          {vuelo.origen} → {vuelo.destino}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', flex: 1 }}>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '1px' }}>Salida</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{salidaHHMM}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '1px' }}>Llegada</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{llegadaHHMM}</div>
                            </div>
                            {pctOcupacion >= 0 && (
                              <div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '1px' }}>Ocup.</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: ocupColor }}>{pctOcupacion.toFixed(1)}%</div>
                              </div>
                            )}
                          </div>
                          {!esCancelado && !esCancelling && (
                            <button
                              onClick={(e) => { e.stopPropagation(); cancelarVuelo(vuelo); }}
                              style={{
                                padding: '3px 8px', fontSize: '10px',
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
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {rutasPlanificadasRef.current.size === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px', fontSize: '13px' }}>
                  ⏳ Esperando planificación del GA...
                </div>
              ) : (
                [...rutasPlanificadasRef.current.entries()].reverse().map(([idEnvio, ruta]) => {
                  const codigoRastreo = `${idEnvio}${ruta.idCliente || ''}${ruta.origen}${ruta.destino}`;
                  const tipoRuta = (ruta.tramos?.length ?? 0) <= 1 ? 'Directo' : `${ruta.tramos?.length} tramos`;
                  return (
                    <div
                      key={idEnvio}
                      onClick={() => {
                        const envioFe = flightEventsRef.current.find(e => e.key.startsWith(idEnvio + '-'));
                        if (envioFe) mostrarPanelEnvio(envioFe);
                      }}
                      style={{
                        padding: '10px', backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)', borderRadius: '6px',
                        marginBottom: '6px', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-blue)' }}>{codigoRastreo}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '999px' }}>{ruta.maletas} maletas</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>
                        {ruta.origen} → {ruta.destino}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                        {tipoRuta}
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
                  <button onClick={() => { setFilterAlmCodigo(''); setSortAlmBy('codigo'); setSortAlmDir('asc'); }}
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
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Ordenar por</label>
                  <select value={sortAlmBy} onChange={e => setSortAlmBy(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 5, outline: 'none' }}>
                    <option value="codigo">Código</option>
                    <option value="ciudad">Ciudad</option>
                    <option value="pais">País</option>
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
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>{alm.ciudad}, {alm.pais}</div>
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
                                        const codUnico = `${r.idEnvio}${r.idCliente || ''}${r.origen}${r.destino}`;
                                        return (
                                          <div key={r.idEnvio} style={{ fontSize: '9px', color: 'var(--text-secondary)', paddingLeft: '12px' }}>
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

      {/* Sección de Estadísticas */}
      <div id="statsSection" style={{ paddingTop: 40, paddingBottom: 40, backgroundColor: 'white' }}>
        <div className="container">
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>📊 Resultados en Tiempo Real</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard title="Vuelos operando" value={metricas.vuelosOperando} color="var(--accent-blue)" />
            <StatCard title="Maletas en tránsito" value={metricas.maletasEnTransito} color="#22c55e" />
            <StatCard title="Almacenes con carga" value={metricas.almacenesConCarga} color="#f97316" />
            <StatCard title="Entregas exitosas" value={metricas.entregasExitosas} color="#10b981" />
          </div>

          {sim.resumen && (
            <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #22c55e' }}>
              <h3 style={{ color: '#22c55e', marginBottom: 16 }}>✅ Resumen Final del Algoritmo Genético</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <MetricBox label="Consumo Prom. SLA" value={`${sim.resumen.consumoPromedioSLA.toFixed(1)}%`} />
                <MetricBox label="Ocupación Vuelos" value={`${sim.resumen.ocupacionPromedioVuelos.toFixed(1)}%`} />
                <MetricBox label="Ocupación Almacenes" value={`${sim.resumen.ocupacionPromedioAlmacenes.toFixed(1)}%`} />
                <MetricBox label="Función Objetivo" value={`${sim.resumen.funcionObjetivo.toFixed(2)}%`} />
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                Tiempo de ejecución real: <strong>{sim.resumen.tiempoEjecucionRealSegundos.toFixed(1)}s</strong> |{' '}
                Total envíos: <strong>{sim.resumen.totalEnviosPlanificados}</strong> |{' '}
                Total maletas: <strong>{sim.resumen.totalMaletasPlanificadas}</strong>
              </div>
            </div>
          )}

          {sim.colapso && (
            <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' }}>
              <h3 style={{ color: '#ef4444', marginBottom: 8 }}>⚠️ COLAPSO DETECTADO</h3>
              <p style={{ margin: 0, fontSize: 14 }}><strong>Tipo:</strong> {sim.colapso.tipoError}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Envío:</strong> {sim.colapso.idEnvioCausante} | <strong>Ruta:</strong> {sim.colapso.rutaCausante}</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{sim.colapso.detalle}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>📋 Registro de Eventos</h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                  {logsPaginados.totalCount} registros
                </span>
              </div>

              <>
                <div
                  ref={logsContainerRef}
                  style={{ maxHeight: 350, overflowY: 'auto' }}
                  onWheel={(e) => { e.stopPropagation(); if (!isLogsPaused) { setPausedLogs(sim.logs); setIsLogsPaused(true); } }}
                  onTouchMove={(e) => { e.stopPropagation(); if (!isLogsPaused) { setPausedLogs(sim.logs); setIsLogsPaused(true); } }}
                >
                  {logsPaginados.logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Inicia la simulación para ver eventos...</p>}
                  {logsPaginados.logs.map((log, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 85 }}>{log.time || '-'}</span>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: log.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.text}</span>
                      </div>
                    ))}
                  </div>
                </>

              {/* Botón Reanudar */}
              {isLogsPaused && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                  <button
                    onClick={() => { setIsLogsPaused(false); if (logsContainerRef.current) logsContainerRef.current.scrollTop = 0; }}
                    style={{
                      padding: '8px 16px',
                      fontSize: 12,
                      backgroundColor: 'var(--accent-blue)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 20,
                      cursor: 'pointer',
                      fontWeight: 600,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    ▶ Reanudar flujo en vivo
                  </button>
                </div>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>ℹ️ Métricas</h3>
              {sim.isRunning && sim.iteracion > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <MetricBox label="Ocupación Almacenes" value={`${metricas.ocupacionPromedio.toFixed(1)}%`} semaphoreValue={metricas.ocupacionPromedio} />
                  <MetricBox label="Tiempo Promedio" value={`${metricas.tiempoPromedio.toFixed(0)} min`} />
                  <MetricBox label="Ocupación de Aviones" value={`${metricas.ocupacionAviones.toFixed(1)}%`} semaphoreValue={metricas.ocupacionAviones} />
                  <MetricBox label="Entregas Retrasadas" value="0" />
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Inicia la simulación para ver métricas...</p>
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
