import sqlite3

def fix():
    conn = sqlite3.connect('backend/db/nursequest.db')
    cursor = conn.cursor()
    print("🚀 Repairing question_answers foreign key target in Python...")
    try:
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        # Check if question_answers exists, if so rename, otherwise create
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='question_answers'")
        table_exists = cursor.fetchone()
        
        if table_exists:
            # Rename existing question_answers to old
            cursor.execute("ALTER TABLE question_answers RENAME TO question_answers_old")
            
            # Recreate with correct FK referencing questions(id)
            cursor.execute("""
              CREATE TABLE question_answers (
                id TEXT PRIMARY KEY,
                attempt_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                user_answer TEXT,
                is_correct INTEGER DEFAULT 0,
                points_earned INTEGER DEFAULT 0,
                time_taken INTEGER DEFAULT 0,
                FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id)
              )
            """)
            
            # Copy existing data
            cursor.execute("""
              INSERT INTO question_answers (id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken)
              SELECT id, attempt_id, question_id, user_answer, is_correct, points_earned, time_taken
              FROM question_answers_old
            """)
            
            # Drop the old table
            cursor.execute("DROP TABLE question_answers_old")
        else:
            # Create fresh table
            cursor.execute("""
              CREATE TABLE question_answers (
                id TEXT PRIMARY KEY,
                attempt_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                user_answer TEXT,
                is_correct INTEGER DEFAULT 0,
                points_earned INTEGER DEFAULT 0,
                time_taken INTEGER DEFAULT 0,
                FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id)
              )
            """)
        
        conn.commit()
        print("  ✅ question_answers table recreated with correct foreign key references")
        
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA foreign_key_check")
        fk_check = cursor.fetchall()
        if len(fk_check) > 0:
            print("⚠️  Foreign key integrity issues still found:", fk_check[:5])
        else:
            print("  ✅ Database foreign key integrity fully verified and clean!")
            
    except Exception as e:
        print("❌ Error during fix:", e)
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    fix()
