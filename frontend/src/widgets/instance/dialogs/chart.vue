<script setup lang="ts">
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { LineChartOutlined, TeamOutlined } from "@ant-design/icons-vue";
import { ref, watch, nextTick } from "vue";
import { graphic, init, type ECharts } from "echarts";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const open = ref(false);
const isLoadingData = ref(false);
const playerNames = ref<string[]>([]);

// 儲存 4 個圖表的 ECharts 實例
let cpuChartInstance: ECharts | undefined;
let ramChartInstance: ECharts | undefined;
let netChartInstance: ECharts | undefined;
let playersChartInstance: ECharts | undefined;

const BACKEND_API = "https://chart.lazycloud.one/api/stats";

// --- 提取 MCSM 原生的漸層色與基礎配置 ---
const getBaseLineOption = (title: string, yMax?: number): any => {
  const isDarkMode = document.documentElement.className.includes("dark");
  const textColor = isDarkMode ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)";
  const lineColor = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";

  const colorGradient = new graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: "rgba(67, 145, 250, 0.6)" },
    { offset: 1, color: "rgba(17, 95, 200, 0)" }
  ]);

  return {
    grid: { top: 35, bottom: 25, left: 50, right: 15, show: false },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: lineColor } },
      data: [] as any[]
    },
    yAxis: {
      type: "value",
      min: 0,
      max: yMax,
      splitLine: { lineStyle: { color: lineColor } },
      axisLabel: { color: textColor }
    },
    series: [
      {
        name: title,
        type: "line",
        color: "rgb(67, 145, 250)",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "rgba(67, 145, 250, 0.9)", width: 1.5 },
        areaStyle: { color: colorGradient },
        data: [] as any[],
        step: undefined as string | undefined
      }
    ]
  };
};

// 異步獲取 LazyCloud 後端數據
const loadChartData = async () => {
  // ==================== 偵錯階段：永遠固定一個實例 ID ====================
  // 請在這裡填入你用來測試的真實實例 UUID
  const debugInstanceId = "09d3e8a93640468daa974a67bb1d04fc"; 
  // ====================================================================

  isLoadingData.value = true;
  const until = Math.floor(Date.now() / 1000);
  const since = until - 24 * 60 * 60; // 24小時

  try {
    // 這裡直接帶入固定的 debugInstanceId
    const res = await fetch(`${BACKEND_API}?instance_id=${debugInstanceId}&since=${since}&until=${until}&limit=500`);
    if (!res.ok) throw new Error("無法取得監控數據");
    const data = await res.json();

    if (!data || data.length === 0) {
      playerNames.value = [];
      return;
    }

    // 格式化 X 軸時間 (HH:mm)
    const timestamps = data.map((d: any) => {
      const date = new Date(d.timestamp * 1000);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    });

    const cpuData = data.map((d: any) => d.cpu_percent);
    const ramUsedData = data.map((d: any) => d.ram_used_mb);
    const rxData = data.map((d: any) => (d.network_rx_bytes / 1024 / 1024).toFixed(2));
    const txData = data.map((d: any) => (d.network_tx_bytes / 1024 / 1024).toFixed(2));
    const playerCountData = data.map((d: any) => d.player_count);

    // 在線玩家名單
    playerNames.value = data[data.length - 1]?.player_names || [];

    // 渲染 ECharts
    await nextTick();
    initECharts(timestamps, cpuData, ramUsedData, rxData, txData, playerCountData);
  } catch (error: any) {
    reportErrorMsg(error.message || t("圖表數據加載失敗"));
  } finally {
    isLoadingData.value = false;
  }
};

// 初始化與填入 ECharts 數據
const initECharts = (time: string[], cpu: any[], ram: any[], rx: any[], tx: any[], players: any[]) => {
  // 清理舊實例
  disposeCharts();

  // 1. CPU (限定 Max 100)
  const cpuDom = document.getElementById("mcsmCpuChart");
  if (cpuDom) {
    cpuChartInstance = init(cpuDom);
    const opt = getBaseLineOption(t("CPU 使用率 (%)"), 100);
    opt.xAxis.data = time;
    opt.series[0].data = cpu;
    cpuChartInstance.setOption(opt);
  }

  // 2. RAM
  const ramDom = document.getElementById("mcsmRamChart");
  if (ramDom) {
    ramChartInstance = init(ramDom);
    const opt = getBaseLineOption(t("已用記憶體 (MB)"));
    opt.xAxis.data = time;
    opt.series[0].data = ram;
    opt.series[0].color = "rgb(155, 89, 182)";
    ramChartInstance.setOption(opt);
  }

  // 3. 網絡流量 (雙線圖：RX 與 TX)
  const netDom = document.getElementById("mcsmNetChart");
  if (netDom) {
    netChartInstance = init(netDom);
    const opt = getBaseLineOption(t("網絡流量 (MB)"));
    opt.xAxis.data = time;
    opt.series = [
      { name: "RX (接收)", type: "line", smooth: true, symbol: "none", data: rx, color: "#2ecc71" },
      { name: "TX (發送)", type: "line", smooth: true, symbol: "none", data: tx, color: "#e74c3c" }
    ];
    netChartInstance.setOption(opt);
  }

  // 4. 在線人數 (階梯圖更準確)
  const playersDom = document.getElementById("mcsmPlayersChart");
  if (playersDom) {
    playersChartInstance = init(playersDom);
    const opt = getBaseLineOption(t("在線人數"));
    opt.xAxis.data = time;
    opt.series[0].data = players;
    opt.series[0].step = "end";
    opt.series[0].color = "rgb(241, 196, 15)";
    playersChartInstance.setOption(opt);
  }
};

const disposeCharts = () => {
  cpuChartInstance?.dispose();
  ramChartInstance?.dispose();
  netChartInstance?.dispose();
  playersChartInstance?.dispose();
};

const openDialog = () => {
  open.value = true;
  loadChartData();
};

// 監聽彈窗關閉時銷毀 ECharts 避免內存洩漏
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
  >
    <a-spin :spinning="isLoadingData">
      <div class="monitor-container">
        
        <div v-if="playerNames.length > 0" class="player-panel">
          <div class="panel-title">
            <team-outlined />
            <span>{{ t("當前在線玩家") }}（{{ playerNames.length }}）</span>
          </div>
          <div class="player-tags-list">
            <span v-for="name in playerNames" :key="name" class="player-tag">
              {{ name }}
            </span>
          </div>
        </div>

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
            <div class="chart-title"><line-chart-outlined /> {{ t("歷史在線人數") }}</div>
            <div id="mcsmPlayersChart" class="echarts-dom"></div>
          </div>
        </div>

      </div>
    </a-spin>
  </a-modal>
</template>

<style scoped>
.monitor-container {
  padding: 12px 4px;
}

/* --- 在線玩家面板 --- */
.player-panel {
  background: rgba(22, 119, 255, 0.06); 
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  border: 1px solid rgba(22, 119, 255, 0.15);
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1677ff;
}
.player-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.player-tag {
  background: rgba(140, 140, 140, 0.12);
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  border: 1px solid rgba(140, 140, 140, 0.15);
}

/* --- 圖表網格佈局 --- */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}
.chart-card {
  background: rgba(140, 140, 140, 0.03);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(140, 140, 140, 0.15);
}
.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.85;
}

/* --- ECharts 容器基礎尺寸 --- */
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
