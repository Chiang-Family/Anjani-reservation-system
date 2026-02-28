/**
 * Debug script: 比對 FIFO 日期邊界修正前後的分桶差異
 *
 * 找出因「日期邊界強制跳桶」而導致上課紀錄被提前歸到下一期的學員。
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/debug-fifo-boundary.ts
 */

import { getAllCoaches } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getPaymentsByStudent } from '../src/lib/notion/payments';
import { getCheckinsByStudent } from '../src/lib/notion/checkins';
import type { PaymentRecord, CheckinRecord } from '../src/types';

/** 現行 FIFO（含日期邊界跳桶 + 結轉） */
function assignBucketsOld(payments: PaymentRecord[], checkins: CheckinRecord[]) {
  const uniquePayDates = [...new Set(payments.map(p => p.createdAt))].sort();
  const buckets = uniquePayDates.map(date => {
    const periodPayments = payments.filter(p => p.createdAt === date);
    return {
      paymentDate: date,
      purchasedHours: periodPayments.reduce((sum, p) => sum + p.purchasedHours, 0),
      checkins: [] as CheckinRecord[],
      consumedMinutes: 0,
    };
  });

  const sorted = [...checkins].sort((a, b) => a.classDate.localeCompare(b.classDate));
  let bucketIdx = 0;
  const overflowCheckins: CheckinRecord[] = [];

  for (const checkin of sorted) {
    while (bucketIdx < buckets.length &&
           buckets[bucketIdx].consumedMinutes >= buckets[bucketIdx].purchasedHours * 60) {
      bucketIdx++;
    }
    while (bucketIdx < buckets.length - 1 &&
           checkin.classDate >= buckets[bucketIdx + 1].paymentDate) {
      const remainingMinutes = buckets[bucketIdx].purchasedHours * 60 - buckets[bucketIdx].consumedMinutes;
      if (remainingMinutes > 0) {
        buckets[bucketIdx + 1].purchasedHours += remainingMinutes / 60;
      }
      buckets[bucketIdx].consumedMinutes = buckets[bucketIdx].purchasedHours * 60;
      bucketIdx++;
    }
    if (bucketIdx >= buckets.length) {
      overflowCheckins.push(checkin);
    } else {
      buckets[bucketIdx].checkins.push(checkin);
      buckets[bucketIdx].consumedMinutes += checkin.durationMinutes;
    }
  }
  return { buckets, overflowCheckins };
}

/** 修正後 FIFO（只在桶耗盡時才跳桶，無結轉） */
function assignBucketsNew(payments: PaymentRecord[], checkins: CheckinRecord[]) {
  const uniquePayDates = [...new Set(payments.map(p => p.createdAt))].sort();
  const buckets = uniquePayDates.map(date => {
    const periodPayments = payments.filter(p => p.createdAt === date);
    return {
      paymentDate: date,
      purchasedHours: periodPayments.reduce((sum, p) => sum + p.purchasedHours, 0),
      checkins: [] as CheckinRecord[],
      consumedMinutes: 0,
    };
  });

  const sorted = [...checkins].sort((a, b) => a.classDate.localeCompare(b.classDate));
  let bucketIdx = 0;
  const overflowCheckins: CheckinRecord[] = [];

  for (const checkin of sorted) {
    while (bucketIdx < buckets.length &&
           buckets[bucketIdx].consumedMinutes >= buckets[bucketIdx].purchasedHours * 60) {
      bucketIdx++;
    }
    // 修正：日期邊界時，檢查當前桶剩餘時數是否足夠該堂課
    // 足夠 → 留在當前桶；不足 → 結轉剩餘並跳到下一桶
    while (bucketIdx < buckets.length - 1 &&
           checkin.classDate >= buckets[bucketIdx + 1].paymentDate) {
      const remainingMinutes = buckets[bucketIdx].purchasedHours * 60 - buckets[bucketIdx].consumedMinutes;
      if (remainingMinutes >= checkin.durationMinutes) {
        break; // 當前桶夠用，不跳桶
      }
      if (remainingMinutes > 0) {
        buckets[bucketIdx + 1].purchasedHours += remainingMinutes / 60;
      }
      buckets[bucketIdx].consumedMinutes = buckets[bucketIdx].purchasedHours * 60;
      bucketIdx++;
    }
    if (bucketIdx >= buckets.length) {
      overflowCheckins.push(checkin);
    } else {
      buckets[bucketIdx].checkins.push(checkin);
      buckets[bucketIdx].consumedMinutes += checkin.durationMinutes;
    }
  }
  return { buckets, overflowCheckins };
}

async function main() {
  console.log('=== FIFO 日期邊界修正影響分析 ===\n');

  const coaches = await getAllCoaches();
  let affectedCount = 0;

  for (const coach of coaches) {
    const students = await getStudentsByCoachId(coach.id);

    for (const student of students) {
      const [payments, checkins] = await Promise.all([
        getPaymentsByStudent(student.id),
        getCheckinsByStudent(student.id),
      ]);

      if (payments.length < 2 || checkins.length === 0) continue;

      const oldResult = assignBucketsOld(payments, checkins);
      const newResult = assignBucketsNew(payments, checkins);

      // 比對每個桶的 checkins 數量
      const maxLen = Math.max(oldResult.buckets.length, newResult.buckets.length);
      let hasDiff = false;
      const diffs: string[] = [];

      for (let i = 0; i < maxLen; i++) {
        const oldCount = oldResult.buckets[i]?.checkins.length ?? 0;
        const newCount = newResult.buckets[i]?.checkins.length ?? 0;
        const payDate = oldResult.buckets[i]?.paymentDate ?? newResult.buckets[i]?.paymentDate ?? '?';
        if (oldCount !== newCount) {
          hasDiff = true;
          const oldHours = oldResult.buckets[i]?.purchasedHours ?? 0;
          const newHours = newResult.buckets[i]?.purchasedHours ?? 0;
          diffs.push(
            `  期 ${payDate}: 舊 ${oldCount} 堂 (時數=${oldHours}h) → 新 ${newCount} 堂 (時數=${newHours}h)`,
          );
        }
      }

      if (oldResult.overflowCheckins.length !== newResult.overflowCheckins.length) {
        hasDiff = true;
        diffs.push(
          `  溢出: 舊 ${oldResult.overflowCheckins.length} 堂 → 新 ${newResult.overflowCheckins.length} 堂`,
        );
      }

      if (hasDiff) {
        affectedCount++;
        console.log(`【${coach.name}教練】${student.name}:`);
        for (const d of diffs) console.log(d);

        // 顯示被移動的課程明細
        for (let i = 0; i < maxLen; i++) {
          const oldDates = new Set(oldResult.buckets[i]?.checkins.map(c => c.classDate) ?? []);
          const newDates = new Set(newResult.buckets[i]?.checkins.map(c => c.classDate) ?? []);
          const payDate = oldResult.buckets[i]?.paymentDate ?? '?';

          const movedIn = [...newDates].filter(d => !oldDates.has(d));
          const movedOut = [...oldDates].filter(d => !newDates.has(d));
          if (movedIn.length > 0) {
            console.log(`  → 移入 期${payDate}: ${movedIn.join(', ')}`);
          }
          if (movedOut.length > 0) {
            console.log(`  ← 移出 期${payDate}: ${movedOut.join(', ')}`);
          }
        }
        console.log('');
      }
    }
  }

  if (affectedCount === 0) {
    console.log('✅ 沒有學員受到影響（所有學員的分桶結果一致）');
  } else {
    console.log(`\n共 ${affectedCount} 位學員受影響`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
