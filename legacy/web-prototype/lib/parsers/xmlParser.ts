import { HealthRecord, WorkoutRecord, HealthMetrics } from '@/types/health';
import fs from 'fs';
import path from 'path';
// @ts-ignore - sax doesn't have perfect TypeScript types
import sax from 'sax';

export async function parseHealthXML(filePath: string): Promise<HealthMetrics> {
	// Use streaming parser for large files
	return parseHealthXMLStreaming(filePath);
}

// ... existing code ...

export async function parseHealthXMLStreaming(
	filePath: string,
	onProgress?: (progress: number) => void
): Promise<HealthMetrics> {
	return new Promise((resolve, reject) => {
		const metrics: HealthMetrics = {
			steps: [],
			heartRate: [],
			activeEnergyBurned: [],
			workouts: [],
			sleepAnalysis: [],
			distanceWalkingRunning: [],
			flightsClimbed: [],
		};

		let currentRecord: any = null;
		let currentWorkout: any = null;
		let currentElement: string = '';
		let recordCount = 0;
		let workoutCount = 0;
		let tagCount = 0;
		const fileSize = fs.statSync(filePath).size;
		let bytesProcessed = 0;

		const strict = false;
		const saxStream = sax.createStream(strict, {
			lowercase: false, // Keep original case for attributes
			trim: true,
			normalize: true,
		});


		saxStream.on('opentag', (node: any) => {
			currentElement = node.name;
			tagCount++;


			if (node.name === 'Record' || node.name === 'record') {
				currentRecord = {};
				// Copy all attributes (sax preserves original case)
				Object.keys(node.attributes).forEach((key) => {
					currentRecord[key] = node.attributes[key];
				});

			} else if (node.name === 'Workout' || node.name === 'workout') {
				currentWorkout = {};
				// Copy all attributes
				Object.keys(node.attributes).forEach((key) => {
					currentWorkout[key] = node.attributes[key];
				});

			}
		});

		saxStream.on('closetag', (tagName: string) => {

			if ((tagName === 'Record' || tagName === 'record') && currentRecord) {
				const healthRecord: HealthRecord = {
					type: currentRecord.type || '',
					sourceName: currentRecord.sourceName || '',
					sourceVersion: currentRecord.sourceVersion,
					device: currentRecord.device,
					unit: currentRecord.unit,
					value: currentRecord.value,
					startDate: currentRecord.startDate || '',
					endDate: currentRecord.endDate,
					creationDate: currentRecord.creationDate,
				};


				if (healthRecord.startDate) {
					const type = healthRecord.type;
					if (type?.includes('StepCount')) {
						metrics.steps.push(healthRecord);
					} else if (type?.includes('HeartRate')) {
						metrics.heartRate.push(healthRecord);
					} else if (type?.includes('ActiveEnergyBurned')) {
						metrics.activeEnergyBurned.push(healthRecord);
					} else if (type?.includes('SleepAnalysis')) {
						metrics.sleepAnalysis.push(healthRecord);
					} else if (type?.includes('DistanceWalkingRunning')) {
						metrics.distanceWalkingRunning.push(healthRecord);
					}
				} else {
				}

				currentRecord = null;
				recordCount++;

				if (recordCount % 10000 === 0) {
					console.log(`Processed ${recordCount} records...`);
				}
			} else if (
				(tagName === 'Workout' || tagName === 'workout') &&
				currentWorkout
			) {
				const workoutRecord: WorkoutRecord = {
					type: currentWorkout.workoutActivityType || '',
					sourceName: currentWorkout.sourceName || '',
					sourceVersion: currentWorkout.sourceVersion,
					device: currentWorkout.device,
					startDate: currentWorkout.startDate || '',
					endDate: currentWorkout.endDate,
					creationDate: currentWorkout.creationDate,
					workoutActivityType: currentWorkout.workoutActivityType || '',
					totalDistance: parseFloat(currentWorkout.totalDistance || '0'),
					totalEnergyBurned: parseFloat(
						currentWorkout.totalEnergyBurned || '0'
					),
					totalFlightsClimbed: parseFloat(
						currentWorkout.totalFlightsClimbed || '0'
					),
					duration: parseFloat(currentWorkout.duration || '0'),
				};


				if (workoutRecord.startDate) {
					metrics.workouts.push(workoutRecord);
					workoutCount++;

					if (workoutCount % 100 === 0) {
						console.log(`Processed ${workoutCount} workouts...`);
					}
				}

				currentWorkout = null;
			}
		});

		saxStream.on('error', (err: Error) => {
			reject(err);
		});

		saxStream.on('end', () => {
			console.log(
				`Parsing complete: ${recordCount} records, ${workoutCount} workouts`
			);
			resolve(metrics);
		});

		// Create read stream and pipe to sax
		const fileStream = fs.createReadStream(filePath, {
			encoding: 'utf8',
			highWaterMark: 64 * 1024, // 64KB chunks
		});

		fileStream.on('data', (chunk: string | Buffer) => {
			bytesProcessed +=
				typeof chunk === 'string'
					? Buffer.byteLength(chunk, 'utf8')
					: chunk.length;
			if (onProgress && fileSize > 0) {
				onProgress((bytesProcessed / fileSize) * 100);
			}
		});

		fileStream.on('error', (err: Error) => {
			reject(err);
		});

		fileStream.pipe(saxStream);
	});
}
