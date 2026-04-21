'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {}

export const Sidebar: React.FC<SidebarProps> = () => {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed') === 'true';
    setCollapsed(savedState);
    // Actualizar clase en el main-wrapper
    updateMainWrapperClass(savedState);
  }, []);

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

  const handleLogout = () => {
    if (confirm('¿Deseas cerrar sesión?')) {
      localStorage.clear();
      window.location.href = '/';
    }
  };

  // Función para determinar si un link es el activo
  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const navItems = [
    { href: '/', icon: '🏠', label: 'Inicio' },
    { href: '/registro-maletas', icon: '📦', label: 'Registrar Maletas' },
    { href: '/simulador', icon: '⚙️', label: 'Simulador' },
    { href: '/operacion-dia-dia', icon: '⏱️', label: 'Operación Día a Día' },
    { href: '/simulacion-periodo', icon: '📅', label: 'Simulación Período' },
    { href: '/simulacion-colapso', icon: '💥', label: 'Simulación Colapso' },
    { href: '/rastreo', icon: '🔍', label: 'Rastreo' },
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
      </nav>

      <div className="sidebar-footer">
        <div className="profile-section">
          <div className="profile-avatar">👤</div>
          <div className="profile-info">
            <div className="profile-name">Admin User</div>
            <div className="profile-email">admin@tasf.com</div>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          🚪 Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
