import json
import re
import os

def main():
    json_path = r"C:\Users\Swaminathan\.gemini\antigravity-ide\brain\f4d581f2-8edb-4220-ac8a-4dbeb54abd3a\.system_generated\steps\91\content.md"
    
    with open(json_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        json_line = ""
        for line in lines:
            if line.strip().startswith('{"version"'):
                json_line = line
                break
                
    data = json.loads(json_line)
    results = data.get('resultList', {}).get('result', [])
    
    valid_refs = []
    for r in results:
        title = r.get('title', '').strip()
        if title.endswith('.'):
            title = title[:-1]
        
        if title.startswith('[') and title.endswith(']'):
            title = title[1:-1]
            
        journal_info = r.get('journalInfo', {})
        journal = journal_info.get('journal', {})
        journal_title = journal.get('medlineAbbreviation') or journal.get('title') or r.get('journalTitle')
        
        volume = journal_info.get('volume')
        issue = journal_info.get('issue')
        pages = r.get('pageInfo')
        year = r.get('pubYear')
        
        author_list = r.get('authorList', {}).get('author', [])
        authors = []
        for auth in author_list:
            lastName = auth.get('lastName', '')
            initials = auth.get('initials', '')
            if lastName and initials:
                dotted_initials = ". ".join(list(initials)) + "."
                authors.append(f"{dotted_initials} {lastName}")
            elif lastName:
                authors.append(lastName)
                
        if not authors or not journal_title or not year or not volume or not pages:
            continue
            
        if len(authors) > 6:
            author_formatted = ", ".join(authors[:6]) + ", et al."
        else:
            author_formatted = ", ".join(authors)
            
        title = re.sub(r'\s+', ' ', title)
        
        pub_date = r.get('firstPublicationDate', '')
        month_str = "Dec"
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        if pub_date and len(pub_date) >= 7:
            try:
                m_idx = int(pub_date[5:7]) - 1
                if 0 <= m_idx < 12:
                    month_str = months[m_idx]
            except ValueError:
                pass
        elif r.get('pubMonth'):
            try:
                m_idx = int(r.get('pubMonth')) - 1
                if 0 <= m_idx < 12:
                    month_str = months[m_idx]
            except ValueError:
                month_str = r.get('pubMonth')[:3]
                
        ref_dict = {
            'authors': author_formatted,
            'title': title,
            'journal': journal_title,
            'volume': volume,
            'issue': issue,
            'pages': pages,
            'year': year,
            'month': month_str
        }
        valid_refs.append(ref_dict)
        
    print(f"Found {len(valid_refs)} fully formatted references:")
    for i, ref in enumerate(valid_refs):
        vol_issue = f"vol. {ref['volume']}"
        if ref['issue']:
            vol_issue += f", no. {ref['issue']}"
        print(f"[{i+1}] {ref['authors']}, \"{ref['title']},\" *{ref['journal']}*, {vol_issue}, pp. {ref['pages']}, {ref['month']} {ref['year']}.")

if __name__ == '__main__':
    main()
