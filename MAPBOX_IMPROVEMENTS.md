# Mapbox Search Improvements

## ✅ Enhanced Search Functionality

Updated Mapbox address autocomplete to include more location types for better search results.

### What Changed

**Before**:
- Only searched: `address,poi`
- Limited to 5 results
- Missed establishments, landmarks, subdivisions

**After**:
- Searches: `address,poi,place,neighborhood,locality`
- Up to 8 results
- Finds establishments, landmarks, subdivisions, neighborhoods

### New Search Types

- **address**: Street addresses
- **poi**: Points of interest (businesses, landmarks)
- **place**: Cities, towns, regions
- **neighborhood**: Neighborhoods, subdivisions
- **locality**: Localities, barangays

### Benefits

Now users can find:
- ✅ Establishments (malls, restaurants, shops)
- ✅ Landmarks (parks, monuments, buildings)
- ✅ Subdivisions (residential areas)
- ✅ Neighborhoods (localities, barangays)
- ✅ Business addresses
- ✅ Popular places

### Updated Files

- `src/components/shared/mapbox-address-autocomplete.tsx`
  - Main search autocomplete
  - Map dialog search

### Testing

Try searching for:
- Shopping malls (e.g., "SM Mall")
- Subdivisions (e.g., "Ayala Alabang")
- Landmarks (e.g., "Rizal Park")
- Neighborhoods (e.g., "Makati CBD")
- Establishments (e.g., "Jollibee")

All should now appear in search results!
