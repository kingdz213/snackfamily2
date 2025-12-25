import React, { useState } from 'react';
import { MENU_CATEGORIES } from '../data/menuData';
import { MenuItem, MenuCategory } from '../types';
import { Plus } from 'lucide-react';
import { prefersReducedMotion } from '@/src/lib/motion';

interface OrderPageProps {
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
}

export const OrderPage: React.FC<OrderPageProps> = ({ openOrderModal }) => {
  const [activeCategory, setActiveCategory] = useState('assiettes');
  const reduceMotion = prefersReducedMotion();

  const filteredCategory = MENU_CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="bg-gray-100 min-h-screen h-full flex flex-col">
      
      {/* Mobile Category Select */}
      <div className="md:hidden p-4 bg-white sticky top-0 z-20 shadow-sm">
          <select 
              value={activeCategory} 
              onChange={(e) => setActiveCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded font-bold uppercase text-sm"
          >
              {MENU_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.title}</option>
              ))}
          </select>
      </div>

      {/* Desktop Category Filter Bar */}
      <div className="hidden md:flex flex-wrap justify-center gap-2 p-6 bg-white shadow-sm sticky top-20 z-20">
            {MENU_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                      activeCategory === cat.id 
                      ? 'bg-snack-black text-snack-gold shadow-md' 
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat.title.replace(/^\d+\.\s/, '')}
                </button>
            ))}
      </div>

      {/* Products Grid */}
      <div className="p-4 md:p-8 pb-32 container mx-auto">
          {filteredCategory && (
              <div className="max-w-6xl mx-auto">
                  <div className="mb-6 text-center md:text-left">
                      <h2 className="text-3xl font-display font-bold uppercase text-snack-black">{filteredCategory.title}</h2>
                      <p className="text-gray-500 text-sm">{filteredCategory.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredCategory.items.map((item, idx) => {
                          return (
                            <div 
                                key={idx}
                                className={`premium-card text-left bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-full ${
                                    reduceMotion ? 'transition-none' : 'transition-all duration-200 hover:shadow-md hover:-translate-y-1'
                                } ${reduceMotion ? '' : 'hover:border-snack-gold'} ${reduceMotion ? '' : 'active:scale-[0.98] active:border-green-600'} ${
                                    item.unavailable ? 'opacity-60 grayscale' : ''
                                }`}
                            >
                                <div className="w-full">
                                    <div className="mb-4">
                                        {item.imageUrl ? (
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="w-full h-36 md:h-40 object-cover rounded-md"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-36 md:h-40 rounded-md bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                Photo à venir
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-snack-black text-xl leading-tight">{item.name}</span>
                                        {item.unavailable && (
                                            <span className="bg-red-100 text-red-600 text-[10px] font-bold uppercase px-2 py-1 rounded">Indisponible</span>
                                        )}
                                    </div>
                                    {item.description && <p className="text-sm text-gray-400 mt-2">{item.description}</p>}
                                </div>
                                
                                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between w-full">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xl text-snack-black">{Number(item.price).toFixed(2)}€</span>
                                        {item.priceSecondary && (
                                            <span className="text-[10px] text-gray-400 font-medium uppercase">
                                                {filteredCategory.id === 'mitraillettes' ? 'Mitraillette' : 'Menu'}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {!item.unavailable && (
                                        <button 
                                          onClick={() => openOrderModal(item, filteredCategory)}
                                          className={`cta-premium bg-snack-gold text-snack-black px-4 py-2 rounded font-bold uppercase text-sm flex items-center gap-2 transition-all glow-soft shine-sweep ${
                                            reduceMotion ? '' : 'hover:bg-black hover:text-snack-gold hover:-translate-y-0.5 active:scale-[0.98]'
                                          }`}
                                        >
                                            <span>Ajouter</span>
                                            <Plus size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                          );
                      })}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
