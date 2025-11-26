import React from 'react';
import { Phone, Mail } from 'lucide-react';

export const ContactPage: React.FC = () => {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        
        <div className="text-center mb-12">
            <h1 className="text-5xl font-display font-bold text-snack-black uppercase mb-4">Contactez-nous</h1>
            <p className="text-gray-500 text-lg">Une question ? Une commande spéciale ? Nous sommes là pour vous.</p>
        </div>

        <div className="max-w-2xl mx-auto">
            
            {/* Direct Contact */}
            <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100">
                <h2 className="text-2xl font-display font-bold text-snack-black uppercase mb-6 border-b-2 border-snack-gold inline-block pb-1">Coordonnées</h2>
                
                <div className="space-y-6">
                    <a href="tel:+32465671893" className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                            <Phone size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase font-bold">Téléphone</p>
                            <p className="text-xl font-bold text-snack-black group-hover:text-green-600 transition-colors">+32 465 67 18 93</p>
                        </div>
                    </a>

                    <a href="mailto:alahammouda2016@gmail.com" className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Mail size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase font-bold">Email</p>
                            <p className="text-lg font-medium text-snack-black group-hover:text-blue-600 transition-colors break-all">alahammouda2016@gmail.com</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>

        {/* FAQ Mini Section */}
        <div className="mt-16 text-center">
            <h3 className="text-xl font-bold text-snack-black uppercase mb-4">Questions Fréquentes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-white p-4 rounded border border-gray-200">
                    <p className="font-bold text-snack-gold mb-1">Livrez-vous à domicile ?</p>
                    <p className="text-sm text-gray-600">Oui, nous livrons dans un rayon de 5km autour de Colfontaine le soir.</p>
                </div>
                <div className="bg-white p-4 rounded border border-gray-200">
                    <p className="font-bold text-snack-gold mb-1">Acceptez-vous la carte ?</p>
                    <p className="text-sm text-gray-600">Oui, nous acceptons Bancontact et Espèces au comptoir et en livraison.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};