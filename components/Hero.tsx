import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ArrowRight } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section id="home" className="relative h-[85vh] w-full overflow-hidden bg-snack-black">
      {/* Background Image - Mitraillette/Snack Focus */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1623246123320-4d3d358b1da6?q=80&w=1920&auto=format&fit=crop" 
          alt="Mitraillette belge avec frites" 
          className="w-full h-full object-cover object-center opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-snack-black via-transparent to-snack-black/80"></div>
      </div>

      {/* Content */}
      <div className="relative z-20 h-full flex flex-col justify-center items-center text-center px-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl"
        >
          <span className="inline-block py-1 px-3 border border-snack-gold text-snack-gold text-xs font-bold uppercase tracking-[0.2em] mb-6 rounded">
            Depuis 2019
          </span>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-6 uppercase leading-tight">
            Snack Family <span className="text-snack-gold">2</span><br/>
            <span className="text-3xl md:text-5xl text-gray-200 font-normal normal-case">Votre snack friterie à Wasmes</span>
          </h1>
          
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center mt-8">
            <a 
              href="#menu" 
              className="bg-snack-gold hover:bg-white text-snack-black px-8 py-4 rounded font-display font-bold text-xl uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              <span>Commander maintenant</span>
              <ArrowRight size={20} />
            </a>
            
            <a 
              href="#infos" 
              className="text-white border-2 border-white/30 hover:border-white px-8 py-3.5 rounded font-display font-bold text-lg uppercase tracking-wider transition-all hover:bg-white/10"
            >
              Infos & Horaires
            </a>
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 text-white/70"
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <ChevronDown size={32} />
      </motion.div>
    </section>
  );
};