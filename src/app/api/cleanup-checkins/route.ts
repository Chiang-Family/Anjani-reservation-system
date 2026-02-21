import { NextResponse } from 'next/server';
import { getNotionClient } from '@/lib/notion/client';
import { getAllStudents } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getLatestPaymentByStudent } from '@/lib/notion/payments';

/**
 * 一次性清除舊打卡紀錄 API
 *
 * GET  /api/cleanup-checkins          → dry run，列出每位學員會刪除幾筆
 * POST /api/cleanup-checkins?run=true → 實際刪除
 *
 * 邏輯：刪除每位學員最近一次繳費日期「之前」的打卡紀錄，繳費當天的打卡保留。
 */

async function computeDeletions() {
  const students = await getAllStudents();
  const results: {
    studentName: string;
    latestPaymentDate: string | null;
    totalCheckins: number;
    toDelete: number;
    deleteIds: string[];
  }[] = [];

  for (const student of students) {
    const latestPayment = await getLatestPaymentByStudent(student.id);
    if (!latestPayment) {
      results.push({
        studentName: student.name,
        latestPaymentDate: null,
        totalCheckins: 0,
        toDelete: 0,
        deleteIds: [],
      });
      continue;
    }

    const paymentDate = latestPayment.createdAt; // YYYY-MM-DD
    const checkins = await getCheckinsByStudent(student.id);

    const toDeleteIds = checkins
      .filter((c) => c.classDate < paymentDate) // strict < keeps payment day
      .map((c) => c.id);

    results.push({
      studentName: student.name,
      latestPaymentDate: paymentDate,
      totalCheckins: checkins.length,
      toDelete: toDeleteIds.length,
      deleteIds: toDeleteIds,
    });
  }

  return results;
}

export async function GET() {
  const results = await computeDeletions();

  const summary = results
    .filter((r) => r.toDelete > 0)
    .map(({ studentName, latestPaymentDate, totalCheckins, toDelete }) => ({
      studentName,
      latestPaymentDate,
      totalCheckins,
      toDelete,
      keep: totalCheckins - toDelete,
    }));

  const totalToDelete = summary.reduce((sum, r) => sum + r.toDelete, 0);

  return NextResponse.json({
    mode: 'dry-run',
    totalStudents: results.length,
    studentsAffected: summary.length,
    totalToDelete,
    details: summary,
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('run') !== 'true') {
    return NextResponse.json(
      { error: '請加上 ?run=true 確認執行' },
      { status: 400 }
    );
  }

  const results = await computeDeletions();
  const notion = getNotionClient();

  let deleted = 0;
  for (const r of results) {
    for (const pageId of r.deleteIds) {
      await notion.pages.update({ page_id: pageId, archived: true });
      deleted++;
    }
  }

  return NextResponse.json({
    mode: 'executed',
    deleted,
  });
}
