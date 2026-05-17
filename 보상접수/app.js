// === Data Management ===
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxwJd21AxK_1duyM6QCzoriO7YVwpz2llRhkclTyR91A5G3SsEOfrsRg8RJ7lc_sxFW/exec";
let appData = [];
let currentParsedData = null;

// Loading State
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

// Fetch Initial Data
async function loadData() {
    showLoading(true);
    try {
        const response = await fetch(WEB_APP_URL);
        const result = await response.json();
        if (result.status === 'success') {
            appData = result.data || [];
            updateMonthFilters();
            renderTable();
            renderDashboard();
        } else {
            console.error("데이터 로드 오류:", result);
            alert("데이터를 불러오는 중 오류가 발생했습니다.");
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        alert("네트워크 오류 발생. 구글 앱스 스크립트의 접근 권한이 '모든 사용자'로 되어있는지 확인해주세요.");
    } finally {
        showLoading(false);
    }
}

// Chart Instances
let reasonChartInst = null;
let itemChartInst = null;

const THEME_COLORS = [
    'rgba(59, 130, 246, 0.8)', // blue
    'rgba(16, 185, 129, 0.8)', // green
    'rgba(245, 158, 11, 0.8)', // yellow
    'rgba(239, 68, 68, 0.8)',  // red
    'rgba(139, 92, 246, 0.8)', // purple
    'rgba(236, 72, 153, 0.8)'  // pink
];

// === Navigation ===
document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-links li').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const target = e.currentTarget;
        target.classList.add('active');
        const viewId = target.getAttribute('data-target');
        document.getElementById(viewId).classList.add('active');

        if(viewId === 'dashboard-view') renderDashboard();
        if(viewId === 'table-view') renderTable();
    });
});

// === Parsers ===
const reasonKeywordMap = {
    "분실": ["분실", "오배송", "없어짐", "못찾", "불명", "미출고"],
    "원단 손상": ["원단 손상", "원단손상", "찢어짐", "구멍", "올나감", "스크래치", "올풀림", "까짐", "찢김", "녹음", "버블현상", "헤짐", "마모"],
    "부속품 손상": ["부속품 손상", "단추", "지퍼", "끈", "장식", "벨크로", "부자재", "탈락", "부속품탈락", "부속품 파손", "부속품손상", "플라스틱"],
    "파손": ["파손", "깨짐", "부러짐", "박살"],
    "이염": ["이염", "물듦", "색빠짐", "변색", "탈색", "오염", "얼룩", "물빠짐", "색올림"],
    "수선미흡": ["수선미흡", "수선", "오매칭", "오수선", "수선오류", "기장"],
    "수축": ["수축", "줄어듦", "늘어남", "변형", "사이즈"],
    "오배송": ["오배송", "타고객", "타 고객", "바코드 오부착", "바코드오부착"],
    "기타": ["기타"]
};

function autoCategorizeReason(parsedReason, fullText) {
    if (!parsedReason) parsedReason = "";
    const cleanReason = parsedReason.replace(/\s+/g, '');
    
    if (cleanReason) {
        for (const [category, keywords] of Object.entries(reasonKeywordMap)) {
            if (cleanReason === category.replace(/\s+/g, '')) return category;
            for (const keyword of keywords) {
                if (cleanReason.includes(keyword.replace(/\s+/g, ''))) return category;
            }
        }
    }
    
    for (const [category, keywords] of Object.entries(reasonKeywordMap)) {
        for (const keyword of keywords) {
            if (fullText.includes(keyword)) return category;
        }
    }
    return "기타";
}

document.getElementById('parse-btn').addEventListener('click', () => {
    const raw = document.getElementById('raw-input').value;
    if(!raw.trim()) return alert("텍스트를 입력해주세요.");

    try {
        const parsed = parseText(raw);
        const matchedCategory = autoCategorizeReason(parsed.reason, raw);
        parsed.reason = matchedCategory; 
        
        const selectedDate = document.getElementById('date-input').value;
        if(selectedDate) {
            parsed.date = new Date(selectedDate).toISOString();
        }
        
        if(!parsed.item) {
            alert("입력 양식을 정확히 인식할 수 없습니다. 양식을 확인해주세요.");
            return;
        }
        currentParsedData = parsed;
        showParsedResult(parsed);
    } catch (err) {
        console.error(err);
        alert("파싱 중 오류가 발생했습니다.");
    }
});

function parseText(text) {
    const result = {
        date: new Date().toISOString(),
        memberCard: '',
        reason: '',
        barcode: '',
        item: '',
        preNotified: '',
        route: '',
        receiver: '',
        details: ''
    };

    const lines = text.split('\n').map(l => l.trim());
    for(let i=0; i<lines.length; i++) {
        const line = lines[i];
        if(line.startsWith('-회원카드:')) result.memberCard = line.replace('-회원카드:', '').trim();
        else if(line.startsWith('-보상 접수 사유:')) result.reason = line.replace('-보상 접수 사유:', '').trim();
        else if(line.startsWith('-최초 수거일 바코드 및 품목명:')) {
            if(lines[i+1] && !lines[i+1].startsWith('-')) {
                const parts = lines[i+1].split('/');
                result.barcode = parts[0] ? parts[0].trim() : '';
                result.item = parts[1] ? parts[1].trim() : '';
            }
        }
        else if(line.startsWith('-고객 선안내 여부:')) result.preNotified = line.replace('-고객 선안내 여부:', '').trim();
        else if(line.startsWith('-보상 접수 경로 :') || line.startsWith('-보상 접수 경로:')) {
            if(lines[i+1] && !lines[i+1].startsWith('-')) result.route = lines[i+1].trim();
        }
        else if(line.startsWith('-접수자:')) result.receiver = line.replace('-접수자:', '').trim();
        else if(line.startsWith('-상세 내용:')) {
            let details = [];
            for(let j=i+1; j<lines.length; j++) details.push(lines[j]);
            result.details = details.join('\n').trim();
            break;
        }
    }
    return result;
}

function showParsedResult(data) {
    const grid = document.getElementById('result-grid');
    grid.innerHTML = `
        <div class="result-item"><div class="label">회원카드</div><div class="val">${data.memberCard || '-'}</div></div>
        <div class="result-item"><div class="label">보상 접수 사유</div><div class="val">${data.reason || '-'}</div></div>
        <div class="result-item"><div class="label">품목명</div><div class="val">${data.item || '-'}</div></div>
        <div class="result-item"><div class="label">보상 접수 경로</div><div class="val">${data.route || '-'}</div></div>
        <div class="result-item"><div class="label">접수자</div><div class="val">${data.receiver || '-'}</div></div>
        <div class="result-item"><div class="label">상세 내용</div><div class="val" style="white-space: pre-wrap; font-size: 0.8rem; color: #94a3b8;">${data.details || '-'}</div></div>
    `;
    document.getElementById('parse-result').classList.remove('hidden');
}

// === Save Action ===
document.getElementById('confirm-save-btn').addEventListener('click', async () => {
    if(currentParsedData) {
        const newData = { ...currentParsedData, id: Date.now().toString() };
        showLoading(true);
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'add', data: newData }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                appData.push(newData);
                alert("데이터가 성공적으로 저장되었습니다!");
                document.getElementById('raw-input').value = '';
                document.getElementById('parse-result').classList.add('hidden');
                currentParsedData = null;
                updateMonthFilters();
                document.querySelector('.nav-links li[data-target="dashboard-view"]').click();
            } else {
                alert("저장 실패: " + result.message);
            }
        } catch (err) {
            alert("저장 중 네트워크 오류가 발생했습니다.");
        } finally {
            showLoading(false);
        }
    }
});

document.getElementById('cancel-save-btn').addEventListener('click', () => {
    document.getElementById('parse-result').classList.add('hidden');
    currentParsedData = null;
});

// === Render Data Table ===
function renderTable() {
    const tbody = document.getElementById('table-body');
    const filter = document.getElementById('month-filter-table').value;
    tbody.innerHTML = '';
    
    let filteredData = filterDataByMonth(appData, filter);
    filteredData.sort((a,b) => b.id - a.id);

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        const dateStr = new Date(item.date).toLocaleDateString();
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${item.barcode}</td>
            <td class="td-reason">${item.reason}</td>
            <td class="td-item">${item.item}</td>
            <td>${item.route}</td>
            <td>${item.receiver}</td>
            <td><button class="danger-btn btn-delete" data-id="${item.id}">삭제</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if(confirm("이 항목을 삭제하시겠습니까?")) {
                showLoading(true);
                try {
                    const response = await fetch(WEB_APP_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'delete', id: id }),
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                    });
                    const result = await response.json();
                    
                    if (result.status === 'success') {
                        appData = appData.filter(d => String(d.id) !== String(id));
                        renderTable();
                        updateMonthFilters();
                    } else {
                        alert("삭제 실패: " + result.message);
                    }
                } catch (err) {
                    alert("삭제 중 네트워크 오류가 발생했습니다.");
                } finally {
                    showLoading(false);
                }
            }
        });
    });
}

// === Render Dashboard ===
function renderDashboard() {
    const filter = document.getElementById('month-filter-dashboard').value;
    const filteredData = filterDataByMonth(appData, filter);
    
    const titleElement = document.querySelector('#dashboard-view .view-header h1');
    if (titleElement) {
        if (filter === 'all') {
            titleElement.innerText = "보상접수 데이터 월별 취합";
        } else {
            const [year, month] = filter.split('-');
            titleElement.innerText = `보상접수 데이터 월별 취합 (${year}년 ${month}월)`;
        }
    }
    
    document.getElementById('total-cases').innerText = filteredData.length + " 건";

    if(filteredData.length === 0) {
        document.getElementById('top-reason').innerText = "-";
        document.getElementById('top-item').innerText = "-";
        const insightBox = document.getElementById('monthly-insight-text');
        if (insightBox) insightBox.innerHTML = "해당 기간의 데이터가 없습니다.";
        if(itemChartInst) itemChartInst.destroy();
        return;
    }

    const reasonsCount = countBy(filteredData, 'reason');
    const itemsCount = countBy(filteredData, 'item');

    const topReason = getTop(reasonsCount);
    const topItem = getTop(itemsCount);
    document.getElementById('top-reason').innerText = topReason ? topReason.key : "-";
    document.getElementById('top-item').innerText = topItem ? topItem.key : "-";

    const insightBox = document.getElementById('monthly-insight-text');
    if (insightBox) {
        insightBox.innerHTML = generateInsight(filteredData, reasonsCount, filteredData.length);
    }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    const sortedItems = Object.entries(itemsCount).sort((a, b) => b[1] - a[1]);
    const itemLabels = sortedItems.map(item => item[0]);
    const itemCounts = sortedItems.map(item => item[1]);

    const ctxItem = document.getElementById('itemChart').getContext('2d');
    if(itemChartInst) itemChartInst.destroy();
    itemChartInst = new Chart(ctxItem, {
        type: 'bar',
        data: {
            labels: itemLabels,
            datasets: [
                {
                    type: 'bar',
                    label: '건수',
                    data: itemCounts,
                    backgroundColor: 'rgba(52, 211, 153, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    grid: { display: false },
                    ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 }
                },
                y: { 
                    type: 'linear', display: true, position: 'left', beginAtZero: true, 
                    grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '건수' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// === Insight Utilities ===
function countBy(arr, key) {
    return arr.reduce((acc, curr) => {
        let val = curr[key] || '기타';
        acc[val] = (acc[val] || 0) + 1;
        return acc;
    }, {});
}

function getTop(countObj) {
    let topKey = null;
    let topVal = 0;
    for(let k in countObj) {
        if(countObj[k] > topVal) {
            topVal = countObj[k];
            topKey = k;
        }
    }
    return topKey ? { key: topKey, val: topVal } : null;
}

// ✨ 수정: 일반적인 "세탁 후 손상" 그룹을 하나로 묶기 위한 패턴 추가
const patternDict = {
    "원단 손상": {
        "세탁 공정 중 발생한 원단 손상 (일반)": ["세탁 후 손상", "세탁후 손상", "세탁 과정 손상", "세탁 중 손상", "세탁손상"],
        "벨크로(찍찍이) 마찰 손상": ["벨크로", "찍찍이"],
        "세탁기/기계 내부 끼임 및 빨려들어감": ["기계", "부속품 이탈", "부속품이 빠진", "세탁기 안", "세탁기 내부", "빨려", "기기 내부"],
        "고온 건조/다림질로 인한 원단 녹음 및 변형": ["고온 건조", "고온건조", "녹음", "버블현상", "고온 다림질", "다려"],
        "원단 찢김 및 구멍 발생": ["찢김", "찢어짐", "구멍", "올나감", "올풀림", "까짐", "스크래치", "해짐"],
        "로고/프린팅 손상 및 벗겨짐": ["프린팅", "로고", "라벨", "탭 파손", "벗겨짐"]
    },
    "분실": {
        "오배송 및 타 고객 세탁물 혼입": ["오배송", "타 고객", "타고객", "다른 고객", "오인", "뒤바뀌어"],
        "바코드 오부착 및 전산 등록 누락": ["바코드", "오부착", "미등록", "등록 누락", "등록누락", "불명", "이력 확인되지 않아"],
        "부속품(끈/단추 등) 분실": ["부속품 분실", "끈 분실", "단추 분실", "미확보"]
    },
    "수선미흡": {
        "수선 오매칭 및 오수선": ["오매칭", "오수선", "수선 오류", "수선오류", "잘못 수선"],
        "기장/길이 조절 미흡": ["기장", "길이", "짧아", "차이나"]
    },
    "이염": {
        "세탁 공정 중 타 의류/세탁기 이염": ["세탁기 안", "세탁기 문제", "세탁기 내부", "오염 발생"],
        "의류 자체 탈색 및 물빠짐/색빠짐": ["탈색", "색올림 케어 불가", "색 빠짐", "색빠짐", "물빠짐", "변색"]
    },
    "부속품 손상": {
        "단추/지퍼/부속품 파손": ["단추", "지퍼", "끈", "탈락", "파손"],
        "내부 플라스틱 및 앞코 변형": ["플라스틱", "앞코", "변형"]
    },
    "수축": {
        "고온/공정으로 인한 의류 사이즈 수축": ["수축", "줄어듦", "사이즈"],
        "의류 늘어남 및 원단 변형": ["늘어남", "변형", "우글", "흐물거림"]
    },
    "오배송": {
        "타 고객 세탁물 오패킹 및 뒤바뀜": ["오배송", "오패킹", "타인", "뒤바뀌어", "오부착"]
    },
    "기타": {
        "안심케어/재케어 진행 후 최종 복구 불가": ["복구 불가", "원복 불가", "케어 불가", "원상복구 되지 않고"],
        "배송 지연 및 서비스 불만족": ["배송지연", "배송 지연", "불만", "시간 지체"]
    }
};

// ✨ 수정: 뒤에 붙는 "안심케어건 입니다", "발견" 등의 꼬리말을 강력하게 삭제
function extractCoreIssue(details) {
    if (!details) return "상세 내용 없음";
    const lines = details.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let targetLine = "";
    for (let line of lines) {
        if (line.includes('내용 :') || line.includes('내용:')) continue;
        if (line.startsWith('-') && (line.includes('세탁') || line.includes('손상') || line.includes('얼룩') || line.includes('오염') || line.includes('찢') || line.includes('수선') || line.includes('분실') || line.includes('수축') || line.includes('물빠짐')) ) {
            targetLine = line; break;
        }
    }
    if (!targetLine) {
        for (let line of lines) {
            let clean = line.replace('<군포>', '').replace('군포 /', '').replace(/^[-ㅁ*•\s]+/, '').trim();
            if (!clean || clean.includes('신청일') || clean.includes('바코드번호') || clean.includes('수량 :')) continue;
            if (clean.includes('손상') || clean.includes('분실') || clean.includes('찢') || clean.includes('오염') || clean.includes('얼룩') || clean.includes('이염') || clean.includes('수축') || clean.includes('오수선') || clean.includes('오매칭') || clean.includes('늘어남') || clean.includes('물빠짐') || clean.includes('우글')) {
                targetLine = clean; break;
            }
        }
    }
    if (!targetLine && lines.length > 0) targetLine = lines[0].replace('<군포>', '').replace('군포 /', '');
    
    let core = targetLine.replace(/^[-ㅁ*•\s]+/, '').trim();
    
    // 불필요한 단어 싹둑
    core = core.replace(/해당 세탁물 /g, '')
               .replace(/으로 안심케어건 입니다\.?/g, '')
               .replace(/안심케어건 입니다\.?/g, '')
               .replace(/발견/g, '')
               .replace(/으로 인해? 문의글 인입되어 안심케어 진행되었습니다\.?/g, '')
               .replace(/으로 인입되어 안심케어 안내\.?/g, '')
               .replace(/으로 인입된 안심케어 의류\.?/g, '')
               .replace(/발생하여 복구 불가 및 고객 출고 미동의로 보상 접수 합니다\.?/g, '')
               .replace(/발생으로 복구 불가한 부분으로 보상 접수 합니다\.?/g, '')
               .replace(/확인되어 보상 접수 진행 합니다\.?/g, '')
               .replace(/된 부분 확인 됩니다\.?/g, '')
               .replace(/으로 확인되어 보상 접수 합니다\.?/g, '')
               .replace(/으로 확인되어 부득이 보상 이관 드립니다\.?/g, '')
               .replace(/원복 불가로 보상 이관 드립니다\.?/g, '')
               .replace(/원복 불가로 보상이관드립니다\.?/g, '')
               .replace(/되어 보상 접수 합니다\.?/g, '')
               .replace(/되어 부득이 보상 이관 드립니다\.?/g, '')
               .replace(/으로 보상 접수 합니다\.?/g, '');
               
    return core.substring(0, 55).trim() || "상세 사유 확인";
}

function generateInsight(filteredData, reasonsCount, totalCount) {
    const sortedReasons = Object.keys(reasonsCount).sort((a,b) => reasonsCount[b] - reasonsCount[a]);
    if (sortedReasons.length === 0) return "분석할 데이터가 없습니다.";
    
    let html = `<div style="margin-bottom: 2rem; font-size: 1.05rem; color: #f8fafc;">이번 기간 접수된 <strong>총 ${totalCount}건</strong>의 데이터를 분석한 <strong>'종합 운영 인사이트 및 상세 요약'</strong>입니다. (보고서 인쇄 최적화)</div>`;
    
    const topN = Math.min(3, sortedReasons.length);
    const colors = ['#f43f5e', '#f59e0b', '#3b82f6'];

    // ==========================================
    // [단락 1] 주요 원인 분석 및 조치 권고사항
    // ==========================================
    html += `<div style="background: rgba(30, 41, 59, 0.4); padding: 1.5rem; border-radius: 8px; border-left: 4px solid #8b5cf6; margin-bottom: 2rem;">`;
    html += `   <h3 style="margin: 0 0 1.2rem 0; color: #a78bfa; font-size: 1.2rem; font-weight: 600;">💡 주요 원인 분석 및 조치 권고사항</h3>`;
    html += `   <div style="display: flex; flex-direction: column; gap: 1rem;">`;

    for (let i = 0; i < topN; i++) {
        const reason = sortedReasons[i];
        const count = reasonsCount[reason];
        const pct = ((count / totalCount) * 100).toFixed(1);
        const color = colors[i] || '#94a3b8';

        const reasonData = filteredData.filter(d => d.reason === reason);
        let patternCountsText = {};
        let patternsDefinedText = patternDict[reason] || {};

        reasonData.forEach(item => {
            for (const [patternName, keywords] of Object.entries(patternsDefinedText)) {
                if (keywords.some(kw => item.details && item.details.includes(kw))) {
                    patternCountsText[patternName] = (patternCountsText[patternName] || 0) + 1;
                }
            }
        });

        const overlappingPatterns = Object.entries(patternCountsText).sort((a, b) => b[1] - a[1]);

        let advice = "";
        if (reason.includes('이염') || reason.includes('오염')) {
            advice = "세탁 전/후 검수 프로세스 강화 및 특정 오염원에 대한 케어 레시피 점검이 필요합니다.";
        } else if (reason.includes('원단 손상') || reason.includes('파손')) {
            advice = "고객 배상으로 직결되는 중요 항목입니다. 세탁망 사용 기준 확인 및 기계 내부/고온 건조 공정의 퀄리티 체킹을 강화해 주세요.";
        } else if (reason.includes('수축')) {
            advice = "의류 변형 관련 불만이 지속적으로 발생합니다. 건조 공정 시간이나 온도 세팅, 세탁 라벨 확인 프로세스 점검이 필요합니다.";
        } else if (reason.includes('분실') || reason.includes('오배송')) {
            advice = "치명적인 서비스 오류입니다. 입출고 바코드 스캔, 패킹 프로세스 점검 및 작업자 교육이 시급합니다.";
        } else if (reason.includes('수선미흡')) {
            advice = "수선 오매칭 또는 기장 조절 오류가 발생하고 있습니다. 수선 공정 작업자 재교육 및 오더 재확인 절차를 권장합니다.";
        } else if (reason.includes('부속품 손상')) {
            advice = "세탁 전 부속품(단추/지퍼 등) 상태 사전 확인 및 보호 덮개/세탁망 사용 등의 선제적 조치가 필요합니다.";
        } else {
            advice = "해당 유형이 지속적으로 접수되고 있으므로 세부 내용 확인 및 향후 데이터 변동 추이를 주의 깊게 모니터링해야 합니다.";
        }

        html += `       <div style="padding-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.05);">`;
        html += `           <div style="color: ${color}; font-weight: 600; margin-bottom: 0.6rem; font-size: 1.05rem;">[${i+1}위] ${reason} <span style="font-size:0.9rem; font-weight:normal; color:#94a3b8;">(${count}건 / ${pct}%)</span></div>`;
        
        if (overlappingPatterns.length > 0) {
            const patternStrings = overlappingPatterns.map(p => `<strong style="color:#f472b6;">'${p[0]}' (${p[1]}건)</strong>`);
            html += `           <div style="color: #e2e8f0; font-size: 0.95rem; line-height: 1.5; margin-bottom: 0.4rem;">🔍 <strong>주요 중복 패턴:</strong> ${patternStrings.join(", ")} 등이 집중적으로 확인되었습니다.</div>`;
        }

        html += `           <div style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.5;">💡 <strong>운영 조치 권고사항:</strong> ${advice}</div>`;
        html += `       </div>`;
    }
    html += `   </div>`;
    html += `</div>`;


    // ==========================================
    // [단락 2] 세부 발생 원인 및 품목 집계
    // ==========================================
    html += `<div style="background: rgba(30, 41, 59, 0.4); padding: 1.5rem; border-radius: 8px; border-left: 4px solid #10b981;">`;
    html += `   <h3 style="margin: 0 0 1.2rem 0; color: #34d399; font-size: 1.2rem; font-weight: 600;">📑 세부 발생 원인 및 품목 집계</h3>`;
    html += `   <div style="display: flex; flex-direction: column; gap: 1.5rem;">`;

    for (let i = 0; i < topN; i++) {
        const reason = sortedReasons[i];
        const color = colors[i] || '#94a3b8';
        const reasonData = filteredData.filter(d => d.reason === reason);

        let groupedIssues = {};
        let patternsDefined = patternDict[reason] || {};

        reasonData.forEach(item => {
            let matchedPattern = null;
            for (const [patternName, keywords] of Object.entries(patternsDefined)) {
                if (keywords.some(kw => item.details.includes(kw))) {
                    matchedPattern = patternName;
                    break;
                }
            }
            let groupKey = matchedPattern || extractCoreIssue(item.details);

            if (!groupedIssues[groupKey]) {
                groupedIssues[groupKey] = { total: 0, items: {} };
            }
            groupedIssues[groupKey].total += 1;
            let itemName = item.item || '품목 미기재';
            groupedIssues[groupKey].items[itemName] = (groupedIssues[groupKey].items[itemName] || 0) + 1;
        });

        const sortedGroups = Object.entries(groupedIssues).sort((a, b) => b[1].total - a[1].total);

        html += `       <div style="background: rgba(15, 23, 42, 0.5); padding: 1.2rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">`;
        html += `           <div style="font-weight: 600; color: ${color}; margin-bottom: 0.8rem; font-size: 1rem;">[${i+1}위] ${reason}</div>`;
        html += `           <ul style="list-style: none; padding: 0; margin: 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.8;">`;

        sortedGroups.forEach(([groupName, data]) => {
            let itemStrings = [];
            const sortedItems = Object.entries(data.items).sort((a,b) => b[1] - a[1]);
            sortedItems.forEach(([itemName, itemCount]) => {
                itemStrings.push(`${itemName} ${itemCount}건`);
            });
            let itemSummary = itemStrings.join(', ');

            html += `               <li style="margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.02);">`;
            html += `                   <span style="color: #f8fafc; font-weight: 500;">📌 ${groupName}</span> `;
            html += `                   <span style="color: #94a3b8;">(${itemSummary})</span>`;
            html += `               </li>`;
        });

        html += `           </ul>`;
        html += `       </div>`;
    }

    html += `   </div>`;
    html += `</div>`;

    return html;
}

// === Filters ===
function updateMonthFilters() {
    const months = new Set();
    appData.forEach(item => {
        if(item.date) {
            const d = new Date(item.date);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
            months.add(monthStr);
        }
    });
    
    // 2024년 4월부터 현재 달력상 날짜까지 빈 월도 포함
    const startYear = 2024;
    const startMonth = 4;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (let y = startYear; y <= currentYear; y++) {
        let mStart = (y === startYear) ? startMonth : 1;
        let mEnd = (y === currentYear) ? currentMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
            const monthStr = `${y}-${String(m).padStart(2, '0')}`;
            months.add(monthStr);
        }
    }

    const sortedMonths = Array.from(months).sort().reverse();
    const fTable = document.getElementById('month-filter-table');
    const fDash = document.getElementById('month-filter-dashboard');
    const currTableVal = fTable.value;
    const currDashVal = fDash.value;

    const buildOptions = () => {
        let html = '<option value="all">전체 기간</option>';
        sortedMonths.forEach(m => html += `<option value="${m}">${m}</option>`);
        return html;
    };

    fTable.innerHTML = buildOptions();
    fDash.innerHTML = buildOptions();
    if(sortedMonths.includes(currTableVal)) fTable.value = currTableVal;
    if(sortedMonths.includes(currDashVal)) fDash.value = currDashVal;
}

function filterDataByMonth(data, monthStr) {
    if(monthStr === 'all') return data;
    return data.filter(item => {
        if(!item.date) return false;
        const d = new Date(item.date);
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
        return m === monthStr;
    });
}

document.getElementById('month-filter-dashboard').addEventListener('change', renderDashboard);
document.getElementById('month-filter-table').addEventListener('change', renderTable);

// === Excel Export ===
document.getElementById('export-excel-btn').addEventListener('click', () => {
    if(appData.length === 0) return alert("데이터가 없습니다.");
    const filter = document.getElementById('month-filter-table').value;
    const filteredData = filterDataByMonth(appData, filter);

    const excelData = filteredData.map(row => ({
        "등록일": new Date(row.date).toLocaleDateString(),
        "회원카드": row.memberCard,
        "보상사유": row.reason,
        "바코드": row.barcode,
        "품목": row.item,
        "선안내여부": row.preNotified,
        "접수경로": row.route,
        "접수자": row.receiver,
        "상세내용": row.details
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "보상데이터");

    const wscols = [{wch: 12}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 20}, {wch: 50}];
    worksheet['!cols'] = wscols;
    XLSX.writeFile(workbook, `laundry_compensation_data_${filter}.xlsx`);
});

// === Initial Load ===
loadData();