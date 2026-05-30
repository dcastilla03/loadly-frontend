'use client';

import { useState, useRef, useEffect } from 'react';

interface MessageState {
  type: 'error' | 'success' | 'info' | 'warning' | null;
  text: string;
}

export default function RegistroMaletas() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedTxtFiles, setUploadedTxtFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>({ type: null, text: '' });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Limpiar mensaje después de 5 segundos
  useEffect(() => {
    if (message.type) {
      const timer = setTimeout(() => {
        setMessage({ type: null, text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const txtFiles = Array.from(files).filter(file => file.name.endsWith('.txt'));
    const nonTxtFiles = Array.from(files).length - txtFiles.length;
    
    if (txtFiles.length === 0) {
      setMessage({ type: 'error', text: 'Solo se aceptan archivos .txt' });
      return;
    }
    
    if (nonTxtFiles > 0) {
      setMessage({ type: 'warning', text: `Se ignoraron ${nonTxtFiles} archivos que no son .txt` });
    }
    
    setSelectedFiles(txtFiles);
    setMessage({ type: 'info', text: `${txtFiles.length} archivo${txtFiles.length === 1 ? '' : 's'} seleccionado${txtFiles.length === 1 ? '' : 's'}` });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancel = () => {
    setSelectedFiles([]);
    setMessage({ type: null, text: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Por favor selecciona archivos o carpeta' });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      console.log('[DEBUG] Iniciando carga de', selectedFiles.length, 'archivos');
      console.log('[DEBUG] Tamaño total:', (selectedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2), 'MB');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/envios/cargar-carpeta`, {
        method: 'POST',
        body: formData,
      });

      console.log('[DEBUG] Status:', response.status, response.statusText);

      const responseText = await response.text();
      console.log('[DEBUG] Response body:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`No se pudo parsear respuesta JSON. Status: ${response.status} - ${responseText.substring(0, 200)}`);
      }

      if (response.ok && data.exito) {
        setMessage({ type: 'success', text: data.mensaje || `${selectedFiles.length} archivo${selectedFiles.length === 1 ? '' : 's'} cargado${selectedFiles.length === 1 ? '' : 's'} exitosamente` });
        setUploadedTxtFiles(prev => {
          const next = [...prev];
          selectedFiles.forEach(file => {
            if (!next.includes(file.name)) {
              next.push(file.name);
            }
          });
          return next;
        });
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setMessage({ type: 'error', text: data.mensaje || `Error ${response.status}: ${responseText.substring(0, 100)}` });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[ERROR] Upload failed:', errorMsg);
      setMessage({ type: 'error', text: `Error: ${errorMsg}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUploadedTxtFile = (fileName: string) => {
    setUploadedTxtFiles(prev => prev.filter(name => name !== fileName));
  };

  const getMessageColor = () => {
    switch (message.type) {
      case 'error':
        return 'var(--danger-red)';
      case 'success':
        return 'var(--success-green)';
      case 'warning':
        return 'var(--warning-orange)';
      case 'info':
        return 'var(--accent-blue)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getMessageBg = () => {
    switch (message.type) {
      case 'error':
        return 'rgba(220, 38, 38, 0.1)';
      case 'success':
        return 'rgba(34, 197, 94, 0.1)';
      case 'warning':
        return 'rgba(234, 179, 8, 0.1)';
      case 'info':
        return 'rgba(59, 130, 246, 0.1)';
      default:
        return 'transparent';
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

        {/* Grid de dos columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px', alignItems: 'stretch' }}>
          
          {/* Formulario de Registro */}
          <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              📋 Formulario de Registro
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              Completa el siguiente formulario para registrar nuevos envíos en el sistema.
            </p>

            {/* Formulario de Registro */}
            <form id="formRegistroMaletas" className="form-group">
              <div className="form-row">
                <div>
                  <label htmlFor="aeroline">Aerolínea Cliente <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="aeroline" required>
                    <option value="">Seleccionar aerolínea...</option>
                    <option value="LATAM Airlines">LATAM Airlines</option>
                    <option value="Aeromexico">Aeromexico</option>
                    <option value="United Airlines">United Airlines</option>
                    <option value="Lufthansa">Lufthansa</option>
                    <option value="Singapore Airlines">Singapore Airlines</option>
                    <option value="Emirates">Emirates</option>
                    <option value="Air France">Air France</option>
                    <option value="British Airways">British Airways</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="origen">Aeropuerto de Origen <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="origen" required>
                    <option value="">Seleccionar origen...</option>
                    <optgroup label="América">
                      <option value="Lima (Jorge Chávez)">Lima (Jorge Chávez)</option>
                      <option value="Miami (MIA)">Miami (MIA)</option>
                      <option value="São Paulo (GIG)">São Paulo (GIG)</option>
                      <option value="Ciudad de México (MEX)">Ciudad de México (MEX)</option>
                      <option value="Nueva York (JFK)">Nueva York (JFK)</option>
                      <option value="Atlanta (ATL)">Atlanta (ATL)</option>
                    </optgroup>
                    <optgroup label="Europa">
                      <option value="Frankfurt (FRA)">Frankfurt (FRA)</option>
                      <option value="Madrid (MAD)">Madrid (MAD)</option>
                      <option value="Londres (LHR)">Londres (LHR)</option>
                      <option value="París (CDG)">París (CDG)</option>
                      <option value="Ámsterdam (AMS)">Ámsterdam (AMS)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Tokio (NRT)">Tokio (NRT)</option>
                      <option value="Singapur (SIN)">Singapur (SIN)</option>
                      <option value="Hong Kong (HKG)">Hong Kong (HKG)</option>
                      <option value="Dubái (DXB)">Dubái (DXB)</option>
                      <option value="Bangkok (BKK)">Bangkok (BKK)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label htmlFor="destino">Aeropuerto de Destino <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <select id="destino" required>
                    <option value="">Seleccionar destino...</option>
                    <optgroup label="América">
                      <option value="Lima (Jorge Chávez)">Lima (Jorge Chávez)</option>
                      <option value="Miami (MIA)">Miami (MIA)</option>
                      <option value="São Paulo (GIG)">São Paulo (GIG)</option>
                      <option value="Ciudad de México (MEX)">Ciudad de México (MEX)</option>
                      <option value="Nueva York (JFK)">Nueva York (JFK)</option>
                      <option value="Atlanta (ATL)">Atlanta (ATL)</option>
                    </optgroup>
                    <optgroup label="Europa">
                      <option value="Frankfurt (FRA)">Frankfurt (FRA)</option>
                      <option value="Madrid (MAD)">Madrid (MAD)</option>
                      <option value="Londres (LHR)">Londres (LHR)</option>
                      <option value="París (CDG)">París (CDG)</option>
                      <option value="Ámsterdam (AMS)">Ámsterdam (AMS)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Tokio (NRT)">Tokio (NRT)</option>
                      <option value="Singapur (SIN)">Singapur (SIN)</option>
                      <option value="Hong Kong (HKG)">Hong Kong (HKG)</option>
                      <option value="Dubái (DXB)">Dubái (DXB)</option>
                      <option value="Bangkok (BKK)">Bangkok (BKK)</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label htmlFor="cantidad">Cantidad de Maletas <span style={{ color: 'var(--danger-red)' }}>*</span></label>
                  <input type="number" id="cantidad" min="1" max="400" step="1" placeholder="Ej: 50" required />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { const form = document.getElementById('formRegistroMaletas') as HTMLFormElement; form.reset(); }}>
                  Limpiar
                </button>
                <button type="submit" className="btn btn-primary">
                  ✓ Registrar Maletas
                </button>
              </div>
            </form>
          </div>

          {/* Carga Masiva de Maletas */}
          <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              📤 Carga Masiva de Envíos
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              Sube archivos .txt con múltiples registros de envíos para importarlos en lote desde la carpeta de envíos.
            </p>

            <form id="formCargaMasivaMaletas" className="form-group" onSubmit={(e) => { e.preventDefault(); }}>
              {/* Área de drag & drop */}
              <div 
                ref={dropZoneRef}
                onClick={handleDropZoneClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  borderRadius: '8px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backgroundColor: dragOver ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  marginBottom: '20px'
                }}>
                <div style={{ fontSize: '40px', marginBottom: '12px', display: 'block' }}>
                  {loading ? '⏳' : '📂'}
                </div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px' }}>
                  {loading ? 'Cargando archivos...' : 'Arrastra carpeta o archivos aquí'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  {loading ? 'Por favor espera...' : 'o haz clic para seleccionar'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Formato: Carpeta o archivos .txt  |  Múltiples archivos
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  id="archivoMaletas" 
                  accept=".txt" 
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                  disabled={loading}
                  multiple
                  {...({ webkitdirectory: true } as any)}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div style={{ padding: '14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', borderLeft: '3px solid var(--accent-blue)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Archivos seleccionados: <strong>{selectedFiles.length}</strong>
                  </div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} style={{ fontSize: '12px', color: 'var(--text-primary)', paddingBottom: '6px', borderBottom: idx < selectedFiles.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                        • {file.name}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    Total: {(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2)} KB
                  </div>
                </div>
              )}

              {message.type && (
                <div style={{ 
                  padding: '12px 14px', 
                  backgroundColor: getMessageBg(), 
                  borderRadius: '8px', 
                  marginBottom: '16px', 
                  borderLeft: '3px solid ' + getMessageColor(),
                  fontSize: '13px',
                  color: getMessageColor()
                }}>
                  {message.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '600' }}
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '600' }}
                  onClick={handleUpload}
                  disabled={loading || selectedFiles.length === 0}
                >
                  {loading ? '⏳ Procesando...' : `↑ Procesar ${selectedFiles.length} Archivo${selectedFiles.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* TXT Subidos en Memoria */}
        <div className="card fade-in" style={{ marginTop: '32px', animationDelay: '0.05s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', color: 'var(--text-primary)' }}>Archivos de envío</h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Archivos .txt cargados por la importación masiva en esta sesión.
              </p>
            </div>
          </div>

          {uploadedTxtFiles.length > 0 ? (
            <div style={{ display: 'grid', gap: '8px', maxHeight: '210px', overflowY: 'auto', paddingRight: '4px' }}>
              {uploadedTxtFiles.map((fileName, idx) => (
                <div
                  key={`${fileName}-${idx}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <img src="/txt.png" alt="TXT" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Archivo cargado por carga masiva</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveUploadedTxtFile(fileName)}
                    aria-label={`Eliminar ${fileName}`}
                    title="Eliminar de memoria"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: '2px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      borderRadius: '6px',
                      opacity: 0.35
                    }}
                  >
                    <img src="/basura.png" alt="Eliminar" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              Todavía no hay archivos cargados por la importación masiva.
            </p>
          )}
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
              <tbody id="maletasRegistrosTabla" />
            </table>
          </div>

          {/* Estadísticas Rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '24px' }}>
            <div className="stat-card">
              <h3>Total Registrado</h3>
              <div className="value" id="totalMaletas">1,240</div>
            </div>
            <div className="stat-card">
              <h3>Últimas 24h</h3>
              <div className="value" id="ultimas24h">830</div>
            </div>
            <div className="stat-card">
              <h3>En Procesamiento</h3>
              <div className="value">142</div>
            </div>
          </div>
        </div>

        {/* Sección de Ayuda */}
        <div className="card fade-in" style={{ marginTop: '32px', animationDelay: '0.2s', borderLeft: '4px solid var(--accent-blue)' }}>
          <h3 style={{ color: 'var(--accent-blue)', marginBottom: '12px' }}>ℹ️ Información Importante</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Plazos de Entrega:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Mismo continente: 1 día</li>
                <li>✓ Diferente continente: 2 días</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Carga Masiva:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Formato: Archivos .txt</li>
                <li>✓ Ubicación: /Data/envios/</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Almacenamiento:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Capacidad aeropuerto: 500-800 maletas</li>
                <li>✓ Simulación automática disponible</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
