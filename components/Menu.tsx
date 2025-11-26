import React from 'react';
// This component seems unused in the main routing (App.tsx uses MenuPage), 
// but we keep it valid.
export const Menu: React.FC = () => {
  return (
    <section id="menu" className="py-20 bg-snack-light text-center">
      <p className="text-gray-500">Veuillez utiliser la page Menu dédiée pour commander.</p>
    </section>
  );
};