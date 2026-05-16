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
        document.getElementById('reason-select').value = matchedCategory;
        parsed.reason = matchedCategory; 
        
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
    
    // 선택한 기간에 따라 대시보드 대제목을 동적으로 변경하는 로직
    const titleElement = document.querySelector('#dashboard-view .view-header h1');
    if (titleElement) {
        if (filter === 'all') {
            titleElement.innerText = "보상접수 월별 취합데이터";
        } else {
            const [year, month] = filter.split('-');
            titleElement.innerText = `보상접수 월별 취합데이터 (${year}년 ${month}월)`;
        }
    }
    
    document.getElementById('total-cases').innerText = filteredData.length + " 건";

    if(filteredData.length === 0) {
        document.getElementById('top-reason').innerText = "-";
        document.getElementById('top-item').innerText = "-";
        const insightBox = document.getElementById('monthly-insight-text');
        if (insightBox) insightBox.innerHTML = "해당 기간의 데이터가 없습니다.";
        if(reasonChartInst) reasonChartInst.destroy();
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
        // 개편된 지능형 텍스트 분석 결과 매칭
        insightBox.innerHTML = generateInsight(filteredData, reasonsCount, filteredData.length);
    }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    // Reason Chart
    const sortedReasons = Object.entries(reasonsCount).sort((a, b) => b[1] - a[1]);
    const totalReasons = sortedReasons.reduce((sum, item) => sum + item[1], 0);
    const reasonLabels = sortedReasons.map(([key, count]) => {
        const percentage = ((count / totalReasons) * 100).toFixed(1);
        return `${key} (${percentage}%)`;
    });
    const reasonData = sortedReasons.map(item => item[1]);

    const ctxReason = document.getElementById('reasonChart').getContext('2d');
    if(reasonChartInst) reasonChartInst.destroy();
    reasonChartInst = new Chart(ctxReason, {
        type: 'doughnut',
        data: {
            labels: reasonLabels,
            datasets: [{
                data: reasonData,
                backgroundColor: THEME_COLORS,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label.split(' (')[0] + ': ' + context.parsed + '건';
                        }
                    }
                }
            }
        }
    });

    // Item Chart
    const sortedItems = Object.entries(itemsCount).sort((a, b) => b[1] - a[1]);
    const totalItems = sortedItems.reduce((sum, item) => sum + item[1], 0);
    const itemLabels = sortedItems.map(item => item[0]);
    const itemCounts = sortedItems.map(item => item[1]);
    const itemPercentages = sortedItems.map(item => ((item[1] / totalItems) * 100).toFixed(1));

    const ctxItem = document.getElementById('itemChart').getContext('2d');
    if(itemChartInst) itemChartInst.destroy();
    itemChartInst = new Chart(ctxItem, {
        type: 'bar',
        data: {
            labels: itemLabels,
            datasets: [
                {
                    type: 'line',
                    label: '백분율(%)',
                    data: itemPercentages,
                    borderColor: 'rgba(245, 158, 11, 1)',
                    backgroundColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1'
                },
                {
                    type: 'bar',
                    label: '건수',
                    data: itemCounts,
                    backgroundColor: 'rgba(52, 211, 153, 0.8)',
                    borderRadius: 4,
                    yAxisID: 'y'
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
                },
                y1: {
                    type: 'linear', display: true, position: 'right', beginAtZero: true,
                    grid: { drawOnChartArea: false }, title: { display: true, text: '백분율 (%)' },
                    ticks: { callback: function(value) { return value + '%'; } }
                }
            },
            plugins: { legend: { display: true, position: 'top' } }
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

// 텍스트에서 노이즈 어구를 제거하고 알맹이 핵심 내용만 정제하는 인공지능 요약 엔진
function extractCoreIssue(details) {
    if (!details) return "상세 내용 없음";
    
    const lines = details.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let targetLine = "";
    
    // 1차 필터링: 구체적인 공정 이슈 내용이 본격적으로 나오는 라인 스캔
    for (let line of lines) {
        if (line.includes('내용 :') || line.includes('내용:')) continue;
        if (line.startsWith('-') && (line.includes('세탁') || line.includes('손상') || line.includes('얼룩') || line.includes('오염') || line.includes('찢') || line.includes('수선') || line.includes('분실') || line.includes('수축') || line.includes('물빠짐')) ) {
            targetLine = line;
            break;
        }
    }
    
    // 2차 필터링: 머리말 기호 및 불필요한 라인 제외 필터링
    if (!targetLine) {
        for (let line of lines) {
            let clean = line.replace('<군포>', '').replace('군포 /', '').replace(/^[-ㅁ*•\s]+/, '').trim();
            if (!clean || clean.includes('신청일') || clean.includes('바코드번호') || clean.includes('수량 :')) continue;
            if (clean.includes('손상') || clean.includes('분실') || clean.includes('찢') || clean.includes('오염') || clean.includes('얼룩') || clean.includes('이염') || clean.includes('수축') || clean.includes('오수선') || clean.includes('오매칭') || clean.includes('늘어남') || clean.includes('물빠짐') || clean.includes('우글')) {
                targetLine = clean;
                break;
            }
        }
    }
    
    // 3차 예외처리: 기본 첫 줄 추출
    if (!targetLine && lines.length > 0) {
        targetLine = lines[0].replace('<군포>', '').replace('군포 /', '');
    }
    
    // 최종 핵심 어구 템플릿 정리 (불필요한 서술형 어구 싹 다 도려내기)
    let core = targetLine.replace(/^[-ㅁ*•\s]+/, '').trim();
    core = core.replace(/으로 인해? 문의글 인입되어 안심케어 진행되었습니다\.?/, '')
               .replace(/으로 인입되어 안심케어 안내\.?/, '')
               .replace(/으로 인입된 안심케어 의류\.?/, '')
               .replace(/발생하여 복구 불가 및 고객 출고 미동의로 보상 접수 합니다\.?/, '')
               .replace(/발생으로 복구 불가한 부분으로 보상 접수 합니다\.?/, '')
               .replace(/확인되어 보상 접수 진행 합니다\.?/, '')
               .replace(/된 부분 확인 됩니다\.?/, '')
               .replace(/으로 확인되어 보상 접수 합니다\.?/, '')
               .replace(/으로 확인되어 부득이 보상 이관 드립니다\.?/, '')
               .replace(/원복 불가로 보상 이관 드립니다\.?/, '')
               .replace(/원복 불가로 보상이관드립니다\.?/, '')
               .replace(/되어 보상 접수 합니다\.?/, '')
               .replace(/되어 부득이 보상 이관 드립니다\.?/, '');
               
    return core.substring(0, 55).trim() || "상세 사유 확인";
}

// 팝업창 없이 대시보드 화면상에 표 형태로 즉시 취합 분석해주는 보고서 기능
function generateInsight(filteredData, reasonsCount, totalCount) {
    const sortedReasons = Object.keys(reasonsCount).sort((a,b) => reasonsCount[b] - reasonsCount[a]);
    if (sortedReasons.length === 0) return "분석할 데이터가 없습니다.";
    
    let html = `<div style="margin-bottom: 1.5rem; font-size: 1.05rem; color: #f8fafc;">이번 기간 동안 접수된 총 <strong>${totalCount}건</strong>의 보상 데이터를 분석하여 도출한 <strong>'공정별 보상 발생 핵심 원인 리스트'</strong>입니다. (그대로 인쇄 가능)</div>`;
    
    const topN = Math.min(3, sortedReasons.length);
    const colors = ['#f43f5e', '#f59e0b', '#3b82f6'];
    
    html += `<div style="display: flex; flex-direction: column; gap: 2rem;">`;

    for (let i = 0; i < topN; i++) {
        const reason = sortedReasons[i];
        const count = reasonsCount[reason];
        const pct = ((count / totalCount) * 100).toFixed(1);
        const color = colors[i] || '#94a3b8';
        
        html += `<div style="background: rgba(30, 41, 59, 0.4); padding: 1.5rem; border-radius: 8px; border-left: 4px solid ${color};">`;
        html += `   <h4 style="margin: 0 0 1rem 0; color: ${color}; font-size: 1.15rem; font-weight: 600;">[순위 ${i+1}위] ${reason} 사유 분석 <span style="font-size:0.9rem; color:#94a3b8; font-weight:normal;">(${count}건 접수 / 비율 ${pct}%)</span></h4>`;
        
        const reasonData = filteredData.filter(d => d.reason === reason);
        
        // 인쇄 시 가독성을 해치지 않는 깔끔한 다크 테마 일체형 테이블 동적 생성
        html += `<div style="overflow-x: auto; background: rgba(15, 23, 42, 0.4); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">`;
        html += `   <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">`;
        html += `       <thead>`;
        html += `           <tr style="border-bottom: 2px solid ${color}; background: rgba(255,255,255,0.02);">`;
        html += `               <th style="padding: 0.7rem 0.8rem; color: #94a3b8; font-weight: 500; width: 15%;">접수 날짜</th>`;
        html += `               <th style="padding: 0.7rem 0.8rem; color: #94a3b8; font-weight: 500; width: 15%;">품목 유형</th>`;
        html += `               <th style="padding: 0.7rem 0.8rem; color: #94a3b8; font-weight: 500; width: 22%;">의류 바코드</th>`;
        html += `               <th style="padding: 0.7rem 0.8rem; color: #e2e8f0; font-weight: 600; width: 48%;">AI 핵심 원인 요약 및 분석 결과</th>`;
        html += `           </tr>`;
        html += `       </thead>`;
        html += `       <tbody>`;
        
        reasonData.forEach(item => {
            const dateStr = new Date(item.date).toLocaleDateString();
            const coreIssue = extractCoreIssue(item.details);
            
            html += `       <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
            html += `           <td style="padding: 0.7rem 0.8rem; color: #94a3b8;">${dateStr}</td>`;
            html += `           <td style="padding: 0.7rem 0.8rem; color: #34d399; font-weight: 500;">${item.item || '-'}</td>`;
            html += `           <td style="padding: 0.7rem 0.8rem; color: #cbd5e1; font-family: monospace;">${item.barcode || '-'}</td>`;
            html += `           <td style="padding: 0.7rem 0.8rem; color: #f472b6; font-weight: 500;">📌 ${coreIssue}</td>`;
            html += `       </tr>`;
        });
        
        html += `       </tbody>`;
        html += `   </table>`;
        html += `</div>`; 
        html += `</div>`; 
    }
    
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