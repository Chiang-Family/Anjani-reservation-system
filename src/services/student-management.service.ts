import { createStudent, findStudentByName, bindStudentLineId, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId, findCoachByName, bindCoachLineId } from '@/lib/notion/coaches';
import { createPaymentRecord, getLatestPaymentByStudent, getPaymentsByStudent } from '@/lib/notion/payments';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getStudentOverflowInfo, resolveOverflowIds } from '@/lib/notion/hours';
import { formatHours, formatDateTime } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';
import { studentQuickReply } from '@/templates/quick-reply';
import { paymentPeriodChoiceCard } from '@/templates/flex/payment-confirm';
import { unpaidSessionDatesCard } from '@/templates/flex/unpaid-session-dates';
import type { messagingApi } from '@line/bot-sdk';

export type ParsedStudent =
  | { name: string; type: '多堂'; hours: number; price: number }
  | { name: string; type: '單堂'; perSessionFee: number };

/** 開始新增學員流程（無狀態） */
export async function startAddStudent(coachLineUserId: string): Promise<string> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) return '找不到教練資料。';

  return [
    '請依照以下格式輸入學員資料：',
    '',
    '多堂：姓名 購買時數 每小時單價',
    '範例：王大明 10 1400',
    '（輸入 0 時數可先建檔不購買）',
    '',
    '單堂：姓名 1 單堂費用',
    '範例：李小花 1 700',
  ].join('\n');
}

/** 解析新增學員輸入格式，回傳解析結果或錯誤訊息 */
export function parseAddStudentInput(text: string): ParsedStudent | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const price = parseInt(parts[parts.length - 1], 10);
  const hours = parseFloat(parts[parts.length - 2]);
  const name = parts.slice(0, -2).join(' ');

  if (!name || isNaN(hours) || hours < 0 || isNaN(price) || price <= 0) return null;

  if (hours === 1) {
    return { name, type: '單堂', perSessionFee: price };
  }
  return { name, type: '多堂', hours, price };
}

/** 執行新增學員（由 postback 觸發） */
export async function executeAddStudent(
  coachLineUserId: string,
  parsed: ParsedStudent
): Promise<string> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) return '找不到教練資料。';

  const existing = await findStudentByName(parsed.name);
  if (existing) return `「${parsed.name}」已存在，無法建立。`;

  if (parsed.type === '單堂') {
    const student = await createStudent({
      name: parsed.name,
      coachId: coach.id,
      paymentType: '單堂',
      perSessionFee: parsed.perSessionFee,
    });

    return [
      '學員建立成功！',
      '',
      `姓名：${student.name}`,
      `收費方式：單堂`,
      `單堂費用：${parsed.perSessionFee} 元`,
      '',
      '學員加入 LINE 好友後，輸入姓名即可完成綁定。',
    ].join('\n');
  }

  const student = await createStudent({
    name: parsed.name,
    coachId: coach.id,
    paymentType: '多堂',
  });

  const totalAmount = parsed.hours * parsed.price;

  await createPaymentRecord({
    studentId: student.id,
    studentName: student.name,
    coachId: coach.id,
    purchasedHours: parsed.hours,
    pricePerHour: parsed.price,
    status: '已繳費',
    paidAmount: totalAmount,
  });

  if (parsed.hours === 0) {
    return [
      '學員建立成功！',
      '',
      `姓名：${student.name}`,
      `每小時單價：${parsed.price} 元`,
      `購買時數：0（尚未購買）`,
      '',
      '學員加入 LINE 好友後，輸入姓名即可完成綁定。',
    ].join('\n');
  }

  return [
    '學員建立成功！',
    '',
    `姓名：${student.name}`,
    `購買時數：${parsed.hours} 小時`,
    `每小時單價：${parsed.price} 元`,
    `繳費金額：$${totalAmount.toLocaleString()}`,
    '',
    '學員加入 LINE 好友後，輸入姓名即可完成綁定。',
  ].join('\n');
}

/** 收款/加值合併流程（多步驟） */
interface CollectAndAddState {
  studentId: string;
  studentName: string;
  coachId: string;
  pricePerHour: number | null; // null = 無歷史紀錄，需先問單價
  step: 'price' | 'price_adjust' | 'amount';
  relatedStudentIds?: string[];
}

const collectAndAddStates = new Map<string, CollectAndAddState>();

export function getCollectAndAddState(lineUserId: string): CollectAndAddState | undefined {
  return collectAndAddStates.get(lineUserId);
}

export type StartCollectResult =
  | { type: 'text'; message: string }
  | { type: 'flex'; title: string; content: messagingApi.FlexBubble };

export async function startCollectAndAdd(studentId: string, lineUserId: string): Promise<StartCollectResult> {
  const student = await getStudentById(studentId);
  if (!student) return { type: 'text', message: '找不到該學員資料。' };

  // 單堂學員：顯示未繳費課程日期
  if (student.paymentType === '單堂') {
    const [checkins, payments] = await Promise.all([
      getCheckinsByStudent(studentId),
      getPaymentsByStudent(studentId),
    ]);
    const paidDates = new Set(
      payments.filter(p => p.isSessionPayment).map(p => p.actualDate)
    );
    const unpaidCheckins = checkins.filter(c => !paidDates.has(c.classDate));
    if (unpaidCheckins.length === 0) {
      return { type: 'text', message: `${student.name} 目前沒有未繳費的上課紀錄。` };
    }
    return {
      type: 'flex',
      title: `${student.name} 未繳費課程`,
      content: unpaidSessionDatesCard(student.name, studentId, student.perSessionFee ?? 0, unpaidCheckins),
    };
  }

  // 解析主/副學員：收款紀錄建立在主學員名下
  const { primaryId, relatedIds } = await resolveOverflowIds(student);
  const latestPayment = await getLatestPaymentByStudent(primaryId);
  const pricePerHour = latestPayment?.pricePerHour ?? null;

  collectAndAddStates.set(lineUserId, {
    studentId: primaryId,
    studentName: student.name,
    coachId: student.coachId || '',
    pricePerHour,
    step: pricePerHour ? 'amount' : 'price',
    relatedStudentIds: relatedIds,
  });

  if (pricePerHour) {
    const { summary } = await getStudentOverflowInfo(primaryId, relatedIds);
    return {
      type: 'text',
      message: [
        `${student.name}`,
        `目前單價：$${pricePerHour.toLocaleString()}/hr`,
        `剩餘時數：${formatHours(summary.remainingHours)}`,
        '',
        '請輸入收款金額（或輸入「取消」放棄）：',
      ].join('\n'),
    };
  }

  return {
    type: 'text',
    message: [
      `${student.name} 目前沒有繳費紀錄。`,
      '',
      '請輸入每小時單價（數字）：',
    ].join('\n'),
  };
}

/** 發起「調整單價」流程，將現有收款狀態切換到 price_adjust 步驟 */
export async function startPriceAdjust(
  studentId: string,
  lineUserId: string
): Promise<{ type: 'text'; message: string }> {
  const student = await getStudentById(studentId);
  if (!student) return { type: 'text', message: '找不到該學員資料。' };

  const { primaryId, relatedIds } = await resolveOverflowIds(student);
  const latestPayment = await getLatestPaymentByStudent(primaryId);
  const currentPrice = latestPayment?.pricePerHour ?? null;

  // 設定（或重置）狀態機，進入 price_adjust 步驟
  collectAndAddStates.set(lineUserId, {
    studentId: primaryId,
    studentName: student.name,
    coachId: student.coachId || '',
    pricePerHour: currentPrice,
    step: 'price_adjust',
    relatedStudentIds: relatedIds,
  });

  const currentPriceText = currentPrice
    ? `目前單價：$${currentPrice.toLocaleString()}/hr`
    : '目前無單價紀錄';

  return {
    type: 'text',
    message: [
      `${student.name}`,
      currentPriceText,
      '',
      '請輸入新的每小時單價（數字，或輸入「取消」放棄）：',
    ].join('\n'),
  };
}

export interface CollectStepResult {
  message: string;
  done: boolean;
  flex?: { title: string; content: messagingApi.FlexBubble };
}

export async function handleCollectAndAddStep(
  lineUserId: string,
  input: string
): Promise<CollectStepResult> {
  const state = collectAndAddStates.get(lineUserId);
  if (!state) {
    return { message: '沒有進行中的收款流程。', done: true };
  }

  if (input.trim() === '取消') {
    collectAndAddStates.delete(lineUserId);
    return { message: '已取消收款。', done: true };
  }

  if (state.step === 'price_adjust') {
    const price = parseInt(input.trim(), 10);
    if (isNaN(price) || price <= 0) {
      return { message: '請輸入有效的正整數（或輸入「取消」放棄）：', done: false };
    }
    state.pricePerHour = price;
    state.step = 'amount';
    return { message: `✅ 單價已更新為 $${price.toLocaleString()}/hr\n\n請輸入收款金額（或輸入「取消」放棄）：`, done: false };
  }

  if (state.step === 'price') {
    const price = parseInt(input.trim(), 10);
    if (isNaN(price) || price <= 0) {
      return { message: '請輸入有效的正整數（或輸入「取消」放棄）：', done: false };
    }
    state.pricePerHour = price;
    state.step = 'amount';
    return { message: `單價 $${price}/hr，請輸入收款金額：`, done: false };
  }

  // step === 'amount'
  const amount = parseInt(input.trim(), 10);
  if (isNaN(amount) || amount <= 0) {
    return { message: '請輸入有效的正整數金額（或輸入「取消」放棄）：', done: false };
  }

  const pricePerHour = state.pricePerHour!;
  const hours = Math.round((amount / pricePerHour) * 10) / 10;

  // 查詢學員繳費紀錄 + FIFO 分桶資訊
  const { payments: existingPayments, buckets } = await getStudentOverflowInfo(state.studentId, state.relatedStudentIds);

  if (existingPayments.length > 0) {
    // 過濾掉已用罄的期數，只顯示尚有剩餘的期可補繳
    const grouped = new Map<string, number>();
    for (const b of buckets) {
      const consumed = b.checkins.reduce((sum, c) => sum + c.durationMinutes, 0);
      if (consumed < b.purchasedHours * 60) {
        grouped.set(b.paymentDate, b.purchasedHours);
      }
    }
    const periodDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

    collectAndAddStates.delete(lineUserId);

    return {
      message: '',
      done: true,
      flex: {
        title: `${state.studentName} 收款確認`,
        content: paymentPeriodChoiceCard(
          state.studentName, state.studentId,
          amount, pricePerHour, hours,
          periodDates, grouped
        ),
      },
    };
  }

  // 無繳費紀錄 → 直接建立
  collectAndAddStates.delete(lineUserId);
  return executeConfirmPayment(lineUserId, state.studentId, amount, pricePerHour, 'new');
}

/** 確認收款（由 postback 觸發或直接呼叫） */
export async function executeConfirmPayment(
  coachLineUserId: string,
  studentId: string,
  amount: number,
  pricePerHour: number,
  periodDate: string
): Promise<{ message: string; done: boolean }> {
  const student = await getStudentById(studentId);
  if (!student) return { message: '找不到該學員資料。', done: true };

  const coach = await findCoachByLineId(coachLineUserId);
  const coachId = coach?.id ?? student.coachId ?? '';
  const hours = Math.round((amount / pricePerHour) * 10) / 10;

  // 先取得目前剩餘時數（在 Notion 建立紀錄前）
  const { primaryId: ecpPrimaryId, relatedIds: ecpRelatedIds } = await resolveOverflowIds(student);
  const { summary: oldSummary } = await getStudentOverflowInfo(ecpPrimaryId, ecpRelatedIds);

  await createPaymentRecord({
    studentId,
    studentName: student.name,
    coachId,
    purchasedHours: hours,
    pricePerHour,
    status: '已繳費',
    paidAmount: amount,
    periodDate: periodDate === 'new' ? undefined : periodDate,
  });

  // 直接計算新的剩餘時數，避免 Notion 尚未索引新紀錄的問題
  // FIFO：新繳費加入佇列，剩餘 = 舊剩餘 + 新時數
  const newRemainingHours = hours + oldSummary.remainingHours;
  const newPurchasedHours = hours + oldSummary.purchasedHours;
  const summary = { ...oldSummary, remainingHours: newRemainingHours, purchasedHours: newPurchasedHours };

  // Push notification to student
  if (student.lineUserId) {
    const studentMsg = [
      `💰 已收到繳費通知！`,
      `🕐 收款時間：${formatDateTime(new Date())}`,
      `💵 收款金額：$${amount.toLocaleString()}`,
      `📊 加值時數：${hours} 小時`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
    ].join('\n');
    pushText(student.lineUserId, studentMsg, studentQuickReply(student.paymentType)).catch((err) =>
      console.error('Push payment notification to student failed:', err)
    );
  }

  return {
    message: [
      `✅ ${student.name} 收款成功！`,
      '',
      `💰 收款金額：$${amount.toLocaleString()}`,
      `📊 加值時數：${hours} 小時（$${pricePerHour}/hr）`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
    ].join('\n'),
    done: true,
  };
}

/** 學員綁定 LINE User ID（透過姓名比對） */
interface BindingState {
  waitingForName: boolean;
}

const bindingStates = new Map<string, BindingState>();

export function getBindingState(lineUserId: string): BindingState | undefined {
  return bindingStates.get(lineUserId);
}

export function startBinding(lineUserId: string): void {
  bindingStates.set(lineUserId, { waitingForName: true });
}

export async function handleBinding(
  lineUserId: string,
  name: string
): Promise<{ success: boolean; message: string }> {
  // Check if input is meant for a coach
  const coachMatch = name.trim().match(/^教練(.+)/);
  if (coachMatch) {
    const coachName = coachMatch[1].trim();
    if (!coachName) {
      return {
        success: false,
        message: '請輸入教練的姓名。例如：「教練Jack」',
      };
    }
    const coach = await findCoachByName(coachName);
    if (!coach) {
      return {
        success: false,
        message: `找不到名為「${coachName}」的教練資料。\n請確認姓名是否正確。`,
      };
    }
    if (coach.lineUserId) {
      return {
        success: false,
        message: '此教練帳號已綁定。',
      };
    }
    await bindCoachLineId(coach.id, lineUserId);
    bindingStates.delete(lineUserId);

    return {
      success: true,
      message: `✅ 綁定成功！歡迎 ${coach.name} 教練！\n輸入「選單」查看所有功能。`,
    };
  }

  // Otherwise, default to student binding flow
  const student = await findStudentByName(name.trim());
  if (!student) {
    return {
      success: false,
      message: `找不到「${name.trim()}」的學員資料。\n請確認姓名是否正確，或聯繫教練建檔。`,
    };
  }

  if (student.lineUserId) {
    return {
      success: false,
      message: '此學員帳號已綁定。\n如需重新綁定請聯繫教練。',
    };
  }

  await bindStudentLineId(student.id, lineUserId);
  bindingStates.delete(lineUserId);

  const { primaryId: hbPrimaryId, relatedIds: hbRelatedIds } = await resolveOverflowIds(student);
  const { summary } = await getStudentOverflowInfo(hbPrimaryId, hbRelatedIds);

  return {
    success: true,
    message: [
      `✅ 綁定成功！`,
      '',
      `歡迎 ${student.name}！`,
      `您目前剩餘 ${formatHours(summary.remainingHours)} 課程。`,
      '',
      '輸入「上課紀錄」查看過去的上課紀錄。',
      '輸入「選單」查看所有功能。',
    ].join('\n'),
  };
}

