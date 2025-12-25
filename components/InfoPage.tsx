import React from 'react';
import { MapPin, Clock, Phone, Mail } from 'lucide-react';

const weekdayNameToIndex: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6
};

const getBrusselsWeekdayIndex = (): number => {
  try {
    const weekday = new Intl.DateTimeFormat('fr-BE', {
      weekday: 'long',
      timeZone: 'Europe/Brussels'
    })
      .format(new Date())
      .toLowerCase();

    return weekdayNameToIndex[weekday] ?? new Date().getDay();
  } catch {
    return new Date().getDay();
  }
};

export const InfoPage: React.FC = () => {
  const todayIndex = getBrusselsWeekdayIndex();
  const hours = [
    { day: 'Lundi', hours: '11h00 – 23h00', index: 1 },
    { day: 'Mardi', hours: '11h00 – 23h00', index: 2 },
    { day: 'Mercredi', hours: '11h00 – 23h00', index: 3 },
    { day: 'Jeudi', hours: '11h00 – 23h00', index: 4 },
    { day: 'Vendredi', hours: '11h00 – 23h00', index: 5 },
    { day: 'Samedi', hours: '11h00 – 23h00', index: 6 },
    { day: 'Dimanche', hours: '16h30 – 23h00', index: 0 }
  ];

  return (
    <div className="bg-white min-h-screen">
       {/* Header */}
       <div className="bg-snack-black text-white py-16">
         <div className="container mx-auto px-4 text-center">
            <span className="text-snack-gold font-display font-bold uppercase tracking-widest text-sm">Pratique</span>
            <h1 className="text-5xl font-display font-bold uppercase mt-2">Infos & Horaires</h1>
         </div>
       </div>

       <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
             
             {/* Hours Card */}
             <div className="bg-gray-50 p-8 rounded-lg border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-snack-gold p-3 rounded-full text-snack-black">
                        <Clock size={24} />
                    </div>
                    <h2 className="text-2xl font-display font-bold uppercase text-snack-black">Horaires d'ouverture</h2>
                </div>
                
                <div className="space-y-4 text-lg">
                    {hours.map((item, index) => {
                      const isToday = item.index === todayIndex;
                      const isLast = index === hours.length - 1;

                      return (
                        <div
                          key={item.day}
                          className={`flex justify-between pb-2${isLast ? '' : ' border-b border-gray-200'}`}
                        >
                          <span className={`font-medium ${isToday ? 'text-snack-gold' : 'text-gray-600'}`}>
                            {item.day}
                          </span>
                          <span className={`font-bold ${isToday ? 'text-snack-gold' : 'text-snack-black'}`}>
                            {item.hours}
                          </span>
                        </div>
                      );
                    })}
                </div>
             </div>

             {/* Location Card */}
             <div className="space-y-8">
                 <div className="bg-snack-black text-white p-8 rounded-lg shadow-lg">
                    <div className="flex items-start gap-4 mb-6">
                        <MapPin className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Adresse</h3>
                            <p className="text-xl text-gray-300 leading-relaxed">
                                7 Place de Wasmes<br/>
                                7340 Colfontaine<br/>
                                Belgique
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 mb-6">
                        <Phone className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Téléphone</h3>
                            <a href="tel:+32465671893" className="text-xl text-gray-300 hover:text-snack-gold transition-colors">
                                +32 465 67 18 93
                            </a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <Mail className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Email</h3>
                            <a href="mailto:alahammouda2016@gmail.com" className="text-xl text-gray-300 hover:text-snack-gold transition-colors break-all">
                                alahammouda2016@gmail.com
                            </a>
                        </div>
                    </div>
                 </div>

                 <div className="bg-white p-2 rounded-lg shadow-md border border-gray-200 h-64">
                    <iframe 
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2543.8889977632!2d3.8397!3d50.4006!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c24f9a7c7a7a7f%3A0x123456789abcdef!2sPlace%20de%20Wasmes%207%2C%207340%20Colfontaine%2C%20Belgium!5e0!3m2!1sen!2sbe!4v1620000000000!5m2!1sen!2sbe" 
                        width="100%" 
                        height="100%" 
                        style={{ border: 0 }} 
                        allowFullScreen={true} 
                        loading="lazy"
                        title="Google Maps Snack Family 2"
                        className="rounded"
                    ></iframe>
                 </div>
             </div>

          </div>
       </div>
    </div>
  );
};
