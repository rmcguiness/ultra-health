# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Verify Data Structure**
   Ensure your `apple_health_export` directory is in the project root with the following structure:
   ```
   apple_health_export/
   ├── export.xml (required)
   ├── clinical-records/ (optional)
   ├── electrocardiograms/ (optional)
   └── workout-routes/ (optional)
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Open Browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Troubleshooting

### Large XML File Issues

If your `export.xml` file is very large (>200MB), the initial parse may take some time. The app caches parsed data for 5 minutes to improve subsequent loads.

**Options for better performance:**
1. Pre-process the XML file into JSON format
2. Use a streaming XML parser (modify `lib/parsers/xmlParser.ts`)
3. Split the export into smaller date ranges

### Missing Data

If certain visualizations show "No data available":
- Verify your export.xml contains the expected data types
- Check the browser console for API errors
- Ensure file paths in API routes match your directory structure

### TypeScript Errors

If you see TypeScript errors about missing modules:
- Run `npm install` to ensure all dependencies are installed
- Verify `@types/node` is in your `node_modules`

## Performance Tips

1. **First Load**: The initial parse of a large XML file may take 30-60 seconds
2. **Caching**: Parsed data is cached for 5 minutes (see `app/api/health/route.ts`)
3. **Charts**: Charts render the last 30 days by default to keep performance optimal
4. **Maps**: Leaflet maps are dynamically imported to reduce bundle size

## Next Steps

- Customize date ranges in chart components
- Add more health metrics
- Implement data filtering
- Add export functionality

