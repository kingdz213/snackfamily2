import React from 'react';
import { Utensils, Clock, ShoppingBag } from 'lucide-react';

export const About: React.FC = () => {
  return (
    <section id="presentation" className="relative py-20 bg-snack-black overflow-hidden">
      {/* Textured Background */}
      <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1615719413546-198b25453f85?q=80&w=1936&auto=format&fit=crop" 
            alt="Texture de fond rustique" 
            className="w-full h-full object-cover opacity-10 mix-blend-overlay" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-snack-black via-snack-black/95 to-snack-black/90"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          
          {/* Text Content */}
          <div className="w-full lg:w-1/2">
            <span className="text-snack-gold font-display font-bold uppercase tracking-widest mb-2 block text-sm">À propos de nous</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 uppercase leading-none">
              Friterie & Snack <br/><span className="text-gray-400">Authentique</span>
            </h2>
            
            <div className="w-20 h-1.5 bg-snack-gold mb-8"></div>

            <p className="text-gray-300 text-lg mb-6 leading-relaxed">
              Bienvenue chez <strong>Snack Family 2</strong>, votre friterie de référence à Wasmes. 
              Nous vous proposons une large gamme de spécialités belges : mitraillettes généreuses, frites croustillantes, 
              et viandes de qualité.
            </p>
            
            <div className="space-y-6 mt-8">
               <div className="flex items-start gap-4 group">
                  <div className="p-3 bg-white/10 rounded text-snack-gold group-hover:bg-snack-gold group-hover:text-snack-black transition-colors">
                    <Utensils size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-lg text-white uppercase">Service Matin & Midi</h4>
                    <p className="text-gray-400 text-sm">Retrouvez nos sandwichs garnis froids préparés minute pour vos pauses déjeuner.</p>
                  </div>
               </div>
               
               <div className="flex items-start gap-4 group">
                  <div className="p-3 bg-white/10 rounded text-snack-gold group-hover:bg-snack-gold group-hover:text-snack-black transition-colors">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-lg text-white uppercase">Commandes en ligne</h4>
                    <p className="text-gray-400 text-sm">Notre service de commande en ligne est disponible principalement pour le service du soir, à emporter ou en livraison.</p>
                  </div>
               </div>
            </div>
          </div>

          {/* Images - Clean Snack Food */}
          <div className="w-full lg:w-1/2 grid grid-cols-2 gap-4">
            <img 
              src="https://images.unsplash.com/photo-1573080496987-aeb4d9170d5c?q=80&w=800&auto=format&fit=crop" 
              alt="Frites belges" 
              className="w-full h-64 object-cover rounded shadow-lg transform translate-y-8 transition-all duration-500 ease-out hover:scale-105 hover:translate-y-6 border border-white/10"
            />
            <img 
              src="https://images.unsplash.com/photo-1561758033-d8f19662cb23?q=80&w=800&auto=format&fit=crop" 
              alt="Burger Snack" 
              className="w-full h-64 object-cover rounded shadow-lg transition-all duration-500 ease-out hover:scale-105 hover:-translate-y-2 border border-white/10"
            />
          </div>

        </div>
      </div>
    </section>
  );
};