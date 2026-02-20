import type { messagingApi } from '@line/bot-sdk';
import type { ClassSlot } from '@/types';
import { classSlotCard } from './class-slot-card';

type FlexContainer = messagingApi.FlexContainer;

export function classSlotList(slots: ClassSlot[]): FlexContainer {
  if (slots.length === 1) {
    return classSlotCard(slots[0]);
  }

  return {
    type: 'carousel',
    contents: slots.slice(0, 10).map(classSlotCard),
  };
}
