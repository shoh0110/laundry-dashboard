import json

# Keyword map
reasonKeywordMap = {
    "분실": ["분실", "오배송", "없어짐", "못찾", "불명", "미출고"],
    "원단 손상": ["원단 손상", "원단손상", "찢어짐", "구멍", "올나감", "스크래치", "올풀림", "까짐", "찢김", "녹음", "버블현상", "헤짐", "마모"],
    "부속품 손상": ["부속품 손상", "단추", "지퍼", "끈", "장식", "벨크로", "부자재", "탈락", "부속품탈락", "부속품 파손", "부속품손상", "플라스틱"],
    "파손": ["파손", "깨짐", "부러짐", "박살"],
    "이염": ["이염", "물듦", "색빠짐", "변색", "탈색", "오염", "얼룩", "물빠짐", "색올림"],
    "수선미흡": ["수선미흡", "수선", "오매칭", "오수선", "수선오류", "기장"],
    "수축": ["수축", "줄어듦", "늘어남", "변형", "사이즈"],
    "오배송": ["오배송", "타고객", "타 고객", "바코드 오부착", "바코드오부착"],
    "기타": ["기타"]
}

def autoCategorizeReason(parsedReason, fullText):
    if not parsedReason: parsedReason = ""
    cleanReason = parsedReason.replace(" ", "")
    
    if cleanReason:
        for category, keywords in reasonKeywordMap.items():
            if cleanReason == category.replace(" ", ""): return category
            for keyword in keywords:
                if keyword.replace(" ", "") in cleanReason:
                    return category

    for category, keywords in reasonKeywordMap.items():
        for keyword in keywords:
            if keyword in fullText:
                return category
    
    return "기타"

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

changed_count = 0
for item in data['data']:
    old_reason = item['reason']
    details = item.get('details', '')
    route = item.get('route', '')
    
    # We simulate what would happen if we used 'details' as the full text to guess, 
    # and maybe 'old_reason' as the parsedReason
    new_reason = autoCategorizeReason(old_reason, old_reason + "\n" + details)
    
    if old_reason != new_reason and new_reason != "기타":
        changed_count += 1
        print(f"ID: {item['id']} | 변경: [{old_reason}] -> [{new_reason}] | 텍스트 요약: {details[:30]}...")

print(f"\n총 {len(data['data'])}건 중 {changed_count}건의 카테고리가 변경될 것으로 예상됩니다.")
