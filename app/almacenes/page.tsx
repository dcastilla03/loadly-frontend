'use client';

import { useState } from 'react';

export default function Almacenes() {
  const [showFormAgregar, setShowFormAgregar] = useState(false);
  const [showFormCargaMasiva, setShowFormCargaMasiva] = useState(false);
  const [formData, setFormData] = useState({ codigo: '', ciudad: '', pais: '', capacidad: '', gmt: '' });

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
                {[
                  ['01', 'SKBO', 'Bogotá', 'Colombia', '580', '-5'],
                  ['02', 'SEQM', 'Quito', 'Ecuador', '560', '-5'],
                  ['03', 'SVMI', 'Caracas', 'Venezuela', '550', '-4'],
                  ['04', 'SBBR', 'Brasilia', 'Brasil', '630', '-3'],
                  ['05', 'SPIM', 'Lima', 'Perú', '590', '-5'],
                  ['06', 'SLLP', 'La Paz', 'Bolivia', '570', '-4'],
                  ['07', 'SCEL', 'Santiago de Chile', 'Chile', '610', '-3'],
                  ['08', 'SABE', 'Buenos Aires', 'Argentina', '610', '-3']
                ].map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td><strong>{row[1]}</strong></td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                    <td>{row[4]}</td>
                    <td>{row[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '24px' }}>
            <div className="stat-card">
              <h3>Total Almacenes</h3>
              <div className="value" style={{ fontSize: '32px' }}>25</div>
            </div>
            <div className="stat-card">
              <h3>Capacidad Promedio</h3>
              <div className="value" style={{ fontSize: '32px' }}>650 maletas</div>
            </div>
            <div className="stat-card">
              <h3>Regiones</h3>
              <div className="value" style={{ fontSize: '32px' }}>3</div>
            </div>
            <div className="stat-card">
              <h3>Ocupación Promedio</h3>
              <div className="value" style={{ fontSize: '32px' }}>72%</div>
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
              <h2 className="modal-title">📤 Cargar Almacenes</h2>
              <button className="modal-close" onClick={() => setShowFormCargaMasiva(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Carga múltiples almacenes mediante CSV con las columnas: ID,Código IATA,Ciudad,País,Capacidad,GMT</p>
              <input type="file" accept=".csv" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }} />
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowFormCargaMasiva(false)} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { alert('✓ Archivo procesado'); setShowFormCargaMasiva(false); }} style={{ flex: 1 }}>Procesar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
