import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { RESERVATION_PROPS } from './types';
import { RESERVATION_STATUS, type ReservationStatus } from '@/lib/config/constants';
import type { Reservation } from '@/types';

function getRichTextValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  if (prop.type === 'title') {
    const titleArr = prop.title as Array<{ plain_text: string }>;
    return titleArr?.[0]?.plain_text ?? '';
  }
  if (prop.type === 'select') {
    const sel = prop.select as { name: string } | null;
    return sel?.name ?? '';
  }
  return '';
}

function getDateValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  const dateObj = prop.date as { start?: string } | null;
  return dateObj?.start ?? '';
}

function getRelationIds(prop: Record<string, unknown>): string[] {
  if (!prop) return [];
  const relations = prop.relation as Array<{ id: string }> | undefined;
  return relations?.map((r) => r.id) ?? [];
}

function extractReservation(page: Record<string, unknown>): Reservation {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const studentRelation = getRelationIds(props[RESERVATION_PROPS.STUDENT]);
  const slotRelation = getRelationIds(props[RESERVATION_PROPS.CLASS_SLOT]);

  return {
    id: (page as { id: string }).id,
    studentId: studentRelation[0] ?? '',
    classSlotId: slotRelation[0] ?? '',
    status: getRichTextValue(props[RESERVATION_PROPS.STATUS]) as ReservationStatus,
    checkinTime: getDateValue(props[RESERVATION_PROPS.CHECKIN_TIME]) || undefined,
    bookingTime: getDateValue(props[RESERVATION_PROPS.BOOKING_TIME]) || undefined,
  };
}

export async function createReservation(params: {
  studentId: string;
  studentName: string;
  classSlotId: string;
  classSlotTitle: string;
  date: string;
}): Promise<Reservation> {
  const notion = getNotionClient();
  const now = new Date().toISOString();

  const page = await notion.pages.create({
    parent: { database_id: getEnv().NOTION_RESERVATIONS_DB_ID },
    properties: {
      [RESERVATION_PROPS.TITLE]: {
        title: [{ text: { content: `${params.studentName} - ${params.classSlotTitle}` } }],
      },
      [RESERVATION_PROPS.STUDENT]: {
        relation: [{ id: params.studentId }],
      },
      [RESERVATION_PROPS.CLASS_SLOT]: {
        relation: [{ id: params.classSlotId }],
      },
      [RESERVATION_PROPS.STATUS]: {
        select: { name: RESERVATION_STATUS.RESERVED },
      },
      [RESERVATION_PROPS.BOOKING_TIME]: {
        date: { start: now },
      },
    } as Parameters<typeof notion.pages.create>[0]['properties'],
  });

  return extractReservation(page as unknown as Record<string, unknown>);
}

export async function getReservationsByStudent(
  studentId: string,
  status?: ReservationStatus
): Promise<Reservation[]> {
  const notion = getNotionClient();

  type NotionFilter = Parameters<typeof notion.databases.query>[0]['filter'];

  const studentFilter = {
    property: RESERVATION_PROPS.STUDENT,
    relation: { contains: studentId },
  };

  let filter: NotionFilter;

  if (status) {
    filter = {
      and: [
        studentFilter,
        {
          property: RESERVATION_PROPS.STATUS,
          select: { equals: status },
        },
      ],
    } as NotionFilter;
  } else {
    filter = studentFilter as NotionFilter;
  }

  const res = await notion.databases.query({
    database_id: getEnv().NOTION_RESERVATIONS_DB_ID,
    filter,
    sorts: [
      { property: RESERVATION_PROPS.BOOKING_TIME, direction: 'descending' },
    ],
  });

  return res.results.map((p) =>
    extractReservation(p as unknown as Record<string, unknown>)
  );
}

export async function getReservationsBySlot(
  classSlotId: string,
  status?: ReservationStatus
): Promise<Reservation[]> {
  const notion = getNotionClient();

  type NotionFilter = Parameters<typeof notion.databases.query>[0]['filter'];

  const slotFilter = {
    property: RESERVATION_PROPS.CLASS_SLOT,
    relation: { contains: classSlotId },
  };

  let filter: NotionFilter;

  if (status) {
    filter = {
      and: [
        slotFilter,
        {
          property: RESERVATION_PROPS.STATUS,
          select: { equals: status },
        },
      ],
    } as NotionFilter;
  } else {
    filter = slotFilter as NotionFilter;
  }

  const res = await notion.databases.query({
    database_id: getEnv().NOTION_RESERVATIONS_DB_ID,
    filter,
  });

  return res.results.map((p) =>
    extractReservation(p as unknown as Record<string, unknown>)
  );
}

export async function findActiveReservation(
  studentId: string,
  classSlotId: string
): Promise<Reservation | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_RESERVATIONS_DB_ID,
    filter: {
      and: [
        {
          property: RESERVATION_PROPS.STUDENT,
          relation: { contains: studentId },
        },
        {
          property: RESERVATION_PROPS.CLASS_SLOT,
          relation: { contains: classSlotId },
        },
        {
          property: RESERVATION_PROPS.STATUS,
          select: { equals: RESERVATION_STATUS.RESERVED },
        },
      ],
    },
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractReservation(res.results[0] as unknown as Record<string, unknown>);
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  checkinTime?: string
): Promise<void> {
  const notion = getNotionClient();

  type PropValue = Parameters<typeof notion.pages.update>[0]['properties'];

  const properties: PropValue = {
    [RESERVATION_PROPS.STATUS]: {
      select: { name: status },
    },
  } as PropValue;

  if (checkinTime) {
    (properties as Record<string, unknown>)[RESERVATION_PROPS.CHECKIN_TIME] = {
      date: { start: checkinTime },
    };
  }

  await notion.pages.update({
    page_id: reservationId,
    properties,
  });
}

export async function getReservationById(reservationId: string): Promise<Reservation | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: reservationId });
    return extractReservation(page as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}
