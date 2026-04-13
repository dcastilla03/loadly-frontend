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
  { name: 'São Paulo → Dubái', origin: [-23.55, -46.63], destination: [25.25, 55.27], color: '#2564eb' },
  { name: 'Miami → Bangkok', origin: [25.76, -80.19], destination: [13.73, 100.49], color: '#10b981' },
  { name: 'Miami → Tokio', origin: [25.76, -80.19], destination: [35.68, 139.65], color: '#f97316' }
];

export default function Rastreo() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [maletCode, setMaletCode] = useState('');

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
          currentLng: origin[1]
        };

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
    })();
  }, []);

  const buscarMaleta = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const searchInput = document.getElementById('suitcaseSearchInput') as HTMLInputElement;
    const codigo = searchInput?.value.trim().toUpperCase() || '';

    if (!codigo) {
      showNotification('Por favor ingresa un ID de maleta', 'warning');
      return;
    }

    if (window.globalAirplanes && window.globalAirplanes.length > 0) {
      const randomAirplaneIndex = Math.floor(Math.random() * window.globalAirplanes.length);
      const selectedAirplane = window.globalAirplanes[randomAirplaneIndex];
      window.selectedAirplane = selectedAirplane;

      if (window.globalBezierPoint && window.globalMap && window.globalAnimationStartTime && window.globalAnimationDuration) {
        const currentTime = performance.now();
        const elapsed = currentTime - window.globalAnimationStartTime;
        const progress = (elapsed % window.globalAnimationDuration) / window.globalAnimationDuration;

        const currentLat = window.globalBezierPoint(progress, selectedAirplane.origin[0], selectedAirplane.controlPoint1[0], selectedAirplane.controlPoint2[0], selectedAirplane.destination[0]);
        const currentLng = window.globalBezierPoint(progress, selectedAirplane.origin[1], selectedAirplane.controlPoint1[1], selectedAirplane.controlPoint2[1], selectedAirplane.destination[1]);

        window.globalMap.flyTo([currentLat, currentLng], 5, { duration: 1500 });

        setTimeout(() => {
          window.trackingActive = true;
          window.trackAirplane!();
        }, 1500);
      }
    }

    setMaletCode(codigo);
    setShowDetails(true);
    showNotification('✓ Maleta encontrada: ' + codigo, 'success');
    
    // Desplazar a la sección de detalles
    setTimeout(() => {
      const detalleSection = document.getElementById('detallesMaletaSection');
      if (detalleSection) {
        detalleSection.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="main-wrapper">
      {/* Mapa principal */}
      <div className="card map-card" style={{ padding: 0, overflow: 'visible', minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%', margin: '0', borderRadius: 0, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '100vh' }} />

        {/* Wrapper para centrar el panel de búsqueda con flexbox */}
        <div style={{ position: 'absolute', top: '12px', left: '0', right: '0', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
          <div className="panel-search" style={{ pointerEvents: 'auto', padding: '8px 12px' }}>
            <div style={{ pointerEvents: 'auto' }}>
              <div className="card" style={{ display: 'flex', gap: '12px', marginBottom: '0', padding: '12px 16px', alignItems: 'center', justifyContent: 'center', minWidth: '500px' }}>
                <input
                  type="text"
                  id="suitcaseSearchInput"
                  placeholder="Ingresa el ID de la maleta (ej: MAL-01042)"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    transition: 'all 0.3s ease'
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && buscarMaleta()}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-blue)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 100, 235, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button 
                  onClick={() => buscarMaleta()} 
                  style={{
                    padding: '12px 28px',
                    backgroundColor: 'var(--accent-blue)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '14px',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1d4ed8';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(37, 100, 235, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent-blue)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Buscar Maleta
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor para detalles de maleta */}
      <div id="detallesMaletaSection" className="container">
        {showDetails && (
          <>
            <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', marginTop: '24px', color: 'var(--text-primary)' }}>📦 Detalle de Maleta</h2>
            {/* Sección de Detalles de Maleta */}
            <div style={{ background: '#f1f5fb', border: '1px solid #e0e7ff', borderRadius: '12px', padding: '24px', marginTop: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Código de Maleta */}
                <div>
                  <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Código de Maleta</small>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                    <span style={{ fontSize: '28px' }}>📦</span>
                    <div style={{ color: '#2564eb', fontWeight: 700, fontSize: '28px' }}>MAL-{maletCode || '01042'}</div>
                  </div>
                </div>

                {/* Información */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }}>
                  <div>
                    <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aerolínea</small>
                    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, marginTop: '8px' }}>LATAM Airlines</div>
                  </div>
                  <div>
                    <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aeropuerto Origen</small>
                    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, marginTop: '8px' }}>Lima (LIM)</div>
                  </div>
                  <div>
                    <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aeropuerto Destino</small>
                    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, marginTop: '8px' }}>Tokio (NRT)</div>
                  </div>
                  <div>
                    <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tipo de Ruta</small>
                    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, marginTop: '8px' }}>Multi-continente</div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e0e7ff' }}>
                <small style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '28px' }}>Ruta Planificada</small>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', position: 'relative' }}>
                  {['Lima', 'Bogotá', 'Miami', 'Frankfurt', 'Dubai', 'Bangkok', 'Singapur', 'Tokio'].map((city, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '22px',
                          flexShrink: 0,
                          transition: 'all 0.3s ease',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                          cursor: 'pointer',
                          background: idx < 5 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#f1f5fb',
                          color: idx < 5 ? 'white' : '#64748b',
                          border: idx >= 5 ? '2px solid #e0e7ff' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.08)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                        }}
                      >
                        {idx < 5 ? '✓' : idx + 1}
                      </div>
                      <small style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600, textAlign: 'center', maxWidth: '70px', lineHeight: 1.3 }}>{city}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Status Cards Section */}
            <div style={{ marginTop: '40px', paddingTop: '0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {/* Card 1: Current Location */}
                <div style={{ background: 'white', border: '1px solid #e0e7ff', borderRadius: '10px', padding: '18px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', position: 'absolute', top: '12px', left: '12px', background: '#ef4444' }}></div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '20px' }}>Ubicación Actual</div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', color: '#1e293b', fontWeight: 700, marginBottom: '4px' }}>Dubai (DXB)</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>Almacén - Custodia de carga</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>Estado</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: '#ef4444' }}></span>
                    En tránsito local
                  </div>
                </div>

                {/* Card 2: Delivery Deadline */}
                <div style={{ background: 'white', border: '1px solid #e0e7ff', borderRadius: '10px', padding: '18px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', position: 'absolute', top: '12px', left: '12px', background: '#10b981' }}></div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '20px' }}>Plazo de Entrega</div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', color: '#1e293b', fontWeight: 700, marginBottom: '4px' }}>29-Mar-2026</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>11:55 PM</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>Entrega</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: '#10b981' }}></span>
                    A tiempo
                  </div>
                </div>

                {/* Card 3: Remaining Time */}
                <div style={{ background: 'white', border: '1px solid #e0e7ff', borderRadius: '10px', padding: '18px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', position: 'absolute', top: '12px', left: '12px', background: '#10b981' }}></div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '20px' }}>Tiempo Restante</div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', color: '#1e293b', fontWeight: 700, marginBottom: '4px' }}>34 horas</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>29-Mar-2026 11:55 PM</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>Estado</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: '#10b981' }}></span>
                    A tiempo
                  </div>
                </div>

                {/* Card 4: General Status */}
                <div style={{ background: 'white', border: '1px solid #e0e7ff', borderRadius: '10px', padding: '18px', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e7ff'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', position: 'absolute', top: '12px', left: '12px', background: '#f59e0b' }}></div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', marginLeft: '20px' }}>Estado</div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '16px', color: '#1e293b', fontWeight: 700, marginBottom: '4px' }}>Retrasado</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>2 horas</div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>Problema</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', background: '#f59e0b' }}></span>
                    Desvío en Dubai
                  </div>
                </div>
              </div>
            </div>

            {/* Event History Section */}
            <div style={{ marginTop: '40px', padding: '24px', background: '#f1f5fb', border: '1px solid #e0e7ff', borderRadius: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '24px' }}>Historial de Eventos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { time: '14:28', title: 'Maleta #1042 entregada en Frankfurt', location: 'Frankfurt', status: 'completed' },
                  { time: '14:15', title: 'Vuelo cancelado: SNG→TOK, replanificando ruta', location: 'Singapur - Tokio', status: 'pending' },
                  { time: '13:52', title: 'Lote de 50 maletas llegó a Miami', location: 'Miami', status: 'completed' },
                  { time: '13:30', title: 'Almacén en Dubái alcanzando capacidad (85%)', location: 'Dubai', status: 'pending' },
                  { time: '13:12', title: 'Vuelo TOK001 desplegó con 320 maletas', location: 'Tokio', status: 'completed' },
                  { time: '12:45', title: 'Maleta #890 llegó a São Paulo', location: 'São Paulo', status: 'completed' },
                  { time: '12:30', title: 'Retraso detectado: Maleta #756 puede perder plazo', location: 'En tránsito', status: 'error' },
                  { time: '12:00', title: 'Simulación iniciada: Período 5 días', location: 'Sistema', status: 'completed' }
                ].map((event, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px', padding: '16px', background: 'white', borderLeft: `4px solid ${event.status === 'completed' ? '#10b981' : event.status === 'pending' ? '#f59e0b' : '#ef4444'}`, borderRadius: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2564eb' }}>{event.time}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{event.title}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{event.location}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
