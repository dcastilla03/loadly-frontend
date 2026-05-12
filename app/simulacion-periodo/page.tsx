'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSimulacion, RutaPlan } from './useSimulacion';

const COLORS = ['#2564eb','#10b981','#f97316','#8b5cf6','#ec4899','#06b6d4','#14b8a6','#f59e0b','#6366f1','#84cc16'];

// Función para obtener el SVG del avión según ocupación
function getAirplaneSVG(ocupacion: number): string {
  if (ocupacion < 50) return '/airplane-green.svg';
  if (ocupacion < 80) return '/airplane-orange.svg';
  return '/airplane-red.svg';
}

// Función auxiliar para cálculo de Bézier
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return mt2 * mt * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t2 * t * p3;
}

function bezierTangent(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return 3 * mt2 * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t2 * (p3 - p2);
}

// Función para calcular curva de Bézier como puntos discretos
function bezierCurve(p0: [number,number], p1: [number,number], steps: number): [number,number][] {
  const midLat = (p0[0] + p1[0]) / 2;
  const midLng = (p0[1] + p1[1]) / 2;
  const dist = Math.sqrt(Math.pow(p1[0]-p0[0],2) + Math.pow(p1[1]-p0[1],2));
  const offset = dist * 0.15;
  const angle = Math.atan2(p1[0]-p0[0], p1[1]-p0[1]);
  const cp1: [number,number] = [midLat + Math.cos(angle+Math.PI/2)*offset, midLng - Math.sin(angle+Math.PI/2)*offset];
  const pts: [number,number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const lat = mt*mt*p0[0] + 2*mt*t*cp1[0] + t*t*p1[0];
    const lng = mt*mt*p0[1] + 2*mt*t*cp1[1] + t*t*p1[1];
    pts.push([lat, lng]);
  }
  return pts;
}

export default function SimulacionPeriodo() {
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const airplanesRef = useRef<any[]>([]);
  const animRef = useRef<number>(0);
  const lastRutasCount = useRef(0);

  // Leer fecha de inicio del query parameter
  useEffect(() => {
    const dateParam = searchParams.get('startDate');
    if (dateParam) {
      setStartDate(dateParam);
    }
  }, [searchParams]);

  const sim = useSimulacion(startDate || undefined);
  const isInitialized = useRef(false);

  // Start simulation when startDate is available
  useEffect(() => {
    if (startDate && !isInitialized.current) {
      sim.iniciar();
      isInitialized.current = true;
    }
  }, [startDate, sim.iniciar]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    
    // Check if container already has a map
    if ((mapRef.current as any)._leaflet_id) return;
    
    (async () => {
      const L = (await import('leaflet')).default;
      require('leaflet/dist/leaflet.css');
      const map = L.map(mapRef.current!, {
        maxBounds: [[-85,-180],[85,180]], maxBoundsViscosity: 1.0,
        minZoom: 3, maxZoom: 19, worldCopyJump: false
      }).setView([20, 0], 2);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB', maxZoom: 19, subdomains: 'abcd', noWrap: true
      }).addTo(map);
      mapInst.current = map;
    })();

    // Cleanup: remove map on unmount
    return () => {
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
    };
  }, []);

  // Place airport markers when aeropuertos arrive
  useEffect(() => {
    if (!mapInst.current || sim.aeropuertos.length === 0) return;
    const L = require('leaflet');
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const icon = L.icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      iconSize: [12, 18],
      iconAnchor: [6, 18],
      popupAnchor: [0, -18],
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      shadowSize: [16, 16],
      shadowAnchor: [6, 18]
    });
    
    // Guardar referencias de aeropuertos para usar en el evento
    const aeroRef = new Map(sim.aeropuertos.map(a => [a.codigo, a]));
    
    sim.aeropuertos.forEach(a => {
      // Función para generar el HTML del popup
      const generarPopupHTML = () => {
        const maletasEnAeropuerto = sim.allRutas
          .filter(r => r.aeropuertoOrigen === a.codigo)
          .reduce((sum, r) => sum + r.cantidadMaletas, 0);
        
        const ocupacion = a.capacidad > 0 ? (maletasEnAeropuerto / a.capacidad) * 100 : 0;
        const ocupacionLimitada = Math.min(100, ocupacion);
        const colorBarra = ocupacionLimitada < 50 ? '#10b981' : ocupacionLimitada < 80 ? '#f97316' : '#ef4444';
        
        return `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-width: 220px;">
            <div style="font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 8px;"><b>${a.codigo}</b></div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">${a.ciudad}, ${a.pais}</div>
            
            <div style="background: #f3f4f6; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">Ocupación del Almacén</div>
              <div style="height: 8px; background: #d1d5db; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                <div style="height: 100%; background: ${colorBarra}; width: ${ocupacionLimitada}%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; font-weight: 600; color: #1f2937;">${maletasEnAeropuerto} de ${a.capacidad} asientos</span>
                <span style="font-size: 11px; font-weight: 600; color: ${colorBarra};">${Math.round(ocupacionLimitada)}%</span>
              </div>
            </div>
            
            <div style="font-size: 10px; color: #9ca3af; padding-top: 8px; border-top: 1px solid #e5e7eb;">
              <div>Tipo: ${a.capacidad > 7000 ? '⭐ Almacén Grande' : a.capacidad > 4000 ? '⭐⭐ Almacén Mediano' : '⭐⭐⭐ Almacén Pequeño'}</div>
            </div>
          </div>
        `;
      };
      
      const m = L.marker([a.latitud, a.longitud], { icon })
        .addTo(mapInst.current);
      
      // Generar el HTML inicial
      const popupHTML = generarPopupHTML();
      m.bindPopup(popupHTML, { maxWidth: 300 });
      
      // Actualizar el contenido cuando se abre el popup para reflejar datos actualizados
      m.on('popupopen', function() {
        const updatedHTML = generarPopupHTML();
        m.setPopupContent(updatedHTML);
      });
      
      markersRef.current.push(m);
    });
  }, [sim.aeropuertos, sim.allRutas]);

  // Draw routes and create airplanes when new rutas arrive
  useEffect(() => {
    if (!mapInst.current || sim.allRutas.length === lastRutasCount.current) return;
    
    const L = require('leaflet');
    const map = mapInst.current;
    const newRutas = sim.allRutas.slice(lastRutasCount.current);
    lastRutasCount.current = sim.allRutas.length;

    console.log("[CREAR_AVIONES] Procesando", newRutas.length, "rutas nuevas | Aviones existentes:", airplanesRef.current.length);
    
    // NO limpiar aviones antiguos - dejar que terminen su ciclo naturalmente
    // Los aviones nuevos se agregarán a la lista existente

    newRutas.forEach((ruta, idx) => {
      try {
        // Build full path across all vuelos using bezierCurve
        const fullPath: [number,number][] = [];
        if (!ruta.vuelos || ruta.vuelos.length === 0) {
          console.warn("[CREAR_AVIONES] Ruta", ruta.idEnvio, "sin vuelos");
          return;
        }
        
        ruta.vuelos.forEach(v => {
          const pts = bezierCurve([v.latOrigen, v.lngOrigen], [v.latDestino, v.lngDestino], 30);
          fullPath.push(...pts);
        });

        if (fullPath.length === 0) {
          console.warn("[CREAR_AVIONES] Ruta", ruta.idEnvio, "fullPath vacío");
          return;
        }

        // Create SVG element - EXACTLY LIKE operacion-dia-dia
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.style.position = 'absolute';
        svgElement.style.top = '0';
        svgElement.style.left = '0';
        svgElement.style.pointerEvents = 'none';
        svgElement.style.zIndex = '1000';

        const airplaneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Create image element for airplane.svg
        const airplaneImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        airplaneImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '/airplane.svg');
        airplaneImage.setAttribute('x', '-30');
        airplaneImage.setAttribute('y', '-30');
        airplaneImage.setAttribute('width', '60');
        airplaneImage.setAttribute('height', '60');
        airplaneImage.style.pointerEvents = 'auto';

        airplaneGroup.appendChild(airplaneImage);
        svgElement.appendChild(airplaneGroup);
        map.getPanes().overlayPane.appendChild(svgElement);

        if (idx < 3) {
          console.log("[CREAR_AVIONES] SVG creado para ruta", idx, "| firstPath:", fullPath[0], "| svgElement parent:", svgElement.parentElement?.tagName, "| z-index:", svgElement.style.zIndex);
        }

        console.log("[CREAR_AVIONES] Avión creado | Ruta:", ruta.idEnvio, "| Vuelos:", ruta.vuelos.length, "| PathPoints:", fullPath.length);

        // Store airplane data
        const airplane = {
          svgElement,
          airplaneGroup,
          airplaneImage,
          fullPath,
          ruta,
          startTime: performance.now(),
          animationDuration: Math.min(30000, Math.max(10000, ruta.tiempoTotalMinutos * 50)),
          flightCode: `${ruta.aeropuertoOrigen}-${ruta.aeropuertoDestino}-${idx}`,
          currentProgress: 0,
          lastOcupacionColor: -1, // Cache para evitar actualizar SVG innecesariamente
        };

        // Function to show airplane details panel
        const showAirplaneDetailsPanel = () => {
          let panel = document.getElementById('airplaneDetailsPanel');
          
          if (!panel) {
            panel = document.createElement('div');
            panel.id = 'airplaneDetailsPanel';
            panel.style.cssText = `
              position: absolute;
              right: 12px;
              top: 170px;
              width: 320px;
              background: white;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
              padding: 20px;
              z-index: 10000;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-height: 60vh;
              overflow-y: auto;
              pointer-events: auto;
            `;
            document.body.appendChild(panel);
          }

          // Calculate current progress
          const now = performance.now();
          const elapsed = now - airplane.startTime;
          const progress = Math.min(1, elapsed / airplane.animationDuration);
          airplane.currentProgress = progress;

          // Get first and last vuelo for origin and destination
          const firstVuelo = ruta.vuelos[0];
          const lastVuelo = ruta.vuelos[ruta.vuelos.length - 1];
          
          const fromCity = ruta.aeropuertoOrigen;
          const toCity = ruta.aeropuertoDestino;
          
          // Calculate which flight segment is currently active based on progress
          const vueloActualIndex = Math.min(Math.floor(progress * ruta.vuelos.length), ruta.vuelos.length - 1);
          const vueloActual = ruta.vuelos[vueloActualIndex];
          
          // Calculate occupancy percentage for CURRENT flight: (packages / current flight capacity) * 100
          const ocupacionPorcentajeActual = vueloActual.capacidad > 0 ? (ruta.cantidadMaletas / vueloActual.capacidad) * 100 : 0;
          const ocupacionLimitada = Math.min(100, ocupacionPorcentajeActual); // Cap at 100% for display

          panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 style="margin: 0; font-size: 18px; color: #1f2937;">✈️ Detalles del Vuelo</h3>
              <button id="closeAirplaneDetailsPanel" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #6b7280;">×</button>
            </div>
            
            <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">RUTA COMPLETA</div>
              <div style="font-size: 14px; font-weight: 600; color: #1f2937;">${fromCity} → ${toCity}</div>
            </div>

            <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">VUELO ACTUAL</div>
              <div style="font-size: 13px; font-weight: 600; color: #1f2937;">${vueloActualIndex + 1} de ${ruta.vuelos.length}: ${vueloActual.origen} → ${vueloActual.destino}</div>
              <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">${vueloActual.horaSalida} - ${vueloActual.horaLlegada}</div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="background: #f3f4f6; padding: 12px; border-radius: 8px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">ORIGEN</div>
                <div style="font-size: 12px; font-weight: 600; color: #1f2937;">${fromCity}</div>
                <div style="font-size: 10px; color: #9ca3af;">Lat: ${firstVuelo.latOrigen.toFixed(2)}</div>
                <div style="font-size: 10px; color: #9ca3af;">Lng: ${firstVuelo.lngOrigen.toFixed(2)}</div>
              </div>
              <div style="background: #f3f4f6; padding: 12px; border-radius: 8px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">DESTINO</div>
                <div style="font-size: 12px; font-weight: 600; color: #1f2937;">${toCity}</div>
                <div style="font-size: 10px; color: #9ca3af;">Lat: ${lastVuelo.latDestino.toFixed(2)}</div>
                <div style="font-size: 10px; color: #9ca3af;">Lng: ${lastVuelo.lngDestino.toFixed(2)}</div>
              </div>
            </div>
            
            <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">OCUPACIÓN DEL VUELO ACTUAL</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 6px; background: #d1d5db; border-radius: 3px; overflow: hidden;">
                  <div style="height: 100%; background: ${ocupacionLimitada < 50 ? '#10b981' : ocupacionLimitada < 80 ? '#f97316' : '#ef4444'}; width: ${ocupacionLimitada}%;"></div>
                </div>
                <span style="font-weight: 600; color: #3b82f6; min-width: 50px;">${Math.round(ocupacionLimitada)}%</span>
              </div>
              <div style="font-size: 10px; color: #9ca3af; margin-top: 6px;">${ruta.cantidadMaletas} de ${vueloActual.capacidad} asientos</div>
            </div>
            
            <div style="background: #f3f4f6; padding: 12px; border-radius: 8px;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">PROGRESO</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 8px; background: #d1d5db; border-radius: 4px; overflow: hidden;">
                  <div id="progressBar" style="height: 100%; background: #3b82f6; width: ${progress * 100}%;"></div>
                </div>
                <span id="progressText" style="font-weight: 600; color: #3b82f6; min-width: 35px;">${Math.round(progress * 100)}%</span>
              </div>
            </div>
          `;

          document.getElementById('closeAirplaneDetailsPanel')?.addEventListener('click', function () {
            panel?.remove();
          });
        };

        // Add click event to airplane
        airplaneImage.addEventListener('click', function (e: any) {
          e.stopPropagation();
          showAirplaneDetailsPanel();
        });

        airplanesRef.current.push(airplane);
      } catch (err) {
        console.error("[CREAR_AVIONES] Error procesando ruta", ruta.idEnvio, err);
      }
    });

    console.log("[CREAR_AVIONES] Total aviones en pantalla ahora:", airplanesRef.current.length);
  }, [sim.allRutas]);

  // Animation loop - must wait for map to be initialized
  useEffect(() => {
    let frameId: number;
    let checkMapInterval: NodeJS.Timeout | null = null;
    let animationStarted = false;

    function startAnimation() {
      if (animationStarted) return;
      const map = mapInst.current;
      if (!map) return; // Not ready yet
      
      animationStarted = true;
      console.log("[ANIMATE] Map is ready! Starting animation loop");
      
      let frameCount = 0;

      function updatePointPosition() {
        const now = performance.now();
        const currentAirplanes = airplanesRef.current;
        
        if (currentAirplanes.length === 0) return;
        
        if (frameCount === 0) {
          console.log("[UPDATE] Frame 0: Found", currentAirplanes.length, "airplanes, updating positions...");
        }
        
        currentAirplanes.forEach((airplane, i) => {
          if (!airplane.fullPath || airplane.fullPath.length < 2) {
            if (i === 0) console.warn("[UPDATE] Airplane 0 has no fullPath!");
            return;
          }
          
          try {
            const elapsed = now - airplane.startTime;
            const progress = Math.min(1, elapsed / airplane.animationDuration);
            airplane.currentProgress = progress;
            
            // Si el avión completó su ciclo, eliminarlo
            if (progress >= 1 && airplane.svgElement && airplane.svgElement.parentElement) {
              airplane.svgElement.remove();
              airplanesRef.current = airplanesRef.current.filter(ap => ap !== airplane);
              console.log("[UPDATE] Avión eliminado tras completar ciclo | Aviones restantes:", airplanesRef.current.length);
              return;
            }
            
            // Update panel progress if it's open
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            if (progressBar && progressText) {
              progressBar.style.width = `${progress * 100}%`;
              progressText.textContent = `${Math.round(progress * 100)}%`;
            }
            
            // Calcular ocupación actual y actualizar color del avión
            const vueloActualIndex = Math.min(Math.floor(progress * airplane.ruta.vuelos.length), airplane.ruta.vuelos.length - 1);
            const vueloActual = airplane.ruta.vuelos[vueloActualIndex];
            const ocupacionPorcentaje = vueloActual.capacidad > 0 ? (airplane.ruta.cantidadMaletas / vueloActual.capacidad) * 100 : 0;
            const ocupacionLimitada = Math.min(100, ocupacionPorcentaje);
            
            // Obtener el color correspondiente y actualizar si cambió
            const nuevoSVG = getAirplaneSVG(ocupacionLimitada);
            const colorBucket = ocupacionLimitada < 50 ? 0 : ocupacionLimitada < 80 ? 1 : 2;
            
            if (airplane.lastOcupacionColor !== colorBucket) {
              airplane.airplaneImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', nuevoSVG);
              airplane.lastOcupacionColor = colorBucket;
            }
            
            const pathIndex = Math.floor(progress * airplane.fullPath.length);
            const idx = Math.min(pathIndex, airplane.fullPath.length - 1);
            const nextIdx = Math.min(idx + 1, airplane.fullPath.length - 1);
            
            const [currentLat, currentLng] = airplane.fullPath[idx];
            const [nextLat, nextLng] = airplane.fullPath[nextIdx];
            
            const cosLat = Math.cos(currentLat * Math.PI / 180);
            const angle = Math.atan2(-(nextLat - currentLat), (nextLng - currentLng) * cosLat) * (180 / Math.PI);
            
            const pointCoords = map.latLngToLayerPoint([currentLat, currentLng]);
            
            const zoom = map.getZoom();
            const airplaneSize = 20 + (zoom - 2) * 3;
            const offset = airplaneSize / 2;
            
            airplane.airplaneImage.setAttribute('width', airplaneSize.toString());
            airplane.airplaneImage.setAttribute('height', airplaneSize.toString());
            airplane.airplaneImage.setAttribute('x', (-offset).toString());
            airplane.airplaneImage.setAttribute('y', (-offset).toString());
            
            const size = map.getSize();
            const margin = 1000;
            airplane.svgElement.setAttribute('width', (size.x + margin * 2).toString());
            airplane.svgElement.setAttribute('height', (size.y + margin * 2).toString());
            airplane.svgElement.style.left = (-margin) + 'px';
            airplane.svgElement.style.top = (-margin) + 'px';
            
            const transformStr = `translate(${pointCoords.x + margin},${pointCoords.y + margin}) rotate(${angle} 0 0)`;
            airplane.airplaneGroup.setAttribute('transform', transformStr);
            
            if (i === 0 && frameCount === 1) {
              console.log("[UPDATE] Frame 1: First airplane updated! Transform set successfully");
            }
          } catch (err) {
            if (i === 0 && frameCount === 1) {
              console.error("[UPDATE] Error updating airplane:", err);
            }
          }
        });
        
        frameCount++;
      }

      function animate() {
        updatePointPosition();
        frameId = requestAnimationFrame(animate);
      }
      
      map.on('move zoom moveend zoomend', updatePointPosition);
      frameId = requestAnimationFrame(animate);
      
      return () => {
        console.log("[ANIMATE] Cleaning up animation, ran for frames");
        cancelAnimationFrame(frameId);
        map.off('move zoom moveend zoomend', updatePointPosition);
      };
    }

    // Try to start immediately, but also poll in case map isn't ready
    if (startAnimation() === undefined) {
      // Map not ready, set up interval to check
      checkMapInterval = setInterval(() => {
        startAnimation();
        if (animationStarted && checkMapInterval) {
          clearInterval(checkMapInterval);
          checkMapInterval = null;
        }
      }, 100);
    }

    return () => {
      if (checkMapInterval) {
        clearInterval(checkMapInterval);
      }
    };
  }, []);

  const pct = Math.round(sim.progreso);

  return (
    <div className="main-wrapper">
      <div className="card map-card" style={{ padding: 0, overflow: 'visible', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', margin: 0, borderRadius: 0, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />

        {/* Control Panel - Top Center */}
        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
          <div style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
            <div className="card" style={{ display: 'flex', gap: 14, marginBottom: 0, padding: '10px 12px', alignItems: 'center' }}>
              <h1 style={{ marginBottom: 0, fontSize: 20, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>📅 Simulación GA — Período 5 Días</h1>
              <div style={{ height: 20, width: 1, backgroundColor: 'var(--border-color)' }} />
              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Reloj Simulado</small>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 2 }}>{sim.reloj || '--'}</div>
              </div>
              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Iteración</small>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 2 }}>{sim.iteracion}/{sim.totalIter}</div>
              </div>
              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Día</small>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316', marginTop: 2 }}>{sim.diaActual}/5</div>
              </div>
              <div>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Rutas Activas</small>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{sim.allRutas.length}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={sim.iniciar} disabled={sim.isRunning}
                  style={{ padding: '8px 14px', fontSize: 12, backgroundColor: sim.isRunning ? 'var(--border-color)' : 'var(--accent-blue)', border: 'none', borderRadius: 6, cursor: sim.isRunning ? 'default' : 'pointer', color: 'white', opacity: sim.isRunning ? 0.6 : 1, fontWeight: 600 }}>
                  ▶️ Iniciar GA
                </button>
                <button onClick={sim.detener} disabled={!sim.isRunning}
                  style={{ padding: '8px 14px', fontSize: 12, backgroundColor: !sim.isRunning ? 'var(--border-color)' : '#ef4444', border: 'none', borderRadius: 6, cursor: !sim.isRunning ? 'default' : 'pointer', color: 'white', opacity: !sim.isRunning ? 0.6 : 1, fontWeight: 600 }}>
                  ⏹️ Detener
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar - Top Right */}
        <div style={{ position: 'absolute', top: 12, right: 12, width: 'auto', maxWidth: 350, backgroundColor: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'auto', zIndex: 999998 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Progreso de Simulación</div>
          <div style={{ width: '100%', height: 8, backgroundColor: 'var(--border-color)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', backgroundColor: 'var(--accent-blue)', width: `${pct}%`, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{pct}% — Día {sim.diaActual} de 5</div>
          {sim.isRunning && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>⏳ GA ejecutándose (30s/ventana)...</div>}
        </div>

        {/* Scroll to Stats button */}
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999999 }}>
          <button onClick={() => document.getElementById('statsSection')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ background: 'var(--accent-blue)', border: 'none', color: 'white', width: 50, height: 50, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 12px rgba(37,100,235,0.3)' }}>
            <img src="/down.svg" alt="↓" style={{ width: 28, height: 28 }} />
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div id="statsSection" style={{ paddingTop: 40, paddingBottom: 40, backgroundColor: 'white' }}>
        <div className="container">
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>📊 Resultados en Tiempo Real</h2>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard title="Total Planificados" value={sim.totalPlanificados} color="var(--accent-blue)" />
            <StatCard title="Total Maletas" value={sim.totalMaletas} color="#22c55e" />
            <StatCard title="Rutas Activas" value={sim.allRutas.length} color="#f97316" />
            <StatCard title="Envíos en Espera" value={sim.stats?.enviosEnEspera ?? 0} color="#ef4444" />
          </div>

          {/* Resumen Final */}
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
                Tiempo de ejecución real: <strong>{sim.resumen.tiempoEjecucionRealSegundos.toFixed(1)}s</strong> | 
                Total envíos: <strong>{sim.resumen.totalEnviosPlanificados}</strong> | 
                Total maletas: <strong>{sim.resumen.totalMaletasPlanificadas}</strong>
              </div>
            </div>
          )}

          {/* Colapso Alert */}
          {sim.colapso && (
            <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' }}>
              <h3 style={{ color: '#ef4444', marginBottom: 8 }}>⚠️ COLAPSO DETECTADO</h3>
              <p style={{ margin: 0, fontSize: 14 }}><strong>Tipo:</strong> {sim.colapso.tipoError}</p>
              <p style={{ margin: '4px 0', fontSize: 14 }}><strong>Envío:</strong> {sim.colapso.idEnvioCausante} | <strong>Ruta:</strong> {sim.colapso.rutaCausante}</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{sim.colapso.detalle}</p>
            </div>
          )}

          {/* Event Log & Day Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>📋 Registro de Eventos (GA)</h3>
              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                {sim.logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Inicia la simulación para ver eventos...</p>}
                {sim.logs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 50 }}>{log.time}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: log.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>ℹ️ Métricas por Iteración</h3>
              {sim.stats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <MetricBox label="Fitness Promedio" value={sim.stats.fitnessPromedio.toFixed(4)} />
                  <MetricBox label="Planificados (últ.)" value={String(sim.stats.planificados)} />
                  <MetricBox label="Sin Ruta (últ.)" value={String(sim.stats.sinRuta)} />
                  <MetricBox label="Inalcanzables (últ.)" value={String(sim.stats.inalcanzables)} />
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Esperando datos del GA...</p>
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
