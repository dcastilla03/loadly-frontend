'use client';

import { createContext, useContext, useRef, useEffect, useState, ReactNode } from 'react';
import { useSimulacion, FlightEvent, LogEvent, SIM_CONFIG } from './simulacion-periodo/useSimulacion';

interface SimulationContextValue {
  sim: ReturnType<typeof useSimulacion>;
  flightEventsRef: React.MutableRefObject<FlightEvent[]>;
  airportStateRef: React.MutableRefObject<Map<string, { ocupacion: number; capacidad: number }>>;
  cancelledFlightsRef: React.MutableRefObject<Set<string>>;
  suppressedTramosRef: React.MutableRefObject<Map<string, { minTramoOrden: number; iteracionIdx: number }>>;
  logEventsRef: React.MutableRefObject<LogEvent[]>;
  addLogRef: React.MutableRefObject<(text: string, color: string, minutosSimulados?: number | null) => void>;
  addLogBatchRef: React.MutableRefObject<(entries: Array<{ text: string; color: string; minutosDisparo: number }>) => void>;
  emptyFlightsAddedRef: React.MutableRefObject<Set<string>>;
  canceledLocallyRef: React.MutableRefObject<Set<string>>;
  currentMinSimRef: React.MutableRefObject<number>;
  clockStateRef: React.MutableRefObject<'CALCULANDO' | 'VISUALIZANDO'>;
  lastFrameTimeRef: React.MutableRefObject<number>;
  lastIteracionRef: React.MutableRefObject<number>;
  clockEnabledRef: React.MutableRefObject<boolean>;
  panelFlightKeyRef: React.MutableRefObject<string | null>;
  calcStartedAtRef: React.MutableRefObject<number>;
  configCountdownRef: React.MutableRefObject<number>;
  stopwatchStartedAtRef: React.MutableRefObject<number | null>;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children, startDate, startTime, pathname }: { children: ReactNode; startDate?: string; startTime?: string; pathname?: string }) {
  const sim = useSimulacion(startDate || undefined, startTime || undefined);

  // ── Refs (persisten mientras el Provider está montado) ──
  const airportStateRef = useRef<Map<string, { ocupacion: number; capacidad: number }>>(new Map());
  const flightEventsRef = useRef<FlightEvent[]>([]);
  const cancelledFlightsRef = useRef<Set<string>>(new Set());
  const suppressedTramosRef = useRef<Map<string, { minTramoOrden: number; iteracionIdx: number }>>(new Map());
  const logEventsRef = useRef<LogEvent[]>([]);
  const addLogRef = useRef<(text: string, color: string, minutosSimulados?: number | null) => void>(() => {});
  const addLogBatchRef = useRef<(entries: Array<{ text: string; color: string; minutosDisparo: number }>) => void>(() => {});
  const emptyFlightsAddedRef = useRef<Set<string>>(new Set());
  const canceledLocallyRef = useRef<Set<string>>(new Set());
  const currentMinSimRef = useRef<number>(0);
  const clockStateRef = useRef<'CALCULANDO' | 'VISUALIZANDO'>('CALCULANDO');
  const lastFrameTimeRef = useRef<number>(0);
  const lastIteracionRef = useRef<number>(0);
  const clockEnabledRef = useRef<boolean>(false);
  const panelFlightKeyRef = useRef<string | null>(null);
  const calcStartedAtRef = useRef<number>(0);
  const configCountdownRef = useRef<number>(60);
  const stopwatchStartedAtRef = useRef<number | null>(null);
  

  // ── Sincronizar flightEvents del hook → ref local ──
  useEffect(() => {
    const existingKeys = new Set(flightEventsRef.current.map(e => e.key));
    const nuevos = sim.allFlightEvents.filter(e => !existingKeys.has(e.key));
    if (nuevos.length > 0) {
      flightEventsRef.current = [...flightEventsRef.current, ...nuevos];
    }
  }, [sim.allFlightEvents]);

  // ── Sincronizar logEvents del hook → ref local ──
  useEffect(() => {
    if (sim.allLogEvents.length === 0) {
      logEventsRef.current = [];
      return;
    }
    const nuevos = sim.allLogEvents.slice(logEventsRef.current.length);
    if (nuevos.length > 0) {
      logEventsRef.current = [...logEventsRef.current, ...nuevos];
    }
  }, [sim.allLogEvents]);

  // ── Sincronizar cancelledFlights del hook → ref local ──
  useEffect(() => {
    cancelledFlightsRef.current = sim.cancelledFlights;
    const simStart = sim.simStartDateRef.current;
    if (!simStart) return;
    sim.cancelledFlights.forEach((key: string) => {
      const parts = key.split('-');
      if (parts.length < 3) return;
      const orig = parts[0], dest = parts[1];
      const [h, m] = parts[2].split(':').map(Number);
      const keyMinutosDelDia = h * 60 + m;
      const fe = flightEventsRef.current.find(e => {
        if (e.origenCode !== orig || e.destinoCode !== dest || e.active) return false;
        const depDate = new Date(simStart.getTime() + e.minutosInicio * 60000);
        const apt = sim.aeropuertosRef.current.get(e.origenCode);
        const offset = apt?.gmt ?? 0;
        const gmtHour = depDate.getHours();
        const gmtMin = depDate.getMinutes();
        const localMinutosDelDia = ((gmtHour + offset) % 24 + 24) % 24 * 60 + gmtMin;
        return localMinutosDelDia === keyMinutosDelDia;
      });
      if (fe) fe.done = true;
    });
  }, [sim.cancelledFlights, sim.simStartDateRef, sim.aeropuertosRef]);

  // ── Suprimir FlightEvents y LogEvents de envíos afectados por cancelación ──
  useEffect(() => {
    suppressedTramosRef.current = sim.suppressedTramos;
    if (sim.suppressedTramos.size === 0) return;
    sim.suppressedTramos.forEach((info, idEnvio) => {
      for (const fe of flightEventsRef.current) {
        const feIdEnvio = fe.key.split('-')[0];
        if (feIdEnvio !== idEnvio || fe.tramoOrden < info.minTramoOrden || fe.active) continue;
        const m = fe.key.match(/iter(\d+)/);
        if (m && parseInt(m[1]) === info.iteracionIdx) {
          fe.done = true;
        }
      }
      for (const le of logEventsRef.current) {
        if (le.idEnvio === idEnvio && le.tramoOrden !== undefined && le.tramoOrden >= info.minTramoOrden) {
          le.fired = true;
        }
      }
    });
  }, [sim.suppressedTramos]);

  // ── Mantener addLogRef / addLogBatchRef siempre apuntando a la función actual ──
  useEffect(() => {
    addLogRef.current = sim.addLog;
  }, [sim.addLog]);
  useEffect(() => {
    addLogBatchRef.current = sim.addLogBatch;
  }, [sim.addLogBatch]);

  // NOTA: El auto-start (k=1, sin fin, UTC) está ahora en operacion-dia-dia/page.tsx
  // para mantener la simulación de Día a Día independiente de Periodo.

  // ── Control de estado del reloj (CALCULANDO → VISUALIZANDO) ──
  useEffect(() => {
    if (sim.isRunning && sim.iteracion === 0) {
      clockEnabledRef.current = false;
      currentMinSimRef.current = 0;
      lastFrameTimeRef.current = 0;
      clockStateRef.current = 'CALCULANDO';
      calcStartedAtRef.current = performance.now();
      configCountdownRef.current = 60;
      // Limpiar eventos de una simulación anterior (ej. Día a Día) para evitar
      // conflictos de keys que impedirían que los nuevos eventos lleguen al ref.
      flightEventsRef.current = [];
      logEventsRef.current = [];
      cancelledFlightsRef.current = new Set();
      suppressedTramosRef.current = new Map();
    }

    if (sim.iteracion > 0 && !clockEnabledRef.current) {
      clockEnabledRef.current = true;
      clockStateRef.current = 'VISUALIZANDO';
      lastFrameTimeRef.current = performance.now();
      calcStartedAtRef.current = 0;
      configCountdownRef.current = 0;
      // Iniciar stopwatch solo si no está ya corriendo
      if (stopwatchStartedAtRef.current === null) {
        stopwatchStartedAtRef.current = Date.now();
      }
    }

    // Caso: re-montar con simulación ya en marcha (clockEnabledRef ya true)
    if (sim.isRunning && sim.iteracion > 0 && stopwatchStartedAtRef.current === null) {
      stopwatchStartedAtRef.current = Date.now();
    }

    if (!sim.isRunning) {
      clockEnabledRef.current = false;
      stopwatchStartedAtRef.current = null;
    }
  }, [sim.isRunning, sim.iteracion]);

  // ── Motor de simulación (tiempo + ciclo de vida FlightEvents) ──
  // Corre siempre que el Provider está montado, incluso si el usuario navega a otra página.
  const TOTAL_MINUTOS_SIM = 5 * 24 * 60; // 7200
  useEffect(() => {
    let frameId: number;
    function engineLoop() {
      try {
        const now = performance.now();

        // Actualizar countdown durante CALCULANDO
        if (clockStateRef.current === 'CALCULANDO' && calcStartedAtRef.current > 0) {
          const elapsedSec = Math.floor((now - calcStartedAtRef.current) / 1000);
          configCountdownRef.current = Math.max(0, 60 - elapsedSec);
        }

        if (clockEnabledRef.current) {
          const deltaMs = now - (lastFrameTimeRef.current || now);
          lastFrameTimeRef.current = now;
          const deltaMinSim = (deltaMs / 1000) * (SIM_CONFIG.K / 60);
          currentMinSimRef.current += deltaMinSim;
        } else {
          lastFrameTimeRef.current = now;
        }

        const minSim = Math.min(TOTAL_MINUTOS_SIM, currentMinSimRef.current);
        currentMinSimRef.current = minSim;

        // El backend termina de calcular antes que el front termine de animar los
        // 5 días. RESUMEN_FINAL solo deja el resumen "pendiente" (pendingResumenRef);
        // acá lo confirmamos recién cuando el reloj visual llegó al final del día 5,
        // para que el overlay de finalización no se adelante a la animación.
        if (sim.pendingResumenRef.current && minSim >= TOTAL_MINUTOS_SIM) {
          sim.commitResumenFinal();
          addLogRef.current('🏁 Simulación finalizada correctamente', '#22c55e');
        }

        const events = flightEventsRef.current;
        const simStart = sim.simStartDateRef.current;

        for (const fe of events) {
          if (fe.done) continue;

          if (!fe.active && minSim >= fe.minutosInicio) {
            const idEnvio = fe.key.split('-')[0];
            const depDate = simStart ? new Date(simStart.getTime() + fe.minutosInicio * 60000) : new Date();
            const apt = sim.aeropuertosRef.current.get(fe.origenCode);
            const offset = apt?.gmt ?? 0;
            const gmtHour = depDate.getHours();
            const gmtMin = depDate.getMinutes();
            const localHour = ((gmtHour + offset) % 24 + 24) % 24;
            const hh = String(localHour).padStart(2, '0');
            const mm = String(gmtMin).padStart(2, '0');
            const cancelKey = `${fe.origenCode}-${fe.destinoCode}-${hh}:${mm}`;
            let suprimido = cancelKey && cancelledFlightsRef.current.has(cancelKey);
            if (!suprimido) {
              const supInfo = suppressedTramosRef.current.get(idEnvio);
              if (supInfo && fe.tramoOrden >= supInfo.minTramoOrden) {
                const m = fe.key.match(/iter(\d+)/);
                suprimido = !!(m && parseInt(m[1]) === supInfo.iteracionIdx);
              }
            }
            if (suprimido) {
              fe.done = true;
            } else {
              fe.active = true;
              (fe as any)._activatedThisFrame = true;
              airportStateRef.current.set(fe.origenCode, {
                ocupacion: fe.ocupacionAlmacenOrigen,
                capacidad: fe.capacidadAlmacenOrigen,
              });
            }
          }

          if (fe.active) {
            // Saltar verificación de done en el mismo frame que se activó
            if ((fe as any)._activatedThisFrame) {
              (fe as any)._activatedThisFrame = false;
            } else {
              const duracion = fe.minutosFin - fe.minutosInicio;
              if (duracion <= 0 || minSim >= fe.minutosFin) {
                fe.done = true;
                fe.active = false;
                airportStateRef.current.set(fe.destinoCode, {
                  ocupacion: fe.ocupacionAlmacenDestino,
                  capacidad: fe.capacidadAlmacenDestino,
                });
                // Liberar el placeholder (empty flight) correspondiente
                if (!fe.key.startsWith('unused-')) {
                  const mod1440 = fe.minutosInicio % 1440;
                  for (const placeholder of events) {
                    if (placeholder.key.startsWith('unused-') && placeholder.done &&
                        placeholder.origenCode === fe.origenCode &&
                        placeholder.destinoCode === fe.destinoCode &&
                        (placeholder.minutosInicio % 1440) === mod1440) {
                      placeholder.done = false;
                      // Recalcular próxima salida de este slot horario
                      const timeOfDay = placeholder.minutosInicio % 1440;
                      const duracionPlaceholder = placeholder.minutosFin - placeholder.minutosInicio;
                      const todayDeparture = Math.floor(minSim / 1440) * 1440 + timeOfDay;
                      if (todayDeparture <= minSim) {
                        placeholder.minutosInicio = todayDeparture + 1440;
                      } else {
                        placeholder.minutosInicio = todayDeparture;
                      }
                      placeholder.minutosFin = placeholder.minutosInicio + duracionPlaceholder;
                      break;
                    }
                  }
                }
              }
            }
          }
        }

        // ── Disparar LogEvents ──
        const pendingLogs: { text: string; color: string; minutosDisparo: number }[] = [];
        for (const le of logEventsRef.current) {
          if (!le.fired && minSim >= le.minutosDisparo) {
            if (le.idEnvio && le.tramoOrden !== undefined) {
              const info = suppressedTramosRef.current.get(le.idEnvio);
              if (info && le.tramoOrden >= info.minTramoOrden) {
                le.fired = true;
                continue;
              }
            }
            le.fired = true;
            pendingLogs.push({ text: le.text, color: le.color, minutosDisparo: le.minutosDisparo });
            // Actualizar ocupación del almacén cuando se registra un envío
            const leAny = le as any;
            if (leAny.updatePopupCode && typeof leAny.updatePopupOcupacion === 'number') {
              airportStateRef.current.set(leAny.updatePopupCode, {
                ocupacion: leAny.updatePopupOcupacion,
                capacidad: leAny.updatePopupCapacidad ?? 0,
              });
            }
          }
        }
        if (pendingLogs.length > 0) {
          addLogBatchRef.current(pendingLogs);
        }
      } catch (err) {
        console.error('[engineLoop] Error:', err);
      }

      frameId = requestAnimationFrame(engineLoop);
    }
    engineLoop();
    return () => cancelAnimationFrame(frameId);
  }, []);

  const value: SimulationContextValue = {
    sim,
    flightEventsRef,
    airportStateRef,
    cancelledFlightsRef,
    suppressedTramosRef,
    logEventsRef,
    addLogRef,
    addLogBatchRef,
    emptyFlightsAddedRef,
    canceledLocallyRef,
    currentMinSimRef,
    clockStateRef,
    lastFrameTimeRef,
    lastIteracionRef,
    clockEnabledRef,
    panelFlightKeyRef,
    calcStartedAtRef,
    configCountdownRef,
    stopwatchStartedAtRef,
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulationContext(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulationContext must be used within SimulationProvider');
  return ctx;
}
