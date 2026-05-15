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
        // CORS/권한 에러 발생 시 response.json()이 안될 수 있음
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
let routeChartInst = null;

const THEME_COLORS = [
    'rgba(59, 130, 246, 0.8)', // blue
    'rgba(16, 185, 129, 0.8)', // green
    'rgba(245, 158, 11, 0.8)', // yellow
    'rgba(239, 68, 68, 0.8)',  // red
    'rgba(139, 92, 246, 0.8)', // purple
    'rgba(236, 72, 153, 0.8)', // pink
];

// === Navigation ===
document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', (e) => {
        // Remove active class from all
        document.querySelectorAll('.nav-links li').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Add active class to clicked
        const target = e.currentTarget;
        target.classList.add('active');
        const viewId = target.getAttribute('data-target');
        document.getElementById(viewId).classList.add('active');

        // Render data if needed
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
    
    // 1. '-보상 접수 사유:' 에 적힌 텍스트를 우선 분석
    if (cleanReason) {
        for (const [category, keywords] of Object.entries(reasonKeywordMap)) {
            if (cleanReason === category.replace(/\s+/g)) return category;
            for (const keyword of keywords) {
                if (cleanReason.includes(keyword.replace(/\s+/g))) {
                    return category;
                }
            }
        }
    }
    
    // 2. 만약 사유에 정확한 키워드가 없으면, 전체 본문(상세 내용 등)에서 키워드 유추
    for (const [category, keywords] of Object.entries(reasonKeywordMap)) {
        for (const keyword of keywords) {
            if (fullText.includes(keyword)) {
                return category;
            }
        }
    }
    
    return "기타"; // 일치하는 것이 없으면 기본값
}

document.getElementById('parse-btn').addEventListener('click', () => {
    const raw = document.getElementById('raw-input').value;
    if(!raw.trim()) return alert("텍스트를 입력해주세요.");

    try {
        const parsed = parseText(raw);
        
        // 자동 카테고리 분류 로직 적용
        const matchedCategory = autoCategorizeReason(parsed.reason, raw);
        document.getElementById('reason-select').value = matchedCategory;
        parsed.reason = matchedCategory; // 표준 카테고리로 덮어쓰기
        
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
            // Next line has the value
            if(lines[i+1] && !lines[i+1].startsWith('-')) {
                const parts = lines[i+1].split('/');
                result.barcode = parts[0] ? parts[0].trim() : '';
                result.item = parts[1] ? parts[1].trim() : '';
            }
        }
        else if(line.startsWith('-고객 선안내 여부:')) result.preNotified = line.replace('-고객 선안내 여부:', '').trim();
        else if(line.startsWith('-보상 접수 경로 :') || line.startsWith('-보상 접수 경로:')) {
            if(lines[i+1] && !lines[i+1].startsWith('-')) {
                result.route = lines[i+1].trim();
            }
        }
        else if(line.startsWith('-접수자:')) result.receiver = line.replace('-접수자:', '').trim();
        else if(line.startsWith('-상세 내용:')) {
            // Read rest of the lines
            let details = [];
            for(let j=i+1; j<lines.length; j++) {
                details.push(lines[j]);
            }
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
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                }
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                appData.push(newData);
                alert("데이터가 성공적으로 저장되었습니다!");
                
                // Reset
                document.getElementById('raw-input').value = '';
                document.getElementById('parse-result').classList.add('hidden');
                currentParsedData = null;
                
                // Update Filter Options
                updateMonthFilters();
                
                // Switch to Dashboard
                document.querySelector('.nav-links li[data-target="dashboard-view"]').click();
            } else {
                alert("저장 실패: " + result.message);
            }
        } catch (err) {
            console.error(err);
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
    
    // Sort by latest
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

    // Delete handlers
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if(confirm("이 항목을 삭제하시겠습니까?")) {
                showLoading(true);
                try {
                    const response = await fetch(WEB_APP_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'delete', id: id }),
                        headers: {
                            'Content-Type': 'text/plain;charset=utf-8'
                        }
                    });
                    const result = await response.json();
                    
                    if (result.status === 'success') {
                        appData = appData.filter(d => String(d.id) !== String(id));
                        renderTable();
                        updateMonthFilters();
                        // 대시보드도 다시 렌더링되게 하려면: (현재 테이블 뷰에 있으므로 필터값 유지)
                    } else {
                        alert("삭제 실패: " + result.message);
                    }
                } catch (err) {
                    console.error(err);
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
    
    // Total
    document.getElementById('total-cases').innerText = filteredData.length + " 건";

    if(filteredData.length === 0) {
        document.getElementById('top-reason').innerText = "-";
        document.getElementById('top-item').innerText = "-";
        const insightBox = document.getElementById('monthly-insight-text');
        if (insightBox) insightBox.innerHTML = "해당 기간의 데이터가 없습니다.";
        if(reasonChartInst) reasonChartInst.destroy();
        if(itemChartInst) itemChartInst.destroy();
        if(routeChartInst) routeChartInst.destroy();
        return;
    }

    // Process Data
    const reasonsCount = countBy(filteredData, 'reason');
    const itemsCount = countBy(filteredData, 'item');
    const routeCount = countBy(filteredData, 'route');

    // Top Stats
    const topReason = getTop(reasonsCount);
    const topItem = getTop(itemsCount);
    document.getElementById('top-reason').innerText = topReason ? topReason.key : "-";
    document.getElementById('top-item').innerText = topItem ? topItem.key : "-";

    // Generate Monthly Insight
    const insightBox = document.getElementById('monthly-insight-text');
    if (insightBox) {
        insightBox.innerHTML = generateInsight(filteredData, reasonsCount, filteredData.length);
    }

    // Draw Charts
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    // Calculate percentages for labels
    const totalReasons = Object.values(reasonsCount).reduce((a, b) => a + b, 0);
    const reasonLabels = Object.keys(reasonsCount).map(key => {
        const count = reasonsCount[key];
        const percentage = ((count / totalReasons) * 100).toFixed(1);
        return `${key} (${percentage}%)`;
    });

    // 1. Reason Chart (Pie)
    const ctxReason = document.getElementById('reasonChart').getContext('2d');
    if(reasonChartInst) reasonChartInst.destroy();
    reasonChartInst = new Chart(ctxReason, {
        type: 'doughnut',
        data: {
            labels: reasonLabels,
            datasets: [{
                data: Object.values(reasonsCount),
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
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            // 툴팁에는 구체적인 건수를 표시 (범례에 이미 %가 있으므로)
                            label += context.parsed + '건';
                            return label;
                        }
                    }
                }
            }
        }
    });

    // 2. Item Chart (Bar)
    const ctxItem = document.getElementById('itemChart').getContext('2d');
    if(itemChartInst) itemChartInst.destroy();
    itemChartInst = new Chart(ctxItem, {
        type: 'bar',
        data: {
            labels: Object.keys(itemsCount),
            datasets: [{
                label: '건수',
                data: Object.values(itemsCount),
                backgroundColor: 'rgba(52, 211, 153, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 3. Route Chart (Bar)
    const ctxRoute = document.getElementById('routeChart').getContext('2d');
    if(routeChartInst) routeChartInst.destroy();
    routeChartInst = new Chart(ctxRoute, {
        type: 'bar',
        data: {
            labels: Object.keys(routeCount),
            datasets: [{
                label: '건수',
                data: Object.values(routeCount),
                backgroundColor: 'rgba(129, 140, 248, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// === Utilities ===
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

function generateInsight(filteredData, reasonsCount, totalCount) {
    const sortedReasons = Object.keys(reasonsCount).sort((a,b) => reasonsCount[b] - reasonsCount[a]);
    if (sortedReasons.length === 0) return "분석할 데이터가 없습니다.";
    
    const top1 = sortedReasons[0];
    const top1Pct = ((reasonsCount[top1] / totalCount) * 100).toFixed(1);
    
    let html = `이번 기간 동안 접수된 총 <strong>${totalCount}건</strong> 중, <strong style="color: #60a5fa; font-size: 1.05rem;">[${top1}]</strong> 이슈가 ${top1Pct}%로 가장 높은 비중을 차지했습니다. `;
    
    if (sortedReasons.length > 1) {
        const top2 = sortedReasons[1];
        const top2Pct = ((reasonsCount[top2] / totalCount) * 100).toFixed(1);
        html += `그 다음으로는 <strong>[${top2}]</strong>(${top2Pct}%)가 뒤를 이었습니다.<br><br>`;
    } else {
        html += `<br><br>`;
    }

    // 1위 사유의 상세 내용 키워드 분석
    const top1Data = filteredData.filter(d => d.reason === top1);
    const detailsText = top1Data.map(d => d.details || "").join(" ");
    
    const words = detailsText.split(/\s+/);
    const wordCounts = {};
    const stopWords = ['안심케어', '안내', '보상', '이관', '드립니다', '진행', '이관드립니다.', '확인', '요청', '불가로', '경우', '후', '등', '수거', '세탁', '최초', '담당부서', '인입되어', '보상이관드립니다.', '해당', '시', '부분', '인해', '발생', '대해', '되어'];
    
    words.forEach(w => {
        let cleanWord = w.replace(/[^가-힣a-zA-Z0-9]/g, '');
        if (cleanWord.length >= 2 && !stopWords.includes(cleanWord)) {
            wordCounts[cleanWord] = (wordCounts[cleanWord] || 0) + 1;
        }
    });
    
    const sortedWords = Object.keys(wordCounts).sort((a,b) => wordCounts[b] - wordCounts[a]).slice(0, 3);
    
    if (sortedWords.length > 0) {
        html += `특히 가장 많이 발생한 <strong>${top1}</strong>의 상세 내용을 분석해 본 결과, <b style="color: #f472b6;">'${sortedWords.join("', '")}'</b> 와(과) 관련된 사례가 빈번하게 언급되었습니다. <br><span style="color: #94a3b8; font-size: 0.85rem;">👉 현장 작업 시 해당 부분에 대한 각별한 주의와 사전 점검이 필요해 보입니다.</span>`;
    }

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

// Events for filters
document.getElementById('month-filter-dashboard').addEventListener('change', renderDashboard);
document.getElementById('month-filter-table').addEventListener('change', renderTable);

// === Excel Export ===
document.getElementById('export-excel-btn').addEventListener('click', () => {
    if(appData.length === 0) return alert("데이터가 없습니다.");
    
    const filter = document.getElementById('month-filter-table').value;
    const filteredData = filterDataByMonth(appData, filter);

    // Prepare data for Excel
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

    // Create a new workbook and add the worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "보상데이터");

    // Auto-adjust column widths (simple approach)
    const wscols = [
        {wch: 12}, // 등록일
        {wch: 15}, // 회원카드
        {wch: 25}, // 보상사유
        {wch: 15}, // 바코드
        {wch: 15}, // 품목
        {wch: 15}, // 선안내여부
        {wch: 25}, // 접수경로
        {wch: 20}, // 접수자
        {wch: 50}  // 상세내용
    ];
    worksheet['!cols'] = wscols;

    // Save the file
    XLSX.writeFile(workbook, `laundry_compensation_data_${filter}.xlsx`);
});

// === Clear All (제거됨 - 공용 DB이므로 개별 초기화 방지) ===

// === Initial Load ===
loadData();
