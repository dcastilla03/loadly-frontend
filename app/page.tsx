'use client';

import { useEffect } from 'react';

export default function Home() {
  // Las funciones globales se definen en layout.tsx, no necesitamos redefinirlas aquí
  
  return (
    <div className="main-wrapper">
      <div className="container">
        {/* Sección Hero */}
        <div className="card fade-in">
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>
            ✈️ Bienvenido a Loadly
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.8', marginBottom: '24px' }}>
            Sistema integral de gestión de equipajes para transporte aéreo internacional. Usa el menú lateral para acceder a las funcionalidades disponibles.
          </p>
          
          {/* Botón Nueva Simulación */}
          <div style={{ marginBottom: '28px' }}>
          </div>
        </div>

        

        {/* Información Rápida */}
        <div className="card fade-in" style={{ marginTop: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
            ℹ️ Información del Sistema
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Cobertura Global:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ América</li>
                <li>✓ Europa</li>
                <li>✓ Asia</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Plazos de Entrega:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Mismo continente: 1 día</li>
                <li>✓ Diferente continente: 2 días</li>
                <li>✓ Traslado local: 0.5-1 día</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Capacidades:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Vuelos continental: 150-250 maletas</li>
                <li>✓ Vuelos intercontinental: 250-400 maletas</li>
                <li>✓ Almacenes: 500-800 maletas</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
