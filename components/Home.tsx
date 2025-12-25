import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Star, Utensils } from 'lucide-react';
import { Page } from '../types';
import { Embers } from '@/src/components/Embers';

interface HomeProps {
  navigateTo: (page: Page) => void;
}

export const Home: React.FC<HomeProps> = ({ navigateTo }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 50, damping: 20 }
    }
  };

  const titleVariants = {
      hidden: { opacity: 0, y: -20 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="w-full">
      {/* HERO SECTION - Centered & Updated Background */}
      <section className="relative min-h-screen w-full overflow-hidden bg-snack-black flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          {/* Hero Background: Updated with user specific image */}
          <img 
            src="https://t3.ftcdn.net/jpg/00/95/76/70/360_F_95767085_XpMCX6Cq49xlhMcTM5s8mbguWpo9eCt2.jpg" 
            alt="Snack Family 2 Background" 
            className="w-full h-full object-cover object-center opacity-50" 
            fetchPriority="high"
          />
          <Embers className="z-20" count={14} maxOpacity={0.28} speed={16} />
          <div className="absolute inset-0 bg-black/60 z-10"></div>
        </div>

        {/* Content Container - Removed pt-20 for perfect vertical centering */}
        <div className="relative z-30 container mx-auto px-4 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-5xl w-full flex flex-col items-center rounded-3xl border border-white/10 bg-black/30 p-6 sm:p-10 shadow-2xl backdrop-blur-sm shine-sweep"
          >
            {/* Badge - Perfectly Centered */}
            <div className="mb-8 flex justify-center">
                <span className="bg-snack-gold text-snack-black px-6 py-2 font-display font-bold uppercase tracking-[0.2em] text-sm rounded shadow-lg border border-white/10">
                    Ouvert Midi & Soir
                </span>
            </div>
            
            {/* Title - Perfectly Centered */}
            <h1 
              className="text-5xl md:text-7xl lg:text-9xl font-display font-bold text-white mb-6 uppercase leading-none drop-shadow-2xl tracking-tight text-center"
              style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            >
              Le Vrai Goût <br/><span className="text-snack-gold">Belge</span>
            </h1>
            
            {/* Subtitle - Perfectly Centered */}
            <p className="text-lg md:text-2xl text-gray-200 font-light max-w-3xl mx-auto mb-10 leading-relaxed drop-shadow-md text-center">
              Frites fraîches, viandes savoureuses et mitraillettes généreuses.<br className="hidden md:block"/>
              <span className="font-medium text-white">L'authentique snack de Colfontaine.</span>
            </p>
            
            {/* Buttons - Perfectly Centered & Aligned */}
            <div className="flex flex-col sm:flex-row gap-5 w-full justify-center items-center">
              <button 
                onClick={() => navigateTo('commander')}
                className="cta-premium bg-snack-gold hover:bg-white text-snack-black min-w-[200px] px-8 py-4 rounded font-display font-bold text-lg uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl glow-soft shine-sweep"
              >
                <span>Commander</span>
                <ArrowRight size={20} />
              </button>
              
              <button 
                onClick={() => navigateTo('menu')}
                className="cta-premium bg-white/10 backdrop-blur-sm border-2 border-white text-white hover:bg-white hover:text-snack-black min-w-[200px] px-8 py-4 rounded font-display font-bold text-lg uppercase tracking-wider transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-2xl glow-soft"
              >
                Voir le Menu
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SPECIALTIES SECTION */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4">
            <motion.div 
              className="text-center mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={titleVariants}
            >
                <span className="text-snack-gold font-display font-bold text-sm uppercase tracking-[0.2em] block mb-2">Qualité & Tradition</span>
                <h2 className="text-4xl md:text-6xl font-display font-bold text-snack-black uppercase">Nos Spécialités</h2>
                <div className="w-24 h-1.5 bg-snack-black mx-auto mt-6 rounded-full"></div>
            </motion.div>

            <motion.div 
                className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 max-w-7xl mx-auto"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
            >
                
                {/* CARD 1: MITRAILLETTE */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://external-preview.redd.it/i-ate-mitraillette-belgian-sandwich-v0-0ldkUUwxVvwj89WsLNeh0V1LA5knt3wsvkAijP-kO48.jpg?width=1080&crop=smart&auto=webp&s=c1a48e77958b210ae29deebccfd8ea66688f3991" 
                            alt="Mitraillette Belge - Baguette frites sauce" 
                            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Utensils size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Mitraillette</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Le classique belge : demi-baguette, viande au choix, frites fraîches et sauce généreuse.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Choisir</span>
                    </div>
                </motion.div>

                {/* CARD 2: FRITES & SNACKS */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://lvdneng.rosselcdn.net/sites/default/files/dpistyles_v2/ena_16_9_extra_big/2019/08/02/node_620600/40427962/public/2019/08/02/B9720457242Z.1_20190802154932_000%2BGFQE6BVPL.1-0.jpg?itok=V1WaHWU91564754610" 
                            alt="Frites et Snacks Belges sur plateau" 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Star size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Frites & Snacks</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Une envie de Mexicano, Fricadelle ou Poulycroc ? Accompagnez-les de nos frites dorées.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Voir la carte</span>
                    </div>
                </motion.div>

                {/* CARD 3: DURUMS */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://latelierdurum.fr/wp-content/uploads/2024/10/Capture-decran-2024-10-26-125007-edited.png" 
                            alt="Dürüm Kebab Roulé" 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Utensils size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Dürüms</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Galette chaude roulée, garnie de viande grillée et de crudités croquantes.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Composer</span>
                    </div>
                </motion.div>

            </motion.div>
        </div>
      </section>

      {/* PROMO BANNER */}
      <section className="py-20 bg-snack-gold">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-center gap-12 text-center md:text-left">
            <div className="bg-snack-black text-white p-6 rounded-full shadow-2xl shrink-0">
                <Utensils size={40} />
            </div>
            <div className="max-w-xl">
                <h2 className="text-3xl md:text-4xl font-display font-bold text-snack-black uppercase mb-3">Faim de loup ?</h2>
                <p className="text-snack-black/80 font-medium text-lg leading-relaxed">
                    Évitez l'attente ! Commandez en ligne pour le service du soir et récupérez votre repas chaud.
                </p>
            </div>
            <div>
                <button 
                    onClick={() => navigateTo('commander')}
                    className="cta-premium bg-snack-black text-white hover:bg-white hover:text-black px-10 py-5 rounded font-display font-bold text-xl uppercase tracking-wide transition-all shadow-2xl transform hover:-translate-y-1 whitespace-nowrap flex items-center gap-3 glow-soft shine-sweep"
                >
                    <span>Je commande</span>
                    <ArrowRight size={20} />
                </button>
            </div>
        </div>
      </section>
    </div>
  );
}
