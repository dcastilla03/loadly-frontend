'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

  // Cargar username guardado si existe
  useEffect(() => {
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validación de credenciales (admin/admin para desarrollo)
      if (username === 'admin' && password === 'admin') {
        localStorage.setItem('authToken', 'demo-token-' + Date.now());
        if (rememberMe) {
          localStorage.setItem('savedUsername', username);
        }
        router.push('/');
      } else {
        setError('Usuario o contraseña incorrecto');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      {/* Fondo decorativo */}
      <div className={styles.backgroundGradient}></div>
      <div className={styles.floatingShape1}></div>
      <div className={styles.floatingShape2}></div>

      {/* Contenedor del formulario */}
      <div className={styles.loginBox}>
        {/* Header con logo */}
        <div className={styles.logoSection}>
          <div className={styles.logoWrapper}>
            <img src="/logo.svg" alt="Loadly Logo" className={styles.logo} />
          </div>
          <h1 className={styles.title}>Loadly</h1>
          <p className={styles.subtitle}>Sistema de Gestión de Envíos</p>
        </div>

        {/* Banner de Desarrollo Simple */}
        <div className={styles.devBanner}>
          <small className={styles.devLabel}>Desarrollo - Usuario: <strong>admin</strong> | Contraseña: <strong>admin</strong></small>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.errorMessage}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          {/* Campo Usuario */}
          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.label}>
              Usuario
            </label>
            <input
              id="username"
              type="text"
              placeholder="Ingresa tu usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className={styles.input}
              required
            />
          </div>

          {/* Campo Contraseña */}
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className={styles.input}
              required
            />
          </div>

          {/* Checkbox Recordarme */}
          <div className={styles.checkboxGroup}>
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              className={styles.checkbox}
            />
            <label htmlFor="rememberMe" className={styles.checkboxLabel}>
              Recuérdame en este dispositivo
            </label>
          </div>

          {/* Botón Iniciar Sesión */}
          <button
            type="submit"
            disabled={isLoading}
            className={styles.submitButton}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner}></span>
                Iniciando sesión...
              </>
            ) : (
              <>
                <span className={styles.buttonIcon}></span>
                Iniciar Sesión
              </>
            )}
          </button>

          {/* Enlace de ayuda */}
          <div className={styles.helpText}>
            <p className={styles.helpInfo}>
              ¿Problemas para acceder?{' '}
              <a href="#" className={styles.helpLink}>
                Contactar Soporte
              </a>
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerText}>
            © 2026 Loadly. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
