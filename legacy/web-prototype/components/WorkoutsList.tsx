'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

interface Workout {
  workoutActivityType: string;
  startDate: string;
  endDate?: string;
  totalDistance?: number;
  totalEnergyBurned?: number;
  duration?: number;
}

export default function WorkoutsList() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkouts();
  }, []);

  const fetchWorkouts = async () => {
    try {
      const response = await fetch('/api/health?endpoint=workouts');
      if (!response.ok) throw new Error('Failed to fetch workouts');
      
      const data = await response.json();
      // Sort by date, most recent first
      const sorted = data
        .sort((a: Workout, b: Workout) => 
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        )
        .slice(0, 10); // Show last 10 workouts
      
      setWorkouts(sorted);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatWorkoutType = (type: string) => {
    return type
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return <div className="text-gray-500">Loading workouts...</div>;
  }

  if (workouts.length === 0) {
    return <div className="text-gray-500">No workouts found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Distance
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Energy
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {workouts.map((workout, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {format(parseISO(workout.startDate), 'MMM dd, yyyy HH:mm')}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {formatWorkoutType(workout.workoutActivityType)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {formatDuration(workout.duration)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {workout.totalDistance 
                  ? `${(workout.totalDistance / 1000).toFixed(2)} km`
                  : 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {workout.totalEnergyBurned 
                  ? `${Math.round(workout.totalEnergyBurned)} cal`
                  : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

