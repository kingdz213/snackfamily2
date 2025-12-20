import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  container?: Element | DocumentFragment | null;
}

export function Portal({ children, container }: PortalProps) {
  if (typeof document === 'undefined') return null;

  const target = container ?? document.body;

  if (!target) return null;

  return createPortal(children, target);
}
