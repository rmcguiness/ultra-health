'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function HeartRateChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/health?endpoint=heartrate');
      if (!response.ok) throw new Error('Failed to fetch heart rate data');
      
      const rawData = await response.json();
      
      // Calculate average heart rate per day
      const dailyAverages: Record<string, { sum: number; count: number }> = {};
      
      // We need to get all heart rate records to calculate daily averages
      const allResponse = await fetch('/api/health?endpoint=all');
      if (allResponse.ok) {
        const allData = await allResponse.json();
        const heartRateRecords = allData.heartRate || [];
        
        heartRateRecords.forEach((record: any) => {
          const date = format(parseISO(record.startDate), 'yyyy-MM-dd');
          const value = typeof record.value === 'number' 
            ? record.value 
            : parseFloat(record.value || '0');
          
          if (value > 0) {
            if (!dailyAverages[date]) {
              dailyAverages[date] = { sum: 0, count: 0 };
            }
            dailyAverages[date].sum += value;
            dailyAverages[date].count += 1;
          }
        });
      }
      
      // Convert to chart format
      const chartData = Object.entries(dailyAverages)
        .map(([date, stats]) => ({
          date: format(parseISO(date), 'MMM dd'),
          heartRate: Math.round(stats.sum / stats.count),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30); // Last 30 days
      
      setData(chartData);
    } catch (error) {
      console.error('Error fetching heart rate:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-500">No data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip 
          formatter={(value: number) => [`${value} bpm`, 'Heart Rate']}
          labelStyle={{ color: '#374151' }}
        />
        <Line 
          type="monotone" 
          dataKey="heartRate" 
          stroke="#ef4444" 
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

