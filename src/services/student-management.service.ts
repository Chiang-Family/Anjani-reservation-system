import { createStudent, findStudentByName, bindStudentLineId, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createPaymentRecord, getLatestUnpaidPayment, getLatestPaymentByStudent, recordPaymentAmount, updatePaymentHours } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { formatHours } from '@/lib/utils/date';

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

/** 編輯學員資料（多步驟文字輸入） */
interface EditStudentState {
  field: 'hours' | 'add_hours';
  studentId: string;
  studentName: string;
  /** add_hours 時需要輸入單價 */
  step?: 'count' | 'price';
  addHours?: number;
}

const editStudentStates = new Map<string, EditStudentState>();

export function getEditStudentState(lineUserId: string): EditStudentState | undefined {
  return editStudentStates.get(lineUserId);
}

export function startEditStudent(lineUserId: string, field: 'hours' | 'add_hours', studentId: string, studentName: string): string {
  editStudentStates.set(lineUserId, { field, studentId, studentName, step: 'count' });
  if (field === 'add_hours') {
    return `請輸入要為 ${studentName} 加值的時數（數字，可含小數如 7.5）：`;
  }
  return `請輸入 ${studentName} 最新繳費紀錄的新購買時數（數字，可含小數）：`;
}

export async function handleEditStudentStep(
  lineUserId: string,
  input: string
): Promise<{ message: string; done: boolean }> {
  const state = editStudentStates.get(lineUserId);
  if (!state) {
    return { message: '沒有進行中的編輯流程。', done: true };
  }

  if (input.trim() === '取消') {
    editStudentStates.delete(lineUserId);
    return { message: '已取消編輯。', done: true };
  }

  const num = parseFloat(input.trim());
  if (isNaN(num) || num <= 0) {
    return { message: '請輸入有效的正數（或輸入「取消」放棄）：', done: false };
  }

  const student = await getStudentById(state.studentId);
  if (!student) {
    editStudentStates.delete(lineUserId);
    return { message: '找不到該學員資料。', done: true };
  }

  if (state.field === 'add_hours') {
    if (state.step === 'count') {
      // 第一步：輸入時數，接著問單價
      state.addHours = num;
      state.step = 'price';
      return { message: `加值 ${num} 小時，請輸入每小時單價（數字）：`, done: false };
    }

    // 第二步：輸入單價，執行加值 + 建立繳費紀錄
    const addHours = state.addHours!;
    const pricePerHour = parseInt(input.trim(), 10);
    if (isNaN(pricePerHour) || pricePerHour <= 0) {
      return { message: '請輸入有效的正整數（或輸入「取消」放棄）：', done: false };
    }

    await createPaymentRecord({
      studentId: state.studentId,
      studentName: state.studentName,
      coachId: student.coachId || '',
      purchasedHours: addHours,
      pricePerHour,
      status: '未繳費',
    });

    const summary = await getStudentHoursSummary(state.studentId);
    editStudentStates.delete(lineUserId);
    const total = addHours * pricePerHour;
    return {
      message: [
        `✅ ${state.studentName} 已加值 ${addHours} 小時！`,
        '',
        `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
        `💰 每小時單價：${pricePerHour} 元`,
        `💵 合計金額：${total} 元（未繳費）`,
      ].join('\n'),
      done: true,
    };
  }

  // field === 'hours': 修改最新繳費紀錄的購買時數
  const latestPayment = await getLatestPaymentByStudent(state.studentId);
  if (!latestPayment) {
    editStudentStates.delete(lineUserId);
    return { message: `${state.studentName} 目前沒有繳費紀錄可修改。`, done: true };
  }

  await updatePaymentHours(latestPayment.id, num);
  const summary = await getStudentHoursSummary(state.studentId);
  editStudentStates.delete(lineUserId);
  return {
    message: [
      `✅ ${state.studentName} 最新繳費紀錄已更新！`,
      '',
      `📊 購買時數：${latestPayment.purchasedHours} → ${num} 小時`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
    ].join('\n'),
    done: true,
  };
}

/** 收款流程（多步驟） */
interface PaymentState {
  paymentId: string;
  studentName: string;
  totalAmount: number;
  currentPaid: number;
}

const paymentStates = new Map<string, PaymentState>();

export function getPaymentState(lineUserId: string): PaymentState | undefined {
  return paymentStates.get(lineUserId);
}

export async function startPaymentCollection(studentId: string, lineUserId: string): Promise<string> {
  const student = await getStudentById(studentId);
  if (!student) return '找不到該學員資料。';

  const unpaid = await getLatestUnpaidPayment(studentId);
  if (!unpaid) {
    return `${student.name} 目前沒有未繳費的紀錄。`;
  }

  paymentStates.set(lineUserId, {
    paymentId: unpaid.id,
    studentName: student.name,
    totalAmount: unpaid.totalAmount,
    currentPaid: unpaid.paidAmount,
  });

  const remaining = unpaid.totalAmount - unpaid.paidAmount;
  if (unpaid.paidAmount > 0) {
    return [
      `${student.name} 已付 $${unpaid.paidAmount.toLocaleString()} / 剩餘 $${remaining.toLocaleString()}`,
      '',
      '請輸入收款金額（或輸入「全額」繳清剩餘）：',
    ].join('\n');
  }

  return [
    `${student.name} 待收 $${unpaid.totalAmount.toLocaleString()}`,
    '',
    '請輸入收款金額（或輸入「全額」繳清）：',
  ].join('\n');
}

export async function handlePaymentStep(
  lineUserId: string,
  input: string
): Promise<{ message: string; done: boolean }> {
  const state = paymentStates.get(lineUserId);
  if (!state) {
    return { message: '沒有進行中的收款流程。', done: true };
  }

  if (input.trim() === '取消') {
    paymentStates.delete(lineUserId);
    return { message: '已取消收款。', done: true };
  }

  const remaining = state.totalAmount - state.currentPaid;
  let amount: number;

  if (input.trim() === '全額') {
    amount = remaining;
  } else {
    amount = parseInt(input.trim(), 10);
    if (isNaN(amount) || amount <= 0) {
      return { message: '請輸入有效的正整數金額（或輸入「全額」/「取消」）：', done: false };
    }
    if (amount > remaining) {
      return { message: `金額超過剩餘待收 $${remaining.toLocaleString()}，請重新輸入：`, done: false };
    }
  }

  const { newPaidAmount, newStatus } = await recordPaymentAmount(
    state.paymentId,
    amount,
    state.currentPaid,
    state.totalAmount
  );

  paymentStates.delete(lineUserId);

  if (newStatus === '已繳費') {
    return {
      message: [
        `✅ ${state.studentName} 已繳清！`,
        '',
        `💰 收款金額：$${amount.toLocaleString()}`,
        `💳 總金額：$${state.totalAmount.toLocaleString()}`,
        `繳費狀態：已繳費`,
      ].join('\n'),
      done: true,
    };
  }

  return {
    message: [
      `✅ ${state.studentName} 收款成功！`,
      '',
      `💰 本次收款：$${amount.toLocaleString()}`,
      `💳 已付 $${newPaidAmount.toLocaleString()} / 總額 $${state.totalAmount.toLocaleString()}`,
      `📋 剩餘待收：$${(state.totalAmount - newPaidAmount).toLocaleString()}`,
      `繳費狀態：部分繳費`,
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
