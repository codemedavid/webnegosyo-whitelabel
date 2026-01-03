# Mapbox Address Search Improvements

## Problem
The address autocomplete wasn't finding specific Philippine establishments like:
- Jollibee Molino
- Puregold Magdiwang
- Local barangays and neighborhoods

## Root Cause
The previous implementation had issues:
1. **Limited Geocoding API usage** - Not using proper POI-focused parameters
2. **No proximity bias** - Results weren't prioritized by location relevance
3. **No fuzzy matching** - Exact matches only
4. **Incomplete POI database** - Mapbox's Philippines POI coverage is limited

## Solution Implemented

### 1. Enhanced Mapbox Geocoding API Usage
Now uses **three parallel search strategies**:

```typescript
// Strategy 1: POI-focused search with proximity bias
types=poi&proximity=120.9842,14.5995&country=PH

// Strategy 2: Broader search (POI + addresses + places)
types=poi,place,address,locality&proximity=120.9842,14.5995&country=PH

// Strategy 3: Fuzzy matching for typo tolerance
fuzzyMatch=true&proximity=120.9842,14.5995&country=PH
```

### 2. Added Nominatim (OpenStreetMap) Fallback
When Mapbox returns fewer than 3 results, automatically queries **Nominatim** which has:
- ✅ Better Philippine POI coverage
- ✅ Community-contributed local data
- ✅ Free to use (no API key needed)
- ✅ Includes establishments like Jollibee, Puregold, etc.

### 3. Smart Deduplication
Results from multiple sources are deduplicated based on coordinate proximity (~11m precision).

### 4. Removed Google Places Dependency
Since no Google API key is available, removed the Google Places integration.

## Test Results

### Before (Old Implementation)
```
Search: "jollibee molino"
❌ Result: Generic "Molino Road" addresses only

Search: "puregold magdiwang"  
❌ Result: Generic "Magdiwang Street" addresses only
```

### After (New Implementation)
```
Search: "jollibee molino"
✅ Result: Jollibee, Molino Road, Villa Maria, Molino, Bacoor, Cavite
✅ Result: 2 more Jollibee branches in Molino area

Search: "puregold magdiwang"
✅ Result: Puregold Noveleta, Magdiwang Highway, Noveleta, Cavite
✅ Result: Puregold, Magdiwang Road, Molino, Bacoor, Cavite
```

## Technical Details

### Main Search Box
Location: `handleMainSearch()` in `mapbox-address-autocomplete.tsx`

Flow:
1. Query Mapbox with 3 strategies in parallel
2. Combine and deduplicate results
3. If < 3 results, query Nominatim as fallback
4. Display up to 10 unique results

### Map Picker Search
Location: `handleMapSearch()` in `mapbox-address-autocomplete.tsx`

Same strategy as main search but within the map modal dialog.

### Rate Limiting
- **Mapbox**: 100,000 free requests/month
- **Nominatim**: 1 request/second (automatically handled by only calling when needed)

## Key Parameters Explained

### `types=poi`
Focuses search on Points of Interest (restaurants, stores, landmarks)

### `proximity=120.9842,14.5995`
Biases results toward Manila area (customizable per tenant location)

### `fuzzyMatch=true`
Tolerates typos and partial matches

### `country=PH`
Restricts results to Philippines only

## Files Modified

1. **src/components/shared/mapbox-address-autocomplete.tsx**
   - Enhanced `handleMainSearch()` with multi-strategy search
   - Enhanced `handleMapSearch()` with same approach
   - Added Nominatim fallback integration
   - Removed Google Places code

2. **scripts/test-mapbox-search.mjs**
   - Updated to test all three search strategies
   - Shows results from each strategy separately

## Testing

Test the search functionality:

```bash
# Test Jollibee search
node scripts/test-mapbox-search.mjs "jollibee molino"

# Test Puregold search
node scripts/test-mapbox-search.mjs "puregold magdiwang"

# Test any Philippine location
node scripts/test-mapbox-search.mjs "sm lucena"
```

## Usage Tips for Users

### Finding Specific Establishments
1. Type the brand name + area (e.g., "jollibee molino")
2. Results now include actual POI locations, not just streets
3. If typing doesn't find it, use the **Map Picker** button

### Using Map Picker (Best for Precision)
1. Click the 🗺️ Map icon
2. Search or visually locate on map
3. Click to place marker
4. Drag to adjust exact position

### Using GPS Location
Click the 📍 GPS icon to automatically get your current location.

## Future Enhancements

### If More Coverage Needed
1. **Add Overpass API** (OpenStreetMap's query API) for custom POI queries
2. **Custom POI Database** - Maintain tenant-specific common delivery locations
3. **Google Places** (requires API key & costs) - Best commercial coverage

### Performance Optimizations
1. Add debouncing (300ms delay after typing)
2. Cache frequent searches in localStorage
3. Self-host Nominatim for unlimited requests

## Monitoring

Watch for these metrics in production:
- **Search success rate** - % of searches that return results
- **Nominatim usage** - How often fallback is triggered
- **User behavior** - Map picker vs search usage

## Notes

- Nominatim requires `User-Agent` header (set to `WhitelabelDeliveryApp/1.0`)
- Rate limit is 1 req/sec - we only call it as fallback, so this is fine
- OpenStreetMap data quality varies by area - encourage users to contribute missing POIs

## Support

If specific locations are still not found:
1. Check if location exists on [OpenStreetMap](https://www.openstreetmap.org)
2. If missing, anyone can add it (takes 5 minutes)
3. Nominatim updates from OSM data regularly
4. Alternatively, use Map Picker for any location

