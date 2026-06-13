'use client';

export default function RegistroMaletas() {

  return (
    <div className="main-wrapper">
      <div className="container">
        {/* Título Principal */}
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '28px' }}>
            📦 Registro de Envíos
          </h1>
        </div>

        {/* Formulario de Registro */}
        <div className="card fade-in" style={{ marginBottom: '32px' }}>
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
              <div className="value" id="totalMaletas">0</div>
            </div>
            <div className="stat-card">
              <h3>Últimas 24h</h3>
              <div className="value" id="ultimas24h">0</div>
            </div>
            <div className="stat-card">
              <h3>En Procesamiento</h3>
              <div className="value">0</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
