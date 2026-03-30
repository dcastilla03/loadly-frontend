# Tasf.B2B - Sistema de Gestión de Equipajes Aéreos

## 📋 Descripción

Sistema integral de gestión de equipajes extraviados para transporte aéreo internacional. Includes registro de maletas, planificación de rutas, simulaciones de operaciones y monitoreo en tiempo real a través de un mapa global interactivo.

**Empresa Simulada:** Tasf.B2B - Empresa de transporte aéreo de equipajes entre aeropuertos de América, Europa y Asia.

---

## 🎯 Objetivos del Proyecto

1. **Registrar** la cantidad de maletas a ser enviadas por líneas aéreas
2. **Planificar y Replanificar** rutas de maletas cumpliendo plazos comprometidos (1-2 días)
3. **Visualizar** gráficamente el monitoreo de operaciones en un mapa interactivo con actualización en tiempo real

---

## 🌍 Cobertura Geográfica

### Continentes y Ciudades

**América:**
- Lima (Jorge Chávez)
- Miami
- São Paulo
- Ciudad de México
- Nueva York
- Atlanta

**Europa:**
- Frankfurt
- Madrid
- Londres
- París
- Ámsterdam

**Asia:**
- Tokio
- Singapur
- Hong Kong
- Dubái
- Bangkok

---

## ⏱️ Plazos y Tiempos

| Tipo de Ruta | Plazo Máximo | Tiempo de Traslado |
|---|---|---|
| Mismo continente | 1 día | 0.5 días |
| Diferente continente | 2 días | 1 día |

---

## 📊 Capacidades del Sistema

| Elemento | Mínimo | Máximo |
|---|---|---|
| Vuelos (mismo continente) | 150 maletas | 250 maletas |
| Vuelos (diferente continente) | 150 maletas | 400 maletas |
| Almacenes aeropuerto | 500 maletas | 800 maletas |

---

## 📱 Pantallas Disponibles

### 1. **Registro de Maletas** (`registro-maletas.html`)
Formulario para registrar maletas enviadas por líneas aéreas.

**Características:**
- Seleccionar aerolínea cliente
- Elegir aeropuerto de origen (dropdown con ciudades por continente)
- Elegir aeropuerto de destino
- Ingresar cantidad de maletas
- Tabla resumen con registros
- Estadísticas en tiempo real

**Validaciones:**
- Campos obligatorios
- Cantidad mínima 1, máxima 400
- Origen y destino deben ser diferentes

---

### 2. **Configuración de Simulación** (`simulacion-config.html`)
Wizard de 4 pasos para crear nuevas simulaciones.

**Tipos de Simulación:**

1. **Simulación de Período** (3, 5 o 7 días)
   - Duración configurable
   - Tiempo de ejecución: 30-90 minutos
   - Planificación automática de rutas

2. **Operación Día a Día**
   - Monitoreo en tiempo real
   - Actualización continua
   - Gestión de incidencias

3. **Simulación hasta el Colapso**
   - Ejecuta hasta incumplir plazo
   - Identifica límites operacionales
   - Análisis de cuellos de botella

**Pasos del Wizard:**
1. Seleccionar tipo de simulación
2. Configurar duración
3. Establecer umbrales de semáforo
4. Confirmación y revisión

---

### 3. **Mapa Principal** (`mapa-principal.html`)
Dashboard de monitoreo en tiempo real.

**Características:**
- **Mapa Global Interactivo:**
  - SVG con continentes representados
  - Marcadores de aeropuertos con colores de semáforo
  - Rutas animadas entre ciudades
  - Efecto ciclo día/noche (animado con canvas)

- **Top Bar:**
  - Estado de simulación
  - Progreso (Día X de Y)
  - Hora simulada actualizada

- **Tarjetas de Estadísticas:**
  - Maletas en Tránsito
  - Entregadas a Tiempo
  - En Espera
  - Retrasadas (en rojo)

- **Event Log:**
  - Últimas 24 horas de eventos
  - Códigos de identificación de maletas
  - Estado de vuelos y cambios

- **Leyenda:**
  - 🟢 Verde: 0-60% (Normal)
  - 🟡 Ámbar: 61-85% (Alerta)
  - 🔴 Rojo: 86-100% (Crítico)

---

### 4. **Detalle de Maleta** (`detalle-maleta.html`)
Vista detallada de una maleta específica.

**Información Mostrada:**
- Código de maleta (ej: MAL-01042)
- Nombre de aerolínea
- Aeropuerto origen/destino
- **Timeline Horizontal:**
  - Paradas completadas (verde con ✓)
  - Parada actual (ámbar con ✈️)
  - Paradas pendientes (gris)
  - Líneas conectoras

- **Tarjetas Informativos:**
  - 📍 Ubicación Actual
  - ⏰ Plazo de Entrega
  - ⏳ Tiempo Restante (verde si a tiempo, rojo si en riesgo)
  - 📊 Estado General

- **Historial de Eventos:**
  - Fecha y hora de cada evento
  - Descripción (llegada, despegue, replanificación, etc.)
  - Iconos de estado (éxito, alerta, error)

---

## 🎨 Diseño Visual

### Tema
- **Modo:** Dark Mode profundo
- **Colores Principales:**
  - Fondo primario: `#0f1419`
  - Fondo secundario: `#1a1f2e`
  - Acento azul: `#00d4ff` (neon)
  - Texto principal: `#e0e6ed`

### Componentes UI

**Botones:**
- `btn-primary`: Azul neón con sombra
- `btn-secondary`: Borde azul, fondo oscuro
- `btn-danger`: Rojo para acciones destructivas

**Cards:**
- Bordes sutiles
- Hover con glow azul
- Transiciones suaves (0.3s)

**Tablas:**
- Header oscuro destacado
- Filas con hover
- Bordes sutiles

**Modal:**
- Overlay semi-transparente con blur
- Animación fade-in
- Cerrable por botón X o clic fuera

**Slider:**
- Thumb azul con glow
- Rango 0-100
- Valor mostrado en tiempo real

---

## 🚀 Estructura de Archivos

```
tasf-b2b-ui/
├── index.html                 # Página de inicio
├── css/
│   └── estilo.css            # Estilos globales (tema + componentes)
├── js/
│   └── app.js                # Funcionalidad interactiva
└── pantallas/
    ├── registro-maletas.html
    ├── simulacion-config.html
    ├── mapa-principal.html
    └── detalle-maleta.html
```

---

## 🔧 Funcionalidades JavaScript

### `MaletasRegistry`
Gestiona el registro de maletas:
- `agregar(aeroline, origen, destino, cantidad)` - Agrega maleta
- `eliminar(id)` - Elimina registro
- `actualizarTabla()` - Actualiza tabla HTML

### `SimulationWizard`
Controla el wizard de simulación:
- `irAStep(step)` - Navega a paso específico
- `siguiente()` / `anterior()` - Navegación
- `seleccionarTipo(tipo)` - Elige tipo simulación
- `iniciar()` - Inicia simulación
- `actualizarUI()` - Actualiza interfaz

### `SliderControl`
Manejo de sliders:
- `actualizarValor(inputId, valueDisplayId)` - Actualiza valor mostrado

### `DayNightCycle`
Animación del ciclo día/noche:
- `init()` - Inicializa canvas con animación

### `RouteAnimation`
Animación de maletas en rutas:
- `animateSuitcase(elementId, duration)` - Anima movimiento

### `actualizarEstadisticas()`
Actualiza números aleatorios de estadísticas cada 3 segundos

---

## 🎮 Interactividad

- ✅ Formularios funcionales con validación
- ✅ Tablas dinámicas que se actualizan
- ✅ Modales con wizard de 4 pasos
- ✅ Sliders con valores en tiempo real
- ✅ Nav responsive
- ✅ Efectos hover y transiciones
- ✅ Animaciones CSS (pulse, float, fadeIn)
- ✅ Eventos que se actualizan automáticamente

---

## 📱 Responsivo

Diseño adaptable a:
- 📱 Dispositivos móviles (480px+)
- 💻 Tablets (768px+)
- 🖥️ Desktop (1024px+)
- 📺 Pantallas grandes (1400px+)

---

## 🎯 Requisitos No Funcionales (del Proyecto Original)

a. ✅ Presentar dos soluciones algorítmicas (metaheurísticas en Java) - *Componente backend*
b. ✅ Algoritmos tipo metaheurísticos - *A desarrollar en Java*
c. ✅ Colores de semáforo (verde, ámbar, rojo) - *Parametrizables*
d. ✅ Funciona en cualquier equipamiento - *HTML5/CSS3/JS vanilla*
e. ✅ Evaluación con NTP-ISO/IEC 29110-5-1-2 - *Documentación adjunta*
f. ✅ Videos de presentación - *A grabar*
g. ✅ Videos de 3 escenarios - *A grabar*

---

## 🔗 Cómo Usar

### Abrir la Aplicación
1. Abre `index.html` en un navegador moderno (Chrome, Firefox, Edge, Safari)
2. Navega entre pantallas usando el menú superior

### Registro de Maletas
1. Ve a "Registrar Maletas"
2. Completa el formulario con aerolínea, origen, destino y cantidad
3. Haz clic en "Registrar Maletas"
4. Se agregará a la tabla resumen

### Crear Simulación
1. Ve a "Nueva Simulación"
2. Haz clic en "+ Nueva Simulación"
3. Sigue los 4 pasos del wizard
4. Configura duración y umbrales de semáforo
5. Inicia la simulación

### Monitorear Operaciones
1. Ve a "Monitoreo"
2. Observa el mapa con aeropuertos y rutas
3. Revisa estadísticas en tiempo real
4. Lee el log de eventos

### Búsqueda de Maleta
1. Ve a "Búsqueda"
2. Ingresa código de maleta (ej: MAL-01042)
3. Visualiza timeline, eventos y estado actual

---

## 🛠️ Stack Tecnológico

- **Frontend:** HTML5, CSS3, JavaScript Vanilla
- **Diseño:** Respuesta adaptativa, Dark Mode
- **Animaciones:** CSS Keyframes, Canvas API
- **Sin dependencias:** 100% vanilla, sin frameworks

---

## 📝 Notas de Desarrollo

- Todos los datos son simulados/mock (sin backend)
- Las estadísticas se actualizan automáticamente
- Los eventos son ejemplos para demostración
- La funcionalidad principal del planificador iría en backend (Java + metaheurísticas)
- El mapa es una representación simplificada con SVG

---

## 🎓 Contexto Académico

Este proyecto es para el curso de Ingeniería Informática, evaluado con:
- Procesos según NTP-ISO/IEC 29110-5-1-2 (VSE)
- Presentaciones finales grabadas
- Videos de los 3 escenarios de simulación
- Documentación técnica completa

---

## 📧 Contacto / Información

**Empresa Simulada:** Tasf.B2B  
**Sistema:** Gestión de Equipajes Aéreos Internacionales  
**Cobertura:** 3 continentes, 21 ciudades  
**Capacidad:** 100K+ maletas/mes

---

## 📄 Licencia

Proyecto educativo de demostración.

---

**Última actualización:** 28 de Marzo, 2026
