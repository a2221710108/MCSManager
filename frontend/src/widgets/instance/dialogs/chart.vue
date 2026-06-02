<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { LineChartOutlined, ClockCircleOutlined, InfoCircleOutlined } from "@ant-design/icons-vue";
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

// 定義響應式變數來儲存計算後的統計值
const stats = ref({
  cpu: { max: "0.0", avg: "0.0", min: "0.0" },
  ram: { max: "0", avg: "0", min: "0" },
  netRx: { max: "0.00", avg: "0.00", min: "0.00" },
  netTx: { max: "0.00", avg: "0.00", min: "0.00" },
  players: { max: 0, avg: 0, min: 0 }
});

// 儲存 ECharts 實例
let cpuChartInstance: ECharts | undefined;
let ramChartInstance: ECharts | undefined;
let netChartInstance: ECharts | undefined;
let playersChartInstance: ECharts | undefined;

const BACKEND_API = "https://chart.lazycloud.one/api/stats";

// --- 動態獲取當前最新的主題顏色 ---
const getThemeColors = () => {
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
      minInterval: config.isIntegerOnly ? 1 : undefined,
      splitLine: { lineStyle: { color: theme.lineColor } },
      axisLabel: { 
        color: theme.textColor,
        formatter: config.isIntegerOnly ? (val: number) => Math.floor(val).toString() : undefined
      }
    },
    series: [] as any[]
  };
};

// --- 輔助函式：計算統計值 ---
const calculateStats = (arr: number[], type: "float" | "int" | "net" = "float") => {
  if (!arr || arr.length === 0) return { max: "0", avg: "0", min: "0" };
  
  const numericArr = arr.map(v => Number(v) || 0);
  const max = Math.max(...numericArr);
  const min = Math.min(...numericArr);
  const sum = numericArr.reduce((a, b) => a + b, 0);
  const avg = sum / numericArr.length;

  if (type === "int") {
    return {
      max: Math.floor(max).toString(),
      avg: Math.round(avg).toString(),
      min: Math.floor(min).toString()
    };
  } else if (type === "net") {
    return {
      max: max.toFixed(2),
      avg: avg.toFixed(2),
      min: min.toFixed(2)
    };
  }
  return {
    max: max.toFixed(1),
    avg: avg.toFixed(1),
    min: min.toFixed(1)
  };
};

// 異步獲取 LazyCloud 後端數據
const loadChartData = async () => {
  // 正式環境：嚴格讀取 MCSManager 控制界面傳入的實例 ID
  if (!props.instanceId) return;
  
  isLoadingData.value = true;
  const until = Math.floor(Date.now() / 1000);
  const since = until - selectedRange.value;

  try {
    const res = await fetch(`${BACKEND_API}?instance_id=${props.instanceId}&since=${since}&until=${until}&limit=1000`);
    if (!res.ok) throw new Error("無法取得監控數據");
    const data = await res.json();

    if (!data || data.length === 0) {
      globalMetricsData = [];
      disposeCharts();
      return;
    }

    globalMetricsData = data;

    // 格式化 X 軸時間
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
    const rxData = data.map((d: any) => (d.network_rx_bytes / 1024 / 1024));
    const txData = data.map((d: any) => (d.network_tx_bytes / 1024 / 1024));
    const playerCountData = data.map((d: any) => d.player_count);

    // 計算當前範圍內的 最大 / 平均 / 最小 統計值
    stats.value.cpu = calculateStats(cpuData, "float");
    stats.value.ram = calculateStats(ramUsedData, "int");
    stats.value.netRx = calculateStats(rxData, "net");
    stats.value.netTx = calculateStats(txData, "net");
    stats.value.players = calculateStats(playerCountData, "int") as any;

    // 渲染 ECharts
    await nextTick();
    initECharts(
      timestamps, 
      cpuData, 
      ramUsedData, 
      ramTotalData, 
      rxData.map((v: number) => v.toFixed(2)), 
      txData.map((v: number) => v.toFixed(2)), 
      playerCountData
    );
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

  // 2. 記憶體 (RAM)
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

  // 3. 網絡流量
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

  // 4. 在線人數
  const playersDom = document.getElementById("mcsmPlayersChart");
  if (playersDom) {
    playersChartInstance = init(playersDom);
    const opt = getBaseLineOption(t("在線人數"), { isIntegerOnly: true });
    opt.xAxis.data = time;
    
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
            <div class="chart-stats-panel">
              <div class="stat-item"><span class="stat-lbl">{{ t("最大") }}</span><span class="stat-val">{{ stats.cpu.max }}%</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("平均") }}</span><span class="stat-val">{{ stats.cpu.avg }}%</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("最小") }}</span><span class="stat-val">{{ stats.cpu.min }}%</span></div>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("記憶體使用 (RAM)") }}</div>
            <div id="mcsmRamChart" class="echarts-dom"></div>
            <div class="chart-stats-panel">
              <div class="stat-item"><span class="stat-lbl">{{ t("最大") }}</span><span class="stat-val">{{ stats.ram.max }} MB</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("平均") }}</span><span class="stat-val">{{ stats.ram.avg }} MB</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("最小") }}</span><span class="stat-val">{{ stats.ram.min }} MB</span></div>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("網路流量 (MB)") }}</div>
            <div id="mcsmNetChart" class="echarts-dom"></div>
            <div class="chart-stats-panel net-stats-panel">
              <div class="stat-group">
                <span class="group-tag rx-tag">RX</span>
                <div class="stat-item"><span class="stat-val">{{ stats.netRx.max }}</span></div>
                <div class="stat-item"><span class="stat-val">{{ stats.netRx.avg }}</span></div>
                <div class="stat-item"><span class="stat-val">{{ stats.netRx.min }}</span></div>
              </div>
              <div class="stat-group">
                <span class="group-tag tx-tag">TX</span>
                <div class="stat-item"><span class="stat-val" title="Max">{{ stats.netTx.max }}</span></div>
                <div class="stat-item"><span class="stat-val" title="Avg">{{ stats.netTx.avg }}</span></div>
                <div class="stat-item"><span class="stat-val" title="Min">{{ stats.netTx.min }}</span></div>
              </div>
              <div class="net-info-tip">
                <info-circle-outlined /> {{ t("欄位順序：最大 / 平均 / 最小") }}
              </div>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-title"><line-chart-outlined /> {{ t("歷史在線人數與名單") }}</div>
            <div id="mcsmPlayersChart" class="echarts-dom"></div>
            <div class="chart-stats-panel">
              <div class="stat-item"><span class="stat-lbl">{{ t("最大") }}</span><span class="stat-val">{{ stats.players.max }} 人</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("平均") }}</span><span class="stat-val">{{ stats.players.avg }} 人</span></div>
              <div class="stat-item"><span class="stat-lbl">{{ t("最小") }}</span><span class="stat-val">{{ stats.players.min }} 人</span></div>
            </div>
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
  display: flex;
  flex-direction: column;
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
  height: 230px;
}

/* --- 底部最大/平均/最小數據面版樣式 --- */
.chart-stats-panel {
  display: flex;
  justify-content: space-around;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(140, 140, 140, 0.15);
  background: rgba(140, 140, 140, 0.02);
  border-radius: 6px;
  padding: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-lbl {
  font-size: 11px;
  opacity: 0.5;
}

.stat-val {
  font-size: 13px;
  font-weight: 600;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

/* 網路流量多組數據客製化排版 */
.net-stats-panel {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.stat-group {
  display: flex;
  justify-content: space-around;
  align-items: center;
  width: 100%;
  position: relative;
}
.group-tag {
  position: absolute;
  left: 6px;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 4px;
}
.rx-tag {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}
.tx-tag {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}
.net-info-tip {
  font-size: 10px;
  opacity: 0.4;
  text-align: center;
  margin-top: 2px;
}

@media (max-width: 768px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
