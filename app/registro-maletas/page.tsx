'use client';

import { useState, useRef, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL;

interface Aerolinea {
  id: number;
  nombre: string;
}

interface Aeropuerto {
  idAeropuerto: number;
  codigo: string;
  ciudad: string;
  pais: string;
  abreviatura: string;
  continente: string;
  gmt: number;
}

interface EnvioDTO {
  idEnvio: string;
  fechaRegistro: string;
  fechaLimiteEntrega: string | null;
  idAeropuertoOrigen: number;
  idAeropuertoDestino: number;
  cantidadMaletas: number;
  clienteIdCliente: number;
  planificado: boolean;
  idArchivo: number | null;
}

export default function RegistroMaletas() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [aerolineas, setAerolineas] = useState<Aerolinea[]>([]);
  const [aeropuertos, setAeropuertos] = useState<Aeropuerto[]>([]);
  const [rol, setRol] = useState<string>('');
  const [aeropuertoUsuario, setAeropuertoUsuario] = useState<string>('');
  const [origen, setOrigen] = useState(0);
  const [destino, setDestino] = useState(0);
  const [aerolinea, setAerolinea] = useState(0);
  const [cantidad, setCantidad] = useState(0);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [envios, setEnvios] = useState<EnvioDTO[]>([]);
  const [gmtOffset, setGmtOffset] = useState(0); // offset del usuario (GMT del aeropuerto)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEnvios = async () => {
    try {
      const r = await fetch(`${API}/api/envios`);
      const data = await r.json();
      if (data.exito && Array.isArray(data.datos)) {
        setEnvios(data.datos);
      }
    } catch (e) {
      console.error('Error al cargar envíos:', e);
    }
  };

  useEffect(() => {
    fetchEnvios();
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        console.log('[RegistroMaletas] user desde localStorage:', user);
        setRol(user.rol || '');
        if (user.aeropuerto?.codigo) {
          setAeropuertoUsuario(user.aeropuerto.codigo);
        }
      } catch {}
    }

    fetch(`${API}/api/aerolineas-cliente`)
      .then(r => r.json())
      .then(data => { if (data.exito && Array.isArray(data.datos)) setAerolineas(data.datos); })
      .catch(() => console.error('Error al cargar aerolíneas'));

    fetch(`${API}/api/aeropuertos`)
      .then(r => r.json())
      .then(data => { if (data.exito && Array.isArray(data.datos)) setAeropuertos(data.datos); })
      .catch(() => console.error('Error al cargar aeropuertos'));

    fetchEnvios();
  }, []);

  const esAdmin = rol.toLowerCase() === 'administrador';

  // Para operador, pre-fijar origen con el ID de su aeropuerto
  useEffect(() => {
    if (!esAdmin && aeropuertoUsuario && aeropuertos.length > 0) {
      const apt = aeropuertos.find(a => a.codigo === aeropuertoUsuario);
      if (apt) setOrigen(apt.idAeropuerto);
    }
  }, [esAdmin, aeropuertoUsuario, aeropuertos]);

  // Obtener GMT del aeropuerto del usuario para enviar fecha local
  useEffect(() => {
    if (aeropuertoUsuario && aeropuertos.length > 0) {
      const apt = aeropuertos.find(a => a.codigo === aeropuertoUsuario);
      if (apt) setGmtOffset(apt.gmt);
    }
  }, [aeropuertoUsuario, aeropuertos]);

  const aeropuertosAgrupados = aeropuertos.reduce<Record<string, Aeropuerto[]>>((acc, a) => {
    const grupo = a.continente || 'Otros';
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(a);
    return acc;
  }, {});

  const handleFileSelect = (selectedFiles: FileList) => {
    setFiles(prev => [...prev, ...Array.from(selectedFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setMessage({ type: 'error', text: 'Selecciona al menos un archivo antes de subir.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const res = await fetch(`${API}/api/envios/cargar-carpeta`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Archivos subidos exitosamente.' });
        setFiles([]);
        fetchEnvios();
      } else {
        setMessage({ type: 'error', text: data.message || 'Error al subir archivos.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión con el servidor.' });
    } finally {
      setUploading(false);
    }
  };

  const handleRegistrarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!aerolinea) { setFormMsg({ type: 'error', text: 'Selecciona una aerolínea.' }); return; }
    if (!origen) { setFormMsg({ type: 'error', text: 'Selecciona un aeropuerto de origen.' }); return; }
    if (!destino) { setFormMsg({ type: 'error', text: 'Selecciona un aeropuerto de destino.' }); return; }
    if (origen === destino) { setFormMsg({ type: 'error', text: 'Origen y destino no pueden ser iguales.' }); return; }
    if (!cantidad || cantidad < 1) { setFormMsg({ type: 'error', text: 'Ingresa una cantidad válida de maletas.' }); return; }

    try {
      const params = new URLSearchParams();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      // Fecha local del usuario (GMT 0 + GMT offset del aeropuerto)
      // Ej: si GMT = -5 (Lima) y UTC son 18:30, se envía 13:30 del mismo día
      // Si el offset cruza la medianoche, el día se ajusta automáticamente
      const localNow = new Date(now.getTime() + gmtOffset * 3600000);
      const fechaLocal =
        `${localNow.getUTCFullYear()}-${pad(localNow.getUTCMonth() + 1)}-${pad(localNow.getUTCDate())}T${pad(localNow.getUTCHours())}:${pad(localNow.getUTCMinutes())}:${pad(localNow.getUTCSeconds())}`;
      // const fechaUTC =
      //   `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
      params.append('fechaRegistro', fechaLocal);
      params.append('idAeropuertoOrigen', String(origen));
      params.append('idAeropuertoDestino', String(destino));
      params.append('cantidadMaletas', String(cantidad));
      params.append('clienteIdCliente', String(aerolinea));

      const res = await fetch(`${API}/api/envios/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });

      const data = await res.json();
      if (res.ok && data.exito) {
        setFormMsg({ type: 'success', text: data.message || 'Envío registrado exitosamente.' });
        setAerolinea(0); setDestino(0); setCantidad(0);
        if (esAdmin) setOrigen(0);
        fetchEnvios();
      } else {
        setFormMsg({ type: 'error', text: data.message || 'Error al registrar envío.' });
      }
    } catch {
      setFormMsg({ type: 'error', text: 'Error de conexión con el servidor.' });
    }
  };

  return (
    <div className="main-wrapper">
      <div className="container">
        {/* Título Principal */}
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '28px' }}>
            📦 Registro de Envíos
          </h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
          {/* Formulario de Registro */}
          <div className="card fade-in">
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Formulario de Registro
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              Completa el siguiente formulario para registrar nuevos envíos en el sistema.
            </p>

            <form id="formRegistroMaletas" className="form-group" onSubmit={handleRegistrarEnvio}>
              <div className="form-row">
                <div>
                  <label htmlFor="aeroline">Aerolínea Cliente <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="aeroline" required value={aerolinea} onChange={e => setAerolinea(Number(e.target.value))}>
                    <option value={0}>Seleccionar aerolínea...</option>
                    {aerolineas.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="origen">Aeropuerto de Origen <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="origen" required disabled={!esAdmin} value={origen} onChange={e => setOrigen(Number(e.target.value))}>
                    {esAdmin ? (
                      <>
                        <option value={0}>Seleccionar origen...</option>
                        {Object.entries(aeropuertosAgrupados).map(([continente, lista]) => (
                          <optgroup key={continente} label={continente}>
                            {lista.map(a => (
                              <option key={a.idAeropuerto} value={a.idAeropuerto}>
                                {a.ciudad} ({a.codigo})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </>
                    ) : (
                      <>
                        <option value={origen}>
                          {aeropuertos.find(a => a.idAeropuerto === origen)
                            ? `${aeropuertos.find(a => a.idAeropuerto === origen)!.ciudad} (${aeropuertos.find(a => a.idAeropuerto === origen)!.codigo})`
                            : aeropuertoUsuario || 'Cargando...'}
                        </option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label htmlFor="destino">Aeropuerto de Destino <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="destino" required value={destino} onChange={e => setDestino(Number(e.target.value))}>
                    <option value={0}>Seleccionar destino...</option>
                    {Object.entries(aeropuertosAgrupados).map(([continente, lista]) => (
                      <optgroup key={continente} label={continente}>
                        {lista.map(a => (
                          <option key={a.idAeropuerto} value={a.idAeropuerto}>
                            {a.ciudad} ({a.codigo})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cantidad">Cantidad de Maletas <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input type="number" id="cantidad" min="1" max="400" step="1" placeholder="Ej: 50" required value={cantidad || ''} onChange={e => setCantidad(Number(e.target.value))} />
                </div>
              </div>

              {formMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                  fontSize: '13px', fontWeight: 500,
                  backgroundColor: formMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  color: formMsg.type === 'success' ? '#10b981' : '#ef4444',
                  border: `1px solid ${formMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {formMsg.type === 'success' ? '✓ ' : '✗ '} {formMsg.text}
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setAerolinea(0); if (esAdmin) setOrigen(0); setDestino(0); setCantidad(0); setFormMsg(null); }}>
                  Limpiar
                </button>
                <button type="submit" className="btn btn-primary">
                  ✓ Registrar Maletas
                </button>
              </div>
            </form>
          </div>

          {/* Carga de Archivos */}
          <div className="card fade-in">
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Carga de Archivos
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              Sube los archivos de texto (.txt) con la información de los envíos para que el algoritmo pueda procesarlos.
            </p>

            <div
              style={{
                border: dragging ? '2px dashed var(--primary-blue)' : '2px dashed var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: dragging ? 'rgba(59,130,246,0.05)' : 'transparent',
                marginBottom: '16px',
                maxHeight: '240px',
                overflowY: files.length > 0 ? 'auto' : 'hidden',
                boxSizing: 'border-box',
              }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files); }}
              />
              {files.length === 0 ? (
                <>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>📁</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
                    Arrastra y suelta tus archivos aquí, o <span style={{ color: 'var(--primary-blue)' }}>haz clic para seleccionarlos</span>
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Solo archivos .txt</p>
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', minWidth: 0 }}>
                  {files.map((file, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 10px', background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)',
                      overflow: 'hidden',
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontSize: '12px' }}>
                        📄 {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--danger-red)',
                          cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: '0 2px', lineHeight: 1, flexShrink: 0,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {message && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                fontSize: '13px', fontWeight: 500,
                backgroundColor: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: message.type === 'success' ? '#10b981' : '#ef4444',
                border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {message.type === 'success' ? '✓ ' : '✗ '} {message.text}
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setFiles([]); setMessage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={files.length === 0 || uploading}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={files.length === 0 || uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {uploading && (
                  <span style={{
                    display: 'inline-block', width: '16px', height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)', borderRadius: '50%',
                    borderTopColor: '#fff', animation: 'upload-spin 0.8s linear infinite',
                  }} />
                )}
                {uploading ? 'Subiendo archivos...' : '📤 Subir archivos'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabla Resumen */}
        <div className="card fade-in" style={{ marginTop: '32px', animationDelay: '0.1s' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--text-primary)' }}>Resumen de Registros</h2>

          <div className="table-wrapper">
            <table className="table-centered">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Aerolínea</th>
                  <th style={{ textAlign: 'center' }}>Origen</th>
                  <th style={{ textAlign: 'center' }}>Destino</th>
                  <th style={{ textAlign: 'center' }}>Cantidad</th>
                  <th style={{ textAlign: 'center' }}>Fecha de Registro</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {envios.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 14 }}>No hay envíos registrados aún.</td></tr>
                ) : (
                  envios.map(env => {
                    const aeroLinea = aerolineas.find(a => a.id === env.clienteIdCliente);
                    const aeroOrig = aeropuertos.find(a => a.idAeropuerto === env.idAeropuertoOrigen);
                    const aeroDest = aeropuertos.find(a => a.idAeropuerto === env.idAeropuertoDestino);
                    const fecha = env.fechaRegistro ? new Date(env.fechaRegistro).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                    return (
                      <tr key={env.idEnvio}>
                        <td style={{ textAlign: 'center' }}>{aeroLinea?.nombre || env.clienteIdCliente}</td>
                        <td style={{ textAlign: 'center' }}>{aeroOrig ? `${aeroOrig.ciudad} (${aeroOrig.codigo})` : env.idAeropuertoOrigen}</td>
                        <td style={{ textAlign: 'center' }}>{aeroDest ? `${aeroDest.ciudad} (${aeroDest.codigo})` : env.idAeropuertoDestino}</td>
                        <td style={{ textAlign: 'center' }}>{env.cantidadMaletas}</td>
                        <td style={{ textAlign: 'center' }}>{fecha}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: env.planificado ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: env.planificado ? '#10b981' : '#f59e0b' }}>
                            {env.planificado ? 'Planificado' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Estadísticas Rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '24px' }}>
            <div className="stat-card">
              <h3>Total Registrado</h3>
              <div className="value">{envios.length}</div>
            </div>
            <div className="stat-card">
              <h3>Últimas 24h</h3>
              <div className="value">{envios.filter(e => e.fechaRegistro && Date.now() - new Date(e.fechaRegistro).getTime() < 86400000).length}</div>
            </div>
            <div className="stat-card">
              <h3>Planificados</h3>
              <div className="value">{envios.filter(e => e.planificado).length}</div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes upload-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
