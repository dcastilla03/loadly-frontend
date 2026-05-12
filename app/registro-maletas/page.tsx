'use client';

export default function RegistroMaletas() {
  return (
    <div className="main-wrapper">
      <div className="container">
        {/* Título Principal */}
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '28px' }}>
            📦 Registro de Maletas
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
              Completa el siguiente formulario para registrar nuevas maletas en el sistema.
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
              📤 Carga Masiva de Maletas
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              Sube un archivo Excel o XLSX con múltiples registros de maletas para importarlos en lote.
            </p>

            <form id="formCargaMasivaMaletas" className="form-group">
              {/* Área de drag & drop */}
              <div id="dropZoneMaletas" style={{
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backgroundColor: 'var(--bg-tertiary)',
                marginBottom: '20px'
              }} 
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}>
                <div style={{ fontSize: '40px', marginBottom: '12px', display: 'block' }}>📁</div>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px' }}>
                  Arrastra tu archivo aquí
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  o haz clic para seleccionar
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Formatos: .xls, .xlsx  |  Máximo: 5MB
                </div>
                <input type="file" id="archivoMaletas" accept=".xls,.xlsx" style={{ display: 'none' }} />
              </div>

              <div id="infoArchivoMaletas" style={{ display: 'none', padding: '14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', borderLeft: '3px solid var(--accent-blue)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Archivo seleccionado:
                </div>
                <div id="nombreArchivoMaletas" style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}></div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                  ↑ Procesar Archivo
                </button>
              </div>
            </form>
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
              <tbody id="maletasRegistrosTabla">
                <tr>
                  <td style={{ textAlign: 'center' }}>LATAM Airlines</td>
                  <td style={{ textAlign: 'center' }}>Lima (JCH)</td>
                  <td style={{ textAlign: 'center' }}>Tokio (NRT)</td>
                  <td style={{ textAlign: 'center' }}>85</td>
                  <td style={{ textAlign: 'center' }}>23-Abr-2026 14:32</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>Aeromexico</td>
                  <td style={{ textAlign: 'center' }}>Ciudad de México (MEX)</td>
                  <td style={{ textAlign: 'center' }}>Frankfurt (FRA)</td>
                  <td style={{ textAlign: 'center' }}>120</td>
                  <td style={{ textAlign: 'center' }}>23-Abr-2026 12:15</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>United Airlines</td>
                  <td style={{ textAlign: 'center' }}>Nueva York (JFK)</td>
                  <td style={{ textAlign: 'center' }}>Miami (MIA)</td>
                  <td style={{ textAlign: 'center' }}>95</td>
                  <td style={{ textAlign: 'center' }}>23-Abr-2026 11:45</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>Lufthansa</td>
                  <td style={{ textAlign: 'center' }}>Madrid (MAD)</td>
                  <td style={{ textAlign: 'center' }}>Dubái (DXB)</td>
                  <td style={{ textAlign: 'center' }}>110</td>
                  <td style={{ textAlign: 'center' }}>23-Abr-2026 10:20</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>Singapore Airlines</td>
                  <td style={{ textAlign: 'center' }}>Singapur (SIN)</td>
                  <td style={{ textAlign: 'center' }}>Bangkok (BKK)</td>
                  <td style={{ textAlign: 'center' }}>75</td>
                  <td style={{ textAlign: 'center' }}>23-Abr-2026 09:30</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>Emirates</td>
                  <td style={{ textAlign: 'center' }}>Dubái (DXB)</td>
                  <td style={{ textAlign: 'center' }}>Londres (LHR)</td>
                  <td style={{ textAlign: 'center' }}>130</td>
                  <td style={{ textAlign: 'center' }}>22-Abr-2026 16:45</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>Air France</td>
                  <td style={{ textAlign: 'center' }}>París (CDG)</td>
                  <td style={{ textAlign: 'center' }}>Ámsterdam (AMS)</td>
                  <td style={{ textAlign: 'center' }}>65</td>
                  <td style={{ textAlign: 'center' }}>22-Abr-2026 14:10</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>British Airways</td>
                  <td style={{ textAlign: 'center' }}>Londres (LHR)</td>
                  <td style={{ textAlign: 'center' }}>Hong Kong (HKG)</td>
                  <td style={{ textAlign: 'center' }}>150</td>
                  <td style={{ textAlign: 'center' }}>22-Abr-2026 13:25</td>
                  <td style={{ textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Editar"><img src="/editar.png" alt="Editar" style={{ width: '20px', height: '20px', filter: 'invert(40%) sepia(96%) saturate(1214%) hue-rotate(181deg) brightness(105%)' }} /></button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Eliminar"><img src="/basura.png" alt="Eliminar" style={{ width: '20px', height: '20px', filter: 'invert(30%) sepia(80%) saturate(2000%) hue-rotate(350deg)' }} /></button>
                  </td>
                </tr>
              </tbody>
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
              <strong style={{ color: 'var(--text-primary)' }}>Límite de Capacidad:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '16px' }}>
                <li>✓ Min/Max por vuelo: 150-250 (continente)</li>
                <li>✓ Min/Max por vuelo: 150-400 (mundial)</li>
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
