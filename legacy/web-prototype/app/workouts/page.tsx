import WorkoutMap from '@/components/WorkoutMap';

export default function WorkoutsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Workout Routes</h1>
        <WorkoutMap />
      </div>
    </main>
  );
}

