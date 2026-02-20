import type { messagingApi } from '@line/bot-sdk';
import type { Reservation } from '@/types';
import { reservationCard } from './reservation-card';

type FlexContainer = messagingApi.FlexContainer;

export function reservationList(reservations: Reservation[]): FlexContainer {
  if (reservations.length === 1) {
    return reservationCard(reservations[0]);
  }

  return {
    type: 'carousel',
    contents: reservations.slice(0, 10).map(reservationCard),
  };
}
