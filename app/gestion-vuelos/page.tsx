'use client';

import { useState, useEffect } from 'react';

interface PlanVuelo {
  idPlanVuelo: number;
  idAeropuertoOrigen: number;
  idAeropuertoDestino: number;
  horaSalida: string;
  horaLlegada: string;
  capacidad: number;
  cancelado: boolean;
}

interface Aeropuerto {
  idAeropuerto: number;
  codigo: string;
  ciudad: string;
}


export default function GestionVuelos() {
  const [planesVuelo, setPlanesVuelo] = useState<PlanVuelo[]>([]);
  const [aeropuertos, setAeropuertos] = useState<Map<number, Aeropuerto>>(new Map());
  const [cargandoPlanesVuelo, setCargandoPlanesVuelo] = useState(true);
  const [showFormCargaMasiva, setShowFormCargaMasiva] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [mensajeCarga, setMensajeCarga] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'success' | 'error'>('success');
  const [cargando, setCargando] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Cargar planes de vuelo y aeropuertos al montar
  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setCargandoPlanesVuelo(true);
      const [planesRes, aeropuertosRes] = await Promise.all([
        fetch(`${API_URL}/api/planes-vuelo`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        }),
        fetch(`${API_URL}/api/aeropuertos`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })
      ]);

      const planesData = await planesRes.json();
      const aeropuertosData = await aeropuertosRes.json();

      if (planesData.exito && planesData.datos) {
        setPlanesVuelo(planesData.datos);
      }

      if (aeropuertosData.exito && aeropuertosData.datos) {
        const mapa = new Map();
        aeropuertosData.datos.forEach((aero: Aeropuerto) => {
          mapa.set(aero.idAeropuerto, aero);
        });
        setAeropuertos(mapa);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setCargandoPlanesVuelo(false);
    }
  };

  const handleArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (!archivo.name.endsWith('.txt')) {
      setTipoMensaje('error');
      setMensajeCarga('❌ El archivo debe ser de tipo .txt');
      return;
    }

    setArchivoSeleccionado(archivo);
    setMensajeCarga('');
  };

  const procesarCargaMasiva = async () => {
    if (!archivoSeleccionado) {
      setTipoMensaje('error');
      setMensajeCarga('❌ Por favor selecciona un archivo');
      return;
    }

    setCargando(true);
    setMensajeCarga('');

    try {
      const formDataEnvio = new FormData();
      formDataEnvio.append('file', archivoSeleccionado);

      const response = await fetch(`${API_URL}/api/planes-vuelo/cargar-masiva`, {
        method: 'POST',
        body: formDataEnvio,
        cache: 'no-store'
      });

      const data = await response.json();

      if (response.ok && data.exito) {
        setTipoMensaje('success');
        setMensajeCarga(`✓ ${data.mensaje}`);
        setArchivoSeleccionado(null);

        // Limpiar input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Recargar planes
        await cargarDatos();

        // Cerrar modal después de 2 segundos
        setTimeout(() => {
          setShowFormCargaMasiva(false);
          setMensajeCarga('');
        }, 2000);
      } else {
        setTipoMensaje('error');
        setMensajeCarga(`❌ ${data.mensaje || 'Error al procesar el archivo'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setTipoMensaje('error');
      setMensajeCarga('❌ Error de conexión con el servidor');
    } finally {
      setCargando(false);
    }
  };

  const obtenerCodigoAeropuerto = (idAeropuerto: number) => {
    return aeropuertos.get(idAeropuerto)?.codigo || '???';
  };

  const estadisticas = {
    total: planesVuelo.length,
    capacidadPromedio: planesVuelo.length > 0 ? Math.round(planesVuelo.reduce((sum, p) => sum + p.capacidad, 0) / planesVuelo.length) : 0,
    capacidadTotal: planesVuelo.reduce((sum, p) => sum + p.capacidad, 0),
    cancelados: planesVuelo.filter(p => p.cancelado).length
  };

  return (
    <div className="main-wrapper">
      <div className="container">
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '12px' }}>✈️ Gestión de Vuelos</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Administra planes de vuelo y carga de datos masiva</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Total Planes</h3>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{estadisticas.total}</div>
          </div>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Capacidad Promedio</h3>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{estadisticas.capacidadPromedio}</div>
          </div>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Capacidad Total</h3>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{estadisticas.capacidadTotal}</div>
          </div>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Cancelados</h3>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--danger-red)' }}>{estadisticas.cancelados}</div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowFormCargaMasiva(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--accent-blue)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            📤 Cargar Masiva
          </button>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>Listado de Planes de Vuelo</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Origen</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Destino</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Salida</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Llegada</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Capacidad</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cargandoPlanesVuelo ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '20px', textAlign: 'center' }}>
                      ⏳ Cargando planes de vuelo...
                    </td>
                  </tr>
                ) : planesVuelo.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      📭 No hay planes de vuelo registrados
                    </td>
                  </tr>
                ) : (
                  planesVuelo.map((plan, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px' }}>{plan.idPlanVuelo}</td>
                      <td style={{ padding: '12px' }}>{obtenerCodigoAeropuerto(plan.idAeropuertoOrigen)}</td>
                      <td style={{ padding: '12px' }}>{obtenerCodigoAeropuerto(plan.idAeropuertoDestino)}</td>
                      <td style={{ padding: '12px' }}>{plan.horaSalida}</td>
                      <td style={{ padding: '12px' }}>{plan.horaLlegada}</td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{plan.capacidad}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          backgroundColor: plan.cancelado ? 'rgba(220, 53, 69, 0.1)' : 'rgba(40, 167, 69, 0.1)',
                          color: plan.cancelado ? 'var(--danger-red)' : 'var(--success-green)'
                        }}>
                          {plan.cancelado ? '❌ Cancelado' : '✓ Activo'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showFormCargaMasiva && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ maxWidth: '500px', width: '90%', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700 }}>📤 Cargar Planes de Vuelo</h2>
              <button
                onClick={() => {
                  setShowFormCargaMasiva(false);
                  setMensajeCarga('');
                  setArchivoSeleccionado(null);
                }}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              ℹ️ Carga múltiples planes de vuelo desde un archivo TXT con el formato especificado.
            </p>

            <div
              onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement | null)?.click()}
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
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
              <div>{archivoSeleccionado ? `✓ ${archivoSeleccionado.name}` : 'Haz clic o arrastra un archivo .txt'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>Máximo 10MB</div>
              <input
                type="file"
                accept=".txt"
                onChange={handleArchivoSeleccionado}
                style={{ display: 'none' }}
              />
            </div>

            {mensajeCarga && (
              <div style={{
                padding: '12px',
                marginBottom: '20px',
                borderRadius: '6px',
                backgroundColor: tipoMensaje === 'success' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                color: tipoMensaje === 'success' ? 'var(--success-green)' : 'var(--danger-red)',
                fontSize: '14px'
              }}>
                {mensajeCarga}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowFormCargaMasiva(false);
                  setMensajeCarga('');
                  setArchivoSeleccionado(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancelar
              </button>
              <button
                onClick={procesarCargaMasiva}
                disabled={!archivoSeleccionado || cargando}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: archivoSeleccionado && !cargando ? 'var(--accent-blue)' : 'var(--text-muted)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: archivoSeleccionado && !cargando ? 'pointer' : 'not-allowed',
                  fontWeight: 600
                }}
              >
                {cargando ? '⏳ Procesando...' : '✅ Procesar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
