export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const motionSafeTransition = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
};

export const motionSafeHover = {
  y: -2,
  boxShadow: '0 10px 22px rgba(0, 0, 0, 0.12)',
};

export const motionSafeTap = {
  scale: 0.98,
};
