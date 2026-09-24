'use client';

import { useEffect, useState } from 'react';
import StatsCards from './StatsCards';
import StepsChart from './StepsChart';
import HeartRateChart from './HeartRateChart';
import WorkoutsList from './WorkoutsList';

interface DashboardStats {
  totalSteps: number;
  averageHeartRate: number;
  totalWorkouts: number;
  totalDistance: number;
  totalActiveEnergy: number;
  averageSleepHours: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/health?endpoint=stats');
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-gray-600">Loading health data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <p className="text-sm text-red-600 mt-2">
          Make sure the apple_health_export/export.xml file exists in the project root.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {stats && <StatsCards stats={stats} />}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Steps</h2>
          <StepsChart />
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Heart Rate</h2>
          <HeartRateChart />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Recent Workouts</h2>
        <WorkoutsList />
      </div>
    </div>
  );
}

