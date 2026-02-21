import { createStudent, findStudentByName, bindStudentLineId, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId, findCoachByName, bindCoachLineId } from '@/lib/notion/coaches';
import { createPaymentRecord, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { formatHours, formatDateTime, nowTaipei } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';

/** 開始新增學員流程（無狀態） */
export async function startAddStudent(coachLineUserId: string): Promise<string> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) return '找不到教練資料。';

  return [
    '請依照以下格式輸入學員資料：',
    '',
    '姓名 購買時數 每小時單價',
    '',
    '範例：王大明 10 1400',
    '範例：Tom 5 1600',
  ].join('\n');
}

/** 解析新增學員輸入格式，回傳解析結果或錯誤訊息 */
export function parseAddStudentInput(text: string): {
  name: string; hours: number; price: number;
} | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const price = parseInt(parts[parts.length - 1], 10);
  const hours = parseFloat(parts[parts.length - 2]);
  const name = parts.slice(0, -2).join(' ');

  if (!name || isNaN(hours) || hours <= 0 || isNaN(price) || price <= 0) return null;
  return { name, hours, price };
}

/** 執行新增學員（由 postback 觸發） */
export async function executeAddStudent(
  coachLineUserId: string,
  name: string,
  hours: number,
  price: number
): Promise<string> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) return '找不到教練資料。';

  const existing = await findStudentByName(name);
  if (existing) return `「${name}」已存在，無法建立。`;

  const student = await createStudent({
    name,
    coachId: coach.id,
  });

  const totalAmount = hours * price;

  await createPaymentRecord({
    studentId: student.id,
    studentName: student.name,
    coachId: coach.id,
    purchasedHours: hours,
    pricePerHour: price,
    status: '已繳費',
    paidAmount: totalAmount,
  });

  return [
    '學員建立成功！',
    '',
    `姓名：${student.name}`,
    `購買時數：${hours} 小時`,
    `每小時單價：${price} 元`,
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
  step: 'price' | 'amount';
}

const collectAndAddStates = new Map<string, CollectAndAddState>();

export function getCollectAndAddState(lineUserId: string): CollectAndAddState | undefined {
  return collectAndAddStates.get(lineUserId);
}

export async function startCollectAndAdd(studentId: string, lineUserId: string): Promise<string> {
  const student = await getStudentById(studentId);
  if (!student) return '找不到該學員資料。';

  const latestPayment = await getLatestPaymentByStudent(studentId);
  const pricePerHour = latestPayment?.pricePerHour ?? null;

  collectAndAddStates.set(lineUserId, {
    studentId,
    studentName: student.name,
    coachId: student.coachId || '',
    pricePerHour,
    step: pricePerHour ? 'amount' : 'price',
  });

  if (pricePerHour) {
    const summary = await getStudentHoursSummary(studentId);
    return [
      `${student.name}`,
      `目前單價：$${pricePerHour.toLocaleString()}/hr`,
      `剩餘時數：${formatHours(summary.remainingHours)}`,
      '',
      '請輸入收款金額（或輸入「取消」放棄）：',
    ].join('\n');
  }

  return [
    `${student.name} 目前沒有繳費紀錄。`,
    '',
    '請輸入每小時單價（數字）：',
  ].join('\n');
}

export async function handleCollectAndAddStep(
  lineUserId: string,
  input: string
): Promise<{ message: string; done: boolean }> {
  const state = collectAndAddStates.get(lineUserId);
  if (!state) {
    return { message: '沒有進行中的收款流程。', done: true };
  }

  if (input.trim() === '取消') {
    collectAndAddStates.delete(lineUserId);
    return { message: '已取消收款。', done: true };
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

  await createPaymentRecord({
    studentId: state.studentId,
    studentName: state.studentName,
    coachId: state.coachId,
    purchasedHours: hours,
    pricePerHour,
    status: '已繳費',
    paidAmount: amount,
  });

  const summary = await getStudentHoursSummary(state.studentId);

  // Push notification to student
  const student = await getStudentById(state.studentId);
  if (student?.lineUserId) {
    const studentMsg = [
      `💰 已收到繳費通知！`,
      `🕐 收款時間：${formatDateTime(nowTaipei())}`,
      `💵 收款金額：$${amount.toLocaleString()}`,
      `📊 加值時數：${hours} 小時`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
    ].join('\n');
    pushText(student.lineUserId, studentMsg).catch((err) =>
      console.error('Push payment notification to student failed:', err)
    );
  }

  collectAndAddStates.delete(lineUserId);

  return {
    message: [
      `✅ ${state.studentName} 收款成功！`,
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

export function clearBindingState(lineUserId: string): void {
  bindingStates.delete(lineUserId);
}

export async function handleBinding(
  lineUserId: string,
  name: string
): Promise<{ success: boolean; message: string }> {
  // Check if input is meant for a coach
  const coachMatch = name.trim().match(/^教練[+＋\s]*(.*)/);
  if (coachMatch) {
    const coachName = coachMatch[1].trim();
    if (!coachName) {
      return {
        success: false,
        message: '請輸入教練的姓名。例如：「教練 王大明」或「教練+王大明」',
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
      message: [
        `✅ 綁定成功！`,
        '',
        `歡迎 ${coach.name} 教練！`,
        '輸入「選單」查看所有功能。',
      ].join('\n'),
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

  const summary = await getStudentHoursSummary(student.id);

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
