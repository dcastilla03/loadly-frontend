'use client';

import { useState } from 'react';

export default function GestionVuelos() {
  const [numVuelo, setNumVuelo] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [fechaLlegada, setFechaLlegada] = useState('');
  const [horaLlegada, setHoraLlegada] = useState('');
  const [capacidadVuelo, setCapacidadVuelo] = useState('');
  const [archivos, setArchivos] = useState<File | null>(null);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const [mostrarProgreso, setMostrarProgreso] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [nombreArchivo, setNombreArchivo] = useState('');

  const registrarPlanVuelo = () => {
    if (!numVuelo || !fechaSalida || !horaSalida || !fechaLlegada || !horaLlegada) {
      alert('❌ Por favor completa todos los campos requeridos');
      return;
    }
    alert(`✓ Plan de vuelo ${numVuelo} registrado exitosamente\n\nSalida: ${fechaSalida} ${horaSalida}\nLlegada: ${fechaLlegada} ${horaLlegada}`);
    setNumVuelo('');
    setFechaSalida('');
    setHoraSalida('');
    setFechaLlegada('');
    setHoraLlegada('');
    setCapacidadVuelo('');
  };

  const validarArchivo = (archivo: File) => {
    const extensionesValidas = ['xls', 'xlsx'];
    const extension = archivo.name.split('.').pop()?.toLowerCase();
    const tamanoMaximo = 5 * 1024 * 1024;

    if (!extension || !extensionesValidas.includes(extension)) {
      alert('❌ Formato no válido. Solo se aceptan .xls y .xlsx');
      limpiarCarga();
      return false;
    }

    if (archivo.size > tamanoMaximo) {
      alert('❌ Archivo muy grande. Máximo: 5MB');
      limpiarCarga();
      return false;
    }

    setArchivos(archivo);
    setMostrarInfo(true);
    setNombreArchivo(`${archivo.name} (${(archivo.size / 1024).toFixed(2)} KB)`);
    return true;
  };

  const procesarCargaMasiva = () => {
    if (!archivos) {
      alert('Selecciona un archivo primero');
      return;
    }

    setMostrarProgreso(true);
    let currentProgreso = 0;
    const intervalo = setInterval(() => {
      currentProgreso += Math.random() * 30;
      if (currentProgreso >= 100) currentProgreso = 100;

      setProgreso(Math.floor(currentProgreso));

      if (currentProgreso >= 100) {
        clearInterval(intervalo);
        setTimeout(() => {
          alert(`✓ Archivo procesado exitosamente. ${Math.floor(Math.random() * 50 + 10)} registros importados.`);
          limpiarCarga();
        }, 500);
      }
    }, 200);
  };

  const limpiarCarga = () => {
    setArchivos(null);
    setMostrarInfo(false);
    setMostrarProgreso(false);
    setProgreso(0);
    setNombreArchivo('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      validarArchivo(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="main-wrapper">
      <div className="container">
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '28px' }}>
            ✈️ Gestión de Vuelos
          </h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          
          {/* Plan de Vuelo */}
          <div className="card fade-in">
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              📋 Plan de Vuelo
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: 1.6 }}>
              Registra los detalles del vuelo para organizar y planificar el transporte de maletas.
            </p>

            <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="numVuelo">Número de Vuelo <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                <input
                  type="text"
                  id="numVuelo"
                  placeholder="Ej: AA123 o LAN456"
                  value={numVuelo}
                  onChange={(e) => setNumVuelo(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="fechaSalida">Fecha Salida <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input
                    type="date"
                    id="fechaSalida"
                    value={fechaSalida}
                    onChange={(e) => setFechaSalida(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="horaSalida">Hora Salida <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input
                    type="time"
                    id="horaSalida"
                    value={horaSalida}
                    onChange={(e) => setHoraSalida(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="fechaLlegada">Fecha Llegada <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input
                    type="date"
                    id="fechaLlegada"
                    value={fechaLlegada}
                    onChange={(e) => setFechaLlegada(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="horaLlegada">Hora Llegada <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input
                    type="time"
                    id="horaLlegada"
                    value={horaLlegada}
                    onChange={(e) => setHoraLlegada(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="capacidadVuelo">Capacidad Total del Vuelo</label>
                <input
                  type="number"
                  id="capacidadVuelo"
                  min="100"
                  max="500"
                  placeholder="Ej: 300"
                  step="10"
                  value={capacidadVuelo}
                  onChange={(e) => setCapacidadVuelo(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: 600 }}
                  onClick={() => {
                    setNumVuelo('');
                    setFechaSalida('');
                    setHoraSalida('');
                    setFechaLlegada('');
                    setHoraLlegada('');
                    setCapacidadVuelo('');
                  }}
                >
                  Limpiar Formulario
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: 600 }}
                  onClick={registrarPlanVuelo}
                >
                  ✓ Registrar Plan de Vuelo
                </button>
              </div>
            </form>
          </div>

          {/* Carga Masiva */}
          <div className="card fade-in">
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              📤 Carga Masiva de Datos
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: 1.6 }}>
              Sube un archivo Excel o XLSX con múltiples registros de maletas, vuelos o planes.
            </p>

            <div
              id="dropZone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById('fileInput')?.click()}
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backgroundColor: 'var(--bg-tertiary)',
                marginBottom: '20px'
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px', display: 'block' }}>📁</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px' }}>
                Arrastra tu archivo aquí
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                o haz clic para seleccionar
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Formatos: .xls, .xlsx  |  Máximo: 5MB
              </div>
              <input
                id="fileInput"
                type="file"
                accept=".xls,.xlsx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    validarArchivo(e.target.files[0]);
                  }
                }}
              />
            </div>

            {mostrarInfo && (
              <div style={{ padding: '14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', borderLeft: '3px solid var(--accent-blue)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Archivo seleccionado:
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                  {nombreArchivo}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: 600 }}
                onClick={limpiarCarga}
              >
                Cancelar Subida
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: 600 }}
                onClick={procesarCargaMasiva}
              >
                ↑ Procesar Archivo
              </button>
            </div>

            {mostrarProgreso && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Procesando...
                  </span>
                  <span id="porcentajeCarga" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success-green)' }}>
                    {progreso}%
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    id="barraProgreso"
                    style={{
                      width: `${progreso}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--success-green), #4caf50)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Información Importante */}
        <div className="card fade-in">
          <h3 style={{ color: 'var(--accent-blue)', marginBottom: '16px', fontSize: '16px' }}>ℹ️ Información sobre Vuelos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', fontSize: '13px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Datos Requeridos:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Número de vuelo único</li>
                <li>✓ Fecha y hora de salida</li>
                <li>✓ Fecha y hora de llegada</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Capacidades Estándar:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Vuelos domésticos: 150-250 maletas</li>
                <li>✓ Vuelos internacionales: 250-400 maletas</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Formatos Excel Aceptados:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ .xls (Excel 97-2003)</li>
                <li>✓ .xlsx (Excel 2007+)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
