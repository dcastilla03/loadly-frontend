'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    globalMap?: any;
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

export default function SimulacionColapso() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [collapsePoint, setCollapsePoint] = useState<{ location: string; reason: string; time: string } | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

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

      // Marcar punto de colapso
      L.circleMarker([25.76, -80.19], {
        radius: 20,
        fillColor: '#ef4444',
        color: '#dc2626',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.5
      }).addTo(map).bindPopup('<b>🔴 Punto de Colapso</b><br>Almacén Miami saturado');

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
      mapInstanceRef.current = map;

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
          routeColor: route.color,
          currentLat: origin[0],
          currentLng: origin[1]
        };

        airplanes.push(airplane);
      });

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
    })();

    setCollapsePoint({
      location: 'Miami (MIA)',
      reason: 'Almacén saturado - Capacidad 800 maletas, 850 en stock',
      time: 'Día 3, 14:35 hrs'
    });
  }, []);

  return (
    <div className="main-wrapper">
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

        {/* Panel de Alerta - Centro superior */}
        <div style={{ position: 'absolute', top: '12px', left: '0', right: '0', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
          <div style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
            <div className="card" style={{ display: 'flex', gap: '14px', marginBottom: '0', padding: '10px 12px', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid #ef4444' }}>
              <h1 style={{ marginBottom: '0', fontSize: '20px', color: '#ef4444', whiteSpace: 'nowrap' }}>💥 Simulación de Colapso</h1>
              <div style={{ height: '20px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Estado</small>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#fee2e2', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#dc2626', marginTop: '2px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'blink 0.5s infinite' }}></span>
                    COLAPSO DETECTADO
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Ubicación</small>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>Miami (MIA)</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <small style={{ color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '10px' }}>Tiempo</small>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>3d 14:35</div>
                </div>
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

        {/* Panel de Análisis - Centro */}
        <div style={{ position: 'absolute', bottom: '35%', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '500px', backgroundColor: 'rgba(255, 255, 255, 0.98)', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)', pointerEvents: 'auto', zIndex: 999998, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px' }}>🔴 Análisis del Colapso</div>
          
          <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Causa Principal</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Almacén saturado en Miami</div>
          </div>

          <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Capacidad vs Demanda</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
              <div style={{ padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Capacidad Máxima</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)' }}>800</div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fee2e2', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Maletas en Stock</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>850</div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Tiempo hasta Colapso</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Día 3, Hora 14:35</div>
          </div>
        </div>
      </div>

      {/* Reporte Detallado */}
      <div id="statsSection" style={{ paddingTop: '40px', paddingBottom: '40px', backgroundColor: 'white' }}>
        <div className="container">
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#dc2626' }}>🔍 Reporte del Colapso Logístico</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px' }}>⚠️ Punto de Fallo</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Almacén Miami</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>Capacidad: 800 maletas</div>
                <div>Stock Actual: 850 maletas</div>
                <div>Exceso: 50 maletas (+6.25%)</div>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px' }}>📅 Cuándo Ocurre</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Período: Día 3</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>Hora: 14:35 hrs</div>
                <div>Tiempo de llegada al colapso: ~86 horas</div>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px' }}>📊 Impacto</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Crítico</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>Maletas sin procesar: 50</div>
                <div>Plazos incumplidos: Múltiples</div>
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '12px' }}>💡 Recomendación</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Aumentar Capacidad</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>Incrementar: +100 maletas</div>
                <div>Nueva Capacidad: 900 maletas</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>📈 Evolución del Stock en Miami</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {['Día 1', 'Día 2', 'Día 3'].map((day, idx) => (
                <div key={idx} style={{ padding: '12px', backgroundColor: idx === 2 ? '#fee2e2' : 'var(--bg-tertiary)', borderRadius: '6px', borderLeft: `3px solid ${idx === 2 ? '#ef4444' : '#22c55e'}` }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: idx === 2 ? '#dc2626' : 'var(--text-secondary)', marginBottom: '8px' }}>{day}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: idx === 2 ? '#ef4444' : 'var(--accent-blue)' }}>
                    {idx === 0 ? '450' : idx === 1 ? '650' : '850'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Capacidad: 800
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event Log & Performance Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
            {/* Event Log */}
            <div className="card">
              <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>📋 Registro de Eventos (Últimas 24 horas)</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>14:35</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}><strong>COLAPSO DETECTADO</strong> en Miami</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>14:28</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Almacén saturado: Capacidad 850/800</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:52</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Lote de 50 maletas llegó a Miami</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:30</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Almacén Miami alcanzando capacidad (80%)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>13:12</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Vuelo <strong>TOK001</strong> desplegó con 320 maletas</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:45</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Maleta <strong>#890</strong> llegó a São Paulo</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:30</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Retraso detectado: Maleta <strong>#756</strong> puede perder plazo</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', minWidth: '50px' }}>12:00</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }}></span>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Simulación colapso iniciada</span>
                </div>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="card">
              <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)' }}>ℹ️ Métricas de Rendimiento</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                  <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Estado del Sistema</small>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '8px' }}>COLAPSO</div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>Crítico - Requerida intervención</small>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                  <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Tiempo hasta Colapso</small>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '8px' }}>3d 14:35</div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>Desde inicio de simulación</small>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                  <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Maletas Afectadas</small>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '8px' }}>850</div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>Sobre capacidad de 800</small>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                  <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, fontSize: '11px' }}>Incumplimiento</small>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '8px' }}>50+</div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginTop: '4px' }}>Entregas perdidas</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
