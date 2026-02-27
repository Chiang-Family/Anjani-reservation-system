/**
 * Quick test: verify Google Sheets API & Drive API permissions.
 *
 * Usage:
 *   npx tsx scripts/test-sheets-api.ts
 *
 * Requires .env.local with GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.
 */
import 'dotenv/config';
import { google } from 'googleapis';

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

if (!email || !key) {
  console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  process.exit(1);
}

async function testSheetsAPI() {
  console.log('--- Testing Google Sheets API ---');
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const res = await sheets.spreadsheets.create({
      requestBody: { properties: { title: 'API Test (can delete)' } },
    });
    console.log('✅ Sheets API OK — spreadsheet created:', res.data.spreadsheetId);
    return res.data.spreadsheetId!;
  } catch (err) {
    console.error('❌ Sheets API FAILED:', (err as Error).message);
    return null;
  }
}

async function testDriveAPI(spreadsheetId: string) {
  console.log('\n--- Testing Google Drive API ---');
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/drive'] });
  const drive = google.drive({ version: 'v3', auth });

  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    console.log('✅ Drive API OK — public sharing set');
  } catch (err) {
    console.error('❌ Drive API FAILED:', (err as Error).message);
  }

  // Clean up: delete the test spreadsheet
  try {
    await drive.files.delete({ fileId: spreadsheetId });
    console.log('🗑️  Test spreadsheet deleted');
  } catch {
    console.log('(Could not delete test spreadsheet — delete manually from Drive)');
  }
}

async function main() {
  const id = await testSheetsAPI();
  if (id) await testDriveAPI(id);
}

main();
