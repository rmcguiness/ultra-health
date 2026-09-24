import { NextResponse } from 'next/server';
import { parseHealthXML } from '@/lib/parsers/xmlParser';
import { calculateStats, groupByDate } from '@/lib/utils/stats';
import path from 'path';
import fs from 'fs';

const HEALTH_EXPORT_PATH = path.join(
	process.cwd(),
	'apple_health_export',
	'export.xml'
);

// Cache for parsed data (in production, use Redis or similar)
let cachedMetrics: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const endpoint = searchParams.get('endpoint');
		// Check if file exists
		if (!fs.existsSync(HEALTH_EXPORT_PATH)) {
			return NextResponse.json(
				{ error: 'Health export file not found' },
				{ status: 404 }
			);
		}

		// Use cache if available and fresh
		const now = Date.now();
		if (cachedMetrics && now - cacheTimestamp < CACHE_DURATION) {
			return handleEndpoint(cachedMetrics, endpoint);
		}

		// Parse XML using streaming parser (handles large files)
		console.log(
			'Starting XML parsing (this may take a while for large files)...'
		);
		const metrics = await parseHealthXML(HEALTH_EXPORT_PATH);
		console.log('Parsing complete. Summary:', {
			steps: metrics.steps?.length || 0,
			heartRate: metrics.heartRate?.length || 0,
			workouts: metrics.workouts?.length || 0,
			distance: metrics.distanceWalkingRunning?.length || 0,
			energy: metrics.activeEnergyBurned?.length || 0,
		});
		// Cache the results
		cachedMetrics = metrics;
		cacheTimestamp = now;

		return handleEndpoint(metrics, endpoint);
	} catch (error: any) {
		console.error('Error parsing health data:', error);
		return NextResponse.json(
			{ error: error.message || 'Failed to parse health data' },
			{ status: 500 }
		);
	}
}

function handleEndpoint(metrics: any, endpoint: string | null) {
	switch (endpoint) {
		case 'stats':
			const stats = calculateStats(metrics);
			return NextResponse.json(stats);

		case 'steps':
			const stepsByDate = groupByDate(metrics.steps);
			return NextResponse.json(stepsByDate);

		case 'heartrate':
			const hrByDate = groupByDate(metrics.heartRate);
			return NextResponse.json(hrByDate);

		case 'workouts':
			return NextResponse.json(metrics.workouts);

		case 'all':
		default:
			return NextResponse.json(metrics);
	}
}
