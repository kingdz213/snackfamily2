import React, { useState } from 'react';
import { MENU_CATEGORIES } from '../data/menuData';
import { MenuItem, MenuCategory, SAUCES } from '../types';
import { Plus, Search } from 'lucide-react';
import { prefersReducedMotion } from '@/src/lib/motion';

interface MenuPageProps {
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({ openOrderModal }) => {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const reduceMotion = prefersReducedMotion();

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const element = document.getElementById(`cat-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter categories and items based on search query
  const filteredCategories = MENU_CATEGORIES.map(category => {
    if (!searchQuery) return category;

    const filteredItems = category.items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...category, items: filteredItems };
  }).filter(category => category.items.length > 0);

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Page Header */}
      <div className="bg-snack-black text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-display font-bold uppercase tracking-wide">Notre Carte</h1>
          <p className="text-gray-400 mt-2 max-w-2xl mx-auto mb-8">Découvrez nos spécialités belges, préparées avec passion.</p>
          
          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="text-gray-400 group-focus-within:text-snack-gold transition-colors" size={20} />
            </div>
            <input
              type="text"
              placeholder="Rechercher un produit (ex: Mitraillette, Burger...)"
              className="w-full pl-12 pr-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-snack-gold focus:bg-snack-black/50 transition-all backdrop-blur-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Categories Sidebar (Sticky) */}
          <div className="w-full lg:w-1/4">
            <div className="sticky top-24 bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-snack-gold p-4">
                <h3 className="font-display text-snack-black font-bold text-lg uppercase">Catégories</h3>
              </div>
              <ul className="flex lg:flex-col overflow-x-auto lg:overflow-visible no-scrollbar divide-y divide-gray-100">
                {filteredCategories.map((cat) => (
                  <li key={cat.id} className="flex-shrink-0">
                    <button
                      onClick={() => scrollToCategory(cat.id)}
                      data-active={activeCategory === cat.id ? 'true' : 'false'}
                      className={`menu-underline w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between text-sm font-bold uppercase tracking-wide ${
                        activeCategory === cat.id ? 'text-snack-gold bg-gray-900' : 'text-gray-600'
                      }`}
                    >
                      {cat.title.replace(/^\d+\.\s/, '')}
                    </button>
                  </li>
                ))}
                {filteredCategories.length === 0 && (
                  <li className="p-5 text-gray-500 text-sm text-center italic">
                    Aucune catégorie trouvée
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Menu List */}
          <div className="w-full lg:w-3/4 space-y-12">
            {filteredCategories.length > 0 ? (
              filteredCategories.map((cat) => (
                <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-28">
                  <div className="flex items-end gap-4 mb-6 border-b-2 border-snack-gold pb-2">
                     <h2 className="text-3xl font-display font-bold text-snack-black uppercase leading-none">
                       {cat.title}
                     </h2>
                  </div>
                  {cat.description && <p className="text-gray-500 italic mb-6 -mt-4">{cat.description}</p>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {cat.items.map((item, idx) => {
                      return (
                        <div
                          key={idx}
                          className={`premium-card bg-white p-5 rounded-lg shadow-sm border border-gray-200 group flex flex-col justify-between h-full ${
                            reduceMotion ? 'transition-none' : 'transition-all duration-200 hover:border-snack-gold hover:shadow-md hover:-translate-y-1'
                          }`}
                        >
                          <div>
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
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-lg text-snack-black group-hover:text-snack-gold transition-colors">
                                {item.name}
                              </h3>
                              {item.unavailable && (
                                <span className="bg-red-100 text-red-600 text-[10px] font-bold uppercase px-2 py-1 rounded">
                                  Indisponible
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-sm text-gray-400 mb-4">{item.description}</p>}
                          </div>

                          <div className="flex items-end justify-between mt-4 pt-4 border-t border-gray-50">
                            <div className="flex flex-col">
                                {item.priceSecondary && (
                                    <span className="text-xs text-gray-400 font-medium uppercase">
                                        Seul: {Number(item.priceSecondary).toFixed(2)}€
                                    </span>
                                )}
                                <span className="text-xl font-bold text-snack-black">
                                    {Number(item.price).toFixed(2)} €
                                </span>
                                {item.priceSecondary && (
                                    <span className="text-[10px] text-snack-gold font-bold uppercase">
                                        {cat.id === 'mitraillettes' ? 'Mitraillette' : 'Menu / Frites'}
                                    </span>
                                )}
                            </div>
                            
                            {!item.unavailable && (
                              <button 
                                onClick={() => openOrderModal(item, cat)}
                                className={`bg-snack-black text-white w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shadow-md transform active:scale-90 active:bg-green-600 active:text-white glow-soft ${
                                  reduceMotion ? '' : 'hover:bg-snack-gold hover:text-black'
                                }`}
                              >
                                <Plus size={20} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-200 text-center">
                <Search size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-bold text-snack-black mb-2">Aucun résultat trouvé</h3>
                <p className="text-gray-500">Nous n'avons trouvé aucun produit correspondant à "{searchQuery}".</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-6 text-snack-gold font-bold uppercase tracking-wide underline hover:text-black"
                >
                  Voir tout le menu
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
