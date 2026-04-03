/**
 * 匯入 Ting 教練的學員與打卡資料
 * 執行方式：node --env-file=.env.local --loader tsx scripts/import-ting-data.ts
 */

import { Client } from '@notionhq/client';
import { getEnv } from '@/lib/config/env';
import { createStudent, findStudentByName, getStudentsByCoachId } from '@/lib/notion/students';
import { createPaymentRecord } from '@/lib/notion/payments';
import { createCheckinRecord } from '@/lib/notion/checkins';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const STUDENTS_DATA = [
    { name: '王道美', pricePerHour: 1300, sessions: 10, startDate: '115-02-02', recentDate: '115-03-23', count: 7 },
    { name: '吳宜瑾', pricePerHour: 1100, sessions: 10, startDate: '115-01-28', recentDate: '115-03-25', count: 7 },
    { name: '李昕諭', pricePerHour: 1200, sessions: 10, startDate: '114-12-28', recentDate: '115-03-15', count: 5 },
    { name: '林王素蘭', pricePerHour: 1400, sessions: 5, startDate: '115-03-29', recentDate: '115-03-29', count: 1 },
    { name: '林佳莉', pricePerHour: 1400, sessions: 10, startDate: '115-03-17', recentDate: '115-03-24', count: 2 },
    { name: '林佳儀', pricePerHour: 1400, sessions: 10, startDate: '115-01-12', recentDate: '115-03-23', count: 8 },
    { name: '林益生', pricePerHour: 1400, sessions: 10, startDate: '115-02-10', recentDate: '115-03-24', count: 3 },
    { name: '郭彩霞', pricePerHour: 1400, sessions: 10, startDate: '115-03-12', recentDate: '115-03-26', count: 5 },
    { name: '陳月雲', pricePerHour: 1300, sessions: 10, startDate: '114-12-09', recentDate: '115-03-24', count: 9 },
    { name: '陳妙香', pricePerHour: 1400, sessions: 10, startDate: '115-03-18', recentDate: '115-03-25', count: 2 },
    { name: '陳貞如', pricePerHour: 1300, sessions: 10, startDate: '115-03-08', recentDate: '115-03-15', count: 3 },
    { name: '陳高山', pricePerHour: 1400, sessions: 10, startDate: '115-01-26', recentDate: '115-03-25', count: 8 },
    { name: '陳惠娟', pricePerHour: 1400, sessions: 10, startDate: '115-02-04', recentDate: '115-03-18', count: 4 },
    { name: '陸媽媽', pricePerHour: 1300, sessions: 10, startDate: '115-03-10', recentDate: '115-03-17', count: 2 },
    { name: '傅芊卉', pricePerHour: 1300, sessions: 10, startDate: '115-02-21', recentDate: '115-03-27', count: 4 },
    { name: '曾祤彤', pricePerHour: 1100, sessions: 10, startDate: '114-12-22', recentDate: '115-03-22', count: 7 },
    { name: '買美音', pricePerHour: 1400, sessions: 5, startDate: '115-03-19', recentDate: '115-03-26', count: 2 },
    { name: '黃鈺琁', pricePerHour: 1300, sessions: 10, startDate: '114-12-04', recentDate: '115-03-26', count: 8 },
    { name: '黃蘭茵', pricePerHour: 1300, sessions: 10, startDate: '115-01-11', recentDate: '115-03-26', count: 8 },
    { name: '楊玉琴', pricePerHour: 1400, sessions: 10, startDate: '115-03-23', recentDate: '115-03-23', count: 1 },
    { name: '葉進祥', pricePerHour: 1400, sessions: 10, startDate: '115-02-08', recentDate: '115-03-15', count: 4 },
    { name: '劉玉喬', pricePerHour: 1400, sessions: 10, startDate: '115-01-15', recentDate: '115-03-24', count: 9 },
    { name: '盧瑞香', pricePerHour: 1400, sessions: 10, startDate: '114-12-29', recentDate: '115-03-23', count: 9 },
    { name: '謝琳伊', pricePerHour: 1400, sessions: 10, startDate: '115-03-04', recentDate: '115-03-26', count: 8 },
    { name: '謝舒衣', pricePerHour: 1300, sessions: 10, startDate: '114-12-17', recentDate: '115-03-12', count: 8 },
    { name: '蘇淑芬', pricePerHour: 1300, sessions: 10, startDate: '114-10-18', recentDate: '115-02-01', count: 4 },
    { name: '張心毓', pricePerHour: 1350, sessions: 10, startDate: '114-04-24', recentDate: '115-03-27', count: 8 },
    { name: '張宇晞', pricePerHour: 1300, sessions: 10, startDate: '115-01-15', recentDate: '115-01-15', count: 1 },
    { name: '丁雅麗', pricePerHour: 1000, sessions: 10, startDate: '115-03-11', recentDate: '115-03-27', count: 3 },
    { name: '曾曰菁', pricePerHour: 1400, sessions: 10, startDate: '115-03-19', recentDate: '115-03-26', count: 2 },
    { name: '黃秀蘭', pricePerHour: 1400, sessions: 10, startDate: '115-03-11', recentDate: '115-03-17', count: 2 },
];

function minguoToCe(dateStr: string): string {
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10) + 1911;
    return `${year}-${parts[1]}-${parts[2]}`;
}

function getCheckinDates(startStr: string, endStr: string, count: number): string[] {
    if (count === 1) return [endStr];
    if (count === 2) return [startStr, endStr];

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const diffTime = endDate.getTime() - startDate.getTime();
    const step = diffTime / (count - 1);

    const dates = [startStr];
    for (let i = 1; i < count - 1; i++) {
        const d = new Date(startDate.getTime() + step * i);
        dates.push(d.toISOString().split('T')[0]);
    }
    dates.push(endStr);
    return dates;
}

async function getTingCoachId(): Promise<string> {
    const res = await notion.databases.query({
        database_id: getEnv().NOTION_COACHES_DB_ID,
        filter: {
            property: '姓名',
            title: { equals: 'Ting' },
        },
        page_size: 1,
    });
    if (res.results.length === 0) throw new Error('Coach Ting not found');
    return res.results[0].id;
}

async function main() {
    console.log('=== Starting Ting Coach Data Import ===');

    const coachId = await getTingCoachId();
    console.log(`Found Ting Coach ID: ${coachId}`);

    const existingStudents = await getStudentsByCoachId(coachId);
    const existingStudentNames = existingStudents.map(s => s.name);

    for (const s of STUDENTS_DATA) {
        console.log(`\nProcessing student: ${s.name}`);
        try {
            let student = existingStudents.find(es => es.name === s.name);

            if (!student) {
                console.log(`  - Creating new student record...`);
                student = await createStudent({
                    name: s.name,
                    coachId: coachId,
                    paymentType: '多堂',
                    perSessionFee: s.pricePerHour
                });
            } else {
                console.log(`  - Found existing student record (${student.id})`);
            }

            const startCe = minguoToCe(s.startDate);
            const recentCe = minguoToCe(s.recentDate);

            console.log(`  - Creating payment record (${startCe}, ${s.sessions} sessions)`);
            await createPaymentRecord({
                studentId: student.id,
                studentName: student.name,
                coachId: coachId,
                purchasedHours: s.sessions,
                pricePerHour: s.pricePerHour,
                status: '已繳費',
                paidAmount: s.pricePerHour * s.sessions,
                periodDate: startCe,
                overrideDate: startCe,
                isSessionPayment: false
            });

            const datesToProcess = getCheckinDates(startCe, recentCe, s.count);
            console.log(`  - Creating ${datesToProcess.length} check-in records:`, datesToProcess);

            for (const d of datesToProcess) {
                // e.g. "2026-02-21T10:00:00+08:00"
                const classStartTime = `${d}T10:00:00+08:00`;
                const classEndTime = `${d}T11:00:00+08:00`;
                const checkinTime = `${d}T09:55:00+08:00`;

                await createCheckinRecord({
                    studentName: student.name,
                    studentId: student.id,
                    coachId: coachId,
                    classDate: d,
                    classStartTime,
                    classEndTime,
                    checkinTime,
                    isMassage: false
                });
            }
            console.log(`  ✅ Done with ${s.name}`);
        } catch (err) {
            console.error(`  ❌ Failed for ${s.name}:`, err);
        }
    }

    console.log('\n=== Import Completed ===');
}

main().catch(console.error);
