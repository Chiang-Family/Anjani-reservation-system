import { createStudent, findStudentByName, bindStudentLineId, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId, findCoachByName, bindCoachLineId } from '@/lib/notion/coaches';
import { createPaymentRecord, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { formatHours } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';

/** 對話狀態管理（記憶體暫存） */
interface AddStudentState {
  step: 'name' | 'hours' | 'price' | 'confirm';
  name?: string;
  purchasedHours?: number;
  pricePerHour?: number;
  coachId: string;
  coachName: string;
}

const addStudentStates = new Map<string, AddStudentState>();

export function getAddStudentState(lineUserId: string): AddStudentState | undefined {
  return addStudentStates.get(lineUserId);
}

export function clearAddStudentState(lineUserId: string): void {
  addStudentStates.delete(lineUserId);
}

/** 開始新增學員流程 */
export async function startAddStudent(coachLineUserId: string): Promise<string> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) return '找不到教練資料。';

  addStudentStates.set(coachLineUserId, {
    step: 'name',
    coachId: coach.id,
    coachName: coach.name,
  });

  return '請輸入學員姓名：';
}

/** 處理多步驟輸入 */
export async function handleAddStudentStep(
  coachLineUserId: string,
  input: string
): Promise<{ message: string; done: boolean }> {
  const state = addStudentStates.get(coachLineUserId);
  if (!state) {
    return { message: '沒有進行中的新增學員流程。', done: true };
  }

  switch (state.step) {
    case 'name': {
      const existing = await findStudentByName(input.trim());
      if (existing) {
        return { message: `「${input.trim()}」已存在，請輸入其他姓名：`, done: false };
      }
      state.name = input.trim();
      state.step = 'hours';
      return { message: `學員姓名：${state.name}\n\n請輸入購買時數（數字，可含小數如 7.5）：`, done: false };
    }

    case 'hours': {
      const num = parseFloat(input.trim());
      if (isNaN(num) || num <= 0) {
        return { message: '請輸入有效的正數：', done: false };
      }
      state.purchasedHours = num;
      state.step = 'price';
      return { message: `購買時數：${num} 小時\n\n請輸入每小時單價（數字）：`, done: false };
    }

    case 'price': {
      const price = parseInt(input.trim(), 10);
      if (isNaN(price) || price <= 0) {
        return { message: '請輸入有效的正整數：', done: false };
      }
      state.pricePerHour = price;
      state.step = 'confirm';
      const total = state.purchasedHours! * price;
      return {
        message: [
          '📋 請確認學員資料：',
          '',
          `👤 姓名：${state.name}`,
          `🏋️ 教練：${state.coachName}`,
          `📊 購買時數：${state.purchasedHours} 小時`,
          `💰 每小時單價：${price} 元`,
          `💵 合計金額：${total} 元`,
          '',
          '輸入「確認」建立學員，或輸入「取消」放棄。',
        ].join('\n'),
        done: false,
      };
    }

    case 'confirm': {
      if (input.trim() === '取消') {
        addStudentStates.delete(coachLineUserId);
        return { message: '已取消新增學員。', done: true };
      }
      if (input.trim() !== '確認') {
        return { message: '請輸入「確認」或「取消」：', done: false };
      }

      const student = await createStudent({
        name: state.name!,
        coachId: state.coachId,
      });

      // 同時建立第一筆繳費紀錄
      await createPaymentRecord({
        studentId: student.id,
        studentName: student.name,
        coachId: state.coachId,
        purchasedHours: state.purchasedHours!,
        pricePerHour: state.pricePerHour!,
        status: '未繳費',
      });

      addStudentStates.delete(coachLineUserId);

      return {
        message: [
          '✅ 學員建立成功！',
          '',
          `👤 姓名：${student.name}`,
          `📊 購買時數：${state.purchasedHours} 小時`,
          `💰 每小時單價：${state.pricePerHour} 元`,
          '',
          '學員加入 LINE 好友後，輸入姓名即可完成綁定。',
        ].join('\n'),
        done: true,
      };
    }
  }
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
