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

		// #region agent log
		fetch('http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				location: 'xmlParser.ts:35',
				message: 'Parser initialized',
				data: { filePath, fileSize },
				timestamp: Date.now(),
				sessionId: 'debug-session',
				runId: 'run1',
				hypothesisId: 'C',
			}),
		}).catch(() => {});
		// #endregion

		saxStream.on('opentag', (node: any) => {
			currentElement = node.name;
			tagCount++;

			// #region agent log
			if (
				tagCount <= 20 ||
				node.name.toLowerCase().includes('record') ||
				node.name.toLowerCase().includes('workout')
			) {
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:42',
							message: 'opentag event',
							data: {
								tagName: node.name,
								tagCount,
								attributes: Object.keys(node.attributes || {}).slice(0, 5),
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'A',
						}),
					}
				).catch(() => {});
			}
			// #endregion

			if (node.name === 'Record' || node.name === 'record') {
				currentRecord = {};
				// Copy all attributes (sax preserves original case)
				Object.keys(node.attributes).forEach((key) => {
					currentRecord[key] = node.attributes[key];
				});

				// #region agent log
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:50',
							message: 'Record opened',
							data: {
								attributes: Object.keys(currentRecord),
								sampleAttrs: Object.fromEntries(
									Object.entries(currentRecord).slice(0, 3)
								),
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'B',
						}),
					}
				).catch(() => {});
				// #endregion
			} else if (node.name === 'Workout' || node.name === 'workout') {
				currentWorkout = {};
				// Copy all attributes
				Object.keys(node.attributes).forEach((key) => {
					currentWorkout[key] = node.attributes[key];
				});

				// #region agent log
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:57',
							message: 'Workout opened',
							data: {
								attributes: Object.keys(currentWorkout),
								sampleAttrs: Object.fromEntries(
									Object.entries(currentWorkout).slice(0, 3)
								),
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'B',
						}),
					}
				).catch(() => {});
				// #endregion
			}
		});

		saxStream.on('closetag', (tagName: string) => {
			// #region agent log
			if (
				tagName.toLowerCase().includes('record') ||
				tagName.toLowerCase().includes('workout')
			) {
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:60',
							message: 'closetag event',
							data: {
								tagName,
								hasCurrentRecord: !!currentRecord,
								hasCurrentWorkout: !!currentWorkout,
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'A',
						}),
					}
				).catch(() => {});
			}
			// #endregion

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

				// #region agent log
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:74',
							message: 'Processing record',
							data: {
								type: healthRecord.type,
								startDate: healthRecord.startDate,
								hasStartDate: !!healthRecord.startDate,
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'B',
						}),
					}
				).catch(() => {});
				// #endregion

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
					// #region agent log
					fetch(
						'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								location: 'xmlParser.ts:87',
								message: 'Record skipped - no startDate',
								data: {
									type: healthRecord.type,
									currentRecordKeys: Object.keys(currentRecord),
								},
								timestamp: Date.now(),
								sessionId: 'debug-session',
								runId: 'run1',
								hypothesisId: 'B',
							}),
						}
					).catch(() => {});
					// #endregion
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

				// #region agent log
				fetch(
					'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							location: 'xmlParser.ts:118',
							message: 'Processing workout',
							data: {
								startDate: workoutRecord.startDate,
								hasStartDate: !!workoutRecord.startDate,
								currentWorkoutKeys: Object.keys(currentWorkout),
							},
							timestamp: Date.now(),
							sessionId: 'debug-session',
							runId: 'run1',
							hypothesisId: 'B',
						}),
					}
				).catch(() => {});
				// #endregion

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
			// #region agent log
			fetch(
				'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						location: 'xmlParser.ts:131',
						message: 'SAX parser error',
						data: { error: err.message, stack: err.stack?.substring(0, 200) },
						timestamp: Date.now(),
						sessionId: 'debug-session',
						runId: 'run1',
						hypothesisId: 'D',
					}),
				}
			).catch(() => {});
			// #endregion
			reject(err);
		});

		saxStream.on('end', () => {
			// #region agent log
			fetch(
				'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						location: 'xmlParser.ts:135',
						message: 'Parsing ended',
						data: {
							recordCount,
							workoutCount,
							tagCount,
							metricsSummary: {
								steps: metrics.steps.length,
								heartRate: metrics.heartRate.length,
								workouts: metrics.workouts.length,
							},
						},
						timestamp: Date.now(),
						sessionId: 'debug-session',
						runId: 'run1',
						hypothesisId: 'C',
					}),
				}
			).catch(() => {});
			// #endregion
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
			// #region agent log
			fetch(
				'http://127.0.0.1:7242/ingest/076997dd-319d-4ffe-b87f-fbe04c123a51',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						location: 'xmlParser.ts:158',
						message: 'File stream error',
						data: { error: err.message },
						timestamp: Date.now(),
						sessionId: 'debug-session',
						runId: 'run1',
						hypothesisId: 'D',
					}),
				}
			).catch(() => {});
			// #endregion
			reject(err);
		});

		fileStream.pipe(saxStream);
	});
}
