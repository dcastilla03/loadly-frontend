'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSimulacion, FlightEvent, LogEvent } from './useSimulacion';

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

  // Lista viva de LogEvent temporizados (se disparan al compas del cronómetro)
  const logEventsRef = useRef<LogEvent[]>([]);

  // Ref estable a addLog (evita problemas de closure en el loop de animación)
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => {});

  // Tiempo real en que arrancó la animación del cronómetro
  const clockStartRef = useRef<number | null>(null);

  // Minutos simulados actuales (para mostrar en UI)
  const [simMinutos, setSimMinutos] = useState(0);
  
  // Estado para rastrear si la simulación fue detenida
  const [isStopped, setIsStopped] = useState(false);
  // Estado anterior de isRunning para detectar cuándo cambió
  const prevIsRunningRef = useRef(false);

  const isInitialized = useRef(false);

  // Leer fecha y hora de inicio del query param
  useEffect(() => {
    const dateParam = new URLSearchParams(window.location.search).get('startDate');
    const timeParam = new URLSearchParams(window.location.search).get('startTime');
    if (dateParam) setStartDate(dateParam);
    if (timeParam) setStartTime(timeParam);
  }, []);

  const sim = useSimulacion(startDate || undefined, startTime || undefined);

  // Iniciar simulación automáticamente cuando tenemos la fecha
  useEffect(() => {
    if (startDate && !isInitialized.current) {
      sim.iniciar();
      isInitialized.current = true;
      // El reloj se iniciará cuando iteracion > 0
    }
  }, [startDate, sim.iniciar]);

  // ── Detectar cambios en isRunning para rastrear detenido ──────────────────
  useEffect(() => {
    if (prevIsRunningRef.current && !sim.isRunning && sim.iteracion > 0) {
      // Cambió de true a false: fue detenido
      setIsStopped(true);
    } else if (sim.isRunning && !prevIsRunningRef.current) {
      // Cambió de false a true: reinició, resetear estado
      setIsStopped(false);
    }
    prevIsRunningRef.current = sim.isRunning;
  }, [sim.isRunning, sim.iteracion]);

  // ── Iniciar cronómetro solo después de la primera iteración ───────────────
  useEffect(() => {
    if (sim.isRunning && sim.iteracion === 0) {
      clockStartRef.current = null; // Reiniciar
    } else if (sim.isRunning && sim.iteracion > 0 && clockStartRef.current === null) {
      clockStartRef.current = performance.now(); // Arrancar reloj
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

      // Click → panel de detalles
      img.addEventListener('click', (ev: any) => {
        ev.stopPropagation();
        mostrarPanelDetalles(fe);
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

        const totalIter = sim.totalIter || 120;
        const duracionRealMs = totalIter * SEGS_POR_ITER * 1000;
        const clockStart = clockStartRef.current ?? performance.now();
        const elapsedMs = performance.now() - clockStart;

        // Minutos simulados actuales (avanza hasta TOTAL_MINUTOS_SIM)
        const minSim = Math.min(
          TOTAL_MINUTOS_SIM,
          (elapsedMs / duracionRealMs) * TOTAL_MINUTOS_SIM
        );

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
        if (pendingLogs.length > 0) {
          // Ordenados cronológicamente (minutosDisparo asc) → el más reciente va primero en el log
          for (const entry of pendingLogs) {
            addLogRef.current(entry.text, entry.color, entry.minutosDisparo);
          }
        }

        frameId = requestAnimationFrame(loop);
      }

      map.on('move zoom moveend zoomend', () => {
        // Forzar re-posicionamiento en evento de mapa
        const map = mapInst.current;
        if (!map) return;
        flightEventsRef.current.filter(fe => fe.active && !fe.done).forEach(fe => {
          const totalIter = sim.totalIter || 120;
          const duracionRealMs = totalIter * SEGS_POR_ITER * 1000;
          const clockStart = clockStartRef.current ?? performance.now();
          const elapsedMs = performance.now() - clockStart;
          const minSim = Math.min(TOTAL_MINUTOS_SIM, (elapsedMs / duracionRealMs) * TOTAL_MINUTOS_SIM);
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

  // ── Panel de detalles del avión ───────────────────────────────────────────
  function mostrarPanelDetalles(fe: FlightEvent) {
    let panel = document.getElementById('airplaneDetailsPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'airplaneDetailsPanel';
      panel.style.cssText = `
        position:absolute;right:12px;top:170px;width:300px;
        background:white;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.18);
        padding:18px;z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        max-height:60vh;overflow-y:auto;pointer-events:auto;
      `;
      document.body.appendChild(panel);
    }

    const ocupPct = fe.capacidadVuelo > 0
      ? Math.min(100, (fe.maletasVuelo / fe.capacidadVuelo) * 100)
      : 0;
    const colorOcup = ocupPct < 50 ? '#10b981' : ocupPct < 80 ? '#f97316' : '#ef4444';

    const ocupOrigen = fe.capacidadAlmacenOrigen > 0
      ? Math.min(100, (fe.ocupacionAlmacenOrigen / fe.capacidadAlmacenOrigen) * 100)
      : 0;
    const ocupDestino = fe.capacidadAlmacenDestino > 0
      ? Math.min(100, (fe.ocupacionAlmacenDestino / fe.capacidadAlmacenDestino) * 100)
      : 0;
    const colorOrigen = ocupOrigen < 50 ? '#10b981' : ocupOrigen < 80 ? '#f97316' : '#ef4444';
    const colorDestino = ocupDestino < 50 ? '#10b981' : ocupDestino < 80 ? '#f97316' : '#ef4444';

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;font-size:16px;color:#1f2937;">✈️ Detalle del Tramo</h3>
        <button id="closeFEPanel" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">TRAMO</div>
        <div style="font-size:14px;font-weight:700;color:#1f2937;">${fe.origenCode} → ${fe.destinoCode}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:3px;">Tramo ${fe.tramoOrden}</div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;margin-bottom:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">OCUPACIÓN DEL VUELO</div>
        <div style="height:6px;background:#d1d5db;border-radius:3px;overflow:hidden;margin-bottom:5px;">
          <div style="height:100%;background:${colorOcup};width:${ocupPct}%;"></div>
        </div>
        <div style="font-size:11px;color:#374151;font-weight:600;">${fe.maletasVuelo} / ${fe.capacidadVuelo} maletas (${Math.round(ocupPct)}%)</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">ALMACÉN ORIGEN</div>
          <div style="font-size:11px;font-weight:600;color:#1f2937;">${fe.origenCode}</div>
          <div style="height:4px;background:#d1d5db;border-radius:2px;overflow:hidden;margin:5px 0;">
            <div style="height:100%;background:${colorOrigen};width:${ocupOrigen}%;"></div>
          </div>
          <div style="font-size:10px;color:#6b7280;">${fe.ocupacionAlmacenOrigen}/${fe.capacidadAlmacenOrigen} (${Math.round(ocupOrigen)}%)</div>
        </div>
        <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
          <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">ALMACÉN DESTINO</div>
          <div style="font-size:11px;font-weight:600;color:#1f2937;">${fe.destinoCode}</div>
          <div style="height:4px;background:#d1d5db;border-radius:2px;overflow:hidden;margin:5px 0;">
            <div style="height:100%;background:${colorDestino};width:${ocupDestino}%;"></div>
          </div>
          <div style="font-size:10px;color:#6b7280;">${fe.ocupacionAlmacenDestino}/${fe.capacidadAlmacenDestino} (${Math.round(ocupDestino)}%)</div>
        </div>
      </div>

      <div style="background:#f3f4f6;padding:10px;border-radius:8px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">VENTANA HORARIA</div>
        <div style="font-size:11px;color:#374151;">
          Sale: ${formatSimTime(fe.minutosInicio, startDate, startTime)}<br/>
          Llega: ${formatSimTime(fe.minutosFin, startDate, startTime)}
        </div>
      </div>
    `;

    document.getElementById('closeFEPanel')?.addEventListener('click', () => {
      panel?.remove();
    });
  }

  // ── Barra de progreso del cronómetro ─────────────────────────────────────
  const pct = Math.round(sim.progreso);
  const simTimeLabel = formatSimTime(simMinutos, startDate, startTime);

  return (
    <div className="main-wrapper">
      <div className="card map-card" style={{ padding: 0, overflow: 'visible', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', margin: 0, borderRadius: 0, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />

        {/* Panel de Control — Centro Superior */}
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
          <div style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
            <div className="card" style={{ display: 'flex', gap: 14, marginBottom: 0, padding: '10px 14px', alignItems: 'center' }}>
              <h1 style={{ marginBottom: 0, fontSize: 18, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}>
                Simulación — Período 5 Días
                {/* LED que cambia de estado: apagado → rojo parpadeando → amarillo */}
                <span 
                  className={isStopped ? 'led-stopped' : sim.isRunning && sim.iteracion > 0 ? 'led-active' : 'led-off'} 
                  style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }}
                />
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
                  
                  /* LED detenido - Amarillo */
                  @keyframes led-stopped-pulse {
                    0%, 100% { 
                      opacity: 1; 
                      box-shadow: 0 0 6px rgba(245, 158, 11, 0.8); 
                    }
                    50% { 
                      opacity: 0.6; 
                      box-shadow: 0 0 3px rgba(245, 158, 11, 0.4); 
                    }
                  }
                  .led-stopped {
                    background-color: #f59e0b;
                    border: 1px solid #d97706;
                    animation: led-stopped-pulse 1.2s ease-in-out infinite;
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
                <button onClick={sim.iniciar} disabled={sim.isRunning}
                  style={{ padding: '7px 12px', fontSize: 11, backgroundColor: sim.isRunning ? 'var(--border-color)' : 'var(--accent-blue)', border: 'none', borderRadius: 6, cursor: sim.isRunning ? 'default' : 'pointer', color: 'white', opacity: sim.isRunning ? 0.6 : 1, fontWeight: 600 }}>
                  ▶️ Iniciar
                </button>
                <button onClick={sim.detener} disabled={!sim.isRunning}
                  style={{ padding: '7px 12px', fontSize: 11, backgroundColor: !sim.isRunning ? 'var(--border-color)' : '#ef4444', border: 'none', borderRadius: 6, cursor: !sim.isRunning ? 'default' : 'pointer', color: 'white', opacity: !sim.isRunning ? 0.6 : 1, fontWeight: 600 }}>
                  ⏹️ Detener
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
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="algo-spinner"></span> Configurando algoritmo...
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
              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
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
