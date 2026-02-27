import { google } from 'googleapis';
import { getEnv } from '@/lib/config/env';

function getGoogleClients() {
  const env = getEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

export interface SheetData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export async function createSpreadsheet(title: string, sheets: SheetData[]): Promise<string> {
  const { sheets: sheetsClient, drive } = getGoogleClients();

  // Create spreadsheet with tabs
  const createRes = await sheetsClient.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: sheets.map((s, i) => ({
        properties: { sheetId: i, title: s.title, index: i },
      })),
    },
  });
  const spreadsheetId = createRes.data.spreadsheetId!;

  // Write data to all sheets in one batch
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

  // Format: bold headers, frozen first row, auto-resize columns
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

  // Share: anyone with the link can view
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
