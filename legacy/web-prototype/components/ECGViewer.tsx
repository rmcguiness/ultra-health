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
  Brush,
} from 'recharts';
import { ECGData } from '@/types/health';

export default function ECGViewer() {
  const [ecgFiles, setEcgFiles] = useState<Array<{ filename: string; path: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [ecgData, setEcgData] = useState<ECGData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<string>('');

  useEffect(() => {
    fetchECGFiles();
  }, []);

  const fetchECGFiles = async () => {
    try {
      const response = await fetch('/api/ecg');
      if (!response.ok) throw new Error('Failed to fetch ECG files');
      const data = await response.json();
      setEcgFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching ECG files:', error);
    }
  };

  const fetchECGData = async (filename: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/ecg?file=${filename}`);
      if (!response.ok) throw new Error('Failed to fetch ECG data');
      const data = await response.json();
      setEcgData(data);
      setSelectedFile(filename);
      // Set first lead as default
      const firstLead = Object.keys(data.leads || {})[0];
      if (firstLead) setSelectedLead(firstLead);
    } catch (error) {
      console.error('Error fetching ECG data:', error);
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = () => {
    if (!ecgData || !selectedLead || !ecgData.leads[selectedLead]) {
      return [];
    }

    const samples = ecgData.leads[selectedLead];
    const sampleRate = parseFloat(ecgData.sampleRate?.replace(' hertz', '') || '512');
    const timeInterval = 1000 / sampleRate; // milliseconds per sample

    return samples.map((value, index) => ({
      time: (index * timeInterval).toFixed(2),
      value: value,
    }));
  };

  const chartData = prepareChartData();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">ECG Viewer</h2>
        
        {/* File Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select ECG File
          </label>
          <select
            value={selectedFile || ''}
            onChange={(e) => {
              if (e.target.value) {
                fetchECGData(e.target.value);
              }
            }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a file...</option>
            {ecgFiles.map((file) => (
              <option key={file.filename} value={file.filename}>
                {file.filename}
              </option>
            ))}
          </select>
        </div>

        {ecgData && (
          <>
            {/* ECG Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Recorded:</span>{' '}
                <span className="text-gray-900">{ecgData.recordedDate}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Classification:</span>{' '}
                <span className="text-gray-900">{ecgData.classification}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Device:</span>{' '}
                <span className="text-gray-900">{ecgData.device}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Sample Rate:</span>{' '}
                <span className="text-gray-900">{ecgData.sampleRate}</span>
              </div>
            </div>

            {/* Lead Selection */}
            {Object.keys(ecgData.leads).length > 1 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Lead
                </label>
                <select
                  value={selectedLead}
                  onChange={(e) => setSelectedLead(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {Object.keys(ecgData.leads).map((lead) => (
                    <option key={lead} value={lead}>
                      {lead}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ECG Chart */}
            {chartData.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-800 mb-2">
                  {selectedLead} Waveform
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      label={{ value: 'Time (ms)', position: 'insideBottom', offset: -5 }}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis 
                      label={{ value: 'Voltage (µV)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)} µV`, 'Voltage']}
                      labelStyle={{ color: '#374151' }}
                    />
                    <Brush dataKey="time" height={30} />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#ef4444" 
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="text-center py-8 text-gray-500">Loading ECG data...</div>
        )}
      </div>
    </div>
  );
}

