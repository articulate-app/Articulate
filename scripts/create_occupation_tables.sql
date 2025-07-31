-- Create tables for real-time occupation awareness system

-- 1. durations table: maps content type + production type to standard duration (in hours)
CREATE TABLE IF NOT EXISTS durations (
    id SERIAL PRIMARY KEY,
    content_type_id INTEGER NOT NULL,
    production_type_id INTEGER NOT NULL,
    duration_hours DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(content_type_id, production_type_id)
);

-- 2. user_workload_settings table: maps user to availability (hours/day)
CREATE TABLE IF NOT EXISTS user_workload_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 3. daily_user_occupation table: stores each user's total hours and occupation ratio per day
CREATE TABLE IF NOT EXISTS daily_user_occupation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    occupation_ratio DECIMAL(5,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 4. ooh table: stores user out-of-office ranges (vacation, sick leave, etc.)
CREATE TABLE IF NOT EXISTS ooh (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    ooh_type VARCHAR(50) NOT NULL DEFAULT 'vacation', -- vacation, sick_leave, holiday, etc.
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_durations_content_production ON durations(content_type_id, production_type_id);
CREATE INDEX IF NOT EXISTS idx_user_workload_settings_user_id ON user_workload_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_user_occupation_user_date ON daily_user_occupation(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_user_occupation_date ON daily_user_occupation(date);
CREATE INDEX IF NOT EXISTS idx_ooh_user_id ON ooh(user_id);
CREATE INDEX IF NOT EXISTS idx_ooh_date_range ON ooh(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ooh_active ON ooh(is_active);

-- Insert some sample data for durations
INSERT INTO durations (content_type_id, production_type_id, duration_hours) VALUES
(1, 1, 4.0),   -- Blog post, Writing
(1, 2, 6.0),   -- Blog post, Editing
(2, 1, 8.0),   -- Article, Writing
(2, 2, 10.0),  -- Article, Editing
(3, 1, 2.0),   -- Social media post, Writing
(3, 2, 3.0),   -- Social media post, Editing
(4, 1, 6.0),   -- Newsletter, Writing
(4, 2, 8.0),   -- Newsletter, Editing
(5, 1, 12.0),  -- Whitepaper, Writing
(5, 2, 16.0)   -- Whitepaper, Editing
ON CONFLICT (content_type_id, production_type_id) DO NOTHING;

-- Insert default workload settings for existing users
INSERT INTO user_workload_settings (user_id, hours_per_day)
SELECT id, 8.0 FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Create a function to calculate and update daily occupation
CREATE OR REPLACE FUNCTION calculate_daily_occupation(
    p_user_id INTEGER,
    p_date DATE
) RETURNS DECIMAL(5,4) AS $$
DECLARE
    v_total_hours DECIMAL(6,2) := 0;
    v_capacity DECIMAL(4,2) := 8.0;
    v_occupation_ratio DECIMAL(5,4) := 0;
BEGIN
    -- Get user's daily capacity
    SELECT hours_per_day INTO v_capacity
    FROM user_workload_settings
    WHERE user_id = p_user_id AND is_active = TRUE;
    
    -- Calculate total hours from tasks for the given date
    SELECT COALESCE(SUM(
        CASE 
            WHEN d.duration_hours IS NOT NULL THEN d.duration_hours
            ELSE 4.0 -- Default duration if not found
        END
    ), 0) INTO v_total_hours
    FROM tasks t
    LEFT JOIN durations d ON t.content_type_id = d.content_type_id 
        AND t.production_type_id = d.production_type_id
    WHERE t.assigned_to_id = p_user_id 
        AND t.delivery_date = p_date
        AND t.is_deleted = FALSE;
    
    -- Calculate occupation ratio
    IF v_capacity > 0 THEN
        v_occupation_ratio := LEAST(v_total_hours / v_capacity, 2.0); -- Cap at 200%
    END IF;
    
    -- Insert or update daily occupation
    INSERT INTO daily_user_occupation (user_id, date, total_hours, occupation_ratio)
    VALUES (p_user_id, p_date, v_total_hours, v_occupation_ratio)
    ON CONFLICT (user_id, date) 
    DO UPDATE SET 
        total_hours = EXCLUDED.total_hours,
        occupation_ratio = EXCLUDED.occupation_ratio,
        updated_at = NOW();
    
    RETURN v_occupation_ratio;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to recalculate occupation when tasks are modified
CREATE OR REPLACE FUNCTION trigger_recalculate_occupation()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate occupation for the affected user and date
    IF TG_OP = 'INSERT' THEN
        PERFORM calculate_daily_occupation(NEW.assigned_to_id, NEW.delivery_date);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Recalculate for both old and new dates if they changed
        IF OLD.assigned_to_id != NEW.assigned_to_id OR OLD.delivery_date != NEW.delivery_date THEN
            PERFORM calculate_daily_occupation(OLD.assigned_to_id, OLD.delivery_date);
            PERFORM calculate_daily_occupation(NEW.assigned_to_id, NEW.delivery_date);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM calculate_daily_occupation(OLD.assigned_to_id, OLD.delivery_date);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS tasks_occupation_trigger ON tasks;
CREATE TRIGGER tasks_occupation_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_recalculate_occupation();

-- Create a function to get occupation data for a user and date
CREATE OR REPLACE FUNCTION get_user_occupation(
    p_user_id INTEGER,
    p_date DATE,
    p_content_type_id INTEGER DEFAULT NULL,
    p_production_type_id INTEGER DEFAULT NULL
) RETURNS TABLE(
    existing_hours DECIMAL(6,2),
    new_task_duration DECIMAL(5,2),
    adjusted_hours DECIMAL(6,2),
    capacity DECIMAL(4,2),
    occupation_ratio DECIMAL(5,4),
    adjusted_occupation_ratio DECIMAL(5,4),
    is_ooh BOOLEAN,
    ooh_type VARCHAR(50)
) AS $$
DECLARE
    v_existing_hours DECIMAL(6,2) := 0;
    v_new_task_duration DECIMAL(5,2) := 4.0; -- Default duration
    v_capacity DECIMAL(4,2) := 8.0;
    v_is_ooh BOOLEAN := FALSE;
    v_ooh_type VARCHAR(50) := NULL;
BEGIN
    -- Get existing occupation
    SELECT total_hours INTO v_existing_hours
    FROM daily_user_occupation
    WHERE user_id = p_user_id AND date = p_date;
    
    -- Get user capacity
    SELECT hours_per_day INTO v_capacity
    FROM user_workload_settings
    WHERE user_id = p_user_id AND is_active = TRUE;
    
    -- Check if user is OOH
    SELECT TRUE, ooh_type INTO v_is_ooh, v_ooh_type
    FROM ooh
    WHERE user_id = p_user_id 
        AND p_date BETWEEN start_date AND end_date
        AND is_active = TRUE
    LIMIT 1;
    
    -- Get task duration if content type and production type are provided
    IF p_content_type_id IS NOT NULL AND p_production_type_id IS NOT NULL THEN
        SELECT duration_hours INTO v_new_task_duration
        FROM durations
        WHERE content_type_id = p_content_type_id 
            AND production_type_id = p_production_type_id;
    END IF;
    
    -- Return the results
    RETURN QUERY SELECT 
        COALESCE(v_existing_hours, 0),
        v_new_task_duration,
        COALESCE(v_existing_hours, 0) + v_new_task_duration,
        v_capacity,
        CASE WHEN v_capacity > 0 THEN LEAST(COALESCE(v_existing_hours, 0) / v_capacity, 2.0) ELSE 0 END,
        CASE WHEN v_capacity > 0 THEN LEAST((COALESCE(v_existing_hours, 0) + v_new_task_duration) / v_capacity, 2.0) ELSE 0 END,
        v_is_ooh,
        v_ooh_type;
END;
$$ LANGUAGE plpgsql;

-- Create a function to suggest available dates
CREATE OR REPLACE FUNCTION suggest_available_dates(
    p_user_id INTEGER,
    p_start_date DATE,
    p_content_type_id INTEGER DEFAULT NULL,
    p_production_type_id INTEGER DEFAULT NULL,
    p_max_days INTEGER DEFAULT 10,
    p_max_occupation DECIMAL(5,4) DEFAULT 0.7
) RETURNS TABLE(
    suggested_date DATE,
    occupation_ratio DECIMAL(5,4),
    is_ooh BOOLEAN
) AS $$
DECLARE
    v_task_duration DECIMAL(5,2) := 4.0;
    v_current_date DATE := p_start_date;
    v_days_checked INTEGER := 0;
BEGIN
    -- Get task duration if provided
    IF p_content_type_id IS NOT NULL AND p_production_type_id IS NOT NULL THEN
        SELECT duration_hours INTO v_task_duration
        FROM durations
        WHERE content_type_id = p_content_type_id 
            AND production_type_id = p_production_type_id;
    END IF;
    
    -- Check dates starting from the requested date
    WHILE v_days_checked < p_max_days LOOP
        -- Check if user is OOH on this date
        IF NOT EXISTS (
            SELECT 1 FROM ooh 
            WHERE user_id = p_user_id 
                AND v_current_date BETWEEN start_date AND end_date
                AND is_active = TRUE
        ) THEN
            -- Check occupation ratio
            DECLARE
                v_occupation_data RECORD;
            BEGIN
                SELECT * INTO v_occupation_data
                FROM get_user_occupation(p_user_id, v_current_date, p_content_type_id, p_production_type_id);
                
                IF v_occupation_data.adjusted_occupation_ratio <= p_max_occupation THEN
                    RETURN QUERY SELECT 
                        v_current_date,
                        v_occupation_data.adjusted_occupation_ratio,
                        FALSE;
                END IF;
            END;
        END IF;
        
        v_current_date := v_current_date + INTERVAL '1 day';
        v_days_checked := v_days_checked + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql; 