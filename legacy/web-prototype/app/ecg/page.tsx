import ECGViewer from '@/components/ECGViewer';

export default function ECGPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">ECG Viewer</h1>
        <ECGViewer />
      </div>
    </main>
  );
}

