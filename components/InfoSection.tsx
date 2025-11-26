import React from 'react';
import { Clock, MapPin, Phone, Mail } from 'lucide-react';

export const InfoSection: React.FC = () => {
  return (
    <section id="infos" className="bg-snack-black text-white scroll-mt-20">
      {/* Hidden anchor for contact compatibility */}
      <div id="contact" className="absolute -top-20"></div>
      
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Info & Hours */}
          <div className="space-y-10">
             <div>
                <span className="text-snack-gold font-display font-bold uppercase tracking-widest text-sm mb-2 block">Pratique</span>
                <h2 className="text-4xl font-display font-bold uppercase mb-8">Infos & Contact</h2>
                
                <div className="flex items-start gap-4 mb-6">
                   <MapPin className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Adresse</h4>
                      <p className="text-gray-300">7 Place Wasmes<br/>7340 Colfontaine, Belgique</p>
                   </div>
                </div>

                <div className="flex items-start gap-4 mb-6">
                   <Phone className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Téléphone</h4>
                      <a href="tel:+32465671893" className="text-gray-300 hover:text-snack-gold transition-colors">
                        +32 465 67 18 93
                      </a>
                   </div>
                </div>

                <div className="flex items-start gap-4">
                   <Mail className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Email</h4>
                      <a href="mailto:alahammouda2016@gmail.com" className="text-gray-300 hover:text-snack-gold transition-colors break-all">
                        alahammouda2016@gmail.com
                      </a>
                   </div>
                </div>
             </div>

             <div className="bg-white/5 p-8 rounded border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                   <Clock className="text-snack-gold" size={24} />
                   <h3 className="font-display font-bold text-2xl uppercase">Horaires d'ouverture</h3>
                </div>
                <div className="space-y-4">
                   <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <span className="font-medium">Lundi – Samedi</span>
                      <span className="text-snack-gold font-bold">11h00 – 23h00</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <span className="font-medium">Dimanche</span>
                      <span className="text-snack-gold font-bold">16h30 – 23h00</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Map */}
          <div className="h-full min-h-[400px] rounded overflow-hidden bg-gray-800 border border-white/10 relative z-10">
             <iframe 
               src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2543.8889977632!2d3.8397!3d50.4006!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c24f9a7c7a7a7f%3A0x123456789abcdef!2sPlace%20de%20Wasmes%207%2C%207340%20Colfontaine%2C%20Belgium!5e0!3m2!1sen!2sbe!4v1620000000000!5m2!1sen!2sbe" 
               width="100%" 
               height="100%" 
               style={{ border: 0 }} 
               allowFullScreen={true} 
               loading="lazy"
               title="Google Maps Snack Family 2"
               className="grayscale hover:grayscale-0 transition-all duration-500"
             ></iframe>
          </div>

        </div>
      </div>
    </section>
  );
};