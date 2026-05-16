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
    
    // 선택한 기간에 따라 대시보드 대제목을 동적으로 변경
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
    const itemPercentages = sortedItems.map(item => ((item[1] / totalItems) *