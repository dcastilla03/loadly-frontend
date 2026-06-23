'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

const API_URL = 'http://localhost:8080';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

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
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ correo: username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.exito) {
        setError(data.mensaje || 'Usuario o contraseña incorrecto');
        return;
      }

      const user = data.datos;
      if (user?.token) {
        localStorage.setItem('authToken', user.token);
      }
      if (user) {
        localStorage.setItem('user', JSON.stringify({
          correo: user.correo,
          nombre: user.nombre,
          rol: user.rol,
          idCliente: user.idCliente,
          aeropuertoIdAeropuerto: user.aeropuertoIdAeropuerto,
          aeropuerto: user.aeropuerto || null,
        }));
      }

      if (rememberMe) {
        localStorage.setItem('savedUsername', username);
      } else {
        localStorage.removeItem('savedUsername');
      }

      router.push('/');
    } catch (err) {
      setError('No se pudo conectar con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.backgroundGradient}></div>
      <div className={styles.floatingShape1}></div>
      <div className={styles.floatingShape2}></div>

      <div className={styles.loginBox}>
        <div className={styles.logoSection}>
          <div className={styles.logoWrapper}>
            <img src="/logo.svg" alt="Loadly Logo" className={styles.logo} />
          </div>
          <h1 className={styles.title}>Loadly</h1>
          <p className={styles.subtitle}>Sistema de Gestión de Envíos</p>
        </div>

        <div className={styles.devBanner}>
          <small className={styles.devLabel}>Desarrollo - Correo: <strong>admin@tasf.com</strong> | Contraseña: <strong>admin</strong></small>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.errorMessage}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.label}>
              Correo
            </label>
            <input
              id="username"
              type="email"
              placeholder="Ingresa tu correo"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              className={styles.input}
              required
            />
          </div>

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

          <div className={styles.helpText}>
            <p className={styles.helpInfo}>
              ¿Problemas para acceder?{' '}
              <a href="#" className={styles.helpLink}>
                Contactar Soporte
              </a>
            </p>
          </div>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            © 2026 Loadly. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
