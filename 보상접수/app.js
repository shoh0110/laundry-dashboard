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
    "원단 손상": ["원단 손상", "원단손상", "찢어짐", "구멍", "올나감", "스크래치", "