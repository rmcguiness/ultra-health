import { NextResponse } from 'next/server';
import { getAllClinicalRecords } from '@/lib/parsers/clinicalParser';
import path from 'path';
import fs from 'fs';

const CLINICAL_DIR = path.join(process.cwd(), 'apple_health_export', 'clinical-records');

export async function GET() {
  try {
    if (!fs.existsSync(CLINICAL_DIR)) {
      return NextResponse.json(
        { error: 'Clinical records directory not found' },
        { status: 404 }
      );
    }

    const records = getAllClinicalRecords(CLINICAL_DIR);
    return NextResponse.json({ records, count: records.length });
  } catch (error: any) {
    console.error('Error reading clinical records:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to read clinical records' },
      { status: 500 }
    );
  }
}

