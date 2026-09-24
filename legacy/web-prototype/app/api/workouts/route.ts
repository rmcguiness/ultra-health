import { NextResponse } from 'next/server';
import { parseGPX } from '@/lib/parsers/gpxParser';
import path from 'path';
import fs from 'fs';

const WORKOUT_ROUTES_DIR = path.join(
	process.cwd(),
	'apple_health_export',
	'workout-routes'
);

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const filename = searchParams.get('file');

		if (!fs.existsSync(WORKOUT_ROUTES_DIR)) {
			return NextResponse.json(
				{ error: 'Workout routes directory not found' },
				{ status: 404 }
			);
		}

		if (filename) {
			// Return specific workout route
			const filePath = path.join(WORKOUT_ROUTES_DIR, filename);
			if (!fs.existsSync(filePath)) {
				return NextResponse.json(
					{ error: 'Workout route file not found' },
					{ status: 404 }
				);
			}
			const route = parseGPX(filePath);
			return NextResponse.json(route);
		} else {
			// Return list of available workout routes
			const files = fs
				.readdirSync(WORKOUT_ROUTES_DIR)
				.filter((file: string) => file.endsWith('.gpx'))
				.map((file: string) => ({
					filename: file,
					path: `/api/workouts?file=${file}`,
				}));
			return NextResponse.json({ files });
		}
	} catch (error: any) {
		console.error('Error reading workout routes:', error);
		return NextResponse.json(
			{ error: error.message || 'Failed to read workout routes' },
			{ status: 500 }
		);
	}
}
