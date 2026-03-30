# 🚀 QUICK START - Acceso Inmediato

## 📂 Ubicación del Proyecto

```
C:\Users\Diego\Desktop\DP1\tasf-b2b-ui\
```

---

## ⚡ OPCIÓN 1: Abrir Directamente (más rápido)

### Windows:
```
1. Abre el navegador (Chrome, Firefox, Edge)
2. Presiona: Ctrl + O
3. Navega a: C:\Users\Diego\Desktop\DP1\tasf-b2b-ui\index.html
4. Dale click a "Abrir"
5. ¡Listo! La app carga en segundos
```

### O simplemente:
```
Haz doble click en: C:\Users\Diego\Desktop\DP1\tasf-b2b-ui\index.html
```

---

## ⚡ OPCIÓN 2: Servidor Local (recomendado)

### Windows PowerShell:
```powershell
cd C:\Users\Diego\Desktop\DP1\tasf-b2b-ui
python -m http.server 8000
```

### Windows CMD:
```cmd
cd C:\Users\Diego\Desktop\DP1\tasf-b2b-ui
python -m http.server 8000
```

### Luego abre:
```
http://localhost:8000
```

---

## 🎯 ACCESO A CADA PANTALLA

### 📦 Pantalla 1: Registro de Maletas
```
http://localhost:8000/pantallas/registro-maletas.html
```
O desde la página de inicio → "Registrar Maletas"

**Prueba rápida:**
1. Selecciona: LATAM Airlines
2. Origen: Lima (Jorge Chávez)
3. Destino: Tokio (NRT)
4. Cantidad: 250
5. Click "Registrar Maletas"
6. ¡Verás la tabla actualizada!

---

### ⚙️ Pantalla 2: Nueva Simulación
```
http://localhost:8000/pantallas/simulacion-config.html
```
O desde la página de inicio → "Nueva Simulación"

**Prueba rápida:**
1. Click en "+ Nueva Simulación"
2. Selecciona "Simulación de Período"
3. Click "Siguiente"
4. Configura: 5 días, 60 minutos
5. Click "Siguiente"
6. Ajusta umbrales con sliders
7. Click "Siguiente"
8. Revisa resumen
9. Click "Iniciar Simulación"

---

### 🗺️ Pantalla 3: Monitoreo en Tiempo Real
```
http://localhost:8000/pantallas/mapa-principal.html
```
O desde la página de inicio → "Monitoreo"

**Observa:**
- Mapa global con 7 aeropuertos
- Colores cambiendo según capacidad
- Líneas de rutas animadas
- Top bar mostrando hora actual
- 4 tarjetas de estadísticas (se actualizan cada 3 segundos)
- Event log con últimos eventos

---

### 🔍 Pantalla 4: Detalle de Maleta
```
http://localhost:8000/pantallas/detalle-maleta.html
```
O desde la página de inicio → "Búsqueda"

**Prueba rápida:**
- Código de maleta pre-cargado: MAL-01042
- Observa timeline horizontal
- Verifica ubicación: Dubái
- Plazo: 34 horas restantes (a tiempo)
- Historial: 11 eventos de la ruta

---

## 📊 DATOS DE DEMOSTRACIÓN

### Maletas Seleccionables:
```
MAL-01042 → LATAM → Lima → Tokio
MAL-00756 → Emirates → Dubái → Nueva York
MAL-00890 → Lufthansa → Frankfurt → São Paulo
```

### Simular Con:
```
Tipo: Simulación de Período
Días: 5 días
Duración: 60 minutos
Verde: 60% (slider)
Ámbar: 85% (slider)
```

### Estadísticas Demostrativas:
```
Maletas en Tránsito: 842 (se actualiza)
Entregadas a Tiempo: 1,284 (verde)
En Espera: 142 (ámbar)
Retrasadas: 23 (rojo)
```

---

## 🎮 INTERACTIVIDAD DISPONIBLE

### Registro de Maletas
- ✅ Llenar formulario dinámico
- ✅ Agregar a tabla
- ✅ Eliminar registros
- ✅ Ver estadísticas en tiempo real
- ✅ Limpiar formulario

### Configuración
- ✅ Navegar entre 4 pasos
- ✅ Seleccionar tipo simulación
- ✅ Ajustar sliders
- ✅ Ver vista previa de semáforo
- ✅ Iniciar simulación

### Monitoreo
- ✅ Ver mapa animado
- ✅ Marcadores con colores
- ✅ Rutas visibles
- ✅ Estadísticas actualizadas
- ✅ Event log scrolleable

### Detalle Maleta
- ✅ Buscar por código
- ✅ Ver timeline
- ✅ Historial completo
- ✅ Análisis de desempeño

---

## 🎨 VERIFICAR DISEÑO

### Dark Mode
- Fondo muy oscuro ✓
- Texto claro ✓
- Acentos azul neón ✓

### Colores Semáforo
- 🟢 Verde para bueno
- 🟡 Ámbar para alerta
- 🔴 Rojo para crítico

### Responsive
- Reduce ventana → Elementos se adaptan
- En móvil → Stack vertical
- En desktop → Múltiples columnas

---

## 🔧 TROUBLESHOOTING

### **P: La página no carga**
```
R: Asegúrate de la ruta correcta
   C:\Users\Diego\Desktop\DP1\tasf-b2b-ui\index.html
```

### **P: Los estilos no aparecen**
```
R: Presiona Ctrl+Shift+R (reload forzado)
   O limpia caché: Ctrl+Shift+Delete
```

### **P: Los inputs no responden**
```
R: Verifica que JavaScript esté habilitado
   Abre consola: F12
```

### **P: Lentitud en animaciones**
```
R: Cierra pestañas pesadas
   Intenta otro navegador
```

### **P: Modal no se cierra**
```
R: Click fuera del modal
   O usa el botón X
```

---

## 📱 NAVEGADORES SOPORTADOS

| Navegador | Versión | Soporte |
|---|---|---|
| Chrome | 90+ | ✅ Completo |
| Firefox | 88+ | ✅ Completo |
| Edge | 90+ | ✅ Completo |
| Safari | 14+ | ✅ Completo |
| Opera | 76+ | ✅ Completo |

---

## 📚 DOCUMENTACIÓN DISPONIBLE

En la carpeta del proyecto encontrarás:

```
📄 README.md              → Documentación técnica completa
📄 INSTRUCCIONES.md       → Guía detallada de uso
📄 TEST_VALIDACION.md     → Pruebas completadas
📄 VISTA_PREVIA_PANTALLAS.md → ASCII art de cada pantalla
📄 RESUMEN_PROYECTO.md    → Resumen ejecutivo
```

---

## ✨ CARACTERÍSTICAS DESTACADAS

### Registro de Maletas
```
✓ Formulario con 4 campos
✓ Dropdowns con ciudades
✓ Tabla dinámica
✓ Estadísticas en vivo
✓ Botones agregar/limpiar/eliminar
```

### Nueva Simulación
```
✓ Wizard de 4 pasos
✓ Modal interactivo
✓ 3 tipos de simulación
✓ Sliders configurables
✓ Vista previa semáforo
```

### Monitoreo
```
✓ Mapa SVG global
✓ 7 aeropuertos marcados
✓ Rutas animadas
✓ 4 tarjetas de stats
✓ Event log en tiempo real
✓ Efecto día/noche
```

### Detalle Maleta
```
✓ Búsqueda por código
✓ Timeline horizontal
✓ 7 paradas en ruta
✓ Información en cards
✓ Historial con 11 eventos
✓ Análisis de desempeño
```

---

## 🎬 PARA GRABAR VIDEOS

### Video 1: Simulación de Período
```
1. Abre "Registro de Maletas"
2. Registra 3-4 maletas
3. Abre "Nueva Simulación"
4. Crea simulación de 5 días
5. Abre "Monitoreo"
6. Muestra mapa y estadísticas
7. Abre "Detalle Maleta"
8. Muestra timeline
```

### Video 2: Monitoreo Operacional
```
1. Abre "Monitoreo"
2. Señala aeropuertos en mapa
3. Muestra colores cambiar
4. Señala event log
5. Explica estadísticas
6. Muestra leyenda de colores
7. Abre "Búsqueda"
8. Rastraea una maleta
```

### Video 3: Configuración Completa
```
1. Abre "Nueva Simulación"
2. Selecciona "Simulación de Período"
3. Configura duración
4. Ajusta umbrales
5. Muestra vista previa
6. Inicia simulación
7. Abre "Monitoreo"
8. Muestra resultados
```

---

## 🎯 DEMO RÁPIDA (5 minutos)

```
Minuto 1: Abre index.html y muestra navegación
Minuto 2: Ve a "Registro" y agrega una maleta
Minuto 3: Ve a "Nueva Simulación" y crea una
Minuto 4: Ve a "Monitoreo" y muestra mapa
Minuto 5: Ve a "Búsqueda" y rastraea maleta
```

---

## 🌐 ACCESO REMOTO

Si quieres compartir la app con otros:

### Opción 1: Servidor local con exposición
```bash
# En lugar de localhost, usa:
http://TU_IP_LOCAL:8000

# Para obtener tu IP:
ipconfig (Windows)
ifconfig (Linux/Mac)
```

### Opción 2: Compartir archivos
```
Copia toda la carpeta: C:\Users\Diego\Desktop\DP1\tasf-b2b-ui\
Comparte como ZIP con el otro usuario
El otro usuario extrae y abre index.html
```

---

## ✅ VERIFICACIÓN FINAL

Antes de presentar, verifica:

- ✅ Dark theme visible
- ✅ Formularios funcionales
- ✅ Tabla dinámica actualiza
- ✅ Modal abre y cierra
- ✅ Sliders se mueven
- ✅ Mapa carga
- ✅ Estadísticas cambian
- ✅ Timeline visible
- ✅ Colores semáforo presentes
- ✅ Responsive en móvil

---

## 🎉 ¡LISTO PARA USAR!

Todas las pantallas están 100% funcionales y listas para:
- ✅ Demostración
- ✅ Presentación
- ✅ Testing
- ✅ Integración backend futura

---

**Último update:** 28 de Marzo, 2026
**Status:** ✅ COMPLETAMENTE FUNCIONAL
**Tiempo Acceso:** < 30 segundos desde index.html
