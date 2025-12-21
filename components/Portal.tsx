import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
}

export function Portal({ children }: PortalProps) {
  if (typeof document === "undefined") return null;

  const el = document.getElementById("portal-root");

  // Si portal-root n'existe pas, c'est une erreur de setup HTML.
  // On crée un fallback pour éviter un crash, et on log en DEV.
  if (!el) {
    if (import.meta.env.DEV) {
      console.warn(
        '[Portal][DEV] #portal-root introuvable dans index.html. Il devrait exister. Création fallback.'
      );
    }
    const fallback = document.createElement("div");
    fallback.id = "portal-root";
    document.body.appendChild(fallback);
    return createPortal(children, fallback);
  }

  return createPortal(children, el);
}
