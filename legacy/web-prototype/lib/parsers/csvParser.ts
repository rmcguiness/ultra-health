import { ECGData } from '@/types/health';
import fs from 'fs';

export function parseECGCSV(filePath: string): ECGData {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const ecgData: Partial<ECGData> = {
    leads: {},
  };

  let currentLead: string | null = null;
  let readingValues: number[] = [];

  for (const line of lines) {
    const [key, ...valueParts] = line.split(',');
    const value = valueParts.join(',').trim();

    // Parse metadata
    if (key === 'Name') {
      ecgData.name = value;
    } else if (key === 'Date of Birth') {
      ecgData.dateOfBirth = value;
    } else if (key === 'Recorded Date') {
      ecgData.recordedDate = value;
    } else if (key === 'Classification') {
      ecgData.classification = value;
    } else if (key === 'Symptoms') {
      ecgData.symptoms = value;
    } else if (key === 'Software Version') {
      ecgData.softwareVersion = value;
    } else if (key === 'Device') {
      ecgData.device = value;
    } else if (key === 'Sample Rate') {
      ecgData.sampleRate = value;
    } else if (key === 'Lead') {
      // Save previous lead if exists
      if (currentLead && readingValues.length > 0) {
        ecgData.leads![currentLead] = readingValues;
        readingValues = [];
      }
      currentLead = value;
    } else if (key === 'Unit') {
      // Unit line, continue
      continue;
    } else if (currentLead && !isNaN(parseFloat(key))) {
      // This is a reading value
      readingValues.push(parseFloat(key));
    }
  }

  // Save last lead
  if (currentLead && readingValues.length > 0) {
    ecgData.leads![currentLead] = readingValues;
  }

  return ecgData as ECGData;
}

