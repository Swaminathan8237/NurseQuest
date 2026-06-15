import sqlite3
import uuid
import json
import os

def seed_quiz():
    db_path = os.path.join(os.path.dirname(__file__), 'nursequest.db')
    print(f"Connecting to database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Find a teacher user
    cursor.execute("SELECT id FROM users WHERE role = 'teacher' LIMIT 1")
    teacher = cursor.fetchone()
    if not teacher:
        print("Error: No teacher user found in database. Please run seed.js first.")
        conn.close()
        return
    teacher_id = teacher[0]
    print(f"Using teacher ID: {teacher_id}")

    # Find a module (optional)
    cursor.execute("SELECT id FROM modules LIMIT 1")
    module_row = cursor.fetchone()
    module_id = module_row[0] if module_row else None
    print(f"Linking to Module ID: {module_id}")

    # Delete existing quiz with same title to allow re-runs
    cursor.execute("SELECT id FROM quizzes WHERE title = ?", ('Comprehensive Nursing Skills Challenge',))
    existing_quiz = cursor.fetchone()
    if existing_quiz:
        print("Removing existing comprehensive quiz...")
        quiz_id = existing_quiz[0]
        cursor.execute("DELETE FROM questions WHERE quiz_id = ?", (quiz_id,))
        cursor.execute("DELETE FROM quiz_attempts WHERE quiz_id = ?", (quiz_id,))
        cursor.execute("DELETE FROM quizzes WHERE id = ?", (quiz_id,))
        conn.commit()

    # Insert quiz
    new_quiz_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO quizzes (id, title, description, category, difficulty, unit, module, time_per_question, created_by, is_published, module_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        new_quiz_id,
        'Comprehensive Nursing Skills Challenge',
        'A challenging assessment containing all 9 interactive question types to test your knowledge and skills.',
        'General Nursing',
        'medium',
        1,
        'Module 1',
        45, # 45 seconds per question
        teacher_id,
        1, # is_published = 1
        module_id
    ))

    print(f"Created Quiz: 'Comprehensive Nursing Skills Challenge' (ID: {new_quiz_id})")

    questions = [
        # 1. MCQ
        {
            'type': 'mcq',
            'question_text': 'What is the primary action when a patient experiences an anaphylactic reaction?',
            'media_url': None,
            'options': json.dumps(['Administer epinephrine IM', 'Apply a warm compress', 'Place in Trendelenburg position', 'Give oral antihistamine']),
            'correct_answer': 'Administer epinephrine IM',
            'explanation': 'Epinephrine is the first-line treatment for anaphylaxis and should be administered intramuscularly immediately.',
            'points': 1000,
            'order_index': 0,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 2. Image MCQ
        {
            'type': 'image',
            'question_text': 'Identify the heart rhythm shown in this ECG illustration:',
            'media_url': '/api/media/placeholder/heart.svg',
            'options': json.dumps(['Normal Sinus Rhythm', 'Ventricular Fibrillation', 'Atrial Fibrillation', 'Bradycardia']),
            'correct_answer': 'Normal Sinus Rhythm',
            'explanation': 'The illustration displays a normal sinus rhythm with regular P waves, QRS complexes, and T waves.',
            'points': 1000,
            'order_index': 1,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 3. Video MCQ
        {
            'type': 'video',
            'question_text': 'After watching the patient assessment video, what is the FIRST thing the nurse should do?',
            'media_url': '/api/media/placeholder/assessment.mp4',
            'options': json.dumps(['Check vital signs', 'Introduce yourself and verify patient identity', 'Administer medication', 'Review medical history']),
            'correct_answer': 'Introduce yourself and verify patient identity',
            'explanation': 'Patient identification and introduction are the foundational first steps of any patient assessment.',
            'points': 1000,
            'order_index': 2,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 4. Audio MCQ
        {
            'type': 'audio',
            'question_text': 'Listen to the heart sound. What condition does this auscultation finding suggest?',
            'media_url': '/api/media/placeholder/heartsound.mp3',
            'options': json.dumps(['Normal heart sounds', 'Heart murmur', 'Atrial fibrillation', 'Pericardial friction rub']),
            'correct_answer': 'Heart murmur',
            'explanation': 'A heart murmur is characterized by turbulent blood flow causing a whooshing or swishing sound.',
            'points': 1000,
            'order_index': 3,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 5. Jumbled Letters
        {
            'type': 'jumbled_letters',
            'question_text': 'Unscramble the letters to find a common analgesic medication:',
            'media_url': None,
            'options': json.dumps(['A', 'C', 'E', 'T', 'A', 'M', 'I', 'N', 'O', 'P', 'H', 'E', 'N']),
            'correct_answer': 'ACETAMINOPHEN',
            'explanation': 'Acetaminophen (also known as paracetamol) is a common analgesic and antipyretic medication.',
            'points': 1000,
            'order_index': 4,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 6. Jumbled Sequence
        {
            'type': 'jumbled_sequence',
            'question_text': 'Arrange the steps of hand hygiene in the correct order:',
            'media_url': None,
            'options': json.dumps(['Wet hands with water', 'Apply soap', 'Rub hands palm to palm', 'Clean thumbs', 'Rinse hands with water']),
            'correct_answer': json.dumps(['Wet hands with water', 'Apply soap', 'Rub hands palm to palm', 'Clean thumbs', 'Rinse hands with water']),
            'explanation': 'The correct sequence ensures all surfaces of the hands are properly decontaminated.',
            'points': 1000,
            'order_index': 5,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        },
        # 7. Slider
        {
            'type': 'slider',
            'question_text': 'Select the normal body temperature in Celsius:',
            'media_url': None,
            'options': '[]',
            'correct_answer': '37',
            'explanation': 'The normal average oral body temperature for a healthy adult is 37°C (98.6°F).',
            'points': 1000,
            'order_index': 6,
            'slider_min': 35,
            'slider_max': 42,
            'slider_step': 0.1,
            'slider_unit': '°C',
            'matching_pairs': None
        },
        # 8. Matching
        {
            'type': 'matching',
            'question_text': 'Match the clinical terms with their corresponding definitions:',
            'media_url': None,
            'options': json.dumps(['Hypertension', 'Hypoglycemia', 'Dehydration', 'Bradycardia']),
            'correct_answer': json.dumps({
                'Hypertension': 'High blood pressure',
                'Hypoglycemia': 'Low blood sugar',
                'Dehydration': 'Dry mouth and thirst',
                'Bradycardia': 'Slow heart rate'
            }),
            'explanation': 'Correctly matching terms is key to professional nursing communication.',
            'points': 1000,
            'order_index': 7,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None,
            'matching_pairs': json.dumps(['High blood pressure', 'Low blood sugar', 'Dry mouth and thirst', 'Slow heart rate'])
        },
        # 9. Captcha
        {
            'type': 'captcha',
            'question_text': 'Select the region containing the heart on this medical illustration:',
            'media_url': '/api/media/placeholder/heart.svg',
            'options': '[]',
            'correct_answer': json.dumps({'x': 0.35, 'y': 0.2, 'w': 0.3, 'h': 0.5}),
            'explanation': 'The heart lies in the thoracic cavity between the lungs, slightly to the left of the midline.',
            'points': 1000,
            'order_index': 8,
            'slider_min': None, 'slider_max': None, 'slider_step': None, 'slider_unit': None, 'matching_pairs': None
        }
    ]

    for q in questions:
        q_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO questions (
                id, quiz_id, type, question_text, media_url, options, correct_answer, explanation, points, order_index,
                slider_min, slider_max, slider_step, slider_unit, matching_pairs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            q_id, new_quiz_id, q['type'], q['question_text'], q['media_url'], q['options'], q['correct_answer'], q['explanation'],
            q['points'], q['order_index'], q['slider_min'], q['slider_max'], q['slider_step'], q['slider_unit'], q['matching_pairs']
        ))
        print(f"Inserted question type: {q['type']}")

    conn.commit()
    conn.close()
    print("Comprehensive quiz seeded successfully!")

if __name__ == "__main__":
    seed_quiz()
