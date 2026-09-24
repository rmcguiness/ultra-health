// Health data types based on Apple Health export structure

export interface HealthRecord {
  type: string;
  sourceName: string;
  sourceVersion?: string;
  device?: string;
  unit?: string;
  value?: string | number;
  startDate: string;
  endDate?: string;
  creationDate?: string;
  metadata?: Record<string, any>;
}

export interface WorkoutRecord extends HealthRecord {
  workoutActivityType: string;
  totalDistance?: number;
  totalEnergyBurned?: number;
  totalFlightsClimbed?: number;
  duration?: number;
}

export interface ClinicalRecord {
  resourceType: string;
  id: string;
  status?: string;
  category?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  code?: {
    text?: string;
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  valueString?: string;
  valueQuantity?: {
    value?: number;
    unit?: string;
  };
  effectiveDateTime?: string;
  issued?: string;
  subject?: {
    display?: string;
    reference?: string;
  };
}

export interface ECGData {
  name: string;
  dateOfBirth: string;
  recordedDate: string;
  classification: string;
  symptoms: string;
  softwareVersion: string;
  device: string;
  sampleRate: string;
  leads: {
    [leadName: string]: number[];
  };
}

export interface WorkoutRoute {
  filename: string;
  coordinates: Array<{
    lat: number;
    lon: number;
    elevation?: number;
    time?: string;
  }>;
}

export interface HealthMetrics {
  steps: HealthRecord[];
  heartRate: HealthRecord[];
  activeEnergyBurned: HealthRecord[];
  workouts: WorkoutRecord[];
  sleepAnalysis: HealthRecord[];
  distanceWalkingRunning: HealthRecord[];
  flightsClimbed: HealthRecord[];
}

export interface DashboardStats {
  totalSteps: number;
  averageHeartRate: number;
  totalWorkouts: number;
  totalDistance: number;
  totalActiveEnergy: number;
  averageSleepHours: number;
}

