// === Data Management ===
// 구글 앱스 스크립트 웹앱 URL을 이곳에 넣으세요.
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxuRRHM30pCZQCCYOo_7UkNw8b5erZaUhoJ-_uy-NdiaeCAVs0CrHQ6rEgE8G8XDTaxAQ/exec"; 

let appData = [];
let currentParsedData = null;

// Local Storage Key
const LOCAL_STORAGE_KEY = 'laundrygo_care_data';

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
        if (!WEB_APP_URL) {
            const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
            appData = localData ? JSON.parse(localData) : [];
            updateMonthFilters();
            renderTable();
            renderDashboard();
            return;
        }

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
        alert("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
        showLoading(false);
    }
}

// Chart Instances
let causeChartInst = null;
let categoryChartInst = null;
let titleChartInst = null;

const THEME_COLORS = [
    'rgba(16, 185, 129, 0.8)', // emerald
    'rgba(59, 130, 246, 0.8)', // blue
    'rgba(245, 158, 11, 0.8)', // yellow
    'rgba(236, 72, 153, 0.8)', // pink
    'rgba(139, 92, 246, 0.8)', // purple
    'rgba(239, 68, 68, 0.8)',  // red
    'rgba(148, 163, 184, 0.8)' // gray
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

// === Root Cause Analyzer (핵심 원인 분석기) ===
function analyzeRootCause(title, subType, content) {
    // 분석의 정확도를 높이기 위해 관련 텍스트를 모두 합쳐서 검사합니다.
    const textToAnalyze = `${title || ''} ${subType || ''} ${content || ''}`.replace(/\s/g, '').toLowerCase();

    if (!textToAnalyze) return '기타';

    if (textToAnalyze.includes('오염') || textToAnalyze.includes('얼룩') || textToAnalyze.includes('찌든때') || textToAnalyze.includes('이염') || textToAnalyze.includes('지워지지')) {
        return '오염/얼룩/이염';
    }
    if (textToAnalyze.includes('보풀') || textToAnalyze.includes('먼지') || textToAnalyze.includes('털')) {
        return '보풀/먼지';
    }
    if (textToAnalyze.includes('냄새') || textToAnalyze.includes('악취') || textToAnalyze.includes('쉰내') || textToAnalyze.includes('향')) {
        return '냄새/건조불량';
    }
    if (textToAnalyze.includes('구김') || textToAnalyze.includes('주름') || textToAnalyze.includes('다림질') || textToAnalyze.includes('다려') || textToAnalyze.includes('프레스')) {
        return '구김/다림질';
    }
    if (textToAnalyze.includes('훼손') || textToAnalyze.includes('파손') || textToAnalyze.includes('찢') || textToAnalyze.includes('구멍') || textToAnalyze.includes('수축') || textToAnalyze.includes('늘어남') || textToAnalyze.includes('망가짐')) {
        return '훼손/파손/수축';
    }
    if (textToAnalyze.includes('분실') || textToAnalyze.includes('누락') || textToAnalyze.includes('오배송') || textToAnalyze.includes('안옴') || textToAnalyze.includes('없음')) {
        return '분실/누락/오배송';
    }
    if (textToAnalyze.includes('수선') || textToAnalyze.includes('떨어짐') || textToAnalyze.includes('단추')) {
        return '수선요청';
    }

    return '기타';
}

// === Parsers ===
function parseText(text) {
    const result = {
        date: new Date().toISOString(),
        ticket: '',
        title: '',
        factory: '',
        category: '',
        subType: '', // 원본 세부유형 유지
        rootCause: '', // AI가 분석한 핵심 원인 그룹
        memberCard: '',
        content: ''
    };

    const lines = text.split('\n').map(l => l.trim());
    
    for(let i=0; i<lines.length; i++) {
        const line = lines[i];
        
        if(line.startsWith('- 티켓:')) result.ticket = line.replace('- 티켓:', '').trim();
        else if(line.startsWith('- 제목:')) result.title = line.replace('- 제목:', '').trim();
        else if(line.startsWith('- 배송공장:')) result.factory = line.replace('- 배송공장:', '').trim();
        else if(line.startsWith('- 카테고리:')) result.category = line.replace('- 카테고리:', '').trim();
        else if(line.startsWith('- 세부유형:')) result.subType = line.replace('- 세부유형:', '').trim();
        else if(line.startsWith('- 회원카드번호:')) result.memberCard = line.replace('- 회원카드번호:', '').trim();
        else if(line.startsWith('- 내용:')) {
            let content = [line.replace('- 내용:', '').trim()];
            for(let j=i+1; j<lines.length; j++) {
                content.push(lines[j]);
            }
            result.content = content.join('\n').trim();
            break;
        }
    }
    
    if(!result.subType && result.title) result.subType = result.title;
    
    // 키워드 분석을 통해 핵심 원인(Root Cause) 도출
    result.rootCause = analyzeRootCause(result.title, result.subType, result.content);
    
    return result;
}

document.getElementById('parse-btn').addEventListener('click', () => {
    const raw = document.getElementById('raw-input').value;
    if(!raw.trim()) return alert("텍스트를 입력해주세요.");

    try {
        const parsed = parseText(raw);
        
        if(!parsed.title && !parsed.subType && !parsed.content) {
            alert("입력 양식을 정확히 인식할 수 없습니다. 양식을 확인해주세요.");
            return;
        }

        // 도출된 rootCause를 셀렉트 박스에 매칭
        const causeSelect = document.getElementById('cause-select');
        let matched = false;
        for (let i = 0; i < causeSelect.options.length; i++) {
            if (causeSelect.options[i].value === parsed.rootCause) {
                causeSelect.selectedIndex = i;
                matched = true;
                break;
            }
        }
        if (!matched && parsed.rootCause) {
            const newOption = new Option(parsed.rootCause, parsed.rootCause, true, true);
            causeSelect.add(newOption);
        }

        currentParsedData = parsed;
        showParsedResult(parsed);
    } catch (err) {
        console.error(err);
        alert("파싱 중 오류가 발생했습니다.");
    }
});

function showParsedResult(data) {
    const grid = document.getElementById('result-grid');
    grid.innerHTML = `
        <div class="result-item" style="grid-column: span 2; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
            <div class="label" style="color: #10b981;">💡 AI 분석 원인 그룹</div>
            <div class="val" style="font-weight: bold; color: #fff;">${data.rootCause}</div>
        </div>
        <div class="result-item"><div class="label">티켓 URL</div><div class="val" style="word-break: break-all; font-size:0.8rem;">${data.ticket ? `<a href="${data.ticket}" target="_blank" style="color:var(--accent-primary)">링크 열기</a>` : '-'}</div></div>
        <div class="result-item"><div class="label">회원카드번호</div><div class="val">${data.memberCard || '-'}</div></div>
        <div class="result-item"><div class="label">원문 제목</div><div class="val">${data.title || '-'}</div></div>
        <div class="result-item"><div class="label">배송공장</div><div class="val">${data.factory || '-'}</div></div>
        <div class="result-item"><div class="label">카테고리</div><div class="val">${data.category || '-'}</div></div>
        <div class="result-item"><div class="label">원문 세부유형</div><div class="val">${data.subType || '-'}</div></div>
        <div class="result-item" style="grid-column: span 2;"><div class="label">내용</div><div class="val" style="white-space: pre-wrap; font-size: 0.8rem; color: #94a3b8;">${data.content || '-'}</div></div>
    `;
    document.getElementById('parse-result').classList.remove('hidden');
}

// === Save Action ===
document.getElementById('confirm-save-btn').addEventListener('click', async () => {
    if(currentParsedData) {
        // 셀렉트박스에서 최종 확인/수정된 값을 저장
        currentParsedData.rootCause = document.getElementById('cause-select').value;
        
        const newData = { ...currentParsedData, id: Date.now().toString() };
        
        showLoading(true);
        try {
            if (!WEB_APP_URL) {
                appData.push(newData);
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
                postSaveSuccess();
                return;
            }

            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'add', data: newData }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                appData.push(newData);
                postSaveSuccess();
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

function postSaveSuccess() {
    alert("데이터가 성공적으로 저장되었습니다!");
    document.getElementById('raw-input').value = '';
    document.getElementById('parse-result').classList.add('hidden');
    currentParsedData = null;
    updateMonthFilters();
    document.querySelector('.nav-links li[data-target="dashboard-view"]').click();
}

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
        // rootCause가 없는 과거 데이터 처리 방어코드
        const displayCause = item.rootCause || item.subType || '-'; 

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${item.memberCard || '-'}</td>
            <td class="td-item">${item.category || '-'}</td>
            <td class="td-reason" style="color: #38bdf8; font-weight: 500;">${displayCause}</td>
            <td style="font-size: 0.9em; color:#cbd5e1;">${item.title || '-'}</td>
            <td>${item.factory || '-'}</td>
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
                    if (!WEB_APP_URL) {
                        appData = appData.filter(d => String(d.id) !== String(id));
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
                        renderTable();
                        updateMonthFilters();
                        showLoading(false);
                        return;
                    }

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
    
    document.getElementById('total-cases').innerText = filteredData.length + " 건";

    if(filteredData.length === 0) {
        document.getElementById('top-cause').innerText = "-";
        document.getElementById('top-category').innerText = "-";
        const insightBox = document.getElementById('monthly-insight-text');
        if (insightBox) insightBox.innerHTML = "해당 기간의 데이터가 없습니다.";
        if(causeChartInst) causeChartInst.destroy();
        if(categoryChartInst) categoryChartInst.destroy();
        if(titleChartInst) titleChartInst.destroy();
        return;
    }

    // 이제 subType이 아닌 rootCause(핵심 원인) 기준으로 통계를 냅니다.
    // (과거 데이터 호환을 위해 rootCause가 없으면 subType 사용)
    const causeCount = filteredData.reduce((acc, curr) => {
        let val = curr.rootCause || curr.subType || '기타';
        acc[val] = (acc[val] || 0) + 1;
        return acc;
    }, {});

    const categoryCount = countBy(filteredData, 'category');
    const titleCount = countBy(filteredData, 'title');

    const topCause = getTop(causeCount);
    const topCategory = getTop(categoryCount);
    document.getElementById('top-cause').innerText = topCause ? topCause.key : "-";
    document.getElementById('top-category').innerText = topCategory ? topCategory.key : "-";

    const insightBox = document.getElementById('monthly-insight-text');
    if (insightBox) {
        insightBox.innerHTML = generateInsight(filteredData, causeCount, filteredData.length);
    }

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    const totalCauses = Object.values(causeCount).reduce((a, b) => a + b, 0);
    const causeLabels = Object.keys(causeCount).map(key => {
        const count = causeCount[key];
        const percentage = ((count / totalCauses) * 100).toFixed(1);
        return `${key} (${percentage}%)`;
    });

    // 1. Cause Chart (Doughnut) - 발생 원인 기준
    const ctxCause = document.getElementById('causeChart').getContext('2d');
    if(causeChartInst) causeChartInst.destroy();
    causeChartInst = new Chart(ctxCause, {
        type: 'doughnut',
        data: {
            labels: causeLabels,
            datasets: [{
                data: Object.values(causeCount),
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
                            return context.label + ': ' + context.parsed + '건';
                        }
                    }
                }
            }
        }
    });

    // 2. Category Chart (Bar)
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    if(categoryChartInst) categoryChartInst.destroy();
    categoryChartInst = new Chart(ctxCategory, {
        type: 'bar',
        data: {
            labels: Object.keys(categoryCount).map(k => k.length > 10 ? k.substring(0, 10) + '...' : k),
            datasets: [{
                label: '건수',
                data: Object.values(categoryCount),
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

    // 3. Title Chart (Bar - Horizontal)
    let sortedTitles = Object.entries(titleCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topTitlesKeys = sortedTitles.map(t => t[0].length > 15 ? t[0].substring(0, 15) + '...' : t[0]);
    const topTitlesVals = sortedTitles.map(t => t[1]);

    const ctxTitle = document.getElementById('titleChart').getContext('2d');
    if(titleChartInst) titleChartInst.destroy();
    titleChartInst = new Chart(ctxTitle, {
        type: 'bar',
        data: {
            labels: topTitlesKeys,
            datasets: [{
                label: '건수',
                data: topTitlesVals,
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
        let val = curr[key] || '미분류';
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

function generateInsight(filteredData, causeCount, totalCount) {
    const sortedCauses = Object.keys(causeCount).sort((a,b) => causeCount[b] - causeCount[a]);
    if (sortedCauses.length === 0) return "분석할 데이터가 없습니다.";
    
    let html = `<div style="margin-bottom: 1rem;">이번 기간 동안 접수된 집중케어 <strong>${totalCount}건</strong>의 핵심 원인을 분석한 결과입니다.</div>`;
    
    const topN = Math.min(3, sortedCauses.length);
    const colors = ['#f43f5e', '#f59e0b', '#3b82f6']; 
    
    html += `<div style="display: flex; flex-direction: column; gap: 1.2rem;">`;

    for (let i = 0; i < topN; i++) {
        const cause = sortedCauses[i];
        const count = causeCount[cause];
        const pct = ((count / totalCount) * 100).toFixed(1);
        const color = colors[i] || '#94a3b8';
        
        html += `<div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 8px; border-left: 3px solid ${color};">`;
        html += `   <h4 style="margin: 0 0 0.5rem 0; color: ${color}; font-size: 1.05rem;">${i+1}위. ${cause} <span style="font-size:0.9rem; color:#94a3b8; font-weight:normal;">(${count}건 / ${pct}%)</span></h4>`;
        
        html += `<p style="margin: 0; font-size: 0.95rem; color: #cbd5e1; line-height: 1.5;">`;
        if (cause.includes('오염')) {
            html += `👉 <strong>조치 권고사항:</strong> 가장 높은 비중을 차지합니다. 세탁 전/후 검수 프로세스 강화 및 특정 오염원(예: 찌든때)에 대한 케어 레시피 점검이 필요합니다.`;
        } else if (cause.includes('보풀')) {
            html += `👉 <strong>조치 권고사항:</strong> 보풀/먼지 관련 접수가 잦습니다. 세탁망 사용 기준 확인 및 보풀 제거 공정의 퀄리티 체킹을 강화해 주세요.`;
        } else if (cause.includes('냄새')) {
            html += `👉 <strong>조치 권고사항:</strong> 건조 공정 시간이나 온도 세팅, 혹은 세제/유연제 배합비 확인이 필요할 수 있습니다.`;
        } else if (cause.includes('구김')) {
            html += `👉 <strong>조치 권고사항:</strong> 다림질 및 포장 공정에서의 작업자 교육 또는 프레스 장비 점검을 권장합니다.`;
        } else if (cause.includes('훼손')) {
            html += `👉 <strong>조치 권고사항:</strong> 고객 배상으로 이어질 수 있는 중요 항목입니다. 입고 시 사전 검수(기존 파손 여부) 기록을 철저히 해야 합니다.`;
        } else {
            html += `👉 <strong>추이 관찰:</strong> 해당 유형이 자주 접수되고 있으므로 세부 내용 확인 및 향후 데이터 변동을 모니터링해야 합니다.`;
        }
        html += `</p></div>`;
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
        "입력일": new Date(row.date).toLocaleDateString(),
        "회원카드번호": row.memberCard,
        "카테고리": row.category,
        "발생원인(그룹)": row.rootCause || row.subType, // 새롭게 추가된 항목
        "원문 세부유형": row.subType,
        "원문 제목": row.title,
        "배송공장": row.factory,
        "내용": row.content,
        "티켓URL": row.ticket
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "집중케어데이터");

    const wscols = [
        {wch: 12}, // 입력일
        {wch: 15}, // 회원카드
        {wch: 20}, // 카테고리
        {wch: 15}, // 발생원인
        {wch: 20}, // 원문 세부유형
        {wch: 30}, // 제목
        {wch: 15}, // 배송공장
        {wch: 50}, // 내용
        {wch: 50}  // 티켓 URL
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `laundry_intensive_care_${filter}.xlsx`);
});

// === Initial Load ===
loadData();