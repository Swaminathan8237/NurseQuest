import requests
import json

def test():
    # Login
    login_url = "http://localhost:3001/api/auth/login"
    payload = {"email": "student1@nursequest.com", "password": "student123"}
    headers = {"Content-Type": "application/json"}
    
    print("Logging in...")
    r = requests.post(login_url, json=payload, headers=headers)
    print(f"Login response status: {r.status_code}")
    if r.status_code != 200:
        print(r.text)
        return
        
    token = r.json().get("token")
    headers["Authorization"] = f"Bearer {token}"
    
    # Get quizzes
    print("Fetching quizzes...")
    r = requests.get("http://localhost:3001/api/quizzes", headers=headers)
    quizzes = r.json()
    comp_quiz = next((q for q in quizzes if q["title"] == "Comprehensive Nursing Skills Challenge"), None)
    if not comp_quiz:
        print("Comprehensive quiz not found in API response!")
        return
        
    quiz_id = comp_quiz["id"]
    print(f"Found quiz ID: {quiz_id}")
    
    # Get full quiz details
    r = requests.get(f"http://localhost:3001/api/quizzes/{quiz_id}", headers=headers)
    quiz_details = r.json()
    questions = quiz_details["questions"]
    
    # Construct mock answers
    answers = []
    for q in questions:
        answers.append({
            "questionId": q["id"],
            "answer": "Administer epinephrine IM" if q["type"] == "mcq" else None,
            "timeTaken": 5,
            "timeRemaining": 40
        })
        
    submit_payload = {
        "quizId": quiz_id,
        "answers": answers
    }
    
    print("Submitting answers...")
    r = requests.post("http://localhost:3001/api/scores/submit", json=submit_payload, headers=headers)
    print(f"Submit status: {r.status_code}")
    print(f"Submit response: {r.text}")

if __name__ == "__main__":
    test()
