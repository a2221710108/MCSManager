<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { LineChartOutlined, ClockCircleOutlined } from "@ant-design/icons-vue";
import { ref, watch, nextTick } from "vue";
import { graphic, init, type ECharts } from "echarts";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const open = ref(false);
const isLoadingData = ref(false);

// 時間範圍選單配置 (單位：秒)
const TIME_OPTIONS = [
  { label: t("1小時"), value: 1 * 60 * 60 },
  { label: t("3小時"), value: 3 * 60 * 60 },
  { label: t("6小時"), value: 6 * 60 * 60 },
  { label: t("12小時"), value: 12 * 60 * 60 },
  { label: t("24小時"), value: 24 * 60 * 60 },
  { label: t("3天"), value: 3 * 24 * 60 * 60 },
  { label: t("5天"), value: 5 * 24 * 60 * 60 },
  { label: t("7天"), value: 7 * 24 * 60 * 60 }
];

// 預設選擇 24小時
const selectedRange = ref(24 * 60 * 60);

// 儲存原始數據，以便在 Tooltip 中映射玩家名稱
let globalMetricsData: any[] = [];

// 儲存 ECharts 實例
let cpuChartInstance: ECharts | undefined;
let ramChartInstance: ECharts | undefined;
let netChartInstance: ECharts | undefined;
let playersChartInstance: ECharts | undefined;

const BACKEND_API = "https://chart.lazycloud.one/api/stats";

// --- 動態獲取當前最新的主題顏色 ---
const getThemeColors = () => {
  // 實時檢測 html 或 body 上是否有 dark 類別
  const isDark = document.documentElement.className.includes("dark") || document.body.className.includes("dark");
  
  return {
    textColor: isDark ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)",
    lineColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)",
    tooltipBg: isDark ? "#1f1f1f" : "#ffffff",
    tooltipBorder: isDark ? "#303030" : "#f0f0f0"
  };
};

// --- 提取 MCSM 原生的基礎配置並修正主題色彩 ---
const getBaseLineOption = (title: string, config: { yMax?: any; showLegend?: boolean; isIntegerOnly?: boolean } = {}): any => {
  const theme = getThemeColors();

  return {
    grid: { top: config.showLegend ? 45 : 35, bottom: 25, left: 55, right: 15, show: false },
    tooltip: { 
      trigger: "axis",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.textColor }
    },
    legend: {
      show: config.showLegend ?? false,
      top: 5,
      textStyle: { color: theme.textColor }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLabel: { color: theme.textColor },
      axisLine: { lineStyle: { color: theme.lineColor } },
      data: [] as any[]
    },
    yAxis: {
      type: "value",
      min: 0,
      max: config.yMax,
      minInterval: config.isIntegerOnly ? 1 : undefined, // 強制最少間隔為 1，防止人數出現小數點
      splitLine: { lineStyle: { color: theme.lineColor } },
      axisLabel: { 
        color: theme.textColor,
        formatter: config.isIntegerOnly ? (val: number) => Math.floor(val).toString() : undefined // 強制鋸掉人數小數
      }
    },
    series: [] as any[]
  };
};

// 異步獲取 LazyCloud 後端數據
const loadChartData = async () => {
  // ==================== 偵錯階段：永遠固定一個實例 ID ====================
  const debugInstanceId = "你的固定實例UUID放這裡"; 
  // ====================================================================

  isLoadingData.value = true;
  const until = Math.floor(Date.now() / 1000);
  const since = until - selectedRange.value;

  try {
    const res = await fetch(`${BACKEND_API}?instance_id=${debugInstanceId}&since=${since}&until=${until}&limit=1000`);
    if (!res.ok) throw new Error("無法取得監控數據");
    const data = await res.json();

    if (!data || data.length === 0) {
      globalMetricsData = [];
      disposeCharts();
      return;
    }

    // 快取原始數據提供給 Tooltip 查詢使用
    globalMetricsData = data;

    // 格式化 X 軸時間。若時間範圍大於 24 小時則顯示日期，否則僅顯示時分。
    const useDateFormat = selectedRange.value > 24 * 60 * 60;
    const timestamps = data.map((d: any) => {
      const date = new Date(d.timestamp * 1000);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      if (useDateFormat) {
        return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`;
      }
      return `${hours}:${minutes}`;
    });

    const cpuData = data.map((d: any) => d.cpu_percent);
    const ramUsedData = data.map((d: any) => d.ram_used_mb);
    const ramTotalData = data.map((d: any) => d.ram_total_mb);
    const rxData = data.map((d: any) => (d.network_rx_bytes / 1024 / 1024).toFixed(2));
    const txData = data.map((d: any) => (d.network_tx_bytes / 1024 / 1024).toFixed(2));
    const playerCountData = data.map((d: any) => d.player_count);

    // 渲染 ECharts
    await nextTick();
    initECharts(timestamps, cpuData, ramUsedData, ramTotalData, rxData, txData, playerCountData);
  } catch (error: any) {
    reportErrorMsg(error.message || t("圖表數據加載失敗"));
  } finally {
    isLoadingData.value = false;
  }
};

// 初始化與填入 ECharts 數據
const initECharts = (time: string[], cpu: any[], ramUsed: any[], ramTotal: any[], rx: any[], tx: any[], players: any[]) => {
  disposeCharts();

  const colorGradientBlue = new graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: "rgba(67, 145, 250, 0.5)" },
    { offset: 1, color: "rgba(17, 95, 200, 0)" }
  ]);

  const colorGradientPurple = new graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: "rgba(155, 89, 182, 0.4)" },
    { offset: 1, color: "rgba(155, 89, 182, 0)" }
  ]);

  // 1. CPU 使用率
  const cpuDom = document.getElementById("mcsmCpuChart");
  if (cpuDom) {
    cpuChartInstance = init(cpuDom);
    const opt = getBaseLineOption(t("CPU 使用率 (%)"));
    opt.xAxis.data = time;
    opt.series = [{
      name: t("CPU 使用率 (%)"),
      type: "line",
      color: "rgb(67, 145, 250)",
      smooth: true,
      symbol: "none",
      lineStyle: { width: 1.5 },
      areaStyle: { color: colorGradientBlue },
      data: cpu
    }];
    cpuChartInstance.setOption(opt);
  }

  // 2. 記憶體 (RAM) 使用與最大上限雙線圖
  const ramDom = document.getElementById("mcsmRamChart");
  if (ramDom) {
    ramChartInstance = init(ramDom);
    const opt = getBaseLineOption(t("記憶體"), { showLegend: true });
    opt.xAxis.data = time;
    opt.series = [
      {
        name: t("已用記憶體 (MB)"),
        type: "line",
        color: "rgb(155, 89, 182)",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5 },
        areaStyle: { color: colorGradientPurple },
        data: ramUsed
      },
      {
        name: t("最大分配上限 (MB)"),
        type: "line",
        color: "rgba(231, 76, 60, 0.7)",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, type: "dashed" },
        data: ramTotal
      }
    ];
    ramChartInstance.setOption(opt);
  }

  // 3. 網絡流量 (RX 與 TX 雙線圖)
  const netDom = document.getElementById("mcsmNetChart");
  if (netDom) {
    netChartInstance = init(netDom);
    const opt = getBaseLineOption(t("網絡流量"), { showLegend: true });
    opt.xAxis.data = time;
    opt.series = [
      { name: "RX (接收 MB)", type: "line", smooth: true, symbol: "none", data: rx, color: "#2ecc71", lineStyle: { width: 1.5 } },
      { name: "TX (發送 MB)", type: "line", smooth: true, symbol: "none", data: tx, color: "#e74c3c", lineStyle: { width: 1.5 } }
    ];
    netChartInstance.setOption(opt);
  }

  // 4. 在線人數 (整合整數限制與 Tooltip 玩家清單)
  const playersDom = document.getElementById("mcsmPlayersChart");
  if (playersDom) {
    playersChartInstance = init(playersDom);
    // 傳入 isIntegerOnly: true，確保刻度不出現小數點
    const opt = getBaseLineOption(t("在線人數"), { isIntegerOnly: true });
    opt.xAxis.data = time;
    
    // 客製化玩家人數的 Tooltip 顯示資訊
    opt.tooltip.formatter = (params: any[]) => {
      const p = params[0];
      const dataIndex = p.dataIndex;
      const record = globalMetricsData[dataIndex];
      let namesStr = t("無在線玩家");
      
      if (record && record.player_names && record.player_names.length > 0) {
        namesStr = record.player_names.join(", ");
      }
      
      return `
        <div style="font-size:13px; line-height:1.8; color: inherit;">
          <b>${p.name}</b><br/>
          <span style="color:${p.color};">●</span> ${p.seriesName}: <b>${Math.floor(p.value)}</b> 人<br/>
          <span style="color:#1677ff;">●</span> ${t("玩家列表")}: <span style="word-break:break-all; white-space:normal; max-width:200px; display:inline-block; vertical-align:top;">${namesStr}</span>
        </div>
      `;
    };

    opt.series = [{
      name: t("在線人數"),
      type: "line",
      color: "rgb(241, 196, 15)",
      step: "end",
      symbol: "circle",
      symbolSize: 4,
      data: players
    }];
    playersChartInstance.setOption(opt);
  }
};

const disposeCharts = () => {
  cpuChartInstance?.dispose();
  ramChartInstance?.dispose();
  netChartInstance?.dispose();
  playersChartInstance?.dispose();
  cpuChartInstance = undefined;
  ramChartInstance = undefined;
  netChartInstance = undefined;
  playersChartInstance = undefined;
};

// 監聽時間範圍按鈕切換
watch(selectedRange, () => {
  if (open.value) loadChartData();
});

const openDialog = () => {
  open.value = true;
  loadChartData();
};

// 監聽彈窗關閉
watch(open, (val) => {
  if (!val) disposeCharts();
});

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :title="t('實例歷史效能監控')"
    :footer="null"
    :width="1000"
    class="history-monitor-modal"
  >
    <div class="monitor-wrapper">
      <div class="range-selector-bar">
        <span class="bar-title">
          <clock-circle-outlined /> {{ t("動態時間範圍") }}：
        </span>
        <a-radio-group v-model:value="selectedRange" button-style="solid" size="small">
          <a-radio-button 
            v-for="opt in TIME_OPTIONS" 
            :key="opt.value" 
            :value="opt.value"
          >
            {{ opt.label }}
          </a-radio-button>
        </a-radio-group>
      </div>

      <a-spin :spinning="isLoadingData">
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("CPU 使用率") }}</div>
            <div id="mcsmCpuChart" class="echarts-dom"></div>
          </div>
          
          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("記憶體使用 (RAM)") }}</div>
            <div id="mcsmRamChart" class="echarts-dom"></div>
          </div>

          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("網路流量 (MB)") }}</div>
            <div id="mcsmNetChart" class="echarts-dom"></div>
          </div>

          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("歷史在線人數與名單") }}</div>
            <div id="mcsmPlayersChart" class="echarts-dom"></div>
          </div>
        </div>
      </a-spin>
    </div>
  </a-modal>
</template>

<style scoped>
.monitor-wrapper {
  padding: 4px;
  color: inherit !important;
}

/* --- 時間選擇工具列 --- */
.range-selector-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  padding: 8px 12px;
  background: rgba(140, 140, 140, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(140, 140, 140, 0.1);
}

.bar-title {
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  opacity: 0.85;
}

/* --- 圖表網格佈局 --- */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}

.chart-card {
  background: rgba(140, 140, 140, 0.02);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(140, 140, 140, 0.15);
  color: inherit;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  opacity: 0.9;
}

/* --- ECharts 畫布規格 --- */
.echarts-dom {
  width: 100%;
  height: 250px;
}

@media (max-width: 768px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
