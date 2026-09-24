import { HealthMetrics, DashboardStats, HealthRecord } from '@/types/health';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export function calculateStats(
	metrics: HealthMetrics,
	days: number = 30
): DashboardStats {
	const cutoffDate = subDays(new Date(), days);

	// Filter records within date range
	const recentSteps = metrics.steps.filter(
		(r) => new Date(r.startDate) >= cutoffDate
	);
	const recentHeartRate = metrics.heartRate.filter(
		(r) => new Date(r.startDate) >= cutoffDate
	);
	const recentWorkouts = metrics.workouts.filter(
		(r) => new Date(r.startDate) >= cutoffDate
	);
	const recentDistance = metrics.distanceWalkingRunning.filter(
		(r) => new Date(r.startDate) >= cutoffDate
	);
	const recentEnergy = metrics.activeEnergyBurned.filter(
		(r) => new Date(r.startDate) >= cutoffDate
	);

	// Calculate totals
	const totalSteps = recentSteps.reduce((sum, r) => {
		const value =
			typeof r.value === 'number'
				? r.value
				: parseFloat((r.value as string) || '0');
		return sum + value;
	}, 0);

	const heartRateValues = recentHeartRate
		.map((r) =>
			typeof r.value === 'number'
				? r.value
				: parseFloat((r.value as string) || '0')
		)
		.filter((v) => v > 0);
	const averageHeartRate =
		heartRateValues.length > 0
			? heartRateValues.reduce((sum, v) => sum + v, 0) / heartRateValues.length
			: 0;

	const totalDistance = recentDistance.reduce((sum, r) => {
		const value =
			typeof r.value === 'number'
				? r.value
				: parseFloat((r.value as string) || '0');
		return sum + value;
	}, 0);

	const totalActiveEnergy = recentEnergy.reduce((sum, r) => {
		const value =
			typeof r.value === 'number'
				? r.value
				: parseFloat((r.value as string) || '0');
		return sum + value;
	}, 0);

	// Calculate average sleep (simplified - would need proper sleep analysis)
	const averageSleepHours = 0; // TODO: Implement sleep calculation

	return {
		totalSteps: Math.round(totalSteps),
		averageHeartRate: Math.round(averageHeartRate),
		totalWorkouts: recentWorkouts.length,
		totalDistance: Math.round(totalDistance * 100) / 100, // Round to 2 decimals
		totalActiveEnergy: Math.round(totalActiveEnergy),
		averageSleepHours: Math.round(averageSleepHours * 10) / 10,
	};
}

export function groupByDate(records: HealthRecord[], days: number = 30) {
	const cutoffDate = subDays(new Date(), days);
	const grouped: Record<string, number> = {};

	records.forEach((record) => {
		const date = new Date(record.startDate);
		if (date >= cutoffDate) {
			const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
			const value =
				typeof record.value === 'number'
					? record.value
					: parseFloat((record.value as string) || '0');

			if (!grouped[dateKey]) {
				grouped[dateKey] = 0;
			}
			grouped[dateKey] += value;
		}
	});

	return grouped;
}
