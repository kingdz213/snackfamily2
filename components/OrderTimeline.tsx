import React from 'react';
import { CheckCircle, ClipboardCheck, Truck, Utensils } from 'lucide-react';

export type TimelineStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | string;

type TimelineStep = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const steps: TimelineStep[] = [
  { key: 'RECEIVED', label: 'Commande reçue', Icon: ClipboardCheck },
  { key: 'IN_PREPARATION', label: 'En préparation', Icon: Utensils },
  { key: 'OUT_FOR_DELIVERY', label: 'En livraison', Icon: Truck },
  { key: 'DELIVERED', label: 'Livrée', Icon: CheckCircle },
];

const statusToStepIndex = (status: TimelineStatus): number => {
  if (status === 'IN_PREPARATION') return 1;
  if (status === 'OUT_FOR_DELIVERY') return 2;
  if (status === 'DELIVERED') return 3;
  return 0;
};

interface OrderTimelineProps {
  status: TimelineStatus;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ status }) => {
  const currentIndex = statusToStepIndex(status);
  const isUnknown =
    !['RECEIVED', 'PENDING_PAYMENT', 'PAID_ONLINE', 'IN_PREPARATION', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status);

  return (
    <div className="space-y-3">
      <div className="order-timeline">
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'completed' : index === currentIndex ? 'active' : 'pending';
          const Icon = step.Icon;
          return (
            <div key={step.key} className={`timeline-step ${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="timeline-dot">
                <Icon size={16} />
              </span>
              <div className="timeline-label">{step.label}</div>
            </div>
          );
        })}
      </div>
      {isUnknown && (
        <p className="text-xs text-gray-500">
          Statut en cours de mise à jour. Les informations seront rafraîchies automatiquement.
        </p>
      )}
    </div>
  );
};
