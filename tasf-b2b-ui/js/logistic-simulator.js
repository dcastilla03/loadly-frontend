/**
 * Simulador Logístico Tasf.B2B
 * Motor de simulación de transporte aéreo de maletas
 */

class LogisticSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Ajustar tamaño del canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Estado de la simulación
    this.isRunning = true; // Siempre corriendo
    this.simulationTime = 0; // en minutos
    this.timeMultiplier = 1.5; // velocidad fija (30 minutos simulados por segundo)
    this.lastFrameTime = Date.now();
    
    // Datos
    this.cities = [];
    this.routes = [];
    this.flights = [];
    this.suitcases = [];
    
    // Visualización
    this.showRoutes = true;
    this.showCities = true;
    this.showFlights = true;
    this.showLabels = true;
    
    // Transformaciones (para pan/zoom)
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    
    // Interactividad
    this.selectedCity = null;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    
    this.initializeData();
    this.setupEventListeners();
    this.setupUIControls();
    this.animate();
  }
  
  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }
  
  initializeData() {
    // Ciudades principales (x, y normalizados 0-1)
    this.cities = [
      // América del Norte
      { id: 0, name: 'Nueva York', continent: 'NA', x: 0.15, y: 0.35, capacity: 650, suitcases: 320, status: 'green' },
      { id: 1, name: 'Los Ángeles', continent: 'NA', x: 0.08, y: 0.50, capacity: 700, suitcases: 280, status: 'green' },
      { id: 2, name: 'Chicago', continent: 'NA', x: 0.18, y: 0.40, capacity: 600, suitcases: 350, status: 'amber' },
      { id: 3, name: 'Toronto', continent: 'NA', x: 0.20, y: 0.30, capacity: 550, suitcases: 220, status: 'green' },
      { id: 4, name: 'Ciudad de México', continent: 'SA', x: 0.12, y: 0.55, capacity: 600, suitcases: 290, status: 'amber' },
      
      // América del Sur
      { id: 5, name: 'Lima', continent: 'SA', x: 0.10, y: 0.70, capacity: 500, suitcases: 180, status: 'green' },
      { id: 6, name: 'São Paulo', continent: 'SA', x: 0.22, y: 0.75, capacity: 700, suitcases: 420, status: 'amber' },
      { id: 7, name: 'Buenos Aires', continent: 'SA', x: 0.18, y: 0.85, capacity: 600, suitcases: 250, status: 'green' },
      { id: 8, name: 'Bogotá', continent: 'SA', x: 0.08, y: 0.65, capacity: 550, suitcases: 210, status: 'amber' },
      
      // Europa
      { id: 9, name: 'Londres', continent: 'EU', x: 0.30, y: 0.25, capacity: 750, suitcases: 410, status: 'green' },
      { id: 10, name: 'París', continent: 'EU', x: 0.32, y: 0.28, capacity: 720, suitcases: 380, status: 'green' },
      { id: 11, name: 'Frankfurt', continent: 'EU', x: 0.35, y: 0.26, capacity: 800, suitcases: 520, status: 'red' },
      { id: 12, name: 'Ámsterdam', continent: 'EU', x: 0.33, y: 0.24, capacity: 680, suitcases: 340, status: 'amber' },
      { id: 13, name: 'Madrid', continent: 'EU', x: 0.28, y: 0.30, capacity: 650, suitcases: 290, status: 'green' },
      { id: 14, name: 'Moscú', continent: 'EU', x: 0.42, y: 0.18, capacity: 700, suitcases: 360, status: 'amber' },
      
      // Oriente Medio y África
      { id: 15, name: 'Dubái', continent: 'ME', x: 0.50, y: 0.45, capacity: 780, suitcases: 480, status: 'amber' },
      { id: 16, name: 'Estambul', continent: 'ME', x: 0.40, y: 0.28, capacity: 720, suitcases: 340, status: 'green' },
      { id: 17, name: 'Doha', continent: 'ME', x: 0.48, y: 0.42, capacity: 700, suitcases: 310, status: 'green' },
      { id: 18, name: 'El Cairo', continent: 'AF', x: 0.38, y: 0.45, capacity: 650, suitcases: 290, status: 'amber' },
      { id: 19, name: 'Johannesburgo', continent: 'AF', x: 0.45, y: 0.70, capacity: 600, suitcases: 220, status: 'green' },
      
      // Asia Oriental
      { id: 20, name: 'Pekín', continent: 'AS', x: 0.62, y: 0.28, capacity: 800, suitcases: 520, status: 'amber' },
      { id: 21, name: 'Shanghái', continent: 'AS', x: 0.65, y: 0.35, capacity: 750, suitcases: 440, status: 'green' },
      { id: 22, name: 'Tokio', continent: 'AS', x: 0.78, y: 0.30, capacity: 750, suitcases: 380, status: 'green' },
      { id: 23, name: 'Hong Kong', continent: 'AS', x: 0.62, y: 0.45, capacity: 700, suitcases: 410, status: 'green' },
      { id: 24, name: 'Singapur', continent: 'AS', x: 0.60, y: 0.55, capacity: 720, suitcases: 390, status: 'amber' },
      { id: 25, name: 'Bangkok', continent: 'AS', x: 0.58, y: 0.50, capacity: 650, suitcases: 330, status: 'green' },
      
      // Oceanía
      { id: 26, name: 'Sídney', continent: 'OC', x: 0.80, y: 0.75, capacity: 650, suitcases: 280, status: 'green' }
    ];
    
    // Crear rutas realistas entre ciudades
    this.createRoutes();
    
    // Inicializar vuelos y maletas
    this.generateInitialFlights();
  }
  
  createRoutes() {
    // Pares de ciudades que tienen rutas directas
    const routePairs = [
      // Continente americano
      [0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [5, 7], [6, 8], [8, 4],
      [4, 0], [0, 9],
      
      // Europa
      [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 11], [11, 16], [16, 14],
      
      // Puentes América-Europa
      [0, 9], [1, 10], [4, 13],
      
      // Oriente Medio
      [15, 16], [16, 18], [18, 19], [15, 17], [17, 23], [15, 24],
      
      // Puentes Europa-Oriente Medio-Asia
      [11, 15], [13, 18], [15, 20], [17, 21],
      
      // Asia Oriental
      [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 23],
      
      // Puentes Asia-Oceanía
      [24, 26], [22, 26],
      
      // Rutas estratégicas globales
      [7, 0], [6, 9], [20, 1], [26, 5]
    ];
    
    this.routes = routePairs.map((pair, index) => ({
      id: index,
      from: this.cities[pair[0]],
      to: this.cities[pair[1]],
      distance: this.calculateDistance(this.cities[pair[0]], this.cities[pair[1]]),
      sameContinent: this.cities[pair[0]].continent === this.cities[pair[1]].continent
    }));
  }
  
  calculateDistance(city1, city2) {
    const dx = city2.x - city1.x;
    const dy = city2.y - city1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  generateInitialFlights() {
    // Generar vuelos iniciales distribuidos durante el período
    this.flights = [];
    this.suitcases = [];
    
    // Para cada ruta, crear múltiples vuelos a lo largo del período
    this.routes.forEach((route, idx) => {
      // 3-5 vuelos por ruta durante el período de simulación (5 días = 7200 minutos)
      const flightsPerRoute = 3 + Math.floor(Math.random() * 3);
      
      for (let i = 0; i < flightsPerRoute; i++) {
        const departureTime = Math.random() * 7200 * 0.7; // Distribuir en 70% del período
        
        this.flights.push({
          id: `FLIGHT_${idx}_${i}`,
          route: route,
          capacity: route.sameContinent ? 150 + Math.random() * 100 : 150 + Math.random() * 250,
          suitcases: Math.floor(Math.random() * 80) + 20,
          departureTime: departureTime,
          arrivalTime: departureTime + (route.sameContinent ? 720 : 1440), // 12h o 24h simulados
          status: 'scheduled'
        });
      }
    });
  }
  
  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
  }
  
  setupUIControls() {
    // Sin controles de simulación - solo visualización
  }
  
  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoom - this.panX;
    const y = (e.clientY - rect.top) / this.zoom - this.panY;
    
    // Verificar si se hizo click en una ciudad
    const city = this.getCityAtPoint(x, y);
    this.selectedCity = city;
    
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
  }
  
  onMouseMove(e) {
    if (!this.isDragging) return;
    
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    
    this.panX += dx / this.zoom;
    this.panY += dy / this.zoom;
    
    this.dragStart = { x: e.clientX, y: e.clientY };
  }
  
  onMouseUp() {
    this.isDragging = false;
  }
  
  onWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    this.zoom = Math.max(0.5, Math.min(3, this.zoom * delta));
  }
  
  getCityAtPoint(x, y) {
    const threshold = 0.02;
    for (let city of this.cities) {
      const dist = Math.sqrt((city.x - x) ** 2 + (city.y - y) ** 2);
      if (dist < threshold) return city;
    }
    return null;
  }
  
  updateStatsDisplay() {
    const inTransit = this.suitcases.filter(s => s.status === 'in_transit').length;
    const delivered = this.suitcases.filter(s => s.status === 'delivered').length;
    const delayed = this.suitcases.filter(s => s.status === 'delayed').length;
    const critical = this.suitcases.filter(s => s.status === 'critical').length;
    
    document.getElementById('inTransit').textContent = inTransit;
    document.getElementById('delivered').textContent = delivered;
    document.getElementById('delayed').textContent = delayed;
    document.getElementById('critical').textContent = critical;
    
    // Calcular capacidad promedio
    const totalCapacity = this.cities.reduce((sum, c) => sum + c.capacity, 0);
    const totalSuitcases = this.cities.reduce((sum, c) => sum + c.suitcases, 0);
    const avgCapacity = ((totalSuitcases / totalCapacity) * 100).toFixed(1);
    document.getElementById('capacityInfo').textContent = `${avgCapacity}% utilizado`;
  }
  
  draw() {
    // Limpiar canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Aplicar transformaciones
    this.ctx.save();
    this.ctx.translate(this.panX * this.zoom, this.panY * this.zoom);
    this.ctx.scale(this.zoom, this.zoom);
    
    // Escalar coordenadas normalizadas al canvas
    this.ctx.translate(0, 0);
    this.ctx.scale(this.canvas.width, this.canvas.height);
    
    // Dibujar fondo de cuadrícula
    this.drawGrid();
    
    if (this.showRoutes) this.drawRoutes();
    if (this.showCities) this.drawCities();
    if (this.showFlights) this.drawFlights();
    
    this.ctx.restore();
    
    // Dibujar UI en pantalla
    this.drawUI();
  }
  
  drawGrid() {
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    this.ctx.lineWidth = 0.001;
    
    for (let i = 0; i <= 10; i++) {
      const pos = i / 10;
      this.ctx.beginPath();
      this.ctx.moveTo(pos, 0);
      this.ctx.lineTo(pos, 1);
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, pos);
      this.ctx.lineTo(1, pos);
      this.ctx.stroke();
    }
  }
  
  drawRoutes() {
    this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    this.ctx.lineWidth = 0.001;
    
    this.routes.forEach(route => {
      this.ctx.beginPath();
      this.ctx.moveTo(route.from.x, route.from.y);
      this.ctx.lineTo(route.to.x, route.to.y);
      this.ctx.stroke();
    });
  }
  
  drawCities() {
    this.cities.forEach(city => {
      const statusColors = {
        'green': '#067857',
        'amber': '#ab4502',
        'red': '#b91c1c'
      };
      
      // Dibujar círculo de la ciudad
      this.ctx.fillStyle = statusColors[city.status];
      this.ctx.beginPath();
      this.ctx.arc(city.x, city.y, 0.008, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Borde blanco
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.lineWidth = 0.0015;
      this.ctx.stroke();
      
      // Sombra
      this.ctx.shadowColor = statusColors[city.status] + '44';
      this.ctx.shadowBlur = 0.01;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = 0;
      this.ctx.beginPath();
      this.ctx.arc(city.x, city.y, 0.008, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowColor = 'transparent';
      
      // Etiqueta
      if (this.showLabels && this.zoom > 1) {
        this.ctx.fillStyle = '#333333';
        this.ctx.font = 'bold 0.003px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(city.name.split(' ')[0], city.x, city.y - 0.012);
      }
    });
  }
  
  drawFlights() {
    // Dibujar representación de vuelos activos
    this.flights.forEach((flight, idx) => {
      // Calcular duración del vuelo en minutos
      const flightDuration = flight.arrivalTime - flight.departureTime;
      const progress = (this.simulationTime - flight.departureTime) / flightDuration;
      
      if (progress > 0 && progress < 1) {
        const x = flight.route.from.x + (flight.route.to.x - flight.route.from.x) * progress;
        const y = flight.route.from.y + (flight.route.to.y - flight.route.from.y) * progress;
        
        // Dibujar avión
        this.ctx.fillStyle = '#2564eb';
        this.ctx.beginPath();
        
        // Triángulo simple
        const size = 0.004;
        const angle = Math.atan2(flight.route.to.y - flight.route.from.y, flight.route.to.x - flight.route.from.x);
        
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size, size);
        this.ctx.lineTo(size, size);
        this.ctx.fill();
        
        this.ctx.restore();
      }
    });
  }
  
  drawUI() {
    // Mostrar información del tiempo (días y horas)
    const days = Math.floor(this.simulationTime / 1440) + 1; // 1440 minutos = 1 día
    const hours = Math.floor((this.simulationTime % 1440) / 60);
    const minutes = Math.floor(this.simulationTime % 60);
    const timeStr = `Día ${days} - ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    document.getElementById('timeDisplay').textContent = timeStr;
  }
  
  update(deltaTime) {
    if (!this.isRunning) return;
    
    // Actualizar tiempo de simulación
    this.simulationTime += (deltaTime / 1000) * this.timeMultiplier; // Convertir a minutos
    
    // Actualizar estado de vuelos
    this.flights.forEach(flight => {
      if (flight.status === 'scheduled' && this.simulationTime >= flight.departureTime) {
        flight.status = 'in_flight';
        flight.arrivalTime = this.simulationTime + 30; // Vuelo dura 30 minutos simulados
      }
      
      if (flight.status === 'in_flight' && this.simulationTime >= flight.arrivalTime) {
        flight.status = 'arrived';
        // Crear eventos de llegada
      }
    });
    
    // Actualizar estadísticas
    this.updateStatsDisplay();
  }
  
  animate() {
    const now = Date.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    this.update(deltaTime);
    this.draw();
    
    requestAnimationFrame(() => this.animate());
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new LogisticSimulator('logisticCanvas');
});
