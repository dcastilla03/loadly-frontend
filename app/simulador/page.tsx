'use client';

import { useEffect, useRef, useState } from 'react';
import { showNotification } from '../../lib/notifications';

declare global {
  interface Window {
    globalMap?: any;
    globalBezierPoint?: (t: number, p0: number, p1: number, p2: number, p3: number) => number;
    globalAnimationStartTime?: number;
    globalAnimationDuration?: number;
    selectedAirplane?: any;
    trackingActive?: boolean;
    globalAirplanes?: any[];
    trackAirplane?: () => void;
  }
}

const ROUTES = [
  { name: 'São Paulo → Miami', origin: [-23.55, -46.63], destination: [25.76, -80.19], color: '#2564eb' },
  { name: 'Buenos Aires → Miami', origin: [-34.60, -58.38], destination: [25.76, -80.19], color: '#10b981' },
  { name: 'Lima → Nueva York', origin: [-12.05, -77.04], destination: [40.71, -74.01], color: '#f97316' },
  { name: 'Bogotá → Los Ángeles', origin: [4.71, -74.07], destination: [34.05, -118.24], color: '#8b5cf6' },
  { name: 'Caracas → Chicago', origin: [10.49, -66.86], destination: [41.88, -87.63], color: '#ec4899' },
  { name: 'México → Toronto', origin: [19.43, -99.13], destination: [43.65, -79.38], color: '#06b6d4' },
  { name: 'Ciudad de México → Nueva York', origin: [19.43, -99.13], destination: [40.71, -74.01], color: '#14b8a6' },
  { name: 'Los Ángeles → Nueva York', origin: [34.05, -118.24], destination: [40.71, -74.01], color: '#f59e0b' },
  { name: 'Miami → Toronto', origin: [25.76, -80.19], destination: [43.65, -79.38], color: '#06b6d4' },
  { name: 'Londres → París', origin: [51.51, -0.13], destination: [48.86, 2.35], color: '#10b981' },
  { name: 'París → Frankfurt', origin: [48.86, 2.35], destination: [50.11, 8.68], color: '#f97316' },
  { name: 'Frankfurt → Moscú', origin: [50.11, 8.68], destination: [55.75, 37.62], color: '#2564eb' },
  { name: 'Madrid → Ámsterdam', origin: [40.42, -3.70], destination: [52.37, 4.89], color: '#8b5cf6' },
  { name: 'Estambul → París', origin: [41.01, 28.98], destination: [48.86, 2.35], color: '#ec4899' },
  { name: 'México → Italia', origin: [19.43, -99.13], destination: [41.90, 12.50], color: '#10b981' },
  { name: 'Lima → Madrid', origin: [-12.05, -77.04], destination: [40.42, -3.70], color: '#f97316' },
  { name: 'Nueva York → Londres', origin: [40.71, -74.01], destination: [51.51, -0.13], color: '#2564eb' },
  { name: 'Los Ángeles → París', origin: [34.05, -118.24], destination: [48.86, 2.35], color: '#8b5cf6' },
  { name: 'Toronto → Frankfurt', origin: [43.65, -79.38], destination: [50.11, 8.68], color: '#ec4899' },
  { name: 'Dubái → Londres', origin: [25.25, 55.27], destination: [51.51, -0.13], color: '#06b6d4' },
  { name: 'Doha → París', origin: [25.29, 51.54], destination: [48.86, 2.35], color: '#14b8a6' },
  { name: 'Estambul → Dubái', origin: [41.01, 28.98], destination: [25.25, 55.27], color: '#f59e0b' },
  { name: 'Pekín → Tokio', origin: [39.90, 116.41], destination: [35.68, 139.65], color: '#10b981' },
  { name: 'Shanghái → Hong Kong', origin: [31.23, 121.47], destination: [22.30, 114.17], color: '#2564eb' },
  { name: 'Singapur → Bangkok', origin: [1.35, 103.82], destination: [13.73, 100.49], color: '#f97316' },
  { name: 'Tokio → Singapur', origin: [35.68, 139.65], destination: [1.35, 103.82], color: '#8b5cf6' },
  { name: 'Hong Kong → Pekín', origin: [22.30, 114.17], destination: [39.90, 116.41], color: '#ec4899' },
  { name: 'Los Ángeles → Tokio', origin: [34.05, -118.24], destination: [35.68, 139.65], color: '#06b6d4' },
  { name: 'Nueva York → Pekín', origin: [40.71, -74.01], destination: [39.90, 116.41], color: '#14b8a6' },
  { name: 'Sídney → Los Ángeles', origin: [-33.87, 151.21], destination: [34.05, -118.24], color: '#f59e0b' },
  { name: 'Singapur → Nueva York', origin: [1.35, 103.82], destination: [40.71, -74.01], color: '#10b981' },
  { name: 'Johannesburgo → Dubái', origin: [-25.75, 28.27], destination: [25.25, 55.27], color: '#2564eb' },
  { name: 'São Paulo → Lima', origin: [-23.55, -46.63], destination: [-12.05, -77.04], color: '#f97316' },
  { name: 'Buenos Aires → São Paulo', origin: [-34.60, -58.38], destination: [-23.55, -46.63], color: '#8b5cf6' },
  { name: 'Chicago → Miami', origin: [41.88, -87.63], destination: [25.76, -80.19], color: '#ec4899' },
  { name: 'París → Londres', origin: [48.86, 2.35], destination: [51.51, -0.13], color: '#06b6d4' },
  { name: 'Moscú → Estambul', origin: [55.75, 37.62], destination: [41.01, 28.98], color: '#14b8a6' },
  { name: 'Shanghái → Singapur', origin: [31.23, 121.47], destination: [1.35, 103.82], color: '#f59e0b' }
];

export default function Simulador() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [selectedAirplane, setSelectedAirplane] = useState<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Dinámicamente importar Leaflet y CSS
    (async () => {
      const L = (await import('leaflet')).default;
      require('leaflet/dist/leaflet.css');

      if (mapInstanceRef.current) return;

      let map = L.map(mapContainerRef.current!, {
        maxBounds: [[-85.05112878, -180], [85.05112878, 180]],
        maxBoundsViscosity: 1.0,
        minZoom: 3,
        maxZoom: 19,
        worldCopyJump: false
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB',
        maxZoom: 19,
        minZoom: 3,
        subdomains: 'abcd',
        noWrap: true,
        bounds: [[-85.05112878, -180], [85.05112878, 180]]
      }).addTo(map);

      function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
      }

      function bezierTangent(t: number, p0: number, p1: number, p2: number, p3: number) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        return 3 * mt2 * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t2 * (p3 - p2);
      }

      const airplanes: any[] = [];
      const animationDuration = 30000;
      const animationStartTime = performance.now();

      window.globalMap = map;
      window.globalBezierPoint = bezierPoint;
      window.globalAnimationStartTime = animationStartTime;
      window.globalAnimationDuration = animationDuration;
      window.selectedAirplane = null;
      window.trackingActive = false;
      window.globalAirplanes = airplanes;

      const smallIcon = L.icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        iconSize: [12, 18],
        iconAnchor: [6, 18],
        popupAnchor: [0, -18],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        shadowSize: [16, 16],
        shadowAnchor: [6, 18]
      });

      ROUTES.forEach((route, index) => {
        const origin = route.origin;
        const destination = route.destination;
        const capacity = Math.random();

        const controlPoint1 = [origin[0] + 2, origin[1] + 2];
        const controlPoint2 = [destination[0] - 2, destination[1] - 2];

        const curvePoints: any[] = [];
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          const lat = bezierPoint(t, origin[0], controlPoint1[0], controlPoint2[0], destination[0]);
          const lng = bezierPoint(t, origin[1], controlPoint1[1], controlPoint2[1], destination[1]);
          curvePoints.push([lat, lng]);
        }

        L.polyline(curvePoints, {
          color: route.color,
          weight: 3,
          opacity: 1,
          dashArray: '5, 5'
        }).addTo(map);

        L.marker(origin as any, { icon: smallIcon }).addTo(map).bindPopup(`<b>${route.name.split('→')[0].trim()}</b>`);
        L.marker(destination as any, { icon: smallIcon }).addTo(map).bindPopup(`<b>${route.name.split('→')[1].trim()}</b>`);

        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.style.position = 'absolute';
        svgElement.style.top = '0';
        svgElement.style.left = '0';
        svgElement.style.pointerEvents = 'none';
        svgElement.style.zIndex = '500';

        const airplaneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const airplaneImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        airplaneImage.style.pointerEvents = 'auto';
        airplaneImage.style.cursor = 'pointer';
        const svgPaths = ['airplane-green.svg', 'airplane-orange.svg', 'airplane-red.svg'];
        airplaneImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '/' + svgPaths[index % 3]);
        airplaneImage.setAttribute('x', '-30');
        airplaneImage.setAttribute('y', '-30');
        airplaneImage.setAttribute('width', '60');
        airplaneImage.setAttribute('height', '60');

        airplaneGroup.appendChild(airplaneImage);
        svgElement.appendChild(airplaneGroup);
        map.getPanes().overlayPane.appendChild(svgElement);

        const airplane = {
          svgElement,
          airplaneGroup,
          airplaneImage,
          origin,
          destination,
          controlPoint1,
          controlPoint2,
          capacity,
          routeName: route.name,
          routeColor: route.color,
          currentLat: origin[0],
          currentLng: origin[1],
          flightCode: `${route.name.split('→')[0].trim().substring(0, 3).toUpperCase()}-${1000 + index}`,
          status: 'En Vuelo',
          altitude: Math.floor(Math.random() * 35000 + 5000),
          speed: Math.floor(Math.random() * 450 + 350),
          luggage: Math.floor(Math.random() * 150 + 50)
        };

        airplaneImage.addEventListener('click', () => {
          setSelectedAirplane(airplane);
        });

        airplanes.push(airplane);

        function showAirplanePanel(airplane: any) {
          let panel = document.getElementById('airplanePanel');
          
          if (!panel) {
            panel = document.createElement('div');
            panel.id = 'airplanePanel';
            panel.style.cssText = `
              position: absolute;
              right: 20px;
              top: 20px;
              width: 320px;
              background: white;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
              padding: 20px;
              z-index: 1000;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-height: 60vh;
              overflow-y: auto;
            `;
            const mapCard = document.querySelector('.map-card');
            if (mapCard) mapCard.appendChild(panel);
          }

          const fromCity = airplane.routeName.split('→')[0].trim();
          const toCity = airplane.routeName.split('→')[1].trim();

          const progressBar = document.createElement('div');
          panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 style="margin: 0; font-size: 18px; color: var(--text-primary);">✈️ Detalles del Vuelo</h3>
              <button id="closeAirplanePanel" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-secondary);">×</button>
            </div>
            
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">RUTA</div>
              <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${fromCity} → ${toCity}</div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">ORIGEN</div>
                <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${fromCity}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Lat: ${airplane.origin[0].toFixed(2)}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Lng: ${airplane.origin[1].toFixed(2)}</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">DESTINO</div>
                <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${toCity}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Lat: ${airplane.destination[0].toFixed(2)}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Lng: ${airplane.destination[1].toFixed(2)}</div>
              </div>
            </div>
            
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">CAPACIDAD</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                  <div style="height: 100%; background: ${airplane.capacity < 0.5 ? '#22c55e' : airplane.capacity < 0.8 ? '#f97316' : '#ef4444'}; width: ${airplane.capacity * 100}%;"></div>
                </div>
                <span style="font-weight: 600; color: var(--accent-blue); min-width: 40px;">${Math.round(airplane.capacity * 100)}%</span>
              </div>
            </div>
            
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">
              <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">PROGRESO</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
                  <div id="progressBar" style="height: 100%; background: ${airplane.routeColor}; width: 0%;"></div>
                </div>
                <span id="progressText" style="font-weight: 600; color: var(--accent-blue); min-width: 35px;">0%</span>
              </div>
            </div>
          `;

          document.getElementById('closeAirplanePanel')?.addEventListener('click', function () {
            window.trackingActive = false;
            window.selectedAirplane = null;
            const p = document.getElementById('airplanePanel');
            if (p) p.remove();
          });
        }

        airplaneImage.addEventListener('click', function (e: any) {
          e.stopPropagation();
          const currentTime = performance.now();
          const elapsed = currentTime - window.globalAnimationStartTime!;
          const progress = (elapsed % window.globalAnimationDuration!) / window.globalAnimationDuration!;

          const clickLat = window.globalBezierPoint!(progress, airplane.origin[0], airplane.controlPoint1[0], airplane.controlPoint2[0], airplane.destination[0]);
          const clickLng = window.globalBezierPoint!(progress, airplane.origin[1], airplane.controlPoint1[1], airplane.controlPoint2[1], airplane.destination[1]);

          window.globalMap!.flyTo([clickLat, clickLng], 5, { duration: 1500 });

          setTimeout(() => {
            window.selectedAirplane = airplane;
            window.trackingActive = true;
            showAirplanePanel(airplane);
            window.trackAirplane!();
          }, 1500);
        });
      });

      function trackAirplane() {
        if (!window.trackingActive || !window.selectedAirplane) {
          requestAnimationFrame(trackAirplane);
          return;
        }

        const currentTime = performance.now();
        const elapsed = currentTime - window.globalAnimationStartTime!;
        const progress = (elapsed % window.globalAnimationDuration!) / window.globalAnimationDuration!;

        const currentLat = window.globalBezierPoint!(progress, window.selectedAirplane.origin[0], window.selectedAirplane.controlPoint1[0], window.selectedAirplane.controlPoint2[0], window.selectedAirplane.destination[0]);
        const currentLng = window.globalBezierPoint!(progress, window.selectedAirplane.origin[1], window.selectedAirplane.controlPoint1[1], window.selectedAirplane.controlPoint2[1], window.selectedAirplane.destination[1]);

        window.globalMap!.setView([currentLat, currentLng], window.globalMap!.getZoom(), { animate: false });
        
        // Actualizar panel de progreso
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        if (progressBar && progressText) {
          const progressPercent = Math.round(progress * 100);
          progressBar.style.width = progressPercent + '%';
          progressText.textContent = progressPercent + '%';
        }
        
        requestAnimationFrame(trackAirplane);
      }

      window.trackAirplane = trackAirplane;

      function updatePointPosition() {
        const currentTime = performance.now();
        const elapsed = currentTime - animationStartTime;
        const progress = (elapsed % animationDuration) / animationDuration;

        airplanes.forEach((airplane) => {
          const currentLat = bezierPoint(progress, airplane.origin[0], airplane.controlPoint1[0], airplane.controlPoint2[0], airplane.destination[0]);
          const currentLng = bezierPoint(progress, airplane.origin[1], airplane.controlPoint1[1], airplane.controlPoint2[1], airplane.destination[1]);

          const pointCoords = map.latLngToLayerPoint([currentLat, currentLng]);
          const tangentLat = bezierTangent(progress, airplane.origin[0], airplane.controlPoint1[0], airplane.controlPoint2[0], airplane.destination[0]);
          const tangentLng = bezierTangent(progress, airplane.origin[1], airplane.controlPoint1[1], airplane.controlPoint2[1], airplane.destination[1]);

          const cosLat = Math.cos(currentLat * Math.PI / 180);
          const angle = Math.atan2(-tangentLat, tangentLng * cosLat) * (180 / Math.PI);

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

          airplane.airplaneGroup.setAttribute('transform', `translate(${pointCoords.x + margin},${pointCoords.y + margin}) rotate(${angle} 0 0)`);
        });
      }

      function animate() {
        updatePointPosition();
        requestAnimationFrame(animate);
      }

      map.on('move zoom moveend zoomend', updatePointPosition);
      animate();

      mapInstanceRef.current = map;

      return () => {
        map.remove();
      };
    })();
  }, []);

  useEffect(() => {
    function actualizarHoraSimulada() {
      const now = new Date();
      const horas = String(now.getHours()).padStart(2, '0');
      const minutos = String(now.getMinutes()).padStart(2, '0');
      const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
      const timeElem = document.getElementById('simulatedTime');
      if (timeElem) timeElem.textContent = `${horas}:${minutos} ${ampm}`;

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 4);

      const startStr = startDate.toLocaleString('es-ES', { day: '2-digit', month: 'short' });
      const endStr = endDate.toLocaleString('es-ES', { day: '2-digit', month: 'short' });

      const elapsedTime = Date.now() % (5 * 24 * 60 * 60 * 1000);
      const currentDay = Math.floor(elapsedTime / (24 * 60 * 60 * 1000)) + 1;

      const dateElem = document.getElementById('simulationDate');
      const dayElem = document.getElementById('currentDay');
      if (dateElem) dateElem.textContent = `${startStr} - ${endStr} 2026`;
      if (dayElem) dayElem.textContent = `${currentDay}`;
    }

    actualizarHoraSimulada();
    const interval = setInterval(actualizarHoraSimulada, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="main-wrapper">
      {/* Mapa principal */}
      <div className="card map-card" style={{ padding: 0, overflow: 'visible', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', margin: '0', borderRadius: 0, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />

        {/* Botón de desplazamiento al fondo - Centro inferior */}
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', zIndex: 999999 }}>
          <button 
            onClick={() => {
              const statsSection = document.getElementById('statsSection');
              if (statsSection) {
                statsSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            title="Ir a estadísticas"
            style={{
              background: 'var(--accent-blue)',
              border: 'none',
              color: 'white',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 4px 12px rgba(37, 100, 235, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.transform = 'translateX(-50%) scale(1.1)';
              (e.target as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(37, 100, 235, 0.5)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.transform = 'translateX(-50%) scale(1)';
              (e.target as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(37, 100, 235, 0.3)';
            }}
          >
            <img src="/down.svg" alt="Desplazarse" style={{ width: '28px', height: '28px' }} />
          </button>
        </div>

        {/* Wrapper para centrar el panel con flexbox */}
        <div style={{ position: 'absolute', top: '12px', left: '0', right: '0', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
          <div id="simuladorPanel" className="panel-control" style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
          <div style={{ pointerEvents: 'auto', maxWidth: '900px' }}>
            <div className="card" style={{ display: 'flex', gap: '14px', marginBottom: '0', padding: '10px 12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <h1 style={{ marginBottom: '0', fontSize: '20px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>⚙️ Simulador</h1>
                <div style={{ height: '20px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
              </div>
              <div style={{ display: 'flex', gap: '14px', flex: 1, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Estado</small>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'blink 1s infinite' }}></span>
                    En Ejecución
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Período</small>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', textShadow: '0 0 10px rgba(37, 100, 235, 0.3)' }} id="simulationDate">01 Abr - 05 Abr 2026</span>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px' }}>
                      <strong>Día <span id="currentDay">3</span>/5</strong>
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Hora</small>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', textShadow: '0 0 10px rgba(37, 100, 235, 0.3)', display: 'block', marginTop: '2px' }} id="simulatedTime">10:30 AM</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <button onClick={() => showNotification('Función en desarrollo', 'info')} className="btn btn-sm btn-secondary" title="Retroceder 1 hora" style={{ padding: '8px 10px', fontSize: '12px' }}>⏮️</button>
                <button onClick={() => showNotification('Función en desarrollo', 'info')} className="btn btn-sm btn-secondary" title="Pausar simulación" style={{ padding: '8px 10px', fontSize: '12px' }}>⏸️</button>
                <button onClick={() => showNotification('Función en desarrollo', 'info')} className="btn btn-sm btn-secondary" title="Avanzar 1 hora" style={{ padding: '8px 10px', fontSize: '12px' }}>⏭️</button>
                <button onClick={() => showNotification('Función en desarrollo', 'info')} className="btn btn-sm btn-primary" title="Acelerar 2x" style={{ padding: '8px 10px', fontSize: '12px' }}>⚡</button>
              </div>
              <style>{`
                @keyframes blink {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.3; }
                }
              `}</style>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Contenedor para estadísticas/eventos al fondo */}
      <div id="statsSection" style={{ paddingTop: '40px', paddingBottom: '40px', backgroundColor: 'white' }}>
        <div className="container">
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>Detalles de Simulación</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', padding: '12px' }}>
            <h3 style={{ fontSize: '13px', margin: '0 0 8px 0' }}>Maletas en Tránsito</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-blue)' }}>1,247</div>
            </div>
          </div>

          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', padding: '12px' }}>
            <h3 style={{ fontSize: '13px', margin: '0 0 8px 0' }}>Vuelos Activos</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-blue)' }}>34</div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: '12px' }}>
            <h3 style={{ fontSize: '13px', margin: '0 0 8px 0' }}>Vuelos Más Cargados</h3>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)' }}>12</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '-2px' }}>vuelos</div>
            <div style={{ marginTop: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span>NYC→LON</span>
                <span style={{ fontWeight: 600, color: '#f97316' }}>92%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span>LAX→TYO</span>
                <span style={{ fontWeight: 600, color: '#f97316' }}>88%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>LHR→SIN</span>
                <span style={{ fontWeight: 600, color: '#22c55e' }}>85%</span>
              </div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: '12px' }}>
            <h3 style={{ fontSize: '13px', margin: '0 0 8px 0' }}>Almacenes Saturados</h3>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)' }}>5</div>
            <div style={{ marginTop: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span>Miami</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>98%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span>Frankfurt</span>
                <span style={{ fontWeight: 600, color: '#ef4444' }}>96%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>Singapur</span>
                <span style={{ fontWeight: 600, color: '#f97316' }}>92%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Event Log & Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Event Log */}
          <div className="card">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', color: 'var(--text-primary)' }}>📋 Registro de Eventos (Últimas 24 horas)</h3>

            <div className="event-log" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>14:28</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Maleta <strong>#1042</strong> entregada en Frankfurt</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>14:15</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Vuelo cancelado: <strong>SNG→TOK</strong>, replanificando ruta</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:52</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Lote de 50 maletas llegó a Miami</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:30</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Almacén en Dubái alcanzando capacidad (85%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:12</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Vuelo <strong>TOK001</strong> desplegó con 320 maletas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:45</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Maleta <strong>#890</strong> llegó a São Paulo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:30</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Retraso detectado: Maleta <strong>#756</strong> puede perder plazo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:00</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Simulación iniciada: Período 5 días</span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="card">
            <h3 style={{ color: 'var(--accent-blue)', marginBottom: '16px' }}>ℹ️ Métricas de Rendimiento</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Tasa de Puntualidad</small>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-green)', marginTop: '8px' }}>98.3%</div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>↑ 2.1% respecto a ayer</small>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Ocupación Promedio</small>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning-amber)', marginTop: '8px' }}>72%</div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>En 7 almacenes activos</small>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Tiempo Promedio</small>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '8px' }}>18h 32m</div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Desde origen a destino</small>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Maletas Transitando</small>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '8px' }}>3,247</div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>A través de 12 rutas</small>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Modal de Detalles del Vuelo */}
      {selectedAirplane && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>✈️ Detalles del Vuelo</h2>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Código: <strong>{selectedAirplane.flightCode}</strong></p>
              </div>
              <button onClick={() => setSelectedAirplane(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Ruta</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedAirplane.routeName}
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Estado</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>
                  {selectedAirplane.status}
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Altitud</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {selectedAirplane.altitude.toLocaleString()} ft
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Velocidad</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {selectedAirplane.speed} km/h
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Maletas</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: '#f97316' }}>
                  {selectedAirplane.luggage}
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px' }}>Capacidad</small>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', fontWeight: 700, color: '#8b5cf6' }}>
                  {Math.round(selectedAirplane.capacity * 100)}%
                </p>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>📍 Coordenadas</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div>
                  <small style={{ fontWeight: 600 }}>Origen:</small><br />
                  {selectedAirplane.origin[0].toFixed(2)}, {selectedAirplane.origin[1].toFixed(2)}
                </div>
                <div>
                  <small style={{ fontWeight: 600 }}>Destino:</small><br />
                  {selectedAirplane.destination[0].toFixed(2)}, {selectedAirplane.destination[1].toFixed(2)}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setSelectedAirplane(null)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--accent-blue)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
