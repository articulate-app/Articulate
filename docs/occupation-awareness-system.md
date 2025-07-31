# Real-Time Occupation Awareness System

## Overview

The Real-Time Occupation Awareness System enhances the Add Task form with intelligent user workload monitoring. It provides real-time visibility into user availability and prevents over-assignment of tasks.

## Features

### 🎯 Core Functionality
- **Real-time occupation calculation** based on existing tasks and pending task duration
- **Out-of-office (OOH) detection** for vacation, sick leave, and other absences
- **Color-coded status indicators** (Green/Yellow/Red) based on occupation levels
- **Smart date suggestions** when users are unavailable or overbooked
- **Real-time updates** via Supabase Realtime subscriptions

### 📊 Occupation Levels
- **🟢 Green (< 70%)**: User is available
- **🟡 Yellow (70-99%)**: User is nearly full
- **🔴 Red (≥ 100%)**: User is fully booked or OOH

## Database Schema

### Tables

#### `durations`
Maps content type + production type combinations to standard task durations.

```sql
CREATE TABLE durations (
    id SERIAL PRIMARY KEY,
    content_type_id INTEGER NOT NULL,
    production_type_id INTEGER NOT NULL,
    duration_hours DECIMAL(5,2) NOT NULL,
    UNIQUE(content_type_id, production_type_id)
);
```

#### `user_workload_settings`
Stores user daily capacity and availability settings.

```sql
CREATE TABLE user_workload_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id)
);
```

#### `daily_user_occupation`
Tracks daily occupation ratios for each user.

```sql
CREATE TABLE daily_user_occupation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    total_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    occupation_ratio DECIMAL(5,4) NOT NULL DEFAULT 0,
    UNIQUE(user_id, date)
);
```

#### `ooh`
Manages out-of-office periods.

```sql
CREATE TABLE ooh (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    ooh_type VARCHAR(50) NOT NULL DEFAULT 'vacation',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    CHECK (end_date >= start_date)
);
```

### Database Functions

#### `get_user_occupation(p_user_id, p_date, p_content_type_id, p_production_type_id)`
Returns comprehensive occupation data including:
- Existing hours
- New task duration
- Adjusted occupation ratio
- OOH status

#### `suggest_available_dates(p_user_id, p_start_date, p_content_type_id, p_production_type_id, p_max_days, p_max_occupation)`
Returns alternative dates with occupation below the specified threshold.

#### `calculate_daily_occupation(p_user_id, p_date)`
Recalculates and updates daily occupation data.

## Edge Function Integration

The occupation awareness system uses a Supabase Edge Function for optimal performance and centralized business logic.

### Edge Function: `user-occupation-preview`

The Edge Function supports two modes: **Calendar Mode** and **Single Date Mode**.

#### Endpoint
```http
POST https://hlszgarnpleikfkwujph.supabase.co/functions/v1/user-occupation-preview
```

#### Calendar Mode (for date picker)
**Request Body:**
```json
{
  "user_id": number,
  "content_type_id": number,
  "production_type_id": number,
  "range_start": "YYYY-MM-DD",
  "range_end": "YYYY-MM-DD"
}
```

**Response:**
```json
{
  "dates": [
    { "date": "2025-08-01", "adjusted_occupation": 0.5, "color": "green" },
    { "date": "2025-08-02", "adjusted_occupation": 0.8, "color": "yellow" },
    { "date": "2025-08-03", "adjusted_occupation": 1.2, "color": "red" }
  ]
}
```

#### Single Date Mode (for detailed preview)
**Request Body:**
```json
{
  "user_id": number,
  "content_type_id": number,
  "production_type_id": number,
  "delivery_date": "YYYY-MM-DD"
}
```

**Response:**
```json
{
  "is_ooh": false,
  "ooh_type": null,
  "existing_total_hours": 4,
  "new_task_duration": 1,
  "capacity": 8,
  "adjusted_occupation": 0.63,
  "suggested_alternative_dates": ["2025-08-13", "2025-08-14"]
}
```

### Calendar Integration

The system provides **color-coded calendar dates** based on user occupation:

- 🟢 **Green**: Available (< 70% occupation)
- 🟡 **Yellow**: Busy (70-99% occupation)  
- 🔴 **Red**: Full or OOH (≥ 100% occupation or out-of-office)

### Debounced API Calls

The system implements **300ms debouncing** to prevent API spam during rapid field changes. The Edge Function is called in two scenarios:

#### 1. Calendar Mode (when user/type fields change)
- **Trigger**: `user_id`, `content_type_id`, or `production_type_id` change
- **Request**: Calendar mode with `range_start` and `range_end`
- **Purpose**: Color-code calendar dates

#### 2. Single Date Mode (when specific date selected)
- **Trigger**: `delivery_date` selection
- **Request**: Single date mode with `delivery_date`
- **Purpose**: Show detailed occupation preview

## React Components

### `useOccupationAwareness` Hook

Custom hook that manages occupation data fetching and real-time updates.

```typescript
const {
  occupationData,
  isOccupationLoading,
  suggestedDates,
  getOccupationStatus,
  getOccupationMessage,
} = useOccupationAwareness({
  userId,
  contentTypeId,
  productionTypeId,
  deliveryDate,
});
```

### `OccupationAwareDatePicker` Component

Provides a calendar interface with color-coded dates based on user occupation.

```typescript
<OccupationAwareDatePicker
  value={deliveryDate}
  onChange={setDeliveryDate}
  userId={userId}
  contentTypeId={contentTypeId}
  productionTypeId={productionTypeId}
  placeholder="Select delivery date"
/>
```

### `OccupationAwarenessDisplay` Component

Displays detailed occupation information with status indicators and suggested dates.

```typescript
<OccupationAwarenessDisplay
  userId={userId}
  contentTypeId={contentTypeId}
  productionTypeId={productionTypeId}
  deliveryDate={deliveryDate}
  onDateSelect={(date) => setValue('delivery_date', date)}
/>
```

## Integration with Add Task Form

The occupation awareness system is integrated into the Add Task form and triggers when these fields change:

1. **assigned_to_id** (user)
2. **content_type_id**
3. **production_type_id**
4. **delivery_date**

### Real-time Updates

The system subscribes to Supabase Realtime for the `daily_user_occupation` table and automatically refreshes occupation data when changes occur. The Edge Function provides a centralized way to handle all occupation calculations and business logic.

### Automatic Recalculation

Database triggers automatically recalculate occupation when tasks are created, updated, or deleted.

## Setup Instructions

1. **Run the SQL script** to create tables and functions:
   ```bash
   psql -d your_database -f scripts/create_occupation_tables.sql
   ```

2. **Insert sample data** for durations (already included in the script)

3. **Configure user workload settings** for existing users

4. **Add OOH entries** as needed

## Usage Examples

### Adding OOH Entry
```sql
INSERT INTO ooh (user_id, start_date, end_date, ooh_type, description)
VALUES (1, '2024-01-15', '2024-01-19', 'vacation', 'Winter vacation');
```

### Updating User Capacity
```sql
UPDATE user_workload_settings 
SET hours_per_day = 6.0 
WHERE user_id = 1;
```

### Adding Custom Duration
```sql
INSERT INTO durations (content_type_id, production_type_id, duration_hours)
VALUES (1, 1, 5.0);
```

## Error Handling

The system includes comprehensive error handling:
- Graceful fallbacks for missing data
- Default values for missing durations
- Error states in UI components
- Retry mechanisms for failed API calls

## Performance Considerations

- **Indexed queries** for fast occupation lookups
- **Caching** with React Query for API responses
- **Debounced updates** to prevent excessive API calls
- **Efficient real-time subscriptions** with targeted filters

## Future Enhancements

- **Team workload views** for managers
- **Capacity planning** with future date projections
- **Workload balancing** suggestions
- **Integration with calendar systems**
- **Advanced OOH types** (meetings, training, etc.) 