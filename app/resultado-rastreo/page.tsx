'use client';

export default function ResultadoRastreo() {
  return (
    <div className="main-wrapper">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '40px', marginTop: '20px' }}>
          <div style={{ fontSize: '64px', fontWeight: '700', color: 'var(--accent-blue)', textShadow: '0 0 20px rgba(66, 150, 249, 0.3)', marginBottom: '8px' }}>
            📦 01042
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Detalles del viaje de su maleta</p>
        </div>

        <div className="card fade-in" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Aerolínea</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>LATAM Airlines</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Aeropuerto Origen</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Jorge Chávez (Lima)</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Aeropuerto Destino</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Narita (Tokio)</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Tipo de Ruta</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Multi-continente</p>
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Progreso del Viaje</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
              {[
                { city: 'Lima', code: 'LIM', status: 'completed' },
                { city: 'Miami', code: 'MIA', status: 'completed' },
                { city: 'São Paulo', code: 'GIG', status: 'completed' },
                { city: 'Frankfurt', code: 'FRA', status: 'completed' },
                { city: 'Dubái', code: 'DXB', status: 'completed' },
                { city: 'Singapur', code: 'SIN', status: 'current' },
                { city: 'Bangkok', code: 'BKK', status: 'pending' },
                { city: 'Tokio', code: 'NRT', status: 'pending' }
              ].map((node, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: node.status === 'completed' ? 'var(--success-green)' : node.status === 'current' ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    border: node.status === 'current' ? '3px solid var(--accent-blue)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: node.status === 'completed' ? 'white' : node.status === 'current' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    fontWeight: '700',
                    fontSize: '20px',
                    marginBottom: '8px'
                  }}>
                    {node.status === 'completed' ? '✓' : node.status === 'current' ? '✈️' : node.code.charAt(0)}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>{node.code}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '4px solid var(--accent-blue)' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>📍 Ubicación Actual</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-blue)' }}>Dubái</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '4px solid var(--warning-orange)' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>🕐 Hora Estimada de Llegada</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--warning-orange)' }}>29-Mar 11:55 PM</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '4px solid var(--info-purple)' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>⏱️ Tiempo hasta Entrega</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--info-purple)' }}>34 horas</p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '4px solid var(--success-green)' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>✓ Estado de Envío</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--success-green)' }}>61% completado</p>
            </div>
          </div>

          <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>📋 Historial de Eventos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { time: '28-Mar 02:30 PM', icon: '📦', msg: 'Maleta registrada en Jorge Chávez, Lima' },
              { time: '28-Mar 03:45 PM', icon: '✈️', msg: 'Salida de vuelo LA502 hacia Miami' },
              { time: '28-Mar 08:20 PM', icon: '🛬', msg: 'Llegada a Miami Internacional' },
              { time: '28-Mar 10:15 PM', icon: '🔄', msg: 'Transferencia a vuelo AA1204 hacia São Paulo' },
              { time: '29-Mar 01:30 AM', icon: '🛬', msg: 'Llegada a São Paulo - Galeão' },
              { time: '29-Mar 05:00 AM', icon: '📦', msg: 'Procesamiento en el almacén SP-02' },
              { time: '29-Mar 09:20 AM', icon: '✈️', msg: 'Salida en vuelo AF1450 hacia Frankfurt' },
              { time: '29-Mar 06:50 PM', icon: '🛬', msg: 'Llegada a Frankfurt' },
              { time: '29-Mar 09:15 PM', icon: '🔄', msg: 'Conexión con vuelo EK0012 hacia Dubái' },
              { time: '29-Mar 10:40 PM', icon: '✈️', msg: 'Salida rumbo a Dubái' },
              { time: '30-Mar 10:15 AM', icon: '🛬', msg: 'Llegada a Dubái - En tránsito' }
            ].map((evt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '20px', minWidth: '24px' }}>{evt.icon}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>{evt.time}</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{evt.msg}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '2px solid var(--border-color)' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>📊 Análisis de Desempeño</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Tiempo Total Planificado</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--accent-blue)' }}>48 h</p>
              </div>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Tiempo Transcurrido</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--info-purple)' }}>30 h</p>
              </div>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Paradas Completadas</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success-green)' }}>4/7</p>
              </div>
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Incidencias</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--warning-orange)' }}>1 retraso</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
