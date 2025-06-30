-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table to store user information
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    mail VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Can store hashed password or 'google' for OAuth users
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table to store pending tasks for users
CREATE TABLE task (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    date INTEGER NOT NULL, -- Day of the month, e.g., 1, 15, 31
    month INTEGER NOT NULL, -- Month of the year, e.g., 1 for Jan, 12 for Dec
    year INTEGER NOT NULL, -- Year, e.g., 2024
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Completed tasks table to store tasks that have been marked as complete
CREATE TABLE complete_task (
    task_id UUID PRIMARY KEY, -- Uses the same task_id from the 'task' table when moved
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    date INTEGER NOT NULL, -- Day of the month
    month INTEGER NOT NULL, -- Month of the year
    year INTEGER NOT NULL, -- Year
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Completion percentage table to store daily task completion rate for each user
CREATE TABLE complete_percentage (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL, -- Stores the specific date, e.g., '2024-07-28'
    percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, date) -- Ensures one entry per user per day
);

-- Optional: Add indexes for frequently queried columns for performance
CREATE INDEX idx_task_user_date ON task(user_id, year, month, date);
CREATE INDEX idx_complete_task_user_date ON complete_task(user_id, year, month, date);
CREATE INDEX idx_complete_percentage_user_date ON complete_percentage(user_id, date);

-- Note on `task_id` in `complete_task`:
-- The current app.js logic deletes a task from `task` and inserts it into `complete_task`
-- using the same `task_id` and `task` content. This means `task_id` remains unique
-- across its lifecycle from pending to completed. If a task could be "uncompleted"
-- and move back to the `task` table, this structure is fine.
-- If `task_id` in `complete_task` should be independent (e.g., if a task could be
-- completed multiple times with different `task_id`s each time), then `task_id` in
-- `complete_task` should also use `DEFAULT uuid_generate_v4()`.
-- However, based on current app.js, it seems to be a direct move.

-- Note on date storage in `task` and `complete_task`:
-- Storing date, month, and year as separate integers is what app.js currently uses for queries.
-- For `complete_percentage`, app.js uses `new Date().toISOString().split('T')[0]` which is 'YYYY-MM-DD',
-- so a `DATE` type is appropriate there. This inconsistency is noted from app.js.
-- For more robust date operations, storing full dates (e.g., as DATE type) in `task` and
-- `complete_task` tables might be preferable in a future refactor, allowing easier date-based
-- queries (e.g., tasks from the last 7 days). However, this SQL script reflects the current
-- usage in app.js.
