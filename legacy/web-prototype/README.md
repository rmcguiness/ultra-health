> **Archived.** Superseded by `apps/mobile`. It expects the export at `./apple_health_export`,
> which now lives in `/data`. Kept for reference (XML streaming parser in `lib/parsers`).

# Health Data Dashboard

A modern, interactive dashboard for visualizing and analyzing Apple Health export data. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- 📊 **Dashboard Overview**: Key health metrics at a glance
- 📈 **Interactive Charts**: Visualize steps, heart rate, and other metrics over time
- 🏃 **Workout Analysis**: View workout history and routes on interactive maps
- ❤️ **ECG Viewer**: Analyze electrocardiogram data with interactive waveforms
- 📱 **Responsive Design**: Works beautifully on desktop and mobile devices

## Prerequisites

- Node.js 18+ and npm
- Apple Health export data in the `apple_health_export/` directory

## Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure your Apple Health export is in the project root:
```
export-health-data/
├── apple_health_export/
│   ├── export.xml
│   ├── clinical-records/
│   ├── electrocardiograms/
│   └── workout-routes/
└── ...
```

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes for data processing
│   ├── ecg/               # ECG viewer page
│   ├── workouts/          # Workout routes page
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── Dashboard.tsx      # Main dashboard component
│   ├── StatsCards.tsx     # Statistics cards
│   ├── StepsChart.tsx     # Steps visualization
│   ├── HeartRateChart.tsx # Heart rate visualization
│   ├── WorkoutsList.tsx   # Workout history table
│   ├── ECGViewer.tsx      # ECG waveform viewer
│   └── WorkoutMap.tsx     # Workout route map
├── lib/                   # Utility functions
│   ├── parsers/           # Data parsing utilities
│   └── utils/             # Helper functions
└── types/                 # TypeScript type definitions
```

## API Endpoints

- `GET /api/health?endpoint=stats` - Get dashboard statistics
- `GET /api/health?endpoint=steps` - Get steps data grouped by date
- `GET /api/health?endpoint=heartrate` - Get heart rate data
- `GET /api/health?endpoint=workouts` - Get workout list
- `GET /api/health?endpoint=all` - Get all health data
- `GET /api/ecg` - List available ECG files
- `GET /api/ecg?file=<filename>` - Get specific ECG data
- `GET /api/workouts` - List available workout routes
- `GET /api/workouts?file=<filename>` - Get specific workout route
- `GET /api/clinical` - Get clinical records

## Data Processing

The app processes large XML files server-side for optimal performance. Parsed data is cached for 5 minutes to reduce processing time.

## Technologies Used

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Chart library
- **React Leaflet** - Map visualization
- **fast-xml-parser** - XML parsing
- **date-fns** - Date utilities

## Performance Considerations

- Large XML files (>200MB) are parsed server-side
- Data is cached to avoid repeated parsing
- Charts use responsive containers for optimal rendering
- Maps are dynamically imported to reduce initial bundle size

## Future Enhancements

- [ ] Add more health metrics (sleep, nutrition, etc.)
- [ ] Implement data filtering and date range selection
- [ ] Add export functionality for processed data
- [ ] Create comparison views (week-over-week, month-over-month)
- [ ] Add goal tracking and achievements
- [ ] Implement search functionality
- [ ] Add dark mode support

## License

MIT

