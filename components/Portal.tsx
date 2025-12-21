import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
}

export function Portal({ children }: PortalProps) {
  if (typeof document === 'undefined') return null;

  let el = document.getElementById('portal-root');

  if (!el) {
    el = document.createElement('div');
    el.id = 'portal-root';
    document.body.appendChild(el);
  }

  return createPortal(children, el);
}
