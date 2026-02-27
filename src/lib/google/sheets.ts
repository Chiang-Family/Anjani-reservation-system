import { google } from 'googleapis';
import { getEnv } from '@/lib/config/env';

function getSheetsClient() {
  const env = getEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function getDriveClient() {
  const env = getEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export interface SheetData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export async function createSpreadsheet(title: string, sheets: SheetData[], shareEmail?: string): Promise<string> {
  const sheetsClient = getSheetsClient();

  // Step 1: Create spreadsheet with tabs
  console.log('[Sheets] Step1: creating spreadsheet:', title);
  const createRes = await sheetsClient.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheets.map((s, i) => ({
        properties: { sheetId: i, title: s.title, index: i },
      })),
    },
  });
  const spreadsheetId = createRes.data.spreadsheetId!;
  console.log('[Sheets] Step1: created', spreadsheetId);

  // Step 2: Write data to all sheets in one batch
  console.log('[Sheets] Step2: writing data');
  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: sheets.map((s) => ({
        range: `${s.title}!A1`,
        values: [s.headers, ...s.rows],
      })),
    },
  });
  console.log('[Sheets] Step2: data written');

  // Step 3: Format (non-critical — bold headers, frozen first row, auto-resize)
  try {
    console.log('[Sheets] Step3: formatting');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests: any[] = [];
    for (let i = 0; i < sheets.length; i++) {
      requests.push(
        {
          repeatCell: {
            range: { sheetId: i, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.87, green: 0.87, blue: 0.87 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: i,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: i,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: sheets[i].headers.length,
            },
          },
        },
      );
    }
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    console.log('[Sheets] Step3: formatting done');
  } catch (fmtErr) {
    console.warn('[Sheets] Step3: formatting failed (non-critical):', fmtErr);
  }

  // Step 4: Share — Drive client is separate so its auth failure never blocks Sheets steps
  try {
    console.log('[Sheets] Step4: sharing');
    const emailToShare = shareEmail || getEnv().REPORT_SHARE_EMAIL;
    const drive = getDriveClient();
    if (emailToShare) {
      await drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: { role: 'writer', type: 'user', emailAddress: emailToShare },
      });
    } else {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    }
    console.log('[Sheets] Step4: sharing done');
  } catch (shareErr) {
    console.warn('[Sheets] Step4: sharing failed:', shareErr);
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
