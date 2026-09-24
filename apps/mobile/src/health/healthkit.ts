import {
  AuthorizationRequestStatus,
  areObjectTypesAvailableAsync,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryCategorySamplesWithAnchor,
  queryQuantitySamples,
  queryQuantitySamplesWithAnchor,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamplesWithAnchor,
  requestAuthorization,
  type ObjectTypeIdentifier,
  type QuantityTypeIdentifier,
  type WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import {
  addDays,
  localDateKey,
  sleepStageFromHealthKit,
  startOfLocalDate,
  type MetricDefinition,
  type SourceIdentity,
} from '@ultra-health/core';
import type { AnyMap } from 'react-native-nitro-modules';

import { logger } from '@/logger';

import type {
  AnchoredPage,
  DailyStatisticRecord,
  HealthDataSource,
  QuantitySampleRecord,
  RetainedMetadata,
  SleepSegmentRecord,
  WorkoutRecord,
} from './types';

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier';
const HEART_RATE_TYPE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY_TYPE = 'HKQuantityTypeIdentifierActiveEnergyBurned';

/**
 * Metadata keys worth keeping, all scalars. Third-party writers can attach
 * arbitrary metadata, and storing it would widen our privacy surface for no
 * analytical gain.
 */
const RETAINED_SAMPLE_METADATA = [
  'HKHeartRateMotionContext', // 1 = sedentary, 2 = active
  'HKVO2MaxTestType',
  'HKAlgorithmVersion',
] as const;

interface HealthKitSampleLike {
  readonly sourceRevision: {
    readonly source: { readonly name: string; readonly bundleIdentifier: string };
    readonly productType?: string;
  };
  readonly device?: { readonly model?: string; readonly manufacturer?: string };
  readonly metadata?: AnyMap;
}

function toSource(sample: HealthKitSampleLike): SourceIdentity {
  return {
    bundleId: sample.sourceRevision.source.bundleIdentifier,
    name: sample.sourceRevision.source.name,
    productType: sample.sourceRevision.productType,
    deviceModel: sample.device?.model,
    deviceManufacturer: sample.device?.manufacturer,
  };
}

function readMetadata(metadata: AnyMap | undefined, key: string): unknown {
  return metadata ? (metadata as Record<string, unknown>)[key] : undefined;
}

function timeZoneOf(metadata: AnyMap | undefined): string | undefined {
  const tz = readMetadata(metadata, 'HKTimeZone');
  return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
}

function retainMetadata(
  metadata: AnyMap | undefined,
  keys: readonly string[],
): RetainedMetadata | undefined {
  let kept: Record<string, number | string | boolean> | undefined;
  for (const key of keys) {
    const value = readMetadata(metadata, key);
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      (kept ??= {})[key] = value;
    }
  }
  return kept;
}

function assertIdentifier(metric: MetricDefinition): QuantityTypeIdentifier {
  return metric.healthKit.identifier as QuantityTypeIdentifier;
}

async function workoutRecord(workout: WorkoutProxyTyped): Promise<WorkoutRecord> {
  // Workout statistics are computed in-memory by HealthKit (no extra query).
  // `totalEnergyBurned` is deprecated since iOS 18, so energy comes from
  // statistics when available.
  const [heartRate, energy] = await Promise.all([
    workout.getStatistic(HEART_RATE_TYPE, 'count/min').catch(() => undefined),
    workout.getStatistic(ACTIVE_ENERGY_TYPE, 'kcal').catch(() => undefined),
  ]);
  const indoor = readMetadata(workout.metadata, 'HKIndoorWorkout');
  return {
    uuid: workout.uuid,
    activityType: workout.workoutActivityType,
    startMs: workout.startDate.getTime(),
    endMs: workout.endDate.getTime(),
    durationS: workout.duration.quantity,
    activeEnergyKcal: energy?.sumQuantity?.quantity ?? workout.totalEnergyBurned?.quantity,
    distanceM: workout.totalDistance?.quantity,
    avgHeartRate: heartRate?.averageQuantity?.quantity,
    maxHeartRate: heartRate?.maximumQuantity?.quantity,
    indoor: typeof indoor === 'boolean' ? indoor : undefined,
    source: toSource(workout),
    timeZone: timeZoneOf(workout.metadata),
  };
}

export function createHealthKitSource(): HealthDataSource {
  const readTypes = (metrics: readonly MetricDefinition[]): ObjectTypeIdentifier[] => [
    ...metrics.map(assertIdentifier),
    SLEEP_TYPE,
    WORKOUT_TYPE,
  ];

  return {
    isAvailable: () => isHealthDataAvailableAsync(),

    async supportedMetrics(metrics) {
      const identifiers = metrics.map(assertIdentifier);
      const available = await areObjectTypesAvailableAsync(identifiers);
      return metrics.filter((m) => available[m.healthKit.identifier] === true);
    },

    async requestReadAuthorization(metrics) {
      await requestAuthorization({ toRead: readTypes(metrics) });
    },

    async hasRequestedAuthorization(metrics) {
      const status = await getRequestStatusForAuthorization({ toRead: readTypes(metrics) });
      return status === AuthorizationRequestStatus.unnecessary;
    },

    async fetchQuantitySamples(metric, query): Promise<AnchoredPage<QuantitySampleRecord>> {
      const response = await queryQuantitySamplesWithAnchor(assertIdentifier(metric), {
        anchor: query.anchor,
        limit: query.limit,
        unit: metric.healthKit.unit,
      });
      return {
        records: response.samples.map((sample) => ({
          uuid: sample.uuid,
          startMs: sample.startDate.getTime(),
          endMs: sample.endDate.getTime(),
          value: sample.quantity,
          source: toSource(sample),
          timeZone: timeZoneOf(sample.metadata),
          userEntered: readMetadata(sample.metadata, 'HKWasUserEntered') === true,
          metadata: retainMetadata(sample.metadata, RETAINED_SAMPLE_METADATA),
        })),
        deletedUuids: response.deletedSamples.map((d) => d.uuid),
        newAnchor: response.newAnchor,
      };
    },

    async fetchSleepSegments(query): Promise<AnchoredPage<SleepSegmentRecord>> {
      const response = await queryCategorySamplesWithAnchor(SLEEP_TYPE, {
        anchor: query.anchor,
        limit: query.limit,
      });
      const records: SleepSegmentRecord[] = [];
      for (const sample of response.samples) {
        const stage = sleepStageFromHealthKit(Number(sample.value));
        if (!stage) {
          logger.warn('healthkit.unknown_sleep_value', { value: Number(sample.value) });
          continue;
        }
        records.push({
          uuid: sample.uuid,
          startMs: sample.startDate.getTime(),
          endMs: sample.endDate.getTime(),
          stage,
          source: toSource(sample),
          timeZone: timeZoneOf(sample.metadata),
        });
      }
      return {
        records,
        deletedUuids: response.deletedSamples.map((d) => d.uuid),
        newAnchor: response.newAnchor,
      };
    },

    async fetchWorkouts(query): Promise<AnchoredPage<WorkoutRecord>> {
      const response = await queryWorkoutSamplesWithAnchor({
        anchor: query.anchor,
        limit: query.limit,
      });
      return {
        records: await Promise.all(response.workouts.map(workoutRecord)),
        deletedUuids: response.deletedSamples.map((d) => d.uuid),
        newAnchor: response.newAnchor,
      };
    },

    async fetchDailyStatistics(metric, range): Promise<DailyStatisticRecord[]> {
      if (!metric.statistic) throw new Error(`${metric.id} has no platform statistic`);
      const statistic = metric.statistic;
      const startDate = new Date(startOfLocalDate(range.from));
      const buckets = await queryStatisticsCollectionForQuantity(
        assertIdentifier(metric),
        [statistic],
        startDate, // Anchor buckets on local midnight.
        { day: 1 },
        {
          unit: metric.healthKit.unit,
          filter: {
            date: { startDate, endDate: new Date(startOfLocalDate(addDays(range.to, 1))) },
          },
        },
      );
      const records: DailyStatisticRecord[] = [];
      for (const bucket of buckets) {
        const quantity =
          statistic === 'cumulativeSum' ? bucket.sumQuantity : bucket.averageQuantity;
        // A bucket without samples is "no data", which is not the same as zero.
        if (!bucket.startDate || quantity === undefined) continue;
        records.push({ date: localDateKey(bucket.startDate.getTime()), value: quantity.quantity });
      }
      return records;
    },

    async earliestSampleMs(metric) {
      const [first] = await queryQuantitySamples(assertIdentifier(metric), {
        limit: 1,
        ascending: true,
      });
      return first?.startDate.getTime();
    },
  };
}
