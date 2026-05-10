// === Data Management ===
if (!localStorage.getItem('data_cleared_once')) {
    localStorage.removeItem('laundryData');
    localStorage.setItem('data_cleared_once', 'true');
}
let appData = JSON.parse(localStorage.getItem('laundryData')) || [];
let currentParsedData = null;

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
document.getElementById('parse-btn').addEventListener('click', () => {
    const raw = document.getElementById('raw-input').value;
    if(!raw.trim()) return alert("텍스트를 입력해주세요.");

    try {
        const parsed = parseText(raw);
        parsed.reason = document.getElementById('reason-select').value;
        
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
document.getElementById('confirm-save-btn').addEventListener('click', () => {
    if(currentParsedData) {
        appData.push({ ...currentParsedData, id: Date.now() });
        localStorage.setItem('laundryData', JSON.stringify(appData));
        alert("데이터가 성공적으로 저장되었습니다!");
        
        // Reset
        document.getElementById('raw-input').value = '';
        document.getElementById('parse-result').classList.add('hidden');
        currentParsedData = null;
        
        // Update Filter Options
        updateMonthFilters();
        
        // Switch to Dashboard
        document.querySelector('.nav-links li[data-target="dashboard-view"]').click();
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
            <td>${item.memberCard}</td>
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
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            if(confirm("이 항목을 삭제하시겠습니까?")) {
                appData = appData.filter(d => d.id !== id);
                localStorage.setItem('laundryData', JSON.stringify(appData));
                renderTable();
                updateMonthFilters();
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

    // Draw Charts
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    // 1. Reason Chart (Pie)
    const ctxReason = document.getElementById('reasonChart').getContext('2d');
    if(reasonChartInst) reasonChartInst.destroy();
    reasonChartInst = new Chart(ctxReason, {
        type: 'doughnut',
        data: {
            labels: Object.keys(reasonsCount),
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
                            let total = context.dataset.data.reduce((a, b) => a + b, 0);
                            let value = context.parsed;
                            let percentage = ((value / total) * 100).toFixed(1) + '%';
                            return label + percentage;
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

// === Clear All ===
document.getElementById('clear-data-btn').addEventListener('click', () => {
    if(confirm("정말로 모든 데이터를 초기화하시겠습니까? (복구할 수 없습니다)")) {
        if(confirm("정말 확실합니까?")) {
            appData = [];
            localStorage.removeItem('laundryData');
            updateMonthFilters();
            renderTable();
            renderDashboard();
            alert("초기화 완료되었습니다.");
        }
    }
});

// === Initial Load ===
updateMonthFilters();
renderDashboard();
