// ============================================
// TASF.B2B - Sistema de Gestión de Maletas
// JavaScript principal para interactividad
// ============================================

/**
 * Manejo de registros de maletas
 */
const MaletasRegistry = {
  data: [],

  agregar(aeroline, origen, destino, cantidad) {
    this.data.push({
      id: Date.now(),
      aeroline,
      origen,
      destino,
      cantidad: parseInt(cantidad),
      fecha: new Date().toLocaleString('es-ES')
    });
    this.actualizarTabla();
  },

  eliminar(id) {
    this.data = this.data.filter(item => item.id !== id);
    this.actualizarTabla();
  },

  actualizarTabla() {
    const tbody = document.getElementById('malesRegistrosTabla');
    if (!tbody) return;

    if (this.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay registros aún</td></tr>';
      return;
    }

    tbody.innerHTML = this.data.map(item => `
      <tr>
        <td>${item.aeroline}</td>
        <td>${item.origen}</td>
        <td>${item.destino}</td>
        <td>${item.cantidad}</td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-danger" onclick="MaletasRegistry.eliminar(${item.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  }
};

/**
 * Manejo del Wizard de Simulación
 */
const SimulationWizard = {
  currentStep: 1,
  data: {
    tipo: null,
    duracion: 5,
    tiempoEjecucion: 60,
    verde: 60,
    ambar: 85
  },

  irAStep(step) {
    if (step < 1 || step > 4) return;
    this.currentStep = step;
    this.actualizarUI();
  },

  siguiente() {
    if (this.currentStep < 4) {
      this.currentStep++;
      this.actualizarUI();
    }
  },

  anterior() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.actualizarUI();
    }
  },

  seleccionarTipo(tipo) {
    this.data.tipo = tipo;
    document.querySelectorAll('.selectable-card').forEach(card => {
      card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
  },

  actualizarUI() {
    // Actualizar indicadores de step
    document.querySelectorAll('.step').forEach((el, idx) => {
      el.classList.remove('active', 'completed');
      if (idx + 1 === this.currentStep) {
        el.classList.add('active');
      } else if (idx + 1 < this.currentStep) {
        el.classList.add('completed');
      }
    });

    // Mostrar/ocultar contenido de steps
    document.querySelectorAll('[id^="step"]').forEach((el, idx) => {
      el.style.display = (idx + 1 === this.currentStep) ? 'block' : 'none';
    });

    // Ocultar botón anterior en primer step
    const btnAnterior = document.getElementById('btnAnterior');
    if (btnAnterior) {
      btnAnterior.style.display = this.currentStep === 1 ? 'none' : 'block';
    }

    // Cambiar texto del botón siguiente en último step
    const btnSiguiente = document.getElementById('btnSiguiente');
    if (btnSiguiente) {
      btnSiguiente.textContent = this.currentStep === 4 ? 'Iniciar Simulación' : 'Siguiente';
    }
  },

  iniciar() {
    console.log('Simulación iniciada:', this.data);
    alert('¡Simulación iniciada!\n\nTipo: ' + this.data.tipo + '\nDuración: ' + this.data.duracion + ' días');
    this.cerrarModal();
  },

  cerrarModal() {
    const modal = document.getElementById('modalSimulacion');
    if (modal) {
      modal.parentElement.style.display = 'none';
    }
  }
};

/**
 * Utilidades para sliders
 */
const SliderControl = {
  actualizarValor(inputId, valueDisplayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(valueDisplayId);
    if (input && display) {
      display.textContent = input.value;
    }
  }
};

/**
 * Manejo de eventos de modal
 */
function abrirModalSimulacion() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    SimulationWizard.actualizarUI();
  }
}

function cerrarModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Inicialización al cargar la página
 */
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar event listeners para formularios
  const formMaletas = document.getElementById('formRegistroMaletas');
  if (formMaletas) {
    formMaletas.addEventListener('submit', function(e) {
      e.preventDefault();
      const aeroline = document.getElementById('aeroline').value;
      const origen = document.getElementById('origen').value;
      const destino = document.getElementById('destino').value;
      const cantidad = document.getElementById('cantidad').value;

      if (aeroline && origen && destino && cantidad) {
        MaletasRegistry.agregar(aeroline, origen, destino, cantidad);
        formMaletas.reset();
      }
    });
  }

  // Inicializar sliders
  const sliders = document.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    slider.addEventListener('input', function() {
      const valueId = this.id + 'Display';
      SliderControl.actualizarValor(this.id, valueId);
    });
  });

  // Cerrar modales con clic en overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) {
        this.style.display = 'none';
      }
    });
  });

  // Cerrar modales con botón X
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function() {
      this.closest('.modal-overlay').style.display = 'none';
    });
  });

  // Inicializar tabla de maletas
  MaletasRegistry.actualizarTabla();
});

/**
 * Animación del ciclo día/noche en el mapa
 */
const DayNightCycle = {
  init() {
    const canvas = document.getElementById('dayNightCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let time = 0;

    const animate = () => {
      const width = canvas.width;
      const height = canvas.height;
      const gradient = ctx.createLinearGradient(0, 0, width, 0);

      // Simular movimiento de sombra de día/noche
      const shadowPos = (time % 100) / 100;
      const x = shadowPos * width;

      gradient.addColorStop(Math.max(0, shadowPos - 0.2), 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(shadowPos, 'rgba(0, 0, 0, 0.3)');
      gradient.addColorStop(Math.min(1, shadowPos + 0.2), 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      time++;
      requestAnimationFrame(animate);
    };

    animate();
  }
};

/**
 * Animación de movimiento de maletas en rutas
 */
const RouteAnimation = {
  animateSuitcase(elementId, duration = 3000) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      element.style.left = (progress * 100) + '%';
      element.style.opacity = progress === 1 ? 0 : 1;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }
};

/**
 * Simulación de estadísticas en tiempo real
 */
function actualizarEstadisticas() {
  const stats = {
    'enTransito': Math.floor(Math.random() * 500) + 100,
    'entregadas': Math.floor(Math.random() * 1000) + 500,
    'espera': Math.floor(Math.random() * 200) + 50,
    'retrasadas': Math.floor(Math.random() * 50) + 10
  };

  Object.keys(stats).forEach(key => {
    const el = document.querySelector(`[data-stat="${key}"]`);
    if (el) {
      el.textContent = stats[key];
    }
  });
}

// Actualizar estadísticas cada 3 segundos
setInterval(actualizarEstadisticas, 3000);

/**
 * Exportar funciones globales
 */
window.abrirModalSimulacion = abrirModalSimulacion;
window.cerrarModal = cerrarModal;
window.SimulationWizard = SimulationWizard;
window.MaletasRegistry = MaletasRegistry;
window.DayNightCycle = DayNightCycle;
window.RouteAnimation = RouteAnimation;
