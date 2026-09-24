'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { WorkoutRoute } from '@/types/health';

// Dynamically import Leaflet to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

export default function WorkoutMap() {
  const [workoutFiles, setWorkoutFiles] = useState<Array<{ filename: string; path: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [route, setRoute] = useState<WorkoutRoute | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWorkoutFiles();
  }, []);

  const fetchWorkoutFiles = async () => {
    try {
      const response = await fetch('/api/workouts');
      if (!response.ok) throw new Error('Failed to fetch workout files');
      const data = await response.json();
      setWorkoutFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching workout files:', error);
    }
  };

  const fetchRoute = async (filename: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workouts?file=${filename}`);
      if (!response.ok) throw new Error('Failed to fetch route');
      const data = await response.json();
      setRoute(data);
      setSelectedFile(filename);
    } catch (error) {
      console.error('Error fetching route:', error);
    } finally {
      setLoading(false);
    }
  };

  if (workoutFiles.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-500">No workout routes available</p>
      </div>
    );
  }

  const polylinePositions = route?.coordinates.map(coord => [coord.lat, coord.lon]) || [];
  const center = polylinePositions.length > 0
    ? [polylinePositions[Math.floor(polylinePositions.length / 2)][0],
    polylinePositions[Math.floor(polylinePositions.length / 2)][1]]
    : [0, 0];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Workout Routes</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Workout Route
          </label>
          <select
            value={selectedFile || ''}
            onChange={(e) => {
              if (e.target.value) {
                fetchRoute(e.target.value);
              }
            }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a route...</option>
            {workoutFiles.map((file) => (
              <option key={file.filename} value={file.filename}>
                {file.filename}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500">Loading route...</div>
        )}

        {route && polylinePositions.length > 0 && (
          <div className="mt-4" style={{ height: '500px', width: '100%' }}>
            <MapContainer
              center={center as [number, number]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='<a href="https://www.openstreetmap.org/copyright"></a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline
                positions={polylinePositions as [number, number][]}
                color="#3b82f6"
                weight={4}
              />
              {route.coordinates[0] && (
                <Marker position={[route.coordinates[0].lat, route.coordinates[0].lon]}>
                  <Popup >Start</Popup>
                </Marker>
              )}
              {route.coordinates[route.coordinates.length - 1] && (
                <Marker position={[
                  route.coordinates[route.coordinates.length - 1].lat,
                  route.coordinates[route.coordinates.length - 1].lon
                ]}>
                  <Popup>End</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  );
}

