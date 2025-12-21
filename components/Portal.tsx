import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
}

export function Portal({ children }: PortalProps) {
  if (typeof document === "undefined") return null;

  const el = document.getElementById("portal-root");

  if (!el) {
    // Pas de fallback en prod => pas de doublons, pas de couches fantômes
    if (import.meta.env.DEV) {
      console.warn('[Portal][DEV] #portal-root introuvable. Vérifie index.html.');
    }
    return null;
  }

  return createPortal(children, el);
}
