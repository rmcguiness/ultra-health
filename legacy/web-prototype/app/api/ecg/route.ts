import { NextResponse } from 'next/server';
import { parseECGCSV } from '@/lib/parsers/csvParser';
import path from 'path';
import fs from 'fs';

const ECG_DIR = path.join(process.cwd(), 'apple_health_export', 'electrocardiograms');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('file');

    if (!fs.existsSync(ECG_DIR)) {
      return NextResponse.json(
        { error: 'ECG directory not found' },
        { status: 404 }
      );
    }

    if (filename) {
      // Return specific ECG file
      const filePath = path.join(ECG_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { error: 'ECG file not found' },
          { status: 404 }
        );
      }
      const ecgData = parseECGCSV(filePath);
      return NextResponse.json(ecgData);
    } else {
      // Return list of available ECG files
      const files = fs.readdirSync(ECG_DIR)
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
          filename: file,
          path: `/api/ecg?file=${file}`,
        }));
      return NextResponse.json({ files });
    }
  } catch (error: any) {
    console.error('Error reading ECG data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to read ECG data' },
      { status: 500 }
    );
  }
}

