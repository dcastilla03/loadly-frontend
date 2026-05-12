'use client';

import { useState, useEffect } from 'react';

interface Aeropuerto {
  idAeropuerto: number;
  codigo: string;
  ciudad: string;
  pais: string;
  abreviatura: string;
  gmt: number;
  capacidad: number;
  latitud: number;
  longitud: number;
  continente: string;
}

export default function Almacenes() {
  const [showFormAgregar, setShowFormAgregar] = useState(false);
  const [showFormCargaMasiva, setShowFormCargaMasiva] = useState(false);
  const [formData, setFormData] = useState({ codigo: '', ciudad: '', pais: '', capacidad: '', gmt: '' });
  const [cargando, setCargando] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [mensajeCarga, setMensajeCarga] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'success' | 'error'>('success');
  const [aeropuertos, setAeropuertos] = useState<Aeropuerto[]>([]);
  const [cargandoAeropuertos, setCargandoAeropuertos] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  // Cargar aeropuertos al montar el componente
  useEffect(() => {
    cargarAeropuertos();
  }, []);

  const cargarAeropuertos = async () => {
    try {
      setCargandoAeropuertos(true);
      const response = await fetch(`${API_URL}/api/aeropuertos`, {
        cache: 'no-store', // Desactiva caché de Next.js
        headers: { 'Cache-Control': 'no-cache' } // Desactiva caché del navegador
      });
      const data = await response.json();
      
      // Backend devuelve 'exito' y 'datos' no 'success' y 'data'
      if (data.exito && data.datos) {
        setAeropuertos(data.datos);
      }
    } catch (error) {
      console.error('Error al cargar aeropuertos:', error);
    } finally {
      setCargandoAeropuertos(false);
    }
  };

  const agregarAlmacen = () => {
    if (!formData.codigo || !formData.ciudad || !formData.pais || !formData.capacidad || !formData.gmt) {
      alert('⚠️ Por favor completa todos los campos requeridos');
      return;
    }
    const cap = parseInt(formData.capacidad);
    if (cap < 500 || cap > 800) {
      alert('⚠️ La capacidad debe estar entre 500 y 800 maletas');
      return;
    }
    alert(`✓ Almacén agregado:\n${formData.codigo} - ${formData.ciudad}, ${formData.pais}\nCapacidad Máxima: ${cap} maletas | GMT: ${formData.gmt}`);
    setShowFormAgregar(false);
    setFormData({ codigo: '', ciudad: '', pais: '', capacidad: '', gmt: '' });
  };

  const handleArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const archivo = files[0];
      if (!archivo.name.endsWith('.txt')) {
        setTipoMensaje('error');
        setMensajeCarga('❌ Por favor selecciona un archivo .txt');
        setTimeout(() => setMensajeCarga(''), 3000);
        return;
      }
      setArchivoSeleccionado(archivo);
      setMensajeCarga('');
    }
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

      const response = await fetch(`${API_URL}/api/aeropuertos/cargar-masiva`, {
        method: 'POST',
        body: formDataEnvio,
        cache: 'no-store'
      });

      const data = await response.json();

      // Backend devuelve 'exito' no 'success'
      if (response.ok && data.exito) {
        setTipoMensaje('success');
        setMensajeCarga(`✓ ${data.mensaje}`);
        setArchivoSeleccionado(null);
        
        // Limpiar input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        
        // Recargar aeropuertos
        await cargarAeropuertos();
        
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

  return (
    <div className="main-wrapper">
      <div className="container">
        <h1>🏭 Almacenes</h1>
        <p>Gestión de almacenes y centros de distribución</p>
        
        <div className="card fade-in" style={{ marginTop: '32px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--text-primary)' }}>Listado de Almacenes Disponibles</h2>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button className="btn btn-primary" onClick={() => setShowFormAgregar(true)}>
              <span style={{ fontSize: '16px', marginRight: '8px' }}>➕</span>Agregar Almacén
            </button>
            <button className="btn btn-primary" onClick={() => setShowFormCargaMasiva(true)}>
              <span style={{ fontSize: '16px', marginRight: '8px' }}>📤</span>Cargar Masiva
            </button>
          </div>
          
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Código IATA</th>
                  <th>Ciudad</th>
                  <th>País</th>
                  <th>Capacidad</th>
                  <th>GMT</th>
                </tr>
              </thead>
              <tbody>
                {cargandoAeropuertos ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                      ⏳ Cargando aeropuertos...
                    </td>
                  </tr>
                ) : aeropuertos.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                      📭 No hay aeropuertos registrados
                    </td>
                  </tr>
                ) : (
                  aeropuertos.map((aero) => (
                    <tr key={aero.idAeropuerto}>
                      <td>{aero.idAeropuerto}</td>
                      <td><strong>{aero.codigo}</strong></td>
                      <td>{aero.ciudad}</td>
                      <td>{aero.pais}</td>
                      <td>{aero.capacidad}</td>
                      <td>{aero.gmt > 0 ? '+' : ''}{aero.gmt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '24px' }}>
            <div className="stat-card">
              <h3>Total Almacenes</h3>
              <div className="value" style={{ fontSize: '32px' }}>{aeropuertos.length}</div>
            </div>
            <div className="stat-card">
              <h3>Capacidad Promedio</h3>
              <div className="value" style={{ fontSize: '32px' }}>
                {aeropuertos.length > 0 
                  ? Math.round(aeropuertos.reduce((sum, a) => sum + a.capacidad, 0) / aeropuertos.length)
                  : 0}
              </div>
            </div>
            <div className="stat-card">
              <h3>Regiones</h3>
              <div className="value" style={{ fontSize: '32px' }}>
                {new Set(aeropuertos.map(a => a.continente)).size}
              </div>
            </div>
            <div className="stat-card">
              <h3>Capacidad Total</h3>
              <div className="value" style={{ fontSize: '32px' }}>
                {aeropuertos.reduce((sum, a) => sum + a.capacidad, 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Agregar */}
      {showFormAgregar && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowFormAgregar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">➕ Agregar Almacén</h2>
              <button className="modal-close" onClick={() => setShowFormAgregar(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input placeholder="Código IATA" value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
              <input placeholder="Ciudad" value={formData.ciudad} onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
              <input placeholder="País" value={formData.pais} onChange={(e) => setFormData({ ...formData, pais: e.target.value })} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
              <input type="number" placeholder="Capacidad (500-800)" value={formData.capacidad} onChange={(e) => setFormData({ ...formData, capacidad: e.target.value })} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
              <input type="number" placeholder="GMT" value={formData.gmt} onChange={(e) => setFormData({ ...formData, gmt: e.target.value })} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowFormAgregar(false)} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn btn-primary" onClick={agregarAlmacen} style={{ flex: 1 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Carga Masiva */}
      {showFormCargaMasiva && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowFormCargaMasiva(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📤 Cargar Aeropuertos</h2>
              <button className="modal-close" onClick={() => setShowFormCargaMasiva(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '14px' }}>
                ℹ️ Carga múltiples aeropuertos desde un archivo TXT con el formato especificado.
              </p>
              
              <label style={{ display: 'block' }}>
                <div style={{ 
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--surface-secondary)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    {archivoSeleccionado ? `✓ ${archivoSeleccionado.name}` : 'Haz clic o arrastra un archivo .txt'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Máximo 10MB
                  </div>
                </div>
                <input 
                  type="file" 
                  accept=".txt" 
                  onChange={handleArchivoSeleccionado}
                  style={{ display: 'none' }} 
                />
              </label>

              {mensajeCarga && (
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: tipoMensaje === 'success' ? '#10b98166' : '#f8717166',
                  color: tipoMensaje === 'success' ? '#059669' : '#d32f2f',
                  fontSize: '14px',
                  fontWeight: 500
                }}>
                  {mensajeCarga}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowFormCargaMasiva(false);
                  setMensajeCarga('');
                  setArchivoSeleccionado(null);
                }} 
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={procesarCargaMasiva}
                disabled={!archivoSeleccionado || cargando}
                style={{ flex: 1, opacity: (!archivoSeleccionado || cargando) ? 0.6 : 1, cursor: (!archivoSeleccionado || cargando) ? 'not-allowed' : 'pointer' }}
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
