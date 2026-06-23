'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {}

export const Sidebar: React.FC<SidebarProps> = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSimulations, setExpandedSimulations] = useState(false);
  const [user, setUser] = useState<{ nombre: string; correo: string } | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed') === 'true';
    setCollapsed(savedState);
    updateMainWrapperClass(savedState);

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }

    const isInSimulationRoute = pathname.startsWith('/operacion-dia-dia') || 
                                pathname.startsWith('/simulacion-periodo') || 
                                pathname.startsWith('/simulacion-colapso');
    if (isInSimulationRoute) {
      setExpandedSimulations(true);
    }
  }, [pathname]);

  const updateMainWrapperClass = (isCollapsed: boolean) => {
    const mainWrapper = document.querySelector('.main-wrapper');
    if (mainWrapper) {
      if (isCollapsed) {
        mainWrapper.classList.add('sidebar-collapsed');
      } else {
        mainWrapper.classList.remove('sidebar-collapsed');
      }
    }
  };

  const toggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
    updateMainWrapperClass(newState);
  };

  const toggleSimulations = () => {
    setExpandedSimulations(!expandedSimulations);
  };

  const handleLogout = () => {
    if (confirm('¿Deseas cerrar sesión?')) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('savedUsername');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  };

  // Función para determinar si un link es el activo
  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const simulationItems = [
    { href: '/operacion-dia-dia', icon: '⏱️', label: 'Operación Día a Día' },
    { href: '/simulacion-periodo', icon: '📅', label: 'Simulación Período' },
    { href: '/simulacion-colapso', icon: '💥', label: 'Simulación Colapso' },
  ];

  const navItems = [
    { href: '/', icon: '🏠', label: 'Inicio' },
    { href: '/registro-maletas', icon: '📦', label: 'Registro de Envíos' },
  ];

  const navItemsAfterSimulations = [
    { href: '/gestion-vuelos', icon: '✈️', label: 'Gestión de Vuelos' },
    { href: '/almacenes', icon: '🏭', label: 'Almacenes' },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="icon">
            <img src="/logo.svg" alt="Logo" style={{ width: '36px', height: '36px' }} />
          </div>
          <span className="logo-text">Loadly</span>
        </div>
        <button className="sidebar-toggle" onClick={toggleSidebar} title="Desplegar/Contraer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link 
            key={item.href}
            href={item.href} 
            className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
          </Link>
        ))}

        {/* Sección Desplegable de Simulaciones */}
        <div className="nav-group">
          <button
            className={`nav-item nav-expandable ${expandedSimulations ? 'expanded' : ''}`}
            onClick={toggleSimulations}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Escenarios</span>
            <span className="nav-expand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>

          {expandedSimulations && (
            <div className="nav-submenu">
              {simulationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item nav-subitem ${isActive(item.href) ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-text">{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {navItemsAfterSimulations.map((item) => (
          <Link 
            key={item.href}
            href={item.href} 
            className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
          <div className="profile-section">
          <div className="profile-avatar">👤</div>
          <div className="profile-info">
            <div className="profile-name">{user?.nombre || 'Usuario'}</div>
            <div className="profile-email">{user?.correo || ''}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          🚪 Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
