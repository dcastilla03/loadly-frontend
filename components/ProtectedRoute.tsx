'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // No proteger la ruta de login
    if (pathname === '/login') return;

    // Verificar si hay token de autenticación
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.push('/login');
    }
  }, [pathname, router]);

  return <>{children}</>;
}
