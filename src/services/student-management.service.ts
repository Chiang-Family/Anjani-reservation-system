import { createStudent, findStudentByName, bindStudentLineId } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';

/** 對話狀態管理（記憶體暫存） */
interface AddStudentState {
  step: 'name' | 'classes' | 'price' | 'confirm';
  name?: string;
  purchasedClasses?: number;
  pricePerClass?: number;
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
      state.step = 'classes';
      return { message: `學員姓名：${state.name}\n\n請輸入購買堂數（數字）：`, done: false };
    }

    case 'classes': {
      const num = parseInt(input.trim(), 10);
      if (isNaN(num) || num <= 0) {
        return { message: '請輸入有效的正整數：', done: false };
      }
      state.purchasedClasses = num;
      state.step = 'price';
      return { message: `購買堂數：${num} 堂\n\n請輸入每堂單價（數字）：`, done: false };
    }

    case 'price': {
      const price = parseInt(input.trim(), 10);
      if (isNaN(price) || price <= 0) {
        return { message: '請輸入有效的正整數：', done: false };
      }
      state.pricePerClass = price;
      state.step = 'confirm';
      const total = state.purchasedClasses! * price;
      return {
        message: [
          '📋 請確認學員資料：',
          '',
          `👤 姓名：${state.name}`,
          `🏋️ 教練：${state.coachName}`,
          `📊 購買堂數：${state.purchasedClasses} 堂`,
          `💰 每堂單價：${price} 元`,
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
        purchasedClasses: state.purchasedClasses!,
        pricePerClass: state.pricePerClass!,
        isPaid: false,
      });

      addStudentStates.delete(coachLineUserId);

      return {
        message: [
          '✅ 學員建立成功！',
          '',
          `👤 姓名：${student.name}`,
          `📊 購買堂數：${student.purchasedClasses} 堂`,
          `💰 每堂單價：${student.pricePerClass} 元`,
          '',
          '學員加入 LINE 好友後，輸入姓名即可完成綁定。',
        ].join('\n'),
        done: true,
      };
    }
  }
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

  return {
    success: true,
    message: [
      `✅ 綁定成功！`,
      '',
      `歡迎 ${student.name}！`,
      `您目前剩餘 ${student.purchasedClasses - student.completedClasses} 堂課程。`,
      '',
      '輸入「打卡」即可在上課時打卡。',
      '輸入「選單」查看所有功能。',
    ].join('\n'),
  };
}
