'use client';

import React, { ReactNode, useState } from 'react';
import './globals.css';
import { Sidebar } from '../components/Sidebar';

declare global {
  interface Window {
    cerrarSesion: () => void;
    cerrarModal: (id: string) => void;
    abrirModalSimulacion: () => void;
  }
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [showModal, setShowModal] = useState(false);

  React.useEffect(() => {
    window.cerrarSesion = () => {
      alert('Cerrando sesión...');
    };
    
    window.cerrarModal = (id: string) => {
      if (id === 'modalOverlay') {
        setShowModal(false);
        // Reset wizard state when modal is closed
        setWizardStep(1);
        setSelectedType(null);
        setDuration(5);
      }
    };

    window.abrirModalSimulacion = () => {
      setShowModal(true);
    };
  }, []);

  // Wizard handlers
  const handleNextStep = () => {
    if (selectedType === 'Periodo') {
      // Para Período, mostrar paso de duración
      if (wizardStep < 3) {
        setWizardStep(wizardStep + 1);
      }
    } else if (selectedType === 'DiaDia' || selectedType === 'Colapso') {
      // Para Día a Día y Colapso, saltar directamente a confirmación
      setWizardStep(3);
    }
  };

  const handlePrevStep = () => {
    if (wizardStep === 3 && (selectedType === 'DiaDia' || selectedType === 'Colapso')) {
      // Si es Día a Día o Colapso, volver al paso 1
      setWizardStep(1);
    } else if (wizardStep > 1) {
      // En otros casos, volver un paso atrás
      setWizardStep(wizardStep - 1);
    }
  };

  const handleSelectType = (type: string) => {
    setSelectedType(type);
  };

  const handleStartSimulation = () => {
    const typeNames: { [key: string]: string } = {
      'Periodo': '📅 Simulación de Período',
      'DiaDia': '⏱️ Operación Día a Día',
      'Colapso': '💥 Simulación hasta el Colapso'
    };
    alert(`¡Simulación iniciada!\n\nTipo: ${typeNames[selectedType!]}\nDuración: ${duration} días`);
    setShowModal(false);
    setWizardStep(1);
    setSelectedType(null);
    setDuration(5);
  };

  const handleConfirmStep = () => {
    if (wizardStep === 1 && selectedType) {
      handleNextStep();
    } else if (wizardStep === 2) {
      handleNextStep();
    } else if (wizardStep === 3) {
      handleStartSimulation();
    }
  };

  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Sidebar />

        {/* Contenido Principal */}
        {children}

        {/* Modal del Wizard de Simulación */}
        <div 
          id="modalOverlay" 
          className="modal-overlay" 
          style={{ display: showModal ? 'flex' : 'none' }}
        >
          <div className="modal" style={{ maxWidth: '700px' }}>
            {/* Modal Header */}
            <div className="modal-header">
              <h2 className="modal-title">⚙️ Nueva Simulación</h2>
              <button 
                className="modal-close" 
                onClick={() => window.cerrarModal('modalOverlay')}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Indicador de Pasos del Wizard */}
              <div className="wizard-steps">
                <div className={`step ${wizardStep === 1 ? 'active' : wizardStep > 1 ? 'completed' : ''}`}>
                  <div className="step-number">1</div>
                  <div className="step-label">Tipo de Simulación</div>
                </div>
                {selectedType === 'Periodo' && (
                  <div className={`step ${wizardStep === 2 ? 'active' : wizardStep > 2 ? 'completed' : ''}`}>
                    <div className="step-number">2</div>
                    <div className="step-label">Duración</div>
                  </div>
                )}
                <div className={`step ${wizardStep === 3 ? 'active' : wizardStep > 3 ? 'completed' : selectedType && wizardStep > 1 ? 'completed' : ''}`}>
                  <div className="step-number">{selectedType === 'Periodo' ? '3' : '2'}</div>
                  <div className="step-label">Confirmación</div>
                </div>
              </div>

              {/* STEP 1: Tipo de Simulación */}
              {wizardStep === 1 && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    Simulaciones
                  </h3>

                  <div className="selectable-cards" style={{ gridTemplateColumns: '1fr', marginBottom: '32px' }}>
                    <div 
                      className={`selectable-card ${selectedType === 'Periodo' ? 'selected' : ''}`}
                      onClick={() => handleSelectType('Periodo')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="checkmark">✓</div>
                      <h3>📅 Simulación de Período</h3>
                      <p>Simula 3, 5 o 7 días de operaciones con planificación automática y replanificación.</p>
                    </div>

                    <div 
                      className={`selectable-card ${selectedType === 'Colapso' ? 'selected' : ''}`}
                      onClick={() => handleSelectType('Colapso')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="checkmark">✓</div>
                      <h3>💥 Simulación hasta el Colapso</h3>
                      <p>Ejecuta hasta incumplir un plazo. Identifica límites operacionales del sistema.</p>
                    </div>
                  </div>

                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    Operaciones
                  </h3>

                  <div className="selectable-cards" style={{ gridTemplateColumns: '1fr' }}>
                    <div 
                      className={`selectable-card ${selectedType === 'DiaDia' ? 'selected' : ''}`}
                      onClick={() => handleSelectType('DiaDia')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="checkmark">✓</div>
                      <h3>⏱️ Operación Día a Día</h3>
                      <p>Monitoreo en tiempo real de las operaciones actuales del sistema.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Configuración de Duración */}
              {wizardStep === 2 && selectedType === 'Periodo' && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '28px', fontSize: '16px' }}>
                    Duración del Período
                  </h3>

                  <div className="slider-container">
                    <input 
                      type="range" 
                      id="duracion" 
                      min="3" 
                      max="7" 
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                      step="1" 
                    />
                    <span className="slider-value" id="duracionDisplay">{duration}</span>
                  </div>
                </div>
              )}

              {/* STEP 3: Confirmación */}
              {wizardStep === 3 && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    ✓ Resumen de Configuración
                  </h3>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                      <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tipo de Simulación</small>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '600', marginTop: '4px' }}>
                        {selectedType === 'Periodo' ? '📅 Simulación de Período' : selectedType === 'DiaDia' ? '⏱️ Operación Día a Día' : selectedType === 'Colapso' ? '💥 Simulación hasta el Colapso' : '-'}
                      </div>
                    </div>

                    {selectedType === 'Periodo' && (
                      <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                        <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Duración</small>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '600', marginTop: '4px' }}>
                          {duration} días
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-green)', borderRadius: '8px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      ✓ La configuración está lista. Haz clic en <strong>"Iniciar Simulación"</strong> para comenzar el proceso.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button 
                id="btnAnterior" 
                className="btn btn-secondary" 
                onClick={handlePrevStep}
                style={{ display: wizardStep === 1 ? 'none' : 'block' }}
              >
                ← Anterior
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => window.cerrarModal('modalOverlay')}
              >
                Cancelar
              </button>
              <button 
                id="btnSiguiente" 
                className="btn btn-primary"
                onClick={handleConfirmStep}
                disabled={wizardStep === 1 && !selectedType}
              >
                {wizardStep === 3 ? 'Iniciar Simulación' : 'Siguiente →'}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
