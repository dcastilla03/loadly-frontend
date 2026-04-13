'use client';

import { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';

export function ClientWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="main-wrapper">
        {children}
      </div>
    </>
  );
}
