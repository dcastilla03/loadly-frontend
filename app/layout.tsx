'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '../components/Sidebar';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { SimulationProvider } from './SimulationContext';

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
  const router = useRouter();
  const pathname = usePathname();
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('00:00');
  const [showModal, setShowModal] = useState(false);
  const previousPathnameRef = React.useRef<string>('');

  // Cerrar la modal solo cuando realmente navegamos a una ruta diferente
  useEffect(() => {
    if (previousPathnameRef.current && previousPathnameRef.current !== pathname) {
      setShowModal(false);
      setWizardStep(1);
      setSelectedType(null);
      setStartDate('');
      setStartTime('00:00');
    }
    previousPathnameRef.current = pathname;
  }, [pathname]);

  React.useEffect(() => {
    window.cerrarSesion = () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('savedUsername');
      router.push('/login');
    };
    
    window.cerrarModal = (id: string) => {
      if (id === 'modalOverlay') {
        setShowModal(false);
        // Reset wizard state when modal is closed
        setWizardStep(1);
        setSelectedType(null);
        setStartDate('');
        setStartTime('00:00');
      }
    };

    window.abrirModalSimulacion = () => {
      setShowModal(true);
    };
  }, [router]);

  // Wizard handlers
  const handleNextStep = () => {
    if (selectedType === 'Periodo') {
      // Para Período, ir directo a confirmación (siempre 5 días)
      setWizardStep(2);
    } else if (selectedType === 'DiaDia' || selectedType === 'Colapso') {
      // Para Día a Día y Colapso, saltar directamente a confirmación
      setWizardStep(2);
    }
  };

  const handlePrevStep = () => {
    if (wizardStep === 2 && (selectedType === 'DiaDia' || selectedType === 'Colapso')) {
      // Si es Día a Día o Colapso, volver al paso 1
      setWizardStep(1);
    } else if (wizardStep === 2 && selectedType === 'Periodo') {
      // Si es Período, volver al paso 1
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
    if (selectedType === 'Periodo') {
      // Validar que la fecha esté seleccionada
      if (!startDate) {
        alert('Por favor selecciona una fecha de inicio.');
        return;
      }
      
      // Redirigir a simulacion-periodo con la fecha y hora como parámetros
      const dateStr = new Date(startDate).toISOString().split('T')[0]; // Formato YYYY-MM-DD
      const timeStr = startTime || '00:00'; // Formato HH:MM
      router.push(`/simulacion-periodo?startDate=${dateStr}&startTime=${timeStr}`);
    } else if (selectedType === 'DiaDia') {
      router.push('/operacion-dia-dia');
    } else if (selectedType === 'Colapso') {
      router.push('/simulacion-colapso');
    }
    
    setShowModal(false);
    setWizardStep(1);
    setSelectedType(null);
    setStartDate('');
    setStartTime('00:00');
  };

  const handleConfirmStep = () => {
    if (wizardStep === 1 && selectedType) {
      handleNextStep();
    } else if (wizardStep === 2) {
      // Si es Período, validar fecha antes de ir a confirmación
      if (selectedType === 'Periodo' && !startDate) {
        alert('Por favor selecciona una fecha de inicio.');
        return;
      }
      // Ir al paso 3 (Confirmación)
      setWizardStep(3);
    } else if (wizardStep === 3) {
      handleStartSimulation();
    }
  };

  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ProtectedRoute>
          {pathname !== '/login' && <Sidebar />}

          {/* SimulationProvider mantiene la simulación activa al navegar entre páginas */}
          <SimulationProvider startDate={startDate} startTime={startTime} pathname={pathname}>
          {/* Contenido Principal */}
          {children}
          </SimulationProvider>

        {/* Modal del Wizard de Simulación */}
        <div 
          id="modalOverlay" 
          className="modal-overlay" 
          style={{ 
            display: 'flex',
            opacity: showModal ? 1 : 0,
            pointerEvents: showModal ? 'auto' : 'none',
            visibility: showModal ? 'visible' : 'hidden',
            transition: showModal ? 'opacity 0.15s ease' : 'opacity 0.15s ease'
          }}
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
                    <div className="step-label">Fecha de Inicio</div>
                  </div>
                )}
                {(selectedType === 'DiaDia' || selectedType === 'Colapso') && (
                  <div className={`step ${wizardStep === 2 ? 'active' : wizardStep > 2 ? 'completed' : ''}`}>
                    <div className="step-number">2</div>
                    <div className="step-label">Confirmación</div>
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
                      <p>Simula 5 días de operaciones con planificación automática y replanificación. Selecciona la fecha de inicio.</p>
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

              {/* STEP 2: Configuración de Fecha (Solo para Período) */}
              {wizardStep === 2 && selectedType === 'Periodo' && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '28px', fontSize: '16px' }}>
                    Fecha y Hora de Inicio (Período de 5 Días)
                  </h3>

                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: '600' }}>
                        Selecciona la fecha de inicio:
                      </label>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: '600' }}>
                        Selecciona la hora de inicio:
                      </label>
                      <input 
                        type="time" 
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '8px' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        📅 La simulación durará <strong>5 días</strong> a partir de la fecha y hora seleccionadas.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Placeholder para otras simulaciones */}
              {wizardStep === 2 && (selectedType === 'DiaDia' || selectedType === 'Colapso') && (
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '16px' }}>
                    ✓ Configuración Lista
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {selectedType === 'DiaDia' 
                      ? 'Se iniciará el monitoreo de operaciones en tiempo real.'
                      : 'Se ejecutará la simulación hasta detectar un colapso en el sistema.'}
                  </p>
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
                      <>
                        <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                          <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fecha y Hora de Inicio</small>
                          <div style={{ color: 'var(--text-primary)', fontWeight: '600', marginTop: '4px' }}>
                            {startDate ? (() => {
                              const date = new Date(startDate + 'T00:00:00');
                              const day = String(date.getDate()).padStart(2, '0');
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const year = date.getFullYear();
                              const time = startTime || '00:00';
                              return `${day}/${month}/${year} ${time}`;
                            })() : '-'}
                          </div>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                          <small style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Duración</small>
                          <div style={{ color: 'var(--text-primary)', fontWeight: '600', marginTop: '4px' }}>
                            5 días (fijo)
                          </div>
                        </div>
                      </>
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
                disabled={
                  (wizardStep === 1 && !selectedType) ||
                  (wizardStep === 2 && selectedType === 'Periodo' && !startDate)
                }
              >
                {wizardStep === 3 ? 'Iniciar Simulación' : 'Siguiente →'}
              </button>
            </div>
          </div>
        </div>
        </ProtectedRoute>
      </body>
    </html>
  );
}
