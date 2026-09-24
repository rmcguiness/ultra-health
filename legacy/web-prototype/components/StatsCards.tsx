'use client';

import { DashboardStats } from '@/types/health';

interface Props {
  stats: DashboardStats;
}

export default function StatsCards({ stats }: Props) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const cards = [
    {
      title: 'Total Steps',
      value: formatNumber(stats.totalSteps),
      subtitle: 'Last 30 days',
      color: 'bg-blue-500',
    },
    {
      title: 'Avg Heart Rate',
      value: `${Math.round(stats.averageHeartRate)} bpm`,
      subtitle: 'Last 30 days',
      color: 'bg-red-500',
    },
    {
      title: 'Workouts',
      value: stats.totalWorkouts.toString(),
      subtitle: 'Last 30 days',
      color: 'bg-green-500',
    },
    {
      title: 'Distance',
      value: `${stats.totalDistance.toFixed(1)} km`,
      subtitle: 'Last 30 days',
      color: 'bg-purple-500',
    },
    {
      title: 'Active Energy',
      value: `${formatNumber(stats.totalActiveEnergy)} cal`,
      subtitle: 'Last 30 days',
      color: 'bg-orange-500',
    },
    {
      title: 'Avg Sleep',
      value: `${stats.averageSleepHours} hrs`,
      subtitle: 'Last 30 days',
      color: 'bg-indigo-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white rounded-lg shadow-md p-6 border-l-4"
          style={{ borderLeftColor: card.color.replace('bg-', '') }}
        >
          <h3 className="text-sm font-medium text-gray-600 mb-1">{card.title}</h3>
          <p className="text-3xl font-bold text-gray-900">{card.value}</p>
          <p className="text-xs text-gray-500 mt-2">{card.subtitle}</p>
        </div>
      ))}
    </div>
  );
}

