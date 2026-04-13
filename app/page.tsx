'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    abrirModalSimulacion: () => void;
    cerrarModal: (id: string) => void;
  }
}

export default function Home() {
  useEffect(() => {
    // Funciones globales para el modal
    window.abrirModalSimulacion = () => {
      const modal = document.getElementById('modalOverlay');
      if (modal) modal.style.display = 'flex';
    };

    window.cerrarModal = (id: string) => {
      const modal = document.getElementById(id);
      if (modal) modal.style.display = 'none';
    };
  }, []);

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
            <button className="btn btn-primary" onClick={() => window.abrirModalSimulacion()}>
              ⚙️ Nueva Simulación
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <a href="/registro-maletas" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-color)' }} onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; }} onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Registrar Maletas</div>
              </div>
            </a>
            <a href="/simulador" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-color)' }} onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; }} onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺️</div>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Simulador</div>
              </div>
            </a>
            <a href="/rastreo" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-color)' }} onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; }} onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Rastreo</div>
              </div>
            </a>
            <a href="/gestion-vuelos" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-color)' }} onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; }} onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✈️</div>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Gestión de Vuelos</div>
              </div>
            </a>
          </div>
        </div>

        {/* Estadísticas Rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginTop: '50px', marginBottom: '40px' }}>
          <div className="stat-card">
            <h3>Maletas en Sistema</h3>
            <div className="value">2,458</div>
          </div>
          <div className="stat-card">
            <h3>Vuelos Activos</h3>
            <div className="value">42</div>
          </div>
          <div className="stat-card">
            <h3>Almacenes</h3>
            <div className="value">15</div>
          </div>
          <div className="stat-card">
            <h3>Puntualidad</h3>
            <div className="value">98.5%</div>
          </div>
        </div>

        {/* Información Rápida */}
        <div className="card fade-in">
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--text-primary)' }}>
            ℹ️ Información del Sistema
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Cobertura Global:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ América: Lima, Miami, São Paulo, México, NY, Atlanta</li>
                <li>✓ Europa: Frankfurt, Madrid, Londres, París, Ámsterdam</li>
                <li>✓ Asia: Tokio, Singapur, Hong Kong, Dubái, Bangkok</li>
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
