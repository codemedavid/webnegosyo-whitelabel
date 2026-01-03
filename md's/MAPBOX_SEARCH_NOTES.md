# Mapbox Search Limitations & Solutions

## Current Situation

Mapbox search has been optimized but has limitations for specific establishments and landmarks in the Philippines.

### What Works ✅

- Street addresses
- Cities and towns  
- Neighborhoods and subdivisions
- Major landmarks that are in Mapbox data
- Shopping malls (some, like SM City Naga, SM City Bicutan)
- Streets and roads

### What May Not Work ❌

- Specific mall branches (e.g., "SM Lucena")
- Some commercial establishments
- Private subdivisions
- Branded locations not in Mapbox database

## Why This Happens

Mapbox relies on OpenStreetMap and other data sources that may not include all commercial establishments, especially newer ones or those in smaller cities.

## Solutions for Users

### Option 1: Use Map Picker (Recommended)
If a place doesn't appear in search:
1. Click the 🗺️ **Map** icon
2. Find the location visually on the map
3. Click to place marker
4. Drag to adjust exact location

### Option 2: Enter Nearby Address
Instead of "SM Lucena", users can:
1. Enter nearby street address
2. Or use the general area/location
3. Map picker to pinpoint exact location

### Option 3: Use Current Location
Click the 📍 **GPS** icon to get current location automatically.

## Improvements Made

### Enhanced Search Strategy
1. **Broad Types**: Searches `address,poi,place,neighborhood,locality`
2. **Fallback Search**: If no results, tries without type restrictions
3. **Global Fallback**: Removes country restriction if still no results
4. **Result Limit**: Increased from 5 to 8-10 results

### Better Results
- More neighborhoods and subdivisions
- More establishments in database
- Address variations
- Better coverage overall

## Testing Results

```
✅ Working:
- Alabang
- SM City Naga
- SM City Bicutan  
- Quezon City
- Major streets

⚠️  Limited:
- SM Lucena (shows Lucena city and streets)
- BGC (some street matches)
- Specific mall branches
```

## Alternative Solutions (Future)

If Mapbox limitations become a major issue:

### 1. Add Google Places Autocomplete
- Better coverage of commercial establishments
- More POI data for Philippines
- Requires Google Maps API key
- Additional cost

### 2. Add Custom Places Database
- Maintain own database of common destinations
- Supplement Mapbox results
- More control
- Requires maintenance

### 3. Hybrid Approach
- Use Mapbox for free searching
- Add Google Places as premium feature
- Best of both worlds

## Recommendations

**For Now**: Keep current Mapbox implementation with enhanced search. The map picker provides excellent fallback.

**For Users**: Add tooltip or help text:
> "Can't find your place? Use the map picker to select your location visually."

**For Future**: Consider adding Google Places if commercial establishment search becomes critical.

## Current UX Flow

1. User types address → Search results appear
2. No results found → User clicks map picker
3. User clicks on map → Location selected
4. User can drag marker → Fine-tune location

This ensures users can always select their location even if search doesn't find it!

