'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSimulacion, FlightEvent, LogEvent, SIM_CONFIG } from './useSimulacion';

// ─── helpers SVG / Bézier ───────────────────────────────────────────────────

function getAirplaneSVG(pct: number): string {
  if (pct < 50) return '/airplane-green.svg';
  if (pct < 80) return '/airplane-orange.svg';
  return '/airplane-red.svg';
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
  const panelFlightKeyRef = useRef<string | null>(null);

  // Lista viva de LogEvent temporizados (se disparan al compas del cronómetro)
  const logEventsRef = useRef<LogEvent[]>([]);

  // Ref estable a addLog (evita problemas de closure en el loop de animación)
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => {});

  // Refs para el nuevo control de tiempo
  const currentMinSimRef = useRef<number>(0);
  const clockStateRef = useRef<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const lastFrameTimeRef = useRef<number>(0);
  const lastIteracionRef = useRef<number>(0);

  const [clockState, setClockState] = useState<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const [configCountdown, setConfigCountdown] = useState(60);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  
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
  const rutasPlanificadasRef = sim.rutasPlanificadasRef;

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

    const icon = L.icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      iconSize: [12, 18],
      iconAnchor: [6, 18],
      popupAnchor: [0, -18],
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      shadowSize: [16, 16],
      shadowAnchor: [6, 18],
    });

    // Inicializar estado de almacenes con capacidad base del aeropuerto
    sim.aeropuertos.forEach(a => {
      if (!airportStateRef.current.has(a.codigo)) {
        airportStateRef.current.set(a.codigo, { ocupacion: 0, capacidad: a.capacidad });
      }
    });

    sim.aeropuertos.forEach(a => {
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

      const m = L.marker([a.latitud, a.longitud], { icon }).addTo(mapInst.current);
      m.airportCode = a.codigo;
      m.generarPopupHTML = generarPopupHTML;
      m.bindPopup(generarPopupHTML(), { maxWidth: 300 });
      m.on('popupopen', () => m.setPopupContent(m.generarPopupHTML()));
      markersRef.current.push(m);
    });
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

      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', getAirplaneSVG(ocupPct));
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

      // (path se adjunta inline en el avión para el loop)
      (fe as any)._path = path;
      (fe as any)._lastColorBucket = -1;
    }

    function removeAvion(fe: FlightEvent) {
      if (fe.svgElement) {
        try { fe.svgElement.remove(); } catch (_) {}
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
      const ocupPct = fe.capacidadVuelo > 0 ? (fe.maletasVuelo / fe.capacidadVuelo) * 100 : 0;
      const bucket = ocupPct < 50 ? 0 : ocupPct < 80 ? 1 : 2;
      if ((fe as any)._lastColorBucket !== bucket) {
        fe.airplaneImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', getAirplaneSVG(ocupPct));
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
            // Es hora de que este avión despegue
            spawnAvion(fe, map);
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
        position:absolute;left:12px;bottom:130px;width:280px;
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

    // Buscar por código de rastreo (últimos 7 dígitos de envío + últimos 5 dígitos de cliente)
    let flightEvent: FlightEvent | undefined;
    for (const [idEnvio, ruta] of rutasPlanificadasRef.current.entries()) {
      const codigoRastreo = (idEnvio.slice(-7) + (ruta.idCliente || '').slice(-5)).padStart(12, '0');
      if (codigoRastreo === codigoBusqueda) {
        flightEvent = flightEventsRef.current.find(fe => fe.key.startsWith(idEnvio));
        if (flightEvent) break;
      }
    }
    
    if (!flightEvent) {
      mostrarNotificacion('El envío no está registrado actualmente', '#ef4444');
      return;
    }

    // Cerrar panel de búsqueda
    cerrarPanelBusqueda();
    
    // Mostrar panel de detalles del envío (solo desde búsqueda)
    mostrarPanelEnvio(flightEvent);
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
        try { fe.svgElement.remove(); } catch (_) {}
        fe.svgElement = undefined;
        fe.airplaneGroup = undefined;
        fe.airplaneImage = undefined;
      }
    });
    
    // Reset flight events ref
    flightEventsRef.current = [];
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
      document.body.appendChild(panel);
    }

    panelFlightKeyRef.current = fe.key;

    // Resolución de aeropuertos
    const aeropuertoOrigen = sim.aeropuertos.find(a => a.codigo === fe.origenCode);
    const aeropuertoDestino = sim.aeropuertos.find(a => a.codigo === fe.destinoCode);
    const ciudadOrigen = aeropuertoOrigen
      ? `${aeropuertoOrigen.ciudad}, ${aeropuertoOrigen.pais}`
      : fe.origenCode;
    const ciudadDestino = aeropuertoDestino
      ? `${aeropuertoDestino.ciudad}, ${aeropuertoDestino.pais}`
      : fe.destinoCode;

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

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Detalle del viaje</h3>
          
        </div>
        <button id="closeAvionPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="font-size:11px;color:#6b7280;">TRAMO</div>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
            <span style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Origen</span>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">${ciudadOrigen}</span>
          </span>
          <span style="color:#9ca3af;font-size:18px;font-weight:800;margin-top:18px;">→</span>
          <span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
            <span style="font-size:9px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Destino</span>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:6px 10px;border-radius:999px;background:#fef3c7;color:#111827;font-size:12px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);">${ciudadDestino}</span>
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
        <div style="font-size:12px;color:#1f2937;font-weight:700;">${fe.maletasVuelo} / ${fe.capacidadVuelo} maletas</div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">DURACIÓN DEL TRAMO</div>
        <div style="font-size:14px;color:#1f2937;font-weight:700;">${duracionLabel}</div>
      </div>
    `;

    document.getElementById('closeAvionPanel')?.addEventListener('click', () => {
      cerrarPanelAvion(fe.key);
    });
  }

  // ── Panel de Detalle del Envío (se abre SOLO desde la búsqueda) ───────────
  function cerrarPanelEnvio() {
    const panel = document.getElementById('airplaneDetailsPanel');
    if (panel) panel.remove();
  }

  function mostrarPanelEnvio(fe: FlightEvent) {
    // Cerrar panel de avión si estuviera abierto
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
        max-height:60vh;overflow-y:auto;pointer-events:auto;
      `;
      document.body.appendChild(panel);
    }

    // Extract shipment ID from the key (format: idEnvio-idCliente-iterX-tramoY)
    const codigoEnvio = fe.key.split('-')[0];

    // Get complete route data from the ref
    const rutaCompleta = rutasPlanificadasRef.current.get(codigoEnvio);

    // Generate tracking code: last 7 digits of shipment code + last 5 digits of customer code
    const codigoRastreo = (codigoEnvio.slice(-7) + (rutaCompleta?.idCliente || '').slice(-5)).padStart(12, '0');

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
      document.getElementById('closeFEPanel')?.addEventListener('click', () => {
        cerrarPanelEnvio();
      });
      return;
    }

    // Get airport information for location names
    const aeropuertoOrigen = sim.aeropuertos.find(a => a.codigo === rutaCompleta.origen);
    const aeropuertoDestino = sim.aeropuertos.find(a => a.codigo === rutaCompleta.destino);
    const ubicacionOrigen = aeropuertoOrigen ? `${aeropuertoOrigen.ciudad}, ${aeropuertoOrigen.pais}` : rutaCompleta.origen;
    const ubicacionDestino = aeropuertoDestino ? `${aeropuertoDestino.ciudad}, ${aeropuertoDestino.pais}` : rutaCompleta.destino;

    // Build tramos visualization with dates and times (static, no current tramo highlighting)
    const tramosVisual = rutaCompleta.tramos?.map((tramo, index) => {
      const aOrigen = sim.aeropuertos.find(a => a.codigo === tramo.origen);
      const aDestino = sim.aeropuertos.find(a => a.codigo === tramo.destino);
      const ubicacionOrigenTramo = aOrigen ? `${aOrigen.ciudad}, ${aOrigen.pais}` : tramo.origen;
      const ubicacionDestinoTramo = aDestino ? `${aDestino.ciudad}, ${aDestino.pais}` : tramo.destino;
      const isLast = index === (rutaCompleta.tramos?.length ?? 0) - 1;

      // Helper function to parse date string (handles both formats)
      const parseDateStr = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        if (dateStr.includes('-')) {
          // Format: "YYYY-MM-DD HH:MM"
          const [datePart, timePart] = dateStr.split(' ');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hour, min] = timePart?.split(':').map(Number) || [0, 0];
          return new Date(year, month - 1, day, hour, min, 0, 0);
        } else {
          // Format: "DD/MM/YYYY HH:MM"
          const parts = dateStr.split(' ');
          const [day, month, year] = parts[0].split('/').map(Number);
          const [hour, min] = parts[1]?.split(':').map(Number) || [0, 0];
          return new Date(year, month - 1, day, hour, min, 0, 0);
        }
      };

      // Calculate actual dates for sale and llega based on simulation start date
      const simStart = new Date(startDate || '2027-01-02');
      const startTimeParts = (startTime || '00:00').split(':').map(Number);
      simStart.setHours(startTimeParts[0], startTimeParts[1], 0, 0);

      // Parse registration date to use as cursor
      let cursorDate = rutaCompleta.fechaRegistro ? parseDateStr(rutaCompleta.fechaRegistro) : simStart;

      // Calculate sale date
      const saleParts = tramo.sale.split(':').map(Number);
      let saleDate = new Date(cursorDate);
      saleDate.setHours(saleParts[0], saleParts[1], 0, 0);
      if (saleDate.getTime() < cursorDate.getTime()) {
        saleDate.setDate(saleDate.getDate() + 1);
      }

      // Calculate llega date
      const llegaParts = tramo.llega.split(':').map(Number);
      let llegaDate = new Date(saleDate);
      llegaDate.setHours(llegaParts[0], llegaParts[1], 0, 0);
      if (llegaDate.getTime() < saleDate.getTime()) {
        llegaDate.setDate(llegaDate.getDate() + 1);
      }

      // Format dates as DD/MM/YYYY HH:MM
      const formatDate = (date: Date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      };

      const saleDisplay = formatDate(saleDate);
      const llegaDisplay = formatDate(llegaDate);

      return `
        <div style="background:#f9fafb;padding:12px;border-radius:10px;margin-bottom:${isLast ? '0' : '12px'};position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Tramo ${tramo.orden}</span>
          </div>
          
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="flex:1;">
              <div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Origen</div>
              <div style="font-size:12px;color:#1f2937;font-weight:700;">${ubicacionOrigenTramo}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              <div style="width:24px;height:2px;background:#d1d5db;border-radius:1px;"></div>
              <span style="color:#9ca3af;font-size:16px;font-weight:800;">✈</span>
              <div style="width:24px;height:2px;background:#d1d5db;border-radius:1px;"></div>
            </div>
            <div style="flex:1;">
              <div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Destino</div>
              <div style="font-size:12px;color:#1f2937;font-weight:700;">${ubicacionDestinoTramo}</div>
            </div>
          </div>
          
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div style="flex:1;background:white;padding:8px;border-radius:6px;">
              <div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Sale</div>
              <div style="font-size:12px;color:#1f2937;font-weight:700;">${saleDisplay}</div>
            </div>
            <div style="flex:1;background:white;padding:8px;border-radius:6px;">
              <div style="font-size:9px;color:#6b7280;margin-bottom:3px;font-weight:600;">Llega</div>
              <div style="font-size:12px;color:#1f2937;font-weight:700;">${llegaDisplay}</div>
            </div>
          </div>
          
          ${!isLast ? `
            <div style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);z-index:1;">
              <div style="width:2px;height:12px;background:#d1d5db;margin:0 auto;"></div>
              <div style="width:8px;height:8px;background:#d1d5db;border-radius:50%;margin:-6px auto 0;"></div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('') || '';

    panel.innerHTML = `
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
          <div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Registro</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;">${rutaCompleta.fechaRegistro || '-'}</div>
          </div>
          <div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Recojo</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;">${rutaCompleta.fechaRecojo || '-'}</div>
          </div>
        </div>

        <div style="margin-bottom:8px;">
          <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Ruta</div>
          <div style="font-size:12px;color:#1f2937;font-weight:700;">${ubicacionOrigen} → ${ubicacionDestino}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Tiempo</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;">${rutaCompleta.duracion || '-'}</div>
          </div>
          <div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">SLA</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;">${rutaCompleta.sla || '-'}</div>
          </div>
          <div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">� Cliente</div>
            <div style="font-size:11px;color:#1f2937;font-weight:700;">${rutaCompleta.idCliente || '-'}</div>
          </div>
        </div>

        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
          <div style="font-size:9px;color:#6b7280;margin-bottom:2px;">Maletas</div>
          <div style="font-size:12px;color:#1f2937;font-weight:700;">${rutaCompleta.maletas}</div>
        </div>
      </div>

      <div style="background:#f3f4f6;padding:12px;border-radius:8px;">
        <div style="font-size:11px;color:#6b7280;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">TRAMOS</div>
        ${tramosVisual}
      </div>
    `;

    document.getElementById('closeFEPanel')?.addEventListener('click', () => {
      cerrarPanelEnvio();
    });
  }

  // ── Barra de progreso del cronómetro ─────────────────────────────────────
  const pct = Math.round(sim.progreso);
  const simTimeLabel = formatSimTime(simMinutos, startDate, startTime);

  return (
    <div className="main-wrapper">
      <div className="card map-card" style={{ padding: 0, overflow: 'visible', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', margin: 0, borderRadius: 0, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />

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
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Iteración</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 2 }}>{sim.iteracion}/{sim.totalIter}</div>
              </div>

              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Día</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginTop: 2 }}>{sim.diaActual}/5</div>
              </div>

              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Aviones Activos</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                  {flightEventsRef.current.filter(fe => fe.active).length}
                </div>
              </div>

              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Tramos en Cola</small>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', marginTop: 2 }}>
                  {sim.allFlightEvents.length}
                </div>
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
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Progreso — Derecha Superior */}
        <div style={{ position: 'absolute', top: 12, right: 12, width: 'auto', maxWidth: 300, backgroundColor: 'rgba(255,255,255,0.95)', padding: 14, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'auto', zIndex: 999998 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Progreso de Simulación</div>

          {/* Barra GA (iteraciones) */}
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>GA — {pct}% ({sim.iteracion}/{sim.totalIter} iter.)</div>
          <div style={{ width: '100%', height: 6, backgroundColor: 'var(--border-color)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', backgroundColor: 'var(--accent-blue)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>

          {/* Barra reloj simulado */}
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>
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
          <div style={{ position: 'absolute', bottom: 20, right: 20, width: 280, backgroundColor: 'rgba(255,255,255,0.95)', padding: 14, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'auto', zIndex: 999998 }}>
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
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>📋 Registro de Eventos</h3>
              <div 
                style={{ maxHeight: 350, overflowY: 'auto' }}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {sim.logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Inicia la simulación para ver eventos...</p>}
                {sim.logs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 50 }}>{log.time || '-'}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: log.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>ℹ️ Métricas</h3>
              {sim.isRunning && sim.iteracion > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <MetricBox label="Ocupación Almacenes" value={`${metricas.ocupacionPromedio.toFixed(1)}%`} />
                  <MetricBox label="Tiempo Promedio" value={`${metricas.tiempoPromedio.toFixed(0)} min`} />
                  <MetricBox label="Tasa Puntualidad" value="0%" />
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

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 6 }}>
      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: 11 }}>{label}</small>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 6 }}>{value}</div>
    </div>
  );
}
