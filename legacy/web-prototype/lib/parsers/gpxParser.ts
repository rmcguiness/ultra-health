import { WorkoutRoute } from '@/types/health';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
});

export function parseGPX(filePath: string): WorkoutRoute {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parser.parse(content);
  
  const gpx = parsed.gpx || parsed;
  const trkpt = gpx.trk?.trkseg?.trkpt || [];
  
  const coordinates = Array.isArray(trkpt) 
    ? trkpt.map((point: any) => ({
        lat: parseFloat(point['@_lat'] || point.lat || '0'),
        lon: parseFloat(point['@_lon'] || point.lon || '0'),
        elevation: point.ele ? parseFloat(point.ele) : undefined,
        time: point.time || undefined,
      }))
    : [{
        lat: parseFloat(trkpt['@_lat'] || trkpt.lat || '0'),
        lon: parseFloat(trkpt['@_lon'] || trkpt.lon || '0'),
        elevation: trkpt.ele ? parseFloat(trkpt.ele) : undefined,
        time: trkpt.time || undefined,
      }];

  return {
    filename: filePath.split('/').pop() || 'route.gpx',
    coordinates,
  };
}

