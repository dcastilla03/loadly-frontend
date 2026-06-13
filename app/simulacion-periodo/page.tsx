'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSimulacion, FlightEvent, LogEvent, SIM_CONFIG, LogEntry, fechaHoraAMinutosDesdeInicio, horaConMinutosDelDia, extraerFecha } from './useSimulacion';

// ─── helpers SVG / Bézier ───────────────────────────────────────────────────

function getAirplaneSVG(pct: number, isEmpty?: boolean): string {
  if (isEmpty) return '/airplane-blue.svg';
  if (pct < 50) return '/airplane-green.svg';
  if (pct < 80) return '/airplane-orange.svg';
  return '/airplane-red.svg';
}

function getLocationSVG(pct: number): string {
  if (pct === 0) return '/location-blue.svg';
  if (pct < 50) return '/location-green.svg';
  if (pct < 80) return '/location-orange.svg';
  return '/location-red.svg';
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

/** Formatea minutos desde el inicio de la simulación como "DD/MM/AAAA HH:MM" */
function formatSimTime(minutos: number, startDate: string | null, startTime: string | null): string {
  if (!startDate) return 'DD/MM/AAAA HH:MM';

  try {
    // Parse startDate format "YYYY-MM-DD"
    const [year, month, day] = startDate.split('-').map(Number);

    // Parse startTime format "HH:MM"
    let hour = 0, minute = 0;
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      hour = h || 0;
      minute = m || 0;
    }

    const date = new Date(year, month - 1, day, hour, minute);

    // Add simulated minutes
    date.setMinutes(date.getMinutes() + minutos);

    // Format as DD/MM/AAAA HH:MM
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch (e) {
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

  // Estado dinámico de almacenes: codigo → {ocupacion, capacidad}
  const airportStateRef = useRef<Map<string, { ocupacion: number; capacidad: number }>>(new Map());

  // Lista viva de FlightEvent (con svgElement adjunto cuando están activos)
  const flightEventsRef = useRef<FlightEvent[]>([]);
  const cancelledFlightsRef = useRef<Set<string>>(new Set());
  const panelFlightKeyRef = useRef<string | null>(null);

  // Lista viva de LogEvent temporizados (se disparan al compas del cronómetro)
  const logEventsRef = useRef<LogEvent[]>([]);

  // Ref estable a addLog (evita problemas de closure en el loop de animación)
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => { });

  // Refs para el nuevo control de tiempo
  const currentMinSimRef = useRef<number>(0);
  const clockStateRef = useRef<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const lastFrameTimeRef = useRef<number>(0);
  const lastIteracionRef = useRef<number>(0);

  const [clockState, setClockState] = useState<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const [configCountdown, setConfigCountdown] = useState(60);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [flightPanelOpen, setFlightPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Configuration wizard state
  const [showConfigOverlay, setShowConfigOverlay] = useState(true);
  const [configWizardStep, setConfigWizardStep] = useState(1);
  const [configStartDate, setConfigStartDate] = useState('');
  const [configStartTime, setConfigStartTime] = useState('00:00');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'error' | 'success' | 'info' | 'warning' | null; text: string }>({ type: null, text: '' });
  const [uploading, setUploading] = useState(false);

  // Simulation stopped overlay state
  const [showStoppedOverlay, setShowStoppedOverlay] = useState(false);

  // Minutos simulados actuales (para mostrar en UI)
  const [simMinutos, setSimMinutos] = useState(0);
  const clockEnabledRef = useRef(false);

  // Hora real del sistema (momento presente)
  const [horaActual, setHoraActual] = useState('');
  useEffect(() => {
    const tick = () => setHoraActual(new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isInitialized = useRef(false);

  // Leer fecha y hora de inicio del query param
  useEffect(() => {
    const dateParam = new URLSearchParams(window.location.search).get('startDate');
    const timeParam = new URLSearchParams(window.location.search).get('startTime');
    if (dateParam) {
      setStartDate(dateParam);
      setConfigStartDate(dateParam);
    }
    if (timeParam) {
      setStartTime(timeParam);
      setConfigStartTime(timeParam);
    }
  }, []);

  const sim = useSimulacion(startDate || undefined, startTime || undefined);

  // Cronómetro de tiempo real transcurrido (stopwatch)
  const stopwatchStartRef = useRef<number | null>(null);
  const [stopwatch, setStopwatch] = useState('00:00');
  useEffect(() => {
    if (sim.isRunning && sim.iteracion > 0 && stopwatchStartRef.current === null) {
      stopwatchStartRef.current = performance.now();
    }
    if (!sim.isRunning) {
      stopwatchStartRef.current = null;
      setStopwatch('00:00');
      return;
    }
    if (stopwatchStartRef.current === null) return;
    const id = setInterval(() => {
      const elapsed = performance.now() - stopwatchStartRef.current!;
      const totalSec = Math.floor(elapsed / 1000);
      const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const s = String(totalSec % 60).padStart(2, '0');
      setStopwatch(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(id);
  }, [sim.isRunning, sim.iteracion]);

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

  // Actualizar clase CSS del map-container para el panel de vuelos
  useEffect(() => {
    const mapContainer = document.querySelector('.map-container') as HTMLElement;
    if (mapContainer) {
      if (flightPanelOpen) {
        mapContainer.classList.add('flight-panel-open');
      } else {
        mapContainer.classList.remove('flight-panel-open');
      }
    }
  }, [flightPanelOpen]);
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
  const canceledLocallyRef = useRef<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // ── API: todos los vuelos de la base de datos (planes-vuelo + aeropuertos) ──
  const [apiFlights, setApiFlights] = useState<any[] | null>(null);
  const aeropuertoInfoRef = useRef<Map<number, { codigo: string; gmt: number }>>(new Map());

  // ── Vuelos vacíos (no usados) de la BD ───────────────────────────────────
  const emptyFlightsAddedRef = useRef<Set<string>>(new Set());

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

    let saleDate = new Date(simStartDate);
    saleDate.setHours(gmtH, lm, 0, 0);
    while (saleDate.getTime() < simStartDate.getTime()) {
      saleDate.setDate(saleDate.getDate() + 1);
    }

    let llegaDate = new Date(saleDate);
    llegaDate.setHours(gmtHa, lma, 0, 0);
    if (llegaDate.getTime() <= saleDate.getTime()) llegaDate.setDate(llegaDate.getDate() + 1);

    const minutosInicio = Math.round((saleDate.getTime() - simStartDate.getTime()) / 60000);
    const minutosFin = Math.round((llegaDate.getTime() - simStartDate.getTime()) / 60000);

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

  useEffect(() => {
    if (!apiFlights) return;
    const simStart = sim.simStartDateRef.current;
    if (!simStart) return;

    // Build used flight keys from all SSE route data
    const usedKeys = new Set<string>();
    sim.rutasPlanificadasRef.current.forEach(ruta => {
      (ruta.tramos || []).forEach(tramo => {
        const gmtTime = (tramo.sale || '').split(' ')[1] || '00:00';
        usedKeys.add(`${tramo.origen}-${tramo.destino}-${gmtTime}`);
      });
    });

    // Mark empty flights as done if their key is now used
    let changed = false;
    emptyFlightsAddedRef.current.forEach(key => {
      const parts = key.split('-');
      if (parts.length >= 4) {
        const gmtTime = `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
        const usedKey = `${parts[1]}-${parts[2]}-${gmtTime}`;
        if (usedKeys.has(usedKey)) {
          const fe = flightEventsRef.current.find(e => e.key === key);
          if (fe && !fe.done) { fe.done = true; changed = true; }
          emptyFlightsAddedRef.current.delete(key);
        }
      }
    });
    if (changed) setRefreshTick(t => t + 1);

    // Add new empty flights for truly unused API flights
    const added: FlightEvent[] = [];
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

      if (usedKeys.has(`${origen}-${destino}-${gmtTime}`)) continue;

      const feKey = `unused-${origen}-${destino}-${String(gmtH).padStart(2, '0')}${String(lm).padStart(2, '0')}`;
      if (emptyFlightsAddedRef.current.has(feKey)) continue;
      if (flightEventsRef.current.find(e => e.key === feKey && !e.done)) continue;

      const fe = crearEmptyFlightEvent(flight, simStart);
      if (fe) {
        added.push(fe);
        emptyFlightsAddedRef.current.add(feKey);
      }
    }
    if (added.length > 0) {
      flightEventsRef.current = [...flightEventsRef.current, ...added];
    }
  }, [apiFlights, sim.allFlightEvents, sim.simStartDateRef.current]);

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

  // Listado global de vuelos: todos los vuelos desde la API (BD),
  // sin dependencia temporal ni deduplicación.
  // Convierte horaSalida (local) → GMT para compatibilidad con getClaveVuelo.
  const vuelosGlobales = useMemo(() => {
    if (!apiFlights) return [];
    return apiFlights.map((v: any) => {
      const info = aeropuertoInfoRef.current.get(v.idAeropuertoOrigen);
      const origen = info?.codigo || `ID${v.idAeropuertoOrigen}`;
      const destino = aeropuertoInfoRef.current.get(v.idAeropuertoDestino)?.codigo || `ID${v.idAeropuertoDestino}`;
      const gmtOffset = info?.gmt ?? 0;
      // horaSalida de la API es hora LOCAL → convertir a GMT para getClaveVuelo
      const [lh, lm] = (v.horaSalida || '00:00').split(':').map(Number);
      const gmtHour = ((lh - gmtOffset) % 24 + 24) % 24;
      const salidaGMT = `${String(gmtHour).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
      return {
        origen,
        destino,
        salida: salidaGMT,
        llegada: v.horaLlegada || '00:00',
      };
    });
  }, [apiFlights]);

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
    const source = isLogsPaused ? pausedLogs : sim.logs;
    return { logs: source, totalCount: source.length };
  }, [isLogsPaused, sim.logs, pausedLogs]);

  // Iniciar simulación automáticamente cuando tenemos la fecha y la configuración está completa
  useEffect(() => {
    if (startDate && !showConfigOverlay && !isInitialized.current) {
      sim.iniciar();
      isInitialized.current = true;
      // El reloj se iniciará cuando iteracion > 0
    }
  }, [startDate, showConfigOverlay, sim.iniciar]);

  useEffect(() => {
    if (sim.isRunning && sim.iteracion === 0) {
      clockEnabledRef.current = false;
      currentMinSimRef.current = 0;
      lastFrameTimeRef.current = 0;
      clockStateRef.current = 'CALCULANDO';
      setClockState('CALCULANDO');
      setSimMinutos(0);
    }

    if (sim.iteracion > 0 && !clockEnabledRef.current) {
      clockEnabledRef.current = true;
      clockStateRef.current = 'VISUALIZANDO';
      setClockState('VISUALIZANDO');
      lastFrameTimeRef.current = performance.now();
    }
  }, [sim.isRunning, sim.iteracion]);

  // ── Controlar estados del cronómetro por iteración ───────────────
  useEffect(() => {
    if (sim.isRunning && sim.iteracion === 0) {
      lastIteracionRef.current = 0;

      setConfigCountdown(60);
      const interval = setInterval(() => {
        setConfigCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else if (sim.isRunning && sim.iteracion === 1 && lastIteracionRef.current === 0) {
      lastIteracionRef.current = 1;
    } else if (sim.isRunning && sim.iteracion > lastIteracionRef.current) {
      lastIteracionRef.current = sim.iteracion;
    }
  }, [sim.isRunning, sim.iteracion]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    if ((mapRef.current as any)._leaflet_id) return;

    (async () => {
      try {
        const L = require('leaflet');
        require('leaflet/dist/leaflet.css');
        const map = L.map(mapRef.current, {
          maxBounds: [[-85, -180], [85, 180]],
          maxBoundsViscosity: 1.0,
          minZoom: 3,
          maxZoom: 19,
          worldCopyJump: false,
        }).setView([20, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '© CartoDB',
          maxZoom: 19,
          subdomains: 'abcd',
          noWrap: true,
        }).addTo(map);
        mapInst.current = map;
      } catch (error) {
        console.error('Error inicializando mapa:', error);
      }
    })();

    return () => {
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
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
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
        className: '',
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
      m.airportCode = a.codigo;
      m.generarPopupHTML = generarPopupHTML;
      m.bindPopup(generarPopupHTML(), { maxWidth: 300 });
      m.on('popupopen', () => m.setPopupContent(m.generarPopupHTML()));
      markersRef.current.push(m);
    });

    // Exponer actualizarIconoAlmacen para usarlo desde spawnAvion/removeAvion
    (mapInst.current as any)._actualizarIconoAlmacen = actualizarIconoAlmacen;
  }, [sim.aeropuertos]);

  // ── Sincronizar flightEvents del hook → ref local ─────────────────────────
  // El hook acumula FlightEvents con state; los copiamos a un ref para
  // accederlos desde el loop de animación sin cierres obsoletos.
  useEffect(() => {
    // Añadimos solo los eventos nuevos (los que no están en la ref todavía)
    const existingKeys = new Set(flightEventsRef.current.map(e => e.key));
    const nuevos = sim.allFlightEvents.filter(e => !existingKeys.has(e.key));
    if (nuevos.length > 0) {
      flightEventsRef.current = [...flightEventsRef.current, ...nuevos];
    }
  }, [sim.allFlightEvents]);

  // ── Sincronizar logEvents del hook → ref local ────────────────────────────
  useEffect(() => {
    if (sim.allLogEvents.length === 0) {
      // Reset al reiniciar la simulación
      logEventsRef.current = [];
      return;
    }
    const nuevos = sim.allLogEvents.slice(logEventsRef.current.length);
    if (nuevos.length > 0) {
      logEventsRef.current = [...logEventsRef.current, ...nuevos];
    }
  }, [sim.allLogEvents]);

  // ── Sincronizar cancelledFlights del hook → ref local ─────────────────────
  useEffect(() => {
    cancelledFlightsRef.current = sim.cancelledFlights;
    const simStart = sim.simStartDateRef.current;
    if (!simStart) return;
    // Marcar como done los FlightEvent inactivos que ya fueron cancelados
    sim.cancelledFlights.forEach((key: string) => {
      const parts = key.split('-');
      if (parts.length < 3) return;
      const orig = parts[0], dest = parts[1];
      const [h, m] = parts[2].split(':').map(Number);
      const keyMinutosDelDia = h * 60 + m;
      const fe = flightEventsRef.current.find(e => {
        if (e.origenCode !== orig || e.destinoCode !== dest || e.active) return false;
        const depDate = new Date(simStart.getTime() + e.minutosInicio * 60000);
        const apt = sim.aeropuertosRef.current.get(e.origenCode);
        const offset = apt?.gmt ?? 0;
        const gmtHour = depDate.getHours();
        const gmtMin = depDate.getMinutes();
        const localMinutosDelDia = ((gmtHour + offset) % 24 + 24) % 24 * 60 + gmtMin;
        return localMinutosDelDia === keyMinutosDelDia;
      });
      if (fe) fe.done = true;
    });
  }, [sim.cancelledFlights]);

  // ── Suprimir FlightEvents y LogEvents de envíos afectados por cancelación ──
  const suppressedTramosRef = useRef<Map<string, { minTramoOrden: number; iteracionIdx: number }>>(new Map());
  useEffect(() => {
    suppressedTramosRef.current = sim.suppressedTramos;
    if (sim.suppressedTramos.size === 0) return;
    sim.suppressedTramos.forEach((info, idEnvio) => {
      for (const fe of flightEventsRef.current) {
        const feIdEnvio = fe.key.split('-')[0];
        if (feIdEnvio !== idEnvio || fe.tramoOrden < info.minTramoOrden || fe.active) continue;
        const m = fe.key.match(/iter(\d+)/);
        if (m && parseInt(m[1]) === info.iteracionIdx) {
          fe.done = true;
        }
      }
      for (const le of logEventsRef.current) {
        if (le.idEnvio === idEnvio && le.tramoOrden !== undefined && le.tramoOrden >= info.minTramoOrden) {
          le.fired = true;
        }
      }
    });
  }, [sim.suppressedTramos]);

  // ── Mantener addLogRef siempre apuntando a la función actual ──────────────
  useEffect(() => {
    addLogRef.current = sim.addLog;
  }, [sim.addLog]);

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



  // ── Cronómetro + Loop de animación ───────────────────────────────────────
  useEffect(() => {
    let frameId: number;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let started = false;

    function spawnAvion(fe: FlightEvent, map: any) {
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
      fe.active = true;

      // Click → panel de detalle del avión (tramo de vuelo)
      img.addEventListener('click', (ev: any) => {
        ev.stopPropagation();
        mostrarPanelAvion(fe);
      });

      // Actualizar almacén de origen al salir
      airportStateRef.current.set(fe.origenCode, {
        ocupacion: fe.ocupacionAlmacenOrigen,
        capacidad: fe.capacidadAlmacenOrigen,
      });
      const origPct = fe.capacidadAlmacenOrigen > 0 ? (fe.ocupacionAlmacenOrigen / fe.capacidadAlmacenOrigen) * 100 : 0;
      const origMarker = markersRef.current.find((m: any) => m.airportCode === fe.origenCode);
      if (origMarker) (mapInst.current as any)?._actualizarIconoAlmacen?.(origMarker, origPct);

      // (path se adjunta inline en el avión para el loop)
      (fe as any)._path = path;
      (fe as any)._lastColorBucket = -1;
    }

    function removeAvion(fe: FlightEvent) {
      if (fe.svgElement) {
        try { fe.svgElement.remove(); } catch (_) { }
        fe.svgElement = undefined;
        fe.airplaneGroup = undefined;
        fe.airplaneImage = undefined;
      }
      fe.active = false;
      fe.done = true;

      if (panelFlightKeyRef.current === fe.key) {
        cerrarPanelAvion(fe.key);
      }

      // Actualizar almacén de destino al llegar
      airportStateRef.current.set(fe.destinoCode, {
        ocupacion: fe.ocupacionAlmacenDestino,
        capacidad: fe.capacidadAlmacenDestino,
      });
      const destPct = fe.capacidadAlmacenDestino > 0 ? (fe.ocupacionAlmacenDestino / fe.capacidadAlmacenDestino) * 100 : 0;
      const destMarker = markersRef.current.find((m: any) => m.airportCode === fe.destinoCode);
      if (destMarker) (mapInst.current as any)?._actualizarIconoAlmacen?.(destMarker, destPct);
    }

    function updateAvionPosition(fe: FlightEvent, progress: number, map: any) {
      const path: [number, number][] = (fe as any)._path;
      if (!path || path.length < 2) return;

      const zoom = map.getZoom();
      const size = map.getSize();
      const margin = 1000;

      const idx = Math.min(Math.floor(progress * path.length), path.length - 1);
      const nextIdx = Math.min(idx + 1, path.length - 1);
      const [lat, lng] = path[idx];
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

      function loop() {
        const map = mapInst.current;
        if (!map) { frameId = requestAnimationFrame(loop); return; }

        const now = performance.now();
        if (clockEnabledRef.current) {
          const deltaMs = now - (lastFrameTimeRef.current || now);
          lastFrameTimeRef.current = now;

          // Avanzar minutos simulados continuamente usando K sin parar
          const deltaMinSim = (deltaMs / 1000) * (SIM_CONFIG.K / 60);
          currentMinSimRef.current += deltaMinSim;
        } else {
          // Mantener lastFrameTime actualizado mientras esperamos la primera iteración
          lastFrameTimeRef.current = now;
        }

        const minSim = Math.min(TOTAL_MINUTOS_SIM, currentMinSimRef.current);
        setSimMinutos(Math.floor(minSim));

        const events = flightEventsRef.current;

        for (const fe of events) {
          if (fe.done) continue;

          if (!fe.active && minSim >= fe.minutosInicio) {
            // No despegar si fue cancelado: calcular cancelKey desde minutosInicio del FlightEvent
            // (no desde la ruta, porque puede haber sido sobreescrita por una ITERACION posterior)
            const idEnvio = fe.key.split('-')[0];
            const simStart = sim.simStartDateRef.current;
            const depDate = simStart ? new Date(simStart.getTime() + fe.minutosInicio * 60000) : new Date();
            const apt = sim.aeropuertosRef.current.get(fe.origenCode);
            const offset = apt?.gmt ?? 0;
            const gmtHour = depDate.getHours();
            const gmtMin = depDate.getMinutes();
            const localHour = ((gmtHour + offset) % 24 + 24) % 24;
            const hh = String(localHour).padStart(2, '0');
            const mm = String(gmtMin).padStart(2, '0');
            const cancelKey = `${fe.origenCode}-${fe.destinoCode}-${hh}:${mm}`;
            let suprimido = cancelKey && cancelledFlightsRef.current.has(cancelKey);
            // También verificar suppressedTramosRef (cubre tramos posteriores al cancelado)
            if (!suprimido) {
              const supInfo = suppressedTramosRef.current.get(idEnvio);
              if (supInfo && fe.tramoOrden >= supInfo.minTramoOrden) {
                const m = fe.key.match(/iter(\d+)/);
                suprimido = !!(m && parseInt(m[1]) === supInfo.iteracionIdx);
              }
            }
            if (suprimido) {
              fe.done = true;
            } else {
              spawnAvion(fe, map);
            }
          }

          if (fe.active) {
            const duracion = fe.minutosFin - fe.minutosInicio;
            if (duracion <= 0) {
              removeAvion(fe);
              continue;
            }
            const progress = Math.min(1, (minSim - fe.minutosInicio) / duracion);

            if (progress >= 1) {
              removeAvion(fe);
            } else {
              updateAvionPosition(fe, progress, map);
            }
          }
        }

        // ── Disparar LogEvents temporizados al compas del cronómetro ──────────
        const pendingLogs: { text: string; color: string; minutosDisparo: number }[] = [];
        for (const le of logEventsRef.current) {
          if (!le.fired && minSim >= le.minutosDisparo) {
            // Saltar LogEvents de tramos suprimidos por cancelación
            if (le.idEnvio && le.tramoOrden !== undefined) {
              const info = suppressedTramosRef.current.get(le.idEnvio);
              if (info && le.tramoOrden >= info.minTramoOrden) {
                le.fired = true;
                continue;
              }
            }
            le.fired = true;
            pendingLogs.push({ text: le.text, color: le.color, minutosDisparo: le.minutosDisparo });

            if (le.updatePopupCode !== undefined) {
              const estado = airportStateRef.current.get(le.updatePopupCode);
              if (estado) {
                estado.ocupacion = le.updatePopupOcupacion!;
                estado.capacidad = le.updatePopupCapacidad!;
                const marker = markersRef.current.find(m => m.airportCode === le.updatePopupCode);
                if (marker && marker.isPopupOpen()) {
                  marker.setPopupContent(marker.generarPopupHTML());
                }
              }
            }
          }
        }
        // ✅ OPTIMIZACIÓN: Batch todos los logs en una sola llamada en lugar de múltiples setState
        if (pendingLogs.length > 0) {
          sim.addLogBatch(pendingLogs);
        }

        frameId = requestAnimationFrame(loop);
      }

      map.on('move zoom moveend zoomend', () => {
        // Forzar re-posicionamiento en evento de mapa
        const map = mapInst.current;
        if (!map) return;
        flightEventsRef.current.filter(fe => fe.active && !fe.done).forEach(fe => {
          const minSim = Math.min(TOTAL_MINUTOS_SIM, currentMinSimRef.current);
          const duracion = fe.minutosFin - fe.minutosInicio;
          if (duracion > 0) {
            const progress = Math.min(1, (minSim - fe.minutosInicio) / duracion);
            updateAvionPosition(fe, progress, map);
          }
        });
      });

      loop();
    }

    // Intentar arrancar; si el mapa no está listo, reintentar
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
    setShowStoppedOverlay(true);
  }

  function handleNuevaSimulacion() {
    setShowStoppedOverlay(false);
    setShowConfigOverlay(true);
    setConfigWizardStep(1);
    setConfigStartDate('');
    setConfigStartTime('00:00');
    setSelectedFiles([]);
    setUploadMessage({ type: null, text: '' });
    isInitialized.current = false;

    // Reset clock state
    clockEnabledRef.current = false;
    currentMinSimRef.current = 0;
    lastFrameTimeRef.current = 0;
    clockStateRef.current = 'CALCULANDO';
    setClockState('CALCULANDO');
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

  // Obtiene la clave de vuelo en el formato que espera el backend (ORIGEN-DESTINO-HH:MM hora local)
  const getClaveVuelo = (vuelo: any): string => {
    const [gmtHour, gmtMin] = extraerHHMM(vuelo.salida).split(':').map(Number);
    const apt = sim.aeropuertosRef.current.get(vuelo.origen);
    const offset = apt?.gmt ?? 0;
    const localHour = ((gmtHour + offset) % 24 + 24) % 24;
    const hh = String(localHour).padStart(2, '0');
    const mm = String(gmtMin).padStart(2, '0');
    return `${vuelo.origen}-${vuelo.destino}-${hh}:${mm}`;
  };

  // Cancela un vuelo llamando al backend
  const cancelarVuelo = async (vuelo: any) => {
    const claveVuelo = getClaveVuelo(vuelo);
    console.log('[cancelarVuelo] Enviando claveVuelo:', claveVuelo, 'vuelo:', vuelo);

    // Agregar al Set de vuelos cancelándose para bloquear visualmente
    setCancellingFlights(prev => new Set(prev).add(claveVuelo));

    // Obtener la fecha de registro del envío (GMT, del backend)
    const rutaCancel = sim.rutasPlanificadasRef.current.get(vuelo.idEnvio);
    const fechaRegistro = rutaCancel?.fechaRegistro;
    let reloj: string;
    if (fechaRegistro) {
      // Parsear "DD/MM/YYYY HH:MM" (GMT) → enviar último minuto de ese día GMT
      const [datePart] = fechaRegistro.split(' ');
      const [day, month, year] = datePart.split('/').map(Number);
      reloj = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}-23-59`;
    } else {
      // Fallback: usar tiempo actual de simulación
      const simStart = sim.simStartDateRef.current;
      if (!simStart) { console.warn('[cancelarVuelo] simStartDateRef.current es null', vuelo); setCancellingFlights(prev => { const newSet = new Set(prev); newSet.delete(claveVuelo); return newSet; }); return; }
      const relojDate = new Date(simStart.getTime() + Math.floor(currentMinSimRef.current) * 60000);
      const y = relojDate.getUTCFullYear();
      const M = String(relojDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(relojDate.getUTCDate()).padStart(2, '0');
      const h = String(relojDate.getUTCHours()).padStart(2, '0');
      const m = String(relojDate.getUTCMinutes()).padStart(2, '0');
      reloj = `${y}${M}${d}-${h}-${m}`;
    }
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

    // Calcular horarios
    const simStartDate = sim.simStartDateRef.current;
    let startDateStr = startDate;
    let startTimeStr = startTime;
    if (simStartDate) {
      startDateStr = `${simStartDate.getFullYear()}-${String(simStartDate.getMonth() + 1).padStart(2, '0')}-${String(simStartDate.getDate()).padStart(2, '0')}`;
      startTimeStr = `${String(simStartDate.getHours()).padStart(2, '0')}:${String(simStartDate.getMinutes()).padStart(2, '0')}`;
    }
    if (!startDateStr) {
      const now = new Date();
      startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      startTimeStr = startTimeStr || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    const horaSalida = formatSimTime(fe.minutosInicio, startDateStr, startTimeStr);
    const horaLlegada = formatSimTime(fe.minutosFin, startDateStr, startTimeStr);

    // Calcular duración en horas y minutos
    const duracionMin = fe.minutosFin - fe.minutosInicio;
    const durH = Math.floor(duracionMin / 60);
    const durM = duracionMin % 60;
    const duracionLabel = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`;

    const isEmptyFlight = fe.key.startsWith('unused-');
    const salidaHHMM = horaSalida.split(' ')[1] || '00:00';
    const codigoVueloPanel = generarCodigoVuelo(fe.origenCode, fe.destinoCode, salidaHHMM);

    // Buscar envíos relacionados (solo para vuelos en uso)
    const enviosRelacionados: { codigo: string; label: string }[] = [];
    if (!isEmptyFlight) {
      const codigosVistos = new Set<string>();
      flightEventsRef.current.forEach(e => {
        if (e.key.startsWith('unused-')) return;
        if (e.origenCode === fe.origenCode && e.destinoCode === fe.destinoCode && e.minutosInicio === fe.minutosInicio) {
          const codEnvio = e.key.split('-')[0];
          if (!codigosVistos.has(codEnvio)) {
            codigosVistos.add(codEnvio);
            const ruta = rutasPlanificadasRef.current.get(codEnvio);
            const label = ruta ? `${ruta.origen} → ${ruta.destino}${(ruta.tramos?.length ?? 0) > 1 ? ` (${ruta.tramos.length} tramos)` : ''}` : codEnvio;
            enviosRelacionados.push({ codigo: codEnvio, label });
          }
        }
      });
    }

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
        <div style="font-size:12px;color:#1f2937;font-weight:700;">${isEmptyFlight ? '0 / ' + fe.capacidadVuelo + ' maletas (vuelo vacío)' : fe.maletasVuelo + ' / ' + fe.capacidadVuelo + ' maletas'}</div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">DURACIÓN DEL TRAMO</div>
        <div style="font-size:14px;color:#1f2937;font-weight:700;">${duracionLabel}</div>
      </div>
      ${enviosRelacionados.length > 0 ? `
      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">ENVÍOS RELACIONADOS</div>
        ${enviosRelacionados.map((env, i) => `
        <div id="relEnvio_${i}" data-codigo="${env.codigo}" style="padding:6px 8px;background:white;border-radius:6px;cursor:pointer;margin-bottom:4px;border:1px solid var(--border-color,#e5e7eb);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:600;color:var(--accent-blue,#2563eb);">${env.codigo}</span>
          <span style="font-size:10px;color:#6b7280;">${env.label}</span>
        </div>`).join('')}
      </div>` : ''}
    `;

    // Agregar listeners para envíos relacionados
    enviosRelacionados.forEach((env, i) => {
      const el = document.getElementById(`relEnvio_${i}`);
      if (el) {
        el.addEventListener('click', () => {
          const envioFe = flightEventsRef.current.find(e => e.key.startsWith(env.codigo));
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

    const formatDateTime = (date: Date) => {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${d}/${m}/${y} ${hh}:${mm}`;
    };

    const parseDateStr = (dateStr: string): Date => {
      if (!dateStr) return new Date();
      if (dateStr.includes('-')) {
        const [dp, tp] = dateStr.split(' ');
        const [y, m, d] = dp.split('-').map(Number);
        const [h, mi] = tp?.split(':').map(Number) || [0, 0];
        return new Date(y, m - 1, d, h, mi);
      }
      const p = dateStr.split(' ');
      const [d, m, y] = p[0].split('/').map(Number);
      const [h, mi] = p[1]?.split(':').map(Number) || [0, 0];
      return new Date(y, m - 1, d, h, mi);
    };

    // ── Build Plan de Viaje tramos ──
    const tramosVisual = rc.tramos?.map((tramo, index) => {
      const aOrigen = sim.aeropuertos.find(a => a.codigo === tramo.origen);
      const aDestino = sim.aeropuertos.find(a => a.codigo === tramo.destino);
      const isLast = index === (rc.tramos?.length ?? 0) - 1;
      const simStart = new Date(startDate || '2027-01-02');
      const stp = (startTime || '00:00').split(':').map(Number);
      simStart.setHours(stp[0], stp[1], 0, 0);
      let cursorDate = rc.fechaRegistro ? parseDateStr(rc.fechaRegistro) : simStart;
      const saleTime = (tramo.sale || '').split(' ')[1] || '00:00';
      const saleP = saleTime.split(':').map(Number);
      let saleDate = new Date(cursorDate);
      saleDate.setHours(saleP[0], saleP[1], 0, 0);
      if (saleDate.getTime() < cursorDate.getTime()) saleDate.setDate(saleDate.getDate() + 1);
      const llegaTime = (tramo.llega || '').split(' ')[1] || '00:00';
      const llegaP = llegaTime.split(':').map(Number);
      let llegaDate = new Date(saleDate);
      llegaDate.setHours(llegaP[0], llegaP[1], 0, 0);
      if (llegaDate.getTime() < saleDate.getTime()) llegaDate.setDate(llegaDate.getDate() + 1);
      const saleD = formatDateTime(saleDate);
      const llegaD = formatDateTime(llegaDate);
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
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Registro</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRegistro || '-'}</div></div>
            <div><div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Recojo</div><div style="font-size:11px;color:#1f2937;font-weight:700;">${rc.fechaRecojo || '-'}</div></div>
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
        // El origen de este tramo recibe su Sale (sobrescribe si es intermedio con Sale previo)
        if (aeropuertosRuta[idx]) aeropuertosRuta[idx].sale = saleTime;
        // El destino de este tramo recibe su Llega
        if (aeropuertosRuta[idx + 1]) aeropuertosRuta[idx + 1].llega = llegaTime;
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
  const simTimeLabel = formatSimTime(simMinutos, startDate, startTime);

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
          const fe = feRef.find((e: any) => e.origenCode === v.origen && e.destinoCode === v.destino && e.minutosInicio === minInicio);
          if (!fe || fe.key.startsWith('unused-')) return -1;
          if (fe.capacidadVuelo > 0) return (fe.maletasVuelo / fe.capacidadVuelo) * 100;
          return 0;
        };
        cmp = getOcup(a) - getOcup(b);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [vuelosGlobales, filterCodigo, filterOrigen, filterDestino, sortBy, sortDir, sim.simStartDateRef, flightEventsRef, refreshTick]);

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

        {/* Configuration Overlay */}
        {showConfigOverlay && (
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
              maxWidth: '700px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              padding: '24px'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ⚙️ Configurar Simulación
                </h2>
              </div>

              {/* Wizard Steps */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: configWizardStep === 1 ? 'var(--accent-blue)' : configWizardStep > 1 ? '#10b981' : 'var(--bg-tertiary)',
                    color: configWizardStep === 1 ? 'white' : configWizardStep > 1 ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '4px'
                  }}>1</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>Fecha de Inicio</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: configWizardStep === 2 ? 'var(--accent-blue)' : configWizardStep > 2 ? '#10b981' : 'var(--bg-tertiary)',
                    color: configWizardStep === 2 ? 'white' : configWizardStep > 2 ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '4px'
                  }}>2</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>Carga de Envíos</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: configWizardStep === 3 ? 'var(--accent-blue)' : configWizardStep > 3 ? '#10b981' : 'var(--bg-tertiary)',
                    color: configWizardStep === 3 ? 'white' : configWizardStep > 3 ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '4px'
                  }}>3</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>Confirmación</div>
                </div>
              </div>

              {/* Step 1: Fecha de Inicio */}
              {configWizardStep === 1 && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    Fecha y Hora de Inicio (Período de 5 Días)
                  </h3>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>
                        Selecciona la fecha de inicio:
                      </label>
                      <input
                        type="date"
                        value={configStartDate}
                        onChange={(e) => setConfigStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>
                        Selecciona la hora de inicio:
                      </label>
                      <input
                        type="time"
                        value={configStartTime}
                        onChange={(e) => setConfigStartTime(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '8px' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                        📅 La simulación durará <strong>5 días</strong> a partir de la fecha y hora seleccionadas.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Carga de Envíos */}
              {configWizardStep === 2 && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '12px', fontSize: '16px' }}>
                    📤 Carga Masiva de Envíos
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
                    Sube archivos .txt con múltiples registros de envíos para importarlos en lote desde la carpeta de envíos.
                  </p>

                  <div
                    onClick={() => document.getElementById('configFileInput')?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt'));
                      setSelectedFiles(files);
                    }}
                    style={{
                      border: '2px dashed var(--border-color)',
                      borderRadius: '8px',
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: 'var(--bg-tertiary)',
                      marginBottom: '20px'
                    }}
                  >
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                      {uploading ? '⏳' : '📂'}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px' }}>
                      {uploading ? 'Cargando archivos...' : 'Arrastra carpeta o archivos aquí'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      {uploading ? 'Por favor espera...' : 'o haz clic para seleccionar'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Formato: Carpeta o archivos .txt | Múltiples archivos
                    </div>
                    <input
                      id="configFileInput"
                      type="file"
                      accept=".txt"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []).filter(f => f.name.endsWith('.txt'));
                        setSelectedFiles(files);
                      }}
                      disabled={uploading}
                      multiple
                      {...({ webkitdirectory: true } as any)}
                    />
                  </div>

                  {selectedFiles.length > 0 && (
                    <div style={{ padding: '14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', borderLeft: '3px solid var(--accent-blue)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Archivos seleccionados: <strong>{selectedFiles.length}</strong>
                      </div>
                      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} style={{ fontSize: '12px', color: 'var(--text-primary)', paddingBottom: '6px', borderBottom: idx < selectedFiles.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                            • {file.name}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                        Total: {(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  )}

                  {uploadMessage.type && (
                    <div style={{
                      padding: '12px 14px',
                      backgroundColor: uploadMessage.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : uploadMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      borderLeft: '3px solid ' + (uploadMessage.type === 'error' ? 'var(--danger-red)' : uploadMessage.type === 'success' ? 'var(--success-green)' : 'var(--accent-blue)'),
                      fontSize: '13px',
                      color: uploadMessage.type === 'error' ? 'var(--danger-red)' : uploadMessage.type === 'success' ? 'var(--success-green)' : 'var(--accent-blue)'
                    }}>
                      {uploadMessage.text}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      disabled={uploading}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: uploading ? 'default' : 'pointer'
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (selectedFiles.length === 0) {
                          setUploadMessage({ type: 'error', text: 'Por favor selecciona archivos o carpeta' });
                          return;
                        }
                        setUploading(true);
                        try {
                          // 1. Agregamos los 30 archivos de texto
                          const formData = new FormData();
                          selectedFiles.forEach((file) => {
                            formData.append('files', file);
                          });
                          // 2. Rompemos el string de la hora "14:30" en [ "14", "30" ]
                          const [horaStr, minutoStr] = (configStartTime || "00:00").split(':');

                          // 3. Inyectamos los parámetros que tu Spring Boot ahora espera de forma obligatoria
                          formData.append('fechaInicio', configStartDate);
                          formData.append('horaInicio', horaStr);
                          formData.append('minutoInicio', minutoStr);

                          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/envios/cargar-carpeta`, {
                            method: 'POST',
                            body: formData,
                          });

                          const data = await response.json();

                          if (response.ok && data.exito) {
                            setUploadMessage({ type: 'success', text: data.mensaje || `${selectedFiles.length} archivo${selectedFiles.length === 1 ? '' : 's'} cargado${selectedFiles.length === 1 ? '' : 's'} exitosamente` });
                            setSelectedFiles([]);
                          } else {
                            setUploadMessage({ type: 'error', text: data.mensaje || `Error ${response.status}` });
                          }
                        } catch (error) {
                          setUploadMessage({ type: 'error', text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}` });
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading || selectedFiles.length === 0}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: uploading || selectedFiles.length === 0 ? 'var(--border-color)' : 'var(--accent-blue)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: uploading || selectedFiles.length === 0 ? 'default' : 'pointer'
                      }}
                    >
                      {uploading ? '⏳ Procesando...' : `↑ Procesar ${selectedFiles.length} Archivo${selectedFiles.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirmación */}
              {configWizardStep === 3 && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    ✓ Resumen de Configuración
                  </h3>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tipo de Simulación</small>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>
                        📅 Simulación de Período
                      </div>
                    </div>

                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fecha y Hora de Inicio</small>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>
                        {configStartDate ? (() => {
                          const date = new Date(configStartDate + 'T00:00:00');
                          const day = String(date.getDate()).padStart(2, '0');
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const year = date.getFullYear();
                          const time = configStartTime || '00:00';
                          return `${day}/${month}/${year} ${time}`;
                        })() : '-'}
                      </div>
                    </div>

                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Duración</small>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>
                        5 días (fijo)
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-green)', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                      ✓ La configuración está lista. Haz clic en <strong>"Iniciar Simulación"</strong> para comenzar el proceso.
                    </p>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setConfigWizardStep(configWizardStep - 1)}
                  disabled={configWizardStep === 1}
                  style={{
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: configWizardStep === 1 ? 'var(--border-color)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: configWizardStep === 1 ? 'default' : 'pointer',
                    display: configWizardStep === 1 ? 'none' : 'block'
                  }}
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => {
                    if (configWizardStep === 1) {
                      if (!configStartDate) {
                        alert('Por favor selecciona una fecha de inicio.');
                        return;
                      }
                      setConfigWizardStep(2);
                    } else if (configWizardStep === 2) {
                      setConfigWizardStep(3);
                    } else if (configWizardStep === 3) {
                      setStartDate(configStartDate);
                      setStartTime(configStartTime);
                      setShowConfigOverlay(false);
                    }
                  }}
                  disabled={
                    (configWizardStep === 1 && !configStartDate) ||
                    (configWizardStep === 2 && uploading)
                  }
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: (configWizardStep === 1 && !configStartDate) || (configWizardStep === 2 && uploading) ? 'var(--border-color)' : 'var(--accent-blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (configWizardStep === 1 && !configStartDate) || (configWizardStep === 2 && uploading) ? 'default' : 'pointer'
                  }}
                >
                  {configWizardStep === 3 ? 'Iniciar Simulación' : 'Siguiente →'}
                </button>
              </div>
            </div>
          </div>
        )}

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
            <div className="card" style={{ display: 'flex', gap: 14, marginBottom: 0, padding: '10px 14px', alignItems: 'center' }}>
              <h1 style={{ marginBottom: 0, fontSize: 18, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
                Simulación — Período 5 Días
                <span className={sim.isRunning ? 'led-active' : 'led-off'} style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
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
                `}</style>
              </h1>
              <div style={{ height: 20, width: 1, backgroundColor: 'var(--border-color)' }} />

              {/* Reloj simulado */}
              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Tiempo Simulado</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 2, whiteSpace: 'nowrap' }}>{simTimeLabel}</div>
              </div>

              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Día</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginTop: 2 }}>{sim.diaActual}/5</div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDetener} disabled={!sim.isRunning}
                  style={{ padding: '7px 12px', fontSize: 11, backgroundColor: !sim.isRunning ? 'var(--border-color)' : '#ef4444', border: 'none', borderRadius: 6, cursor: !sim.isRunning ? 'default' : 'pointer', color: 'white', opacity: !sim.isRunning ? 0.6 : 1, fontWeight: 600 }}>
                  ⏹️ Detener
                </button>
                <button onClick={mostrarPanelBusqueda}
                  style={{ padding: '7px 12px', fontSize: 11, backgroundColor: '#8b5cf6', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                  🔍 Buscar envío
                </button>
                <button onClick={() => setFlightPanelOpen(!flightPanelOpen)}
                  style={{ padding: '7px 12px', fontSize: 11, backgroundColor: flightPanelOpen ? '#f97316' : '#10b981', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                  ✈️ Vuelos
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Progreso — Izquierda Superior */}
        <div style={{ position: 'absolute', bottom: 130, left:12, minWidth: 160, backgroundColor: 'rgba(255,255,255,0.92)', padding: '8px 14px', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', pointerEvents: 'auto', zIndex: 999998 }}>
          <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2, textAlign: 'center', fontWeight: 600 }}>🕐 {horaActual}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 6, textAlign: 'center' }}>⏱ {stopwatch}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 4, textTransform: 'uppercase' }}>Progreso de Simulación</div>

          {/* Barra GA (iteraciones) */}
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>GA — {pct}% ({sim.iteracion}/{sim.totalIter} iter.)</div>
          <div style={{ width: '100%', height: 5, backgroundColor: 'var(--border-color)', borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
            <div style={{ height: '100%', backgroundColor: 'var(--accent-blue)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>

          {/* Barra reloj simulado */}
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>
            Cronómetro — {Math.round((simMinutos / TOTAL_MINUTOS_SIM) * 100)}%
          </div>
          <div style={{ width: '100%', height: 6, backgroundColor: 'var(--border-color)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', backgroundColor: '#10b981', width: `${(simMinutos / TOTAL_MINUTOS_SIM) * 100}%`, transition: 'width 0.4s ease' }} />
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

        {/* Panel Configurando Algoritmo — Derecha Inferior */}
        {sim.isRunning && sim.iteracion === 0 && (
          <div style={{ position: 'absolute', bottom: 25, right: 20, width: 280, backgroundColor: 'rgba(255,255,255,0.95)', padding: 14, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'auto', zIndex: 999998 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="algo-spinner"></span> Configurando algoritmo...
              </div>
              <span style={{ fontSize: 14, color: 'var(--accent-blue)' }}>{configCountdown}s</span>
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
              Esperando resultados iniciales...
            </div>
            <div style={{ width: '100%', height: 6, backgroundColor: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: 'var(--accent-blue)', width: '100%', animation: 'algo-progress-indeterminate 1.5s infinite linear' }} />
            </div>
            <style>{`
              @keyframes algo-progress-indeterminate {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .algo-spinner {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid rgba(59, 130, 246, 0.3);
                border-radius: 50%;
                border-top-color: #3b82f6;
                animation: algo-spin 1s linear infinite;
              }
              @keyframes algo-spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* Botón scroll hacia estadísticas */}
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999999 }}>
          <button onClick={() => document.getElementById('statsSection')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ background: 'var(--accent-blue)', border: 'none', color: 'white', width: 50, height: 50, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 12px rgba(37,100,235,0.3)' }}>
            <img src="/down.svg" alt="↓" style={{ width: 28, height: 28 }} />
          </button>
        </div>
        </div>

        {/* Panel Lateral de Vuelos — Derecha — Virtual Scrolled */}
        <div style={{
          width: flightPanelOpen ? '280px' : '0',
          flexShrink: 0,
          backgroundColor: 'rgba(255,255,255,0.98)',
          boxShadow: flightPanelOpen ? '-4px 0 20px rgba(0,0,0,0.10)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 999997,
          position: 'relative',
          transition: 'width 0.35s ease',
          height: '100%'
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
                backgroundColor: 'white', padding: '8px', borderRadius: '6px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999999,
                minWidth: '200px'
              }}>
                <style>{`
                  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Filtros</h3>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => { setFilterCodigo(''); setFilterOrigen(''); setFilterDestino(''); setSortBy('salida'); setSortDir('asc'); }} style={{ background: 'none', border: 'none', fontSize: '11px', cursor: 'pointer', color: 'var(--danger-red)', padding: '2px 4px', fontWeight: 600 }}>✕ Borrar</button>
                    <button onClick={() => setFiltersOpen(false)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', display: 'block' }}>Código</label>
                    <input type="text" placeholder="LAX-JFK" value={filterCodigo}
                      onChange={(e) => setFilterCodigo(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '3px', outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', display: 'block' }}>Origen</label>
                    <select value={filterOrigen} onChange={(e) => setFilterOrigen(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '3px', outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {origenesUnicos.map(og => (
                        <option key={og} value={og}>{og}{aeropuertoMap.has(og) ? ` - ${aeropuertoMap.get(og)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', display: 'block' }}>Destino</label>
                    <select value={filterDestino} onChange={(e) => setFilterDestino(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '3px', outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">Todos</option>
                      {destinosUnicos.map(dest => (
                        <option key={dest} value={dest}>{dest}{aeropuertoMap.has(dest) ? ` - ${aeropuertoMap.get(dest)}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', display: 'block' }}>Ordenar por</label>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '3px', outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', cursor: 'pointer', marginBottom: '4px' }}>
                      <option value="salida">Hora de salida</option>
                      <option value="llegada">Hora de llegada</option>
                      <option value="origen">Origen</option>
                      <option value="destino">Destino</option>
                      <option value="ocupacion">Nivel de ocupación</option>
                    </select>
                    <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {sortDir === 'asc' ? '↑ Ascendente' : '↓ Descendente'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Virtual Scroll Container */}
          <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
            {sim.isRunning && sim.iteracion === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '3px solid rgba(59,130,246,0.3)', borderRadius: '50%', borderTopColor: '#3b82f6', animation: 'algo-spin-vuelos 1s linear infinite' }}></span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)' }}>Configurando algoritmo...</span>
                <style>{`@keyframes algo-spin-vuelos { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : vuelosFiltrados.length === 0 ? (
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
                  const claveVuelo = getClaveVuelo(vuelo);
                  const esCancelado = sim.cancelledFlights.has(claveVuelo) || canceledLocallyRef.current.has(claveVuelo);
                  const esCancelling = cancellingFlights.has(claveVuelo);
                  // Buscar FlightEvent activo para obtener ocupación y detectar sin uso
                  let pctOcupacion = -1;
                  let ocupColor = '';
                  let esSinUso = false;
                  const simStartOcc = sim.simStartDateRef.current;
                  if (simStartOcc) {
                    const [hh, mm] = salidaHHMM.split(':').map(Number);
                    let d = new Date(simStartOcc); d.setHours(hh, mm, 0, 0);
                    while (d.getTime() < simStartOcc.getTime()) d.setDate(d.getDate() + 1);
                    const minInicio = Math.round((d.getTime() - simStartOcc.getTime()) / 60000);
                    let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && e.minutosInicio === minInicio);
                    if (!fe) {
                      for (const ruta of rutasPlanificadasRef.current.values()) {
                        const tramo = (ruta.tramos || []).find(t => t.origen === vuelo.origen && t.destino === vuelo.destino);
                        if (tramo) {
                          fe = flightEventsRef.current.find(e => e.key.includes(`${ruta.idEnvio}`) && e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino);
                          if (fe) break;
                          fe = { key: 'synthetic', tramoOrden: 1, origenCode: vuelo.origen, destinoCode: vuelo.destino, planVueloRuta: [vuelo.origen, vuelo.destino], planVueloTipo: 'Directo', latOrigen: 0, lngOrigen: 0, latDestino: 0, lngDestino: 0, minutosInicio: minInicio, minutosFin: minInicio, maletasVuelo: tramo.maletasVuelo ?? 0, capacidadVuelo: tramo.capacidadVuelo ?? 0, ocupacionAlmacenOrigen: 0, capacidadAlmacenOrigen: 0, ocupacionAlmacenDestino: 0, capacidadAlmacenDestino: 0 };
                          break;
                        }
                      }
                    }
                    esSinUso = !fe || fe.key.startsWith('unused-');
                    if (fe && !esSinUso && currentMinSimRef.current >= minInicio) {
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
                        const [hh, mm] = salidaHHMM.split(':').map(Number);
                        let d = new Date(simStart); d.setHours(hh, mm, 0, 0);
                        while (d.getTime() < simStart.getTime()) d.setDate(d.getDate() + 1);
                        const minInicio = Math.round((d.getTime() - simStart.getTime()) / 60000);
                        let fe = flightEventsRef.current.find(e => e.origenCode === vuelo.origen && e.destinoCode === vuelo.destino && e.minutosInicio === minInicio && !e.done);
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

              {sim.isRunning && sim.iteracion === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px' }}>
                  <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '3px solid rgba(59,130,246,0.3)', borderRadius: '50%', borderTopColor: '#3b82f6', animation: 'algo-spin-registro 1s linear infinite' }}></span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)' }}>Configurando algoritmo...</span>
                  <style>{`@keyframes algo-spin-registro { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 50 }}>{log.time || '-'}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: log.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.text}</span>
                  </div>
                ))}
              </div>
                </>
              )}

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
